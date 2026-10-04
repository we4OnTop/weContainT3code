import { type ReactNode, useId } from "react";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export type FlowStatus = "idle" | "pending" | "running" | "done" | "skipped" | "failed" | "warning";

export interface FlowCard {
  readonly id: string;
  readonly title: string;
  /** One line; the full text is the card's tooltip. */
  readonly detail?: string | null;
  readonly status: FlowStatus;
  readonly icon?: ReactNode;
  /** Small controls shown on the card, e.g. reorder or retry. */
  readonly actions?: ReactNode;
}

/** One step of the flow. Cards in the same stage run side by side. */
export interface FlowStage {
  readonly id: string;
  readonly cards: ReadonlyArray<FlowCard>;
}

export interface FlowEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly status?: FlowStatus;
  /** A route that exists but is not taken, e.g. a switched-off proxy. */
  readonly dashed?: boolean;
}

const SIZES = {
  regular: { width: 176, height: 60, gap: 10, connector: 44 },
  compact: { width: 240, height: 44, gap: 8, connector: 18 },
} as const;

const CARD_STATUS_CLASS: Record<FlowStatus, string> = {
  idle: "border-border",
  pending: "border-border border-dashed text-muted-foreground",
  running: "border-info bg-info/6",
  done: "border-success/60",
  skipped: "border-border border-dashed text-muted-foreground",
  failed: "border-destructive bg-destructive/6",
  warning: "border-warning bg-warning/6",
};

const EDGE_STATUS_CLASS: Record<FlowStatus, string> = {
  idle: "stroke-muted-foreground/50",
  pending: "stroke-muted-foreground/30",
  running: "stroke-info",
  done: "stroke-success/70",
  skipped: "stroke-muted-foreground/30",
  failed: "stroke-destructive",
  warning: "stroke-warning",
};

const STATUS_LABEL: Record<FlowStatus, string> = {
  idle: "",
  pending: "pending",
  running: "running",
  done: "done",
  skipped: "skipped",
  failed: "failed",
  warning: "needs attention",
};

interface Placed {
  readonly card: FlowCard;
  readonly x: number;
  readonly y: number;
}

/**
 * Cards joined by sequence-flow lines, like a BPMN diagram: stages run in
 * order, cards inside a stage side by side. Without explicit edges every card
 * of a stage connects to every card of the next one. Layout is fixed-size, so
 * the lines need no measuring and the flow renders in one pass.
 */
export function PipelineFlow({
  stages,
  edges,
  orientation = "horizontal",
  size = "regular",
  ariaLabel,
}: {
  readonly stages: ReadonlyArray<FlowStage>;
  readonly edges?: ReadonlyArray<FlowEdge>;
  readonly orientation?: "horizontal" | "vertical";
  readonly size?: keyof typeof SIZES;
  readonly ariaLabel: string;
}) {
  const markerId = useId();
  const { gap: GAP, connector: CONNECTOR, ...CARD } = SIZES[size];
  const horizontal = orientation === "horizontal";
  const lanes = Math.max(1, ...stages.map((stage) => stage.cards.length));
  const along = (horizontal ? CARD.width : CARD.height) + CONNECTOR;
  const across = (horizontal ? CARD.height : CARD.width) + GAP;

  const placed = new Map<string, Placed>();
  stages.forEach((stage, stageIndex) => {
    // Centre short stages against the widest one.
    const offset = ((lanes - stage.cards.length) * across) / 2;
    stage.cards.forEach((card, laneIndex) => {
      const main = stageIndex * along;
      const cross = offset + laneIndex * across;
      placed.set(card.id, {
        card,
        x: horizontal ? main : cross,
        y: horizontal ? cross : main,
      });
    });
  });

  const resolvedEdges: ReadonlyArray<FlowEdge> =
    edges ??
    stages.slice(1).flatMap((stage, index) =>
      stages[index]!.cards.flatMap((from) =>
        stage.cards.map((to) => ({
          from: from.id,
          to: to.id,
          status: to.status === "pending" || to.status === "skipped" ? to.status : from.status,
        })),
      ),
    );

  const width = horizontal ? stages.length * along - CONNECTOR : lanes * across - GAP;
  const height = horizontal ? lanes * across - GAP : stages.length * along - CONNECTOR;

  return (
    <div className="overflow-x-auto" role="group" aria-label={ariaLabel}>
      <div className="relative" style={{ width, height }}>
        <svg className="absolute inset-0" width={width} height={height} aria-hidden>
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground/60" />
            </marker>
          </defs>
          {resolvedEdges.map((edge) => {
            const from = placed.get(edge.from);
            const to = placed.get(edge.to);
            if (from === undefined || to === undefined) return null;
            const [x1, y1] = horizontal
              ? [from.x + CARD.width, from.y + CARD.height / 2]
              : [from.x + CARD.width / 2, from.y + CARD.height];
            const [x2, y2] = horizontal
              ? [to.x, to.y + CARD.height / 2]
              : [to.x + CARD.width / 2, to.y];
            const bend = CONNECTOR / 2;
            const path = horizontal
              ? `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`
              : `M${x1},${y1} C${x1},${y1 + bend} ${x2},${y2 - bend} ${x2},${y2}`;
            return (
              <g key={`${edge.from}->${edge.to}`}>
                <path
                  d={path}
                  fill="none"
                  strokeWidth={1.5}
                  strokeDasharray={edge.dashed ? "4 3" : undefined}
                  className={EDGE_STATUS_CLASS[edge.status ?? "idle"]}
                  markerEnd={`url(#${markerId})`}
                />
                {edge.label ? (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 4}
                    textAnchor="middle"
                    className="fill-muted-foreground text-3xs"
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        <ol className="contents">
          {[...placed.values()].map(({ card, x, y }) => (
            <li
              key={card.id}
              className={cn(
                "absolute flex items-center gap-1 rounded-lg border bg-background px-2.5 py-1.5",
                CARD_STATUS_CLASS[card.status],
              )}
              style={{ left: x, top: y, width: CARD.width, height: CARD.height }}
            >
              <Tooltip>
                <TooltipTrigger
                  render={<div />}
                  className="flex min-w-0 flex-1 flex-col justify-center gap-0.5"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {card.icon ? (
                      <span className="shrink-0 [&_svg]:size-3.5">{card.icon}</span>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {card.title}
                    </span>
                  </span>
                  {card.detail ? (
                    <span className="truncate text-2xs text-muted-foreground">{card.detail}</span>
                  ) : null}
                  <span className="sr-only">{STATUS_LABEL[card.status]}</span>
                </TooltipTrigger>
                <TooltipPopup className="max-w-80 whitespace-pre-line">
                  {[card.title, card.detail, STATUS_LABEL[card.status]]
                    .filter((part) => part)
                    .join("\n")}
                </TooltipPopup>
              </Tooltip>
              {card.actions ? (
                <span className="flex shrink-0 items-center">{card.actions}</span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
