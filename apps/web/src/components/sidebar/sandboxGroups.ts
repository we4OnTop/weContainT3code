import type { EnvironmentId, SandboxInfo } from "@t3tools/contracts";

import { sandboxProjectName } from "~/state/sandbox";

/** Where a chat sits in the regular list; a group keeps its look. */
export type SandboxGroupSection = "active" | "snoozed" | "settled";

/**
 * Chats that run inside one sandbox, shown as one group in the sidebar under
 * the project's name. The host's sandbox records decide which environment is
 * a sandbox; a sandbox's own server is never asked.
 */
export interface SandboxThreadGroup<TThread> {
  readonly sandbox: SandboxInfo;
  /** The project folder name, e.g. "t3code". */
  readonly label: string;
  /** Active chats first, then snoozed, then settled. */
  readonly threads: ReadonlyArray<{
    readonly thread: TThread;
    readonly section: SandboxGroupSection;
  }>;
}

type Sections<TThread> = Readonly<Record<SandboxGroupSection, ReadonlyArray<TThread>>>;

/**
 * Takes every sandbox chat out of the active, snoozed and settled lists and
 * gathers it under its sandbox. Pinned chats are not passed in: a pin stays
 * where the user put it. Order inside a group follows the input order; groups
 * are ordered by label, then sandbox name, so they do not jump around.
 */
export function splitSandboxThreads<TThread extends { readonly environmentId: EnvironmentId }>(
  sections: Sections<TThread>,
  sandboxesByEnvironmentId: ReadonlyMap<EnvironmentId, SandboxInfo>,
): {
  readonly remaining: Sections<TThread>;
  readonly groups: ReadonlyArray<SandboxThreadGroup<TThread>>;
} {
  if (sandboxesByEnvironmentId.size === 0) return { remaining: sections, groups: [] };
  const bySandbox = new Map<
    string,
    { sandbox: SandboxInfo; threads: { thread: TThread; section: SandboxGroupSection }[] }
  >();
  const keep = (section: SandboxGroupSection) =>
    sections[section].filter((thread) => {
      const sandbox = sandboxesByEnvironmentId.get(thread.environmentId);
      if (sandbox === undefined) return true;
      const group = bySandbox.get(sandbox.sandboxId) ?? { sandbox, threads: [] };
      group.threads.push({ thread, section });
      bySandbox.set(sandbox.sandboxId, group);
      return false;
    });
  const remaining = { active: keep("active"), snoozed: keep("snoozed"), settled: keep("settled") };
  const groups = [...bySandbox.values()]
    .map((group) => ({ ...group, label: sandboxProjectName(group.sandbox) }))
    .toSorted(
      (a, b) => a.label.localeCompare(b.label) || a.sandbox.name.localeCompare(b.sandbox.name),
    );
  return { remaining, groups };
}
