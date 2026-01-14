import { describe, it, expect, vi } from "vitest";
import {
  createConductor,
  conductor,
  ConductorBuilder,
  createSequentialConductor,
  createParallelConductor,
} from "../conductor/index.js";
import { createContext } from "../context.js";
import type {
  Agent,
  AgentConfig,
  Provider,
  AgentRole,
  AgentResult,
} from "../types/index.js";

// Mock provider
const mockProvider: Provider = {
  generate: vi.fn().mockResolvedValue({
    message: { role: "assistant", content: "response" },
    finishReason: "stop",
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  }),
};

// Helper to create mock agent
function createMockAgent(
  name: string,
  response?: string
): Agent {
  const config: AgentConfig = {
    name,
    systemPrompt: `You are ${name}`,
    provider: mockProvider,
  };

  return {
    config,
    run: vi.fn().mockResolvedValue({
      response: response ?? `${name} response`,
      messages: [],
      iterations: 1,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    }),
  };
}

// Helper to create agent roles
function createAgentRoles(
  ...names: string[]
): AgentRole[] {
  return names.map((name) => ({
    id: name,
    agent: createMockAgent(name),
    role: `${name} role`,
  }));
}

describe("ConductorBuilder", () => {
  it("should create a sequential conductor by default", () => {
    const cond = conductor().build();
    expect(cond.config.strategy).toBe("sequential");
  });

  it("should create a parallel conductor with merger", () => {
    const cond = conductor()
      .strategy("parallel")
      .merger({ type: "concatenate" })
      .build();

    expect(cond.config.strategy).toBe("parallel");
  });

  it("should throw if parallel without merger", () => {
    expect(() => conductor().strategy("parallel").build()).toThrow(
      "Parallel strategy requires a merger configuration"
    );
  });

  it("should create a hierarchical conductor", () => {
    const cond = conductor()
      .strategy("hierarchical")
      .manager("manager")
      .workers(["worker1", "worker2"])
      .build();

    expect(cond.config.strategy).toBe("hierarchical");
  });

  it("should throw if hierarchical without manager", () => {
    expect(() => conductor().strategy("hierarchical").build()).toThrow(
      "Hierarchical strategy requires a manager agent"
    );
  });

  it("should create a debate conductor", () => {
    const cond = conductor()
      .strategy("debate")
      .debaters(["debater1", "debater2"])
      .rounds(3)
      .consensus("judge")
      .judge("judge")
      .build();

    expect(cond.config.strategy).toBe("debate");
  });

  it("should create a voting conductor", () => {
    const cond = conductor()
      .strategy("voting")
      .voters(["v1", "v2", "v3"])
      .method("majority")
      .build();

    expect(cond.config.strategy).toBe("voting");
  });

  it("should create a custom conductor", () => {
    const customFn = vi.fn().mockResolvedValue({
      response: "custom",
      agentResults: new Map(),
      trace: { id: "t", startTime: 0, steps: [] },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    const cond = conductor().custom(customFn).build();
    expect(cond.config.strategy).toBe("custom");
  });
});

describe("createSequentialConductor", () => {
  it("should run agents in sequence", async () => {
    const agents = createAgentRoles("a", "b", "c");
    const cond = createSequentialConductor({
      strategy: "sequential",
      order: ["a", "b", "c"],
    });

    const result = await cond.orchestrate("input", agents);

    expect(result.response).toBe("c response");
    expect(result.agentResults.size).toBe(3);

    // Verify order
    const aRun = agents[0]?.agent.run as ReturnType<typeof vi.fn>;
    const bRun = agents[1]?.agent.run as ReturnType<typeof vi.fn>;
    const cRun = agents[2]?.agent.run as ReturnType<typeof vi.fn>;

    expect(aRun).toHaveBeenCalledWith("input", expect.any(Object));
    expect(bRun).toHaveBeenCalledWith("a response", expect.any(Object));
    expect(cRun).toHaveBeenCalledWith("b response", expect.any(Object));
  });

  it("should use registration order if order not specified", async () => {
    const agents = createAgentRoles("first", "second");
    const cond = createSequentialConductor({ strategy: "sequential" });

    await cond.orchestrate("input", agents);

    const firstRun = agents[0]?.agent.run as ReturnType<typeof vi.fn>;
    expect(firstRun).toHaveBeenCalled();
  });

  it("should apply transform function", async () => {
    const agents = createAgentRoles("a", "b");
    const transform = vi.fn((output: string) => `Transformed: ${output}`);

    const cond = createSequentialConductor({
      strategy: "sequential",
      order: ["a", "b"],
      transform,
    });

    await cond.orchestrate("input", agents);

    expect(transform).toHaveBeenCalledWith("a response", agents[1]);

    const bRun = agents[1]?.agent.run as ReturnType<typeof vi.fn>;
    expect(bRun).toHaveBeenCalledWith(
      "Transformed: a response",
      expect.any(Object)
    );
  });

  it("should call hooks", async () => {
    const agents = createAgentRoles("a");
    const onStart = vi.fn();
    const onComplete = vi.fn();
    const onBeforeAgent = vi.fn();
    const onAfterAgent = vi.fn();

    const cond = createSequentialConductor({
      strategy: "sequential",
      hooks: { onStart, onComplete },
    });

    await cond.orchestrate("input", agents, {
      hooks: { onBeforeAgent, onAfterAgent },
    });

    expect(onStart).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
    expect(onBeforeAgent).toHaveBeenCalledWith("a", "input");
    expect(onAfterAgent).toHaveBeenCalledWith("a", expect.any(Object));
  });

  it("should respect abort signal", async () => {
    const agents = createAgentRoles("a", "b");
    const controller = new AbortController();
    controller.abort();

    const cond = createSequentialConductor({ strategy: "sequential" });

    await expect(
      cond.orchestrate("input", agents, { signal: controller.signal })
    ).rejects.toThrow("aborted");
  });
});

describe("createParallelConductor", () => {
  it("should run agents in parallel", async () => {
    const agents = createAgentRoles("a", "b", "c");
    const cond = createParallelConductor({
      strategy: "parallel",
      merger: { type: "concatenate" },
    });

    const result = await cond.orchestrate("input", agents);

    expect(result.agentResults.size).toBe(3);

    // All should receive same input
    for (const agent of agents) {
      expect(agent.agent.run).toHaveBeenCalledWith("input", expect.any(Object));
    }
  });

  it("should concatenate results with default separator", async () => {
    const agents = createAgentRoles("a", "b");
    const cond = createParallelConductor({
      strategy: "parallel",
      merger: { type: "concatenate" },
    });

    const result = await cond.orchestrate("input", agents);

    expect(result.response).toContain("[a role]");
    expect(result.response).toContain("a response");
    expect(result.response).toContain("[b role]");
    expect(result.response).toContain("b response");
  });

  it("should use custom separator", async () => {
    const agents = createAgentRoles("a", "b");
    const cond = createParallelConductor({
      strategy: "parallel",
      merger: { type: "concatenate", separator: " | " },
    });

    const result = await cond.orchestrate("input", agents);
    expect(result.response).toContain(" | ");
  });

  it("should select best with custom selector", async () => {
    const agents = createAgentRoles("good", "bad");
    const selector = (results: AgentResult[]) =>
      results.find((r) => r.response.includes("good"))!;

    const cond = createParallelConductor({
      strategy: "parallel",
      merger: { type: "select-best", selector },
    });

    const result = await cond.orchestrate("input", agents);
    expect(result.response).toContain("good");
  });

  it("should respect concurrency limit", async () => {
    const runOrder: string[] = [];
    const agents: AgentRole[] = ["a", "b", "c"].map((name) => ({
      id: name,
      agent: {
        config: { name, systemPrompt: "", provider: mockProvider },
        run: vi.fn().mockImplementation(async () => {
          runOrder.push(`${name}-start`);
          await new Promise((r) => setTimeout(r, 10));
          runOrder.push(`${name}-end`);
          return {
            response: name,
            messages: [],
            iterations: 1,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          };
        }),
      },
    }));

    const cond = createParallelConductor({
      strategy: "parallel",
      concurrency: 1,
      merger: { type: "concatenate" },
    });

    await cond.orchestrate("input", agents);

    // With concurrency 1, each should complete before next starts
    expect(runOrder[1]).toBe("a-end");
    expect(runOrder[2]).toBe("b-start");
  });
});

describe("createConductor", () => {
  it("should create conductor from config", () => {
    const cond = createConductor({
      strategy: "sequential",
    });
    expect(cond.config.strategy).toBe("sequential");
  });

  it("should throw for unknown strategy", () => {
    expect(() =>
      createConductor({ strategy: "unknown" as any })
    ).toThrow("Unknown orchestration strategy");
  });
});
