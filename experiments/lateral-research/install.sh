#!/bin/sh
# Copies the research module into an installed lateral and adds its `research` command.
set -e
here="$(cd "$(dirname "$0")" && pwd)"
root="${1:-$HOME/.local/share/lateral}"
mkdir -p "$root/src/research"
cp --remove-destination "$here/search.js" "$here/problems.py" "$root/src/research/"
grep -q "case 'research'" "$root/src/cli.js" || node -e '
const fs = require("fs");
const file = process.argv[1] + "/src/cli.js";
const hook = `    case "research": {
      const { runResearchCli } = await import("./research/search.js");
      const names = ["problem", "n", "strategy", "budget", "seed", "workers", "restart", "out"];
      await runResearchCli(Object.fromEntries(names.map((k) => [k, flag(rest, k)]).filter(([, v]) => v != null)));
      return "done";
    }

    case '"'"'mcp'"'"':`;
const src = fs.readFileSync(file, "utf8");
if (!src.includes("    case '"'"'mcp'"'"':")) throw new Error("cli.js layout changed; add the research case by hand");
fs.writeFileSync(file, src.replace("    case '"'"'mcp'"'"':", hook));
' "$root"
