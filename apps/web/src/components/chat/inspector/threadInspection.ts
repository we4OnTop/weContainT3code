import type {
  ThreadInspectActivity,
  ThreadInspectMessage,
  ThreadInspectResult,
} from "@t3tools/contracts";

/**
 * Turns the raw record of one chat into what the inspector panel shows:
 * tool calls, subagent tasks, context-window snapshots, compactions, and an
 * estimate of which inputs fill the context.
 *
 * Token counts from the provider are exact; everything marked "estimated" is
 * characters / 4 of the stored text, because providers do not report how
 * many tokens each individual input took.
 */

export const CHARS_PER_TOKEN = 4;

export const estimateTokens = (chars: number): number => Math.ceil(chars / CHARS_PER_TOKEN);

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;
const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const time = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** Parses a stored payload; a cut payload is not valid JSON and yields null. */
export function parsePayload(activity: ThreadInspectActivity): JsonRecord | null {
  if (activity.payloadTruncated) return null;
  try {
    return asRecord(JSON.parse(activity.payloadJson));
  } catch {
    return null;
  }
}

/** Size of what a tool call handed back to the model, from the stored payload. */
function payloadDataChars(activity: ThreadInspectActivity, payload: JsonRecord | null): number {
  if (payload === null) return activity.payloadBytes;
  const data = payload.data;
  if (data === undefined) return 0;
  try {
    return JSON.stringify(data)?.length ?? 0;
  } catch {
    return 0;
  }
}

export interface ToolCall {
  readonly id: string;
  readonly itemType: string;
  readonly title: string;
  readonly detail: string | null;
  readonly status: string;
  readonly source: string | null;
  readonly turnId: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly durationMs: number | null;
  /** Subagent that made the call, when it was not the main agent. */
  readonly agentId: string | null;
  readonly parentToolUseId: string | null;
  /** Characters of tool input/output stored with the final state. */
  readonly outputChars: number;
  readonly payloadBytes: number;
  readonly activityIds: ReadonlyArray<string>;
  readonly lastActivityId: string;
}

export interface SubagentTask {
  readonly taskId: string;
  readonly title: string;
  readonly taskType: string | null;
  readonly agentKind: string | null;
  readonly agentId: string | null;
  readonly model: string | null;
  readonly toolUseId: string | null;
  readonly parentAgentId: string | null;
  readonly status: string;
  readonly summary: string | null;
  readonly lastToolName: string | null;
  readonly turnId: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly totalTokens: number | null;
  readonly toolUses: number | null;
  readonly activityIds: ReadonlyArray<string>;
}

export interface UsagePoint {
  readonly activityId: string;
  readonly at: string;
  readonly turnId: string | null;
  readonly usedTokens: number;
  readonly maxTokens: number | null;
  readonly lastInputTokens: number | null;
  readonly lastCachedInputTokens: number | null;
  readonly lastOutputTokens: number | null;
  readonly totalProcessedTokens: number | null;
  readonly autoCompactThreshold: number | null;
}

export interface Compaction {
  readonly activityId: string;
  readonly at: string;
  readonly turnId: string | null;
  readonly beforeTokens: number | null;
  readonly afterTokens: number | null;
}

/** What fed the context, by source. Each entry is estimated from stored text. */
export type InputCategory =
  | "user"
  | "attachments"
  | "assistant"
  | "system"
  | "tool-output"
  | "subagent-result";

export const INPUT_CATEGORIES: ReadonlyArray<InputCategory> = [
  "user",
  "attachments",
  "assistant",
  "system",
  "tool-output",
  "subagent-result",
];

export const INPUT_CATEGORY_LABEL: Record<InputCategory, string> = {
  user: "User messages",
  attachments: "Attachments",
  assistant: "Assistant replies",
  system: "System messages",
  "tool-output": "Tool calls",
  "subagent-result": "Subagent results",
};

