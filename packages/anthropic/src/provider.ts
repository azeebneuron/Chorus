/**
 * Anthropic Claude provider for Chorus
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ContentBlockParam,
  ToolUseBlock,
  TextBlock,
  Tool as AnthropicTool,
} from "@anthropic-ai/sdk/resources/messages";
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
 * Configuration for the Anthropic provider
 */
export type AnthropicConfig = {
  /** Anthropic API key */
  apiKey: string;
  /** Default model to use (defaults to claude-sonnet-4-20250514) */
  defaultModel?: string;
  /** Base URL for API */
  baseURL?: string;
};

/**
 * Transform Chorus messages to Anthropic message format
 * Anthropic has different requirements:
 * - System messages go in a separate parameter
 * - Tool results are user messages with tool_result content blocks
 * - Assistant tool calls use tool_use content blocks
 */
function toAnthropicMessages(
  messages: Message[]
): { messages: MessageParam[]; system?: string } {
  let system: string | undefined;
  const result: MessageParam[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      // Anthropic uses system as a separate parameter
      system = message.content;
    } else if (message.role === "user") {
      result.push({
        role: "user",
        content: message.content,
      });
    } else if (message.role === "assistant") {
      const assistantMsg = message as AssistantMessage;
      const content: ContentBlockParam[] = [];

      // Add text content if present
      if (assistantMsg.content) {
        content.push({
          type: "text",
          text: assistantMsg.content,
        });
      }

      // Add tool use blocks if present
      if (assistantMsg.toolCalls?.length) {
        for (const toolCall of assistantMsg.toolCalls) {
          content.push({
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.arguments,
          });
        }
      }

      if (content.length > 0) {
        result.push({
          role: "assistant",
          content,
        });
      }
    } else if (message.role === "tool") {
      // Tool results in Anthropic are user messages with tool_result content blocks
      result.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.toolCallId,
            content: message.content,
          },
        ],
      });
    }
  }

  return { messages: result, system };
}

/**
 * Transform Chorus tools to Anthropic tool format
 */
function toAnthropicTools(tools: Tool[]): AnthropicTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as AnthropicTool["input_schema"],
  }));
}

/**
 * Parse Anthropic response content blocks to Chorus format
 */
function parseResponseContent(
  content: (TextBlock | ToolUseBlock)[]
): { textContent: string | null; toolCalls: ToolCall[] } {
  let textContent: string | null = null;
  const toolCalls: ToolCall[] = [];

  for (const block of content) {
    if (block.type === "text") {
      textContent = (textContent ?? "") + block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: block.input as Record<string, unknown>,
      });
    }
  }

  return { textContent, toolCalls };
}

/**
 * Map Anthropic stop reason to Chorus format
 */
function mapStopReason(
  reason: string | null | undefined
): GenerateResponse["finishReason"] {
  switch (reason) {
    case "end_turn":
      return "stop";
    case "tool_use":
      return "tool_calls";
    case "max_tokens":
      return "length";
    default:
      return "stop";
  }
}

/**
 * Create an Anthropic provider
 */
export const createAnthropicProvider: ProviderFactory<AnthropicConfig> = (
  config
) => {
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
  const defaultModel = config.defaultModel ?? "claude-sonnet-4-20250514";

  const generate = async (
    generateConfig: GenerateConfig
  ): Promise<GenerateResponse> => {
    const model = generateConfig.model ?? defaultModel;
    const { messages, system } = toAnthropicMessages(generateConfig.messages);

    // Build request options - Anthropic requires max_tokens
    const requestOptions: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      messages,
      max_tokens: generateConfig.maxTokens ?? 4096,
    };

    // Add optional parameters
    if (system) {
      requestOptions.system = system;
    }
    if (generateConfig.temperature !== undefined) {
      requestOptions.temperature = generateConfig.temperature;
    }
    if (generateConfig.stop?.length) {
      requestOptions.stop_sequences = generateConfig.stop;
    }
    if (generateConfig.tools?.length) {
      requestOptions.tools = toAnthropicTools(generateConfig.tools);
    }

    // Make the API call
    const response = await client.messages.create(requestOptions);

    // Parse the response content
    const { textContent, toolCalls } = parseResponseContent(
      response.content as (TextBlock | ToolUseBlock)[]
    );

    // Build the assistant message
    const message: AssistantMessage = {
      role: "assistant",
      content: textContent,
      ...(toolCalls.length > 0 && { toolCalls }),
    };

    // Determine finish reason
    const finishReason = toolCalls.length
      ? "tool_calls"
      : mapStopReason(response.stop_reason);

    // Extract usage
    const usage = {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    };

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
    const { messages, system } = toAnthropicMessages(generateConfig.messages);

    // Build request options - Anthropic requires max_tokens
    const requestOptions: Anthropic.MessageCreateParamsStreaming = {
      model,
      messages,
      max_tokens: generateConfig.maxTokens ?? 4096,
      stream: true,
    };

    // Add optional parameters
    if (system) {
      requestOptions.system = system;
    }
    if (generateConfig.temperature !== undefined) {
      requestOptions.temperature = generateConfig.temperature;
    }
    if (generateConfig.stop?.length) {
      requestOptions.stop_sequences = generateConfig.stop;
    }
    if (generateConfig.tools?.length) {
      requestOptions.tools = toAnthropicTools(generateConfig.tools);
    }

    // Make the streaming API call
    const stream = client.messages.stream(requestOptions);

    // Track tool calls being built
    const toolCallsMap = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let currentToolIndex = -1;

    // Stream the response
    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          currentToolIndex++;
          toolCallsMap.set(currentToolIndex, {
            id: event.content_block.id,
            name: event.content_block.name,
            arguments: "",
          });
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          yield {
            content: event.delta.text,
            done: false,
          };
        } else if (event.delta.type === "input_json_delta") {
          // Accumulate tool call arguments
          const toolCall = toolCallsMap.get(currentToolIndex);
          if (toolCall) {
            toolCall.arguments += event.delta.partial_json;
          }
        }
      } else if (event.type === "message_stop") {
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
    name: "anthropic",
    generate,
    stream,
  };
};

/**
 * Convenience alias
 */
export const anthropic = createAnthropicProvider;
