import {
  BarChart,
  CustomChart,
  LineChart,
  ScatterChart,
  type BarSeriesOption,
  type CustomSeriesOption,
  type LineSeriesOption,
  type ScatterSeriesOption,
} from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  type DataZoomComponentOption,
  type GridComponentOption,
  type LegendComponentOption,
  type MarkLineComponentOption,
  type TooltipComponentOption,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

import { chartText } from "../../sandbox/observatoryGraph";
import {
  INPUT_CATEGORIES,
  INPUT_CATEGORY_LABEL,
  contextAt,
  formatTokenCount,
  type AgentTimeline,
  type Compaction,
  type InputCategory,
  type ProcessedPoint,
  type ToolCall,
  type TurnSummary,
  type UsagePoint,
} from "./threadInspection";

echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  CustomChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

type ChartOption = echarts.ComposeOption<
  | LineSeriesOption
  | BarSeriesOption
  | ScatterSeriesOption
  | CustomSeriesOption
  | GridComponentOption
  | LegendComponentOption
  | TooltipComponentOption
  | DataZoomComponentOption
  | MarkLineComponentOption
>;

// Categorical slots 1-6 of the validated reference palette, in fixed order,
// light and dark steps.
const CATEGORY_COLOR: Record<InputCategory, { light: string; dark: string }> = {
  user: { light: "#2a78d6", dark: "#3987e5" },
  attachments: { light: "#eb6834", dark: "#d95926" },
  assistant: { light: "#1baf7a", dark: "#199e70" },
  system: { light: "#eda100", dark: "#c98500" },
  "tool-output": { light: "#e87ba4", dark: "#d55181" },
  "subagent-result": { light: "#008300", dark: "#008300" },
};

interface Ink {
  readonly primary: string;
  readonly secondary: string;
  readonly grid: string;
  readonly surface: string;
}

const inkFor = (dark: boolean): Ink =>
  dark
    ? { primary: "#ffffff", secondary: "#c3c2b7", grid: "#383835", surface: "#1a1a19" }
    : { primary: "#0b0b0b", secondary: "#52514e", grid: "#e4e3df", surface: "#fcfcfb" };

