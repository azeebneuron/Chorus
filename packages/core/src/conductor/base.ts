/**
 * Base utilities for conductor implementations
 */

import type {
  AgentId,
  AgentRole,
  AgentResult,
  EnsembleResult,
  ExecutionTrace,
  SharedContext,
  ConductorHooks,
} from "../types/index.js";
import { createContext } from "../context.js";

/**
 * Generate a unique trace ID
 */
export function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create an initial execution trace
 */
export function createTrace(): ExecutionTrace {
  return {
    id: generateTraceId(),
    startTime: Date.now(),
    steps: [],
  };
}

/**
 * Run a single agent with input
 */
export async function runAgent(
  agentRole: AgentRole,
  input: string,
  options: {
    context: SharedContext;
    signal?: AbortSignal;
    hooks?: ConductorHooks;
    trace: ExecutionTrace;
  }
): Promise<AgentResult> {
  const { context, signal, hooks, trace } = options;
  const stepIndex = trace.steps.length;

  // Record step start
  trace.steps.push({
    index: stepIndex,
    agentId: agentRole.id,
    input,
    timestamp: Date.now(),
  });

  // Before agent hook
  await hooks?.onBeforeAgent?.(agentRole.id, input);

  try {
    // Run the agent
    const result = await agentRole.agent.run(input, { signal });

    // Record step completion
    const step = trace.steps[stepIndex]!;
    step.output = result;
    step.duration = Date.now() - step.timestamp;

    // Add message to context for other agents to see
    context.addMessage(
      {
        role: "assistant",
        content: result.response,
      },
      agentRole.id
    );

    // After agent hook
    await hooks?.onAfterAgent?.(agentRole.id, result);

    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    // Record error in trace
    const step = trace.steps[stepIndex]!;
    step.error = err;
    step.duration = Date.now() - step.timestamp;

    // Error hook
    await hooks?.onAgentError?.(agentRole.id, err);

    throw err;
  }
}

/**
 * Calculate total usage from agent results
 */
export function calculateTotalUsage(
  results: Map<AgentId, AgentResult>
): EnsembleResult["usage"] {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  for (const result of results.values()) {
    if (result.usage) {
      promptTokens += result.usage.promptTokens;
      completionTokens += result.usage.completionTokens;
      totalTokens += result.usage.totalTokens;
    }
  }

  return { promptTokens, completionTokens, totalTokens };
}

/**
 * Create an ensemble result from orchestration data
 */
export function createEnsembleResult(
  response: string,
  agentResults: Map<AgentId, AgentResult>,
  trace: ExecutionTrace
): EnsembleResult {
  trace.endTime = Date.now();

  return {
    response,
    agentResults,
    trace,
    usage: calculateTotalUsage(agentResults),
  };
}

/**
 * Check if abort signal is triggered
 */
export function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Orchestration aborted");
  }
}

/**
 * Get agent by ID from list
 */
export function findAgent(
  agents: AgentRole[],
  id: AgentId
): AgentRole | undefined {
  return agents.find((a) => a.id === id);
}

/**
 * Get agent by ID, throwing if not found
 */
export function requireAgent(agents: AgentRole[], id: AgentId): AgentRole {
  const agent = findAgent(agents, id);
  if (!agent) {
    throw new Error(`Agent '${id}' not found in ensemble`);
  }
  return agent;
}
