/**
 * Google Gemini provider for Chorus
 */

import { GoogleGenAI, type Content, type Part, type Tool as GeminiTool } from "@google/genai";
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
 * Configuration for the Gemini provider
 */
export type GeminiConfig = {
  /** Gemini API key */
  apiKey: string;
  /** Default model to use (defaults to gemini-2.0-flash) */
  defaultModel?: string;
};

/**
 * Transform Chorus messages to Gemini Content format
 */
function toGeminiContents(messages: Message[]): { contents: Content[]; systemInstruction?: string } {
  let systemInstruction: string | undefined;
  const contents: Content[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      // Gemini uses systemInstruction separately
      systemInstruction = message.content;
    } else if (message.role === "user") {
      contents.push({
        role: "user",
        parts: [{ text: message.content }],
      });
    } else if (message.role === "assistant") {
      const assistantMsg = message as AssistantMessage;
      const parts: Part[] = [];

      // Add text content if present
      if (assistantMsg.content) {
        parts.push({ text: assistantMsg.content });
      }

      // Add function calls if present
      if (assistantMsg.toolCalls?.length) {
        for (const toolCall of assistantMsg.toolCalls) {
          parts.push({
            functionCall: {
              name: toolCall.name,
              args: toolCall.arguments,
            },
          });
        }
      }

      if (parts.length > 0) {
        contents.push({
          role: "model",
          parts,
        });
      }
    } else if (message.role === "tool") {
      // Tool responses need to be added as user role with functionResponse
      const parsedResponse = safeJsonParse(message.content);
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: findToolCallName(messages, message.toolCallId),
              response: typeof parsedResponse === "object" && parsedResponse !== null
                ? (parsedResponse as Record<string, unknown>)
                : { result: parsedResponse },
            },
          },
        ],
      });
    }
  }

  return { contents, systemInstruction };
}

/**
 * Find the tool name for a given tool call ID
 */
function findToolCallName(messages: Message[], toolCallId: string): string {
  for (const msg of messages) {
    if (msg.role === "assistant") {
      const assistantMsg = msg as AssistantMessage;
      const toolCall = assistantMsg.toolCalls?.find((tc) => tc.id === toolCallId);
      if (toolCall) {
        return toolCall.name;
      }
    }
  }
  return "unknown";
}

/**
 * Safely parse JSON, returning the original string if parsing fails
 */
function safeJsonParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/**
 * Transform Chorus tools to Gemini function declarations
 */
function toGeminiTools(tools: Tool[]): GeminiTool[] {
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        // Gemini expects parametersJsonSchema instead of parameters for newer SDK
        parametersJsonSchema: tool.parameters as Record<string, unknown>,
      })),
    },
  ];
}

/**
 * Create a Gemini provider
 */
export const createGeminiProvider: ProviderFactory<GeminiConfig> = (config) => {
  const client = new GoogleGenAI({ apiKey: config.apiKey });
  const defaultModel = config.defaultModel ?? "gemini-2.0-flash";

  const generate = async (generateConfig: GenerateConfig): Promise<GenerateResponse> => {
    const model = generateConfig.model ?? defaultModel;
    const { contents, systemInstruction } = toGeminiContents(generateConfig.messages);

    // Build generation config
    const generationConfig: Record<string, unknown> = {};
    if (generateConfig.temperature !== undefined) {
      generationConfig.temperature = generateConfig.temperature;
    }
    if (generateConfig.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = generateConfig.maxTokens;
    }
    if (generateConfig.stop?.length) {
      generationConfig.stopSequences = generateConfig.stop;
    }

    // Build tools config if tools are provided
    const tools = generateConfig.tools?.length
      ? toGeminiTools(generateConfig.tools)
      : undefined;

    // Make the API call
    const response = await client.models.generateContent({
      model,
      contents,
      config: {
        ...generationConfig,
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        tools,
      },
    });

    // Extract the response
    const candidate = response.candidates?.[0];
    if (!candidate?.content) {
      throw new Error("No response content from Gemini");
    }

    // Parse the response parts
    let textContent: string | null = null;
    const toolCalls: ToolCall[] = [];

    for (const part of candidate.content.parts ?? []) {
      if (part.text) {
        textContent = (textContent ?? "") + part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          name: part.functionCall.name ?? "",
          arguments: (part.functionCall.args as Record<string, unknown>) ?? {},
        });
      }
    }

    // Build the assistant message
    const message: AssistantMessage = {
      role: "assistant",
      content: textContent,
      ...(toolCalls.length > 0 && { toolCalls }),
    };

    // Determine finish reason
    let finishReason: GenerateResponse["finishReason"] = "stop";
    if (toolCalls.length > 0) {
      finishReason = "tool_calls";
    } else if (candidate.finishReason === "MAX_TOKENS") {
      finishReason = "length";
    } else if (candidate.finishReason === "SAFETY" || candidate.finishReason === "RECITATION") {
      finishReason = "error";
    }

    // Extract usage if available
    const usage = response.usageMetadata
      ? {
          promptTokens: response.usageMetadata.promptTokenCount ?? 0,
          completionTokens: response.usageMetadata.candidatesTokenCount ?? 0,
          totalTokens: response.usageMetadata.totalTokenCount ?? 0,
        }
      : undefined;

    return {
      message,
      usage,
      finishReason,
    };
  };

  const stream = async function* (generateConfig: GenerateConfig): AsyncIterable<StreamChunk> {
    const model = generateConfig.model ?? defaultModel;
    const { contents, systemInstruction } = toGeminiContents(generateConfig.messages);

    // Build generation config
    const generationConfig: Record<string, unknown> = {};
    if (generateConfig.temperature !== undefined) {
      generationConfig.temperature = generateConfig.temperature;
    }
    if (generateConfig.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = generateConfig.maxTokens;
    }
    if (generateConfig.stop?.length) {
      generationConfig.stopSequences = generateConfig.stop;
    }

    // Build tools config if tools are provided
    const tools = generateConfig.tools?.length
      ? toGeminiTools(generateConfig.tools)
      : undefined;

    // Make the streaming API call
    const response = await client.models.generateContentStream({
      model,
      contents,
      config: {
        ...generationConfig,
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        tools,
      },
    });

    // Stream the response
    for await (const chunk of response) {
      const candidate = chunk.candidates?.[0];
      if (!candidate?.content?.parts) {
        continue;
      }

      for (const part of candidate.content.parts) {
        if (part.text) {
          yield {
            content: part.text,
            done: false,
          };
        }
        if (part.functionCall) {
          yield {
            toolCalls: [
              {
                id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                name: part.functionCall.name ?? "",
                arguments: JSON.stringify(part.functionCall.args ?? {}),
              },
            ],
            done: false,
          };
        }
      }
    }

    // Final chunk
    yield { done: true };
  };

  return {
    name: "gemini",
    generate,
    stream,
  };
};

/**
 * Convenience alias
 */
export const gemini = createGeminiProvider;
