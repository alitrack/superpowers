## 1. Durable Processing State

- [x] 1.1 Add persisted `processing` session state with defaults, job metadata, and pending-input storage for both create and submit flows
- [x] 1.2 Refactor session create logic to write a provisional session first, enqueue background runtime creation, and persist success or failure back onto the same session
- [x] 1.3 Refactor answer submission logic to freeze the current question, persist the pending answer, and let the next runtime turn complete in background

## 2. Background Execution And Recovery

- [x] 2.1 Add an in-memory running-job registry plus session-manager helpers that enqueue, complete, fail, and dedupe per-session background work
- [x] 2.2 Re-enqueue persisted `processing: running` sessions on demand so a reloaded or restarted server can continue unfinished create or submit jobs
- [x] 2.3 Thread configurable runtime/app-server timeouts through the server and runtime adapter so deadlines protect workers without blocking browser UX

## 3. Browser Status UX

- [x] 3.1 Expose processing state through session list and session detail APIs so the browser can distinguish idle, running, and failed sessions
- [x] 3.2 Update the browser shell to poll in-flight sessions, keep the current question node unchanged while processing, and disable duplicate submits
- [x] 3.3 Update request-status copy and recovery behavior so users can safely leave the page and later resume without guessing whether the session is still running

## 4. Errors And Verification

- [x] 4.1 Fix server error classification so unknown sessions remain `404` while runtime/processing failures surface as runtime/server errors instead of generic not found responses
- [x] 4.2 Add regression coverage for background create, background submit, recovery after reload, timeout failure persistence, and browser polling behavior
- [x] 4.3 Run targeted brainstorm-server tests and restart the local brainstorm server for manual verification
