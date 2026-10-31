#!/bin/sh
# Writes the runtime configuration of the web client from environment variables.
# nginx serves the file as /config.json (see nginx.conf). It lives under /tmp, so the
# container also works with a read-only root filesystem when /tmp is writable.
set -eu

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

target_dir=/tmp/mkdocseditor
mkdir -p "$target_dir"
cat > "$target_dir/config.json" <<JSON
{
  "backendUrl": "$(json_escape "${MKDOCSEDITOR_BACKEND_URL:-}")",
  "wikiUrl": "$(json_escape "${MKDOCSEDITOR_WIKI_URL:-}")"
}
JSON
echo "mkdocseditor: wrote $target_dir/config.json (backendUrl=${MKDOCSEDITOR_BACKEND_URL:-<default>})"
