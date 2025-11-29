/**
 * Lunaby SDK - Chat Completions Resource
 */

import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatMessage,
  Model,
  RequestOptions,
} from '../types.js';
import { ChatStream, ChatResponse } from '../streaming.js';
import { ValidationError } from '../errors.js';
import type { LunabyClient } from '../client.js';

/**
 * Options for creating chat completions
 */
export interface CreateChatCompletionOptions extends RequestOptions {
  model?: Model;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  user?: string;
}

/**
 * Chat Completions API resource
 */
export class ChatCompletions {
  constructor(private readonly client: LunabyClient) {}

  /**
   * Create a chat completion (non-streaming)
   */
  async create(
    messages: ChatMessage[],
    options: CreateChatCompletionOptions = {}
  ): Promise<ChatResponse<ChatCompletionResponse>> {
    this.validateMessages(messages);

    const { signal, timeout, headers, ...params } = options;
    
    const body: ChatCompletionRequest = {
      model: params.model || this.client.defaultModel,
      messages,
      stream: false,
      ...params,
    };

    const response = await this.client.request<ChatCompletionResponse>(
      '/chat/completions',
      {
        method: 'POST',
        body: JSON.stringify(body),
        signal,
        timeout,
        headers,
      }
    );

    return response;
  }

  /**
   * Create a streaming chat completion
   */
  async createStream(
    messages: ChatMessage[],
    options: CreateChatCompletionOptions = {}
  ): Promise<ChatStream> {
    this.validateMessages(messages);

    const { signal, timeout, headers, ...params } = options;

    const body: ChatCompletionRequest = {
      model: params.model || this.client.defaultModel,
      messages,
      stream: true,
      ...params,
    };

    const { stream, abortController } = await this.client.requestStream(
      '/chat/completions',
      {
        method: 'POST',
        body: JSON.stringify(body),
        signal,
        timeout,
        headers,
      }
    );

    return new ChatStream(stream, abortController);
  }

  /**
   * Create a chat completion and iterate over chunks (convenience method)
   */
  async *stream(
    messages: ChatMessage[],
    options: CreateChatCompletionOptions = {}
  ): AsyncGenerator<ChatCompletionChunk, string, unknown> {
    const chatStream = await this.createStream(messages, options);
    
    for await (const chunk of chatStream) {
      yield chunk;
    }

    return chatStream.fullContent;
  }

  /**
   * Validate messages array
   */
  private validateMessages(messages: ChatMessage[]): void {
    if (!Array.isArray(messages)) {
      throw new ValidationError('messages must be an array', 'messages');
    }

    if (messages.length === 0) {
      throw new ValidationError('messages array cannot be empty', 'messages');
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      if (!msg || typeof msg !== 'object') {
        throw new ValidationError(`messages[${i}] must be an object`, 'messages');
      }

      if (!msg.role || !['system', 'user', 'assistant'].includes(msg.role)) {
        throw new ValidationError(
          `messages[${i}].role must be 'system', 'user', or 'assistant'`,
          'messages'
        );
      }

      if (typeof msg.content !== 'string') {
        throw new ValidationError(
          `messages[${i}].content must be a string`,
          'messages'
        );
      }
    }
  }
}
