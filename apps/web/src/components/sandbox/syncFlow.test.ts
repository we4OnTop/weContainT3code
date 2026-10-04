import type { SandboxActivityEvent, SandboxInfo } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildSyncFlow, SYNC_FLOW_CARD } from "./syncFlow";

const NOW = Date.parse("2026-10-04T12:00:00.000Z");

const sandbox = {
  sandboxId: "sbx-1",
  name: "t3-app-1",
  status: "running",
  branch: null,
} as unknown as SandboxInfo;

const event = (overrides: Partial<SandboxActivityEvent>): SandboxActivityEvent => ({
  id: "e",
  sandboxId: "sbx-1",
  sandboxName: "t3-app-1",
  at: "2026-10-04T11:50:00.000Z",
  kind: "sync",
  source: "user",
  ok: true,
  summary: "2 new commit(s) on sandbox/t3-app-1",
  target: "receiver",
  flags: [],
  ...overrides,
});

const channel = {
  sandboxId: "sbx-1",
  connected: true,
  supported: true,
  sudo: false,
  commandLog: false,
  tamper: [],
  since: null,
};

const statusOf = (flow: ReturnType<typeof buildSyncFlow>, id: string) =>
  flow.stages.flatMap((stage) => stage.cards).find((card) => card.id === id)?.status;

describe("buildSyncFlow", () => {
  it("marks every hop done after a mirrored sync and a push", () => {
    const flow = buildSyncFlow({
      sandbox,
      events: [
        event({ kind: "remote-push", summary: "2 commit(s) pushed", target: "origin/feature" }),
        event({}),
      ],
      channel,
      docker: { available: true, reason: null },
      now: NOW,
    });
    expect(statusOf(flow, SYNC_FLOW_CARD.hostBranch)).toBe("done");
    expect(statusOf(flow, SYNC_FLOW_CARD.receiver)).toBe("done");
    expect(statusOf(flow, SYNC_FLOW_CARD.remote)).toBe("done");
    expect(flow.stages.at(-1)?.cards[0]?.title).toBe("origin/feature");
  });

  it("blames the host branch for a failed sync and leaves the receiver waiting", () => {
    const flow = buildSyncFlow({
      sandbox,
      events: [event({ ok: false, summary: "Sync failed: fatal: bad ref" })],
      channel,
      docker: { available: true, reason: null },
      now: NOW,
    });
    expect(statusOf(flow, SYNC_FLOW_CARD.hostBranch)).toBe("failed");
    expect(statusOf(flow, SYNC_FLOW_CARD.receiver)).toBe("pending");
  });

  it("blames the receiver when the branch synced but the mirror did not", () => {
    const flow = buildSyncFlow({
      sandbox,
      events: [event({ ok: false, summary: "2 new commit(s); receiver not updated" })],
      channel,
      docker: { available: true, reason: null },
      now: NOW,
    });
    expect(statusOf(flow, SYNC_FLOW_CARD.hostBranch)).toBe("done");
    expect(statusOf(flow, SYNC_FLOW_CARD.receiver)).toBe("failed");
  });

  it("ignores t3-sync request markers when judging the last sync", () => {
    const flow = buildSyncFlow({
      sandbox,
      events: [event({ source: "agent", summary: "Sync requested with t3-sync" })],
      channel,
      docker: { available: true, reason: null },
      now: NOW,
    });
    expect(statusOf(flow, SYNC_FLOW_CARD.hostBranch)).toBe("pending");
  });

  it("shows Docker down and a dropped channel on a running sandbox", () => {
    const flow = buildSyncFlow({
      sandbox,
      events: [],
      channel: { ...channel, connected: false },
      docker: { available: false, reason: "docker was not found or its daemon is not running" },
      now: NOW,
    });
    expect(statusOf(flow, SYNC_FLOW_CARD.docker)).toBe("failed");
    expect(statusOf(flow, SYNC_FLOW_CARD.channel)).toBe("warning");
    const t3Sync = flow.edges.find((edge) => edge.label === "t3-sync");
    expect(t3Sync?.dashed).toBe(true);
  });
});
