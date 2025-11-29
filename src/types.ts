/// <reference lib="dom" />

export type Model = 
  | 'lunaby-pro' 
  | 'lunaby-reasoning' 
  | 'lunaby-vision'
  | (string & {});

export type MessageRole = 'system' | 'user' | 'assistant';

export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9';

export type OutputFormat = 'png' | 'jpeg' | 'webp';

export interface ChatMessage {
  role: MessageRole;
  content: string;
  name?: string;
}

export interface ChatCompletionRequest {
  model: Model;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  user?: string;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: 'stop' | 'length' | 'content_filter' | null;
}

export interface ChatCompletionStreamChoice {
  index: number;
  delta: Partial<ChatMessage>;
  finish_reason: 'stop' | 'length' | 'content_filter' | null;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: TokenUsage;
}

export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: ChatCompletionStreamChoice[];
  usage?: TokenUsage;
}

export interface ImageGenerationRequest {
  model?: Model;
  prompt: string;
  n?: number;
  size?: string;
  aspect_ratio?: AspectRatio;
  output_format?: OutputFormat;
  response_format?: 'url' | 'b64_json';
  user?: string;
}

export interface ImageData {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

export interface ImageGenerationResponse {
  created: number;
  data: ImageData[];
  usage?: TokenUsage;
}

export type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface LunabyClientOptions {
  apiKey?: string;
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
  defaultModel?: Model;
  defaultHeaders?: Record<string, string>;
  fetch?: FetchFunction;
}

export interface RequestOptions {
  signal?: AbortSignal | null;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface LunabyErrorDetails {
  status?: number;
  statusText?: string;
  code?: string;
  type?: string;
  message: string;
  details?: unknown;
}

export interface APIErrorResponse {
  error: string;
  message?: string;
  details?: {
    categories?: Record<string, boolean>;
    [key: string]: unknown;
  };
}

export interface StreamEvent {
  event?: string;
  data: string;
}

export interface StreamOptions extends RequestOptions {
  onChunk?: (chunk: ChatCompletionChunk) => void;
  onContent?: (content: string) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
}

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequiredBy<T, K extends keyof T> = T & Required<Pick<T, K>>;

export interface PaginatedResponse<T> {
  data: T[];
  has_more: boolean;
  first_id?: string;
  last_id?: string;
}
