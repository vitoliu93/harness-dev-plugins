#!/usr/bin/env bash
# Print a 16-char fingerprint of a worktree's uncommitted state (diff + untracked files), for freezing review baselines.
# usage: fingerprint.sh [dir ...]   (default: .)
# LC_ALL=C fixes the untracked-file order; locale-dependent sort gave two hosts different values for the same tree.
set -eu
for d in "${@:-.}"; do
  fp=$(cd "$d" && { git diff; git ls-files --others --exclude-standard -z | LC_ALL=C sort -z | xargs -0 cat; } | shasum -a 256 | cut -c1-16)
  echo "$d $fp"
done
