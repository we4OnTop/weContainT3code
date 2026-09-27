import { createThreadInspectionAtoms } from "@t3tools/client-runtime/state/threadInspection";

import { connectionAtomRuntime } from "../connection/runtime";

export const threadInspection = createThreadInspectionAtoms(connectionAtomRuntime);
