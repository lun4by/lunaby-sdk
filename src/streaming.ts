import type { ChatCompletionChunk, StreamEvent } from './types.js';
import { StreamError } from './errors.js';

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

export class ChatStream implements AsyncIterable<ChatCompletionChunk> {
  private _stream: ReadableStream<Uint8Array>;
  private _abortController?: AbortController;
  private _fullContent: string = '';
  private _usage?: ChatCompletionChunk['usage'];

  constructor(stream: ReadableStream<Uint8Array>, abortController?: AbortController) {
    this._stream = stream;
    this._abortController = abortController;
  }

  abort(): void {
    this._abortController?.abort();
  }

  get fullContent(): string {
    return this._fullContent;
  }

  get usage(): ChatCompletionChunk['usage'] | undefined {
    return this._usage;
  }

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

  async toContent(): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of this) {
      // Iterate through all chunks to accumulate content
    }
    return this._fullContent;
  }

  async toArray(): Promise<ChatCompletionChunk[]> {
    const chunks: ChatCompletionChunk[] = [];
    for await (const chunk of this) {
      chunks.push(chunk);
    }
    return chunks;
  }

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

export class ChatResponse<T> {
  constructor(
    public readonly data: T,
    public readonly headers: Headers,
    public readonly status: number
  ) {}

  getHeader(name: string): string | null {
    return this.headers.get(name);
  }

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
