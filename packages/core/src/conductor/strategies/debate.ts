/**
 * Debate orchestration strategy
 *
 * Agents argue/discuss to reach consensus
 */

import type {
  AgentId,
  AgentRole,
  AgentResult,
  Conductor,
  ConductorRunOptions,
  EnsembleResult,
  DebateConfig,
} from "../../types/index.js";
import { createContext } from "../../context.js";
import {
  createTrace,
  runAgent,
  createEnsembleResult,
  checkAbort,
  requireAgent,
  findAgent,
} from "../base.js";

/**
 * Create a debate conductor
 */
export function createDebateConductor(config: DebateConfig): Conductor {
  async function orchestrate(
    input: string,
    agents: AgentRole[],
    options?: ConductorRunOptions
  ): Promise<EnsembleResult> {
    const context = options?.context ?? createContext();
    const trace = createTrace();
    const agentResults = new Map<AgentId, AgentResult>();

    // Call onStart hook
    await config.hooks?.onStart?.(input, agents);
    await options?.hooks?.onStart?.(input, agents);

    // Determine debaters
    const debaterIds = config.debaters ?? agents.map((a) => a.id);
    const debaters = debaterIds
      .map((id) => findAgent(agents, id))
      .filter((a): a is AgentRole => a !== undefined);

    if (debaters.length < 2) {
      throw new Error("Debate requires at least 2 agents");
    }

    // Track statements per round
    const allStatements: Map<AgentId, string[]> = new Map();
    for (const debater of debaters) {
      allStatements.set(debater.id, []);
    }

    // Initial positions - each agent responds to the input
    const initialPrompt = `You are participating in a debate about the following topic. Provide your initial position and reasoning.

Topic: ${input}

State your position clearly and provide supporting arguments.`;

    for (const debater of debaters) {
      checkAbort(options?.signal);

      const result = await runAgent(debater, initialPrompt, {
        context,
        signal: options?.signal,
        hooks: options?.hooks,
        trace,
      });

      agentResults.set(debater.id, result);
      allStatements.get(debater.id)?.push(result.response);
    }

    // Debate rounds
    for (let round = 1; round <= config.maxRounds; round++) {
      checkAbort(options?.signal);

      const roundStatements = new Map<AgentId, string>();

      // Each agent responds to others' previous statements
      for (const debater of debaters) {
        checkAbort(options?.signal);

        // Build context from other agents' statements
        const otherStatements = debaters
          .filter((d) => d.id !== debater.id)
          .map((d) => {
            const statements = allStatements.get(d.id) ?? [];
            const lastStatement = statements[statements.length - 1];
            return `[${d.role ?? d.id}]: ${lastStatement}`;
          })
          .join("\n\n");

        const roundPrompt = `Debate Round ${round}/${config.maxRounds}

Topic: ${input}

Other participants' latest statements:
${otherStatements}

Your previous position: ${allStatements.get(debater.id)?.slice(-1)[0] ?? "None"}

Respond to the other participants. You may:
- Defend your position against criticisms
- Challenge others' arguments with evidence or logic
- Refine your position based on new insights
- Find common ground where appropriate

Keep your response focused and constructive.`;

        const result = await runAgent(debater, roundPrompt, {
          context,
          signal: options?.signal,
          hooks: options?.hooks,
          trace,
        });

        agentResults.set(debater.id, result);
        roundStatements.set(debater.id, result.response);
        allStatements.get(debater.id)?.push(result.response);
      }

      // Emit debate round hook
      await config.hooks?.onDebateRound?.(round, roundStatements);
      await options?.hooks?.onDebateRound?.(round, roundStatements);

      // Check for early consensus if using agreement strategy
      if (config.consensusStrategy === "agreement") {
        const hasConsensus = await checkAgreementConsensus(
          roundStatements,
          config.consensusThreshold ?? 0.8
        );
        if (hasConsensus) {
          break;
        }
      }
    }

    // Determine final response based on consensus strategy
    const finalResponse = await determineConsensus(
      input,
      allStatements,
      debaters,
      config,
      agents,
      agentResults,
      {
        context,
        signal: options?.signal,
        hooks: options?.hooks,
        trace,
      }
    );

    const ensembleResult = createEnsembleResult(
      finalResponse,
      agentResults,
      trace
    );

    // Call onComplete hook
    await config.hooks?.onComplete?.(ensembleResult);
    await options?.hooks?.onComplete?.(ensembleResult);

    return ensembleResult;
  }

  return {
    config,
    hooks: config.hooks,
    orchestrate,
  };
}

