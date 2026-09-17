# Architecture Guidelines - Reserva el Dia

Status: Canonical Governance Reference.

This document defines architectural and product standards for authorized future
changes. It does not claim that every existing module already complies. Apply
the standards to the responsibility being changed; existing debt does not require
an unrelated subsystem rewrite or make a deviation an accepted exception.
For documentation routing and status definitions, start with [DOCUMENTATION_INDEX.md](../DOCUMENTATION_INDEX.md).
For task authorization, working procedure, verification and Definition of Done,
use [AGENTS.md](../../AGENTS.md). These principles govern authorized changes;
they do not authorize redesign, cleanup, migration or deployment by themselves.

The goal is to build a scalable, premium, and simple creative SaaS platform.

---

# 1. Product Philosophy

## 1.1 Radical Simplicity
- The product must feel simple even if the internal system is complex.
- The user should never see technical complexity.
- Advanced options must be progressively disclosed.

## 1.2 Premium Experience
- Every visual detail matters.
- Avoid generic-looking UI patterns.
- Maintain elegance and visual consistency.

## 1.3 Guided Over Manual
- Prefer guided flows and smart defaults over large configuration panels.
- Users should rarely face empty states without direction.

---

# 2. Architectural Principles

## 2.1 Modular Architecture (Mandatory)
- Keep related responsibilities together. Separate presentation, effect coordination, complex state transitions and domain rules when their combination obscures ownership or makes independent verification difficult.
- Extraction must establish a useful responsibility with explicit inputs and effects. Moving the same coupling into a hook or a generic utility is not separation of concerns.
- Components may compose hooks, coordinate local interaction and own local UI state. Reusable domain invariants must not depend on component lifecycle or rendering.
- There is no arbitrary file/function line limit. Avoid both growing modules that know unrelated concerns and artificial fragmentation that forces readers through many one-line wrappers.

## 2.2 Separation of Concerns
- UI presents state and emits intent; coordination orders operations and manages sessions/effects; pure domain logic validates and transforms domain values; infrastructure performs SDK, network and storage work.
- This is a responsibility distinction, not a mandate for new folders, classes or services. Trace imports/callers and actual effects; the current `src/domain/` also contains Firebase adapters.
- Keep invariants with their domain owner. Pure rules must not import React, browser globals, Firebase or request handlers; UI/coordinators/adapters consume the rules. Domain rules must not depend back on those consumers.
- Integrate SDKs at explicit boundaries and keep transport/auth context, persistence mechanics and business decisions distinguishable. Use existing boundaries, such as editor-session persistence; inject collaborators when that clarifies effects and testing, without creating interfaces for hypothetical replacements.
- Name which owner holds state, commits mutation, persists it and renders it. Read adapters and projections do not acquire write authority. Preserve consumer payloads, events and compatibility across runtimes.

## 2.3 Scalability First
- Design for demonstrated usage, data size and concurrency constraints. Do not add extension points, caches or generic frameworks for hypothetical future features.
- Prefer fewer concepts, explicit invariants and code that is easy to test, change and remove. Justify additional indirection by a current responsibility or measurable need.
- Temporary workarounds follow section 7.8; they do not silently waive security or compatibility obligations.

---

# 3. Editor-Specific Rules

## 3.1 Canvas Stability
- The editor must remain predictable.
- Avoid hidden side effects.
- All transformations must be explicit and traceable.
- Selection and drag documentation must name which layer owns the visible box in `selected`, `predrag`, `drag`, and `settling`, and which geometry source is authoritative in each phase.
- Do not describe the selection box as a direct mirror of committed selection unless the implementation for that phase actually reads committed selection as its visible source.
- When text can render through both Konva and DOM, documentation must name:
  - the single authoritative base geometry source
  - the render-authority handoff boundary
  - the snap-authoritative boundary
  - the only allowed offset/alignment model
- Undocumented parallel geometry corrections across Konva, overlay, selection box, and snap are forbidden.

## 3.2 Global Feature Control
- Animations and visual effects must be globally configurable.
- Nothing hardcoded inside templates without control flags.

