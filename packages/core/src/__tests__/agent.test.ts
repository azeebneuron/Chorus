import { describe, it, expect, vi } from "vitest";
import { createAgent, agent, AgentBuilder } from "../agent.js";
import type { Provider, GenerateResponse, AssistantMessage } from "../types/index.js";

/**
 * Creates a mock provider for testing
 */
function createMockProvider(responses: GenerateResponse[]): Provider {
  let callIndex = 0;
  return {
    name: "mock",
    generate: vi.fn(async () => {
      const response = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return response;
    }),
  };
}

describe("createAgent", () => {
  it("creates an agent with required configuration", () => {
    const provider = createMockProvider([
      {
        message: { role: "assistant", content: "Hello!" },
        finishReason: "stop",
      },
    ]);

    const testAgent = createAgent({
      name: "test-agent",
      systemPrompt: "You are a test agent",
      provider,
    });

    expect(testAgent.config.name).toBe("test-agent");
    expect(testAgent.config.systemPrompt).toBe("You are a test agent");
    expect(testAgent.config.provider).toBe(provider);
  });

  it("runs a simple conversation", async () => {
    const provider = createMockProvider([
      {
        message: { role: "assistant", content: "Hello, I'm here to help!" },
        finishReason: "stop",
        usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
      },
    ]);

    const testAgent = createAgent({
      name: "helper",
      systemPrompt: "You are helpful",
      provider,
    });

    const result = await testAgent.run("Hi there");

    expect(result.response).toBe("Hello, I'm here to help!");
    expect(result.iterations).toBe(1);
    expect(result.usage.totalTokens).toBe(18);
    expect(result.messages).toHaveLength(3); // system, user, assistant
  });

  it("handles tool calls", async () => {
    const weatherTool = {
      name: "get_weather",
      description: "Gets weather for a location",
      parameters: {
        type: "object" as const,
        properties: {
          location: { type: "string" },
        },
        required: ["location"],
      },
      execute: vi.fn(async ({ location }: { location: string }) => ({
        location,
        temp: 72,
        condition: "sunny",
      })),
    };

    const provider = createMockProvider([
      // First response: tool call
      {
        message: {
          role: "assistant",
          content: null,
          toolCalls: [
            {
              id: "call_1",
              name: "get_weather",
              arguments: { location: "San Francisco" },
            },
          ],
        } as AssistantMessage,
        finishReason: "tool_calls",
      },
      // Second response: final answer
      {
        message: {
          role: "assistant",
          content: "The weather in San Francisco is 72°F and sunny!",
        },
        finishReason: "stop",
      },
    ]);

    const testAgent = createAgent({
      name: "weather-agent",
      systemPrompt: "You can check the weather",
      provider,
      tools: [weatherTool],
    });

    const result = await testAgent.run("What's the weather in SF?");

    expect(weatherTool.execute).toHaveBeenCalledWith({
      location: "San Francisco",
    });
    expect(result.response).toBe(
      "The weather in San Francisco is 72°F and sunny!"
    );
    expect(result.iterations).toBe(2);
  });

  it("respects max iterations", async () => {
    // Provider that always returns tool calls (infinite loop scenario)
    const provider = createMockProvider([
      {
        message: {
          role: "assistant",
          content: null,
          toolCalls: [{ id: "call_1", name: "loop", arguments: {} }],
        } as AssistantMessage,
        finishReason: "tool_calls",
      },
    ]);

    const loopTool = {
      name: "loop",
      description: "A tool that loops",
      parameters: { type: "object" as const, properties: {} },
      execute: () => "looping",
    };

    const testAgent = createAgent({
      name: "loop-agent",
      systemPrompt: "You loop forever",
      provider,
      tools: [loopTool],
      maxIterations: 3,
    });

    const result = await testAgent.run("Loop!");

    expect(result.iterations).toBe(3);
  });

  it("handles tool not found gracefully", async () => {
    const provider = createMockProvider([
      {
        message: {
          role: "assistant",
          content: null,
          toolCalls: [
            { id: "call_1", name: "nonexistent_tool", arguments: {} },
          ],
        } as AssistantMessage,
        finishReason: "tool_calls",
      },
      {
        message: { role: "assistant", content: "Tool was not found" },
        finishReason: "stop",
      },
    ]);

    const testAgent = createAgent({
      name: "test",
      systemPrompt: "Test",
      provider,
      tools: [],
    });

    const result = await testAgent.run("Use a tool");

    // Should have tool message with error
    const toolMessage = result.messages.find((m) => m.role === "tool");
    expect(toolMessage).toBeDefined();
    expect(toolMessage?.content).toContain("not found");
  });

  it("calls lifecycle hooks", async () => {
    const provider = createMockProvider([
      {
        message: { role: "assistant", content: "Done" },
        finishReason: "stop",
      },
    ]);

    const onBeforeGenerate = vi.fn();
    const onAfterGenerate = vi.fn();

    const testAgent = createAgent(
      {
        name: "hook-agent",
        systemPrompt: "Test hooks",
        provider,
      },
      {
        onBeforeGenerate,
        onAfterGenerate,
      }
    );

    await testAgent.run("Test");

    expect(onBeforeGenerate).toHaveBeenCalledTimes(1);
    expect(onAfterGenerate).toHaveBeenCalledTimes(1);
  });

  it("calls error hook on failure", async () => {
    const error = new Error("Provider failed");
    const provider: Provider = {
      name: "failing",
      generate: vi.fn().mockRejectedValue(error),
    };

    const onError = vi.fn();

    const testAgent = createAgent(
      {
        name: "error-agent",
        systemPrompt: "Test errors",
        provider,
      },
      { onError }
    );

    await expect(testAgent.run("Fail")).rejects.toThrow("Provider failed");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("supports abort signal", async () => {
    const controller = new AbortController();
    let callCount = 0;

    const provider: Provider = {
      name: "slow",
      generate: vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          // First call returns a tool call, triggering another iteration
          // Abort during this call
          controller.abort();
          return {
            message: {
              role: "assistant" as const,
              content: null,
              toolCalls: [{ id: "call_1", name: "test", arguments: {} }],
            } as AssistantMessage,
            finishReason: "tool_calls" as const,
          };
        }
        return {
          message: { role: "assistant" as const, content: "Done" },
          finishReason: "stop" as const,
        };
      }),
    };

    const testTool = {
      name: "test",
      description: "Test tool",
      parameters: { type: "object" as const, properties: {} },
      execute: () => "result",
    };

    const testAgent = createAgent({
      name: "abortable",
      systemPrompt: "Test abort",
      provider,
      tools: [testTool],
    });

    const runPromise = testAgent.run("Start", { signal: controller.signal });

    await expect(runPromise).rejects.toThrow("aborted");
  });
});

