/**
 * Conductor - Orchestration for multi-agent systems
 */

import type {
  Agent,
  AgentId,
  AgentRole,
  Conductor,
  ConductorHooks,
  ConductorRunOptions,
  AnyConductorConfig,
  SequentialConfig,
  ParallelConfig,
  HierarchicalConfig,
  DebateConfig,
  VotingConfig,
  CustomConfig,
  ResultMerger,
  DelegationStrategy,
  EnsembleResult,
  SharedContext,
} from "../types/index.js";

import { createSequentialConductor } from "./strategies/sequential.js";
import { createParallelConductor } from "./strategies/parallel.js";
import { createHierarchicalConductor } from "./strategies/hierarchical.js";
import { createDebateConductor } from "./strategies/debate.js";
import { createVotingConductor } from "./strategies/voting.js";

// Re-export strategies
export * from "./strategies/index.js";
export * from "./base.js";

/**
 * Create a conductor from configuration
 */
export function createConductor(config: AnyConductorConfig): Conductor {
  switch (config.strategy) {
    case "sequential":
      return createSequentialConductor(config);
    case "parallel":
      return createParallelConductor(config);
    case "hierarchical":
      return createHierarchicalConductor(config);
    case "debate":
      return createDebateConductor(config);
    case "voting":
      return createVotingConductor(config);
    case "custom":
      return createCustomConductor(config);
    default:
      throw new Error(
        `Unknown orchestration strategy: ${(config as { strategy: string }).strategy}`
      );
  }
}

/**
 * Create a custom conductor
 */
function createCustomConductor(config: CustomConfig): Conductor {
  return {
    config,
    hooks: config.hooks,
    orchestrate: config.orchestrate,
  };
}

/**
 * Builder pattern for creating conductors
 */
export class ConductorBuilder {
  private conductorStrategy: AnyConductorConfig["strategy"] = "sequential";
  private conductorHooks: ConductorHooks = {};
  private maxRounds = 10;
  private agentTimeout?: number;
  private errorMode: "fail-fast" | "continue" | "retry" = "fail-fast";
  private retryCount = 3;

  // Sequential options
  private orderList?: AgentId[];
  private transformFn?: (output: string, nextAgent: AgentRole) => string;

  // Parallel options
  private parallelAgents?: AgentId[];
  private mergerConfig?: ResultMerger;
  private concurrencyLimit?: number;

  // Hierarchical options
  private managerId?: AgentId;
  private workerIds?: AgentId[];
  private delegationConfig?: DelegationStrategy;
  private maxDelegations?: number;

  // Debate options
  private debaterIds?: AgentId[];
  private judgeId?: AgentId;
  private consensusThreshold?: number;
  private consensusStrategy?: "judge" | "agreement" | "voting";

  // Voting options
  private voterIds?: AgentId[];
  private votingMethod?: "majority" | "unanimous" | "weighted" | "ranked";
  private weights?: Map<AgentId, number>;
  private quorum?: number;
  private votingOptions?: string[];

  // Custom
  private customOrchestrate?: CustomConfig["orchestrate"];

  /**
   * Set the orchestration strategy
   */
  strategy(strategy: AnyConductorConfig["strategy"]): this {
    this.conductorStrategy = strategy;
    return this;
  }

  /**
   * Set maximum rounds/iterations
   */
  rounds(max: number): this {
    this.maxRounds = max;
    return this;
  }

  /**
   * Set timeout per agent (ms)
   */
  timeout(ms: number): this {
    this.agentTimeout = ms;
    return this;
  }

  /**
   * Set error handling mode
   */
  onError(mode: "fail-fast" | "continue" | "retry"): this {
    this.errorMode = mode;
    return this;
  }

  /**
   * Set retry count for retry error mode
   */
  retries(count: number): this {
    this.retryCount = count;
    return this;
  }

  // Sequential-specific methods

  /**
   * Set the execution order for sequential strategy
   */
  order(agentIds: AgentId[]): this {
    this.orderList = agentIds;
    return this;
  }

  /**
   * Set transform function between sequential steps
   */
  transform(fn: (output: string, nextAgent: AgentRole) => string): this {
    this.transformFn = fn;
    return this;
  }

  // Parallel-specific methods

  /**
   * Set which agents to run in parallel
   */
  agents(agentIds: AgentId[]): this {
    this.parallelAgents = agentIds;
    return this;
  }

  /**
   * Set the result merger for parallel strategy
   */
  merger(config: ResultMerger): this {
    this.mergerConfig = config;
    return this;
  }

  /**
   * Set concurrency limit for parallel execution
   */
  concurrency(limit: number): this {
    this.concurrencyLimit = limit;
    return this;
  }

  // Hierarchical-specific methods

  /**
   * Set the manager agent
   */
  manager(agentId: AgentId): this {
    this.managerId = agentId;
    return this;
  }

  /**
   * Set worker agents
   */
  workers(agentIds: AgentId[]): this {
    this.workerIds = agentIds;
    return this;
  }

  /**
   * Set delegation strategy
   */
  delegation(config: DelegationStrategy): this {
    this.delegationConfig = config;
    return this;
  }

  /**
   * Set max delegations
   */
  maxDelegation(count: number): this {
    this.maxDelegations = count;
    return this;
  }

  // Debate-specific methods

  /**
   * Set debating agents
   */
  debaters(agentIds: AgentId[]): this {
    this.debaterIds = agentIds;
    return this;
  }

