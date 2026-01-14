/**
 * Handoff protocol implementation for agent-to-agent transfers
 */

import type {
  AgentId,
  HandoffRequest,
  HandoffResponse,
  HandoffHandler,
  HandoffToolConfig,
  HandoffRegistry,
  Tool,
  JsonSchema,
} from "./types/index.js";
import { defineTool } from "./types/tool.js";

/**
 * Handoff tool parameters
 */
type HandoffParams = {
  target_agent: string;
  task: string;
  reason: string;
  context?: Record<string, unknown>;
  priority?: "low" | "normal" | "high" | "urgent";
};

/**
 * Create a handoff registry for managing agent-to-agent transfers
 */
export function createHandoffRegistry(): HandoffRegistry {
  const handlers = new Map<AgentId, HandoffHandler>();

  return {
    register(agentId: AgentId, handler: HandoffHandler): void {
      handlers.set(agentId, handler);
    },

    unregister(agentId: AgentId): void {
      handlers.delete(agentId);
    },

    getHandler(agentId: AgentId): HandoffHandler | undefined {
      return handlers.get(agentId);
    },

    listTargets(): AgentId[] {
      return Array.from(handlers.keys());
    },

    hasTarget(agentId: AgentId): boolean {
      return handlers.has(agentId);
    },
  };
}

/**
 * Create a handoff tool for an agent
 *
 * This tool allows an agent to hand off tasks to other agents in an ensemble.
 */
