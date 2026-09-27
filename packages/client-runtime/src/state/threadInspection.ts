import { WS_METHODS } from "@t3tools/contracts";
import type { Atom } from "effect/unstable/reactivity";

import { createAtomCommandScheduler, createEnvironmentRpcCommand } from "./runtime.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";

export function createThreadInspectionAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const scheduler = createAtomCommandScheduler();
  return {
    // The record of a running chat changes every second; it is read on demand.
    inspect: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:thread:inspect",
      tag: WS_METHODS.threadInspect,
      scheduler,
    }),
  };
}
