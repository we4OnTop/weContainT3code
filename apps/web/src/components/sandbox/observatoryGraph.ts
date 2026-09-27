import type {
  SandboxActivityEvent,
  SandboxChannelStatus,
  SandboxInfo,
  SandboxNetworkEvent,
} from "@t3tools/contracts";

/**
 * Text for ECharts. Everything shown in the chart can come from inside a
 * sandbox (names, hosts, command lines), and ECharts parses `{style|text}` rich
 * markup in labels and richText tooltips, so braces are neutralized, control
 * characters dropped and the length capped. Tooltips stay in richText mode, so
 * no string ever reaches the DOM as HTML.
 */
export function chartText(value: string, max = 120): string {
  const cleaned = value
    // oxlint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replaceAll("{", "(")
    .replaceAll("}", ")")
    .replaceAll("|", "¦");
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

export type GraphNodeKind = "receiver" | "sandbox" | "remote" | "proxy";

export interface ObservatoryNode {
  readonly id: string;
  readonly name: string;
  readonly kind: GraphNodeKind;
  /** Plain lines for the richText tooltip, already passed through chartText. */
  readonly details: ReadonlyArray<string>;
  readonly alert: boolean;
  readonly muted: boolean;
}

export interface ObservatoryLink {
  readonly source: string;
  readonly target: string;
  readonly label: string;
  readonly details: ReadonlyArray<string>;
  readonly alert: boolean;
  readonly weight: number;
}

export interface ObservatoryGraph {
  readonly nodes: ReadonlyArray<ObservatoryNode>;
  readonly links: ReadonlyArray<ObservatoryLink>;
}

const RECEIVER_ID = "receiver";
const PROXY_ID = "proxy";

/**
 * Sandboxes around the git receiver they sync into, the remotes the receiver's
 * work was pushed to, and the sbx proxy every sandbox's traffic goes through.
 */
export function buildObservatoryGraph(input: {
  readonly sandboxes: ReadonlyArray<SandboxInfo>;
  readonly events: ReadonlyArray<SandboxActivityEvent>;
  readonly network: ReadonlyArray<SandboxNetworkEvent>;
  readonly channels: ReadonlyArray<SandboxChannelStatus>;
}): ObservatoryGraph {
  const channelBySandbox = new Map(input.channels.map((channel) => [channel.sandboxId, channel]));
  const nodes: ObservatoryNode[] = [
    {
      id: RECEIVER_ID,
      name: "git receiver",
      kind: "receiver",
      details: ["Docker container, no network", "One bare repo per sandbox"],
      alert: false,
      muted: false,
    },
    {
      id: PROXY_ID,
      name: "sbx network proxy",
      kind: "proxy",
      details: ["Global sbx policy plus per-sandbox rules"],
      alert: false,
      muted: false,
    },
  ];
  const links: ObservatoryLink[] = [];

  const names = new Map<string, string>();
  for (const sandbox of input.sandboxes) names.set(sandbox.sandboxId, sandbox.name);
  for (const event of input.events) {
    if (!names.has(event.sandboxId)) names.set(event.sandboxId, event.sandboxName);
  }
  const live = new Map(input.sandboxes.map((sandbox) => [sandbox.sandboxId, sandbox]));

  for (const [sandboxId, name] of names) {
    const sandbox = live.get(sandboxId);
    const channel = channelBySandbox.get(sandboxId);
    const tamper = channel?.tamper ?? [];
    const flagged = input.events.filter(
      (event) => event.sandboxId === sandboxId && event.kind === "command" && !event.ok,
    ).length;
    nodes.push({
      id: `sandbox:${sandboxId}`,
      name: chartText(name, 48),
      kind: "sandbox",
      details: [
        sandbox === undefined ? "removed (history only)" : `status: ${sandbox.status}`,
        channel === undefined
          ? "host channel: not connected"
          : `host channel: ${channel.connected ? "connected" : "closed"}, sudo ${channel.sudo ? "on" : "off"}, command log ${channel.commandLog ? "on" : "off"}`,
        ...(tamper.length > 0 ? [`safeguards changed: ${chartText(tamper.join(", "))}`] : []),
        ...(flagged > 0 ? [`${String(flagged)} flagged command(s)`] : []),
      ],
      alert: tamper.length > 0 || flagged > 0,
      muted: sandbox === undefined || sandbox.status !== "running",
    });

    const syncs = input.events.filter(
      (event) =>
        event.sandboxId === sandboxId && event.kind === "sync" && event.target !== undefined,
    );
    if (syncs.length > 0) {
      const last = syncs.reduce((latest, event) => (event.at > latest.at ? event : latest));
      const agentSyncs = syncs.filter((event) => event.source === "agent").length;
      links.push({
        source: `sandbox:${sandboxId}`,
        target: RECEIVER_ID,
        label: `${String(syncs.length)} sync${syncs.length === 1 ? "" : "s"}`,
        details: [
          `${String(syncs.length)} sync(s), ${String(agentSyncs)} by the agent (t3-sync)`,
          `last: ${last.ok ? "ok" : "failed"}, ${last.at}`,
          chartText(last.summary),
        ],
        alert: !last.ok,
        weight: syncs.length,
      });
    }

    const traffic = input.network.filter((event) => event.sandboxId === sandboxId);
    if (traffic.length > 0) {
      const blocked = traffic.filter((event) => event.outcome === "blocked");
      links.push({
        source: `sandbox:${sandboxId}`,
        target: PROXY_ID,
        label: blocked.length > 0 ? `${String(blocked.length)} blocked` : "",
        details: [
          `${String(traffic.length - blocked.length)} allowed host(s), ${String(blocked.length)} blocked`,
          ...blocked.slice(0, 5).map((event) => `blocked: ${chartText(event.host, 80)}`),
        ],
        alert: blocked.length > 0,
        weight: traffic.length,
      });
    }
  }

  const pushesByRemote = new Map<string, SandboxActivityEvent[]>();
  for (const event of input.events) {
    if (event.kind !== "remote-push" || event.target === undefined) continue;
    const remote = event.target.split("/")[0] ?? event.target;
    pushesByRemote.set(remote, [...(pushesByRemote.get(remote) ?? []), event]);
  }
  for (const [remote, pushes] of pushesByRemote) {
    const id = `remote:${remote}`;
    const failed = pushes.filter((event) => !event.ok).length;
    const branches = [...new Set(pushes.map((event) => event.target ?? ""))];
    nodes.push({
      id,
      name: chartText(remote, 48),
      kind: "remote",
      details: branches.slice(0, 6).map((branch) => chartText(branch, 80)),
      alert: false,
      muted: false,
    });
    const forced = pushes.filter((event) => event.flags.includes("forced")).length;
    links.push({
      source: RECEIVER_ID,
      target: id,
      label: `${String(pushes.length)} push${pushes.length === 1 ? "" : "es"}`,
      details: [
        `${String(pushes.length)} push(es), ${String(failed)} failed, ${String(forced)} forced`,
        ...branches.slice(0, 4).map((branch) => chartText(branch, 80)),
      ],
      alert: failed > 0 || forced > 0,
      weight: pushes.length,
    });
  }

  return { nodes, links };
}

export interface NodePosition {
  readonly x: number;
  readonly y: number;
}

const COLUMN_X: Record<GraphNodeKind, number> = {
  sandbox: -320,
  proxy: 0,
  receiver: 0,
  remote: 320,
};
const ROW_GAP = 90;

/**
 * Fixed positions: sandboxes left, the receiver in the middle, remotes right,
 * the proxy above the receiver. Nodes of a column are ordered by id, so the
 * picture only changes when a node comes or goes, never on a refresh.
 */
export function layoutObservatoryGraph(graph: ObservatoryGraph): ReadonlyMap<string, NodePosition> {
  const positions = new Map<string, NodePosition>();
  const columns = new Map<GraphNodeKind, ObservatoryNode[]>();
  for (const node of graph.nodes) {
    const column = columns.get(node.kind) ?? [];
    column.push(node);
    columns.set(node.kind, column);
  }
  for (const [kind, nodes] of columns) {
    const sorted = nodes.toSorted((a, b) => a.id.localeCompare(b.id));
    sorted.forEach((node, index) => {
      if (kind === "proxy" || kind === "receiver") {
        // The receiver sits at the centre; proxies stack above it.
        const y = kind === "receiver" ? index * ROW_GAP : -160 - index * ROW_GAP;
        positions.set(node.id, { x: COLUMN_X[kind], y });
        return;
      }
      positions.set(node.id, {
        x: COLUMN_X[kind],
        y: (index - (sorted.length - 1) / 2) * ROW_GAP,
      });
    });
  }
  return positions;
}