export function createHandoffTool(config: HandoffToolConfig): Tool<HandoffParams, string> {
  const { targets, handler } = config;

  const targetDescriptions = targets.join(", ");

  const parameters: JsonSchema = {
    type: "object",
    properties: {
      target_agent: {
        type: "string",
        description: `The ID of the agent to hand off to. Must be one of: ${targetDescriptions}`,
      },
      task: {
        type: "string",
        description: "The task or question to pass to the target agent",
      },
      reason: {
        type: "string",
        description: "Why you are handing off to this agent",
      },
      context: {
        type: "object",
        description: "Additional context to pass to the target agent",
        additionalProperties: true,
      },
      priority: {
        type: "string",
        enum: ["low", "normal", "high", "urgent"],
        description: "Priority level of the handoff",
      },
    },
    required: ["target_agent", "task", "reason"],
  };

  return defineTool<HandoffParams, string>({
    name: "handoff",
    description: `Transfer the current task to another agent. Available agents: ${targetDescriptions}. Use this when the task is better suited for another agent's expertise.`,
    parameters,
    execute: async (args: HandoffParams) => {
      const { target_agent, task, reason, context, priority } = args;

      // Validate target
      if (!targets.includes(target_agent)) {
        return JSON.stringify({
          success: false,
          error: `Invalid target agent '${target_agent}'. Valid targets: ${targetDescriptions}`,
        });
      }

      // Create handoff request
      const request: HandoffRequest = {
        fromAgent: "current", // Will be filled in by the orchestrator
        toAgent: target_agent,
        reason,
        task,
        context,
        priority,
      };

      try {
        const response = await handler(request);

        if (response.accepted) {
          return JSON.stringify({
            success: true,
            agent: target_agent,
            result: response.result,
            data: response.data,
          });
        } else {
          return JSON.stringify({
            success: false,
            rejected: true,
            reason: response.rejectionReason ?? "Handoff rejected",
          });
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        return JSON.stringify({
          success: false,
          error: err.message,
        });
      }
    },
  });
}

/**
 * Create a simple handoff handler that runs the target agent
 */
export function createSimpleHandoffHandler(
  getAgent: (agentId: AgentId) => { run: (input: string) => Promise<{ response: string }> } | undefined
): HandoffHandler {
  return async (request: HandoffRequest): Promise<HandoffResponse> => {
    const agent = getAgent(request.toAgent);

    if (!agent) {
      return {
        accepted: false,
        rejectionReason: `Agent '${request.toAgent}' not found`,
      };
    }

    try {
      // Build prompt with context
      let prompt = request.task;

      if (request.context && Object.keys(request.context).length > 0) {
        prompt = `Context: ${JSON.stringify(request.context)}\n\nTask: ${request.task}`;
      }

      const result = await agent.run(prompt);

      return {
        accepted: true,
        result: result.response,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        accepted: false,
        rejectionReason: err.message,
      };
    }
  };
}

/**
 * Create a handoff handler with validation and transformation
 */
export function createAdvancedHandoffHandler(options: {
  getAgent: (agentId: AgentId) => { run: (input: string) => Promise<{ response: string }> } | undefined;
  validate?: (request: HandoffRequest) => boolean | string;
  transformInput?: (request: HandoffRequest) => string;
  transformOutput?: (response: string, request: HandoffRequest) => HandoffResponse;
  onHandoff?: (request: HandoffRequest) => void | Promise<void>;
  onComplete?: (request: HandoffRequest, response: HandoffResponse) => void | Promise<void>;
}): HandoffHandler {
  const {
    getAgent,
    validate,
    transformInput,
    transformOutput,
    onHandoff,
    onComplete,
  } = options;

  return async (request: HandoffRequest): Promise<HandoffResponse> => {
    // Validate if validator provided
    if (validate) {
      const validationResult = validate(request);
      if (validationResult !== true) {
        return {
          accepted: false,
          rejectionReason:
            typeof validationResult === "string"
              ? validationResult
              : "Validation failed",
        };
      }
    }

    const agent = getAgent(request.toAgent);

    if (!agent) {
      return {
        accepted: false,
        rejectionReason: `Agent '${request.toAgent}' not found`,
      };
    }

    // Call onHandoff hook
    await onHandoff?.(request);

    try {
      // Transform input if transformer provided
      const prompt = transformInput
        ? transformInput(request)
        : buildDefaultPrompt(request);

      const result = await agent.run(prompt);

      // Transform output if transformer provided
      const response = transformOutput
        ? transformOutput(result.response, request)
        : { accepted: true, result: result.response };

      // Call onComplete hook
      await onComplete?.(request, response);

      return response;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const errorResponse: HandoffResponse = {
        accepted: false,
        rejectionReason: err.message,
      };

      await onComplete?.(request, errorResponse);

      return errorResponse;
    }
  };
}

/**
 * Build default prompt from handoff request
 */
function buildDefaultPrompt(request: HandoffRequest): string {
  const parts: string[] = [];

  if (request.priority && request.priority !== "normal") {
    parts.push(`[Priority: ${request.priority.toUpperCase()}]`);
  }

  if (request.context && Object.keys(request.context).length > 0) {
    parts.push(`Context:\n${JSON.stringify(request.context, null, 2)}`);
  }

  if (request.history && request.history.length > 0) {
    const historyText = request.history
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n");
    parts.push(`Conversation History:\n${historyText}`);
  }

  parts.push(`Task from ${request.fromAgent}: ${request.task}`);
  parts.push(`Reason for handoff: ${request.reason}`);

  return parts.join("\n\n");
}

/**
 * Utility to create a handoff chain - multiple agents in sequence
 */
export function createHandoffChain(
  agents: Array<{
    id: AgentId;
    agent: { run: (input: string) => Promise<{ response: string }> };
    shouldHandoff?: (response: string) => AgentId | null;
  }>
): (input: string) => Promise<{ response: string; handoffs: AgentId[] }> {
  return async (input: string) => {
    const handoffs: AgentId[] = [];
    let currentInput = input;
    let currentAgentIndex = 0;

    while (currentAgentIndex < agents.length) {
      const currentAgent = agents[currentAgentIndex]!;
      const { id, agent, shouldHandoff } = currentAgent;
      handoffs.push(id);

      const result = await agent.run(currentInput);

      // Check if we should handoff
      if (shouldHandoff) {
        const nextAgentId = shouldHandoff(result.response);
        if (nextAgentId) {
          const nextIndex = agents.findIndex((a) => a.id === nextAgentId);
          if (nextIndex >= 0) {
            currentAgentIndex = nextIndex;
            currentInput = result.response;
            continue;
          }
        }
      }

      // No handoff, we're done
      return { response: result.response, handoffs };
    }

    // Should not reach here
    return { response: currentInput, handoffs };
  };
}
