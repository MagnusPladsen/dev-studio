#!/usr/bin/env bash
# Manual PKCE round trip against Supabase's OAuth 2.1 server, the way dev-studio-mcp will sign in.
# Usage: SUPABASE_URL=https://<ref>.supabase.co CLIENT_ID=<oauth client id> SUPABASE_ANON_KEY=<publishable key> scripts/mcp-oauth-roundtrip.sh
# Needs: bash, curl, openssl, python3. Prints no tokens, only their claims and status codes.
set -euo pipefail

: "${SUPABASE_URL:?set SUPABASE_URL}"
: "${CLIENT_ID:?set CLIENT_ID (Authentication → OAuth Apps)}"
: "${SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY (the public publishable/anon key)}"
PORT="${PORT:-53682}"
REDIRECT_URI="http://127.0.0.1:${PORT}/callback"

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
VERIFIER="$(openssl rand 48 | b64url)"
CHALLENGE="$(printf '%s' "$VERIFIER" | openssl dgst -binary -sha256 | b64url)"
STATE="$(openssl rand 24 | b64url)"

AUTHORIZE_URL="${SUPABASE_URL}/auth/v1/oauth/authorize?$(python3 -c 'import sys, urllib.parse as u; print(u.urlencode({"response_type": "code", "client_id": sys.argv[1], "redirect_uri": sys.argv[2], "code_challenge": sys.argv[3], "code_challenge_method": "S256", "state": sys.argv[4], "scope": "openid email profile"}))' "$CLIENT_ID" "$REDIRECT_URI" "$CHALLENGE" "$STATE")"

echo "1. Open this in the browser (it goes to /oauth/consent on the GameDev Studio site):"
echo "   $AUTHORIZE_URL"
command -v open >/dev/null && open "$AUTHORIZE_URL" || true
echo "2. Waiting on ${REDIRECT_URI} for the redirect (5 minutes)…"

CALLBACK_QUERY="$(python3 - "$PORT" <<'PY'
import http.server, sys, threading
port = int(sys.argv[1])
class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if not self.path.startswith("/callback"):
            self.send_response(404); self.end_headers(); return
        self.send_response(200); self.send_header("Content-Type", "text/html"); self.end_headers()
        self.wfile.write(b"<p>Done. You can close this tab.</p>")
        print(self.path.split("?", 1)[1] if "?" in self.path else "", flush=True)
        threading.Thread(target=self.server.shutdown).start()
    def log_message(self, *args): pass
server = http.server.HTTPServer(("127.0.0.1", port), Handler)
threading.Timer(300, server.shutdown).start()
server.serve_forever()
PY
)"
param() { python3 -c 'import sys, urllib.parse as u; print(u.parse_qs(sys.argv[1]).get(sys.argv[2], [""])[0])' "$CALLBACK_QUERY" "$1"; }

if [ -n "$(param error)" ]; then echo "Denied or failed: $(param error) $(param error_description)"; exit 1; fi
[ "$(param state)" = "$STATE" ] || { echo "FAIL: state mismatch"; exit 1; }
CODE="$(param code)"; [ -n "$CODE" ] || { echo "FAIL: no code in redirect"; exit 1; }
echo "3. Got a code, state matches. Exchanging it…"

token() { curl -sS -X POST "${SUPABASE_URL}/auth/v1/oauth/token" -H 'Content-Type: application/x-www-form-urlencoded' "$@"; }
TOKENS="$(token -d grant_type=authorization_code --data-urlencode "code=$CODE" --data-urlencode "client_id=$CLIENT_ID" --data-urlencode "redirect_uri=$REDIRECT_URI" --data-urlencode "code_verifier=$VERIFIER")"
field() { python3 -c 'import json, sys; print(json.loads(sys.argv[1]).get(sys.argv[2], ""))' "$1" "$2"; }
ACCESS="$(field "$TOKENS" access_token)"; REFRESH="$(field "$TOKENS" refresh_token)"
[ -n "$ACCESS" ] || { echo "FAIL: token exchange: $TOKENS"; exit 1; }
echo "   access token claims (expect client_id = $CLIENT_ID):"
python3 -c 'import base64, json, sys; p = sys.argv[1].split(".")[1]; c = json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4))); print("   " + json.dumps({k: c.get(k) for k in ("sub", "role", "client_id", "aud", "exp")}))' "$ACCESS"

echo "4. Code reuse must fail:"
token -o /dev/null -w "   HTTP %{http_code}\n" -d grant_type=authorization_code --data-urlencode "code=$CODE" --data-urlencode "client_id=$CLIENT_ID" --data-urlencode "redirect_uri=$REDIRECT_URI" --data-urlencode "code_verifier=$VERIFIER"

echo "5. RLS read with the MCP token (expect 200 and only your rows):"
curl -sS -o /dev/null -w "   HTTP %{http_code}\n" "${SUPABASE_URL}/rest/v1/projects?select=id&limit=1" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $ACCESS"

echo "6. Refresh (expect a new refresh token):"
REFRESHED="$(token -d grant_type=refresh_token --data-urlencode "refresh_token=$REFRESH" --data-urlencode "client_id=$CLIENT_ID")"
NEXT_REFRESH="$(field "$REFRESHED" refresh_token)"
[ -n "$NEXT_REFRESH" ] && [ "$NEXT_REFRESH" != "$REFRESH" ] && echo "   rotated" || { echo "FAIL: refresh: $REFRESHED"; exit 1; }

echo "7. Now open the studio → Use with Claude → Disconnect, then press Enter."
read -r
echo "   refresh after revoke (expect 400/401):"
token -o /dev/null -w "   HTTP %{http_code}\n" -d grant_type=refresh_token --data-urlencode "refresh_token=$NEXT_REFRESH" --data-urlencode "client_id=$CLIENT_ID"
echo "   access token after revoke (assumed still 200 until it expires):"
curl -sS -o /dev/null -w "   HTTP %{http_code}\n" "${SUPABASE_URL}/rest/v1/projects?select=id&limit=1" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $ACCESS"
