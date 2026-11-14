import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { McpSchema } from "effect/ai";

import * as McpInvocationContext from "../../mcp/McpInvocationContext.ts";
import { TricketToolkit } from "./tools.ts";

it.effect.each([
  { threadId: "tricket-lead:lead", subagent: false, expected: ["tricket"] },
  { threadId: "tricket:ticket", subagent: false, expected: ["tricket_issue", "tricket"] },
  { threadId: "ordinary-thread", subagent: false, expected: [] },
  { threadId: "tricket-lead:lead", subagent: true, expected: [] },
  { threadId: "tricket:ticket", subagent: true, expected: [] },
  { threadId: null, subagent: false, expected: [] },
])(
  "limits native Tricket MCP exposure for $threadId (subagent: $subagent)",
  ({ threadId, subagent, expected }) => {
    const scope: McpInvocationContext.McpInvocationScope = {
      environmentId: EnvironmentId.make("fixture-environment"),
      requestNamespace: "fixture",
      thread:
        threadId === null
          ? undefined
          : {
              threadId: ThreadId.make(threadId),
              providerSessionId: "fixture",
              providerInstanceId: ProviderInstanceId.make("fixture"),
              subagent,
            },
      client: undefined,
      capabilities: new Set(["orchestration"]),
      issuedAt: 1,
    };
    return Effect.sync(() => {
      const listed = Object.values(TricketToolkit.tools)
        .filter(
          (tool) =>
            Context.getOrUndefined(
              tool.annotations,
              McpSchema.EnabledWhen,
            )?.({ protocolVersion: "2025-06-18", capabilities: {} }) ?? true,
        )
        .map((tool) => tool.name);
      expect(listed).toEqual(expected);
    }).pipe(Effect.provideService(McpInvocationContext.McpInvocationContext, scope));
  },
);