describe("AgentBuilder", () => {
  it("builds an agent with fluent API", async () => {
    const provider = createMockProvider([
      {
        message: { role: "assistant", content: "Built!" },
        finishReason: "stop",
      },
    ]);

    const builtAgent = agent()
      .name("builder-agent")
      .description("Built with builder")
      .systemPrompt("You were built")
      .provider(provider)
      .temperature(0.7)
      .maxTokens(100)
      .build();

    expect(builtAgent.config.name).toBe("builder-agent");
    expect(builtAgent.config.description).toBe("Built with builder");
    expect(builtAgent.config.temperature).toBe(0.7);
    expect(builtAgent.config.maxTokens).toBe(100);

    const result = await builtAgent.run("Hello");
    expect(result.response).toBe("Built!");
  });

  it("throws when required fields are missing", () => {
    expect(() => agent().build()).toThrow("Agent name is required");

    expect(() => agent().name("test").build()).toThrow(
      "System prompt is required"
    );

    expect(() =>
      agent().name("test").systemPrompt("prompt").build()
    ).toThrow("Provider is required");
  });

  it("supports hook configuration", async () => {
    const provider = createMockProvider([
      {
        message: { role: "assistant", content: "Hooked!" },
        finishReason: "stop",
      },
    ]);

    const onBeforeGenerate = vi.fn();
    const onAfterGenerate = vi.fn();

    const builtAgent = agent()
      .name("hook-builder")
      .systemPrompt("Test")
      .provider(provider)
      .onBeforeGenerate(onBeforeGenerate)
      .onAfterGenerate(onAfterGenerate)
      .build();

    await builtAgent.run("Test");

    expect(onBeforeGenerate).toHaveBeenCalled();
    expect(onAfterGenerate).toHaveBeenCalled();
  });

  it("supports tool configuration", async () => {
    const tool = {
      name: "test_tool",
      description: "A test tool",
      parameters: { type: "object" as const, properties: {} },
      execute: () => "tool result",
    };

    const provider = createMockProvider([
      {
        message: { role: "assistant", content: "Done" },
        finishReason: "stop",
      },
    ]);

    const builtAgent = agent()
      .name("tool-builder")
      .systemPrompt("Use tools")
      .provider(provider)
      .tools([tool])
      .build();

    expect(builtAgent.config.tools).toHaveLength(1);
    expect(builtAgent.config.tools?.[0].name).toBe("test_tool");
  });

  it("supports maxIterations configuration", () => {
    const provider = createMockProvider([
      {
        message: { role: "assistant", content: "Done" },
        finishReason: "stop",
      },
    ]);

    const builtAgent = agent()
      .name("iter-builder")
      .systemPrompt("Test")
      .provider(provider)
      .maxIterations(5)
      .build();

    expect(builtAgent.config.maxIterations).toBe(5);
  });
});
