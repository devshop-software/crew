#!/bin/sh

set -eu

usage() {
  printf 'usage: %s [--check] <design-handoff.zip> [output-directory]\n' "$0" >&2
  exit 2
}

check_only=false
if [ "${1:-}" = "--check" ]; then
  check_only=true
  shift
fi

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || usage
[ "$check_only" = false ] || [ "$#" -eq 1 ] || usage

command -v unzip >/dev/null 2>&1 || {
  printf 'design handoff: unzip is required\n' >&2
  exit 1
}

archive=$1
[ -f "$archive" ] || {
  printf 'design handoff: archive not found: %s\n' "$archive" >&2
  exit 1
}

archive_dir=$(CDPATH= cd -- "$(dirname -- "$archive")" && pwd -P)
archive="$archive_dir/$(basename -- "$archive")"
entries=$(unzip -Z1 "$archive")

printf '%s\n' "$entries" | while IFS= read -r entry; do
  case "$entry" in
    /*|..|../*|*/../*|*/..)
      printf 'design handoff: unsafe archive entry: %s\n' "$entry" >&2
      exit 1
      ;;
  esac
done

for required in CLAUDE.md SKILL.md tokens/base.css; do
  printf '%s\n' "$entries" | grep -Fx "$required" >/dev/null || {
    printf 'design handoff: required file missing: %s\n' "$required" >&2
    exit 1
  }
done

printf '%s\n' "$entries" | grep -E '^[^/]+\.html$' >/dev/null || {
  printf 'design handoff: no root-level HTML page found\n' >&2
  exit 1
}

unzip -tq "$archive" >/dev/null

if [ "$check_only" = true ]; then
  printf '%s\n' "$archive"
  exit 0
fi

if [ "$#" -eq 2 ]; then
  output=$2
  [ ! -e "$output" ] || {
    printf 'design handoff: output already exists: %s\n' "$output" >&2
    exit 1
  }
  mkdir -p "$output"
else
  output=$(mktemp -d "${TMPDIR:-/tmp}/crew-design.XXXXXX")
fi

output_dir=$(CDPATH= cd -- "$output" && pwd -P)
unzip -qq "$archive" -d "$output_dir"
chmod -R a-w "$output_dir"
printf '%s\n' "$output_dir"
