/**
 * Lunaby SDK - Official SDK for Lunaby AI API
 * 
 * @packageDocumentation
 * @module lunaby-sdk
 * 
 * @example
 * ```typescript
 * import Lunaby from 'lunaby-sdk';
 * 
 * const client = new Lunaby({
 *   apiKey: process.env.LUNABY_API_KEY,
 * });
 * 
 * // Chat completion
 * const response = await client.chat.create([
 *   { role: 'user', content: 'Hello!' }
 * ]);
 * 
 * // Streaming
 * for await (const chunk of client.chat.stream([
 *   { role: 'user', content: 'Tell me a story' }
 * ])) {
 *   process.stdout.write(chunk.choices[0].delta.content || '');
 * }
 * 
 * // Image generation
 * const image = await client.images.generateBuffer('A beautiful sunset');
 * ```
 */

// Main client
export { LunabyClient, LunabyClient as default } from './client.js';

// Resources
export { ChatCompletions, type CreateChatCompletionOptions } from './resources/chat.js';
export { Images, type GenerateImageOptions } from './resources/images.js';

// Streaming utilities
export { ChatStream, ChatResponse, parseSSEStream } from './streaming.js';

// Errors
export {
  LunabyError,
  APIError,
  AuthenticationError,
  RateLimitError,
  TimeoutError,
  ConnectionError,
  ContentFilterError,
  StreamError,
  AbortError,
  ValidationError,
} from './errors.js';

// Types
export type {
  // Core types
  Model,
  MessageRole,
  AspectRatio,
  OutputFormat,
  
  // Chat types
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChoice,
  ChatCompletionChunk,
  ChatCompletionStreamChoice,
  TokenUsage,
  
  // Image types
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageData,
  
  // Client types
  LunabyClientOptions,
  RequestOptions,
  FetchFunction,
  
  // Error types
  LunabyErrorDetails,
  APIErrorResponse,
  
  // Stream types
  StreamEvent,
  StreamOptions,
} from './types.js';
