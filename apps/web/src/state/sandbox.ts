import type { EnvironmentId, SandboxInfo } from "@t3tools/contracts";
import { createSandboxEnvironmentAtoms } from "@t3tools/client-runtime/state/sandbox";
import { useMemo } from "react";

import { connectionAtomRuntime } from "../connection/runtime";
import { useEnvironments, usePrimaryEnvironmentId } from "./environments";
import { useEnvironmentQuery } from "./query";

export const sandboxEnvironment = createSandboxEnvironmentAtoms(connectionAtomRuntime);

const NO_SANDBOXES: ReadonlyMap<EnvironmentId, SandboxInfo> = new Map();

/**
 * The host's own sandboxes, keyed by the environment id of each sandbox's t3
 * server. Only the primary (host) environment is asked: a sandbox's server is
 * untrusted and could describe itself however it likes, while the host recorded
 * the id when it created the sandbox.
 */
export function useHostSandboxesByEnvironmentId(): ReadonlyMap<EnvironmentId, SandboxInfo> {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const hostSupportsSandboxes = environments.some(
    (environment) =>
      environment.environmentId === primaryEnvironmentId &&
      environment.serverConfig?.environment.capabilities.sandboxes === true,
  );
  const listQuery = useEnvironmentQuery(
    primaryEnvironmentId !== null && hostSupportsSandboxes
      ? sandboxEnvironment.list({ environmentId: primaryEnvironmentId, input: {} })
      : null,
  );
  const sandboxes = listQuery.data?.sandboxes;
  return useMemo(() => {
    if (sandboxes === undefined) return NO_SANDBOXES;
    const byEnvironmentId = new Map<EnvironmentId, SandboxInfo>();
    for (const sandbox of sandboxes) {
      if (sandbox.environmentId !== undefined) {
        byEnvironmentId.set(sandbox.environmentId, sandbox);
      }
    }
    return byEnvironmentId;
  }, [sandboxes]);
}

/** Folder name of the project a sandbox mirrors, for compact labels. */
export function sandboxProjectName(sandbox: SandboxInfo): string {
  return sandbox.projectCwd.split(/[\\/]/).findLast((part) => part.length > 0) ?? sandbox.name;
}
