#!/usr/bin/env bash
# 英語学習ツールを Supabase REST で読み書きする。
# service_role キーは画面にもログにも出さない。
#
# 使い方:
#   eng.sh GET  'eng_questions?owner_id=eq.$OWNER_ID&status=eq.open'
#   eng.sh POST eng_resources '{"owner_id":"$OWNER_ID","url":"https://example.com","title":"例","kind":"article","added_by":"researcher","created_by":"researcher"}'
#   eng.sh PATCH 'eng_essays?id=eq.ESSAY_ID&owner_id=eq.$OWNER_ID' '{"status":"corrected","corrected_text":"...","explanation":"...","corrected_by":"writer"}'
#   eng.sh DELETE 'eng_resources?id=eq.ID&owner_id=eq.$OWNER_ID'
#
# 環境変数 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_ID が揃っていればそれを使う。
# 足りなければ ENG_CREDENTIALS（既定: /home/box/agent-data/lifemanager/credentials.env）を読む。
# パスと JSON の中の $OWNER_ID と ${OWNER_ID} は、その UUID に置き換わる。

set -euo pipefail

CRED_FILE="${ENG_CREDENTIALS:-/home/box/agent-data/lifemanager/credentials.env}"

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" || -z "${OWNER_ID:-}" ]]; then
  if [[ -f "$CRED_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$CRED_FILE"
    set +a
  fi
fi

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" || -z "${OWNER_ID:-}" ]]; then
  echo "SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY と OWNER_ID が必要です。環境変数か ${CRED_FILE} を用意してください。" >&2
  exit 1
fi

SUPABASE_URL="${SUPABASE_URL%/}"

METHOD="${1:-}"
PATH_ARG="${2:-}"
BODY="${3:-}"

if [[ -z "$METHOD" || -z "$PATH_ARG" ]]; then
  echo "使い方: eng.sh GET|POST|PATCH|DELETE <rest/v1 のパス> [JSON]" >&2
  exit 1
fi

METHOD="$(printf '%s' "$METHOD" | tr '[:lower:]' '[:upper:]')"
case "$METHOD" in
  GET|POST|PATCH|DELETE) ;;
  *)
    echo "メソッドは GET, POST, PATCH, DELETE のいずれかです。" >&2
    exit 1
    ;;
esac

expand_owner() {
  local s="$1"
  s="${s//\$\{OWNER_ID\}/$OWNER_ID}"
  s="${s//\$OWNER_ID/$OWNER_ID}"
  printf '%s' "$s"
}

PATH_ARG="$(expand_owner "$PATH_ARG")"
BODY="$(expand_owner "$BODY")"

PATH_ARG="${PATH_ARG#/}"
PATH_ARG="${PATH_ARG#rest/v1/}"

if [[ "$PATH_ARG" == *..* ]]; then
  echo "パスが不正です。" >&2
  exit 1
fi

if [[ "$PATH_ARG" == *"$SUPABASE_SERVICE_ROLE_KEY"* || "$BODY" == *"$SUPABASE_SERVICE_ROLE_KEY"* ]]; then
  echo "リクエストに service_role キーを含めないでください。" >&2
  exit 1
fi

if [[ "$METHOD" == "GET" || "$METHOD" == "DELETE" ]]; then
  if [[ -n "$BODY" ]]; then
    echo "GET と DELETE に本文は渡せません。" >&2
    exit 1
  fi
elif [[ -z "$BODY" ]]; then
  echo "POST と PATCH には JSON 本文が必要です。" >&2
  exit 1
fi

URL="${SUPABASE_URL}/rest/v1/${PATH_ARG}"

HDR_ARGS=(
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
  -H "Accept: application/json"
)

if [[ "$METHOD" != "GET" ]]; then
  HDR_ARGS+=(-H "Content-Type: application/json" -H "Prefer: return=representation")
fi

if [[ "$METHOD" == "POST" || "$METHOD" == "PATCH" ]]; then
  exec curl -sS --fail-with-body -X "$METHOD" "$URL" "${HDR_ARGS[@]}" --data-binary "$BODY"
fi

exec curl -sS --fail-with-body -X "$METHOD" "$URL" "${HDR_ARGS[@]}"