  /**
   * Set the judge for debate
   */
  judge(agentId: AgentId): this {
    this.judgeId = agentId;
    return this;
  }

  /**
   * Set consensus strategy for debate
   */
  consensus(
    strategy: "judge" | "agreement" | "voting",
    threshold?: number
  ): this {
    this.consensusStrategy = strategy;
    this.consensusThreshold = threshold;
    return this;
  }

  // Voting-specific methods

  /**
   * Set voters
   */
  voters(agentIds: AgentId[]): this {
    this.voterIds = agentIds;
    return this;
  }

  /**
   * Set voting method
   */
  method(
    method: "majority" | "unanimous" | "weighted" | "ranked"
  ): this {
    this.votingMethod = method;
    return this;
  }

  /**
   * Set voter weights for weighted voting
   */
  weight(agentId: AgentId, weight: number): this {
    if (!this.weights) {
      this.weights = new Map();
    }
    this.weights.set(agentId, weight);
    return this;
  }

  /**
   * Set quorum requirement
   */
  quorumRequired(fraction: number): this {
    this.quorum = fraction;
    return this;
  }

  /**
   * Set voting options
   */
  options(options: string[]): this {
    this.votingOptions = options;
    return this;
  }

  // Custom strategy

  /**
   * Set custom orchestration function
   */
  custom(
    fn: (
      input: string,
      agents: AgentRole[],
      options?: ConductorRunOptions
    ) => Promise<EnsembleResult>
  ): this {
    this.conductorStrategy = "custom";
    this.customOrchestrate = fn;
    return this;
  }

  // Hooks

  /**
   * Hook called before orchestration starts
   */
  onStart(hook: ConductorHooks["onStart"]): this {
    this.conductorHooks.onStart = hook;
    return this;
  }

  /**
   * Hook called before each agent runs
   */
  onBeforeAgent(hook: ConductorHooks["onBeforeAgent"]): this {
    this.conductorHooks.onBeforeAgent = hook;
    return this;
  }

  /**
   * Hook called after each agent runs
   */
  onAfterAgent(hook: ConductorHooks["onAfterAgent"]): this {
    this.conductorHooks.onAfterAgent = hook;
    return this;
  }

  /**
   * Hook called on agent error
   */
  onAgentError(hook: ConductorHooks["onAgentError"]): this {
    this.conductorHooks.onAgentError = hook;
    return this;
  }

  /**
   * Hook called when orchestration completes
   */
  onComplete(hook: ConductorHooks["onComplete"]): this {
    this.conductorHooks.onComplete = hook;
    return this;
  }

  /**
   * Hook called on debate rounds
   */
  onDebateRound(hook: ConductorHooks["onDebateRound"]): this {
    this.conductorHooks.onDebateRound = hook;
    return this;
  }

  /**
   * Hook called when a vote is cast
   */
  onVote(hook: ConductorHooks["onVote"]): this {
    this.conductorHooks.onVote = hook;
    return this;
  }

  /**
   * Build the conductor
   */
  build(): Conductor {
    const baseConfig = {
      maxRounds: this.maxRounds,
      agentTimeout: this.agentTimeout,
      errorMode: this.errorMode,
      retryCount: this.retryCount,
      hooks: this.conductorHooks,
    };

    switch (this.conductorStrategy) {
      case "sequential": {
        const config: SequentialConfig = {
          ...baseConfig,
          strategy: "sequential",
          order: this.orderList,
          transform: this.transformFn,
        };
        return createConductor(config);
      }

      case "parallel": {
        if (!this.mergerConfig) {
          throw new Error("Parallel strategy requires a merger configuration");
        }
        const config: ParallelConfig = {
          ...baseConfig,
          strategy: "parallel",
          agents: this.parallelAgents,
          merger: this.mergerConfig,
          concurrency: this.concurrencyLimit,
        };
        return createConductor(config);
      }

      case "hierarchical": {
        if (!this.managerId) {
          throw new Error("Hierarchical strategy requires a manager agent");
        }
        const config: HierarchicalConfig = {
          ...baseConfig,
          strategy: "hierarchical",
          managerId: this.managerId,
          workerIds: this.workerIds,
          delegation: this.delegationConfig ?? { type: "manager-decides" },
          maxDelegations: this.maxDelegations,
        };
        return createConductor(config);
      }

      case "debate": {
        const config: DebateConfig = {
          ...baseConfig,
          strategy: "debate",
          debaters: this.debaterIds,
          maxRounds: this.maxRounds,
          judgeId: this.judgeId,
          consensusThreshold: this.consensusThreshold,
          consensusStrategy: this.consensusStrategy ?? "judge",
        };
        return createConductor(config);
      }

      case "voting": {
        const config: VotingConfig = {
          ...baseConfig,
          strategy: "voting",
          voters: this.voterIds,
          method: this.votingMethod ?? "majority",
          weights: this.weights,
          quorum: this.quorum,
          options: this.votingOptions,
        };
        return createConductor(config);
      }

      case "custom": {
        if (!this.customOrchestrate) {
          throw new Error("Custom strategy requires an orchestrate function");
        }
        const config: CustomConfig = {
          ...baseConfig,
          strategy: "custom",
          orchestrate: this.customOrchestrate,
        };
        return createConductor(config);
      }

      default:
        throw new Error(`Unknown strategy: ${this.conductorStrategy}`);
    }
  }
}

/**
 * Start building a conductor
 */
export function conductor(): ConductorBuilder {
  return new ConductorBuilder();
}
