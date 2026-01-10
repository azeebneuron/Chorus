/**
 * @chorus/core
 *
 * A TypeScript-first, LLM-agnostic multi-agent framework
 *
 * @example
 * ```typescript
 * import { agent, defineTool } from "@chorus/core";
 *
 * const myAgent = agent()
 *   .name("assistant")
 *   .systemPrompt("You are a helpful assistant.")
 *   .provider(myProvider)
 *   .tools([searchTool, calculatorTool])
 *   .build();
 *
 * const result = await myAgent.run("What is 2 + 2?");
 * console.log(result.response);
 * ```
 */

// Type exports
export type {
  // Messages
  Message,
  MessageRole,
  MessageInput,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  ToolCall,
  // Tools
  Tool,
  ToolInput,
  ZodToolInput,
  ToolResult,
  JsonSchema,
  // Provider
  Provider,
  ProviderFactory,
  GenerateConfig,
  GenerateResponse,
  StreamChunk,
  // Agent
  Agent,
  AgentConfig,
  AgentState,
  AgentResult,
  AgentContext,
  AgentHooks,
} from "./types/index.js";

// Function exports
export { system, user, assistant } from "./types/message.js";
export { defineTool } from "./types/tool.js";
export { createAgent, agent, AgentBuilder } from "./agent.js";
