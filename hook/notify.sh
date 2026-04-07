#!/bin/bash
# PostToolUse 훅: Claude가 파일 수정 시 workspace-viz 서버에 알림
# 디버그: env | grep -i claude >> /tmp/hook-debug.log

TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
FILE_PATH="${CLAUDE_TOOL_INPUT_FILE_PATH:-${CLAUDE_TOOL_INPUT_PATH:-}}"
SESSION_ID="${CLAUDE_SESSION_ID:-}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
CWD="${CLAUDE_CWD:-$(pwd)}"

# Edit/Write/MultiEdit 도구만 처리
if [[ "$TOOL_NAME" == "Edit" || "$TOOL_NAME" == "Write" || "$TOOL_NAME" == "MultiEdit" ]]; then
  curl -s -X POST http://localhost:3333/api/hook \
    -H "Content-Type: application/json" \
    -d "{\"tool\":\"$TOOL_NAME\",\"filePath\":\"$FILE_PATH\",\"sessionId\":\"$SESSION_ID\",\"timestamp\":\"$TIMESTAMP\",\"cwd\":\"$CWD\"}" \
    --max-time 2 \
    --silent \
    --output /dev/null &
fi
