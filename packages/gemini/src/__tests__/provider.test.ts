import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGeminiProvider, gemini } from "../provider.js";

// Mock the Google GenAI SDK
vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: vi.fn(),
        generateContentStream: vi.fn(),
      },
    })),
  };
});

describe("createGeminiProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a provider with correct name", () => {
    const provider = createGeminiProvider({
      apiKey: "test-api-key",
    });

    expect(provider.name).toBe("gemini");
    expect(provider.generate).toBeDefined();
    expect(provider.stream).toBeDefined();
  });

  it("exports gemini alias", () => {
    expect(gemini).toBe(createGeminiProvider);
  });

  it("uses default model when not specified", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    const mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: "Hello!" }],
            role: "model",
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    });

    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    }));

    const provider = createGeminiProvider({ apiKey: "test-key" });

    await provider.generate({
      messages: [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hi" },
      ],
    });

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-2.0-flash",
      })
    );
  });

  it("uses custom model when specified", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    const mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: "Hello!" }],
            role: "model",
          },
          finishReason: "STOP",
        },
      ],
    });

    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    }));

    const provider = createGeminiProvider({
      apiKey: "test-key",
      defaultModel: "gemini-1.5-pro",
    });

    await provider.generate({
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-1.5-pro",
      })
    );
  });

  it("transforms messages correctly", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    const mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: "Response" }],
            role: "model",
          },
          finishReason: "STOP",
        },
      ],
    });

    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    }));

    const provider = createGeminiProvider({ apiKey: "test-key" });

    await provider.generate({
      messages: [
        { role: "system", content: "You are a poet" },
        { role: "user", content: "Write a haiku" },
        { role: "assistant", content: "Here is a haiku" },
        { role: "user", content: "Another one please" },
      ],
    });

    const callArgs = mockGenerateContent.mock.calls[0][0];

    // System message should be in config.systemInstruction
    expect(callArgs.config.systemInstruction).toEqual({
      parts: [{ text: "You are a poet" }],
    });

    // Other messages should be in contents
    expect(callArgs.contents).toHaveLength(3);
    expect(callArgs.contents[0]).toEqual({
      role: "user",
      parts: [{ text: "Write a haiku" }],
    });
    expect(callArgs.contents[1]).toEqual({
      role: "model",
      parts: [{ text: "Here is a haiku" }],
    });
    expect(callArgs.contents[2]).toEqual({
      role: "user",
      parts: [{ text: "Another one please" }],
    });
  });

  it("handles generation config", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    const mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: { parts: [{ text: "Response" }], role: "model" },
          finishReason: "STOP",
        },
      ],
    });

    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    }));

    const provider = createGeminiProvider({ apiKey: "test-key" });

    await provider.generate({
      messages: [{ role: "user", content: "Hi" }],
      temperature: 0.7,
      maxTokens: 100,
      stop: ["END"],
    });

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.config.temperature).toBe(0.7);
    expect(callArgs.config.maxOutputTokens).toBe(100);
    expect(callArgs.config.stopSequences).toEqual(["END"]);
  });

  it("transforms tools correctly", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    const mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: { parts: [{ text: "I'll check the weather" }], role: "model" },
          finishReason: "STOP",
        },
      ],
    });

    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    }));

    const provider = createGeminiProvider({ apiKey: "test-key" });

    await provider.generate({
      messages: [{ role: "user", content: "What's the weather?" }],
      tools: [
        {
          name: "get_weather",
          description: "Gets the weather",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string" },
            },
            required: ["location"],
          },
          execute: async () => ({ temp: 72 }),
        },
      ],
    });

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.config.tools).toBeDefined();
    expect(callArgs.config.tools[0].functionDeclarations).toHaveLength(1);
    expect(callArgs.config.tools[0].functionDeclarations[0].name).toBe(
      "get_weather"
    );
  });

  it("parses response with function calls", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    const mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: "get_weather",
                  args: { location: "San Francisco" },
                },
              },
            ],
            role: "model",
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 15,
        candidatesTokenCount: 10,
        totalTokenCount: 25,
      },
    });

    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    }));

    const provider = createGeminiProvider({ apiKey: "test-key" });

    const result = await provider.generate({
      messages: [{ role: "user", content: "Weather in SF?" }],
    });

    expect(result.finishReason).toBe("tool_calls");
    expect(result.message.role).toBe("assistant");
    expect(result.message.toolCalls).toHaveLength(1);
    expect(result.message.toolCalls?.[0].name).toBe("get_weather");
    expect(result.message.toolCalls?.[0].arguments).toEqual({
      location: "San Francisco",
    });
    expect(result.usage?.totalTokens).toBe(25);
  });

  it("handles MAX_TOKENS finish reason", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    const mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: { parts: [{ text: "Truncated..." }], role: "model" },
          finishReason: "MAX_TOKENS",
        },
      ],
    });

    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    }));

    const provider = createGeminiProvider({ apiKey: "test-key" });

    const result = await provider.generate({
      messages: [{ role: "user", content: "Write a long story" }],
    });

    expect(result.finishReason).toBe("length");
  });

  it("handles SAFETY finish reason", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    const mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: { parts: [{ text: "" }], role: "model" },
          finishReason: "SAFETY",
        },
      ],
    });

    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    }));

    const provider = createGeminiProvider({ apiKey: "test-key" });

    const result = await provider.generate({
      messages: [{ role: "user", content: "Something unsafe" }],
    });

    expect(result.finishReason).toBe("error");
  });

  it("throws when no response content", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    const mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [],
    });

    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    }));

    const provider = createGeminiProvider({ apiKey: "test-key" });

    await expect(
      provider.generate({
        messages: [{ role: "user", content: "Hi" }],
      })
    ).rejects.toThrow("No response content from Gemini");
  });
});
