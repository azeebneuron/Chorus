/**
 * Hierarchical orchestration strategy
 *
 * A manager agent delegates tasks to worker agents
 */

import type {
  AgentId,
  AgentRole,
  AgentResult,
  Conductor,
  ConductorRunOptions,
  EnsembleResult,
  HierarchicalConfig,
  JsonSchema,
  Tool,
} from "../../types/index.js";
import { createContext } from "../../context.js";
import {
  createTrace,
  runAgent,
  createEnsembleResult,
  checkAbort,
  requireAgent,
  findAgent,
} from "../base.js";

/**
 * Delegation task parameters
 */
type DelegateParams = {
  worker_id: string;
  task: string;
};

/**
 * Create a hierarchical conductor
 */
export function createHierarchicalConductor(
  config: HierarchicalConfig
): Conductor {
  async function orchestrate(
    input: string,
    agents: AgentRole[],
    options?: ConductorRunOptions
  ): Promise<EnsembleResult> {
    const context = options?.context ?? createContext();
    const trace = createTrace();
    const agentResults = new Map<AgentId, AgentResult>();

    // Call onStart hook
    await config.hooks?.onStart?.(input, agents);
    await options?.hooks?.onStart?.(input, agents);

    // Find manager
    const manager = requireAgent(agents, config.managerId);

    // Determine workers
    const workerIds =
      config.workerIds ?? agents.filter((a) => a.id !== config.managerId).map((a) => a.id);
    const workers = workerIds
      .map((id) => findAgent(agents, id))
      .filter((w): w is AgentRole => w !== undefined);

    // Track delegation count
    let delegations = 0;
    const maxDelegations = config.maxDelegations ?? 10;

    // Create delegation tool for manager
    const delegateParams: JsonSchema = {
      type: "object",
      properties: {
        worker_id: {
          type: "string",
          description: "ID of the worker agent to delegate to",
        },
        task: {
          type: "string",
          description: "The task description for the worker",
        },
      },
      required: ["worker_id", "task"],
    };

    const delegateTool: Tool = {
      name: "delegate_task",
      description: `Delegate a subtask to a worker agent. Available workers: ${workers
        .map((w) => `${w.id} (${w.role ?? "general"})`)
        .join(", ")}`,
      parameters: delegateParams,
      execute: async (params: unknown) => {
        const { worker_id, task } = params as DelegateParams;
        delegations++;

        if (delegations > maxDelegations) {
          return JSON.stringify({
            success: false,
            error: "Maximum delegation limit reached",
          });
        }

        const worker = findAgent(workers, worker_id);
        if (!worker) {
          return JSON.stringify({
            success: false,
            error: `Worker '${worker_id}' not found. Available: ${workers
              .map((w) => w.id)
              .join(", ")}`,
          });
        }

        try {
          checkAbort(options?.signal);

          const result = await runAgent(worker, task, {
            context,
            signal: options?.signal,
            hooks: options?.hooks,
            trace,
          });

          agentResults.set(worker_id, result);

          return JSON.stringify({
            success: true,
            worker: worker_id,
            response: result.response,
          });
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          return JSON.stringify({
            success: false,
            error: err.message,
          });
        }
      },
    };

    // Create manager agent with delegation tool
    const managerWithTools = {
      ...manager.agent,
      config: {
        ...manager.agent.config,
        tools: [...(manager.agent.config.tools ?? []), delegateTool],
      },
      run: async (managerInput: string, runOptions?: { signal?: AbortSignal }) => {
        // Run original agent but with delegation tool injected
        const { createAgent } = await import("../../agent.js");
        const enhancedAgent = createAgent(
          {
            ...manager.agent.config,
            tools: [...(manager.agent.config.tools ?? []), delegateTool],
          },
          manager.agent.hooks
        );
        return enhancedAgent.run(managerInput, runOptions);
      },
    };

    // Create enhanced manager role
    const enhancedManager: AgentRole = {
      ...manager,
      agent: managerWithTools,
    };

    // Build instruction for manager
    const workerDescriptions = workers
      .map((w) => {
        const capabilities = getWorkerCapabilities(w, config.delegation);
        return `- ${w.id}: ${w.role ?? "general worker"}${
          capabilities ? ` [${capabilities}]` : ""
        }`;
      })
      .join("\n");

    const managerInstruction = `You are a manager agent. Your task is to complete the following request by delegating subtasks to your worker agents.

Available workers:
${workerDescriptions}

Use the delegate_task tool to assign work to appropriate workers. You can delegate multiple tasks and then synthesize the results into a final response.

Request: ${input}`;

    // Run manager
    const managerResult = await runAgent(enhancedManager, managerInstruction, {
      context,
      signal: options?.signal,
      hooks: options?.hooks,
      trace,
    });

    agentResults.set(config.managerId, managerResult);

    const ensembleResult = createEnsembleResult(
      managerResult.response,
      agentResults,
      trace
    );

    // Call onComplete hook
    await config.hooks?.onComplete?.(ensembleResult);
    await options?.hooks?.onComplete?.(ensembleResult);

    return ensembleResult;
  }

  return {
    config,
    hooks: config.hooks,
    orchestrate,
  };
}

/**
 * Get capabilities description for a worker based on delegation strategy
 */
function getWorkerCapabilities(
  worker: AgentRole,
  delegation: HierarchicalConfig["delegation"]
): string | undefined {
  if (delegation.type === "capability-match" && delegation.capabilities) {
    const caps = delegation.capabilities.get(worker.id);
    return caps?.join(", ");
  }
  return worker.tags?.join(", ");
}
