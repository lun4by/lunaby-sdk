/**
 * Lunaby SDK - Streaming Utilities
 */

import type { ChatCompletionChunk, StreamEvent } from './types.js';
import { StreamError } from './errors.js';

/**
 * Parse Server-Sent Events (SSE) from a stream
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<StreamEvent, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Process any remaining buffer
        if (buffer.trim()) {
          const lines = buffer.split('\n');
          for (const line of lines) {
            const event = parseLine(line);
            if (event) yield event;
          }
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // Keep the last incomplete line in buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const event = parseLine(line);
        if (event) yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a single SSE line
 */
function parseLine(line: string): StreamEvent | null {
  const trimmed = line.trim();
  
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('event:')) {
    return { event: trimmed.slice(6).trim(), data: '' };
  }

  if (trimmed.startsWith('data:')) {
    return { data: trimmed.slice(5).trim() };
  }

  return null;
}

/**
 * Stream wrapper that provides async iteration over chat completion chunks
 */
export class ChatStream implements AsyncIterable<ChatCompletionChunk> {
  private _stream: ReadableStream<Uint8Array>;
  private _abortController?: AbortController;
  private _fullContent: string = '';
  private _usage?: ChatCompletionChunk['usage'];

  constructor(stream: ReadableStream<Uint8Array>, abortController?: AbortController) {
    this._stream = stream;
    this._abortController = abortController;
  }

  /**
   * Abort the stream
   */
  abort(): void {
    this._abortController?.abort();
  }

  /**
   * Get the full content accumulated from the stream
   */
  get fullContent(): string {
    return this._fullContent;
  }

  /**
   * Get token usage (if available at end of stream)
   */
  get usage(): ChatCompletionChunk['usage'] | undefined {
    return this._usage;
  }

  /**
   * Async iterator implementation
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    try {
      for await (const event of parseSSEStream(this._stream)) {
        if (event.data === '[DONE]') {
          return;
        }

        if (!event.data) {
          continue;
        }

        try {
          const chunk: ChatCompletionChunk = JSON.parse(event.data);
          
          // Accumulate content
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            this._fullContent += content;
          }

          // Store usage if present
          if (chunk.usage) {
            this._usage = chunk.usage;
          }

          yield chunk;
        } catch (parseError) {
          // Ignore parse errors for incomplete JSON
          continue;
        }
      }
    } catch (error) {
      throw new StreamError('Error reading stream', error as Error);
    }
  }

  /**
   * Collect all chunks and return the final content
   */
  async toContent(): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of this) {
      // Iterate through all chunks to accumulate content
    }
    return this._fullContent;
  }

  /**
   * Collect all chunks into an array
   */
  async toArray(): Promise<ChatCompletionChunk[]> {
    const chunks: ChatCompletionChunk[] = [];
    for await (const chunk of this) {
      chunks.push(chunk);
    }
    return chunks;
  }

  /**
   * Process stream with callbacks
   */
  async process(callbacks: {
    onChunk?: (chunk: ChatCompletionChunk) => void;
    onContent?: (content: string, accumulated: string) => void;
    onDone?: (fullContent: string, usage?: ChatCompletionChunk['usage']) => void;
    onError?: (error: Error) => void;
  }): Promise<string> {
    try {
      for await (const chunk of this) {
        callbacks.onChunk?.(chunk);

        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          callbacks.onContent?.(content, this._fullContent);
        }
      }

      callbacks.onDone?.(this._fullContent, this._usage);
      return this._fullContent;
    } catch (error) {
      callbacks.onError?.(error as Error);
      throw error;
    }
  }
}

/**
 * Response wrapper for non-streaming responses
 */
export class ChatResponse<T> {
  constructor(
    public readonly data: T,
    public readonly headers: Headers,
    public readonly status: number
  ) {}

  /**
   * Get a header value
   */
  getHeader(name: string): string | null {
    return this.headers.get(name);
  }

  /**
   * Get rate limit information from headers
   */
  getRateLimitInfo(): {
    limit?: number;
    remaining?: number;
    reset?: Date;
  } {
    const limit = this.headers.get('x-ratelimit-limit');
    const remaining = this.headers.get('x-ratelimit-remaining');
    const reset = this.headers.get('x-ratelimit-reset');

    return {
      limit: limit ? parseInt(limit, 10) : undefined,
      remaining: remaining ? parseInt(remaining, 10) : undefined,
      reset: reset ? new Date(parseInt(reset, 10) * 1000) : undefined,
    };
  }
}
