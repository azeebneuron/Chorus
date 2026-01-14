/**
 * Ensemble implementation - Multi-agent orchestration container
 */

import type {
  Agent,
  AgentId,
  AgentRole,
  Ensemble,
  EnsembleConfig,
  EnsembleResult,
  EnsembleRunOptions,
  EnsembleHooks,
  ExecutionTrace,
  Conductor,
} from "./types/index.js";
import { createContext } from "./context.js";

/**
 * Generate a unique trace ID
 */
function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create an ensemble with the given configuration
 */
export function createEnsemble(
  config: EnsembleConfig,
  hooks?: EnsembleHooks
): Ensemble {
  const agentMap = new Map<AgentId, AgentRole>();

  // Index agents by ID
  for (const agentRole of config.agents) {
    agentMap.set(agentRole.id, agentRole);
  }

  async function run(
    input: string,
    options?: EnsembleRunOptions
  ): Promise<EnsembleResult> {
    const conductor = options?.conductor ?? config.conductor;

    if (!conductor) {
      throw new Error(
        "No conductor provided. Use ensemble.run(input, { conductor }) or set a default conductor in ensemble config."
      );
    }

    // Initialize context
    const context = options?.context ?? createContext();

    // Store input in context for agents to access
    context.set("ensemble:input", input);
    context.set("ensemble:name", config.name);

    // Create execution trace
    const trace: ExecutionTrace = {
      id: generateTraceId(),
      startTime: Date.now(),
      steps: [],
    };

    // Call onStart hook
    await hooks?.onStart?.(input);

    try {
      // Get agent roles for conductor
      const agents = config.agents;

      // Run orchestration through conductor
      const result = await conductor.orchestrate(input, agents, {
        context,
        signal: options?.signal,
        hooks: {
          onBeforeAgent: async (agentId, agentInput) => {
            trace.steps.push({
              index: trace.steps.length,
              agentId,
              input: agentInput,
              timestamp: Date.now(),
            });
          },
          onAfterAgent: async (agentId, agentResult) => {
            const step = trace.steps.find(
              (s) => s.agentId === agentId && !s.output
            );
            if (step) {
              step.output = agentResult;
              step.duration = Date.now() - step.timestamp;
            }
          },
          onAgentError: async (agentId, error) => {
            const step = trace.steps.find(
              (s) => s.agentId === agentId && !s.output && !s.error
            );
            if (step) {
              step.error = error;
              step.duration = Date.now() - step.timestamp;
            }
          },
        },
      });

      // Finalize trace
      trace.endTime = Date.now();

      const ensembleResult: EnsembleResult = {
        response: result.response,
        agentResults: result.agentResults,
        trace,
        usage: result.usage,
      };

      // Call onComplete hook
      await hooks?.onComplete?.(ensembleResult);

      return ensembleResult;
    } catch (error) {
      trace.endTime = Date.now();
      const err = error instanceof Error ? error : new Error(String(error));
      await hooks?.onError?.(err);
      throw err;
    }
  }

  return {
    config,
    hooks,
    run,
    getAgent: (id: AgentId) => agentMap.get(id),
    listAgents: () => [...config.agents],
  };
}

/**
 * Builder pattern for creating ensembles
 */
export class EnsembleBuilder {
  private ensembleName: string = "";
  private ensembleDescription?: string;
  private agents: AgentRole[] = [];
  private defaultConductor?: Conductor;
  private ensembleHooks: EnsembleHooks = {};

  /**
   * Set the ensemble name
   */
  name(name: string): this {
    this.ensembleName = name;
    return this;
  }

  /**
   * Set the ensemble description
   */
  description(description: string): this {
    this.ensembleDescription = description;
    return this;
  }

  /**
   * Add an agent to the ensemble
   */
  add(
    agent: Agent,
    options?: {
      id?: AgentId;
      role?: string;
      priority?: number;
      tags?: string[];
    }
  ): this {
    const id = options?.id ?? agent.config.name;

    // Check for duplicate IDs
    if (this.agents.some((a) => a.id === id)) {
      throw new Error(`Agent with ID '${id}' already exists in ensemble`);
    }

    this.agents.push({
      id,
      agent,
      role: options?.role ?? agent.config.description,
      priority: options?.priority,
      tags: options?.tags,
    });
    return this;
  }

  /**
   * Set the default conductor for orchestration
   */
  conductor(conductor: Conductor): this {
    this.defaultConductor = conductor;
    return this;
  }

  /**
   * Hook called before ensemble starts
   */
  onStart(hook: EnsembleHooks["onStart"]): this {
    this.ensembleHooks.onStart = hook;
    return this;
  }

  /**
   * Hook called when ensemble completes
   */
  onComplete(hook: EnsembleHooks["onComplete"]): this {
    this.ensembleHooks.onComplete = hook;
    return this;
  }

  /**
   * Hook called on error
   */
  onError(hook: EnsembleHooks["onError"]): this {
    this.ensembleHooks.onError = hook;
    return this;
  }

  /**
   * Build the ensemble
   */
  build(): Ensemble {
    if (!this.ensembleName) {
      throw new Error("Ensemble name is required");
    }

    if (this.agents.length === 0) {
      throw new Error("Ensemble must have at least one agent");
    }

    const config: EnsembleConfig = {
      name: this.ensembleName,
      description: this.ensembleDescription,
      agents: this.agents,
      conductor: this.defaultConductor,
    };

    return createEnsemble(config, this.ensembleHooks);
  }
}

/**
 * Start building an ensemble
 */
export function ensemble(): EnsembleBuilder {
  return new EnsembleBuilder();
}
