import type { EnvironmentId, ThreadId, ThreadInspectResult } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { RefreshCwIcon, ScanSearchIcon, TriangleAlertIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useThreadShell } from "~/state/entities";
import { useEnvironments } from "~/state/environments";
import { threadInspection } from "~/state/threadInspection";
import { useAtomCommand } from "~/state/use-atom-command";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Sheet, SheetContent } from "../../ui/sheet";
import { Spinner } from "../../ui/spinner";
import { Switch } from "../../ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../ui/tooltip";
import { getDriverOption } from "../../settings/providerDriverMeta";
import {
  AgentGanttChart,
  ContextGrowthChart,
  ContextSizeChart,
  ProcessedTokensChart,
} from "./ContextCharts";
import { EnvironmentUsageLimits } from "./UsageLimitsSection";
import {
  buildAgentTimeline,
  INPUT_CATEGORIES,
  INPUT_CATEGORY_LABEL,
  formatTokenCount,
  inspectThread,
  prettyPayload,
  tokensBetween,
  type ContextInput,
  type SubagentTask,
  type ThreadInspection,
  type TimelineEntry,
  type ToolCall,
} from "./threadInspection";

type Tab = "overview" | "usage" | "context" | "tools" | "subagents" | "timeline";

const TABS: ReadonlyArray<readonly [Tab, string]> = [
  ["overview", "Overview"],
  ["usage", "Usage"],
  ["context", "Context"],
  ["tools", "Tools"],
  ["subagents", "Subagents"],
  ["timeline", "Timeline"],
];

const TIMELINE_GROUPS: ReadonlyArray<TimelineEntry["group"]> = [
  "message",
  "tool",
  "subagent",
  "context",
  "approval",
  "error",
  "other",
];

const REFRESH_INTERVAL_MS = 5000;
/** Rows drawn per list; the rest is behind "show more". */
const PAGE = 200;
/** Characters of raw text drawn in the detail view. */
const RAW_VIEW_LIMIT = 200_000;

const clock = (iso: string) => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed)
    ? iso
    : new Date(parsed).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
};

const duration = (ms: number | null) =>
  ms === null ? "…" : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const failed = (status: string) => status === "failed" || status === "declined";

/** What the detail view shows: raw stored data of one message or activity. */
type Selection =
  | { readonly kind: "timeline"; readonly entry: TimelineEntry }
  | { readonly kind: "tool"; readonly call: ToolCall }
  | { readonly kind: "subagent"; readonly task: SubagentTask };

