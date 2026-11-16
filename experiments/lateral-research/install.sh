#!/bin/sh
# Copies the research modules into an installed lateral and adds their CLI commands.
set -e
here="$(cd "$(dirname "$0")" && pwd)"
root="${1:-$HOME/.local/share/lateral}"
mkdir -p "$root/src/research"
cp --remove-destination "$here"/search.js "$here"/evaluator.js "$here"/propose.js \
  "$here"/problems.py "$here"/run_method.py "$root/src/research/"
node "$here/install-cli.mjs" "$root/src/cli.js"
