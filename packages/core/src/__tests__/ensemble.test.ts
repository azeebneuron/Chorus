import { describe, it, expect, vi } from "vitest";
import { createEnsemble, ensemble, EnsembleBuilder } from "../ensemble.js";
import type { Agent, AgentConfig, Provider, Conductor, EnsembleResult, AgentRole } from "../types/index.js";

// Mock provider
const mockProvider: Provider = {
  generate: vi.fn().mockResolvedValue({
    message: { role: "assistant", content: "response" },
    finishReason: "stop",
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  }),
};

// Helper to create mock agent
function createMockAgent(name: string): Agent {
  const config: AgentConfig = {
    name,
    description: `${name} description`,
    systemPrompt: `You are ${name}`,
    provider: mockProvider,
  };

  return {
    config,
    run: vi.fn().mockResolvedValue({
      response: `${name} response`,
      messages: [],
      iterations: 1,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    }),
  };
}

// Mock conductor
function createMockConductor(): Conductor {
  return {
    config: { strategy: "sequential" },
    orchestrate: vi.fn().mockImplementation(
      async (input: string, agents: AgentRole[]): Promise<EnsembleResult> => {
        const agentResults = new Map();
        for (const agent of agents) {
          const result = await agent.agent.run(input);
          agentResults.set(agent.id, result);
        }
        return {
          response: "orchestrated response",
          agentResults,
          trace: { id: "trace_1", startTime: Date.now(), steps: [] },
          usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
        };
      }
    ),
  };
}

describe("EnsembleBuilder", () => {
  it("should create an ensemble with builder pattern", () => {
    const agent1 = createMockAgent("agent1");
    const agent2 = createMockAgent("agent2");

    const ens = ensemble()
      .name("test-ensemble")
      .description("A test ensemble")
      .add(agent1, { role: "Researcher" })
      .add(agent2, { role: "Writer" })
      .build();

    expect(ens.config.name).toBe("test-ensemble");
    expect(ens.config.description).toBe("A test ensemble");
    expect(ens.listAgents()).toHaveLength(2);
  });

  it("should throw if name is missing", () => {
    const agent = createMockAgent("agent");
    expect(() => ensemble().add(agent).build()).toThrow("Ensemble name is required");
  });

  it("should throw if no agents added", () => {
    expect(() => ensemble().name("empty").build()).toThrow(
      "Ensemble must have at least one agent"
    );
  });

  it("should throw on duplicate agent IDs", () => {
    const agent = createMockAgent("same");
    expect(() =>
      ensemble()
        .name("test")
        .add(agent, { id: "dup" })
        .add(agent, { id: "dup" })
        .build()
    ).toThrow("Agent with ID 'dup' already exists in ensemble");
  });

  it("should use agent name as default ID", () => {
    const agent = createMockAgent("myagent");
    const ens = ensemble().name("test").add(agent).build();
    expect(ens.getAgent("myagent")).toBeDefined();
  });
});

describe("createEnsemble", () => {
  it("should create ensemble from config", () => {
    const agent = createMockAgent("agent");
    const ens = createEnsemble({
      name: "test",
      agents: [{ id: "agent", agent }],
    });

    expect(ens.config.name).toBe("test");
    expect(ens.listAgents()).toHaveLength(1);
  });

  it("should get agent by ID", () => {
    const agent = createMockAgent("agent");
    const ens = createEnsemble({
      name: "test",
      agents: [{ id: "myid", agent, role: "tester" }],
    });

    const found = ens.getAgent("myid");
    expect(found).toBeDefined();
    expect(found?.role).toBe("tester");
    expect(ens.getAgent("nonexistent")).toBeUndefined();
  });

  it("should throw if no conductor is provided for run", async () => {
    const agent = createMockAgent("agent");
    const ens = createEnsemble({
      name: "test",
      agents: [{ id: "agent", agent }],
    });

    await expect(ens.run("input")).rejects.toThrow("No conductor provided");
  });

  it("should run with provided conductor", async () => {
    const agent = createMockAgent("agent");
    const conductor = createMockConductor();

    const ens = createEnsemble({
      name: "test",
      agents: [{ id: "agent", agent }],
    });

    const result = await ens.run("input", { conductor });
    expect(result.response).toBe("orchestrated response");
    expect(conductor.orchestrate).toHaveBeenCalled();
  });

  it("should use default conductor if set", async () => {
    const agent = createMockAgent("agent");
    const conductor = createMockConductor();

    const ens = createEnsemble({
      name: "test",
      agents: [{ id: "agent", agent }],
      conductor,
    });

    const result = await ens.run("input");
    expect(result.response).toBe("orchestrated response");
  });

  it("should call lifecycle hooks", async () => {
    const agent = createMockAgent("agent");
    const conductor = createMockConductor();

    const onStart = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    const ens = ensemble()
      .name("test")
      .add(agent)
      .conductor(conductor)
      .onStart(onStart)
      .onComplete(onComplete)
      .onError(onError)
      .build();

    await ens.run("input");

    expect(onStart).toHaveBeenCalledWith("input");
    expect(onComplete).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
