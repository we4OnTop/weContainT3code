import { describe, expect, it } from "vite-plus/test";

import { SANDBOX_NETWORK_RESOURCE_PATTERN } from "@t3tools/contracts";

import {
  OPENCODE_NETWORK_RESOURCES,
  guestOpenCodeAuthJson,
  openCodePlaceholder,
  parseOpenCodeAccountKeys,
} from "./opencodeAuth.ts";

describe("parseOpenCodeAccountKeys", () => {
  it("reads the Zen and Go API keys and nothing else", () => {
    const auth = JSON.stringify({
      opencode: { type: "api", key: " sk-zen-1234567890 " },
      "opencode-go": { type: "api", key: "sk-go-1234567890" },
      anthropic: { type: "api", key: "sk-ant-1234567890" },
      "github-copilot": { type: "oauth", refresh: "r", access: "a", expires: 0 },
    });
    expect(parseOpenCodeAccountKeys(auth)).toEqual([
      { provider: "opencode", key: "sk-zen-1234567890" },
      { provider: "opencode-go", key: "sk-go-1234567890" },
    ]);
  });

  it("skips oauth entries, keys that are not one plain token and broken files", () => {
    expect(
      parseOpenCodeAccountKeys(
        JSON.stringify({
          opencode: { type: "oauth", key: "sk-zen-1234567890" },
          "opencode-go": { type: "api", key: "sk go 1234567890" },
        }),
      ),
    ).toEqual([]);
    expect(parseOpenCodeAccountKeys("not json")).toEqual([]);
    expect(parseOpenCodeAccountKeys("null")).toEqual([]);
  });
});

describe("openCodePlaceholder", () => {
  it("is stable per sandbox and provider and never contains the key", () => {
    const zen = openCodePlaceholder("sbx-1", "opencode");
    expect(zen).toBe(openCodePlaceholder("sbx-1", "opencode"));
    expect(zen).not.toBe(openCodePlaceholder("sbx-1", "opencode-go"));
    expect(zen).not.toBe(openCodePlaceholder("sbx-2", "opencode"));
    expect(zen).toMatch(/^t3-opencode-[0-9a-f]{32}$/);
  });
});

describe("guestOpenCodeAuthJson", () => {
  it("writes placeholders as API logins", () => {
    expect(JSON.parse(guestOpenCodeAuthJson("sbx-1", ["opencode-go"]))).toEqual({
      "opencode-go": { type: "api", key: openCodePlaceholder("sbx-1", "opencode-go") },
    });
  });
});

it("grants network resources sbx accepts", () => {
  for (const resource of OPENCODE_NETWORK_RESOURCES) {
    expect(resource).toMatch(SANDBOX_NETWORK_RESOURCE_PATTERN);
  }
});