## 3.3 Performance Discipline
- Identify repeated renders or expensive render-cycle work with a comparable baseline before optimizing. Reuse existing diagnostics first.
- Memoization, caching and batching need a demonstrated cost and explicit invalidation/order semantics. Recheck UX and contract behavior as well as timing; follow the [performance procedure](../operations/CHANGE_WORKFLOW.md#rendimiento).

## 3.4 Mobile First Behavior
- Design mobile-first.
- Reflow logic must prioritize readability over visual complexity.
- Do not add visual effects that harm mobile performance.

---

# 4. Data & Backend Principles

## 4.1 Firestore Structure Discipline
- Collections must be predictable and normalized.
- Avoid deeply nested unpredictable structures.
- Data must be versionable when necessary.

## 4.2 HTML Generation
- Generated HTML must be clean and minimal.
- No unnecessary inline logic.
- Output must be production-ready and lightweight.

## 4.3 Security First
- All data access must respect user ownership.
- Never expose unnecessary data to the client.
- Storage paths must be user-scoped.

These are normative requirements, not certification of the checked-in Rules or
the deployed environment. Current access-control and local-environment gaps are
tracked in [SYSTEM_FRAGILITY_MAP.md](SYSTEM_FRAGILITY_MAP.md#operational-readiness).
Public/shared asset exceptions require an explicit domain policy; a permissive
fallback is not evidence of an accepted exception.

## 4.4 Cross-Runtime Contracts
- Any compatibility surface shared across editor, preview, publish, or backend validation must be treated as a contract.
- This includes window bridge keys and events, snapshot/read adapters, shared prepared render fields, and publish preflight blocker/warning semantics.
- If one side changes, inspect and verify every affected consumer; update those requiring adaptation in the same authorized functional change. Compatible consumers need evidence, not gratuitous edits. Preserve compatibility unless its change is authorized.
- Edit canonical shared sources, then synchronize their mapped copies only within authorized write scope. ESM wrappers and compatibility re-exports are adapters, not duplicate rule owners. See the [source/copy map](ARCHITECTURE_OVERVIEW.md#shared-contract-copies); watch currently does not ensure synchronization (F15).

---

# 5. UX & Design Standards

## 5.1 Progressive Disclosure
- Show basic options first.
- Reveal advanced options only when necessary.

## 5.2 Smart Defaults
- Always prefer intelligent default values.
- Avoid forcing users to make trivial decisions.

## 5.3 Feedback & Micro-Interactions
- Provide subtle but clear feedback.
- Animations must enhance clarity, not decoration.

---

# 6. Dependency Policy

## 6.1 Minimize Dependencies
- Explain the concrete need, why existing code or platform capabilities are insufficient, and the cost of maintaining or removing an added dependency.
- Consider maintenance activity, security exposure, transitive dependencies and browser bundle/runtime cost. Backend-only packages must not leak into browser consumers through shared imports.
- Avoid dependency cycles and hidden dependencies through globals or import-time effects. Do not add libraries or abstractions for hypothetical uses.

## 6.2 Long-Term Viability
- Prefer maintained solutions with a compatible API/license and a manageable upgrade path. Adoption alone is not proof of suitability or safety; a specialized dependency needs a concrete benefit and understood ownership cost.

---

<a id="code-quality-standards"></a>

# 7. Code Quality Standards

Apply these in review alongside the specific contract. The objective is fewer
concepts, lower coupling and explicit invariants, not mechanical DRY or a blanket
rewrite. The [current boundary map](ARCHITECTURE_OVERVIEW.md#current-boundaries)
separates implementation from these standards.

## 7.1 Clarity Over Cleverness
- Give a function one explainable responsibility and make its effects visible in its name, parameters, return shape or call site. A coordinator may sequence several operations; it should not also redefine each operation's domain rules.
- Keep validation, transformation, persistence and follow-up effects distinguishable when they have different failure or testing boundaries. Do not split a short coherent operation merely to create more functions.
- Reduce nesting with guard clauses or named operations when that clarifies the normal path; preserve ordering, cleanup and error behavior.
- Use semantic parameters and group related inputs into a named object when it makes calls readable. Avoid ambiguous positional booleans; prefer a named option or explicit mode such as `isPreview` or `operation: "update"`. Do not replace clear boolean domain facts with unnecessary abstractions.

## 7.2 No Duplication
- Centralize duplicated knowledge: an invariant, compatibility rule or interpretation of persisted data should have one owner used by its consumers.
- Small incidental repetition is acceptable when an abstraction would join unrelated concepts or hide important differences. Similar syntax alone is not a shared domain rule.
- Distinguish editable shared sources, format wrappers and generated copies. In `shared/renderAssetContract.*`, the `.cjs` holds logic and the `.js` exposes it to ESM; the destinations listed by the sync script are copies. Do not deduplicate by removing adapters or hand-editing generated destinations.

## 7.3 Naming Discipline
- Use names that express domain intent and units/identity where ambiguity matters, such as draft id versus public slug, or storage path versus delivery URL.
- Keep code and its focused tests near the concept responsible, following local conventions. Avoid new generic `helpers`, `common` or `utils` deposits without a defined responsibility; an existing directory name does not justify adding unrelated logic.
- Short names like `value` in a small normalization function are acceptable when context is clear. At a boundary, name the semantic payload and result instead of relying on implicit caller knowledge.

## 7.4 Typing And External Data
- Preserve `strict: true` in [Functions tsconfig](../../functions/tsconfig.json). The frontend currently uses JavaScript/JSX; a general TypeScript migration is not an accepted requirement. Use clear shapes, local conventions and JSDoc where it helps callers.
- Treat external input (Firestore documents, callable/request bodies, SDK/model responses and browser messages) as untrusted at its receiving boundary. Validate shape and domain constraints at runtime before use; TypeScript annotations and casts do not perform validation or authorize access.
- Prefer `unknown` plus narrowing to `any` for external values. Do not use `any`, broad casts or suppression comments to conceal errors. A necessary interop escape needs a local reason, bounded scope and validation/testing that explains what remains unchecked.
- Use semantic types and explicit states when they prevent real ambiguity (session kind, lifecycle state, result with blocker/warning details). Avoid collections of booleans that admit impossible states; preserve persisted shapes and compatible readers.

## 7.5 Complexity And Mutable State
- Review the boundary when a module accumulates unrelated reasons to change, reaches into many consumers' internals or duplicates their state. Reduce responsibility before adding another generalized manager.
- Minimize shared mutable state. Preserve existing session/phase ownership and pass snapshots or intent through existing boundaries; do not create another global writer or timing-dependent mirror.
- Treat caches, generic registries and speculative abstractions as added complexity until justified by current use. A smaller file is not necessarily a simpler system.

## 7.6 Comments
- Explain decisions, constraints, non-obvious invariants and compatibility reasons. Improve structure and names before adding narration of what each line does.
- Keep comments accurate when behavior changes; remove obsolete explanations. Link the responsible contract when its rule is too detailed to repeat locally.

## 7.7 Refactors
- Delimit the structural change and the behavior that remains stable, including errors, persisted fields, event timing and side effects when relevant.
- Use small reviewable steps and characterization/regression evidence. Separate functional changes when it helps review and recovery; avoid cleanup outside the request.
- Existing debt permits an appropriately scoped fix, not an unrequested rewrite or a new parallel authority. Follow the [refactor procedure](../operations/CHANGE_WORKFLOW.md#refactorizar).

## 7.8 Temporary Code And Exceptions
- A workaround needs its reason, risk and removal condition. A local comment with a regression case may suffice; significant cross-module debt needs a reference in its existing contract/map/risk owner. Do not require an ADR for every local detail.
- An observed deviation is not an accepted exception. A material exception must have evidence of an explicit decision, its scope and consequences, with implementation/verification status separate from acceptance.
- Never accept silent security exceptions. Unresolved ownership/permission policy stays pending in its authority; neither a TODO nor a passing test waives the requirement.

## 7.9 What Tooling Can And Cannot Demonstrate

These are inspected verification anchors, not results of running them for this
standards update. Inspect effects and build freshness before use through the
[verification entry points](../DOCUMENTATION_INDEX.md#verification-entry-points).

| Standard / boundary | Existing support | Review still required |
| --- | --- | --- |
| Functions typing | `strict: true`; Functions build invokes TypeScript. | Runtime validation, justified escapes and JS/JSX shapes. Strict mode does not prohibit explicit `any`. Build writes artifacts. |
| Editor-session transport | [core tests](../../src/components/editor/persistence/editorSessionPersistenceCore.test.mjs), [guard test](../../src/components/editor/persistence/editorSessionPersistenceGuard.test.mjs), [FIFO tests](../../src/components/editor/persistence/draftWriteCoordinator.test.mjs). | The guard scans a listed set of files/patterns, not all dependency paths; these tests do not certify Firebase Rules. |
| Domain/shared compatibility | [Gallery mutations](../../src/domain/gallery/galleryMutations.test.mjs), [render assets](../../shared/renderAssetContract.test.mjs), [Functions compatibility](../../functions/renderContractCompatibility.test.mjs). | Contract interpretation, affected consumer inventory, compiled/copy freshness and UI/runtime coverage. No automatic watch synchronization guarantee (F15). |
| Lint | Functions defines `eslint .`. | F13 records existing failures and incomplete CI coverage; this is not a green quality gate. |
| Cohesion, functions, dependency cost, naming, duplication, complexity, comments, workarounds and refactor scope | Focused tests can constrain observable behavior. | These standards need human/agent review of responsibilities and diff; no general automated architectural gate is claimed. |

F10–F15 and Q1 remain in the [risk register](SYSTEM_FRAGILITY_MAP.md#operational-readiness).
Writing standards does not close their technical verification gaps.

---

# 8. Decision Priority Order

Within applicable security, data-ownership and contractual constraints, use this
order for product/engineering trade-offs. It does not rank documentary authority
or allow a normative requirement to be waived:

1. UX Simplicity
2. Mobile Performance
3. Scalability
4. Code Maintainability
5. Developer Convenience

Never invert this order without explicit justification.
