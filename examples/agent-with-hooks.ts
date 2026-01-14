/**
 * Agent with Lifecycle Hooks Example
 *
 * This example demonstrates how to use hooks to observe
 * and react to agent lifecycle events.
 *
 * Run with: npx tsx examples/agent-with-hooks.ts
 */

import { agent, defineTool } from "@chorus/core";
import { gemini } from "@chorus/gemini";

// Create a Gemini provider
const provider = gemini({
  apiKey: process.env.GEMINI_API_KEY!,
});

// Simple tool for demonstration
const searchWeb = defineTool({
  name: "search_web",
  description: "Searches the web for information",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
      },
    },
    required: ["query"],
  },
  execute: async ({ query }) => {
    // Simulated search results
    await new Promise((r) => setTimeout(r, 100)); // Simulate network delay
    return {
      query,
      results: [
        { title: `Result 1 for "${query}"`, snippet: "This is a simulated search result..." },
        { title: `Result 2 for "${query}"`, snippet: "Another relevant result..." },
      ],
    };
  },
});

// Track timing
let startTime: number;

// Create an agent with hooks
const researchAgent = agent()
  .name("researcher")
  .description("A research assistant that logs its activities")
  .systemPrompt(`You are a research assistant. Use the search_web tool to find information.
Provide clear, well-organized summaries of what you find.`)
  .provider(provider)
  .tools([searchWeb])
  .onBeforeGenerate((ctx) => {
    startTime = Date.now();
    console.log(`\n🔄 [Iteration ${ctx.state.iteration}] Generating response...`);
  })
  .onAfterGenerate((ctx, message) => {
    const duration = Date.now() - startTime;
    if (message.role === "assistant") {
      if (message.toolCalls?.length) {
        console.log(`✅ [${duration}ms] Model wants to use ${message.toolCalls.length} tool(s)`);
      } else {
        console.log(`✅ [${duration}ms] Model generated final response`);
      }
    }
  })
  .onBeforeToolCall((ctx, name, args) => {
    console.log(`\n🔧 Calling tool: ${name}`);
    console.log(`   Args: ${JSON.stringify(args)}`);
  })
  .onAfterToolCall((ctx, name, result) => {
    console.log(`✅ Tool ${name} returned:`, JSON.stringify(result).slice(0, 100) + "...");
  })
  .onError((ctx, error) => {
    console.error(`❌ Error: ${error.message}`);
  })
  .build();

// Run the agent
async function main() {
  console.log("🎵 Chorus - Agent with Hooks Example");
  console.log("=====================================\n");

  const result = await researchAgent.run(
    "Search for information about the James Webb Space Telescope's latest discoveries"
  );

  console.log("\n=====================================");
  console.log("\n📝 Final Response:\n");
  console.log(result.response);

  console.log("\n📊 Summary:");
  console.log(`  Total iterations: ${result.iterations}`);
  console.log(`  Messages in conversation: ${result.messages.length}`);
  console.log(`  Total tokens: ${result.usage.totalTokens}`);
}

main().catch(console.error);
