import { createMemoryHistory } from "@tanstack/react-router";
import { expect, it } from "vite-plus/test";

import { getRouter, type AppRouter } from "./router";

it("opens reusable prompts inside the scoped settings layout", () => {
  const router: AppRouter = getRouter(createMemoryHistory());
  const matches: ReturnType<AppRouter["matchRoutes"]> = router.matchRoutes("/settings/prompts", {
    machine: "remote-server",
  });

  expect(matches.map((match) => match.routeId)).toEqual([
    "__root__",
    "/_chat",
    "/_chat/settings",
    "/_chat/settings/prompts",
  ]);
  expect(matches.at(-1)?.search).toEqual({ machine: "remote-server" });
});
