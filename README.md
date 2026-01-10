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
pnpm add @chorus/core
```

## Quick Start

```typescript
import { agent, defineTool } from "@chorus/core";

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
  .provider(yourProvider) // Bring your own LLM
  .tools([searchTool])
  .build();

// Run it
const result = await researcher.run("Find recent papers on multi-agent systems");
console.log(result.response);
```

## Core Concepts

**Agent** - An entity with a role, tools, and an LLM brain.

**Provider** - The LLM backend. OpenAI, Anthropic, local models - your choice.

**Tool** - A function the agent can call. JSON Schema parameters, typed execution.

**Hooks** - Lifecycle events. `onBeforeGenerate`, `onAfterToolCall`, etc.

## Bring Your Own LLM

Chorus doesn't ship with LLM clients. Implement the `Provider` interface:

```typescript
import type { Provider } from "@chorus/core";

const myProvider: Provider = {
  name: "my-llm",
  generate: async (config) => {
    // Call your LLM
    // Return { message, usage, finishReason }
  },
};
```

## Packages

| Package | Description |
|---------|-------------|
| `@chorus/core` | Core primitives - agents, tools, providers |

## License

MIT

---

Built by [Rahul](https://github.com/azeebneuron) and [Claude](https://claude.ai)
