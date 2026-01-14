/**
 * Simple Agent Example
 *
 * This example demonstrates the most basic usage of Chorus:
 * creating an agent and having a conversation.
 *
 * Run with: npx tsx examples/simple-agent.ts
 */

import { agent } from "@chorus/core";
import { gemini } from "@chorus/gemini";

// Create a Gemini provider
const provider = gemini({
  apiKey: process.env.GEMINI_API_KEY!,
});

// Create an agent using the builder pattern
const assistant = agent()
  .name("assistant")
  .description("A friendly AI assistant")
  .systemPrompt(`You are a helpful, friendly assistant.
Keep your responses concise and engaging.
You love helping people learn new things.`)
  .provider(provider)
  .temperature(0.7)
  .build();

// Run the agent
async function main() {
  console.log("🎵 Chorus - Simple Agent Example\n");

  const result = await assistant.run("What are three interesting facts about octopuses?");

  console.log("Response:", result.response);
  console.log("\n📊 Stats:");
  console.log(`  Iterations: ${result.iterations}`);
  console.log(`  Tokens used: ${result.usage.totalTokens}`);
}

main().catch(console.error);
