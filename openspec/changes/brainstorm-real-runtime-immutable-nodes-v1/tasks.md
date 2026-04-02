## 1. Real Runtime Enforcement

- [x] 1.1 Remove silent fake-question fallback from `/app` product session creation so create failures surface explicitly when no real backend is available.
- [x] 1.2 Remove silent fake-question fallback from product answer submission so an existing real session cannot degrade into fake questioning mid-session.
- [x] 1.3 Keep demo/fake paths isolated to explicit test or compatibility modes, not the default browser product path.

## 2. Immutable Node Log

- [x] 2.1 Define and persist an append-only node log for topic/question/result nodes with immutable question snapshots and explicit parent-child edges.
- [x] 2.2 Write node-log append logic for linear progression so each answer adds a new child question node instead of mutating the parent node.
- [x] 2.3 Write node-log append logic for explicit forks so each branch creates child question nodes while preserving the source question node unchanged.
- [x] 2.4 Add migration logic so older sessions without a node log can be loaded into the new immutable model.

## 3. Browser Restoration and Focus

- [x] 3.1 Change mainstage/canvas restoration to read from the immutable node log as the authoritative history source.
- [x] 3.2 Keep active-node focus driven by the node log so switching branches only moves the cursor, not historical node content.
- [x] 3.3 Surface explicit real-runtime failures in the browser instead of rendering fake product questions.

## 4. Verification

- [x] 4.1 Add regression coverage proving product-mode create/submit fail explicitly when real backends are unavailable.
- [x] 4.2 Add regression coverage proving previously generated question nodes remain unchanged after later answers and after explicit branch creation.
- [x] 4.3 Run product smoke coverage for: real question creation, linear append-only node growth, explicit fork appending child nodes, reload restore, and no fake-question substitution in product mode.
