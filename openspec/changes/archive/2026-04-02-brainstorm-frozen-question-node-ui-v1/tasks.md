## 1. Freeze Historical Question Rendering

- [x] 1.1 Update `web-mainstage.cjs` so historical mainline and branch question rounds keep their stored `message` snapshot instead of degrading into summary-only round cards.
- [x] 1.2 Stop graph-node rendering from dropping `message` for non-active question rounds; pass an explicit read-only flag instead.
- [x] 1.3 Remove remaining mainline round selection fallback logic that re-identifies prior nodes from mutable `currentMessage.questionId` when persisted round ids are available.

## 2. Add Read-Only Question Snapshot Rendering

- [x] 2.1 Extend `structured-host.cjs` with a read-only question render mode that preserves the question-card appearance without binding answer interactions.
- [x] 2.2 Update XYFlow question node components to render historical question snapshots in read-only mode while keeping only the active node answerable.

## 3. Verify Frozen-Node Behavior

- [x] 3.1 Add mainstage regression coverage proving a submitted question round still renders from its original question snapshot after a new child round appears.
- [x] 3.2 Add regression coverage proving repeated provider `questionId` values do not cause historical nodes to be visually re-identified from current mutable state.
- [x] 3.3 Run `web-mainstage-state`, `web-product`, and targeted session tests to confirm frozen-node rendering and single-active-input semantics.
