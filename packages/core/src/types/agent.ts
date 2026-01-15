/**
 * Agent definition and configuration types
 */

import type { Message } from "./message.js";
import type { Tool } from "./tool.js";
import type { Provider } from "./provider.js";

/**
 * Agent configuration
 */
export type AgentConfig = {
  /** Unique name for the agent */
  name: string;
  /** Description of the agent's role and capabilities */
  description?: string;
  /** System prompt that defines the agent's behavior */
  systemPrompt: string;
  /** LLM provider to use */
  provider: Provider;
  /** Model to use (provider-specific) */
  model?: string;
  /** Tools available to this agent */
  tools?: Tool[];
  /** Temperature for generation */
  temperature?: number;
  /** Maximum tokens per response */
  maxTokens?: number;
  /** Maximum iterations for tool use loop */
  maxIterations?: number;
  /** Maximum input length in characters (default: 100000) */
  maxInputLength?: number;
  /** Tool execution timeout in milliseconds (default: 30000) */
  toolTimeout?: number;
};

/**
 * Agent state during execution
 */
export type AgentState = {
  /** Conversation history */
  messages: Message[];
  /** Current iteration count */
  iteration: number;
  /** Whether the agent has finished */
  done: boolean;
  /** Last error if any */
  error?: Error;
};

/**
 * Result of running an agent
 */
export type AgentResult = {
  /** Final response from the agent */
  response: string;
  /** Full message history */
  messages: Message[];
  /** Number of iterations taken */
  iterations: number;
  /** Total token usage */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

/**
 * Agent execution context
 */
export type AgentContext = {
  /** Agent configuration */
  config: AgentConfig;
  /** Current state */
  state: AgentState;
  /** Signal for cancellation */
  signal?: AbortSignal;
};

/**
 * Hooks for agent lifecycle events
 */
export type AgentHooks = {
  /** Called before each generation */
  onBeforeGenerate?: (ctx: AgentContext) => void | Promise<void>;
  /** Called after each generation */
  onAfterGenerate?: (ctx: AgentContext, response: Message) => void | Promise<void>;
  /** Called before tool execution */
  onBeforeToolCall?: (ctx: AgentContext, toolName: string, args: unknown) => void | Promise<void>;
  /** Called after tool execution */
  onAfterToolCall?: (ctx: AgentContext, toolName: string, result: unknown) => void | Promise<void>;
  /** Called on error */
  onError?: (ctx: AgentContext, error: Error) => void | Promise<void>;
};

/**
 * Full agent definition
 */
export type Agent = {
  /** Agent configuration */
  config: AgentConfig;
  /** Lifecycle hooks */
  hooks?: AgentHooks;
  /** Run the agent with a user message */
  run: (input: string, options?: { signal?: AbortSignal }) => Promise<AgentResult>;
  /** Run the agent with streaming */
  stream?: (input: string, options?: { signal?: AbortSignal }) => AsyncIterable<string>;
};
