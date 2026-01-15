/**
 * Trace collector - Hook-based execution trace collection
 */

import type {
  AgentHooks,
  ConductorHooks,
  EnsembleHooks,
  AgentResult,
  ExecutionTrace,
  ExecutionStep,
  AgentId,
  Message,
} from "@chorus/core";

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type TraceEvent =
  | { type: "start"; input: string; timestamp: number }
  | { type: "step:start"; step: ExecutionStep }
  | { type: "step:complete"; step: ExecutionStep }
  | { type: "step:error"; step: ExecutionStep; error: Error }
  | { type: "tool:call"; agentId: AgentId; tool: string; args: unknown }
  | { type: "tool:result"; agentId: AgentId; tool: string; result: unknown }
  | { type: "complete"; trace: ExecutionTrace };

export type TraceEventHandler = (event: TraceEvent) => void;

export type TraceCollector = {
  getAgentHooks: (agentId: AgentId) => AgentHooks;
  getConductorHooks: () => ConductorHooks;
  getEnsembleHooks: () => EnsembleHooks;
  getTrace: () => ExecutionTrace;
  getUsage: () => Map<AgentId, TokenUsage>;
  getTotalUsage: () => TokenUsage;
  on: (handler: TraceEventHandler) => void;
  off: (handler: TraceEventHandler) => void;
  reset: () => void;
};

/**
 * Generate a unique trace ID
 */
function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create a trace collector for capturing execution data
 */
export function createTraceCollector(): TraceCollector {
  let trace: ExecutionTrace = {
    id: generateTraceId(),
    startTime: Date.now(),
    steps: [],
  };

  const usage = new Map<AgentId, TokenUsage>();
  const handlers = new Set<TraceEventHandler>();

  function emit(event: TraceEvent) {
    for (const handler of handlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  function updateUsage(agentId: AgentId, result: AgentResult) {
    if (!result.usage) return;

    const existing = usage.get(agentId) ?? {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    usage.set(agentId, {
      promptTokens: existing.promptTokens + result.usage.promptTokens,
      completionTokens: existing.completionTokens + result.usage.completionTokens,
      totalTokens: existing.totalTokens + result.usage.totalTokens,
    });
  }

  function getAgentHooks(agentId: AgentId): AgentHooks {
    return {
      onBeforeToolCall: async (_ctx, toolName, args) => {
        emit({ type: "tool:call", agentId, tool: toolName, args });
      },
      onAfterToolCall: async (_ctx, toolName, result) => {
        emit({ type: "tool:result", agentId, tool: toolName, result });
      },
    };
  }

  function getConductorHooks(): ConductorHooks {
    return {
      onStart: async (input, _agents) => {
        trace.startTime = Date.now();
        emit({ type: "start", input, timestamp: trace.startTime });
      },

      onBeforeAgent: async (agentId, input) => {
        const step: ExecutionStep = {
          index: trace.steps.length,
          agentId,
          input,
          timestamp: Date.now(),
        };
        trace.steps.push(step);
        emit({ type: "step:start", step });
      },

      onAfterAgent: async (agentId, result) => {
        const step = trace.steps.find(
          (s) => s.agentId === agentId && !s.output && !s.error
        );
        if (step) {
          step.output = result;
          step.duration = Date.now() - step.timestamp;
          updateUsage(agentId, result);
          emit({ type: "step:complete", step });
        }
      },

      onAgentError: async (agentId, error) => {
        const step = trace.steps.find(
          (s) => s.agentId === agentId && !s.output && !s.error
        );
        if (step) {
          step.error = error;
          step.duration = Date.now() - step.timestamp;
          emit({ type: "step:error", step, error });
        }
      },

      onComplete: async (_result) => {
        trace.endTime = Date.now();
        emit({ type: "complete", trace });
      },
    };
  }

  function getEnsembleHooks(): EnsembleHooks {
    return {
      onStart: async (_input) => {
        trace.startTime = Date.now();
      },
      onComplete: async (_result) => {
        trace.endTime = Date.now();
        emit({ type: "complete", trace });
      },
      onError: async (_error) => {
        trace.endTime = Date.now();
      },
    };
  }

  function getTotalUsage(): TokenUsage {
    const total: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    for (const u of usage.values()) {
      total.promptTokens += u.promptTokens;
      total.completionTokens += u.completionTokens;
      total.totalTokens += u.totalTokens;
    }

    return total;
  }

  function reset() {
    trace = {
      id: generateTraceId(),
      startTime: Date.now(),
      steps: [],
    };
    usage.clear();
  }

  return {
    getAgentHooks,
    getConductorHooks,
    getEnsembleHooks,
    getTrace: () => trace,
    getUsage: () => usage,
    getTotalUsage,
    on: (handler) => handlers.add(handler),
    off: (handler) => handlers.delete(handler),
    reset,
  };
}
