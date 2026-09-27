/**
 * Pure readers for the sbx network policy (`sbx policy ls --json`) and the
 * proxy log (`sbx policy log --json`). Both are daemon output the host trusts;
 * the log's host names, however, come from requests a sandbox made, so they
 * are only ever passed on as data, never used as arguments.
 */

import type {
  SandboxNetworkEvent,
  SandboxPolicyDecision,
  SandboxPolicyRule,
} from "@t3tools/contracts";

/** sbx rule ids are UUIDs or named groups (`default-*`, `kit:<sandbox>`). */
const RULE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/;

/** Upper bound on log entries read per overview; the daemon keeps aggregates. */
export const NETWORK_LOG_LIMIT = 1000;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * Rules sbx ships (the balanced defaults) and those an agent kit adds for its
 * sandbox. They are shown but not removable from the app: restoring them is
 * not something the app can do.
 */
export const isBuiltinRule = (name: string) =>
  name.startsWith("default-") || name.startsWith("kit:");

export function parsePolicyRules(
  raw: string,
  sandboxIdByName: ReadonlyMap<string, string>,
): SandboxPolicyRule[] {
  const rules = asRecord(parseJson(raw))?.["rules"];
  if (!Array.isArray(rules)) return [];
  const parsed: SandboxPolicyRule[] = [];
  for (const entry of rules) {
    const rule = asRecord(entry);
    if (rule === null || rule["resource_type"] !== "network") continue;
    const ruleId = asString(rule["id"]);
    const decision = rule["decision"];
    if (ruleId === null || !RULE_ID_PATTERN.test(ruleId)) continue;
    if (decision !== "allow" && decision !== "deny") continue;
    const name = asString(rule["name"]) ?? ruleId;
    const scope = asString(rule["scope"]) ?? "global";
    const sandboxName = scope.startsWith("sandbox:")
      ? (asString(rule["sandbox_id"]) ?? scope.slice("sandbox:".length))
      : null;
    const resources = Array.isArray(rule["resources"])
      ? rule["resources"].filter((resource): resource is string => typeof resource === "string")
      : [];
    parsed.push({
      ruleId,
      name,
      decision,
      resources,
      sandboxName,
      sandboxId: sandboxName === null ? null : (sandboxIdByName.get(sandboxName) ?? null),
      removable: rule["editable"] === true && rule["status"] !== "inactive" && !isBuiltinRule(name),
    });
  }
  return parsed;
}

export function parseNetworkLog(
  raw: string,
  sandboxIdByName: ReadonlyMap<string, string>,
): SandboxNetworkEvent[] {
  const root = asRecord(parseJson(raw));
  if (root === null) return [];
  const events: SandboxNetworkEvent[] = [];
  const read = (list: unknown, outcome: SandboxNetworkEvent["outcome"]) => {
    if (!Array.isArray(list)) return;
    for (const entry of list) {
      const event = asRecord(entry);
      const host = asString(event?.["host"]);
      const sandboxName = asString(event?.["vm_name"]);
      if (event === null || host === null || sandboxName === null) continue;
      const lastSeen = asString(event["last_seen"]) ?? "";
      const count = event["count_since"];
      events.push({
        sandboxName,
        sandboxId: sandboxIdByName.get(sandboxName) ?? null,
        host: host.slice(0, 300),
        outcome,
        reason: asString(event["reason"])?.slice(0, 300) ?? null,
        rule: asString(event["rule"])?.slice(0, 500) ?? null,
        firstSeen: asString(event["since"]) ?? lastSeen,
        lastSeen,
        count: typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : 0,
      });
    }
  };
  read(root["blocked_hosts"], "blocked");
  read(root["allowed_hosts"], "allowed");
  return events.toSorted((left, right) => right.lastSeen.localeCompare(left.lastSeen));
}

/**
 * Resources a sandbox should carry that its scoped rules do not have yet.
 * Rules are only ever added here: a rule the user added for this sandbox from
 * the observatory must survive re-opening it.
 */
export function missingScopedResources(
  rules: ReadonlyArray<SandboxPolicyRule>,
  sandboxName: string,
  decision: SandboxPolicyDecision,
  wanted: ReadonlyArray<string>,
): string[] {
  const present = new Set(
    rules
      .filter((rule) => rule.sandboxName === sandboxName && rule.decision === decision)
      .flatMap((rule) => rule.resources),
  );
  return [...new Set(wanted)].filter((resource) => !present.has(resource));
}