export interface TurnSummary {
  readonly turnId: string;
  readonly index: number;
  readonly startedAt: string;
  readonly toolCalls: number;
  readonly subagents: number;
  readonly compactions: number;
  /** Estimated tokens this turn added, by source. */
  readonly added: Record<InputCategory, number>;
  /** Provider-reported context size at the end of the turn. */
  readonly usedTokens: number | null;
  readonly maxTokens: number | null;
  /** Change of the reported context size against the previous turn. */
  readonly deltaTokens: number | null;
  /** The biggest single inputs of the turn. */
  readonly topInputs: ReadonlyArray<ContextInput>;
}

export interface ContextInput {
  readonly id: string;
  readonly category: InputCategory;
  readonly label: string;
  readonly at: string;
  readonly turnId: string | null;
  readonly chars: number;
  readonly estimatedTokens: number;
}

export interface TimelineEntry {
  readonly id: string;
  readonly at: string;
  readonly turnId: string | null;
  readonly group: "message" | "tool" | "subagent" | "context" | "approval" | "error" | "other";
  readonly kind: string;
  readonly summary: string;
  readonly sizeBytes: number;
  readonly source:
    | { readonly type: "message"; readonly message: ThreadInspectMessage }
    | { readonly type: "activity"; readonly activity: ThreadInspectActivity };
}

export interface ToolStat {
  readonly name: string;
  readonly calls: number;
  readonly failed: number;
  readonly outputChars: number;
  readonly totalDurationMs: number;
}

export interface ThreadInspection {
  readonly toolCalls: ReadonlyArray<ToolCall>;
  readonly subagents: ReadonlyArray<SubagentTask>;
  readonly usage: ReadonlyArray<UsagePoint>;
  readonly compactions: ReadonlyArray<Compaction>;
  readonly inputs: ReadonlyArray<ContextInput>;
  readonly turns: ReadonlyArray<TurnSummary>;
  readonly timeline: ReadonlyArray<TimelineEntry>;
  readonly toolStats: ReadonlyArray<ToolStat>;
  readonly totals: {
    readonly messages: number;
    readonly toolCalls: number;
    readonly failedToolCalls: number;
    readonly subagents: number;
    readonly compactions: number;
    readonly estimatedInputTokens: Record<InputCategory, number>;
    readonly latestUsage: UsagePoint | null;
    readonly peakUsedTokens: number;
    /** Tokens the provider processed for this chat (every request counted). */
    readonly processedTokens: number;
  };
  readonly processed: ReadonlyArray<ProcessedPoint>;
  readonly olderActivitiesOmitted: boolean;
}

function activityGroup(kind: string, tone: string): TimelineEntry["group"] {
  if (kind.startsWith("tool.")) return "tool";
  if (kind.startsWith("task.")) return "subagent";
  if (kind === "context-window.updated" || kind === "context-compaction") return "context";
  if (kind.startsWith("approval.") || kind.startsWith("user-input.")) return "approval";
  if (tone === "error" || kind === "runtime.error") return "error";
  return "other";
}

const toolCallKey = (activity: ThreadInspectActivity, payload: JsonRecord | null): string =>
  str(payload?.toolCallId) ?? `activity:${activity.activityId}`;