/** Header button: opens the inspector for the active chat. */
export function ChatInspectorButton({
  environmentId,
  threadId,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Inspect chat: tools, subagents, context"
              onClick={() => setOpen(true)}
            />
          }
        >
          <ScanSearchIcon className="size-4" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">Inspect chat: tools, subagents, context</TooltipPopup>
      </Tooltip>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          // Keep clicks on the header out of the desktop title bar drag area.
          className="w-[min(64rem,96vw)] max-w-none [-webkit-app-region:no-drag]"
        >
          {open ? <ChatInspectorPanel environmentId={environmentId} threadId={threadId} /> : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * Everything stored about one chat: every tool call with its input/output,
 * subagent tasks, context-window snapshots, compactions, and an estimate of
 * which inputs grow the context. Mount only while visible: it polls.
 */
export function ChatInspectorPanel({
  environmentId,
  threadId,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const inspect = useAtomCommand(threadInspection.inspect, { reportFailure: false });
  const [result, setResult] = useState<ThreadInspectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [selection, setSelection] = useState<Selection | null>(null);

  const refresh = useCallback(
    () =>
      inspect({ environmentId, input: { threadId } }).then((outcome) => {
        setLoading(false);
        if (outcome._tag === "Failure") {
          setError(errorMessage(squashAtomCommandFailure(outcome)));
          return;
        }
        setError(null);
        setResult(outcome.value);
      }),
    [environmentId, inspect, threadId],
  );

  useEffect(() => {
    void refresh();
    if (!live) return;
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [live, refresh]);

  const inspection = useMemo(() => (result === null ? null : inspectThread(result)), [result]);

  // The main agent is named after the chat's harness, e.g. "Claude · claude-opus-5-5".
  const threadShell = useThreadShell(scopeThreadRef(environmentId, threadId));
  const { environments } = useEnvironments();
  const mainAgent = useMemo(() => {
    const modelSelection = threadShell?.modelSelection;
    const provider = environments
      .find((environment) => environment.environmentId === environmentId)
      ?.serverConfig?.providers?.find(
        (candidate) => candidate.instanceId === modelSelection?.instanceId,
      );
    const harness = provider
      ? (provider.displayName ?? getDriverOption(provider.driver)?.label ?? String(provider.driver))
      : (modelSelection?.instanceId ?? null);
    return {
      label: "Main agent",
      detail: [harness, modelSelection?.model].filter(Boolean).join(" · "),
    };
  }, [environmentId, environments, threadShell?.modelSelection]);

  const selectedId =
    selection?.kind === "tool"
      ? selection.call.id
      : selection?.kind === "subagent"
        ? selection.task.taskId
        : null;
  const selectItem = useCallback(
    (item: { readonly kind: "subagent" | "tool"; readonly id: string }) => {
      if (inspection === null) return;
      if (item.kind === "tool") {
        const call = inspection.toolCalls.find((candidate) => candidate.id === item.id);
        if (call) setSelection({ kind: "tool", call });
      } else {
        const task = inspection.subagents.find((candidate) => candidate.taskId === item.id);
        if (task) setSelection({ kind: "subagent", task });
      }
    },
    [inspection],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The title row stays free on the right: the app's window controls
          float above docked sheets there. */}
      <div className="border-b py-3 ps-4 pe-12">
        <h2 className="text-sm font-medium">Chat inspector</h2>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b px-4 py-2">
        {TABS.map(([value, label]) => (
          <Button
            key={value}
            size="xs"
            variant={tab === value ? "secondary" : "ghost-muted"}
            onClick={() => setTab(value)}
          >
            {label}
            {inspection !== null && value === "tools" ? ` ${inspection.totals.toolCalls}` : ""}
            {inspection !== null && value === "subagents" ? ` ${inspection.totals.subagents}` : ""}
          </Button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <Switch checked={live} onCheckedChange={setLive} />
          Live
        </label>
        <Button size="xs" variant="ghost" aria-label="Refresh" onClick={() => void refresh()}>
          {loading ? <Spinner /> : <RefreshCwIcon />}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {error !== null ? (
          <div className="mb-2 text-xs">
            <p className="text-destructive">{error}</p>
            <p className="text-muted-foreground">
              For a chat in a sandbox, the sandbox has to be running and its T3 server at least as
              new as this app.
            </p>
          </div>
        ) : null}
        {inspection === null ? (
          loading ? (
            <Spinner />
          ) : null
        ) : (
          <>
            {inspection.olderActivitiesOmitted ? (
              <p className="mb-2 flex items-center gap-1.5 text-muted-foreground text-xs">
                <TriangleAlertIcon className="size-3.5" />
                Very long chat: only the newest activities are loaded.
              </p>
            ) : null}
            {tab === "overview" ? (
              <Overview
                inspection={inspection}
                selectedId={selectedId}
                onSelectTool={(id) => selectItem({ kind: "tool", id })}
              />
            ) : null}
            {tab === "usage" ? (
              <UsageTab inspection={inspection} environmentId={environmentId} />
            ) : null}
            {tab === "context" ? <ContextTab inspection={inspection} /> : null}
            {tab === "tools" ? (
              <ToolsTab
                inspection={inspection}
                onSelect={(call) => setSelection({ kind: "tool", call })}
              />
            ) : null}
            {tab === "subagents" ? (
              <SubagentsTab
                inspection={inspection}
                mainAgent={mainAgent}
                selectedId={selectedId}
                onSelectItem={selectItem}
                chartGroup={`inspector:${threadId}`}
                onSelect={(task) => setSelection({ kind: "subagent", task })}
                onSelectTool={(call) => setSelection({ kind: "tool", call })}
              />
            ) : null}
            {tab === "timeline" ? (
              <TimelineTab
                inspection={inspection}
                onSelect={(entry) => setSelection({ kind: "timeline", entry })}
              />
            ) : null}
          </>
        )}
      </div>
      {selection !== null && result !== null ? (
        <DetailView selection={selection} result={result} onClose={() => setSelection(null)} />
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-medium text-lg tabular-nums">{value}</div>
      {hint ? <div className="text-muted-foreground text-xs">{hint}</div> : null}
    </div>
  );
}

function Overview({
  inspection,
  selectedId,
  onSelectTool,
}: {
  readonly inspection: ThreadInspection;
  readonly selectedId: string | null;
  readonly onSelectTool: (toolCallId: string) => void;
}) {
  const { totals } = inspection;
  const latest = totals.latestUsage;
  const percent =
    latest?.maxTokens != null && latest.maxTokens > 0
      ? `${Math.round((latest.usedTokens / latest.maxTokens) * 100)}% of ${formatTokenCount(latest.maxTokens)}`
      : undefined;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Context now"
          value={latest ? formatTokenCount(latest.usedTokens) : "–"}
          {...(percent ? { hint: percent } : {})}
        />
        <Stat label="Peak context" value={formatTokenCount(totals.peakUsedTokens)} />
        <Stat
          label="Tool calls"
          value={String(totals.toolCalls)}
          {...(totals.failedToolCalls > 0 ? { hint: `${totals.failedToolCalls} failed` } : {})}
        />
        <Stat
          label="Subagents · compactions"
          value={`${totals.subagents} · ${totals.compactions}`}
        />
      </div>
      <section>
        <h3 className="mb-1 font-medium text-sm">Context size (reported by the provider)</h3>
        {inspection.usage.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            The provider has not reported context usage for this chat yet.
          </p>
        ) : (
          <ContextSizeChart
            usage={inspection.usage}
            compactions={inspection.compactions}
            toolCalls={inspection.toolCalls}
            selectedToolId={selectedId}
            onSelectTool={onSelectTool}
          />
        )}
      </section>
      <section>
        <h3 className="mb-1 font-medium text-sm">What each turn added (estimated)</h3>
        <p className="mb-1 text-muted-foreground text-xs">
          Characters / 4 of the stored text per source. Providers do not report per-input token
          counts, so this shows where growth comes from, not exact numbers.
        </p>
        {inspection.turns.length === 0 ? (
          <p className="text-muted-foreground text-xs">No turns yet.</p>
        ) : (
          <ContextGrowthChart turns={inspection.turns} />
        )}
      </section>
      <section>
        <h3 className="mb-1 font-medium text-sm">Estimated input by source (whole chat)</h3>
        <table className="w-full text-xs">
          <tbody>
            {INPUT_CATEGORIES.map((category) => (
              <tr key={category} className="border-b last:border-0">
                <td className="py-1">{INPUT_CATEGORY_LABEL[category]}</td>
                <td className="py-1 text-right tabular-nums">
                  ~{formatTokenCount(totals.estimatedInputTokens[category])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function UsageTab({
  inspection,
  environmentId,
}: {
  readonly inspection: ThreadInspection;
  readonly environmentId: EnvironmentId;
}) {
  const { processed } = inspection;
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-1 font-medium text-sm">
          Tokens processed by this chat:{" "}
          <span className="tabular-nums">
            {formatTokenCount(inspection.totals.processedTokens)}
          </span>
        </h3>
        <p className="mb-1 text-muted-foreground text-xs">
          Every request sends the whole context again, so this (not the context size) is what counts
          against a subscription limit. Summed from the provider&apos;s per-request reports.
        </p>
        {processed.length === 0 ? (
          <p className="text-muted-foreground text-xs">No usage reported for this chat yet.</p>
        ) : (
          <ProcessedTokensChart processed={processed} />
        )}
      </section>
      <section>
        <h3 className="mb-1 font-medium text-sm">Subscription limits where this chat runs</h3>
        <p className="mb-2 text-muted-foreground text-xs">
          Limits are shared by every chat on the account; the line under each window shows this
          chat&apos;s part of it.
        </p>
        <EnvironmentUsageLimits
          environmentId={environmentId}
          tokensInWindow={(startMs, endMs) => tokensBetween(processed, startMs, endMs)}
        />
      </section>
    </div>
  );
}

function ContextTab({ inspection }: { readonly inspection: ThreadInspection }) {
  const [shown, setShown] = useState(PAGE);
  const biggest = useMemo(
    () => inspection.inputs.toSorted((a, b) => b.chars - a.chars).slice(0, 25),
    [inspection.inputs],
  );
  const turns = inspection.turns.toReversed();
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-1 font-medium text-sm">Biggest single inputs</h3>
        <InputTable inputs={biggest} />
      </section>
      <section>
        <h3 className="mb-1 font-medium text-sm">Per turn (newest first)</h3>
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">Turn</th>
              <th className="py-1 font-normal">Started</th>
              <th className="py-1 text-right font-normal">Context after</th>
              <th className="py-1 text-right font-normal">Change</th>
              <th className="py-1 text-right font-normal">Tools</th>
              <th className="py-1 text-right font-normal">Subagents</th>
              <th className="py-1 font-normal ps-3">Largest inputs</th>
            </tr>
          </thead>
          <tbody>
            {turns.slice(0, shown).map((turn) => (
              <tr key={turn.turnId} className="border-b align-top last:border-0">
                <td className="py-1 tabular-nums">
                  {turn.index}
                  {turn.compactions > 0 ? (
                    <Badge size="sm" variant="outline" className="ms-1">
                      compacted
                    </Badge>
                  ) : null}
                </td>
                <td className="py-1 tabular-nums">{clock(turn.startedAt)}</td>
                <td className="py-1 text-right tabular-nums">
                  {turn.usedTokens === null ? "–" : formatTokenCount(turn.usedTokens)}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {turn.deltaTokens === null
                    ? "–"
                    : `${turn.deltaTokens >= 0 ? "+" : "−"}${formatTokenCount(Math.abs(turn.deltaTokens))}`}
                </td>
                <td className="py-1 text-right tabular-nums">{turn.toolCalls}</td>
                <td className="py-1 text-right tabular-nums">{turn.subagents}</td>
                <td className="py-1 ps-3">
                  {turn.topInputs.map((input) => (
                    <div key={input.id} className="truncate">
                      ~{formatTokenCount(input.estimatedTokens)} ·{" "}
                      {INPUT_CATEGORY_LABEL[input.category]} · {input.label}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ShowMore shown={shown} total={turns.length} onMore={() => setShown(shown + PAGE)} />
      </section>
    </div>
  );
}

function InputTable({ inputs }: { readonly inputs: ReadonlyArray<ContextInput> }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-muted-foreground">
        <tr>
          <th className="py-1 font-normal">Source</th>
          <th className="py-1 font-normal">What</th>
          <th className="py-1 font-normal">When</th>
          <th className="py-1 text-right font-normal">~Tokens</th>
        </tr>
      </thead>
      <tbody>
        {inputs.map((input) => (
          <tr key={input.id} className="border-b last:border-0">
            <td className="py-1 whitespace-nowrap">{INPUT_CATEGORY_LABEL[input.category]}</td>
            <td className="max-w-80 truncate py-1">{input.label}</td>
            <td className="py-1 tabular-nums">{clock(input.at)}</td>
            <td className="py-1 text-right tabular-nums">
              {formatTokenCount(input.estimatedTokens)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ToolsTab({
  inspection,
  onSelect,
}: {
  readonly inspection: ThreadInspection;
  readonly onSelect: (call: ToolCall) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  const [failedOnly, setFailedOnly] = useState(false);
  const calls = inspection.toolCalls
    .filter((call) => !failedOnly || failed(call.status))
    .toReversed();
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-1 font-medium text-sm">By tool</h3>
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">Tool</th>
              <th className="py-1 text-right font-normal">Calls</th>
              <th className="py-1 text-right font-normal">Failed</th>
              <th className="py-1 text-right font-normal">~Tokens in/out</th>
              <th className="py-1 text-right font-normal">Time</th>
            </tr>
          </thead>
          <tbody>
            {inspection.toolStats.map((stat) => (
              <tr key={stat.name} className="border-b last:border-0">
                <td className="max-w-80 truncate py-1">{stat.name}</td>
                <td className="py-1 text-right tabular-nums">{stat.calls}</td>
                <td className="py-1 text-right tabular-nums">{stat.failed || ""}</td>
                <td className="py-1 text-right tabular-nums">
                  {formatTokenCount(Math.ceil(stat.outputChars / 4))}
                </td>
                <td className="py-1 text-right tabular-nums">{duration(stat.totalDurationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <div className="mb-1 flex items-center gap-2">
          <h3 className="mr-auto font-medium text-sm">All calls (newest first)</h3>
          <label className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Switch checked={failedOnly} onCheckedChange={setFailedOnly} />
            Failed only
          </label>
        </div>
        <ul className="flex flex-col">
          {calls.slice(0, shown).map((call) => (
            <li key={call.id}>
              <ToolRow call={call} onSelect={onSelect} />
            </li>
          ))}
        </ul>
        <ShowMore shown={shown} total={calls.length} onMore={() => setShown(shown + PAGE)} />
      </section>
    </div>
  );
}

function ToolRow({
  call,
  onSelect,
  indent = false,
}: {
  readonly call: ToolCall;
  readonly onSelect: (call: ToolCall) => void;
  readonly indent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(call)}
      className={`flex w-full items-center gap-2 border-b px-1 py-1 text-left text-xs hover:bg-accent ${indent ? "ps-6" : ""}`}
    >
      <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
        {clock(call.startedAt)}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{call.title}</span>
        {call.detail ? <span className="text-muted-foreground"> · {call.detail}</span> : null}
      </span>
      {call.agentId ? (
        <Badge size="sm" variant="outline">
          subagent
        </Badge>
      ) : null}
      <span className="shrink-0 text-muted-foreground">{call.itemType}</span>
      <span className="w-14 shrink-0 text-right tabular-nums">{duration(call.durationMs)}</span>
      <span className="w-14 shrink-0 text-right tabular-nums">
        ~{formatTokenCount(Math.ceil(call.outputChars / 4))}
      </span>
      <span
        className={`w-20 shrink-0 text-right ${failed(call.status) ? "text-destructive" : "text-muted-foreground"}`}
      >
        {call.status}
      </span>
    </button>
  );
}

function SubagentsTab({
  inspection,
  mainAgent,
  selectedId,
  onSelectItem,
  chartGroup,
  onSelect,
  onSelectTool,
}: {
  readonly inspection: ThreadInspection;
  readonly mainAgent: { readonly label: string; readonly detail: string };
  readonly selectedId: string | null;
  readonly onSelectItem: (item: {
    readonly kind: "subagent" | "tool";
    readonly id: string;
  }) => void;
  readonly chartGroup: string;
  readonly onSelect: (task: SubagentTask) => void;
  readonly onSelectTool: (call: ToolCall) => void;
}) {
  // Running spans end at the newest thing the chat recorded, not the wall clock.
  const lastSeenMs = useMemo(() => {
    const times = [
      ...inspection.timeline.map((entry) => Date.parse(entry.at)),
      ...inspection.usage.map((point) => Date.parse(point.at)),
    ].filter((ms) => !Number.isNaN(ms));
    return times.length > 0 ? Math.max(...times) : 0;
  }, [inspection.timeline, inspection.usage]);
  const timeline = useMemo(
    () => buildAgentTimeline(inspection, mainAgent, lastSeenMs),
    [inspection, mainAgent, lastSeenMs],
  );
  const range = useMemo(() => {
    const usageTimes = inspection.usage.map((point) => Date.parse(point.at));
    return {
      startMs: Math.min(timeline.startMs, ...usageTimes),
      endMs: Math.max(timeline.endMs, ...usageTimes),
    };
  }, [inspection.usage, timeline.endMs, timeline.startMs]);
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1">
        <h3 className="font-medium text-sm">Context and agents over time</h3>
        <p className="text-muted-foreground text-xs">
          Both charts share one time axis: hover or zoom one and the other follows. Dots on the
          context curve and bars below are tool calls; click one to open its raw input and output.
        </p>
        {inspection.usage.length > 0 ? (
          <ContextSizeChart
            usage={inspection.usage}
            compactions={inspection.compactions}
            toolCalls={inspection.toolCalls}
            selectedToolId={selectedId}
            onSelectTool={(id) => onSelectItem({ kind: "tool", id })}
            group={chartGroup}
            range={range}
          />
        ) : null}
        <AgentGanttChart
          timeline={{ ...timeline, ...range }}
          selectedId={selectedId}
          onSelect={onSelectItem}
          group={chartGroup}
        />
      </section>
      {inspection.subagents.length === 0 ? (
        <p className="text-muted-foreground text-xs">No subagents or tasks in this chat.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {inspection.subagents.toReversed().map((task) => {
            // Calls the subagent made: linked by its agent id or its spawning tool call.
            const calls = inspection.toolCalls.filter(
              (call) =>
                (task.agentId !== null && call.agentId === task.agentId) ||
                (task.toolUseId !== null && call.parentToolUseId === task.toolUseId),
            );
            return (
              <li key={task.taskId} className="rounded-md border">
                <button
                  type="button"
                  onClick={() => onSelect(task)}
                  className="flex w-full flex-wrap items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
                >
                  <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                    {clock(task.startedAt)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
                  {task.taskType ? (
                    <Badge size="sm" variant="outline">
                      {task.taskType}
                    </Badge>
                  ) : null}
                  {task.model ? <span className="text-muted-foreground">{task.model}</span> : null}
                  {task.totalTokens !== null ? (
                    <span className="tabular-nums">{formatTokenCount(task.totalTokens)} tok</span>
                  ) : null}
                  <span
                    className={failed(task.status) ? "text-destructive" : "text-muted-foreground"}
                  >
                    {task.status}
                  </span>
                </button>
                {task.summary ? (
                  <p className="line-clamp-3 border-t px-2 py-1 text-muted-foreground text-xs whitespace-pre-wrap">
                    {task.summary}
                  </p>
                ) : null}
                {calls.length > 0 ? (
                  <ul className="border-t">
                    {calls.map((call) => (
                      <li key={call.id}>
                        <ToolRow call={call} onSelect={onSelectTool} indent />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TimelineTab({
  inspection,
  onSelect,
}: {
  readonly inspection: ThreadInspection;
  readonly onSelect: (entry: TimelineEntry) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  const [groups, setGroups] = useState<ReadonlySet<TimelineEntry["group"]>>(
    () => new Set(TIMELINE_GROUPS),
  );
  const entries = inspection.timeline.filter((entry) => groups.has(entry.group)).toReversed();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {TIMELINE_GROUPS.map((group) => (
          <Button
            key={group}
            size="xs"
            variant={groups.has(group) ? "secondary" : "ghost-muted"}
            onClick={() => {
              const next = new Set(groups);
              if (next.has(group)) next.delete(group);
              else next.add(group);
              setGroups(next);
            }}
          >
            {group}
          </Button>
        ))}
      </div>
      <ul className="flex flex-col">
        {entries.slice(0, shown).map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onSelect(entry)}
              className="flex w-full items-center gap-2 border-b px-1 py-1 text-left text-xs hover:bg-accent"
            >
              <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                {clock(entry.at)}
              </span>
              <span className="w-40 shrink-0 truncate text-muted-foreground">{entry.kind}</span>
              <span
                className={`min-w-0 flex-1 truncate ${entry.group === "error" ? "text-destructive" : ""}`}
              >
                {entry.summary}
              </span>
              <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                {formatTokenCount(entry.sizeBytes)}B
              </span>
            </button>
          </li>
        ))}
      </ul>
      <ShowMore shown={shown} total={entries.length} onMore={() => setShown(shown + PAGE)} />
    </div>
  );
}

function ShowMore({
  shown,
  total,
  onMore,
}: {
  readonly shown: number;
  readonly total: number;
  readonly onMore: () => void;
}) {
  if (shown >= total) return null;
  return (
    <Button size="xs" variant="ghost-muted" className="mt-1 self-start" onClick={onMore}>
      Show more ({total - shown} left)
    </Button>
  );
}

function detailText(
  selection: Selection,
  result: ThreadInspectResult,
): {
  title: string;
  body: string;
} {
  const activitiesById = new Map(
    result.activities.map((activity) => [activity.activityId, activity]),
  );
  const dumpActivities = (ids: ReadonlyArray<string>) =>
    ids
      .map((id) => activitiesById.get(id as never))
      .filter((activity) => activity !== undefined)
      .map(
        (activity) =>
          `── ${activity.kind} · ${activity.createdAt} · ${activity.payloadBytes} bytes\n${prettyPayload(activity)}`,
      )
      .join("\n\n");
  switch (selection.kind) {
    case "timeline": {
      const source = selection.entry.source;
      if (source.type === "message") {
        const message = source.message;
        const attachments = message.attachments
          .map(
            (attachment) =>
              `  ${attachment.name} (${attachment.mimeType}, ${attachment.sizeBytes} bytes)`,
          )
          .join("\n");
        return {
          title: `${message.role} message · ${message.createdAt}`,
          body: `${message.text}${message.textChars > message.text.length ? `\n… (cut at ${message.text.length} of ${message.textChars} characters)` : ""}${attachments ? `\n\nAttachments:\n${attachments}` : ""}`,
        };
      }
      return {
        title: `${source.activity.kind} · ${source.activity.createdAt}`,
        body: prettyPayload(source.activity),
      };
    }
    case "tool":
      return {
        title: `${selection.call.title} · ${selection.call.itemType} · ${selection.call.status}`,
        body: dumpActivities(selection.call.activityIds),
      };
    case "subagent":
      return {
        title: `${selection.task.title} · ${selection.task.status}`,
        body: dumpActivities(selection.task.activityIds),
      };
  }
}

/** Raw stored data of the selected entry, as plain text. */
function DetailView({
  selection,
  result,
  onClose,
}: {
  readonly selection: Selection;
  readonly result: ThreadInspectResult;
  readonly onClose: () => void;
}) {
  const { title, body } = detailText(selection, result);
  const cut = body.length > RAW_VIEW_LIMIT;
  return (
    <div className="flex max-h-[45%] min-h-40 flex-col border-t">
      <div className="flex items-center gap-2 px-4 py-1.5">
        <span className="min-w-0 flex-1 truncate font-medium text-xs">{title}</span>
        <Button
          size="xs"
          variant="ghost-muted"
          onClick={() => void navigator.clipboard?.writeText(body)}
        >
          Copy
        </Button>
        <Button size="xs" variant="ghost-muted" onClick={onClose}>
          Close
        </Button>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto bg-muted/40 px-4 py-2 font-mono text-2xs leading-snug whitespace-pre-wrap break-all">
        {cut
          ? `${body.slice(0, RAW_VIEW_LIMIT)}\n… (${body.length - RAW_VIEW_LIMIT} more characters; use Copy)`
          : body}
      </pre>
    </div>
  );
}
