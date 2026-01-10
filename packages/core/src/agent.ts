/**
 * Agent implementation
 */

import type {
  Agent,
  AgentConfig,
  AgentContext,
  AgentHooks,
  AgentResult,
  AgentState,
  Message,
  AssistantMessage,
  ToolMessage,
  ToolCall,
} from "./types/index.js";

const DEFAULT_MAX_ITERATIONS = 10;

/**
 * Create an agent with the given configuration
 */
export function createAgent(
  config: AgentConfig,
  hooks?: AgentHooks
): Agent {
  const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  async function run(
    input: string,
    options?: { signal?: AbortSignal }
  ): Promise<AgentResult> {
    const state: AgentState = {
      messages: [
        { role: "system", content: config.systemPrompt },
        { role: "user", content: input },
      ],
      iteration: 0,
      done: false,
    };

    const ctx: AgentContext = {
      config,
      state,
      signal: options?.signal,
    };

    let totalUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    while (!state.done && state.iteration < maxIterations) {
      // Check for cancellation
      if (options?.signal?.aborted) {
        throw new Error("Agent execution aborted");
      }

      state.iteration++;

      // Before generate hook
      await hooks?.onBeforeGenerate?.(ctx);

      try {
        // Generate response from LLM
        const response = await config.provider.generate({
          messages: state.messages,
          tools: config.tools,
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        });

        // Track usage
        if (response.usage) {
          totalUsage.promptTokens += response.usage.promptTokens;
          totalUsage.completionTokens += response.usage.completionTokens;
          totalUsage.totalTokens += response.usage.totalTokens;
        }

        // Add assistant message to history
        state.messages.push(response.message);

        // After generate hook
        await hooks?.onAfterGenerate?.(ctx, response.message);

        // Check if we need to handle tool calls
        if (response.finishReason === "tool_calls") {
          const assistantMessage = response.message as AssistantMessage;
          const toolCalls = assistantMessage.toolCalls ?? [];

          // Execute each tool call
          for (const toolCall of toolCalls) {
            const toolResult = await executeToolCall(ctx, toolCall, hooks);
            state.messages.push(toolResult);
          }
        } else {
          // No tool calls, we're done
          state.done = true;
        }
      } catch (error) {
        state.error = error instanceof Error ? error : new Error(String(error));
        await hooks?.onError?.(ctx, state.error);
        throw state.error;
      }
    }

    // Get the final response
    const lastMessage = state.messages[state.messages.length - 1];
    const response =
      lastMessage?.role === "assistant"
        ? (lastMessage as AssistantMessage).content ?? ""
        : "";

    return {
      response,
      messages: state.messages,
      iterations: state.iteration,
      usage: totalUsage,
    };
  }

  return {
    config,
    hooks,
    run,
  };
}

/**
 * Execute a single tool call
 */
async function executeToolCall(
  ctx: AgentContext,
  toolCall: ToolCall,
  hooks?: AgentHooks
): Promise<ToolMessage> {
  const tool = ctx.config.tools?.find((t) => t.name === toolCall.name);

  if (!tool) {
    return {
      role: "tool",
      toolCallId: toolCall.id,
      content: JSON.stringify({ error: `Tool '${toolCall.name}' not found` }),
    };
  }

  try {
    // Before tool call hook
    await hooks?.onBeforeToolCall?.(ctx, toolCall.name, toolCall.arguments);

    // Execute the tool
    const result = await tool.execute(toolCall.arguments);

    // After tool call hook
    await hooks?.onAfterToolCall?.(ctx, toolCall.name, result);

    return {
      role: "tool",
      toolCallId: toolCall.id,
      content: typeof result === "string" ? result : JSON.stringify(result),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      role: "tool",
      toolCallId: toolCall.id,
      content: JSON.stringify({ error: errorMessage }),
    };
  }
}

/**
 * Builder pattern for creating agents
 */
export class AgentBuilder {
  private config: Partial<AgentConfig> = {};
  private agentHooks: AgentHooks = {};

  name(name: string): this {
    this.config.name = name;
    return this;
  }

  description(description: string): this {
    this.config.description = description;
    return this;
  }

  systemPrompt(prompt: string): this {
    this.config.systemPrompt = prompt;
    return this;
  }

  provider(provider: AgentConfig["provider"]): this {
    this.config.provider = provider;
    return this;
  }

  model(model: string): this {
    this.config.model = model;
    return this;
  }

  tools(tools: AgentConfig["tools"]): this {
    this.config.tools = tools;
    return this;
  }

  temperature(temp: number): this {
    this.config.temperature = temp;
    return this;
  }

  maxTokens(tokens: number): this {
    this.config.maxTokens = tokens;
    return this;
  }

  maxIterations(iterations: number): this {
    this.config.maxIterations = iterations;
    return this;
  }

  onBeforeGenerate(hook: AgentHooks["onBeforeGenerate"]): this {
    this.agentHooks.onBeforeGenerate = hook;
    return this;
  }

  onAfterGenerate(hook: AgentHooks["onAfterGenerate"]): this {
    this.agentHooks.onAfterGenerate = hook;
    return this;
  }

  onBeforeToolCall(hook: AgentHooks["onBeforeToolCall"]): this {
    this.agentHooks.onBeforeToolCall = hook;
    return this;
  }

  onAfterToolCall(hook: AgentHooks["onAfterToolCall"]): this {
    this.agentHooks.onAfterToolCall = hook;
    return this;
  }

  onError(hook: AgentHooks["onError"]): this {
    this.agentHooks.onError = hook;
    return this;
  }

  build(): Agent {
    if (!this.config.name) {
      throw new Error("Agent name is required");
    }
    if (!this.config.systemPrompt) {
      throw new Error("System prompt is required");
    }
    if (!this.config.provider) {
      throw new Error("Provider is required");
    }

    return createAgent(this.config as AgentConfig, this.agentHooks);
  }
}

/**
 * Start building an agent
 */
export function agent(): AgentBuilder {
  return new AgentBuilder();
}