function buildToolCalls(activities: ReadonlyArray<ThreadInspectActivity>): ToolCall[] {
  interface Draft {
    id: string;
    itemType: string;
    title: string;
    detail: string | null;
    status: string;
    source: string | null;
    turnId: string | null;
    startedAt: string;
    endedAt: string | null;
    agentId: string | null;
    parentToolUseId: string | null;
    outputChars: number;
    payloadBytes: number;
    activityIds: string[];
    lastActivityId: string;
  }
  const drafts = new Map<string, Draft>();
  for (const activity of activities) {
    if (!activity.kind.startsWith("tool.") || activity.kind === "tool.progress") continue;
    const payload = parsePayload(activity);
    const key = toolCallKey(activity, payload);
    const existing = drafts.get(key);
    const title = str(payload?.title) ?? activity.summary.replace(/ started$/, "");
    const draft: Draft = existing ?? {
      id: key,
      itemType: str(payload?.itemType) ?? "unknown",
      title,
      detail: null,
      status: "inProgress",
      source: null,
      turnId: activity.turnId,
      startedAt: activity.createdAt,
      endedAt: null,
      agentId: null,
      parentToolUseId: null,
      outputChars: 0,
      payloadBytes: 0,
      activityIds: [],
      lastActivityId: activity.activityId,
    };
    draft.activityIds.push(activity.activityId);
    draft.lastActivityId = activity.activityId;
    draft.title = title;
    draft.detail = str(payload?.detail) ?? draft.detail;
    draft.source = str(payload?.toolSource) ?? str(payload?.toolSurface) ?? draft.source;
    draft.agentId = str(payload?.agentId) ?? draft.agentId;
    draft.parentToolUseId = str(payload?.parentToolUseId) ?? draft.parentToolUseId;
    draft.status = str(payload?.status) ?? draft.status;
    if (activity.kind === "tool.completed" || activity.kind === "tool.denied") {
      draft.endedAt = activity.createdAt;
      if (activity.kind === "tool.denied") draft.status = "declined";
      else if (draft.status === "inProgress") draft.status = "completed";
    }
    // The last state carries the full input/output; earlier ones repeat parts of it.
    draft.outputChars = Math.max(draft.outputChars, payloadDataChars(activity, payload));
    draft.payloadBytes = Math.max(draft.payloadBytes, activity.payloadBytes);
    drafts.set(key, draft);
  }
  return [...drafts.values()].map((draft) => ({
    ...draft,
    durationMs: draft.endedAt === null ? null : time(draft.endedAt) - time(draft.startedAt),
  }));
}

function buildSubagents(activities: ReadonlyArray<ThreadInspectActivity>): SubagentTask[] {
  interface Draft {
    taskId: string;
    title: string;
    taskType: string | null;
    agentKind: string | null;
    agentId: string | null;
    model: string | null;
    toolUseId: string | null;
    parentAgentId: string | null;
    status: string;
    summary: string | null;
    lastToolName: string | null;
    turnId: string | null;
    startedAt: string;
    endedAt: string | null;
    totalTokens: number | null;
    toolUses: number | null;
    activityIds: string[];
  }
  const drafts = new Map<string, Draft>();
  for (const activity of activities) {
    if (!activity.kind.startsWith("task.")) continue;
    const payload = parsePayload(activity);
    const taskId = str(payload?.taskId);
    if (taskId === null) continue;
    const draft: Draft = drafts.get(taskId) ?? {
      taskId,
      title: "Task",
      taskType: null,
      agentKind: null,
      agentId: null,
      model: null,
      toolUseId: null,
      parentAgentId: null,
      status: "running",
      summary: null,
      lastToolName: null,
      turnId: activity.turnId,
      startedAt: activity.createdAt,
      endedAt: null,
      totalTokens: null,
      toolUses: null,
      activityIds: [],
    };
    draft.activityIds.push(activity.activityId);
    draft.title = str(payload?.title) ?? str(payload?.detail) ?? draft.title;
    draft.taskType = str(payload?.taskType) ?? draft.taskType;
    draft.agentKind = str(payload?.agentKind) ?? draft.agentKind;
    draft.agentId = str(payload?.agentId) ?? draft.agentId;
    draft.model = str(payload?.model) ?? draft.model;
    draft.toolUseId = str(payload?.toolUseId) ?? draft.toolUseId;
    draft.parentAgentId = str(payload?.parentAgentId) ?? draft.parentAgentId;
    draft.summary = str(payload?.summary) ?? draft.summary;
    draft.lastToolName = str(payload?.lastToolName) ?? draft.lastToolName;
    const usage = asRecord(payload?.typedUsage) ?? asRecord(payload?.usage);
    draft.totalTokens = num(usage?.totalTokens) ?? draft.totalTokens;
    draft.toolUses = num(usage?.toolUses) ?? draft.toolUses;
    if (activity.kind === "task.completed") {
      draft.status = str(payload?.status) ?? "completed";
      draft.endedAt = activity.createdAt;
    } else if (activity.kind === "task.updated") {
      draft.status = str(payload?.status) ?? draft.status;
      draft.endedAt = str(payload?.endedAt) ?? draft.endedAt;
    }
    drafts.set(taskId, draft);
  }
  return [...drafts.values()];
}

