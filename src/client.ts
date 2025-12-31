import type {
  LunabyClientOptions,
  Model,
  RequestOptions,
  FetchFunction,
} from './types.js';
import { ChatCompletions } from './resources/chat.js';
import { Images } from './resources/images.js';
import { ChatResponse } from './streaming.js';
import {
  APIError,
  AuthenticationError,
  RateLimitError,
  TimeoutError,
  ConnectionError,
  AbortError,
} from './errors.js';

const DEFAULT_BASE_URL = 'https://api.lunie.dev/v1';
const DEFAULT_TIMEOUT = 120000; // 2 minutes
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MODEL: Model = 'lunaby-pro';

// Retry configuration
const INITIAL_RETRY_DELAY = 500;
const MAX_RETRY_DELAY = 8000;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

interface InternalRequestConfig extends RequestOptions {
  method?: string;
  body?: string;
}

interface RequestContext {
  url: string;
  config: InternalRequestConfig;
  headers: Record<string, string>;
  signal: AbortSignal;
  abortController?: AbortController;
  timeoutId?: ReturnType<typeof setTimeout>;
}

export class Lunaby {
  readonly apiKey: string;
  readonly baseURL: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly defaultModel: Model;
  readonly defaultHeaders: Record<string, string>;

  private readonly _fetch: FetchFunction;

  readonly chat: ChatCompletions;
  readonly images: Images;

  constructor(options: LunabyClientOptions = {}) {
    this.apiKey = options.apiKey || process.env.LUNABY_API_KEY || '';
    this.baseURL = (options.baseURL || process.env.LUNABY_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.defaultModel = options.defaultModel || DEFAULT_MODEL;
    this.defaultHeaders = options.defaultHeaders || {};
    this._fetch = options.fetch || globalThis.fetch;

    // Initialize resources
    this.chat = new ChatCompletions(this);
    this.images = new Images(this);
  }

  /**
   * Prepare common request context (headers, timeout, signal)
   */
  private _prepareRequest(path: string, config: InternalRequestConfig): RequestContext {
    const url = `${this.baseURL}${path}`;
    const { signal, timeout, headers: customHeaders } = config;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      ...this.defaultHeaders,
      ...customHeaders,
    };

    let abortController: AbortController | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (!signal) {
      abortController = new AbortController();
      timeoutId = setTimeout(() => {
        abortController?.abort();
      }, timeout || this.timeout);
    }

    return {
      url,
      config,
      headers,
      signal: signal || abortController!.signal,
      abortController,
      timeoutId,
    };
  }

  /**
   * Execute fetch with retry logic
   */
  private async _executeWithRetry(
    ctx: RequestContext,
    isStream: boolean = false
  ): Promise<Response> {
    const { url, config, headers, signal, timeoutId } = ctx;
    const { method = 'GET', body } = config;

    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        const response = await this._fetch(url, {
          method,
          headers,
          body,
          signal,
        });

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        // Don't retry on success or non-retryable errors
        if (response.ok || !this._isRetryableStatus(response.status)) {
          if (!response.ok) {
            await this._handleErrorResponse(response);
          }
          return response;
        }

        // Retryable error
        lastError = await this._createErrorFromResponse(response);

        if (attempt < this.maxRetries) {
          const delay = this._calculateRetryDelay(attempt, response);
          await this._sleep(delay);
        }
      } catch (error) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        // Handle abort/timeout
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            if (!config.signal) {
              throw new TimeoutError(`Request timed out after ${config.timeout || this.timeout}ms`);
            }
            throw new AbortError('Request was aborted');
          }

          // Network errors are retryable
          if (this._isNetworkError(error) && attempt < this.maxRetries && !isStream) {
            lastError = error;
            const delay = this._calculateRetryDelay(attempt);
            await this._sleep(delay);
            attempt++;
            continue;
          }

          if (error.message.includes('fetch')) {
            throw new ConnectionError('Failed to connect to the API server');
          }
        }

        throw error;
      }

      attempt++;
    }

    // Exhausted retries
    throw lastError || new ConnectionError('Request failed after retries');
  }

  /**
   * Make a JSON request with automatic parsing
   */
  async request<T>(
    path: string,
    config: InternalRequestConfig = {}
  ): Promise<ChatResponse<T>> {
    const ctx = this._prepareRequest(path, config);

    try {
      const response = await this._executeWithRetry(ctx);
      const data = await response.json() as T;
      return new ChatResponse(data, response.headers, response.status);
    } catch (error) {
      if (ctx.timeoutId) {
        clearTimeout(ctx.timeoutId);
      }
      throw error;
    }
  }

  /**
   * Make a streaming request
   */
  async requestStream(
    path: string,
    config: InternalRequestConfig = {}
  ): Promise<{ stream: ReadableStream<Uint8Array>; abortController?: AbortController }> {
    const ctx = this._prepareRequest(path, config);

    try {
      const response = await this._executeWithRetry(ctx, true);

      if (!response.body) {
        throw new Error('Response body is null');
      }

      return { stream: response.body, abortController: ctx.abortController };
    } catch (error) {
      if (ctx.timeoutId) {
        clearTimeout(ctx.timeoutId);
      }
      throw error;
    }
  }

  /**
   * Check if status code is retryable
   */
  private _isRetryableStatus(status: number): boolean {
    return RETRYABLE_STATUS_CODES.has(status);
  }

  /**
   * Check if error is a network error (retryable)
   */
  private _isNetworkError(error: Error): boolean {
    return (
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('ECONNRESET') ||
      error.message.includes('ECONNREFUSED')
    );
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private _calculateRetryDelay(attempt: number, response?: Response): number {
    // Respect Retry-After header if present
    if (response) {
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) {
          return Math.min(seconds * 1000, MAX_RETRY_DELAY);
        }
      }
    }

    // Exponential backoff with jitter
    const baseDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * baseDelay;
    return Math.min(baseDelay + jitter, MAX_RETRY_DELAY);
  }

  /**
   * Sleep for specified milliseconds
   */
  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create error from response without throwing
   */
  private async _createErrorFromResponse(response: Response): Promise<Error> {
    let body: unknown;

    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => null);
    }

    const errorBody = body as { error?: string; message?: string } | null;

    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      return new RateLimitError(
        errorBody?.message || errorBody?.error || 'Rate limit exceeded',
        retryAfter ? parseInt(retryAfter, 10) : undefined
      );
    }

    return APIError.fromResponse(
      response.status,
      response.statusText,
      errorBody ? { error: errorBody.error || '', message: errorBody.message } : undefined
    );
  }

  /**
   * Handle error response and throw appropriate error
   */
  private async _handleErrorResponse(response: Response): Promise<never> {
    let body: unknown;

    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => null);
    }

    const errorBody = body as { error?: string; message?: string; details?: { categories?: Record<string, boolean> } } | null;

    if (response.status === 401) {
      throw new AuthenticationError(errorBody?.message || errorBody?.error);
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      throw new RateLimitError(
        errorBody?.message || errorBody?.error || 'Rate limit exceeded',
        retryAfter ? parseInt(retryAfter, 10) : undefined
      );
    }

    throw APIError.fromResponse(
      response.status,
      response.statusText,
      errorBody ? { error: errorBody.error || '', message: errorBody.message, details: errorBody.details } : undefined
    );
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

export default Lunaby;
