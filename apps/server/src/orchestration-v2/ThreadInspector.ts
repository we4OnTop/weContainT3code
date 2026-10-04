/**
 * ThreadInspector - reads the full stored record of one chat for the chat
 * inspector panel: messages and reasoning plus every tool call, subagent task,
 * context-window report and compaction, with its stored input and output.
 *
 * The inspect contract predates the v2 projection and speaks in "activities"
 * (`tool.started`/`tool.completed`, `task.*`, `context-window.updated`, ...).
 * This service translates the v2 records into that shape so the panel does
 * not care where they came from.
 *
 * Read-only. Payloads and texts are cut to fixed sizes so one chat with huge
 * tool outputs cannot blow up a response.
 *
 * @module ThreadInspector
 */
import {
  EventId,
  MessageId,
  THREAD_INSPECT_ACTIVITY_LIMIT,
  THREAD_INSPECT_MESSAGE_LIMIT,
  THREAD_INSPECT_MESSAGE_TEXT_LIMIT,
  THREAD_INSPECT_PAYLOAD_LIMIT,
  ThreadInspectError,
  TurnId,
  type ChatAttachment,
  type OrchestrationV2ConversationMessage,
  type OrchestrationV2ExecutionNode,
  type OrchestrationV2ProviderTurn,
  type OrchestrationV2TurnItem,
  type RunId,
  type ThreadInspectActivity,
  type ThreadInspectInput,
  type ThreadInspectMessage,
  type ThreadInspectResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ProjectionStore from "./ProjectionStore.ts";

export class ThreadInspector extends Context.Service<
  ThreadInspector,
  {
    readonly inspect: (
      input: ThreadInspectInput,
    ) => Effect.Effect<ThreadInspectResult, ThreadInspectError>;
  }
>()("t3/orchestration-v2/ThreadInspector") {}

const utf8 = new TextEncoder();
const SHORT_TEXT_LIMIT = 2_000;

const short = (value: string) =>
  value.length > SHORT_TEXT_LIMIT ? value.slice(0, SHORT_TEXT_LIMIT) : value;

const iso = (value: DateTime.Utc) => DateTime.formatIso(value);

const turnIdOf = (runId: RunId | null) => (runId === null ? null : TurnId.make(runId));

function payloadJson(payload: unknown): string {
  if (payload === undefined) return "null";
  try {
    return JSON.stringify(payload) ?? "null";
  } catch {
    return JSON.stringify("[unserializable payload]");
  }
}

/** One activity before its payload is serialized and cut. */
export interface InspectActivityRow {
  readonly activityId: string;
  readonly kind: string;
  readonly tone: string;
  readonly summary: string;
  readonly turnId: TurnId | null;
  readonly sequence?: number;
  readonly createdAt: string;
  readonly payload: unknown;
}

export function toInspectActivity(row: InspectActivityRow): ThreadInspectActivity {
  const json = payloadJson(row.payload);
  const truncated = json.length > THREAD_INSPECT_PAYLOAD_LIMIT;
  return {
    activityId: EventId.make(row.activityId),
    kind: short(row.kind),
    tone: short(row.tone),
    summary: short(row.summary),
    turnId: row.turnId,
    ...(row.sequence !== undefined ? { sequence: row.sequence } : {}),
    createdAt: row.createdAt,
    payloadJson: truncated ? json.slice(0, THREAD_INSPECT_PAYLOAD_LIMIT) : json,
    payloadBytes: utf8.encode(json).length,
    payloadTruncated: truncated,
  };
}

/** One message before its text is cut. */
export interface InspectMessageRow {
  readonly messageId: string;
  readonly role: string;
  readonly turnId: TurnId | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly text: string;
  readonly attachments: ReadonlyArray<
    Pick<ChatAttachment, "type" | "name" | "mimeType" | "sizeBytes">
  >;
}

export function toInspectMessage(row: InspectMessageRow): ThreadInspectMessage {
  return {
    messageId: MessageId.make(row.messageId),
    role: short(row.role),
    turnId: row.turnId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    text:
      row.text.length > THREAD_INSPECT_MESSAGE_TEXT_LIMIT
        ? row.text.slice(0, THREAD_INSPECT_MESSAGE_TEXT_LIMIT)
        : row.text,
    textChars: row.text.length,
    attachments: row.attachments.slice(0, 100).map((attachment) => ({
      type: short(attachment.type),
      name: short(attachment.name),
      mimeType: short(attachment.mimeType),
      sizeBytes: attachment.sizeBytes,
    })),
  };
}

type ToolItem = Extract<
  OrchestrationV2TurnItem,
  {
    readonly type:
      | "command_execution"
      | "file_change"
      | "file_search"
      | "web_search"
      | "dynamic_tool";
  }
>;

const isToolItem = (item: OrchestrationV2TurnItem): item is ToolItem =>
  item.type === "command_execution" ||
  item.type === "file_change" ||
  item.type === "file_search" ||
  item.type === "web_search" ||
  item.type === "dynamic_tool";

/** What the tool was given and what it handed back to the model. */
function toolData(item: ToolItem) {
  switch (item.type) {
    case "command_execution":
      return { input: item.input, output: item.output, exitCode: item.exitCode };
    case "file_change":
      return {
        fileName: item.fileName,
        additions: item.additions,
        deletions: item.deletions,
        diff: item.diffStr,
        changes: item.changes,
      };
    case "file_search":
      return { pattern: item.pattern, results: item.results };
    case "web_search":
      return { patterns: item.patterns, results: item.results };
    case "dynamic_tool":
      return { toolName: item.toolName, input: item.input, output: item.output };
  }
}

function toolTitle(item: ToolItem): string {
  if (item.title) return item.title;
  switch (item.type) {
    case "command_execution":
      return "Command";
    case "file_change":
      return "File change";
    case "file_search":
      return "File search";
    case "web_search":
      return "Web search";
    case "dynamic_tool":
      return item.toolName ?? "Tool";
  }
}

function toolDetail(item: ToolItem): string | undefined {
  switch (item.type) {
    case "command_execution":
      return item.input;
    case "file_change":
      return item.fileName;
    case "file_search":
      return item.pattern;
    case "web_search":
      return item.patterns?.join(", ");
    case "dynamic_tool":
      return item.toolName ?? undefined;
  }
}

/** The inspector's tool states: inProgress, completed, failed, declined. */
function toolStatus(item: ToolItem): string {
  if (
    item.type === "command_execution" &&
    (item.outputIndicatesFailure === true || (item.exitCode !== undefined && item.exitCode !== 0))
  ) {
    return "failed";
  }
  switch (item.status) {
    case "completed":
      return "completed";
    case "failed":
    case "interrupted":
      return "failed";
    case "cancelled":
      return "declined";
    default:
      return "inProgress";
  }
}

const MESSAGE_ITEM_TYPES = new Set<OrchestrationV2TurnItem["type"]>([
  "user_message",
  "assistant_message",
  "reasoning",
]);

function itemActivities(item: OrchestrationV2TurnItem): InspectActivityRow[] {
  const turnId = turnIdOf(item.runId);
  const startedAt = iso(item.startedAt ?? item.updatedAt);
  const base = { turnId, sequence: item.ordinal };
  if (isToolItem(item)) {
    const head = {
      toolCallId: item.id,
      itemType: item.type === "dynamic_tool" ? "dynamic_tool_call" : item.type,
      title: toolTitle(item),
      detail: toolDetail(item),
      toolSource: item.toolSource?.name ?? item.toolSurface,
    };
    const rows: InspectActivityRow[] = [
      {
        ...base,
        activityId: `${item.id}:started`,
        kind: "tool.started",
        tone: "tool",
        summary: `${head.title} started`,
        createdAt: startedAt,
        payload: { ...head, status: "inProgress" },
      },
    ];
    if (item.completedAt !== null) {
      const status = toolStatus(item);
      rows.push({
        ...base,
        activityId: `${item.id}:completed`,
        kind: status === "declined" ? "tool.denied" : "tool.completed",
        tone: status === "failed" ? "error" : "tool",
        summary: head.title,
        createdAt: iso(item.completedAt),
        payload: { ...head, status, data: toolData(item) },
      });
    }
    return rows;
  }
  switch (item.type) {
    case "subagent": {
      const head = {
        taskId: item.subagentId,
        title: item.title ?? "Subagent",
        detail: item.prompt,
        agentKind: item.driver,
        agentId: item.childThreadId,
      };
      const rows: InspectActivityRow[] = [
        {
          ...base,
          activityId: `${item.id}:started`,
          kind: "task.started",
          tone: "info",
          summary: head.title,
          createdAt: startedAt,
          payload: { ...head, status: "running", summary: item.progress },
        },
      ];
      if (item.completedAt !== null) {
        rows.push({
          ...base,
          activityId: `${item.id}:completed`,
          kind: "task.completed",
          tone: item.status === "failed" ? "error" : "info",
          summary: head.title,
          createdAt: iso(item.completedAt),
          payload: { ...head, status: item.status, summary: item.result ?? item.progress },
        });
      }
      return rows;
    }
    case "compaction":
      return [
        {
          ...base,
          activityId: item.id,
          kind: "context-compaction",
          tone: "info",
          summary: item.title ?? "Context compacted",
          createdAt: startedAt,
          payload: {
            beforeTokens: item.beforeTokenCount,
            afterTokens: item.afterTokenCount,
            summary: item.summary,
          },
        },
      ];
    case "error":
      return [
        {
          ...base,
          activityId: item.id,
          kind: "runtime.error",
          tone: "error",
          summary: item.failure.message,
          createdAt: startedAt,
          payload: { failure: item.failure, retry: item.retry },
        },
      ];
    case "approval_request":
      return [
        {
          ...base,
          activityId: item.id,
          kind: "approval.requested",
          tone: "approval",
          summary: item.title ?? item.prompt ?? item.requestKind,
          createdAt: startedAt,
          payload: item,
        },
      ];
    case "user_input_request":
      return [
        {
          ...base,
          activityId: item.id,
          kind: "user-input.requested",
          tone: "approval",
          summary: item.title ?? "Question for the user",
          createdAt: startedAt,
          payload: item,
        },
      ];
    default:
      if (MESSAGE_ITEM_TYPES.has(item.type)) return [];
      return [
        {
          ...base,
          activityId: item.id,
          kind: item.type,
          tone: "info",
          summary: item.title ?? item.type,
          createdAt: startedAt,
          payload: item,
        },
      ];
  }
}

/** The provider's latest context report for each of its turns. */
function usageActivities(
  providerTurns: ReadonlyArray<OrchestrationV2ProviderTurn>,
  nodes: ReadonlyArray<OrchestrationV2ExecutionNode>,
): InspectActivityRow[] {
  const runByNode = new Map(nodes.map((node) => [node.id, node.runId]));
  return providerTurns.flatMap((turn) => {
    const usage = turn.tokenUsage;
    if (usage === undefined) return [];
    return [
      {
        activityId: `${turn.id}:context-window`,
        kind: "context-window.updated",
        tone: "info",
        summary: "Context window updated",
        turnId: turnIdOf(runByNode.get(turn.nodeId) ?? null),
        createdAt: usage.updatedAt,
        payload: {
          usedTokens: usage.usedTokens,
          maxTokens: usage.maxTokens,
          lastInputTokens: usage.inputTokens,
          lastCachedInputTokens: usage.cachedInputTokens,
          lastOutputTokens: usage.outputTokens,
          lastReasoningOutputTokens: usage.reasoningOutputTokens,
        },
      },
    ];
  });
}

const byTime = <T extends { readonly createdAt: string }>(a: T, b: T) =>
  Date.parse(a.createdAt) - Date.parse(b.createdAt);

/** Turns the v2 records of one thread into the inspector's result. */
export function inspectRecords(input: {
  readonly threadId: ThreadInspectInput["threadId"];
  readonly messages: ReadonlyArray<OrchestrationV2ConversationMessage>;
  readonly turnItems: ReadonlyArray<OrchestrationV2TurnItem>;
  readonly providerTurns: ReadonlyArray<OrchestrationV2ProviderTurn>;
  readonly nodes: ReadonlyArray<OrchestrationV2ExecutionNode>;
}): ThreadInspectResult {
  const messageRows: InspectMessageRow[] = [
    ...input.messages.map((message) => ({
      messageId: message.id,
      role: message.role,
      turnId: turnIdOf(message.runId),
      createdAt: iso(message.createdAt),
      updatedAt: iso(message.updatedAt),
      text: message.text,
      attachments: message.attachments,
    })),
    // Reasoning is a turn item in v2; the panel reads it as a "reasoning" message.
    ...input.turnItems.flatMap((item) =>
      item.type === "reasoning"
        ? [
            {
              messageId: item.id,
              role: "reasoning",
              turnId: turnIdOf(item.runId),
              createdAt: iso(item.startedAt ?? item.updatedAt),
              updatedAt: iso(item.completedAt ?? item.updatedAt),
              text: item.text,
              attachments: [],
            },
          ]
        : [],
    ),
  ].toSorted(byTime);
  const activityRows = [
    ...input.turnItems.flatMap(itemActivities),
    ...usageActivities(input.providerTurns, input.nodes),
  ].toSorted((a, b) => byTime(a, b) || (a.sequence ?? 0) - (b.sequence ?? 0));
  const olderActivitiesOmitted = activityRows.length > THREAD_INSPECT_ACTIVITY_LIMIT;
  return {
    threadId: input.threadId,
    // The newest messages and activities matter most once a chat is this long.
    messages: messageRows.slice(-THREAD_INSPECT_MESSAGE_LIMIT).map(toInspectMessage),
    activities: activityRows.slice(-THREAD_INSPECT_ACTIVITY_LIMIT).map(toInspectActivity),
    olderActivitiesOmitted,
  };
}

const make = Effect.gen(function* () {
  const projections = yield* ProjectionStore.ProjectionStoreV2;

  const inspect = (input: ThreadInspectInput) =>
    projections
      .getThreadRecords(input.threadId, ["messages", "turnItems", "providerTurns", "nodes"])
      .pipe(
        Effect.map((records) => inspectRecords({ threadId: input.threadId, ...records })),
        Effect.mapError(
          (cause) => new ThreadInspectError({ message: "Failed to read the chat record", cause }),
        ),
      );

  return ThreadInspector.of({ inspect });
});

export const layer = Layer.effect(ThreadInspector, make).pipe(Layer.provide(ProjectionStore.layer));