function buildUsage(activities: ReadonlyArray<ThreadInspectActivity>): UsagePoint[] {
  const points: UsagePoint[] = [];
  for (const activity of activities) {
    if (activity.kind !== "context-window.updated") continue;
    const payload = parsePayload(activity);
    const usedTokens = num(payload?.usedTokens);
    if (usedTokens === null) continue;
    points.push({
      activityId: activity.activityId,
      at: activity.createdAt,
      turnId: activity.turnId,
      usedTokens,
      maxTokens: num(payload?.maxTokens),
      lastInputTokens: num(payload?.lastInputTokens),
      lastCachedInputTokens: num(payload?.lastCachedInputTokens),
      lastOutputTokens: num(payload?.lastOutputTokens),
      totalProcessedTokens: num(payload?.totalProcessedTokens),
      autoCompactThreshold: num(payload?.autoCompactThreshold),
    });
  }
  return points;
}

function buildCompactions(activities: ReadonlyArray<ThreadInspectActivity>): Compaction[] {
  return activities
    .filter((activity) => activity.kind === "context-compaction")
    .map((activity) => {
      const payload = parsePayload(activity);
      return {
        activityId: activity.activityId,
        at: activity.createdAt,
        turnId: activity.turnId,
        beforeTokens: num(payload?.beforeTokens),
        afterTokens: num(payload?.afterTokens),
      };
    });
}

function messageCategory(role: string): InputCategory {
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  return "system";
}

function buildInputs(
  messages: ReadonlyArray<ThreadInspectMessage>,
  toolCalls: ReadonlyArray<ToolCall>,
  subagents: ReadonlyArray<SubagentTask>,
): ContextInput[] {
  const inputs: ContextInput[] = [];
  for (const message of messages) {
    const category = messageCategory(message.role);
    inputs.push({
      id: `message:${message.messageId}`,
      category,
      label: `${message.role} message`,
      at: message.createdAt,
      turnId: message.turnId,
      chars: message.textChars,
      estimatedTokens: estimateTokens(message.textChars),
    });
    for (const attachment of message.attachments) {
      // Images are billed by the provider per image, not by bytes; bytes/4
      // over-counts them. Kept as a rough size signal.
      inputs.push({
        id: `attachment:${message.messageId}:${attachment.name}`,
        category: "attachments",
        label: attachment.name,
        at: message.createdAt,
        turnId: message.turnId,
        chars: attachment.sizeBytes,
        estimatedTokens: estimateTokens(attachment.sizeBytes),
      });
    }
  }
  for (const call of toolCalls) {
    if (call.outputChars === 0) continue;
    inputs.push({
      id: `tool:${call.id}`,
      category: "tool-output",
      label: call.title,
      at: call.endedAt ?? call.startedAt,
      turnId: call.turnId,
      chars: call.outputChars,
      estimatedTokens: estimateTokens(call.outputChars),
    });
  }
  for (const task of subagents) {
    if (task.summary === null) continue;
    inputs.push({
      id: `subagent:${task.taskId}`,
      category: "subagent-result",
      label: task.title,
      at: task.endedAt ?? task.startedAt,
      turnId: task.turnId,
      chars: task.summary.length,
      estimatedTokens: estimateTokens(task.summary.length),
    });
  }
  return inputs.toSorted((a, b) => time(a.at) - time(b.at));
}

