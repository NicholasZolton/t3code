import {
  CheckpointId,
  CheckpointRef,
  CheckpointScopeId,
  NodeId,
  RunId,
  ThreadId,
  type OrchestrationV2Checkpoint,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { deriveThreadCheckpointSummaries } from "./threadCheckpoints.ts";

function checkpoint(
  scope: string,
  ordinal: number,
  status: OrchestrationV2Checkpoint["status"] = "ready",
): OrchestrationV2Checkpoint {
  const key = `${scope}-${ordinal}`;
  return {
    id: CheckpointId.make(key),
    threadId: ThreadId.make("thread"),
    scopeId: CheckpointScopeId.make(scope),
    runId: ordinal === 0 ? null : RunId.make(key),
    nodeId: NodeId.make(key),
    parentCheckpointId: ordinal === 0 ? null : CheckpointId.make(`${scope}-${ordinal - 1}`),
    ordinalWithinScope: ordinal,
    appRunOrdinal: ordinal === 0 ? null : ordinal,
    ref: CheckpointRef.make(`refs/t3/${key}`),
    status,
    files: [],
    capturedAt: DateTime.makeUnsafe("2026-10-20T00:00:00Z"),
  };
}

describe("checkpoint review ranges", () => {
  it("uses the preceding checkpoint in the same scope, including the thread-start baseline", () => {
    const summaries = deriveThreadCheckpointSummaries({
      checkpoints: [
        checkpoint("other", 0),
        checkpoint("other", 1),
        checkpoint("current", 2),
        checkpoint("current", 0),
        checkpoint("current", 1),
      ],
      messages: [],
    });

    expect(summaries.map((summary) => [summary.runId, summary.previousCheckpointRef])).toEqual([
      ["other-1", "refs/t3/other-0"],
      ["current-2", "refs/t3/current-1"],
      ["current-1", "refs/t3/current-0"],
    ]);
  });

  it.each(["missing", "error", "stale"] as const)(
    "does not offer a Crit range whose preceding checkpoint is %s",
    (status) => {
      const summaries = deriveThreadCheckpointSummaries({
        checkpoints: [checkpoint("current", 0, status), checkpoint("current", 1)],
        messages: [],
      });

      expect(summaries[0]?.previousCheckpointRef).toBeUndefined();
    },
  );
});
