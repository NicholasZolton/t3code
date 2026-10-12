import {
  connectionRouteId,
  connectionRouteKind,
  connectionRoutes,
  type ConnectionCatalogEntry,
  type PreparedConnection,
} from "@t3tools/client-runtime/connection";
import type { DesktopSshEnvironmentTarget } from "@t3tools/contracts";
import { isLocalLoopbackHost, isTailnetHost } from "@t3tools/shared/hostClassification";
import * as Option from "effect/Option";

type CritForwarding =
  | { readonly kind: "local" }
  | { readonly kind: "ssh"; readonly target: DesktopSshEnvironmentTarget }
  | { readonly kind: "tailscale" };

/** Forward through the connected route, which can change after reconnecting. */
export function resolveCritForwarding(
  entry: ConnectionCatalogEntry | null,
  connection: PreparedConnection | null,
): CritForwarding {
  if (entry === null || connection === null) {
    throw new Error("The environment is not ready to open Crit. Wait for it to reconnect.");
  }
  const route = connectionRoutes(entry).find(
    (candidate) => connectionRouteId(candidate.target) === connectionRouteId(connection.target),
  );
  if (connection.target._tag === "SshConnectionTarget") {
    const profile = route ? Option.getOrNull(route.profile) : null;
    if (profile?._tag !== "SshConnectionProfile") {
      throw new Error("The SSH connection is not ready to forward Crit.");
    }
    return { kind: "ssh", target: profile.target };
  }
  const hostname = new URL(connection.httpBaseUrl).hostname;
  if ((route && connectionRouteKind(route) === "tailnet") || isTailnetHost(hostname)) {
    return { kind: "tailscale" };
  }
  if (isLocalLoopbackHost(hostname)) return { kind: "local" };
  throw new Error("Remote Crit reviews require a Tailscale or SSH connection.");
}