const emptyAdded = (): Record<InputCategory, number> => ({
  user: 0,
  attachments: 0,
  assistant: 0,
  system: 0,
  "tool-output": 0,
  "subagent-result": 0,
});

function buildTurns(
  messages: ReadonlyArray<ThreadInspectMessage>,
  activities: ReadonlyArray<ThreadInspectActivity>,
  inputs: ReadonlyArray<ContextInput>,
  toolCalls: ReadonlyArray<ToolCall>,
  subagents: ReadonlyArray<SubagentTask>,
  usage: ReadonlyArray<UsagePoint>,
  compactions: ReadonlyArray<Compaction>,
): TurnSummary[] {
  const firstSeen = new Map<string, string>();
  const note = (turnId: string | null, at: string) => {
    if (turnId === null) return;
    const seen = firstSeen.get(turnId);
    if (seen === undefined || time(at) < time(seen)) firstSeen.set(turnId, at);
  };
  for (const message of messages) note(message.turnId, message.createdAt);
  for (const activity of activities) note(activity.turnId, activity.createdAt);
  const ordered = [...firstSeen.entries()].toSorted(([, a], [, b]) => time(a) - time(b));

  let previousUsed: number | null = null;
  return ordered.map(([turnId, startedAt], index) => {
    const added = emptyAdded();
    const turnInputs = inputs.filter((input) => input.turnId === turnId);
    for (const input of turnInputs) added[input.category] += input.estimatedTokens;
    const lastUsage = usage.findLast((point) => point.turnId === turnId) ?? null;
    const usedTokens = lastUsage?.usedTokens ?? null;
    const deltaTokens =
      usedTokens !== null && previousUsed !== null ? usedTokens - previousUsed : null;
    if (usedTokens !== null) previousUsed = usedTokens;
    return {
      turnId,
      index: index + 1,
      startedAt,
      toolCalls: toolCalls.filter((call) => call.turnId === turnId).length,
      subagents: subagents.filter((task) => task.turnId === turnId).length,
      compactions: compactions.filter((compaction) => compaction.turnId === turnId).length,
      added,
      usedTokens,
      maxTokens: lastUsage?.maxTokens ?? null,
      deltaTokens,
      topInputs: turnInputs.toSorted((a, b) => b.chars - a.chars).slice(0, 5),
    };
  });
}

function buildTimeline(
  messages: ReadonlyArray<ThreadInspectMessage>,
  activities: ReadonlyArray<ThreadInspectActivity>,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...messages.map((message): TimelineEntry => ({
      id: `message:${message.messageId}`,
      at: message.createdAt,
      turnId: message.turnId,
      group: "message",
      kind: `message.${message.role}`,
      summary: message.text.slice(0, 200) || "(empty)",
      sizeBytes: message.textChars,
      source: { type: "message", message },
    })),
    ...activities.map((activity): TimelineEntry => ({
      id: `activity:${activity.activityId}`,
      at: activity.createdAt,
      turnId: activity.turnId,
      group: activityGroup(activity.kind, activity.tone),
      kind: activity.kind,
      summary: activity.summary,
      sizeBytes: activity.payloadBytes,
      source: { type: "activity", activity },
    })),
  ];
  return entries.toSorted((a, b) => time(a.at) - time(b.at));
}

function buildToolStats(toolCalls: ReadonlyArray<ToolCall>): ToolStat[] {
  const stats = new Map<string, ToolStat>();
  for (const call of toolCalls) {
    const name = call.title;
    const current = stats.get(name) ?? {
      name,
      calls: 0,
      failed: 0,
      outputChars: 0,
      totalDurationMs: 0,
    };
    stats.set(name, {
      name,
      calls: current.calls + 1,
      failed: current.failed + (call.status === "failed" || call.status === "declined" ? 1 : 0),
      outputChars: current.outputChars + call.outputChars,
      totalDurationMs: current.totalDurationMs + (call.durationMs ?? 0),
    });
  }
  return [...stats.values()].toSorted((a, b) => b.outputChars - a.outputChars);
}

