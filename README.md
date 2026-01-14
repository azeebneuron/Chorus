```
     _____ _
    / ____| |
   | |    | |__   ___  _ __ _   _ ___
   | |    | '_ \ / _ \| '__| | | / __|
   | |____| | | | (_) | |  | |_| \__ \
    \_____|_| |_|\___/|_|   \__,_|___/

```

A model-agnostic TypeScript framework for building multi-agent systems.

Minimal API surface. Maximum type safety. Zero bloat.

## Install

```bash
# Core package
pnpm add @chorus/core

# With Gemini provider
pnpm add @chorus/core @chorus/gemini
```

## Quick Start

```typescript
import { agent, defineTool } from "@chorus/core";
import { gemini } from "@chorus/gemini";

// Create a provider
const provider = gemini({
  apiKey: process.env.GEMINI_API_KEY!,
});

// Define a tool
const searchTool = defineTool({
  name: "search",
  description: "Search the web",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
    },
    required: ["query"],
  },
  execute: async ({ query }) => {
    // Your search logic
    return { results: [] };
  },
});

// Create an agent
const researcher = agent()
  .name("researcher")
  .systemPrompt("You are a research assistant.")
  .provider(provider)
  .tools([searchTool])
  .build();

// Run it
const result = await researcher.run("Find recent papers on multi-agent systems");
console.log(result.response);
```

## Core Concepts

**Agent** - An entity with a role, tools, and an LLM brain.

**Provider** - The LLM backend. Gemini, OpenAI, Anthropic, local models - your choice.

**Tool** - A function the agent can call. JSON Schema parameters, typed execution.

**Hooks** - Lifecycle events. `onBeforeGenerate`, `onAfterToolCall`, etc.

## Using Hooks

Monitor and react to agent lifecycle events:

```typescript
const myAgent = agent()
  .name("monitored-agent")
  .systemPrompt("You are helpful.")
  .provider(provider)
  .onBeforeGenerate((ctx) => {
    console.log(`Starting iteration ${ctx.state.iteration}`);
  })
  .onAfterGenerate((ctx, message) => {
    console.log(`Generated: ${message.content?.slice(0, 50)}...`);
  })
  .onBeforeToolCall((ctx, name, args) => {
    console.log(`Calling ${name} with`, args);
  })
  .onAfterToolCall((ctx, name, result) => {
    console.log(`${name} returned:`, result);
  })
  .onError((ctx, error) => {
    console.error(`Error: ${error.message}`);
  })
  .build();
```

## Custom Providers

Implement the `Provider` interface for any LLM:

```typescript
import type { Provider } from "@chorus/core";

const myProvider: Provider = {
  name: "my-llm",
  generate: async (config) => {
    // config.messages - conversation history
    // config.tools - available tools
    // config.temperature, config.maxTokens, etc.

    const response = await callYourLLM(config);

    return {
      message: { role: "assistant", content: response.text },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: "stop",
    };
  },
};
```

## Packages

| Package | Description |
|---------|-------------|
| `@chorus/core` | Core primitives - agents, tools, providers |
| `@chorus/gemini` | Google Gemini provider |

## Examples

See the [examples](./examples) directory:

- `simple-agent.ts` - Basic agent setup
- `agent-with-tools.ts` - Using tools (weather, calculator)
- `agent-with-hooks.ts` - Lifecycle hooks for observability

Run examples:
```bash
cd examples
pnpm install
GEMINI_API_KEY=your-key pnpm run simple
```

## License

MIT

---

Built by [Rahul](https://github.com/azeebneuron) and [Claude](https://claude.ai)
