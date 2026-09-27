import type { EnvironmentId, SandboxInfo } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { splitSandboxThreads } from "./sandboxGroups";

const env = (id: string) => id as EnvironmentId;
const sandbox = (id: string, name: string, projectCwd: string): SandboxInfo =>
  ({ sandboxId: id, name, projectCwd, environmentId: env(`env-${id}`) }) as unknown as SandboxInfo;
const chat = (id: string, environmentId: string) => ({ id, environmentId: env(environmentId) });

describe("splitSandboxThreads", () => {
  it("gathers every sandbox chat under its project, active first then settled", () => {
    const t3 = sandbox("s1", "t3-t3code-1c394b6f", "C:/Users/me/combined/t3code");
    const we = sandbox("s2", "t3-wecontain-092f4843", "C:/Users/me/weContain");
    const byEnv = new Map([
      [t3.environmentId!, t3],
      [we.environmentId!, we],
    ]);
    const { remaining, groups } = splitSandboxThreads(
      {
        active: [chat("a", "host"), chat("b", "env-s2"), chat("c", "env-s1")],
        snoozed: [chat("z", "host")],
        settled: [chat("d", "env-s2"), chat("e", "host")],
      },
      byEnv,
    );
    expect(remaining.active.map((thread) => thread.id)).toEqual(["a"]);
    expect(remaining.snoozed.map((thread) => thread.id)).toEqual(["z"]);
    expect(remaining.settled.map((thread) => thread.id)).toEqual(["e"]);
    expect(
      groups.map((group) => [
        group.label,
        group.threads.map((entry) => `${entry.thread.id}:${entry.section}`),
      ]),
    ).toEqual([
      ["t3code", ["c:active"]],
      ["weContain", ["b:active", "d:settled"]],
    ]);
  });

  it("passes everything through when there are no sandboxes", () => {
    const sections = { active: [chat("a", "host")], snoozed: [], settled: [] };
    expect(splitSandboxThreads(sections, new Map()).remaining).toBe(sections);
  });
});
