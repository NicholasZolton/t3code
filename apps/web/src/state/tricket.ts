import { createTricketEnvironmentAtoms } from "@t3tools/client-runtime/state/tricket";
import { connectionAtomRuntime } from "../connection/runtime";

export const tricketEnvironment = createTricketEnvironmentAtoms(connectionAtomRuntime);
