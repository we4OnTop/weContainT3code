import { BarChart, LineChart, type BarSeriesOption, type LineSeriesOption } from "echarts/charts";
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

import {
  INPUT_CATEGORIES,
  INPUT_CATEGORY_LABEL,
  formatTokenCount,
  type Compaction,
  type InputCategory,
  type TurnSummary,
  type UsagePoint,
} from "./threadInspection";

echarts.use([
  LineChart,
  BarChart,
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
}: {
  readonly build: (dark: boolean) => ChartOption;
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
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const apply = () => chartRef.current?.setOption(build(isDark()), { notMerge: true });
    apply();
    // Follow the app's theme toggle.
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [build]);

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
}: {
  readonly usage: ReadonlyArray<UsagePoint>;
  readonly compactions: ReadonlyArray<Compaction>;
}) {
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
            ],
          },
        },
      ],
    };
  };
  return (
    <EChart
      build={build}
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
    <EChart build={build} height={280} label="Estimated tokens added per turn, stacked by source" />
  );
}
