import {
  CheckpointId,
  CheckpointRef,
  CheckpointScopeId,
  NodeId,
  type OrchestrationV2Checkpoint,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { deriveThreadCheckpointSummaries } from "./threadCheckpoints.ts";

const capturedAt = DateTime.makeUnsafe("2026-10-22T12:00:00Z");

function checkpoint(
  scope: string,
  ordinal: number,
  overrides: Partial<OrchestrationV2Checkpoint> = {},
): OrchestrationV2Checkpoint {
  return {
    id: CheckpointId.make(`${scope}-${ordinal}`),
    threadId: ThreadId.make("thread"),
    scopeId: CheckpointScopeId.make(scope),
    nodeId: NodeId.make(`${scope}-node-${ordinal}`),
    runId: ordinal === 0 ? null : RunId.make(`${scope}-run-${ordinal}`),
    parentCheckpointId: ordinal === 0 ? null : CheckpointId.make(`${scope}-${ordinal - 1}`),
    ordinalWithinScope: ordinal,
    appRunOrdinal: ordinal === 0 ? null : ordinal,
    ref: CheckpointRef.make(`refs/t3/${scope}/${ordinal}`),
    status: "ready",
    files: [],
    capturedAt,
    ...overrides,
  };
}

describe("checkpoint review bases", () => {
  it("uses the preceding ready checkpoint in the same scope, including the thread baseline", () => {
    const baseline = checkpoint("root", 0);
    const first = checkpoint("root", 1);
    const next = checkpoint("root", 2);
    const otherScope = checkpoint("other", 1);

    const summaries = deriveThreadCheckpointSummaries({
      checkpoints: [otherScope, next, first, baseline],
      messages: [],
    });

    expect(
      summaries.map(({ checkpointRef, previousCheckpointRef }) => ({
        checkpointRef,
        previousCheckpointRef,
      })),
    ).toEqual([
      { checkpointRef: otherScope.ref, previousCheckpointRef: undefined },
      { checkpointRef: next.ref, previousCheckpointRef: first.ref },
      { checkpointRef: first.ref, previousCheckpointRef: baseline.ref },
    ]);
  });

  it.each(["missing", "error", "stale"] as const)(
    "does not use a %s checkpoint or jump across a gap in the scope",
    (status) => {
      const summaries = deriveThreadCheckpointSummaries({
        checkpoints: [
          checkpoint("root", 0),
          checkpoint("root", 1, { status }),
          checkpoint("root", 2),
          checkpoint("root", 4),
        ],
        messages: [],
      });

      expect(summaries[1]).not.toHaveProperty("previousCheckpointRef");
      expect(summaries[2]).not.toHaveProperty("previousCheckpointRef");
    },
  );
});
