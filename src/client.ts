/**
 * Lunaby SDK - Main Client
 */

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

/**
 * Request configuration for internal use
 */
interface InternalRequestConfig extends RequestOptions {
  method?: string;
  body?: string;
}

/**
 * Lunaby API Client
 * 
 * @example
 * ```typescript
 * import Lunaby from 'lunaby-sdk';
 * 
 * const lunaby = new Lunaby({
 *   apiKey: process.env.LUNABY_API_KEY,
 * });
 * 
 * // Non-streaming
 * const response = await lunaby.chat.create([
 *   { role: 'user', content: 'Hello!' }
 * ]);
 * console.log(response.data.choices[0].message.content);
 * 
 * // Streaming
 * const stream = await lunaby.chat.createStream([
 *   { role: 'user', content: 'Tell me a story' }
 * ]);
 * 
 * for await (const chunk of stream) {
 *   process.stdout.write(chunk.choices[0].delta.content || '');
 * }
 * ```
 */
export class LunabyClient {
  readonly apiKey: string;
  readonly baseURL: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly defaultModel: Model;
  readonly defaultHeaders: Record<string, string>;

  private readonly _fetch: FetchFunction;

  /**
   * Chat Completions API
   */
  readonly chat: ChatCompletions;

  /**
   * Images API
   */
  readonly images: Images;

  constructor(options: LunabyClientOptions = {}) {
    this.apiKey = options.apiKey || process.env.LUNABY_API_KEY || '';
    this.baseURL = (options.baseURL || process.env.LUNABY_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.defaultModel = options.defaultModel || DEFAULT_MODEL;
    this.defaultHeaders = options.defaultHeaders || {};
    this._fetch = options.fetch || globalThis.fetch;

    if (!this.apiKey) {
      console.warn('[Lunaby SDK] Warning: No API key provided. Set LUNABY_API_KEY environment variable or pass apiKey option.');
    }

    // Initialize resources
    this.chat = new ChatCompletions(this);
    this.images = new Images(this);
  }

  /**
   * Make a request to the API
   */
  async request<T>(
    path: string,
    config: InternalRequestConfig = {}
  ): Promise<ChatResponse<T>> {
    const url = `${this.baseURL}${path}`;
    const { signal, timeout, headers: customHeaders, ...fetchConfig } = config;

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

    try {
      const response = await this._fetch(url, {
        ...fetchConfig,
        headers,
        signal: signal || abortController?.signal,
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = await response.json() as T;
      return new ChatResponse(data, response.headers, response.status);
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          if (!signal) {
            throw new TimeoutError(`Request timed out after ${timeout || this.timeout}ms`);
          }
          throw new AbortError('Request was aborted');
        }

        if (error.message.includes('fetch')) {
          throw new ConnectionError('Failed to connect to the API server');
        }
      }

      throw error;
    }
  }

  /**
   * Make a streaming request to the API
   */
  async requestStream(
    path: string,
    config: InternalRequestConfig = {}
  ): Promise<{ stream: ReadableStream<Uint8Array>; abortController?: AbortController }> {
    const url = `${this.baseURL}${path}`;
    const { signal, timeout, headers: customHeaders, ...fetchConfig } = config;

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

    try {
      const response = await this._fetch(url, {
        ...fetchConfig,
        headers,
        signal: signal || abortController?.signal,
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      return { stream: response.body, abortController };
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          if (!signal) {
            throw new TimeoutError(`Request timed out after ${timeout || this.timeout}ms`);
          }
          throw new AbortError('Request was aborted');
        }

        if (error.message.includes('fetch')) {
          throw new ConnectionError('Failed to connect to the API server');
        }
      }

      throw error;
    }
  }

  /**
   * Handle error responses from the API
   */
  private async handleErrorResponse(response: Response): Promise<never> {
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

  /**
   * Check if the client is properly configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

/**
 * Default export - create a new Lunaby client
 */
export default LunabyClient;
