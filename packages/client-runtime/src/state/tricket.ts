import { TRICKET_RPC_METHODS } from "@t3tools/contracts";
import type { Atom } from "effect/reactivity";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createEnvironmentRpcCommand } from "./runtime.ts";

export function createTricketEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    get: createEnvironmentRpcCommand(runtime, {
      label: "environment:tricket:get",
      tag: TRICKET_RPC_METHODS.get,
    }),
    update: createEnvironmentRpcCommand(runtime, {
      label: "environment:tricket:update",
      tag: TRICKET_RPC_METHODS.update,
    }),
    reconcile: createEnvironmentRpcCommand(runtime, {
      label: "environment:tricket:reconcile",
      tag: TRICKET_RPC_METHODS.reconcile,
    }),
  };
}
