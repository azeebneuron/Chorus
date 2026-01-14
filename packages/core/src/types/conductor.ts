/**
 * Conductor types - Orchestration strategies for multi-agent systems
 */

import type { Agent, AgentResult } from "./agent.js";
import type { AgentId, AgentRole, EnsembleResult } from "./ensemble.js";
import type { SharedContext } from "./context.js";

/**
 * Orchestration strategy types
 */
export type OrchestrationStrategy =
  | "sequential"
  | "parallel"
  | "hierarchical"
  | "debate"
  | "voting"
  | "custom";

/**
 * Base conductor configuration
 */
export type ConductorConfig = {
  /** Strategy for orchestration */
  strategy: OrchestrationStrategy;
  /** Maximum rounds of orchestration */
  maxRounds?: number;
  /** Timeout per agent in ms */
  agentTimeout?: number;
  /** Error handling mode */
  errorMode?: "fail-fast" | "continue" | "retry";
  /** Number of retries on failure */
  retryCount?: number;
  /** Lifecycle hooks */
  hooks?: ConductorHooks;
};

/**
 * Sequential: A -> B -> C
 */
export type SequentialConfig = ConductorConfig & {
  strategy: "sequential";
  /** Order of agents (by ID) - if not specified, uses registration order */
  order?: AgentId[];
  /** Transform output before passing to next agent */
  transform?: (output: string, nextAgent: AgentRole) => string;
};

/**
 * Parallel: A, B, C -> merge
 */
export type ParallelConfig = ConductorConfig & {
  strategy: "parallel";
  /** Which agents to run in parallel - if not specified, runs all */
  agents?: AgentId[];
  /** How to merge results */
  merger: ResultMerger;
  /** Concurrency limit */
  concurrency?: number;
};

/**
 * Result merger for parallel execution
 */
export type ResultMerger = {
  /** Merger type */
  type: "concatenate" | "summarize" | "select-best" | "custom";
  /** For summarize: agent to use for summarization */
  summarizer?: Agent;
  /** For select-best: selection criteria */
  selector?: (results: AgentResult[]) => AgentResult;
  /** For custom: custom merge function */
  merge?: (results: Map<AgentId, AgentResult>) => string;
  /** Separator for concatenation */
  separator?: string;
};

/**
 * Hierarchical: manager -> workers
 */
export type HierarchicalConfig = ConductorConfig & {
  strategy: "hierarchical";
  /** The manager agent ID */
  managerId: AgentId;
  /** Worker agent IDs */
  workerIds?: AgentId[];
  /** How manager delegates tasks */
  delegation: DelegationStrategy;
  /** Max delegation rounds */
  maxDelegations?: number;
};

/**
 * Delegation strategy for hierarchical orchestration
 */
export type DelegationStrategy = {
  /** How to determine which worker handles a task */
  type: "manager-decides" | "capability-match" | "round-robin" | "custom";
  /** For capability-match: capability definitions */
  capabilities?: Map<AgentId, string[]>;
  /** For custom: delegation function */
  delegate?: (task: string, workers: AgentRole[]) => AgentId;
};

/**
 * Debate: agents argue to consensus
 */
export type DebateConfig = ConductorConfig & {
  strategy: "debate";
  /** Agents participating in debate */
  debaters?: AgentId[];
  /** Maximum rounds of debate */
  maxRounds: number;
  /** Judge agent (determines consensus) */
  judgeId?: AgentId;
  /** Consensus threshold (0-1) */
  consensusThreshold?: number;
  /** How to determine consensus */
  consensusStrategy: "judge" | "agreement" | "voting";
};

/**
 * Voting: democratic decisions
 */
export type VotingConfig = ConductorConfig & {
  strategy: "voting";
  /** Voters (if not specified, all agents vote) */
  voters?: AgentId[];
  /** Voting method */
  method: "majority" | "unanimous" | "weighted" | "ranked";
  /** Weights for weighted voting */
  weights?: Map<AgentId, number>;
  /** Minimum participation required (0-1) */
  quorum?: number;
  /** Options to vote on (if not provided, agents generate options) */
  options?: string[];
};

/**
 * Custom orchestration
 */
export type CustomConfig = ConductorConfig & {
  strategy: "custom";
  /** Custom orchestration function */
  orchestrate: (
    input: string,
    agents: AgentRole[],
    options?: ConductorRunOptions
  ) => Promise<EnsembleResult>;
};

/**
 * Union of all conductor configs
 */
export type AnyConductorConfig =
  | SequentialConfig
  | ParallelConfig
  | HierarchicalConfig
  | DebateConfig
  | VotingConfig
  | CustomConfig;

/**
 * Conductor lifecycle hooks
 */
export type ConductorHooks = {
  /** Before orchestration starts */
  onStart?: (input: string, agents: AgentRole[]) => void | Promise<void>;
  /** Before each agent runs */
  onBeforeAgent?: (agentId: AgentId, input: string) => void | Promise<void>;
  /** After each agent runs */
  onAfterAgent?: (agentId: AgentId, result: AgentResult) => void | Promise<void>;
  /** On agent error */
  onAgentError?: (agentId: AgentId, error: Error) => void | Promise<void>;
  /** When orchestration completes */
  onComplete?: (result: EnsembleResult) => void | Promise<void>;
  /** On debate round (for debate strategy) */
  onDebateRound?: (round: number, statements: Map<AgentId, string>) => void | Promise<void>;
  /** On vote cast (for voting strategy) */
  onVote?: (agentId: AgentId, vote: unknown) => void | Promise<void>;
};

/**
 * Options for conductor run
 */
export type ConductorRunOptions = {
  /** Shared context */
  context?: SharedContext;
  /** Signal for cancellation */
  signal?: AbortSignal;
  /** Hooks for observability */
  hooks?: ConductorHooks;
};

/**
 * Conductor interface
 */
export type Conductor = {
  /** Configuration */
  config: AnyConductorConfig;
  /** Hooks */
  hooks?: ConductorHooks;
  /** Run orchestration */
  orchestrate: (
    input: string,
    agents: AgentRole[],
    options?: ConductorRunOptions
  ) => Promise<EnsembleResult>;
};
