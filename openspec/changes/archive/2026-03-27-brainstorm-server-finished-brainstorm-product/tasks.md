## 1. Completion Contract

- [x] 1.1 Define the minimum finished-deliverable section contract in runtime code and session persistence.
- [x] 1.2 Add a completion gate that blocks `summary` and `artifact_ready` until the finished-deliverable contract is satisfied.
- [x] 1.3 Update summary/artifact generation to emit a mature brainstorming deliverable instead of a lightweight recap.

## 2. Provenance and Inspection

- [x] 2.1 Persist provenance for every visible question and final deliverable, including backend mode, generation mode, required skills, provider trace IDs, and timestamps.
- [x] 2.2 Expose developer-facing provenance inspection through session APIs or an equivalent non-user-facing surface.
- [x] 2.3 Ensure fallback and fake paths are explicitly labeled in provenance so they cannot be confused with the real skill-guided path.

## 3. Host Presentation

- [x] 3.1 Update the browser completion view so the finished brainstorming artifact is the primary end-state presentation.
- [x] 3.2 Keep in-progress sessions in question mode until the completion gate passes, instead of showing an incomplete result.
- [x] 3.3 Keep provenance details out of the default user-facing UI while making them available for developer verification.

## 4. Acceptance Gates

- [x] 4.1 Add acceptance fixtures for canonical brainstorming seeds that verify the runtime reaches a mature finished deliverable rather than a shallow recap.
- [x] 4.2 Add regression tests proving completed sessions preserve provenance for visible questions and final results.
- [x] 4.3 Run targeted tests, the full brainstorm-server suite, and a real smoke flow; record evidence that the product now reaches a verifiable finished brainstorming artifact state end to end.
