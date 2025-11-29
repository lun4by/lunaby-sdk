/**
 * Lunaby SDK - Usage Examples
 * 
 * Run with: npx ts-node examples/basic.ts
 * Or after build: node examples/basic.js
 */

import Lunaby, { 
  ChatMessage, 
  APIError, 
  AuthenticationError,
  RateLimitError 
} from '../src/index.js';

// Initialize client
const client = new Lunaby({
  apiKey: process.env.LUNABY_API_KEY,
  // baseURL: 'https://api.lunie.dev/v1', // default
});

// ============================================
// Example 1: Simple Chat Completion
// ============================================
async function simpleChatExample() {
  console.log('\n=== Simple Chat Example ===\n');
  
  const response = await client.chat.create([
    { role: 'system', content: 'You are a helpful assistant named Lunaby.' },
    { role: 'user', content: 'Hello! What is your name?' }
  ]);

  console.log('Response:', response.data.choices[0].message.content);
  console.log('Tokens used:', response.data.usage.total_tokens);
}

// ============================================
// Example 2: Streaming Chat
// ============================================
async function streamingChatExample() {
  console.log('\n=== Streaming Chat Example ===\n');
  
  console.log('Response: ');
  
  const stream = await client.chat.createStream([
    { role: 'user', content: 'Tell me a short joke about programming.' }
  ]);

  // Method 1: Using async iterator
  for await (const chunk of stream) {
    const content = chunk.choices[0].delta.content;
    if (content) {
      process.stdout.write(content);
    }
  }
  
  console.log('\n\nFull content length:', stream.fullContent.length);
}

// ============================================
// Example 3: Streaming with Callbacks
// ============================================
async function streamingWithCallbacks() {
  console.log('\n=== Streaming with Callbacks ===\n');
  
  const stream = await client.chat.createStream([
    { role: 'user', content: 'Count from 1 to 5 slowly.' }
  ]);

  await stream.process({
    onContent: (content, accumulated) => {
      process.stdout.write(content);
    },
    onDone: (fullContent, usage) => {
      console.log('\n\nStream completed!');
      console.log('Total length:', fullContent.length);
      if (usage) {
        console.log('Tokens:', usage.total_tokens);
      }
    },
    onError: (error) => {
      console.error('Stream error:', error.message);
    }
  });
}

// ============================================
// Example 4: Multi-turn Conversation
// ============================================
async function conversationExample() {
  console.log('\n=== Multi-turn Conversation ===\n');
  
  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are a helpful math tutor.' }
  ];

  // First turn
  messages.push({ role: 'user', content: 'What is 2 + 2?' });
  
  let response = await client.chat.create(messages);
  const firstAnswer = response.data.choices[0].message.content;
  console.log('User: What is 2 + 2?');
  console.log('Assistant:', firstAnswer);
  
  // Add assistant response to history
  messages.push({ role: 'assistant', content: firstAnswer });
  
  // Second turn
  messages.push({ role: 'user', content: 'And what if I multiply that by 3?' });
  
  response = await client.chat.create(messages);
  const secondAnswer = response.data.choices[0].message.content;
  console.log('\nUser: And what if I multiply that by 3?');
  console.log('Assistant:', secondAnswer);
}

// ============================================
// Example 5: Image Generation
// ============================================
async function imageGenerationExample() {
  console.log('\n=== Image Generation Example ===\n');
  
  const result = await client.images.generateBuffer(
    'A cute robot cat with glowing blue eyes, digital art style',
    {
      aspect_ratio: '1:1',
      output_format: 'png'
    }
  );

  console.log('Image generated successfully!');
  console.log('Buffer size:', result.buffer.length, 'bytes');
  if (result.revisedPrompt) {
    console.log('Revised prompt:', result.revisedPrompt);
  }
  
  // Optionally save to file:
  // import fs from 'fs';
  // fs.writeFileSync('robot-cat.png', result.buffer);
}

// ============================================
// Example 6: Error Handling
// ============================================
async function errorHandlingExample() {
  console.log('\n=== Error Handling Example ===\n');
  
  // Create client with invalid key for demonstration
  const badClient = new Lunaby({ apiKey: 'invalid-key' });
  
  try {
    await badClient.chat.create([
      { role: 'user', content: 'Hello!' }
    ]);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.log('Caught AuthenticationError:', error.message);
    } else if (error instanceof RateLimitError) {
      console.log('Caught RateLimitError:', error.message);
      console.log('Retry after:', error.retryAfter, 'seconds');
    } else if (error instanceof APIError) {
      console.log('Caught APIError:', error.status, error.message);
    } else {
      console.log('Caught unknown error:', error);
    }
  }
}

// ============================================
// Example 7: Using Different Models
// ============================================
async function modelSelectionExample() {
  console.log('\n=== Model Selection Example ===\n');
  
  // Using reasoning model for complex tasks
  const reasoningResponse = await client.chat.create([
    { role: 'user', content: 'Solve step by step: If a train travels 120km in 2 hours, what is its average speed?' }
  ], {
    model: 'lunaby-reasoning'
  });

  console.log('Reasoning model response:');
  console.log(reasoningResponse.data.choices[0].message.content);
}

// ============================================
// Run all examples
// ============================================
async function main() {
  try {
    if (!process.env.LUNABY_API_KEY) {
      console.log('⚠️  LUNABY_API_KEY not set. Some examples may fail.');
      console.log('Set it with: export LUNABY_API_KEY=your-key\n');
    }

    await simpleChatExample();
    await streamingChatExample();
    await streamingWithCallbacks();
    await conversationExample();
    await modelSelectionExample();
    
    // Uncomment to test image generation (uses more quota)
    // await imageGenerationExample();
    
    // Error handling example (will show auth error)
    await errorHandlingExample();
    
    console.log('\n✅ All examples completed!');
  } catch (error) {
    console.error('\n❌ Example failed:', error);
  }
}

main();
