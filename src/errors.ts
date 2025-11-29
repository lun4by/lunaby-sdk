/**
 * Lunaby SDK - Custom Error Classes
 */

import type { LunabyErrorDetails, APIErrorResponse } from './types.js';

/**
 * Base error class for Lunaby SDK
 */
export class LunabyError extends Error {
  readonly status?: number;
  readonly statusText?: string;
  readonly code?: string;
  readonly type?: string;
  readonly details?: unknown;
  readonly cause?: Error;

  constructor(message: string, details?: Partial<LunabyErrorDetails>, cause?: Error) {
    super(message);
    this.name = 'LunabyError';
    this.status = details?.status;
    this.statusText = details?.statusText;
    this.code = details?.code;
    this.type = details?.type;
    this.details = details?.details;
    this.cause = cause;

    // Maintains proper stack trace for where our error was thrown (V8 engines only)
    const captureStackTrace = (Error as unknown as { captureStackTrace?: (targetObject: object, constructorOpt?: Function) => void }).captureStackTrace;
    if (captureStackTrace) {
      captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when API returns an error response
 */
export class APIError extends LunabyError {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
    public readonly response?: APIErrorResponse
  ) {
    super(message, { status, statusText, details: response });
    this.name = 'APIError';
  }

  static fromResponse(status: number, statusText: string, body?: APIErrorResponse): APIError {
    let message = body?.message || body?.error || statusText;
    
    switch (status) {
      case 400:
        message = `Bad Request: ${message}`;
        break;
      case 401:
        message = `Authentication Error: ${message || 'Invalid or missing API key'}`;
        break;
      case 403:
        message = `Forbidden: ${message || 'You do not have access to this resource'}`;
        break;
      case 404:
        message = `Not Found: ${message || 'The requested resource was not found'}`;
        break;
      case 429:
        message = `Rate Limit Exceeded: ${message || 'Too many requests, please try again later'}`;
        break;
      case 500:
        message = `Internal Server Error: ${message || 'The server encountered an error'}`;
        break;
      case 502:
      case 503:
      case 504:
        message = `Service Unavailable: ${message || 'The service is temporarily unavailable'}`;
        break;
    }

    return new APIError(message, status, statusText, body);
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends LunabyError {
  constructor(message: string = 'Authentication failed. Please check your API key.') {
    super(message, { status: 401, type: 'authentication_error' });
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends LunabyError {
  readonly retryAfter?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super(message, { status: 429, type: 'rate_limit_error' });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Error thrown when request times out
 */
export class TimeoutError extends LunabyError {
  constructor(message: string = 'Request timed out') {
    super(message, { code: 'ETIMEDOUT', type: 'timeout_error' });
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when connection fails
 */
export class ConnectionError extends LunabyError {
  constructor(message: string = 'Failed to connect to the server', code?: string) {
    super(message, { code, type: 'connection_error' });
    this.name = 'ConnectionError';
  }
}

/**
 * Error thrown when content violates safety policies
 */
export class ContentFilterError extends LunabyError {
  readonly categories?: Record<string, boolean>;

  constructor(message: string = 'Content was filtered due to policy violation', categories?: Record<string, boolean>) {
    super(message, { type: 'content_filter_error', details: { categories } });
    this.name = 'ContentFilterError';
    this.categories = categories;
  }
}

/**
 * Error thrown during streaming
 */
export class StreamError extends LunabyError {
  constructor(message: string = 'Error occurred during streaming', cause?: Error) {
    super(message, { type: 'stream_error' }, cause);
    this.name = 'StreamError';
  }
}

/**
 * Error thrown when request is aborted
 */
export class AbortError extends LunabyError {
  constructor(message: string = 'Request was aborted') {
    super(message, { code: 'ABORT_ERR', type: 'abort_error' });
    this.name = 'AbortError';
  }
}

/**
 * Error thrown for invalid parameters
 */
export class ValidationError extends LunabyError {
  constructor(message: string, field?: string) {
    super(message, { type: 'validation_error', details: { field } });
    this.name = 'ValidationError';
  }
}
