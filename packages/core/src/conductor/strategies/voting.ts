/**
 * Voting orchestration strategy
 *
 * Democratic decision-making among agents
 */

import type {
  AgentId,
  AgentRole,
  AgentResult,
  Conductor,
  ConductorRunOptions,
  EnsembleResult,
  VotingConfig,
} from "../../types/index.js";
import { createContext } from "../../context.js";
import {
  createTrace,
  runAgent,
  createEnsembleResult,
  checkAbort,
  findAgent,
} from "../base.js";

/**
 * Vote result from an agent
 */
type Vote = {
  agentId: AgentId;
  choice: string;
  reasoning?: string;
  rank?: number[]; // For ranked voting
};

/**
 * Create a voting conductor
 */
export function createVotingConductor(config: VotingConfig): Conductor {
  async function orchestrate(
    input: string,
    agents: AgentRole[],
    options?: ConductorRunOptions
  ): Promise<EnsembleResult> {
    const context = options?.context ?? createContext();
    const trace = createTrace();
    const agentResults = new Map<AgentId, AgentResult>();
    const votes: Vote[] = [];

    // Call onStart hook
    await config.hooks?.onStart?.(input, agents);
    await options?.hooks?.onStart?.(input, agents);

    // Determine voters
    const voterIds = config.voters ?? agents.map((a) => a.id);
    const voters = voterIds
      .map((id) => findAgent(agents, id))
      .filter((a): a is AgentRole => a !== undefined);

    // Check quorum
    const quorum = config.quorum ?? 0.5;
    const minVoters = Math.ceil(voters.length * quorum);

    if (voters.length < minVoters) {
      throw new Error(
        `Not enough voters. Need ${minVoters}, have ${voters.length}`
      );
    }

    // Get or generate options
    const votingOptions = config.options ?? (await generateOptions(input, voters, {
      context,
      signal: options?.signal,
      hooks: options?.hooks,
      trace,
      agentResults,
    }));

    if (votingOptions.length < 2) {
      throw new Error("Voting requires at least 2 options");
    }

    // Collect votes based on voting method
    for (const voter of voters) {
      checkAbort(options?.signal);

      const vote = await collectVote(voter, input, votingOptions, config, {
        context,
        signal: options?.signal,
        hooks: options?.hooks,
        trace,
      });

      votes.push(vote);
      agentResults.set(voter.id, {
        response: `Vote: ${vote.choice}${vote.reasoning ? ` (${vote.reasoning})` : ""}`,
        messages: [],
        iterations: 1,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      });

      // Emit vote hook
      await config.hooks?.onVote?.(voter.id, vote);
      await options?.hooks?.onVote?.(voter.id, vote);
    }

    // Tally votes and determine winner
    const result = tallyVotes(votes, votingOptions, config);

    const ensembleResult = createEnsembleResult(result, agentResults, trace);

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
 * Generate voting options from agents
 */
async function generateOptions(
  input: string,
  voters: AgentRole[],
  options: {
    context: any;
    signal?: AbortSignal;
    hooks?: any;
    trace: any;
    agentResults: Map<AgentId, AgentResult>;
  }
): Promise<string[]> {
  const generatedOptions: string[] = [];

  // Each voter proposes an option
  for (const voter of voters) {
    checkAbort(options.signal);

    const proposalPrompt = `Given the following question or topic, propose a single option or solution.

Topic: ${input}

Provide a clear, concise option (1-2 sentences). Just state the option, no explanation needed.`;

    const result = await runAgent(voter, proposalPrompt, options);
    options.agentResults.set(voter.id, result);

    // Extract the proposal
    const proposal = result.response.trim();
    if (proposal && !generatedOptions.includes(proposal)) {
      generatedOptions.push(proposal);
    }
  }

  return generatedOptions;
}

/**
 * Collect a vote from an agent
 */
async function collectVote(
  voter: AgentRole,
  input: string,
  votingOptions: string[],
  config: VotingConfig,
  options: {
    context: any;
    signal?: AbortSignal;
    hooks?: any;
    trace: any;
  }
): Promise<Vote> {
  const optionsList = votingOptions
    .map((opt, i) => `${i + 1}. ${opt}`)
    .join("\n");

  let votePrompt: string;

  if (config.method === "ranked") {
    votePrompt = `You are voting on the following topic. Rank ALL options from most preferred to least preferred.

Topic: ${input}

Options:
${optionsList}

Respond with ONLY the numbers in your preferred order, separated by commas.
Example: "2, 1, 3" means option 2 is your top choice, then 1, then 3.`;
  } else {
    votePrompt = `You are voting on the following topic. Choose ONE option.

Topic: ${input}

Options:
${optionsList}

Respond with ONLY the number of your choice (e.g., "1" or "2").`;
  }

  const result = await runAgent(voter, votePrompt, options);

  // Parse the vote
  const responseText = result.response.trim();

  if (config.method === "ranked") {
    // Parse ranked vote
    const ranks = responseText
      .split(/[,\s]+/)
      .map((s) => parseInt(s.trim(), 10) - 1)
      .filter((n) => !isNaN(n) && n >= 0 && n < votingOptions.length);

    return {
      agentId: voter.id,
      choice: votingOptions[ranks[0] ?? 0] ?? votingOptions[0] ?? "",
      rank: ranks,
    };
  } else {
    // Parse single choice
    const match = responseText.match(/(\d+)/);
    const choiceIndex = match ? parseInt(match[1]!, 10) - 1 : 0;
    const validIndex = Math.max(
      0,
      Math.min(choiceIndex, votingOptions.length - 1)
    );

    return {
      agentId: voter.id,
      choice: votingOptions[validIndex] ?? "",
    };
  }
}

/**
 * Tally votes and determine winner
 */
function tallyVotes(
  votes: Vote[],
  options: string[],
  config: VotingConfig
): string {
  switch (config.method) {
    case "majority": {
      const counts = new Map<string, number>();
      for (const vote of votes) {
        const weight = config.weights?.get(vote.agentId) ?? 1;
        counts.set(vote.choice, (counts.get(vote.choice) ?? 0) + weight);
      }

      let winner = options[0];
      let maxCount = 0;
      for (const [choice, count] of counts) {
        if (count > maxCount) {
          maxCount = count;
          winner = choice;
        }
      }

      const totalWeight = votes.reduce(
        (sum, v) => sum + (config.weights?.get(v.agentId) ?? 1),
        0
      );
      const percentage = ((maxCount / totalWeight) * 100).toFixed(1);

      return `Voting Result (Majority): ${winner}\n\nVotes: ${maxCount}/${totalWeight} (${percentage}%)`;
    }

    case "unanimous": {
      const firstChoice = votes[0]?.choice;
      const isUnanimous = votes.every((v) => v.choice === firstChoice);

      if (isUnanimous && firstChoice) {
        return `Voting Result (Unanimous): ${firstChoice}\n\nAll ${votes.length} voters agreed.`;
      }

      // Count votes for summary
      const counts = new Map<string, number>();
      for (const vote of votes) {
        counts.set(vote.choice, (counts.get(vote.choice) ?? 0) + 1);
      }

      const summary = Array.from(counts.entries())
        .map(([choice, count]) => `- ${choice}: ${count} votes`)
        .join("\n");

      return `Voting Result: No unanimous decision reached.\n\nVote breakdown:\n${summary}`;
    }

    case "weighted": {
      const counts = new Map<string, number>();
      for (const vote of votes) {
        const weight = config.weights?.get(vote.agentId) ?? 1;
        counts.set(vote.choice, (counts.get(vote.choice) ?? 0) + weight);
      }

      let winner = options[0];
      let maxCount = 0;
      for (const [choice, count] of counts) {
        if (count > maxCount) {
          maxCount = count;
          winner = choice;
        }
      }

      const totalWeight = votes.reduce(
        (sum, v) => sum + (config.weights?.get(v.agentId) ?? 1),
        0
      );

      const breakdown = Array.from(counts.entries())
        .map(([choice, count]) => `- ${choice}: ${count.toFixed(1)} weighted votes`)
        .join("\n");

      return `Voting Result (Weighted): ${winner}\n\nWeighted votes: ${maxCount.toFixed(1)}/${totalWeight}\n\n${breakdown}`;
    }

    case "ranked": {
      // Instant-runoff voting (IRV)
      const remainingOptions = new Set(options);
      const ballots = votes.map((v) => [...(v.rank ?? [])]);

      while (remainingOptions.size > 1) {
        // Count first-choice votes
        const counts = new Map<number, number>();
        for (const ballot of ballots) {
          const firstChoice = ballot.find((i) => {
            const opt = options[i];
            return opt !== undefined && remainingOptions.has(opt);
          });
          if (firstChoice !== undefined) {
            counts.set(firstChoice, (counts.get(firstChoice) ?? 0) + 1);
          }
        }

        // Check for majority
        const totalVotes = Array.from(counts.values()).reduce((a, b) => a + b, 0);
        for (const [optionIndex, count] of counts) {
          if (count > totalVotes / 2) {
            const winner = options[optionIndex] ?? "";
            return `Voting Result (Ranked Choice): ${winner}\n\nWon with ${count}/${totalVotes} votes after instant-runoff.`;
          }
        }

        // Eliminate lowest
        let minCount = Infinity;
        let toEliminate = -1;
        for (const [optionIndex, count] of counts) {
          if (count < minCount) {
            minCount = count;
            toEliminate = optionIndex;
          }
        }

        if (toEliminate >= 0) {
          const optToDelete = options[toEliminate];
          if (optToDelete) {
            remainingOptions.delete(optToDelete);
          }
        } else {
          break;
        }
      }

      // Return remaining option
      const winner = Array.from(remainingOptions)[0] ?? options[0];
      return `Voting Result (Ranked Choice): ${winner}\n\nWon after eliminating lower-ranked options.`;
    }

    default:
      throw new Error(`Unknown voting method: ${config.method}`);
  }
}
