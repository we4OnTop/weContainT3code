import type { SandboxActivityEvent, SandboxChannelStatus, SandboxInfo } from "@t3tools/contracts";

import type { FlowCard, FlowEdge, FlowStage, FlowStatus } from "./PipelineFlow";

/** Card ids, so the panel can attach actions to the right card. */
export const SYNC_FLOW_CARD = {
  docker: "docker",
  sandbox: "sandbox",
  channel: "channel",
  hostBranch: "host-branch",
  receiver: "receiver",
  remote: "remote",
} as const;

const REQUEST_SUMMARY = "Sync requested with t3-sync";

const ago = (at: string, now: number): string => {
  const minutes = Math.round((now - Date.parse(at)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return "just now";
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${String(hours)} h ago`;
  return `${String(Math.round(hours / 24))} d ago`;
};

const SANDBOX_STATUS: Record<SandboxInfo["status"], FlowStatus> = {
  creating: "running",
  running: "done",
  stopped: "idle",
  error: "failed",
  removing: "pending",
};

/**
 * How one sandbox's work travels home, hop by hop: the sandbox (or the agent's
 * t3-sync through the host channel) into the host branch, mirrored into the
 * git receiver, and pushed from there to a remote. Every hop shows its last
 * outcome, so a failed sync points at the hop that broke.
 *
 * `events` is the sandbox's activity, newest first, as the server returns it.
 */
export function buildSyncFlow(input: {
  readonly sandbox: SandboxInfo;
  readonly events: ReadonlyArray<SandboxActivityEvent>;
  readonly channel: SandboxChannelStatus | undefined;
  readonly docker: { readonly available: boolean; readonly reason: string | null } | undefined;
  readonly now: number;
}): { readonly stages: ReadonlyArray<FlowStage>; readonly edges: ReadonlyArray<FlowEdge> } {
  const { sandbox, channel, now } = input;
  const lastSync = input.events.find(
    (event) => event.kind === "sync" && event.summary !== REQUEST_SUMMARY,
  );
  const lastRequest = input.events.find(
    (event) => event.kind === "sync" && event.summary === REQUEST_SUMMARY,
  );
  const lastPush = input.events.find((event) => event.kind === "remote-push");
  const syncFailed = lastSync !== undefined && lastSync.summary.startsWith("Sync failed");
  const branch = sandbox.branch ?? `sandbox/${sandbox.name}`;

  const docker: FlowCard = {
    id: SYNC_FLOW_CARD.docker,
    title: "Docker",
    detail:
      input.docker === undefined
        ? null
        : input.docker.available
          ? "running"
          : (input.docker.reason ?? "not available"),
    status: input.docker === undefined ? "idle" : input.docker.available ? "done" : "failed",
  };
  const sandboxCard: FlowCard = {
    id: SYNC_FLOW_CARD.sandbox,
    title: "Sandbox workspace",
    detail: `${sandbox.name} · ${sandbox.status}`,
    status: SANDBOX_STATUS[sandbox.status],
  };
  const channelStatus: FlowStatus =
    channel === undefined || !channel.supported
      ? "skipped"
      : channel.connected
        ? "done"
        : sandbox.status === "running"
          ? "warning"
          : "idle";
  const channelCard: FlowCard = {
    id: SYNC_FLOW_CARD.channel,
    title: "Agent t3-sync",
    detail:
      channelStatus === "skipped"
        ? "not in this image"
        : channelStatus === "done"
          ? lastRequest === undefined
            ? "ready"
            : `last request ${ago(lastRequest.at, now)}`
          : channelStatus === "warning"
            ? "host channel down; sync from here"
            : "sandbox not running",
    status: channelStatus,
  };
  const hostBranch: FlowCard = {
    id: SYNC_FLOW_CARD.hostBranch,
    title: branch,
    detail:
      lastSync === undefined
        ? "not synced yet"
        : syncFailed
          ? lastSync.summary.replace(/^Sync failed: /, "")
          : `${lastSync.summary.split(";")[0]} · ${ago(lastSync.at, now)}`,
    status: lastSync === undefined ? "pending" : syncFailed ? "failed" : "done",
  };
  const receiver: FlowCard = {
    id: SYNC_FLOW_CARD.receiver,
    title: "Git receiver",
    detail:
      lastSync === undefined || syncFailed
        ? "waits for a sync"
        : lastSync.ok
          ? `mirrored ${ago(lastSync.at, now)}`
          : "last mirror failed",
    status: lastSync === undefined || syncFailed ? "pending" : lastSync.ok ? "done" : "failed",
  };
  const remote: FlowCard = {
    id: SYNC_FLOW_CARD.remote,
    title: lastPush?.target ?? "Remote",
    detail:
      lastPush === undefined
        ? "not pushed yet"
        : lastPush.ok
          ? `pushed ${ago(lastPush.at, now)}`
          : lastPush.summary,
    status: lastPush === undefined ? "pending" : lastPush.ok ? "done" : "failed",
  };

  const hopStatus = (to: FlowCard, from: FlowCard): FlowStatus =>
    to.status === "failed" ? "failed" : from.status === "done" ? to.status : "pending";

  return {
    stages: [
      { id: "host", cards: [docker] },
      { id: "sandbox", cards: [sandboxCard, channelCard] },
      { id: "branch", cards: [hostBranch] },
      { id: "receiver", cards: [receiver] },
      { id: "remote", cards: [remote] },
    ],
    edges: [
      { from: docker.id, to: sandboxCard.id, status: docker.status },
      { from: docker.id, to: channelCard.id, status: docker.status, dashed: true },
      {
        from: sandboxCard.id,
        to: hostBranch.id,
        label: "sync",
        status: hopStatus(hostBranch, sandboxCard),
      },
      {
        from: channelCard.id,
        to: hostBranch.id,
        label: "t3-sync",
        status: channelStatus === "done" ? hopStatus(hostBranch, channelCard) : "pending",
        dashed: channelStatus !== "done",
      },
      {
        from: hostBranch.id,
        to: receiver.id,
        label: "mirror",
        status: hopStatus(receiver, hostBranch),
      },
      { from: receiver.id, to: remote.id, label: "push", status: hopStatus(remote, receiver) },
    ],
  };
}
