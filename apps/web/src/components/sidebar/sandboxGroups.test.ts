import type { EnvironmentId, SandboxInfo } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { splitSandboxThreads } from "./sandboxGroups";

const env = (id: string) => id as EnvironmentId;
const sandbox = (id: string, name: string, projectCwd: string): SandboxInfo =>
  ({ sandboxId: id, name, projectCwd, environmentId: env(`env-${id}`) }) as unknown as SandboxInfo;

describe("splitSandboxThreads", () => {
  it("keeps host chats in the list and groups sandbox chats under their project", () => {
    const t3 = sandbox("s1", "t3-t3code-1c394b6f", "C:/Users/me/combined/t3code");
    const we = sandbox("s2", "t3-wecontain-092f4843", "C:/Users/me/weContain");
    const byEnv = new Map([
      [t3.environmentId!, t3],
      [we.environmentId!, we],
    ]);
    const threads = [
      { id: "a", environmentId: env("host") },
      { id: "b", environmentId: env("env-s2") },
      { id: "c", environmentId: env("env-s1") },
      { id: "d", environmentId: env("env-s2") },
    ];
    const { hostThreads, groups } = splitSandboxThreads(threads, byEnv);
    expect(hostThreads.map((thread) => thread.id)).toEqual(["a"]);
    expect(groups.map((group) => [group.label, group.threads.map((t) => t.id)])).toEqual([
      ["t3code", ["c"]],
      ["weContain", ["b", "d"]],
    ]);
  });

  it("passes everything through when there are no sandboxes", () => {
    const threads = [{ id: "a", environmentId: env("host") }];
    expect(splitSandboxThreads(threads, new Map()).hostThreads).toBe(threads);
  });
});
