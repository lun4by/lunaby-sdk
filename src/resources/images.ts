import { Buffer } from 'node:buffer';

import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  Model,
  RequestOptions,
  AspectRatio,
  OutputFormat,
} from '../types.js';
import { ChatResponse } from '../streaming.js';
import { ValidationError } from '../errors.js';
import type { Lunaby } from '../client.js';

export interface GenerateImageOptions extends RequestOptions {
  model?: Model;
  n?: number;
  size?: string;
  aspect_ratio?: AspectRatio;
  output_format?: OutputFormat;
  response_format?: 'url' | 'b64_json';
  seed?: number;
  negative_prompt?: string;
  user?: string;
}

export class Images {
  constructor(private readonly client: Lunaby) { }

  async generate(
    prompt: string,
    options: GenerateImageOptions = {}
  ): Promise<ChatResponse<ImageGenerationResponse>> {
    this.validatePrompt(prompt);

    const { signal, timeout, headers, ...params } = options;

    const body: ImageGenerationRequest = {
      model: params.model || 'lunaby-vision',
      prompt,
      response_format: params.response_format || 'b64_json',
      ...params,
    };

    const response = await this.client.request<ImageGenerationResponse>(
      '/images/generations',
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

  async generateBuffer(
    prompt: string,
    options: GenerateImageOptions = {}
  ): Promise<{ buffer: Buffer; revisedPrompt?: string; usage?: ImageGenerationResponse['usage'] }> {
    const response = await this.generate(prompt, {
      ...options,
      response_format: 'b64_json',
      n: 1,
    });

    const imageData = response.data.data[0];
    if (!imageData?.b64_json) {
      throw new Error('No image data received from API');
    }

    const buffer = Buffer.from(imageData.b64_json, 'base64');

    return {
      buffer,
      revisedPrompt: imageData.revised_prompt,
      usage: response.data.usage,
    };
  }

  private validatePrompt(prompt: string): void {
    if (!prompt || typeof prompt !== 'string') {
      throw new ValidationError('prompt must be a non-empty string', 'prompt');
    }

    if (prompt.trim().length === 0) {
      throw new ValidationError('prompt cannot be empty or whitespace only', 'prompt');
    }
  }
}