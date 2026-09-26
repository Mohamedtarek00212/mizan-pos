#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

run_workspace() {
  workspace=$1
  shift
  echo "==> $workspace: $*"
  (cd "$ROOT_DIR/$workspace" && "$@")
}

run_workspace backend npm run lint
run_workspace backend npm test -- --runInBand
run_workspace backend npm run build
run_workspace frontend npm run lint
run_workspace frontend npm test -- --run
run_workspace frontend npm run build
run_workspace desktop npm run typecheck
run_workspace desktop npm test
run_workspace desktop npm run build
run_workspace desktop npm run test:installer
run_workspace desktop npm run test:standalone

echo "All automated release gates passed."
