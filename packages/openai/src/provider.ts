/**
 * OpenAI provider for Chorus
 */

import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import type {
  Provider,
  ProviderFactory,
  GenerateConfig,
  GenerateResponse,
  StreamChunk,
  Message,
  AssistantMessage,
  Tool,
  ToolCall,
} from "@chorus/core";

/**
 * Configuration for the OpenAI provider
 */
export type OpenAIConfig = {
  /** OpenAI API key */
  apiKey: string;
  /** Default model to use (defaults to gpt-4o) */
  defaultModel?: string;
  /** Base URL for API (for Azure or compatible APIs) */
  baseURL?: string;
  /** Organization ID */
  organization?: string;
};

/**
 * Transform Chorus messages to OpenAI chat completion format
 */
function toOpenAIMessages(messages: Message[]): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      result.push({
        role: "system",
        content: message.content,
      });
    } else if (message.role === "user") {
      result.push({
        role: "user",
        content: message.content,
      });
    } else if (message.role === "assistant") {
      const assistantMsg = message as AssistantMessage;
      const openaiMsg: ChatCompletionMessageParam = {
        role: "assistant",
        content: assistantMsg.content,
      };

      // Add tool calls if present
      if (assistantMsg.toolCalls?.length) {
        openaiMsg.tool_calls = assistantMsg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }));
      }

      result.push(openaiMsg);
    } else if (message.role === "tool") {
      result.push({
        role: "tool",
        tool_call_id: message.toolCallId,
        content: message.content,
      });
    }
  }

  return result;
}

/**
 * Transform Chorus tools to OpenAI tool format
 */
function toOpenAITools(tools: Tool[]): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
    },
  }));
}

/**
 * Parse OpenAI tool calls to Chorus format
 */
function parseToolCalls(toolCalls: ChatCompletionMessageToolCall[]): ToolCall[] {
  return toolCalls.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: safeJsonParse(tc.function.arguments),
  }));
}

/**
 * Safely parse JSON, returning empty object if parsing fails
 */
function safeJsonParse(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Map OpenAI finish reason to Chorus format
 */
function mapFinishReason(
  reason: string | null | undefined
): GenerateResponse["finishReason"] {
  switch (reason) {
    case "stop":
      return "stop";
    case "tool_calls":
      return "tool_calls";
    case "length":
      return "length";
    case "content_filter":
      return "error";
    default:
      return "stop";
  }
}

/**
 * Create an OpenAI provider
 */
export const createOpenAIProvider: ProviderFactory<OpenAIConfig> = (config) => {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    organization: config.organization,
  });
  const defaultModel = config.defaultModel ?? "gpt-4o";

  const generate = async (
    generateConfig: GenerateConfig
  ): Promise<GenerateResponse> => {
    const model = generateConfig.model ?? defaultModel;
    const messages = toOpenAIMessages(generateConfig.messages);

    // Build request options
    const requestOptions: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages,
    };

    // Add optional parameters
    if (generateConfig.temperature !== undefined) {
      requestOptions.temperature = generateConfig.temperature;
    }
    if (generateConfig.maxTokens !== undefined) {
      requestOptions.max_tokens = generateConfig.maxTokens;
    }
    if (generateConfig.stop?.length) {
      requestOptions.stop = generateConfig.stop;
    }
    if (generateConfig.tools?.length) {
      requestOptions.tools = toOpenAITools(generateConfig.tools);
    }

    // Make the API call
    const response = await client.chat.completions.create(requestOptions);

    // Extract the response
    const choice = response.choices[0];
    if (!choice?.message) {
      throw new Error("No response message from OpenAI");
    }

    // Parse tool calls if present
    const toolCalls = choice.message.tool_calls?.length
      ? parseToolCalls(choice.message.tool_calls)
      : undefined;

    // Build the assistant message
    const message: AssistantMessage = {
      role: "assistant",
      content: choice.message.content,
      ...(toolCalls && { toolCalls }),
    };

    // Determine finish reason
    const finishReason = toolCalls?.length
      ? "tool_calls"
      : mapFinishReason(choice.finish_reason);

    // Extract usage if available
    const usage = response.usage
      ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        }
      : undefined;

    return {
      message,
      usage,
      finishReason,
    };
  };

  const stream = async function* (
    generateConfig: GenerateConfig
  ): AsyncIterable<StreamChunk> {
    const model = generateConfig.model ?? defaultModel;
    const messages = toOpenAIMessages(generateConfig.messages);

    // Build request options
    const requestOptions: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model,
      messages,
      stream: true,
    };

    // Add optional parameters
    if (generateConfig.temperature !== undefined) {
      requestOptions.temperature = generateConfig.temperature;
    }
    if (generateConfig.maxTokens !== undefined) {
      requestOptions.max_tokens = generateConfig.maxTokens;
    }
    if (generateConfig.stop?.length) {
      requestOptions.stop = generateConfig.stop;
    }
    if (generateConfig.tools?.length) {
      requestOptions.tools = toOpenAITools(generateConfig.tools);
    }

    // Make the streaming API call
    const stream = await client.chat.completions.create(requestOptions);

    // Track tool calls across chunks
    const toolCallsMap = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    // Stream the response
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Handle text content
      if (delta.content) {
        yield {
          content: delta.content,
          done: false,
        };
      }

      // Handle tool calls
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCallsMap.get(tc.index);
          if (existing) {
            // Append to existing tool call
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
            }
          } else {
            // New tool call
            toolCallsMap.set(tc.index, {
              id: tc.id ?? `call_${Date.now()}_${tc.index}`,
              name: tc.function?.name ?? "",
              arguments: tc.function?.arguments ?? "",
            });
          }
        }
      }

      // Check if done
      if (chunk.choices[0]?.finish_reason) {
        // Emit complete tool calls if any
        if (toolCallsMap.size > 0) {
          const toolCalls = Array.from(toolCallsMap.values());
          yield {
            toolCalls,
            done: false,
          };
        }
        yield { done: true };
        return;
      }
    }

    // Final chunk if not already emitted
    yield { done: true };
  };

  return {
    name: "openai",
    generate,
    stream,
  };
};

/**
 * Convenience alias
 */
export const openai = createOpenAIProvider;
