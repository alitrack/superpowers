## 1. Mainstage Information Architecture

- [x] 1.1 Derive a dedicated mainstage view state that distinguishes in-progress question mode, review checkpoint mode, and finished completion mode.
- [x] 1.2 Rework the browser shell layout so the current active question or approval decision is the dominant center-stage element.
- [x] 1.3 Keep the “start a new brainstorm” affordance visible from in-progress and completed states without overriding the current session.

## 2. Lightweight Context and Completion Presentation

- [x] 2.1 Replace the default full-history emphasis with a lightweight recent-context rail that shows only the most recent `2-3` completed steps.
- [x] 2.2 Add an explicit expand path for full session history so deeper context remains available on demand.
- [x] 2.3 Present the finished `spec + plan` bundle through a dedicated completion surface instead of leaving it as one more competing panel.

## 3. Verification

- [x] 3.1 Add browser/product regression tests proving the current active decision remains primary during in-progress sessions.
- [x] 3.2 Add regression tests proving recent context is capped by default while full history remains accessible when requested.
- [x] 3.3 Run targeted brainstorm-server verification plus a browser smoke flow and confirm the new mainstage makes the current task obvious within the first glance.
