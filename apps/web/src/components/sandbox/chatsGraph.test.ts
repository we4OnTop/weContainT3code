import type { EnvironmentId, SandboxInfo } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildChatsGraph } from "./chatsGraph";

const env = (id: string) => id as EnvironmentId;

describe("buildChatsGraph", () => {
  it("names sandboxes after their project and links each chat to its environment", () => {
    const sandbox = {
      sandboxId: "s1",
      name: "t3-t3code-1c394b6f",
      projectCwd: "C:/Users/me/t3code",
      status: "running",
    } as unknown as SandboxInfo;
    const graph = buildChatsGraph({
      environments: [
        { environmentId: env("host"), label: "DESKTOP" },
        { environmentId: env("box"), label: "t3-t3code-1c394b6f" },
      ],
      primaryEnvironmentId: env("host"),
      sandboxesByEnvironmentId: new Map([[env("box"), sandbox]]),
      threads: [
        {
          id: "a",
          environmentId: env("box"),
          title: "Fix {b|x} build",
          branch: "main",
          updatedAt: "2026-09-27T10:00:00.000Z",
          latestTurn: { state: "running" },
        },
        {
          id: "b",
          environmentId: env("host"),
          title: "Docs",
          branch: null,
          updatedAt: "2026-09-27T09:00:00.000Z",
          latestTurn: null,
        },
      ],
    });
    const names = graph.nodes.map((node) => node.name);
    expect(names).toContain("This machine");
    expect(names).toContain("t3code sandbox");
    expect(names).not.toContain("t3-t3code-1c394b6f");
    // Rich-text markup from a title never reaches the chart.
    expect(names).toContain("Fix (b¦x) build");
    expect(graph.links.map((link) => link.source)).toEqual(["env:box", "env:host"]);
    expect(graph.nodes.find((node) => node.name === "Docs")?.muted).toBe(true);
    expect(graph.omittedChats).toBe(0);
  });
});
