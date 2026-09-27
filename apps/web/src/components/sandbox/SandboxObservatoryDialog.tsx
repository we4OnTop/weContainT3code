import {
  SANDBOX_NETWORK_RESOURCE_PATTERN,
  sandboxNetworkResourceRisk,
  type EnvironmentId,
  type SandboxActivityResult,
  type SandboxNetworkEvent,
  type SandboxNetworkOverviewResult,
  type SandboxPolicyDecision,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { RefreshCwIcon, ShieldAlertIcon, TrashIcon, TriangleAlertIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useEnvironmentQuery } from "~/state/query";
import { sandboxEnvironment } from "~/state/sandbox";
import { useAtomCommand } from "~/state/use-atom-command";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";
import { ChatsOverview } from "./ChatsOverview";
import { SandboxGraphChart } from "./SandboxGraphChart";
import { buildObservatoryGraph } from "./observatoryGraph";

type Tab = "graph" | "chats" | "network" | "activity" | "commands";

const TABS: ReadonlyArray<readonly [Tab, string]> = [
  ["graph", "Graph"],
  ["chats", "Chats & usage"],
  ["network", "Network"],
  ["activity", "Sync & pushes"],
  ["commands", "Commands"],
];

const REFRESH_INTERVAL_MS = 5000;

interface PendingRule {
  readonly decision: SandboxPolicyDecision;
  readonly resource: string;
  /** Undefined: the rule goes into the global policy for every sandbox. */
  readonly sandboxId?: string;
  readonly sandboxName?: string;
  readonly risk: string | null;
}

/**
 * One view over every sandbox: how they connect to the git receiver and the
 * remotes, what the network proxy let through or blocked (with rule editing),
 * the sync/push history and the command log.
 */
export function SandboxObservatoryDialog({
  environmentId,
  open,
  onOpenChange,
}: {
  readonly environmentId: EnvironmentId;
  /** Mount only while open: it starts polling on mount. */
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const listQuery = useEnvironmentQuery(sandboxEnvironment.list({ environmentId, input: {} }));
  const sandboxes = useMemo(() => listQuery.data?.sandboxes ?? [], [listQuery.data]);
  const loadNetwork = useAtomCommand(sandboxEnvironment.networkOverview, { reportFailure: false });
  const loadActivity = useAtomCommand(sandboxEnvironment.activity, { reportFailure: false });
  const addRule = useAtomCommand(sandboxEnvironment.policyAddRule, { reportFailure: false });
  const removeRule = useAtomCommand(sandboxEnvironment.policyRemoveRule, { reportFailure: false });

  const [tab, setTab] = useState<Tab>("graph");
  const [network, setNetwork] = useState<SandboxNetworkOverviewResult | null>(null);
  const [activity, setActivity] = useState<SandboxActivityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingRule | null>(null);
  const [ruleBusy, setRuleBusy] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [sandboxFilter, setSandboxFilter] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      Promise.all([
        loadNetwork({ environmentId, input: {} }),
        loadActivity({ environmentId, input: { limit: 2000 } }),
      ]).then(([networkResult, activityResult]) => {
        setLoading(false);
        const failures: string[] = [];
        if (networkResult._tag === "Failure") {
          failures.push(errorMessage(squashAtomCommandFailure(networkResult)));
        } else {
          setNetwork(networkResult.value);
        }
        if (activityResult._tag === "Failure") {
          failures.push(errorMessage(squashAtomCommandFailure(activityResult)));
        } else {
          setActivity(activityResult.value);
        }
        setError(failures.length > 0 ? failures.join("; ") : null);
      }),
    [environmentId, loadActivity, loadNetwork],
  );

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const graph = useMemo(
    () =>
      buildObservatoryGraph({
        sandboxes,
        events: activity?.events ?? [],
        network: network?.events ?? [],
        channels: activity?.channels ?? [],
      }),
    [activity, network, sandboxes],
  );

  const requestRule = (
    decision: SandboxPolicyDecision,
    event: SandboxNetworkEvent,
    scope: "sandbox" | "global",
  ) => {
    const resource = event.host.toLowerCase();
    setPending({
      decision,
      resource,
      ...(scope === "sandbox" && event.sandboxId !== null
        ? { sandboxId: event.sandboxId, sandboxName: event.sandboxName }
        : {}),
      risk: decision === "allow" ? sandboxNetworkResourceRisk(resource) : null,
    });
  };

  const confirmRule = () => {
    if (pending === null) return;
    setRuleBusy(true);
    void addRule({
      environmentId,
      input: {
        decision: pending.decision,
        resources: [pending.resource],
        ...(pending.sandboxId === undefined ? {} : { sandboxId: pending.sandboxId }),
        ...(pending.risk === null ? {} : { acknowledgeRisk: true }),
      },
    }).then((result) => {
      setRuleBusy(false);
      if (result._tag === "Failure") {
        setError(errorMessage(squashAtomCommandFailure(result)));
        return;
      }
      setPending(null);
      setNetwork(result.value);
    });
  };

  const deleteRule = (ruleId: string) => {
    setRuleBusy(true);
    void removeRule({ environmentId, input: { ruleId } }).then((result) => {
      setRuleBusy(false);
      if (result._tag === "Failure") {
        setError(errorMessage(squashAtomCommandFailure(result)));
        return;
      }
      setNetwork(result.value);
    });
  };

  const events = activity?.events ?? [];
  const sandboxNames = [...new Set(events.map((event) => event.sandboxName))].toSorted();
  const inScope = (sandboxName: string) => sandboxFilter === null || sandboxFilter === sandboxName;
  const commands = events.filter(
    (event) =>
      event.kind === "command" &&
      inScope(event.sandboxName) &&
      (!flaggedOnly || event.flags.length > 0),
  );
  const history = events.filter((event) => event.kind !== "command" && inScope(event.sandboxName));
  const networkEvents = (network?.events ?? []).filter((event) => inScope(event.sandboxName));
  const tampered = (activity?.channels ?? []).filter((channel) => channel.tamper.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Sandbox observatory</DialogTitle>
          <DialogDescription>
            All sandboxes, their git sync into the receiver, the network proxy&apos;s decisions and
            the command log. Refreshes every few seconds.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="max-h-[75vh] overflow-y-auto">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1">
              {TABS.map(([value, label]) => (
                <Button
                  key={value}
                  size="xs"
                  variant={tab === value ? "secondary" : "ghost-muted"}
                  onClick={() => setTab(value)}
                >
                  {label}
                </Button>
              ))}
              <span className="mx-2 h-4 w-px bg-border" />
              <Button
                size="xs"
                variant={sandboxFilter === null ? "secondary" : "ghost-muted"}
                onClick={() => setSandboxFilter(null)}
              >
                All sandboxes
              </Button>
              {sandboxNames.map((name) => (
                <Button
                  key={name}
                  size="xs"
                  variant={sandboxFilter === name ? "secondary" : "ghost-muted"}
                  onClick={() => setSandboxFilter(name)}
                >
                  <span className="font-mono">{name}</span>
                </Button>
              ))}
              <Button
                size="xs"
                variant="ghost"
                className="ml-auto"
                aria-label="Refresh"
                onClick={() => void refresh()}
              >
                {loading ? <Spinner /> : <RefreshCwIcon />}
              </Button>
            </div>

            {error !== null ? <p className="text-destructive text-xs">{error}</p> : null}
            {tampered.length > 0 ? (
              <div className="border-destructive text-destructive flex items-start gap-2 rounded-md border p-2 text-xs">
                <ShieldAlertIcon className="size-4 shrink-0" />
                <div>
                  Safeguards were changed from inside:{" "}
                  {tampered.map((channel) => (
                    <span key={channel.sandboxId} className="font-mono">
                      {sandboxes.find((sandbox) => sandbox.sandboxId === channel.sandboxId)?.name ??
                        channel.sandboxId}{" "}
                      ({channel.tamper.join(", ")}){" "}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {pending !== null ? (
              <div className="flex flex-col gap-2 rounded-md border p-2 text-sm">
                <span>
                  {pending.decision === "allow" ? "Allow" : "Block"}{" "}
                  <span className="font-mono">{pending.resource}</span>{" "}
                  {pending.sandboxName === undefined ? (
                    <strong>for every sandbox (global policy)</strong>
                  ) : (
                    <>
                      for <span className="font-mono">{pending.sandboxName}</span> only
                    </>
                  )}
                  ?
                </span>
                {pending.risk !== null ? (
                  <span className="text-destructive flex items-center gap-1 text-xs">
                    <TriangleAlertIcon className="size-3.5" />
                    {pending.risk}
                  </span>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    size="xs"
                    variant={pending.risk === null ? "default" : "destructive"}
                    disabled={ruleBusy}
                    onClick={confirmRule}
                  >
                    {ruleBusy ? <Spinner /> : null}
                    Confirm
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setPending(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {tab === "graph" ? (
              <>
                <SandboxGraphChart graph={graph} />
                <p className="text-muted-foreground text-xs">
                  Arrows show where work and traffic went: sandbox → git receiver (syncs), receiver
                  → remote (pushes), sandbox → proxy (network). Red marks failures, blocked traffic,
                  flagged commands or changed safeguards. Hover for details.
                </p>
              </>
            ) : null}

            {tab === "chats" ? <ChatsOverview onNavigateAway={() => onOpenChange(false)} /> : null}

            {tab === "network" ? (
              <div className="flex flex-col gap-3">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground text-left">
                    <tr>
                      <th className="py-1">Host</th>
                      <th>Sandbox</th>
                      <th>Result</th>
                      <th>Count</th>
                      <th>Last seen</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {networkEvents.map((event) => {
                      const valid = SANDBOX_NETWORK_RESOURCE_PATTERN.test(event.host.toLowerCase());
                      const decision: SandboxPolicyDecision =
                        event.outcome === "blocked" ? "allow" : "deny";
                      return (
                        <tr
                          key={`${event.sandboxName}|${event.host}|${event.outcome}`}
                          className="border-t"
                        >
                          <td className="py-1 font-mono break-all">{event.host}</td>
                          <td className="font-mono">{event.sandboxName}</td>
                          <td>
                            <Badge
                              variant={event.outcome === "blocked" ? "destructive" : "secondary"}
                              title={event.reason ?? event.rule ?? undefined}
                            >
                              {event.outcome}
                            </Badge>
                          </td>
                          <td>{event.count}</td>
                          <td>{formatTime(event.lastSeen)}</td>
                          <td className="flex flex-wrap justify-end gap-1 py-1">
                            <Button
                              size="xs"
                              variant="ghost-muted"
                              disabled={!valid || event.sandboxId === null}
                              onClick={() => requestRule(decision, event, "sandbox")}
                            >
                              {decision === "allow" ? "Allow here" : "Block here"}
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost-muted"
                              disabled={!valid}
                              onClick={() => requestRule(decision, event, "global")}
                            >
                              {decision === "allow" ? "Allow everywhere" : "Block everywhere"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {networkEvents.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-muted-foreground py-2">
                          No traffic logged yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>

                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium">Rules</span>
                  {(network?.rules ?? [])
                    .filter((rule) => rule.sandboxName === null || inScope(rule.sandboxName))
                    .map((rule) => (
                      <div
                        key={rule.ruleId}
                        className="flex items-start gap-2 border-t py-1 text-xs"
                      >
                        <Badge variant={rule.decision === "deny" ? "destructive" : "secondary"}>
                          {rule.decision}
                        </Badge>
                        <span className="text-muted-foreground w-40 shrink-0 font-mono">
                          {rule.sandboxName ?? "global"}
                        </span>
                        <span className="font-mono break-all">
                          {rule.resources.slice(0, 12).join(", ")}
                          {rule.resources.length > 12
                            ? ` … +${String(rule.resources.length - 12)}`
                            : ""}
                        </span>
                        {rule.removable ? (
                          <Button
                            size="xs"
                            variant="ghost"
                            className="ml-auto"
                            aria-label="Remove rule"
                            disabled={ruleBusy}
                            onClick={() => deleteRule(rule.ruleId)}
                          >
                            <TrashIcon />
                          </Button>
                        ) : (
                          <span className="text-muted-foreground ml-auto">{rule.name}</span>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ) : null}

            {tab === "activity" ? (
              <ul className="flex flex-col text-xs">
                {history.map((event) => (
                  <li key={event.id} className="flex items-start gap-2 border-t py-1">
                    <span className="text-muted-foreground w-28 shrink-0">
                      {formatTime(event.at)}
                    </span>
                    <Badge variant={event.ok ? "secondary" : "destructive"}>{event.kind}</Badge>
                    <span className="text-muted-foreground w-12 shrink-0">{event.source}</span>
                    <span className="w-40 shrink-0 font-mono">{event.sandboxName}</span>
                    <span className="break-all">
                      {event.summary}
                      {event.target === undefined ? null : (
                        <span className="text-muted-foreground"> → {event.target}</span>
                      )}
                    </span>
                  </li>
                ))}
                {history.length === 0 ? (
                  <li className="text-muted-foreground py-2">No syncs or pushes yet.</li>
                ) : null}
              </ul>
            ) : null}

            {tab === "commands" ? (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-xs">
                  From the sandbox&apos;s command log (snoopy). These lines are written from inside
                  the sandbox, so treat them as a lead, not proof: they can be forged, and with sudo
                  the log can be switched off (the host channel reports that above).
                </p>
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={flaggedOnly} onCheckedChange={setFlaggedOnly} />
                  Only flagged commands
                </label>
                <ul className="flex flex-col text-xs">
                  {commands.slice(0, 1000).map((event) => (
                    <li key={event.id} className="flex flex-col gap-0.5 border-t py-1">
                      <div className="text-muted-foreground flex flex-wrap items-center gap-2">
                        <span>{formatTime(event.at)}</span>
                        <span className="font-mono">{event.sandboxName}</span>
                        {event.command === undefined ? null : (
                          <>
                            <span className={event.command.uid === 0 ? "text-destructive" : ""}>
                              uid {event.command.uid}
                            </span>
                            <span className="font-mono">{event.command.cwd}</span>
                          </>
                        )}
                        {event.flags.map((flag) => (
                          <Badge key={flag} variant="destructive">
                            {flag}
                          </Badge>
                        ))}
                      </div>
                      <code className="break-all whitespace-pre-wrap">
                        {event.command?.cmdline ?? event.summary}
                      </code>
                    </li>
                  ))}
                  {commands.length === 0 ? (
                    <li className="text-muted-foreground py-2">
                      No commands logged. The command log needs a template with it switched on.
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
