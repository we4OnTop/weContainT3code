import type { SandboxInfo, SandboxStatus } from "@t3tools/contracts";
import { ChevronDownIcon, ContainerIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const STATUS_DOT: Record<SandboxStatus, string> = {
  running: "bg-success",
  creating: "bg-warning",
  removing: "bg-warning",
  stopped: "bg-sidebar-muted-foreground/40",
  error: "bg-destructive",
};

const STATUS_LABEL: Record<SandboxStatus, string> = {
  running: "Running",
  creating: "Starting",
  removing: "Removing",
  stopped: "Stopped",
  error: "Failed",
};

/**
 * One sandbox in the sidebar: a header in the shelf style of "Snoozed" and
 * "Settled" (label, hairline, chevron) with the project's name, the
 * sandbox's state and a new-chat action, then the chats running in it.
 */
export function SandboxThreadGroup(props: {
  readonly sandbox: SandboxInfo;
  readonly label: string;
  /** Shown after the label when several sandboxes share a project name. */
  readonly qualifier: string | null;
  readonly threadCount: number;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  /** Absent while the sandbox's project is not known to the app yet. */
  readonly onNewThread: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  const { sandbox } = props;
  const status = STATUS_LABEL[sandbox.status];
  return (
    <li className="list-none" data-testid="sidebar-sandbox-group">
      <div className="group/sandbox-group mx-0.5 flex h-8 items-center">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={props.onToggle}
                aria-expanded={props.expanded}
                aria-label={`${props.label} sandbox, ${status.toLowerCase()}, ${props.threadCount} ${props.threadCount === 1 ? "chat" : "chats"}`}
                className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 text-left text-xs font-medium text-sidebar-muted-foreground/80 hover:text-sidebar-foreground"
              />
            }
          >
            <ContainerIcon aria-hidden className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate">
              {props.label}
              {props.qualifier ? (
                <span className="font-normal text-sidebar-muted-foreground/60">
                  {" "}
                  · {props.qualifier}
                </span>
              ) : null}
            </span>
            <span
              aria-hidden
              className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[sandbox.status])}
            />
            <span aria-hidden className="h-px min-w-2 flex-1 bg-sidebar-border/60" />
            {!props.expanded ? (
              <span className="shrink-0 tabular-nums">{props.threadCount}</span>
            ) : null}
            <ChevronDownIcon
              aria-hidden
              className={cn("size-3 shrink-0 transition-transform", props.expanded && "rotate-180")}
            />
          </TooltipTrigger>
          <TooltipPopup side="right">
            {status} sandbox for {props.label}
          </TooltipPopup>
        </Tooltip>
        {props.onNewThread ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={props.onNewThread}
                  aria-label={`New chat in the ${props.label} sandbox`}
                  className="me-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-sidebar-muted-foreground/70 opacity-0 transition-opacity hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:opacity-100 group-hover/sandbox-group:opacity-100"
                />
              }
            >
              <PlusIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup side="right">New chat in this sandbox</TooltipPopup>
          </Tooltip>
        ) : null}
      </div>
      {props.expanded ? <ul className="flex flex-col">{props.children}</ul> : null}
    </li>
  );
}
