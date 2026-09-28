import * as NodeCrypto from "node:crypto";

/**
 * OpenCode logins reach a sandbox as sbx custom secrets: the guest's auth.json
 * only holds placeholders, and the sbx egress proxy swaps each placeholder
 * for the host's real key on requests to opencode.ai. The key itself never
 * enters the sandbox.
 */

/** Providers whose key is an OpenCode account key sent to opencode.ai. */
export const OPENCODE_ACCOUNT_PROVIDERS = ["opencode", "opencode-go"] as const;
export type OpenCodeAccountProvider = (typeof OPENCODE_ACCOUNT_PROVIDERS)[number];

/** The only host the proxy may send the real keys to. */
export const OPENCODE_API_HOST = "opencode.ai";

/** Network access OpenCode needs, as the sbx opencode kit grants it. */
export const OPENCODE_NETWORK_RESOURCES = ["opencode.ai:443", "*.opencode.ai:443"] as const;

export interface OpenCodeAccountKey {
  readonly provider: OpenCodeAccountProvider;
  readonly key: string;
}

/** A key goes onto the sbx command line, so it must be one plain token. */
const KEY_PATTERN = /^[\x21-\x7e]{8,512}$/;

/** The host's OpenCode account API keys from auth.json; OAuth entries are skipped. */
export function parseOpenCodeAccountKeys(authJson: string): OpenCodeAccountKey[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(authJson);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  const keys: OpenCodeAccountKey[] = [];
  for (const provider of OPENCODE_ACCOUNT_PROVIDERS) {
    const entry = (parsed as Record<string, unknown>)[provider];
    if (typeof entry !== "object" || entry === null) continue;
    const { type, key } = entry as { type?: unknown; key?: unknown };
    if (type !== "api" || typeof key !== "string") continue;
    const trimmed = key.trim();
    if (KEY_PATTERN.test(trimmed)) keys.push({ provider, key: trimmed });
  }
  return keys;
}

/**
 * Stable per sandbox and provider, so a re-apply updates the same sbx secret
 * instead of adding another. Not secret: it only names the slot.
 */
export function openCodePlaceholder(sandboxId: string, provider: OpenCodeAccountProvider): string {
  const digest = NodeCrypto.createHash("sha256")
    .update(`t3-opencode\0${sandboxId}\0${provider}`)
    .digest("hex")
    .slice(0, 32);
  return `t3-opencode-${digest}`;
}

/** Entries to merge into the guest's auth.json, as JSON: placeholders only. */
export function guestOpenCodeAuthJson(
  sandboxId: string,
  providers: ReadonlyArray<OpenCodeAccountProvider>,
): string {
  return JSON.stringify(
    Object.fromEntries(
      providers.map((provider) => [
        provider,
        { type: "api", key: openCodePlaceholder(sandboxId, provider) },
      ]),
    ),
  );
}
