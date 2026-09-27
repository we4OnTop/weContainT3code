import type { EnvironmentId, ServerProvider, ServerProviderUsageWindow } from "@t3tools/contracts";
import { providersWithLimits } from "@t3tools/shared/usageLimits";
import { useEffect, useState } from "react";

import { useEnvironments } from "~/state/environments";
import { getDriverOption } from "../../settings/providerDriverMeta";
import { LimitWindows } from "../../usage/UsageLimits";
import { formatTokenCount } from "./threadInspection";

/** "now" for reset countdowns, refreshed every minute. */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

const providerLabel = (provider: ServerProvider) =>
  provider.displayName ?? getDriverOption(provider.driver)?.label ?? String(provider.driver);

/** Start of a limit window, when the provider says how long it is. */
export function windowStartMs(window: ServerProviderUsageWindow): number | null {
  if (window.resetsAt === undefined || window.windowDurationMins === undefined) return null;
  const resetsAt = Date.parse(window.resetsAt);
  return Number.isNaN(resetsAt) ? null : resetsAt - window.windowDurationMins * 60_000;
}

/**
 * Subscription limits of every provider an environment runs (Claude, Codex,
 * OpenCode, ...), as reported by that environment's own server. With
 * `tokensInWindow`, each window also shows what the given chat used in it.
 */
export function EnvironmentUsageLimits({
  environmentId,
  tokensInWindow,
}: {
  readonly environmentId: EnvironmentId;
  readonly tokensInWindow?: (startMs: number, endMs: number) => number;
}) {
  const { environments } = useEnvironments();
  const now = useMinuteClock();
  const environment = environments.find((entry) => entry.environmentId === environmentId);
  const providers = providersWithLimits(environment?.serverConfig?.providers ?? []);
  if (providers.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        {environment?.label ?? "This environment"} reports no subscription limits (not signed in, or
        the provider does not publish them).
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {providers.map((provider) => {
        const limits = provider.usageLimits!;
        return (
          <div key={provider.instanceId} className="rounded-md border px-3 py-2">
            <div className="mb-1 flex items-center gap-2 text-xs">
              <span className="font-medium">{providerLabel(provider)}</span>
              {limits.unavailable ? (
                <span className="text-muted-foreground">
                  {limits.unavailable.reason === "unsupported"
                    ? "does not report limits"
                    : "limits could not be read"}
                </span>
              ) : null}
            </div>
            {limits.windows.length > 0 ? (
              <LimitWindows driver={provider.driver} windows={limits.windows} now={now} compact />
            ) : null}
            {tokensInWindow
              ? limits.windows.map((window) => {
                  const start = windowStartMs(window);
                  if (start === null) return null;
                  const tokens = tokensInWindow(start, now);
                  return (
                    <p key={window.id} className="mt-1 text-muted-foreground text-xs">
                      {window.label}: this chat processed{" "}
                      <span className="text-foreground tabular-nums">
                        {formatTokenCount(tokens)}
                      </span>{" "}
                      tokens in the current window
                    </p>
                  );
                })
              : null}
          </div>
        );
      })}
    </div>
  );
}
