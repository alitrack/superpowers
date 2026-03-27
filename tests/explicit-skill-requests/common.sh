#!/usr/bin/env bash
# Shared helpers for explicit skill request tests.

set -euo pipefail

is_transient_claude_failure() {
    local log_file="$1"
    local exit_code="${2:-0}"

    if [ "$exit_code" -eq 124 ]; then
        return 0
    fi

    if [ ! -s "$log_file" ]; then
        return 0
    fi

    if grep -qiE \
        'API Error: (429|5[0-9][0-9])|Service temporarily unavailable|upstream error|rate limit|overloaded|timed out|timeout|ECONNRESET|network error|connection (reset|error)|Internal server error' \
        "$log_file"; then
        return 0
    fi

    if grep -q '"type":"system","subtype":"init"' "$log_file" && \
        ! grep -qE '"type":"assistant"|"type":"result"' "$log_file"; then
        return 0
    fi

    return 1
}

run_claude_capture() {
    local log_file="$1"
    shift

    local timeout_seconds="${CLAUDE_TIMEOUT_SECONDS:-300}"
    local exit_code=0

    set +e
    timeout --kill-after=10s "${timeout_seconds}s" claude "$@" > "$log_file" 2>&1
    exit_code=$?
    set -e

    if is_transient_claude_failure "$log_file" "$exit_code"; then
        return 2
    fi

    if [ "$exit_code" -ne 0 ]; then
        return "$exit_code"
    fi

    return 0
}

print_skip_notice() {
    local log_file="$1"
    local context="$2"

    echo "SKIP: $context"
    echo "Reason: Claude service was temporarily unavailable, rate-limited, or timed out."
    echo "Log: $log_file"
}
