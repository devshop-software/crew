#!/usr/bin/env bash
# crew: mint a short-lived GitHub App installation token and print it to stdout.
#
# Ships with the crew plugin; /crew:adjust installs a copy to ~/.config/crew/ and
# tests it. Project-agnostic — all values come from the environment (set from the
# `crew-identity` block in .crew.rc `config`):
#   CREW_APP_ID                 GitHub App ID (JWT issuer)
#   CREW_INSTALLATION_ID        installation ID for the target org/repos
#   CREW_APP_PRIVATE_KEY_PATH   path to the App private key (.pem), outside any repo
#
# Caches the token (mode 600) under $TMPDIR and reuses it until ~5 min before the
# 1-hour expiry, so callers invoke it freely. The bot is the PRIMARY identity:
# pass the token INLINE in the same shell as each git/GitHub write —
# `GH_TOKEN="$(gh-token.sh)" gh ...` — never a prior `export` carried across
# separate Bash calls (a fresh shell drops it and gh silently posts as the human).
set -euo pipefail

: "${CREW_APP_ID:?crew gh-token: set CREW_APP_ID}"
: "${CREW_INSTALLATION_ID:?crew gh-token: set CREW_INSTALLATION_ID}"
KEY="${CREW_APP_PRIVATE_KEY_PATH:?crew gh-token: set CREW_APP_PRIVATE_KEY_PATH}"
[ -r "$KEY" ] || { echo "crew gh-token: private key not readable: $KEY" >&2; exit 1; }

cache="${TMPDIR:-/tmp}/crew-gh-token-${CREW_INSTALLATION_ID}.json"
now=$(date +%s)

# Reuse a cached token while it has >5 min of life left.
if [ -f "$cache" ]; then
  exp=$(jq -r '.expires_epoch // 0' "$cache" 2>/dev/null || echo 0)
  if [ "${exp:-0}" -gt $((now + 300)) ]; then jq -r '.token' "$cache"; exit 0; fi
fi

b64() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }            # base64url, no padding
header=$(printf '{"alg":"RS256","typ":"JWT"}' | b64)
# iat backdated 60s for clock skew; exp 9 min (GitHub caps the App JWT at 10).
payload=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' "$((now-60))" "$((now+540))" "$CREW_APP_ID" | b64)
sig=$(printf '%s' "$header.$payload" | openssl dgst -sha256 -sign "$KEY" -binary | b64)
jwt="$header.$payload.$sig"

resp=$(curl -fsS -X POST \
  -H "Authorization: Bearer $jwt" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/app/installations/${CREW_INSTALLATION_ID}/access_tokens" 2>/dev/null) \
  || { echo "crew gh-token: token request failed (check app id / installation id / key / clock skew)" >&2; exit 1; }

token=$(printf '%s' "$resp" | jq -r '.token // empty')
[ -n "$token" ] || { echo "crew gh-token: no token in response: $(printf '%s' "$resp" | jq -r '.message // .')" >&2; exit 1; }

# Cache the token; installation tokens last 1h, so expire our copy at now+3600.
umask 177
printf '{"token":"%s","expires_epoch":%d}\n' "$token" "$((now+3600))" > "$cache"
printf '%s\n' "$token"
