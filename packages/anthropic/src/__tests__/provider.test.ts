import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Message, Tool } from "@chorus/core";

// Mock the Anthropic SDK
const mockCreate = vi.fn();
const mockStream = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: function Anthropic() {
      return {
        messages: {
          create: mockCreate,
          stream: mockStream,
        },
      };
    },
  };
});

// Import after mocking
import { createAnthropicProvider, anthropic } from "../provider.js";

describe("Anthropic Provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createAnthropicProvider", () => {
    it("should create a provider with name 'anthropic'", () => {
      const provider = createAnthropicProvider({ apiKey: "test-key" });
      expect(provider.name).toBe("anthropic");
    });

    it("should export anthropic as an alias", () => {
      expect(anthropic).toBe(createAnthropicProvider);
    });
  });

  describe("generate", () => {
    it("should use default model claude-sonnet-4-20250514 when not specified", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "Hello!" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const provider = createAnthropicProvider({ apiKey: "test-key" });
      await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-sonnet-4-20250514",
        })
      );
    });

    it("should use custom model when specified in config", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "Hello!" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const provider = createAnthropicProvider({
        apiKey: "test-key",
        defaultModel: "claude-3-opus-20240229",
      });
      await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-3-opus-20240229",
        })
      );
    });

    it("should use model from generate config over default", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "Hello!" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const provider = createAnthropicProvider({
        apiKey: "test-key",
        defaultModel: "claude-3-opus-20240229",
      });
      await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
        model: "claude-3-haiku-20240307",
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-3-haiku-20240307",
        })
      );
    });

    it("should always include max_tokens (defaults to 4096)", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "Hello!" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const provider = createAnthropicProvider({ apiKey: "test-key" });
      await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 4096,
        })
      );
    });

    it("should use custom max_tokens when provided", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "Hello!" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const provider = createAnthropicProvider({ apiKey: "test-key" });
      await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
        maxTokens: 1000,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 1000,
        })
      );
    });

    it("should extract system message to separate parameter", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "I am helpful" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const provider = createAnthropicProvider({ apiKey: "test-key" });
      await provider.generate({
        messages: [
          { role: "system", content: "You are a helpful assistant" },
          { role: "user", content: "Hi" },
        ],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: "You are a helpful assistant",
          messages: [{ role: "user", content: "Hi" }],
        })
      );
    });

    it("should transform assistant messages with tool calls to content blocks", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "Done" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const messages: Message[] = [
        { role: "user", content: "Get the weather" },
        {
          role: "assistant",
          content: "Let me check",
          toolCalls: [
            {
              id: "toolu_123",
              name: "get_weather",
              arguments: { location: "NYC" },
            },
          ],
        },
        {
          role: "tool",
          toolCallId: "toolu_123",
          content: '{"temp": 72}',
        },
      ];

      const provider = createAnthropicProvider({ apiKey: "test-key" });
      await provider.generate({ messages });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: "user", content: "Get the weather" },
            {
              role: "assistant",
              content: [
                { type: "text", text: "Let me check" },
                {
                  type: "tool_use",
                  id: "toolu_123",
                  name: "get_weather",
                  input: { location: "NYC" },
                },
              ],
            },
            {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: "toolu_123",
                  content: '{"temp": 72}',
                },
              ],
            },
          ],
        })
      );
    });

    it("should transform tools to Anthropic format", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "Hello!" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const tools: Tool[] = [
        {
          name: "get_weather",
          description: "Get current weather",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string" },
            },
            required: ["location"],
          },
          execute: async () => ({ temp: 72 }),
        },
      ];

      const provider = createAnthropicProvider({ apiKey: "test-key" });
      await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
        tools,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            {
              name: "get_weather",
              description: "Get current weather",
              input_schema: {
                type: "object",
                properties: {
                  location: { type: "string" },
                },
                required: ["location"],
              },
            },
          ],
        })
      );
    });

    it("should pass generation config options", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "Hello!" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const provider = createAnthropicProvider({ apiKey: "test-key" });
      await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
        temperature: 0.7,
        maxTokens: 100,
        stop: ["END"],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
          max_tokens: 100,
          stop_sequences: ["END"],
        })
      );
    });

    it("should parse tool_use blocks from response", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: "tool_use",
            id: "toolu_abc123",
            name: "get_weather",
            input: { location: "San Francisco" },
          },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      const provider = createAnthropicProvider({ apiKey: "test-key" });
      const response = await provider.generate({
        messages: [{ role: "user", content: "What's the weather?" }],
      });

      expect(response.message).toEqual({
        role: "assistant",
        content: null,
        toolCalls: [
          {
            id: "toolu_abc123",
            name: "get_weather",
            arguments: { location: "San Francisco" },
          },
        ],
      });
      expect(response.finishReason).toBe("tool_calls");
    });

    it("should handle mixed text and tool_use blocks", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          { type: "text", text: "Let me check the weather." },
          {
            type: "tool_use",
            id: "toolu_abc123",
            name: "get_weather",
            input: { location: "NYC" },
          },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 10, output_tokens: 25 },
      });

      const provider = createAnthropicProvider({ apiKey: "test-key" });
      const response = await provider.generate({
        messages: [{ role: "user", content: "What's the weather in NYC?" }],
      });

      expect(response.message).toEqual({
        role: "assistant",
        content: "Let me check the weather.",
        toolCalls: [
          {
            id: "toolu_abc123",
            name: "get_weather",
            arguments: { location: "NYC" },
          },
        ],
      });
    });

    it("should return token usage", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "Hello!" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const provider = createAnthropicProvider({ apiKey: "test-key" });
      const response = await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
    });

    it("should map stop reason 'end_turn' to 'stop'", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "Done" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const provider = createAnthropicProvider({ apiKey: "test-key" });
      const response = await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(response.finishReason).toBe("stop");
    });

    it("should map stop reason 'max_tokens' to 'length'", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "Truncated..." }],
        stop_reason: "max_tokens",
        usage: { input_tokens: 10, output_tokens: 100 },
      });

      const provider = createAnthropicProvider({ apiKey: "test-key" });
      const response = await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(response.finishReason).toBe("length");
    });
  });

  describe("stream", () => {
    it("should yield content chunks from text_delta events", async () => {
      const events = [
        { type: "content_block_start", content_block: { type: "text" } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
        { type: "content_block_delta", delta: { type: "text_delta", text: " world" } },
        { type: "message_stop" },
      ];

      mockStream.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {
          for (const event of events) {
            yield event;
          }
        },
      });

      const provider = createAnthropicProvider({ apiKey: "test-key" });
      const results: unknown[] = [];

      for await (const chunk of provider.stream!({
        messages: [{ role: "user", content: "Hi" }],
      })) {
        results.push(chunk);
      }

      expect(results).toEqual([
        { content: "Hello", done: false },
        { content: " world", done: false },
        { done: true },
      ]);
    });

    it("should accumulate and yield tool calls from tool_use events", async () => {
      const events = [
        {
          type: "content_block_start",
          content_block: { type: "tool_use", id: "toolu_123", name: "get_weather" },
        },
        {
          type: "content_block_delta",
          delta: { type: "input_json_delta", partial_json: '{"loc' },
        },
        {
          type: "content_block_delta",
          delta: { type: "input_json_delta", partial_json: 'ation":"NYC"}' },
        },
        { type: "message_stop" },
      ];

      mockStream.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {
          for (const event of events) {
            yield event;
          }
        },
      });

      const provider = createAnthropicProvider({ apiKey: "test-key" });
      const results: unknown[] = [];

      for await (const chunk of provider.stream!({
        messages: [{ role: "user", content: "Get weather" }],
      })) {
        results.push(chunk);
      }

      expect(results).toContainEqual({
        toolCalls: [
          {
            id: "toolu_123",
            name: "get_weather",
            arguments: '{"location":"NYC"}',
          },
        ],
        done: false,
      });
      expect(results[results.length - 1]).toEqual({ done: true });
    });
  });
});
