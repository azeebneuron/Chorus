/**
 * Sequential orchestration strategy
 *
 * Agents run one after another: A -> B -> C
 * Output of each agent is passed to the next
 */

import type {
  AgentId,
  AgentRole,
  AgentResult,
  Conductor,
  ConductorRunOptions,
  EnsembleResult,
  SequentialConfig,
} from "../../types/index.js";
import { createContext } from "../../context.js";
import {
  createTrace,
  runAgent,
  createEnsembleResult,
  checkAbort,
  requireAgent,
} from "../base.js";

/**
 * Create a sequential conductor
 */
export function createSequentialConductor(
  config: SequentialConfig
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

    // Determine execution order
    const order = config.order ?? agents.map((a) => a.id);

    let currentInput = input;

    for (const agentId of order) {
      // Check for cancellation
      checkAbort(options?.signal);

      // Find the agent
      const agentRole = requireAgent(agents, agentId);

      // Transform input if transformer is provided
      if (config.transform && agentResults.size > 0) {
        currentInput = config.transform(currentInput, agentRole);
      }

      // Run the agent
      const result = await runAgent(agentRole, currentInput, {
        context,
        signal: options?.signal,
        hooks: options?.hooks,
        trace,
      });

      // Store result
      agentResults.set(agentId, result);

      // Use this agent's output as input for the next
      currentInput = result.response;
    }

    // Final response is the last agent's output
    const finalResponse = currentInput;

    const ensembleResult = createEnsembleResult(
      finalResponse,
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
