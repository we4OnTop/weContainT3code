import { useNavigate } from "@tanstack/react-router";
import { ChartColumnIcon } from "lucide-react";
import { useMemo } from "react";

import { useThreadShells } from "~/state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "~/state/environments";
import { useHostSandboxesByEnvironmentId } from "~/state/sandbox";
import { EnvironmentUsageLimits } from "../chat/inspector/UsageLimitsSection";
import { Button } from "../ui/button";
import { SandboxGraphChart } from "./SandboxGraphChart";
import { buildChatsGraph } from "./chatsGraph";

/**
 * Every chat across this machine, its sandboxes and other servers, and the
 * subscription limits each environment reports. The token history across all
 * chats lives on the usage page, one click away.
 */
export function ChatsOverview({ onNavigateAway }: { readonly onNavigateAway: () => void }) {
  const threads = useThreadShells();
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const sandboxesByEnvironmentId = useHostSandboxesByEnvironmentId();
  const navigate = useNavigate();

  const orderedEnvironments = useMemo(
    () =>
      environments
        .map((environment) => ({
          environmentId: environment.environmentId,
          label: environment.label,
        }))
        .toSorted((a, b) =>
          a.environmentId === primaryEnvironmentId
            ? -1
            : b.environmentId === primaryEnvironmentId
              ? 1
              : a.label.localeCompare(b.label),
        ),
    [environments, primaryEnvironmentId],
  );

  const graph = useMemo(
    () =>
      buildChatsGraph({
        environments: orderedEnvironments,
        primaryEnvironmentId,
        sandboxesByEnvironmentId,
        threads: threads
          .filter((thread) => thread.archivedAt === null)
          .map((thread) => ({
            id: thread.id,
            environmentId: thread.environmentId,
            title: thread.title,
            branch: thread.branch,
            updatedAt: thread.updatedAt,
            latestRun: thread.latestRun,
          })),
      }),
    [orderedEnvironments, primaryEnvironmentId, sandboxesByEnvironmentId, threads],
  );

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1">
        <SandboxGraphChart graph={graph} />
        <p className="text-muted-foreground text-xs">
          Each environment with its chats, newest first. Blue chats are working right now; red ones
          failed their last turn.
          {graph.omittedChats > 0
            ? ` The ${graph.omittedChats} least recent chats are left out.`
            : ""}
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="mr-auto font-medium text-sm">Subscription limits</h3>
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              onNavigateAway();
              void navigate({ to: "/usage" });
            }}
          >
            <ChartColumnIcon />
            Usage over time
          </Button>
        </div>
        {orderedEnvironments.map((environment) => (
          <div key={environment.environmentId} className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">
              {environment.environmentId === primaryEnvironmentId
                ? "This machine"
                : environment.label}
            </span>
            <EnvironmentUsageLimits environmentId={environment.environmentId} />
          </div>
        ))}
      </section>
    </div>
  );
}
