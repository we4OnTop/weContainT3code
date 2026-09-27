import { expect, it } from "@effect/vitest";
import { SANDBOX_NETWORK_RESOURCE_PATTERN, sandboxNetworkResourceRisk } from "@t3tools/contracts";

import { missingScopedResources, parseNetworkLog, parsePolicyRules } from "./networkPolicy.ts";

const ids = new Map([["t3-app-1234", "sandbox-1"]]);

// Shapes as printed by `sbx policy ls --json` (sbx 0.x, 2026-09).
const policyJson = JSON.stringify({
  rules: [
    {
      id: "default-ai-services",
      name: "default-ai-services",
      scope: "global",
      resource_type: "network",
      decision: "allow",
      resources: ["api.anthropic.com:443"],
      status: "active",
      editable: true,
    },
    {
      id: "default-fs-read-allow-all",
      name: "default-fs-read-allow-all",
      scope: "global",
      resource_type: "filesystem",
      decision: "allow",
      resources: ["**"],
      status: "active",
      editable: false,
    },
    {
      id: "6097e9f5-4249-475b-89d0-9e534da33fe0",
      name: "kit:t3-app-1234",
      scope: "sandbox:t3-app-1234",
      resource_type: "network",
      decision: "allow",
      resources: ["openrouter.ai"],
      status: "active",
      editable: false,
      sandbox_id: "t3-app-1234",
    },
    {
      id: "9b031858-d381-47f7-a0cb-8800312077e8",
      name: "9b031858-d381-47f7-a0cb-8800312077e8",
      scope: "sandbox:t3-app-1234",
      resource_type: "network",
      decision: "deny",
      resources: ["bad.example.com"],
      status: "active",
      editable: true,
      sandbox_id: "t3-app-1234",
    },
    {
      id: "e42787f7-3d94-420c-921f-10b2d9fbade9",
      name: "e42787f7-3d94-420c-921f-10b2d9fbade9",
      scope: "global",
      resource_type: "network",
      decision: "allow",
      resources: ["pypi.org"],
      status: "active",
      editable: true,
    },
    { id: "bad id; rm -rf", resource_type: "network", decision: "allow", resources: [] },
  ],
});

it("reads network rules and keeps built-in groups out of reach", () => {
  const rules = parsePolicyRules(policyJson, ids);

  expect(
    rules.map((rule) => [rule.name, rule.sandboxName, rule.sandboxId, rule.removable]),
  ).toEqual([
    ["default-ai-services", null, null, false],
    ["kit:t3-app-1234", "t3-app-1234", "sandbox-1", false],
    ["9b031858-d381-47f7-a0cb-8800312077e8", "t3-app-1234", "sandbox-1", true],
    ["e42787f7-3d94-420c-921f-10b2d9fbade9", null, null, true],
  ]);
  expect(parsePolicyRules("not json", ids)).toEqual([]);
});

it("reads the proxy log, newest first, for managed and foreign sandboxes", () => {
  const events = parseNetworkLog(
    JSON.stringify({
      blocked_hosts: [
        {
          host: "neverallowed.example.io:443",
          vm_name: "t3-app-1234",
          proxy_type: "forward",
          rule: "no applicable policies",
          last_seen: "2026-09-24T21:06:10.61+02:00",
          since: "2026-09-24T21:06:10.61+02:00",
          count_since: 1,
          reason: "No matching allow rule (default deny)",
        },
      ],
      allowed_hosts: [
        {
          host: "archive.ubuntu.com:80",
          vm_name: "someone-else",
          proxy_type: "forward",
          rule: "",
          last_seen: "2026-09-24T21:06:04.74+02:00",
          since: "2026-09-24T21:06:03.03+02:00",
          count_since: 2,
        },
      ],
    }),
    ids,
  );

  expect(events).toEqual([
    {
      sandboxName: "t3-app-1234",
      sandboxId: "sandbox-1",
      host: "neverallowed.example.io:443",
      outcome: "blocked",
      reason: "No matching allow rule (default deny)",
      rule: "no applicable policies",
      firstSeen: "2026-09-24T21:06:10.61+02:00",
      lastSeen: "2026-09-24T21:06:10.61+02:00",
      count: 1,
    },
    {
      sandboxName: "someone-else",
      sandboxId: null,
      host: "archive.ubuntu.com:80",
      outcome: "allowed",
      reason: null,
      rule: null,
      firstSeen: "2026-09-24T21:06:03.03+02:00",
      lastSeen: "2026-09-24T21:06:04.74+02:00",
      count: 2,
    },
  ]);
});

it("adds only the scoped resources a sandbox does not carry yet", () => {
  const rules = parsePolicyRules(policyJson, ids);

  expect(
    missingScopedResources(rules, "t3-app-1234", "deny", ["bad.example.com", "x.example.com"]),
  ).toEqual(["x.example.com"]);
  // A global rule does not count as the sandbox's own.
  expect(missingScopedResources(rules, "t3-app-1234", "allow", ["pypi.org"])).toEqual(["pypi.org"]);
});

it("accepts hosts and rejects catch-alls, lists and flags", () => {
  for (const ok of ["pypi.org", "*.npmjs.org", "**.example.com:443", "10.0.0.1:8080"]) {
    expect(SANDBOX_NETWORK_RESOURCE_PATTERN.test(ok)).toBe(true);
  }
  for (const bad of ["**", "*", "localhost", "a.com,b.com", "--all", "Pypi.org", "a..b"]) {
    expect(SANDBOX_NETWORK_RESOURCE_PATTERN.test(bad)).toBe(false);
  }
});

it("warns before allowing the host, the local network or a whole TLD", () => {
  expect(sandboxNetworkResourceRisk("127.0.0.1:3773")).not.toBeNull();
  expect(sandboxNetworkResourceRisk("192.168.0.10")).not.toBeNull();
  expect(sandboxNetworkResourceRisk("172.20.0.1")).not.toBeNull();
  expect(sandboxNetworkResourceRisk("host.docker.internal:3000")).not.toBeNull();
  expect(sandboxNetworkResourceRisk("printer.local")).not.toBeNull();
  expect(sandboxNetworkResourceRisk("**.com")).not.toBeNull();
  expect(sandboxNetworkResourceRisk("pypi.org")).toBeNull();
  expect(sandboxNetworkResourceRisk("172.15.0.1")).toBeNull();
});
