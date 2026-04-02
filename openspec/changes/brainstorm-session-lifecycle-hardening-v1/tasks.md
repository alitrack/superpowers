## 1. Lifecycle State Model

- [x] 1.1 Extend persisted session processing state with lifecycle-specific fields such as lease/heartbeat, superseded job tracking, and explicit `retryable` / `cancelled` states
- [x] 1.2 Add compatibility loading so older sessions without the new lifecycle envelope still open safely with sensible defaults
- [x] 1.3 Persist and validate a late-write guard so superseded jobs cannot overwrite newer retry/cancel/delete state

## 2. Backend Lifecycle Actions

- [x] 2.1 Detect stale/orphaned running jobs from persisted heartbeat/lease metadata and transition them into `retryable`
- [x] 2.2 Add durable lifecycle actions to retry or cancel create/submit jobs from the last stable persisted session snapshot
- [x] 2.3 Ensure delete, reopen, and session-list flows respect lifecycle state and never resurrect cancelled or superseded jobs

## 3. Browser UX

- [x] 3.1 Surface `running`, `retryable`, and `cancelled` lifecycle states in the request-status area and recent sessions rail
- [x] 3.2 Wire browser actions for `Retry` and `Cancel` so they requeue/cancel the persisted background job without duplicating answers
- [x] 3.3 Keep the current question or result frozen and disable conflicting submits while retry/cancel transitions are in flight

## 4. Verification

- [x] 4.1 Add regression coverage for stale session detection, retryable transitions, cancelled jobs, and ignored late writes
- [x] 4.2 Add browser product tests for reopened retryable sessions and lifecycle actions from the UI
- [ ] 4.3 Run targeted brainstorm-server tests and manually verify stale/retry/cancel session flows in the local browser app
