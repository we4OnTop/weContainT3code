import { GraphChart, type GraphSeriesOption } from "echarts/charts";
import { TooltipComponent, type TooltipComponentOption } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

import type { GraphNodeKind, ObservatoryGraph } from "./observatoryGraph";

// Only the modules the observatory draws; no wrapper library in between.
echarts.use([GraphChart, TooltipComponent, CanvasRenderer]);

type ChartOption = echarts.ComposeOption<GraphSeriesOption | TooltipComponentOption>;

const KIND_COLOR: Record<GraphNodeKind, string> = {
  receiver: "#6366f1",
  sandbox: "#10b981",
  remote: "#f59e0b",
  proxy: "#0ea5e9",
};
const ALERT_COLOR = "#ef4444";
const MUTED_COLOR = "#9ca3af";

const KIND_SIZE: Record<GraphNodeKind, number> = {
  receiver: 54,
  sandbox: 38,
  remote: 34,
  proxy: 30,
};

interface TooltipData {
  readonly tooltipLines?: ReadonlyArray<string>;
}

function buildOption(graph: ObservatoryGraph, dark: boolean): ChartOption {
  const text = dark ? "#e5e7eb" : "#1f2937";
  return {
    tooltip: {
      // Canvas-rendered tooltips: nothing from a sandbox is ever parsed as HTML.
      renderMode: "richText",
      formatter: (params) => {
        const entry = Array.isArray(params) ? params[0] : params;
        const data = (entry?.data ?? {}) as TooltipData;
        return (data.tooltipLines ?? []).join("\n");
      },
    },
    series: [
      {
        type: "graph",
        layout: "force",
        roam: true,
        draggable: true,
        force: { repulsion: 420, edgeLength: [90, 170], gravity: 0.08 },
        label: { show: true, position: "bottom", color: text, formatter: "{b}" },
        edgeLabel: { show: true, color: text, fontSize: 10 },
        edgeSymbol: ["none", "arrow"],
        edgeSymbolSize: 8,
        data: graph.nodes.map((node) => ({
          id: node.id,
          name: node.name,
          symbolSize: KIND_SIZE[node.kind],
          itemStyle: {
            color: node.muted ? MUTED_COLOR : KIND_COLOR[node.kind],
            borderColor: node.alert ? ALERT_COLOR : "transparent",
            borderWidth: node.alert ? 4 : 0,
          },
          tooltipLines: [node.name, ...node.details],
        })),
        links: graph.links.map((link) => ({
          source: link.source,
          target: link.target,
          value: link.weight,
          // Host-generated counts only ("3 syncs"); braces never appear here.
          label: { show: link.label.length > 0, formatter: link.label },
          lineStyle: {
            color: link.alert ? ALERT_COLOR : MUTED_COLOR,
            width: Math.min(1 + Math.log2(1 + link.weight), 6),
            curveness: 0.1,
          },
          tooltipLines: link.details,
        })),
      },
    ],
  };
}

/** Force-directed map of sandboxes, the git receiver, remotes and the proxy. */
export function SandboxGraphChart({ graph }: { readonly graph: ObservatoryGraph }) {
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
    const dark = document.documentElement.classList.contains("dark");
    chartRef.current?.setOption(buildOption(graph, dark), { notMerge: true });
  }, [graph]);

  return <div ref={containerRef} className="h-[420px] w-full rounded-md border" />;
}
