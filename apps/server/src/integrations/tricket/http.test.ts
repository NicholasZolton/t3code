import { expect, it } from "vite-plus/test";
import { TRICKET_WEBHOOK_PATH } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/http/HttpRouter";

import * as TricketIntegration from "./TricketIntegration.ts";
import * as TricketHttp from "./http.ts";

it.each([
  { body: "unreadable", status: 400 },
  { body: "oversized", status: 413 },
] as const)("rejects $body webhook bodies with HTTP $status", async ({ body, status }) => {
  const { handler, dispose } = HttpRouter.toWebHandler(
    TricketHttp.layer.pipe(
      Layer.provideMerge(
        Layer.mock(TricketIntegration.TricketIntegration)({
          receive: () => Effect.die("Invalid bodies must not reach the integration"),
        }),
      ),
    ),
    { disableLogger: true },
  );
  try {
    const request = new Request(`http://env.local${TRICKET_WEBHOOK_PATH}`, {
      method: "POST",
      body:
        body === "oversized"
          ? new Uint8Array(1024 * 1024 + 1)
          : new ReadableStream<Uint8Array>({
              start(controller) {
                controller.error(new Error("Request stream failed"));
              },
            }),
      // Node's fetch requires duplex for streamed request bodies.
      duplex: "half",
    });
    expect((await handler(request)).status).toBe(status);
  } finally {
    await dispose();
  }
});
