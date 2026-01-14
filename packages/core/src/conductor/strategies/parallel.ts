/**
 * Parallel orchestration strategy
 *
 * Agents run concurrently: A, B, C -> merge results
 */

import type {
  AgentId,
  AgentRole,
  AgentResult,
  Conductor,
  ConductorRunOptions,
  EnsembleResult,
  ParallelConfig,
} from "../../types/index.js";
import { createContext } from "../../context.js";
import {
  createTrace,
  runAgent,
  createEnsembleResult,
  checkAbort,
  findAgent,
} from "../base.js";

/**
 * Limit concurrency for parallel execution
 */
async function runWithConcurrencyLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const promise = fn(item).then(() => {
      executing.splice(executing.indexOf(promise), 1);
    });
    executing.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
}

/**
 * Create a parallel conductor
 */
export function createParallelConductor(config: ParallelConfig): Conductor {
  async function orchestrate(
    input: string,
    agents: AgentRole[],
    options?: ConductorRunOptions
  ): Promise<EnsembleResult> {
    const context = options?.context ?? createContext();
    const trace = createTrace();
    const agentResults = new Map<AgentId, AgentResult>();
    const errors: Error[] = [];

    // Call onStart hook
    await config.hooks?.onStart?.(input, agents);
    await options?.hooks?.onStart?.(input, agents);

    // Determine which agents to run
    const agentIds = config.agents ?? agents.map((a) => a.id);
    const agentsToRun = agentIds
      .map((id) => findAgent(agents, id))
      .filter((a): a is AgentRole => a !== undefined);

    const concurrency = config.concurrency ?? agentsToRun.length;

    // Run agents in parallel with concurrency limit
    await runWithConcurrencyLimit(agentsToRun, concurrency, async (agentRole) => {
      // Check for cancellation
      checkAbort(options?.signal);

      try {
        const result = await runAgent(agentRole, input, {
          context,
          signal: options?.signal,
          hooks: options?.hooks,
          trace,
        });

        agentResults.set(agentRole.id, result);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push(err);

        // Handle based on error mode
        if (config.errorMode === "fail-fast") {
          throw err;
        }
        // continue mode - keep going
      }
    });

    // Check if we should fail after all agents ran
    if (
      errors.length > 0 &&
      config.errorMode !== "continue" &&
      agentResults.size === 0
    ) {
      throw errors[0];
    }

    // Merge results based on merger configuration
    const finalResponse = await mergeResults(
      agentResults,
      config.merger,
      agents
    );

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

/**
 * Merge results from parallel execution
 */
async function mergeResults(
  results: Map<AgentId, AgentResult>,
  merger: ParallelConfig["merger"],
  agents: AgentRole[]
): Promise<string> {
  if (results.size === 0) {
    return "";
  }

  switch (merger.type) {
    case "concatenate": {
      const separator = merger.separator ?? "\n\n---\n\n";
      const outputs: string[] = [];
      for (const [agentId, result] of results) {
        const agent = findAgent(agents, agentId);
        const label = agent?.role ?? agentId;
        outputs.push(`[${label}]\n${result.response}`);
      }
      return outputs.join(separator);
    }

    case "summarize": {
      if (!merger.summarizer) {
        throw new Error("Summarizer agent required for summarize merger");
      }

      // Prepare input for summarizer
      const summaryInput = Array.from(results.entries())
        .map(([id, result]) => {
          const agent = findAgent(agents, id);
          return `[${agent?.role ?? id}]: ${result.response}`;
        })
        .join("\n\n");

      const prompt = `Summarize and synthesize the following agent responses:\n\n${summaryInput}`;
      const summaryResult = await merger.summarizer.run(prompt);
      return summaryResult.response;
    }

    case "select-best": {
      if (!merger.selector) {
        throw new Error("Selector function required for select-best merger");
      }

      const resultsArray = Array.from(results.values());
      const best = merger.selector(resultsArray);
      return best.response;
    }

    case "custom": {
      if (!merger.merge) {
        throw new Error("Merge function required for custom merger");
      }
      return merger.merge(results);
    }

    default:
      throw new Error(`Unknown merger type: ${(merger as { type: string }).type}`);
  }
}
