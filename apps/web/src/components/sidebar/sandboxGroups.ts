import type { EnvironmentId, SandboxInfo } from "@t3tools/contracts";

import { sandboxProjectName } from "~/state/sandbox";

/**
 * Chats that run inside one sandbox, shown as one group in the sidebar under
 * the project's name. The host's sandbox records decide which environment is
 * a sandbox; a sandbox's own server is never asked.
 */
export interface SandboxThreadGroup<TThread> {
  readonly sandbox: SandboxInfo;
  /** The project folder name, e.g. "t3code". */
  readonly label: string;
  readonly threads: ReadonlyArray<TThread>;
}

/**
 * Splits the active chats into the ones that stay in the regular list and
 * one group per sandbox. Order inside a group follows the input order; groups
 * are ordered by label, then sandbox name, so they do not jump around.
 */
export function splitSandboxThreads<TThread extends { readonly environmentId: EnvironmentId }>(
  threads: ReadonlyArray<TThread>,
  sandboxesByEnvironmentId: ReadonlyMap<EnvironmentId, SandboxInfo>,
): {
  readonly hostThreads: ReadonlyArray<TThread>;
  readonly groups: ReadonlyArray<SandboxThreadGroup<TThread>>;
} {
  if (sandboxesByEnvironmentId.size === 0) return { hostThreads: threads, groups: [] };
  const hostThreads: TThread[] = [];
  const bySandbox = new Map<string, { sandbox: SandboxInfo; threads: TThread[] }>();
  for (const thread of threads) {
    const sandbox = sandboxesByEnvironmentId.get(thread.environmentId);
    if (sandbox === undefined) {
      hostThreads.push(thread);
      continue;
    }
    const group = bySandbox.get(sandbox.sandboxId) ?? { sandbox, threads: [] };
    group.threads.push(thread);
    bySandbox.set(sandbox.sandboxId, group);
  }
  const groups = [...bySandbox.values()]
    .map((group) => ({ ...group, label: sandboxProjectName(group.sandbox) }))
    .toSorted(
      (a, b) => a.label.localeCompare(b.label) || a.sandbox.name.localeCompare(b.sandbox.name),
    );
  return { hostThreads, groups };
}
