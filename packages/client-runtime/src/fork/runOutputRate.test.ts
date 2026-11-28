import {
  NodeId,
  RunAttemptId,
  RunId,
  type OrchestrationV2Run,
  type TurnTokenUsage,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";
import { deriveRunOutputRates } from "./runOutputRate.ts";

const runId = RunId.make("run");
const rootNodeId = NodeId.make("root");
const startedAt = DateTime.makeUnsafe("2026-01-01T00:00:00Z");
const completedAt = DateTime.makeUnsafe("2026-01-01T00:00:20Z");
const run: Pick<OrchestrationV2Run, "id" | "status" | "startedAt" | "completedAt"> = {
  id: runId,
  status: "completed",
  startedAt,
  completedAt,
};
const attempt = { id: RunAttemptId.make("attempt"), runId, rootNodeId };

function usage(outputTokens: number): TurnTokenUsage {
  return {
    usageScope: "main_agent",
    usageStatus: "complete",
    inputTokens: 10_000,
    outputTokens,
    reasoningTokens: 10,
    hasSubagents: true,
    otherUsage: { inputTokens: 100, outputTokens: 50 },
  };
}

function providerTurn(turnTokenUsage: TurnTokenUsage | undefined) {
  return { runAttemptId: attempt.id, nodeId: rootNodeId, turnTokenUsage };
}

describe("deriveRunOutputRates", () => {
  it("sums main-agent output across turns and divides by elapsed run time", () => {
    const secondAttempt = {
      ...attempt,
      id: RunAttemptId.make("retry"),
      rootNodeId: NodeId.make("retry-root"),
    };
    const rates = deriveRunOutputRates(
      [run],
      [attempt, secondAttempt],
      [
        providerTurn(usage(50)),
        providerTurn(usage(100)),
        {
          ...providerTurn(usage(100)),
          runAttemptId: secondAttempt.id,
          nodeId: secondAttempt.rootNodeId,
        },
        { ...providerTurn(usage(500)), nodeId: NodeId.make("child") },
        providerTurn({ ...usage(500), localCommand: true }),
        { ...providerTurn(undefined), promptDropped: true },
      ],
    );

    expect(rates?.get(runId)).toEqual({ elapsedMs: 20_000, tokensPerSecond: 12.5 });
  });

  it.each([undefined, { ...usage(100), usageStatus: "partial" }] satisfies ReadonlyArray<
    TurnTokenUsage | undefined
  >)("omits a rate if any main-agent turn lacks complete usage (%j)", (missing) => {
    expect(
      deriveRunOutputRates([run], [attempt], [providerTurn(usage(100)), providerTurn(missing)]),
    ).toBeUndefined();
  });

  it("omits a rate for an unfinished run or a run with no measurable elapsed time", () => {
    const turns = [providerTurn(usage(100))];
    expect(
      deriveRunOutputRates([{ ...run, status: "running", completedAt: null }], [attempt], turns),
    ).toBeUndefined();
    expect(
      deriveRunOutputRates([{ ...run, completedAt: startedAt }], [attempt], turns),
    ).toBeUndefined();
  });
});
