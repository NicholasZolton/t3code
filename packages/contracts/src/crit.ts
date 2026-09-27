import * as Schema from "effect/Schema";
import {
  CheckpointRef,
  NonNegativeInt,
  PositiveInt,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

export const CritOpenInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  scope: Schema.Union([
    Schema.Struct({ kind: Schema.Literal("working-tree") }),
    Schema.Struct({ kind: Schema.Literal("branch"), baseRef: TrimmedNonEmptyString }),
    Schema.Struct({
      kind: Schema.Literal("pull-request"),
      provider: Schema.Literals(["github", "gitlab"]),
      url: TrimmedNonEmptyString,
      number: PositiveInt,
      commit: Schema.optional(TrimmedNonEmptyString),
    }),
    Schema.Struct({
      kind: Schema.Literal("turn"),
      threadId: ThreadId,
      fromTurnCount: NonNegativeInt,
      fromRef: Schema.optional(CheckpointRef),
      toRef: CheckpointRef,
    }),
  ]),
});
export type CritOpenInput = typeof CritOpenInput.Type;

export class CritOpenError extends Schema.TaggedError<CritOpenError>()("CritOpenError", {
  message: Schema.String,
}) {}
