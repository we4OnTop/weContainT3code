import type { SandboxActivityEvent, SandboxInfo } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildObservatoryGraph, chartText } from "./observatoryGraph";

const sandbox = (overrides: Partial<SandboxInfo> = {}) =>
  ({
    sandboxId: "sbx-1",
    name: "t3-app-1",
    status: "running",
    ...overrides,
  }) as SandboxInfo;

const event = (overrides: Partial<SandboxActivityEvent>): SandboxActivityEvent => ({
  id: "1",
  sandboxId: "sbx-1",
  sandboxName: "t3-app-1",
  at: "2026-09-24T10:00:00.000Z",
  kind: "sync",
  source: "agent",
  ok: true,
  summary: "2 new commit(s)",
  flags: [],
  ...overrides,
});

describe("chartText", () => {
  it("neutralizes ECharts rich-text markup and control characters", () => {
    expect(chartText("{evil|x}\u001b[31m")).toBe("(evil¦x) [31m");
    expect(chartText("a".repeat(10), 5)).toBe("aaaa…");
  });
});

describe("buildObservatoryGraph", () => {
  it("links sandboxes to the receiver and the receiver to pushed remotes", () => {
    const graph = buildObservatoryGraph({
      sandboxes: [sandbox()],
      events: [
        event({}),
        event({ id: "2", target: "receiver" }),
        event({ id: "3", kind: "remote-push", source: "user", target: "origin/main" }),
      ],
      network: [],
      channels: [],
    });

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "receiver",
      "proxy",
      "sandbox:sbx-1",
      "remote:origin",
    ]);
    expect(graph.links.map((link) => [link.source, link.target, link.label])).toEqual([
      ["sandbox:sbx-1", "receiver", "1 sync"],
      ["receiver", "remote:origin", "1 push"],
    ]);
  });

  it("marks tampered sandboxes, flagged commands and blocked traffic", () => {
    const graph = buildObservatoryGraph({
      sandboxes: [sandbox({ name: "{x|y}" })],
      events: [event({ kind: "command", ok: false, flags: ["privilege"] })],
      network: [
        {
          sandboxName: "{x|y}",
          sandboxId: "sbx-1",
          host: "evil.example.com:443",
          outcome: "blocked",
          reason: null,
          rule: null,
          firstSeen: "",
          lastSeen: "",
          count: 1,
        },
      ],
      channels: [
        {
          sandboxId: "sbx-1",
          connected: true,
          supported: true,
          sudo: false,
          commandLog: true,
          tamper: ["command-log-disabled"],
          since: null,
        },
      ],
    });

    const node = graph.nodes.find((candidate) => candidate.id === "sandbox:sbx-1");
    expect(node?.alert).toBe(true);
    expect(node?.name).toBe("(x¦y)");
    expect(graph.links).toEqual([
      expect.objectContaining({ target: "proxy", label: "1 blocked", alert: true }),
    ]);
  });

  it("keeps removed sandboxes with history, muted", () => {
    const graph = buildObservatoryGraph({
      sandboxes: [],
      events: [event({ sandboxId: "gone", sandboxName: "old-box", target: "receiver" })],
      network: [],
      channels: [],
    });

    expect(graph.nodes.find((node) => node.id === "sandbox:gone")).toMatchObject({
      muted: true,
      name: "old-box",
    });
  });
});
