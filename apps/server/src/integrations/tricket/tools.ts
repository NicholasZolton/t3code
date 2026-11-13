import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";
import { McpSchema, Tool, Toolkit } from "effect/ai";

import * as McpInvocationContext from "../../mcp/McpInvocationContext.ts";
import * as McpToolAccess from "../../mcp/McpToolAccess.ts";
import * as ThreadManagementService from "../../orchestration-v2/ThreadManagementService.ts";
import * as TricketIntegration from "./TricketIntegration.ts";
import { Issue, Uuid } from "./schemas.ts";

export const TricketToolkit = Toolkit.make(
  Tool.make("tricket_issue", {
    description:
      "Read this thread's Tricket assignment, post a comment, or request review. Identity and ticket come from the calling thread. For writes, supply a unique commandId and reuse it only when retrying the same action. A finished turn does not complete a ticket.",
    parameters: Schema.Union([
      Schema.Struct({ action: Schema.Literal("read") }),
      Schema.Struct({
        action: Schema.Literal("comment"),
        body: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(20_000)),
        commandId: Uuid,
      }),
      Schema.Struct({ action: Schema.Literal("request_review"), commandId: Uuid }),
    ]),
    success: Issue,
    failure: OrchestratorMcpFailure,
    failureMode: "return",
    dependencies: [
      McpInvocationContext.McpInvocationContext,
      TricketIntegration.TricketIntegration,
      ThreadManagementService.ThreadManagementService,
    ],
  })
    .annotate(Tool.Title, "Tricket assignment")
    .annotate(Tool.Strict, true)
    .annotate(McpSchema.EnabledWhen, () => {
      const fiber = Fiber.getCurrent();
      const scope =
        fiber && Context.getOrUndefined(fiber.context, McpInvocationContext.McpInvocationContext);
      return (
        scope?.thread?.threadId.startsWith("tricket:") === true && scope.thread.subagent !== true
      );
    }),
);

export const layer = McpToolAccess.toLayer(TricketToolkit, {
  tricket_issue: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const caller = yield* McpInvocationContext.requireThreadScope(scope, "Tricket");
      if (caller.thread.subagent === true)
        return yield* new OrchestratorMcpFailure({
          code: "capability_denied",
          message: "Only the managed ticket thread can act on its Tricket assignment.",
        });
      const integration = yield* TricketIntegration.TricketIntegration;
      return yield* integration
        .act(caller.thread.threadId, input)
        .pipe(
          Effect.mapError(
            (error) =>
              new OrchestratorMcpFailure({ code: "invalid_request", message: error.message }),
          ),
        );
    }),
  ),
});
