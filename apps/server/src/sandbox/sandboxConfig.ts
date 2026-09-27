/**
 * Host side of weContain's committed `.sandbox-config`.
 *
 * A project can declare how its sandboxes are built next to its code. Only the
 * host-relevant keys are read here; the guest start script reads the tooling
 * toggles (gortex, dreamfeed, openspec, ...) from the same file inside the
 * sandbox. Parsing is lenient on purpose: a malformed or foreign value is
 * dropped rather than failing a create, because the file is optional and
 * explicit options from the UI always win anyway.
 *
 * Network rules only add to the global sbx policy for this one sandbox. The
 * file travels with the repository, which sandbox work can change, so an allow
 * that reaches the host or the local network is never taken from it.
 *
 *   {
 *     "sandbox": { "memory": "8g", "cpus": 4 },
 *     "network": { "allow": ["pypi.org"], "deny": ["telemetry.example.com"] },
 *     "sync":    { "ignore": ["*.log"], "skipWorktree": ["config/local.json"] },
 *     "gortex":  { "warmCache": true }
 *   }
 */

import {
  type SandboxCreateOptions,
  SANDBOX_NETWORK_RESOURCE_PATTERN,
  sandboxNetworkResourceRisk,
} from "@t3tools/contracts";

export const SANDBOX_CONFIG_FILE = ".sandbox-config";

const MEMORY_PATTERN = /^[0-9]+(\.[0-9]+)?[a-zA-Z]{0,3}$/;
const lookup = (root: unknown, dotted: string): unknown =>
  dotted
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        typeof value === "object" && value !== null && !Array.isArray(value)
          ? (value as Record<string, unknown>)[key]
          : undefined,
      root,
    );

const stringList = (value: unknown, accept: (entry: string) => boolean): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const entries = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !entry.includes("\n") && accept(entry));
  return entries.length > 0 ? entries : undefined;
};

const networkResources = (value: unknown, { allow }: { readonly allow: boolean }) => {
  const resources = stringList(value, () => true)
    ?.map((resource) => resource.toLowerCase())
    .filter(
      (resource) =>
        SANDBOX_NETWORK_RESOURCE_PATTERN.test(resource) &&
        (!allow || sandboxNetworkResourceRisk(resource) === null),
    );
  return resources === undefined || resources.length === 0 ? undefined : [...new Set(resources)];
};

/** Reads the host-side create options out of a `.sandbox-config` document. */
export function parseProjectSandboxConfig(raw: string): SandboxCreateOptions {
  let root: unknown;
  try {
    root = JSON.parse(raw);
  } catch {
    return {};
  }

  const options: {
    -readonly [K in keyof SandboxCreateOptions]: SandboxCreateOptions[K];
  } = {};

  const memory = lookup(root, "sandbox.memory");
  if (typeof memory === "string" && MEMORY_PATTERN.test(memory.trim())) {
    options.memory = memory.trim();
  }
  const cpus = lookup(root, "sandbox.cpus");
  const cpuCount = typeof cpus === "string" ? Number(cpus) : cpus;
  if (typeof cpuCount === "number" && Number.isFinite(cpuCount) && cpuCount > 0) {
    options.cpus = cpuCount;
  }
  const allowHosts = networkResources(lookup(root, "network.allow"), { allow: true });
  if (allowHosts !== undefined) options.allowHosts = allowHosts;
  const denyHosts = networkResources(lookup(root, "network.deny"), { allow: false });
  if (denyHosts !== undefined) options.denyHosts = denyHosts;
  const syncIgnore = stringList(lookup(root, "sync.ignore"), () => true);
  if (syncIgnore !== undefined) options.syncIgnore = syncIgnore;
  const skipWorktree = stringList(
    lookup(root, "sync.skipWorktree"),
    (file) => !file.startsWith("-"),
  );
  if (skipWorktree !== undefined) options.skipWorktree = skipWorktree;
  const warmCache = lookup(root, "gortex.warmCache");
  if (typeof warmCache === "boolean") options.warmCache = warmCache;

  return options;
}

/** Explicit options win key by key; the project file fills the gaps. */
export function resolveCreateOptions(
  explicit: SandboxCreateOptions | undefined,
  project: SandboxCreateOptions,
): SandboxCreateOptions {
  const merged: Record<string, unknown> = { ...project };
  for (const [key, value] of Object.entries(explicit ?? {})) {
    if (value !== undefined) merged[key] = value;
  }
  return merged as SandboxCreateOptions;
}
