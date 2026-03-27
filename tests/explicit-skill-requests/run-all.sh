#!/usr/bin/env bash
# Run all explicit skill request tests
# Usage: ./run-all.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPTS_DIR="$SCRIPT_DIR/prompts"

echo "=== Running All Explicit Skill Request Tests ==="
echo ""

PASSED=0
FAILED=0
SKIPPED=0
RESULTS=""

record_result() {
    local label="$1"
    local status="$2"

    if [ "$status" -eq 0 ]; then
        PASSED=$((PASSED + 1))
        RESULTS="$RESULTS\nPASS: $label"
        return
    fi

    if [ "$status" -eq 2 ]; then
        SKIPPED=$((SKIPPED + 1))
        RESULTS="$RESULTS\nSKIP: $label"
        return
    fi

    FAILED=$((FAILED + 1))
    RESULTS="$RESULTS\nFAIL: $label"
}

# Test: subagent-driven-development, please
echo ">>> Test 1: subagent-driven-development-please"
set +e
"$SCRIPT_DIR/run-test.sh" "subagent-driven-development" "$PROMPTS_DIR/subagent-driven-development-please.txt"
STATUS=$?
set -e
record_result "subagent-driven-development-please" "$STATUS"
echo ""

# Test: use systematic-debugging
echo ">>> Test 2: use-systematic-debugging"
set +e
"$SCRIPT_DIR/run-test.sh" "systematic-debugging" "$PROMPTS_DIR/use-systematic-debugging.txt"
STATUS=$?
set -e
record_result "use-systematic-debugging" "$STATUS"
echo ""

# Test: please use brainstorming
echo ">>> Test 3: please-use-brainstorming"
set +e
"$SCRIPT_DIR/run-test.sh" "brainstorming" "$PROMPTS_DIR/please-use-brainstorming.txt"
STATUS=$?
set -e
record_result "please-use-brainstorming" "$STATUS"
echo ""

# Test: mid-conversation execute plan
echo ">>> Test 4: mid-conversation-execute-plan"
set +e
"$SCRIPT_DIR/run-test.sh" "subagent-driven-development" "$PROMPTS_DIR/mid-conversation-execute-plan.txt"
STATUS=$?
set -e
record_result "mid-conversation-execute-plan" "$STATUS"
echo ""

echo "=== Summary ==="
echo -e "$RESULTS"
echo ""
echo "Passed: $PASSED"
echo "Skipped: $SKIPPED"
echo "Failed: $FAILED"
echo "Total: $((PASSED + SKIPPED + FAILED))"

if [ "$FAILED" -gt 0 ]; then
    exit 1
fi