/**
 * Check if agents have reached agreement consensus
 */
async function checkAgreementConsensus(
  statements: Map<AgentId, string>,
  threshold: number
): Promise<boolean> {
  // Simple heuristic: check for agreement keywords
  const agreementKeywords = [
    "i agree",
    "you're right",
    "good point",
    "consensus",
    "we all",
    "common ground",
  ];

  let agreementCount = 0;
  for (const statement of statements.values()) {
    const lower = statement.toLowerCase();
    if (agreementKeywords.some((kw) => lower.includes(kw))) {
      agreementCount++;
    }
  }

  return agreementCount / statements.size >= threshold;
}

/**
 * Determine final consensus based on strategy
 */
async function determineConsensus(
  input: string,
  allStatements: Map<AgentId, string[]>,
  debaters: AgentRole[],
  config: DebateConfig,
  agents: AgentRole[],
  agentResults: Map<AgentId, AgentResult>,
  options: {
    context: any;
    signal?: AbortSignal;
    hooks?: any;
    trace: any;
  }
): Promise<string> {
  switch (config.consensusStrategy) {
    case "judge": {
      if (!config.judgeId) {
        throw new Error("Judge ID required for judge consensus strategy");
      }

      const judge = requireAgent(agents, config.judgeId);

      // Prepare summary of debate for judge
      const debateSummary = debaters
        .map((d) => {
          const statements = allStatements.get(d.id) ?? [];
          return `[${d.role ?? d.id}]:\nInitial: ${statements[0]}\nFinal: ${statements[statements.length - 1]}`;
        })
        .join("\n\n---\n\n");

      const judgePrompt = `You are the judge of a debate. Review the following positions and determine the best conclusion or synthesis.

Topic: ${input}

Debate Summary:
${debateSummary}

Provide your judgment:
1. Summarize the key points of agreement and disagreement
2. Evaluate the strength of each position
3. Provide a final verdict or synthesis that best addresses the original topic`;

      const judgeResult = await runAgent(judge, judgePrompt, options);
      agentResults.set(config.judgeId, judgeResult);

      return judgeResult.response;
    }

    case "agreement": {
      // Synthesize from final statements
      const finalStatements = debaters
        .map((d) => {
          const statements = allStatements.get(d.id) ?? [];
          return `[${d.role ?? d.id}]: ${statements[statements.length - 1]}`;
        })
        .join("\n\n");

      return `Debate Conclusion:\n\n${finalStatements}`;
    }

    case "voting": {
      // Each debater votes on the best position
      const votes = new Map<AgentId, AgentId>();

      for (const voter of debaters) {
        const otherPositions = debaters
          .filter((d) => d.id !== voter.id)
          .map((d) => {
            const statements = allStatements.get(d.id) ?? [];
            return `${d.id}: ${statements[statements.length - 1]}`;
          })
          .join("\n\n");

        const votePrompt = `Based on the debate, vote for the position (other than your own) that you find most compelling.

Other positions:
${otherPositions}

Respond with just the ID of the position you vote for.`;

        const voteResult = await runAgent(voter, votePrompt, options);

        // Parse vote
        const votedFor = debaters.find(
          (d) =>
            d.id !== voter.id &&
            voteResult.response.toLowerCase().includes(d.id.toLowerCase())
        );
        if (votedFor) {
          votes.set(voter.id, votedFor.id);
        }
      }

      // Count votes
      const voteCounts = new Map<AgentId, number>();
      for (const votedFor of votes.values()) {
        voteCounts.set(votedFor, (voteCounts.get(votedFor) ?? 0) + 1);
      }

      // Find winner
      let winner: AgentId | undefined;
      let maxVotes = 0;
      for (const [id, count] of voteCounts) {
        if (count > maxVotes) {
          maxVotes = count;
          winner = id;
        }
      }

      if (winner) {
        const statements = allStatements.get(winner) ?? [];
        return statements[statements.length - 1] ?? "";
      }

      // No clear winner, return synthesis
      const allFinal = debaters
        .map((d) => {
          const statements = allStatements.get(d.id) ?? [];
          return `[${d.role ?? d.id}]: ${statements[statements.length - 1]}`;
        })
        .join("\n\n");

      return `No consensus reached. Final positions:\n\n${allFinal}`;
    }

    default:
      throw new Error(
        `Unknown consensus strategy: ${config.consensusStrategy}`
      );
  }
}