const isDark = () => document.documentElement.classList.contains("dark");

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** One ECharts canvas; the option is rebuilt when inputs or the theme change. */
function EChart({
  build,
  height,
  label,
  signature,
  group,
  onItemClick,
}: {
  readonly build: (dark: boolean) => ChartOption;
  /** Charts in one group share hover and zoom along the time axis. */
  readonly group?: string;
  readonly onItemClick?: (params: { readonly seriesId?: string; readonly data?: unknown }) => void;
  /** Changes only when the charted data does; polling alone never redraws. */
  readonly signature: string;
  readonly height: number;
  readonly label: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const chart = echarts.init(container, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    if (group !== undefined) {
      chart.group = group;
      echarts.connect(group);
    }
    chart.on("click", (params) => clickRef.current?.(params as never));
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [group]);

  const buildRef = useRef(build);
  const clickRef = useRef(onItemClick);
  useEffect(() => {
    buildRef.current = build;
    clickRef.current = onItemClick;
  });

  useEffect(() => {
    // Replacing only the series keeps the zoom window where the user left it.
    const apply = () =>
      chartRef.current?.setOption(buildRef.current(isDark()), { replaceMerge: ["series"] });
    apply();
    // Follow the app's theme toggle.
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [signature]);

  return (
    <div ref={containerRef} role="img" aria-label={label} className="w-full" style={{ height }} />
  );
}

function axisStyle(ink: Ink) {
  return {
    axisLine: { lineStyle: { color: ink.grid } },
    axisTick: { show: false },
    axisLabel: { color: ink.secondary, fontSize: 11 },
    splitLine: { lineStyle: { color: ink.grid, width: 1 } },
  };
}

/**
 * Reported context size over time. Exact numbers from the provider; the
 * dashed lines mark compactions and the window size.
 */
export function ContextSizeChart({
  usage,
  compactions,
  toolCalls = [],
  selectedToolId = null,
  onSelectTool,
  group,
  range,
}: {
  readonly usage: ReadonlyArray<UsagePoint>;
  readonly compactions: ReadonlyArray<Compaction>;
  /** Drawn on the curve at the context size they ran at. */
  readonly toolCalls?: ReadonlyArray<ToolCall>;
  readonly selectedToolId?: string | null;
  readonly onSelectTool?: (toolCallId: string) => void;
  readonly group?: string;
  /** Pins the time axis, so linked charts line up. */
  readonly range?: { readonly startMs: number; readonly endMs: number };
}) {
  const selectedCall = toolCalls.find((call) => call.id === selectedToolId) ?? null;
  const build = (dark: boolean): ChartOption => {
    const ink = inkFor(dark);
    const color = dark ? "#3987e5" : "#2a78d6";
    const maxTokens = usage.findLast((point) => point.maxTokens !== null)?.maxTokens ?? null;
    const threshold =
      usage.findLast((point) => point.autoCompactThreshold !== null)?.autoCompactThreshold ?? null;
    const byTime = new Map(usage.map((point) => [Date.parse(point.at), point]));
    return {
      animation: false,
      grid: { left: 52, right: 16, top: 16, bottom: 56 },
      tooltip: {
        trigger: "axis",
        // Canvas-rendered text: nothing from the chat is parsed as HTML.
        renderMode: "richText",
        axisPointer: { type: "line", lineStyle: { color: ink.secondary } },
        formatter: (params) => {
          const entry = Array.isArray(params) ? params[0] : params;
          const value = entry?.value as [number, number] | undefined;
          if (!value) return "";
          const point = byTime.get(value[0]);
          const lines = [clock(value[0]), `Context: ${formatTokenCount(value[1])} tokens`];
          if (point?.maxTokens) {
            lines.push(
              `Window: ${Math.round((value[1] / point.maxTokens) * 100)}% of ${formatTokenCount(point.maxTokens)}`,
            );
          }
          if (point?.lastInputTokens !== null && point?.lastInputTokens !== undefined) {
            lines.push(`Last request input: ${formatTokenCount(point.lastInputTokens)}`);
          }
          if (point?.lastCachedInputTokens) {
            lines.push(`  of it cached: ${formatTokenCount(point.lastCachedInputTokens)}`);
          }
          if (point?.lastOutputTokens !== null && point?.lastOutputTokens !== undefined) {
            lines.push(`Last output: ${formatTokenCount(point.lastOutputTokens)}`);
          }
          return lines.join("\n");
        },
      },
      xAxis: {
        type: "time",
        ...axisStyle(ink),
        splitLine: { show: false },
        ...(range ? { min: range.startMs, max: range.endMs } : {}),
      },
      yAxis: {
        type: "value",
        ...axisStyle(ink),
        axisLabel: {
          color: ink.secondary,
          fontSize: 11,
          formatter: (value: number) => formatTokenCount(value),
        },
      },
      dataZoom: [
        { type: "inside" },
        {
          type: "slider",
          height: 18,
          bottom: 8,
          borderColor: ink.grid,
          textStyle: { color: ink.secondary },
        },
      ],
      series: [
        {
          type: "line",
          name: "Context tokens",
          showSymbol: usage.length < 60,
          symbolSize: 8,
          lineStyle: { width: 2, color },
          itemStyle: { color, borderColor: ink.surface, borderWidth: 2 },
          areaStyle: { color, opacity: 0.08 },
          data: usage.map((point) => [Date.parse(point.at), point.usedTokens]),
          markLine: {
            symbol: "none",
            silent: true,
            label: { color: ink.secondary, fontSize: 10 },
            lineStyle: { color: ink.secondary, type: "dashed", width: 1 },
            data: [
              ...(maxTokens !== null
                ? [
                    {
                      yAxis: maxTokens,
                      label: { formatter: "window", position: "insideEndTop" as const },
                    },
                  ]
                : []),
              ...(threshold !== null
                ? [
                    {
                      yAxis: threshold,
                      label: { formatter: "auto-compact", position: "insideEndTop" as const },
                    },
                  ]
                : []),
              ...compactions.map((compaction) => ({
                xAxis: Date.parse(compaction.at),
                label: { formatter: "compacted", position: "insideEndTop" as const },
              })),
              ...(selectedCall
                ? [
                    {
                      xAxis: Date.parse(selectedCall.startedAt),
                      label: { formatter: "selected", position: "insideEndTop" as const },
                      lineStyle: { color: ink.primary, type: "solid" as const, width: 1 },
                    },
                  ]
                : []),
            ],
          },
        },
        ...(toolCalls.length > 0
          ? [
              {
                type: "scatter" as const,
                id: "tool-calls",
                name: "Tool calls",
                // Where each call happened on the context curve; bigger dots
                // brought more text back into the context.
                symbolSize: (value: [number, number, string, number]) =>
                  Math.min(6 + Math.log2(1 + value[3] / 400) * 2, 18),
                itemStyle: {
                  color: dark ? "#d55181" : "#e87ba4",
                  borderColor: ink.surface,
                  borderWidth: 1,
                },
                emphasis: { scale: 1.4 },
                tooltip: {
                  trigger: "item" as const,
                  formatter: (params: { data?: unknown }) => {
                    const call = toolCalls.find(
                      (entry) => entry.id === (params.data as [number, number, string])?.[2],
                    );
                    if (!call) return "";
                    return [
                      chartText(call.title, 80),
                      ...(call.detail ? [chartText(call.detail, 100)] : []),
                      `${clock(Date.parse(call.startedAt))} · ${call.status}`,
                      `Context then: ${formatTokenCount(contextAt(usage, Date.parse(call.startedAt)) ?? 0)}`,
                      `Brought back: ~${formatTokenCount(Math.ceil(call.outputChars / 4))} tokens`,
                      "Click for the raw call",
                    ].join("\n");
                  },
                },
                data: toolCalls.map((call) => {
                  const at = Date.parse(call.startedAt);
                  return [at, contextAt(usage, at) ?? 0, call.id, call.outputChars];
                }),
              },
            ]
          : []),
      ],
    };
  };
  return (
    <EChart
      build={build}
      signature={JSON.stringify([
        usage,
        compactions,
        toolCalls.length,
        toolCalls.at(-1)?.status,
        selectedToolId,
        range,
      ])}
      {...(group === undefined ? {} : { group })}
      onItemClick={(params) => {
        if (params.seriesId !== "tool-calls") return;
        const id = (params.data as [number, number, string] | undefined)?.[2];
        if (id !== undefined) onSelectTool?.(id);
      }}
      height={260}
      label="Reported context size over time, with compactions marked"
    />
  );
}

/**
 * What each turn added to the context, by source. Estimated from the stored
 * text (characters / 4), stacked per turn.
 */
export function ContextGrowthChart({ turns }: { readonly turns: ReadonlyArray<TurnSummary> }) {
  const build = (dark: boolean): ChartOption => {
    const ink = inkFor(dark);
    const present = INPUT_CATEGORIES.filter((category) =>
      turns.some((turn) => turn.added[category] > 0),
    );
    return {
      animation: false,
      grid: { left: 52, right: 16, top: 40, bottom: 56 },
      legend: {
        top: 0,
        left: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: ink.secondary, fontSize: 11 },
        data: present.map((category) => INPUT_CATEGORY_LABEL[category]),
      },
      tooltip: {
        trigger: "axis",
        renderMode: "richText",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const entries = Array.isArray(params) ? params : [params];
          const index = entries[0]?.dataIndex ?? 0;
          const turn = turns[index];
          if (!turn) return "";
          const lines = [`Turn ${turn.index} · ${clock(Date.parse(turn.startedAt))}`];
          for (const category of present) {
            if (turn.added[category] > 0) {
              lines.push(
                `${INPUT_CATEGORY_LABEL[category]}: ~${formatTokenCount(turn.added[category])}`,
              );
            }
          }
          if (turn.usedTokens !== null) {
            lines.push(`Reported context after: ${formatTokenCount(turn.usedTokens)}`);
          }
          if (turn.compactions > 0) lines.push("Compacted in this turn");
          return lines.join("\n");
        },
      },
      xAxis: {
        type: "category",
        ...axisStyle(ink),
        splitLine: { show: false },
        data: turns.map((turn) => String(turn.index)),
        name: "turn",
        nameLocation: "middle",
        nameGap: 26,
        nameTextStyle: { color: ink.secondary, fontSize: 11 },
      },
      yAxis: {
        type: "value",
        ...axisStyle(ink),
        axisLabel: {
          color: ink.secondary,
          fontSize: 11,
          formatter: (value: number) => formatTokenCount(value),
        },
      },
      dataZoom:
        turns.length > 30 ? [{ type: "inside" }, { type: "slider", height: 18, bottom: 8 }] : [],
      series: present.map((category, position) => ({
        type: "bar" as const,
        name: INPUT_CATEGORY_LABEL[category],
        stack: "added",
        barMaxWidth: 28,
        itemStyle: {
          color: CATEGORY_COLOR[category][dark ? "dark" : "light"],
          // 2px surface gap between stacked segments; rounded data end on top.
          borderColor: ink.surface,
          borderWidth: 1,
          borderRadius: position === present.length - 1 ? [4, 4, 0, 0] : 0,
        },
        data: turns.map((turn) => turn.added[category]),
      })),
    };
  };
  return (
    <EChart
      build={build}
      signature={JSON.stringify(turns.map((turn) => [turn.turnId, turn.added, turn.usedTokens]))}
      height={280}
      label="Estimated tokens added per turn, stacked by source"
    />
  );
}

