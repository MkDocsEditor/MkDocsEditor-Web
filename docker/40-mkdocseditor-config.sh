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

# Android App Links and shared credentials: the Digital Asset Links file for this host,
# served as /.well-known/assetlinks.json (see nginx.conf). Without the variable the file is
# absent and the path answers 404.
assetlinks="$target_dir/assetlinks.json"
if [ -n "${MKDOCSEDITOR_ASSETLINKS_JSON:-}" ]; then
  case "$(printf '%s' "$MKDOCSEDITOR_ASSETLINKS_JSON" | tr -d ' \t\r\n' | cut -c1)" in
    '['|'{') ;;
    *) echo "mkdocseditor: warning: MKDOCSEDITOR_ASSETLINKS_JSON does not look like JSON" >&2 ;;
  esac
  printf '%s\n' "$MKDOCSEDITOR_ASSETLINKS_JSON" > "$assetlinks"
  echo "mkdocseditor: wrote $assetlinks"
else
  rm -f "$assetlinks"
fi
