# Lunaby SDK

Official TypeScript/JavaScript SDK for the Lunaby AI API. This SDK provides a clean, type-safe interface for interacting with Lunaby AI services including chat completions and image generation.

## Features

- **TypeScript-first** - Full type definitions included
- **Streaming support** - Async iterators for streaming responses
- **Image generation** - Generate images with Lunaby Vision
- **Modern** - Uses native fetch, ESM & CommonJS support
- **Error handling** - Comprehensive error types

## Installation

```bash
npm install lunaby-sdk
# or
yarn add lunaby-sdk
# or
pnpm add lunaby-sdk
```

## Quick Start

```typescript
import Lunaby from 'lunaby-sdk';

const client = new Lunaby({
  apiKey: process.env.LUNABY_API_KEY,
});

const response = await client.chat.create([
  { role: 'user', content: 'Hello, Lunaby!' }
]);

console.log(response.data.choices[0].message.content);
```

## Usage

### Chat Completions

#### Non-streaming

```typescript
import Lunaby from 'lunaby-sdk';

const client = new Lunaby({ apiKey: 'your-api-key' });

const response = await client.chat.create([
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'What is TypeScript?' }
], {
  model: 'lunaby-pro', // default
  max_tokens: 2048,
  temperature: 0.7,
});

console.log(response.data.choices[0].message.content);
console.log('Tokens used:', response.data.usage.total_tokens);
```

#### Streaming

```typescript
// Method 1: Using async iterator
for await (const chunk of client.chat.stream([
  { role: 'user', content: 'Tell me a story' }
])) {
  const content = chunk.choices[0].delta.content;
  if (content) {
    process.stdout.write(content);
  }
}

// Method 2: Using ChatStream with callbacks
const stream = await client.chat.createStream([
  { role: 'user', content: 'Explain quantum computing' }
]);

await stream.process({
  onContent: (content, accumulated) => {
    process.stdout.write(content);
  },
  onDone: (fullContent, usage) => {
    console.log('\n\nTotal tokens:', usage?.total_tokens);
  },
  onError: (error) => {
    console.error('Stream error:', error);
  }
});

// Method 3: Collect all content at once
const stream = await client.chat.createStream(messages);
const fullContent = await stream.toContent();
console.log(fullContent);
```

### Image Generation

```typescript
// Generate image and get buffer
const result = await client.images.generateBuffer('A beautiful sunset over mountains', {
  aspect_ratio: '16:9',
  output_format: 'png',
});

// Save to file
import fs from 'fs';
fs.writeFileSync('sunset.png', result.buffer);
console.log('Revised prompt:', result.revisedPrompt);

// Or get raw response
const response = await client.images.generate('A cute cat', {
  model: 'lunaby-vision',
  aspect_ratio: '1:1',
});

// Access base64 data directly
const base64 = response.data.data[0].b64_json;
```

### Models

Available models:
- `lunaby-pro` - Default model for general chat
- `lunaby-reasoning` - Enhanced reasoning capabilities
- `lunaby-vision` - Image generation

```typescript
// Using different models
const reasoning = await client.chat.create([
  { role: 'user', content: 'Solve this step by step...' }
], {
  model: 'lunaby-reasoning'
});
```

### Error Handling

```typescript
import Lunaby, {
  APIError,
  AuthenticationError,
  RateLimitError,
  TimeoutError,
  ValidationError,
  ContentFilterError,
} from 'lunaby-sdk';

try {
  const response = await client.chat.create([
    { role: 'user', content: 'Hello!' }
  ]);
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid API key:', error.message);
  } else if (error instanceof RateLimitError) {
    console.error('Rate limited. Retry after:', error.retryAfter, 'seconds');
  } else if (error instanceof TimeoutError) {
    console.error('Request timed out');
  } else if (error instanceof ContentFilterError) {
    console.error('Content was filtered:', error.categories);
  } else if (error instanceof ValidationError) {
    console.error('Invalid input:', error.message);
  } else if (error instanceof APIError) {
    console.error('API error:', error.status, error.message);
  }
}
```

### Configuration

```typescript
const client = new Lunaby({
  apiKey: 'your-api-key',
  baseURL: 'https://api.lunie.dev/v1',
  timeout: 120000,
  maxRetries: 2,
  defaultModel: 'lunaby-pro',
  defaultHeaders: {
    'X-Custom-Header': 'value'
  },
});
```

### Request Options

All methods accept additional request options:

```typescript
const controller = new AbortController();

const response = await client.chat.create(messages, {
  signal: controller.signal,  // Abort signal
  timeout: 30000,             // Override timeout for this request
  headers: {                  // Additional headers for this request
    'X-Request-ID': 'unique-id'
  }
});

// To abort:
controller.abort();
```

## TypeScript Types

All types are exported for your convenience:

```typescript
import type {
  ChatMessage,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ImageGenerationResponse,
  TokenUsage,
  Model,
  LunabyClientOptions,
} from 'lunaby-sdk';

const messages: ChatMessage[] = [
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'Hello!' }
];
```

## Environment Variables

The SDK automatically reads these environment variables:

- `LUNABY_API_KEY` - Your API key
- `LUNABY_BASE_URL` - Custom API base URL (optional)

## Browser Support

This SDK works in browsers that support the Fetch API and ReadableStream. For older browsers, you may need polyfills.

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or pull request on GitHub.

## Links

- [GitHub Repository](https://github.com/Lun4by/lunaby-sdk)
- [Documentation](https://docs.lunaby.dev)
- [API Reference](https://api.lunie.dev/docs)
