## 1. Strategy State Foundation

- [x] 1.1 Extend persisted brainstorm session state to store facilitation phase, next learning goal, problem frame, candidate directions, selection criteria, and decision trail.
- [x] 1.2 Add runtime state normalization helpers so app-server and exec backends both read and write the same brainstorming strategy shape.
- [x] 1.3 Preserve strategy state across session resume and add regression coverage for reload continuity.

## 2. Brainstorming Planner Integration

- [x] 2.1 Replace the current intake-style bootstrap prompt with a phase-aware brainstorming planner prompt for app-server sessions.
- [x] 2.2 Update answer submission flow so each turn derives the next question from the current phase and learning goal instead of a generic follow-up template.
- [x] 2.3 Rework exec fallback prompt building so transcript replay also includes facilitation phase and candidate-direction context.
- [x] 2.4 Add intent-to-question-type mapping rules for clarifying, reframing, diverging, converging, and path-commit questions.

## 3. Direction Exploration and Handoff

- [x] 3.1 Add backend logic that explicitly generates and persists multiple candidate directions during divergence.
- [x] 3.2 Add convergence logic that compares candidate directions against explicit decision criteria before selecting a path.
- [x] 3.3 Update summary/artifact completion generation so the chosen direction, explored alternatives, and key rationale are preserved in the handoff output.

## 4. Evaluation and Verification

- [x] 4.1 Add headless fixtures that cover at least a fuzzy product idea, a differentiation problem, a team-alignment case, and an execution-planning case.
- [x] 4.2 Add regression checks that the first three turns do not degrade into generic field collection when a higher-value reframing or divergence move is available.
- [x] 4.3 Run the brainstorm-server verification suite plus real smoke sessions, and document the manual quality bar for “this feels like real brainstorming.”