export function inspectThread(result: ThreadInspectResult): ThreadInspection {
  const activities = result.activities;
  const toolCalls = buildToolCalls(activities);
  const subagents = buildSubagents(activities);
  const usage = buildUsage(activities);
  const processed = processedTokenSeries(usage);
  const compactions = buildCompactions(activities);
  const inputs = buildInputs(result.messages, toolCalls, subagents);
  const estimatedInputTokens = emptyAdded();
  for (const input of inputs) estimatedInputTokens[input.category] += input.estimatedTokens;
  return {
    toolCalls,
    subagents,
    usage,
    compactions,
    inputs,
    turns: buildTurns(
      result.messages,
      activities,
      inputs,
      toolCalls,
      subagents,
      usage,
      compactions,
    ),
    timeline: buildTimeline(result.messages, activities),
    toolStats: buildToolStats(toolCalls),
    totals: {
      messages: result.messages.length,
      toolCalls: toolCalls.length,
      failedToolCalls: toolCalls.filter(
        (call) => call.status === "failed" || call.status === "declined",
      ).length,
      subagents: subagents.length,
      compactions: compactions.length,
      estimatedInputTokens,
      latestUsage: usage.at(-1) ?? null,
      peakUsedTokens: usage.reduce((peak, point) => Math.max(peak, point.usedTokens), 0),
      processedTokens: processed.at(-1)?.cumulative ?? 0,
    },
    processed,
    olderActivitiesOmitted: result.olderActivitiesOmitted,
  };
}

/** Human token count: 950, 12.4k, 1.2M. */
export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1_000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

/** Pretty-prints stored JSON for the raw view; a cut payload is shown as is. */
export function prettyPayload(activity: ThreadInspectActivity): string {
  const parsed = parsePayload(activity);
  if (parsed === null) {
    return activity.payloadTruncated
      ? `${activity.payloadJson}\n… (cut at ${activity.payloadJson.length} of ${activity.payloadBytes} bytes)`
      : activity.payloadJson;
  }
  return JSON.stringify(parsed, null, 2);
}

export interface ProcessedPoint {
  readonly at: string;
  /** Tokens of the requests since the previous snapshot. */
  readonly tokens: number;
  readonly cumulative: number;
}

/**
 * What the chat cost in tokens, request by request. Subscription limits count
 * every request's full input (the whole context is sent again each time), so
 * this sums each snapshot's last request, or the growth of the provider's
 * running total where it reports one instead.
 */
export function processedTokenSeries(usage: ReadonlyArray<UsagePoint>): ProcessedPoint[] {
  const points: ProcessedPoint[] = [];
  let cumulative = 0;
  let previousTotal: number | null = null;
  for (const point of usage) {
    let tokens = 0;
    if (point.lastInputTokens !== null || point.lastOutputTokens !== null) {
      tokens = (point.lastInputTokens ?? 0) + (point.lastOutputTokens ?? 0);
    } else if (point.totalProcessedTokens !== null) {
      tokens = previousTotal === null ? 0 : Math.max(0, point.totalProcessedTokens - previousTotal);
    }
    if (point.totalProcessedTokens !== null) previousTotal = point.totalProcessedTokens;
    cumulative += tokens;
    points.push({ at: point.at, tokens, cumulative });
  }
  return points;
}

/** Tokens this chat processed between two instants (ms since epoch). */
export function tokensBetween(
  processed: ReadonlyArray<ProcessedPoint>,
  startMs: number,
  endMs: number,
): number {
  let total = 0;
  for (const point of processed) {
    const at = Date.parse(point.at);
    if (at >= startMs && at <= endMs) total += point.tokens;
  }
  return total;
}
