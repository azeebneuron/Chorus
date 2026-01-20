import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Message, Tool } from "@chorus/core";

// Mock the OpenAI SDK
const mockCreate = vi.fn();

vi.mock("openai", () => {
  return {
    default: function OpenAI() {
      return {
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      };
    },
  };
});

// Import after mocking
import { createOpenAIProvider, openai } from "../provider.js";

describe("OpenAI Provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createOpenAIProvider", () => {
    it("should create a provider with name 'openai'", () => {
      const provider = createOpenAIProvider({ apiKey: "test-key" });
      expect(provider.name).toBe("openai");
    });

    it("should export openai as an alias", () => {
      expect(openai).toBe(createOpenAIProvider);
    });
  });

  describe("generate", () => {
    it("should use default model gpt-4o when not specified", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: "Hello!", role: "assistant" },
            finish_reason: "stop",
          },
        ],
      });

      const provider = createOpenAIProvider({ apiKey: "test-key" });
      await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-4o",
        })
      );
    });

    it("should use custom model when specified in config", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: "Hello!", role: "assistant" },
            finish_reason: "stop",
          },
        ],
      });

      const provider = createOpenAIProvider({
        apiKey: "test-key",
        defaultModel: "gpt-4-turbo",
      });
      await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-4-turbo",
        })
      );
    });

    it("should use model from generate config over default", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: "Hello!", role: "assistant" },
            finish_reason: "stop",
          },
        ],
      });

      const provider = createOpenAIProvider({
        apiKey: "test-key",
        defaultModel: "gpt-4-turbo",
      });
      await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
        model: "gpt-3.5-turbo",
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-3.5-turbo",
        })
      );
    });

    it("should transform system messages correctly", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: "I am helpful", role: "assistant" },
            finish_reason: "stop",
          },
        ],
      });

      const provider = createOpenAIProvider({ apiKey: "test-key" });
      await provider.generate({
        messages: [
          { role: "system", content: "You are a helpful assistant" },
          { role: "user", content: "Hi" },
        ],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: "system", content: "You are a helpful assistant" },
            { role: "user", content: "Hi" },
          ],
        })
      );
    });

    it("should transform assistant messages with tool calls correctly", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: "Done", role: "assistant" },
            finish_reason: "stop",
          },
        ],
      });

      const messages: Message[] = [
        { role: "user", content: "Get the weather" },
        {
          role: "assistant",
          content: null,
          toolCalls: [
            {
              id: "call_123",
              name: "get_weather",
              arguments: { location: "NYC" },
            },
          ],
        },
        {
          role: "tool",
          toolCallId: "call_123",
          content: '{"temp": 72}',
        },
      ];

      const provider = createOpenAIProvider({ apiKey: "test-key" });
      await provider.generate({ messages });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: "user", content: "Get the weather" },
            {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_123",
                  type: "function",
                  function: {
                    name: "get_weather",
                    arguments: '{"location":"NYC"}',
                  },
                },
              ],
            },
            {
              role: "tool",
              tool_call_id: "call_123",
              content: '{"temp": 72}',
            },
          ],
        })
      );
    });

    it("should transform tools to OpenAI format", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: "Hello!", role: "assistant" },
            finish_reason: "stop",
          },
        ],
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

      const provider = createOpenAIProvider({ apiKey: "test-key" });
      await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
        tools,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            {
              type: "function",
              function: {
                name: "get_weather",
                description: "Get current weather",
                parameters: {
                  type: "object",
                  properties: {
                    location: { type: "string" },
                  },
                  required: ["location"],
                },
              },
            },
          ],
        })
      );
    });

    it("should pass generation config options", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: "Hello!", role: "assistant" },
            finish_reason: "stop",
          },
        ],
      });

      const provider = createOpenAIProvider({ apiKey: "test-key" });
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
          stop: ["END"],
        })
      );
    });

    it("should parse tool calls from response", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              role: "assistant",
              tool_calls: [
                {
                  id: "call_abc123",
                  type: "function",
                  function: {
                    name: "get_weather",
                    arguments: '{"location":"San Francisco"}',
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      });

      const provider = createOpenAIProvider({ apiKey: "test-key" });
      const response = await provider.generate({
        messages: [{ role: "user", content: "What's the weather?" }],
      });

      expect(response.message).toEqual({
        role: "assistant",
        content: null,
        toolCalls: [
          {
            id: "call_abc123",
            name: "get_weather",
            arguments: { location: "San Francisco" },
          },
        ],
      });
      expect(response.finishReason).toBe("tool_calls");
    });

    it("should return token usage when available", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: "Hello!", role: "assistant" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      });

      const provider = createOpenAIProvider({ apiKey: "test-key" });
      const response = await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
    });

    it("should map finish reason 'length' correctly", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: "Truncated...", role: "assistant" },
            finish_reason: "length",
          },
        ],
      });

      const provider = createOpenAIProvider({ apiKey: "test-key" });
      const response = await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(response.finishReason).toBe("length");
    });

    it("should map finish reason 'content_filter' to 'error'", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: "", role: "assistant" },
            finish_reason: "content_filter",
          },
        ],
      });

      const provider = createOpenAIProvider({ apiKey: "test-key" });
      const response = await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(response.finishReason).toBe("error");
    });

    it("should throw error when no response message", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [],
      });

      const provider = createOpenAIProvider({ apiKey: "test-key" });

      await expect(
        provider.generate({
          messages: [{ role: "user", content: "Hi" }],
        })
      ).rejects.toThrow("No response message from OpenAI");
    });
  });

  describe("stream", () => {
    it("should yield content chunks", async () => {
      const chunks = [
        { choices: [{ delta: { content: "Hello" }, finish_reason: null }] },
        { choices: [{ delta: { content: " world" }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: "stop" }] },
      ];

      mockCreate.mockResolvedValueOnce({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      });

      const provider = createOpenAIProvider({ apiKey: "test-key" });
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

    it("should accumulate and yield tool calls", async () => {
      const chunks = [
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_123",
                    function: { name: "get_weather", arguments: '{"loc' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { arguments: 'ation":"NYC"}' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [{ delta: {}, finish_reason: "tool_calls" }],
        },
      ];

      mockCreate.mockResolvedValueOnce({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      });

      const provider = createOpenAIProvider({ apiKey: "test-key" });
      const results: unknown[] = [];

      for await (const chunk of provider.stream!({
        messages: [{ role: "user", content: "Get weather" }],
      })) {
        results.push(chunk);
      }

      expect(results).toContainEqual({
        toolCalls: [
          {
            id: "call_123",
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
