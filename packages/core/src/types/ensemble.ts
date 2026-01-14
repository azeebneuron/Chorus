/**
 * Ensemble types - Agent groups for multi-agent orchestration
 */

import type { Agent, AgentResult } from "./agent.js";
import type { Message } from "./message.js";
import type { Conductor } from "./conductor.js";
import type { SharedContext } from "./context.js";

/**
 * Unique identifier for an agent within an ensemble
 */
export type AgentId = string;

/**
 * Role that an agent plays in an ensemble
 */
export type AgentRole = {
  /** Unique ID for this agent in the ensemble */
  id: AgentId;
  /** The agent instance */
  agent: Agent;
  /** Role description (used in orchestration context) */
  role?: string;
  /** Priority for selection in hierarchical patterns */
  priority?: number;
  /** Tags for filtering/selection */
  tags?: string[];
};

/**
 * Ensemble configuration
 */
export type EnsembleConfig = {
  /** Unique name for the ensemble */
  name: string;
  /** Description of the ensemble's purpose */
  description?: string;
  /** Agents in this ensemble */
  agents: AgentRole[];
  /** Default conductor for orchestration */
  conductor?: Conductor;
};

/**
 * Result from an ensemble run
 */
export type EnsembleResult = {
  /** Final consolidated response */
  response: string;
  /** Results from each agent that participated */
  agentResults: Map<AgentId, AgentResult>;
  /** Full conversation/execution trace */
  trace: ExecutionTrace;
  /** Total token usage across all agents */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

/**
 * Execution trace for debugging and observability
 */
export type ExecutionTrace = {
  /** Unique trace ID */
  id: string;
  /** Timestamp when execution started */
  startTime: number;
  /** Timestamp when execution ended */
  endTime?: number;
  /** Steps in the execution */
  steps: ExecutionStep[];
};

/**
 * A single step in execution
 */
export type ExecutionStep = {
  /** Step index */
  index: number;
  /** Agent that executed this step */
  agentId: AgentId;
  /** Input provided to the agent */
  input: string;
  /** Output from the agent */
  output?: AgentResult;
  /** Error if step failed */
  error?: Error;
  /** Timestamp */
  timestamp: number;
  /** Duration in ms */
  duration?: number;
  /** Metadata about this step */
  metadata?: Record<string, unknown>;
};

/**
 * Options for running an ensemble
 */
export type EnsembleRunOptions = {
  /** Override the default conductor */
  conductor?: Conductor;
  /** Signal for cancellation */
  signal?: AbortSignal;
  /** Initial context to share */
  context?: SharedContext;
};

/**
 * Ensemble hooks for lifecycle events
 */
export type EnsembleHooks = {
  /** Before ensemble starts */
  onStart?: (input: string) => void | Promise<void>;
  /** When ensemble completes */
  onComplete?: (result: EnsembleResult) => void | Promise<void>;
  /** On error */
  onError?: (error: Error) => void | Promise<void>;
};

/**
 * Ensemble interface
 */
export type Ensemble = {
  /** Ensemble configuration */
  config: EnsembleConfig;
  /** Ensemble hooks */
  hooks?: EnsembleHooks;
  /** Run the ensemble with input */
  run: (input: string, options?: EnsembleRunOptions) => Promise<EnsembleResult>;
  /** Get an agent by ID */
  getAgent: (id: AgentId) => AgentRole | undefined;
  /** List all agents */
  listAgents: () => AgentRole[];
};