/**
 * Tokens the provider processed for this chat, cumulative. Every request
 * resends the whole context, so this is what counts against a subscription
 * limit, not the context size.
 */
export function ProcessedTokensChart({
  processed,
}: {
  readonly processed: ReadonlyArray<ProcessedPoint>;
}) {
  const build = (dark: boolean): ChartOption => {
    const ink = inkFor(dark);
    const color = dark ? "#3987e5" : "#2a78d6";
    return {
      animation: false,
      grid: { left: 52, right: 16, top: 16, bottom: 32 },
      tooltip: {
        trigger: "axis",
        renderMode: "richText",
        axisPointer: { type: "line", lineStyle: { color: ink.secondary } },
        formatter: (params) => {
          const entry = Array.isArray(params) ? params[0] : params;
          const value = entry?.value as [number, number] | undefined;
          if (!value) return "";
          const point = processed[entry?.dataIndex ?? 0];
          return [
            clock(value[0]),
            `Processed so far: ${formatTokenCount(value[1])} tokens`,
            ...(point ? [`This step: ${formatTokenCount(point.tokens)}`] : []),
          ].join("\n");
        },
      },
      xAxis: { type: "time", ...axisStyle(ink), splitLine: { show: false } },
      yAxis: {
        type: "value",
        ...axisStyle(ink),
        axisLabel: {
          color: ink.secondary,
          fontSize: 11,
          formatter: (value: number) => formatTokenCount(value),
        },
      },
      series: [
        {
          type: "line",
          name: "Processed tokens",
          step: "end",
          showSymbol: false,
          lineStyle: { width: 2, color },
          areaStyle: { color, opacity: 0.08 },
          data: processed.map((point) => [Date.parse(point.at), point.cumulative]),
        },
      ],
    };
  };
  return (
    <EChart
      build={build}
      signature={JSON.stringify(processed.at(-1) ?? null) + processed.length}
      height={200}
      label="Tokens processed for this chat over time"
    />
  );
}

