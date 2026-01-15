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
  // Ensemble (Multi-Agent)
  AgentId,
  AgentRole,
  Ensemble,
  EnsembleConfig,
  EnsembleResult,
  EnsembleRunOptions,
  EnsembleHooks,
  ExecutionTrace,
  ExecutionStep,
  // Conductor (Orchestration)
  Conductor,
  ConductorConfig,
  ConductorHooks,
  ConductorRunOptions,
  OrchestrationStrategy,
  SequentialConfig,
  ParallelConfig,
  HierarchicalConfig,
  DebateConfig,
  VotingConfig,
  CustomConfig,
  AnyConductorConfig,
  ResultMerger,
  DelegationStrategy,
  // Shared Context
  SharedContext,
  ContextConfig,
  ContextSnapshot,
  // Handoff
  HandoffRequest,
  HandoffResponse,
  HandoffHandler,
  HandoffToolConfig,
  HandoffRegistry,
} from "./types/index.js";

// Function exports
export { system, user, assistant } from "./types/message.js";
export { defineTool } from "./types/tool.js";
export { createAgent, agent, AgentBuilder } from "./agent.js";

// Multi-agent exports
export { createEnsemble, ensemble, EnsembleBuilder } from "./ensemble.js";
export { createContext } from "./context.js";
export {
  createConductor,
  conductor,
  ConductorBuilder,
  createSequentialConductor,
  createParallelConductor,
  createHierarchicalConductor,
  createDebateConductor,
  createVotingConductor,
} from "./conductor/index.js";
export {
  createHandoffRegistry,
  createHandoffTool,
  createSimpleHandoffHandler,
  createAdvancedHandoffHandler,
  createHandoffChain,
} from "./handoff.js";

// Validation utilities
export {
  validateJsonSchema,
  validateInput,
  sanitizeError,
  type ValidationResult,
} from "./validation.js";