const GANTT_ROW_HEIGHT = 28;

/**
 * Who worked when: the main agent and every subagent in its own row, each
 * subagent as a span, every tool call as a thin span in the row of the agent
 * that made it. Shares its time axis with the context chart through `group`.
 */
export function AgentGanttChart({
  timeline,
  selectedId = null,
  onSelect,
  group,
}: {
  readonly timeline: AgentTimeline;
  readonly selectedId?: string | null;
  readonly onSelect?: (item: { readonly kind: "subagent" | "tool"; readonly id: string }) => void;
  readonly group?: string;
}) {
  const build = (dark: boolean): ChartOption => {
    const ink = inkFor(dark);
    const subagentColor = dark ? "#199e70" : "#1baf7a";
    const toolColor = dark ? "#3987e5" : "#2a78d6";
    const failedColor = dark ? "#e66767" : "#e34948";
    const rowLabels = timeline.rows.map((row) => chartText(row.label, 28));
    return {
      animation: false,
      grid: { left: 140, right: 16, top: 8, bottom: 44 },
      tooltip: {
        trigger: "item",
        renderMode: "richText",
        formatter: (params) => {
          const entry = Array.isArray(params) ? params[0] : params;
          const item = timeline.items[(entry?.value as number[] | undefined)?.[3] ?? -1];
          if (!item) return "";
          const row = timeline.rows[item.rowIndex];
          const seconds = (item.endMs - item.startMs) / 1000;
          return [
            chartText(item.name, 80),
            item.kind === "subagent" ? "Subagent" : "Tool call",
            `by ${chartText(row?.label ?? "", 60)}${row?.detail ? ` (${chartText(row.detail, 60)})` : ""}`,
            `${clock(item.startMs)} · ${seconds < 60 ? `${seconds.toFixed(1)}s` : `${(seconds / 60).toFixed(1)}min`}${item.running ? " so far" : ""}`,
            ...(item.failed ? ["Failed"] : []),
            ...(item.detail ? [chartText(item.detail, 160)] : []),
          ].join("\n");
        },
      },
      xAxis: {
        type: "time",
        ...axisStyle(ink),
        splitLine: { show: false },
        min: timeline.startMs,
        max: timeline.endMs,
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: rowLabels,
        ...axisStyle(ink),
        splitLine: { show: true, lineStyle: { color: ink.grid, width: 1 } },
        axisLabel: { color: ink.secondary, fontSize: 11, width: 128, overflow: "truncate" },
      },
      dataZoom: [
        { type: "inside", filterMode: "weakFilter" },
        {
          type: "slider",
          filterMode: "weakFilter",
          height: 18,
          bottom: 8,
          borderColor: ink.grid,
          textStyle: { color: ink.secondary },
        },
      ],
      series: [
        {
          type: "custom",
          id: "agents",
          encode: { x: [1, 2], y: 0 },
          renderItem: (params, api) => {
            const index = api.value(3) as number;
            const item = timeline.items[index];
            if (!item) return null;
            const start = api.coord([api.value(1), api.value(0)]);
            const end = api.coord([api.value(2), api.value(0)]);
            const band = (api.size?.([0, 1]) as number[] | undefined)?.[1] ?? GANTT_ROW_HEIGHT;
            const height = band * (item.kind === "subagent" ? 0.62 : 0.28);
            const coordSys = params.coordSys as unknown as {
              x: number;
              y: number;
              width: number;
              height: number;
            };
            const shape = echarts.graphic.clipRectByRect(
              {
                x: start[0]!,
                y: start[1]! - height / 2,
                width: Math.max(end[0]! - start[0]!, 3),
                height,
              },
              coordSys,
            );
            if (!shape) return null;
            const selected = item.id === selectedId;
            return {
              type: "rect",
              shape: { ...shape, r: item.kind === "subagent" ? 3 : 1 },
              style: {
                fill: item.failed
                  ? failedColor
                  : item.kind === "subagent"
                    ? subagentColor
                    : toolColor,
                opacity: item.kind === "subagent" ? 0.45 : item.running ? 0.6 : 0.95,
                stroke: selected ? ink.primary : ink.surface,
                lineWidth: selected ? 2 : 1,
              },
            };
          },
          data: timeline.items.map((item, index) => [
            item.rowIndex,
            item.startMs,
            item.endMs,
            index,
          ]),
        },
      ],
    };
  };
  const height = Math.max(120, timeline.rows.length * GANTT_ROW_HEIGHT + 60);
  return (
    <EChart
      build={build}
      signature={JSON.stringify([
        timeline.rows,
        timeline.items.length,
        timeline.items.at(-1),
        timeline.startMs,
        timeline.endMs,
        selectedId,
      ])}
      {...(group === undefined ? {} : { group })}
      onItemClick={(params) => {
        const index = (params.data as number[] | undefined)?.[3];
        const item = index === undefined ? undefined : timeline.items[index];
        if (item) onSelect?.({ kind: item.kind, id: item.id });
      }}
      height={height}
      label="Timeline of the main agent, subagents and their tool calls"
    />
  );
}
