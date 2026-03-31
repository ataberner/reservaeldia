# PREVIEW SYSTEM TARGET

> Updated from architecture definition on 2026-03-30.
>
> Primary input documents: `docs/architecture/PREVIEW_SYSTEM_ANALYSIS.md`, `docs/architecture/PREVIEW_SYSTEM_GAPS.md`.
>
> Priority rule for this document: this file defines the intended target behavior and architecture contract for the preview system. Current visible preview output is preserved by default unless this document explicitly marks a behavior as revisitable.

## 1. Executive Summary

The preview system is the product's trustworthy, author-facing rendering reference for how an invitation is expected to render once it has been prepared for publication. Its purpose is not only to provide a convenient editing aid. Its purpose is to show the invitation through the same intended rendering contract that publication relies on, while still fitting the dashboard preview surface.

The current visible preview output is the baseline to protect. Internal cleanup, architectural simplification, or implementation replacement are not valid reasons to change preview output on their own. Output changes require an explicit product or architecture decision.

## 2. Core Principles

- **Preview must be trustworthy**: a user should be able to treat preview as the intended rendering reference for the invitation, not as an approximate sketch.
- **Cleanup must not change output accidentally**: implementation simplification is allowed only when the defined preview behavior remains intact.
- **One canonical render contract**: preview and publish must converge on one canonical prepared render contract for invitation rendering.
- **The editor is an authoring interface, not render truth**: the editor operates over the render contract, but the authoritative render truth is the canonical prepared render contract rather than the editor runtime itself.
- **Responsive behavior must be explicit**: mobile behavior, viewport-fit behavior, and anchor behavior must be defined contractually, not left as incidental runtime drift.
- **Preview behavior must be explainable**: the system must be describable as explicit authored truth plus explicit preparation and responsive rules.
- **Implementation may vary behind the contract**: transports, bridges, modal internals, and runtime helpers may change as long as the target render contract and preserved output remain unchanged.

## 3. Canonical Truth Model

The canonical authored render state is the invitation render payload carried by the top-level fields:

- `objetos`
- `secciones`
- `rsvp`
- `gifts`

Persisted draft or template state is the required base source of truth for preview and publish. Preview does not skip the persisted source boundary. It starts from a re-read of the persisted source document that corresponds to the active editable session.

Live editor state is allowed to participate after that re-read and before render preparation, but only in a constrained way. Preview may overlay live render-state fields after re-read in order to preserve the current working product behavior, but that overlay is limited to the canonical authored render fields. Arbitrary runtime-only state, transient DOM overlay details, gesture flags, or modal-only state are not part of the authoritative render truth.

Live overlay may contribute only stable canonical render-state fields. It must not contribute:

- in-progress transforms
- partially committed inline editing state
- transient selection state
- transient gesture, drag, or resize state
- modal-only or preview-only state
- any runtime-only state that is not part of canonical authored render truth

The authoritative render boundary for both preview and publish is the canonical prepared render contract. That prepared contract consists of:

- the canonical authored render state
- resolved authored geometry relevant to rendering, including `x`, `y`, `yNorm`, or their canonical resolved equivalent
- resolved anchor interpretation
- resolved section-mode interpretation
- resolved grouping and composition boundaries
- resolved asset/render metadata required to render the invitation correctly
- resolved CTA and invitation-behavior metadata required for correct render semantics
- any other layout-affecting semantics required for deterministic preview/publish rendering

Before rendering, the prepared render contract must resolve render-affecting semantics into a deterministic form sufficient for both preview and publish to render the invitation without relying on implicit semantic interpretation outside the contract.

Anything outside that prepared render contract may support implementation, but it is not authoritative render truth.

For template sessions, the same truth model applies. The source re-read comes from the template editor document rather than the draft document, but the target render boundary is the same kind of prepared render contract.

## 4. Preview/Publish Parity Target

Preview/publish parity means that preview and publish must render from the same canonical prepared render contract and the same render semantics for the invitation itself.

In the target architecture, parity includes:

- the same prepared interpretation of authored render data
- the same anchor semantics
- the same responsive and mobile semantics
- the same CTA and invitation-behavior semantics
- the same asset-resolution semantics at the render-contract level

Acceptable differences are limited to surrounding product surface and non-semantic tooling differences:

- preview modal chrome and surrounding dashboard UI
- the timing and presentation of validation/reporting UI
- embedded preview tooling that preserves the same invitation rendering behavior

Minor visual differences caused by rounding, scaling precision, or equivalent non-semantic rendering variance may be acceptable when they do not change structural render meaning.

Unacceptable differences include:

- different preparation logic that changes invitation rendering semantics
- different anchor interpretation between preview and publish
- different responsive or mobile rules that change invitation rendering semantics
- different CTA, URL, or functional invitation behavior resolution
- different layout interpretation caused only by preview- versus publish-specific preparation

Structural drift is not acceptable. That includes reordering, anchor reinterpretation, composition breakage, semantic behavior drift, and materially different responsive behavior.

Publish validation is a sidecar decision layer over the same prepared render contract. Validation may block publication, warn, or annotate risk, but it must not define a separate render contract for publish. If validation depends on data that changes rendering semantics, that data belongs in the canonical prepared render contract used by both preview and publish.

## 5. Responsive/Layout Target

The target layout model is explicitly hybrid.

Section-local authored coordinates are the canonical authored layout truth. Objects belong to sections, and their authored positions are interpreted in section-local design space. That authored truth is not replaced by a purely viewport-first model.

Viewport-derived behavior is also part of the target contract, but only through explicit responsive rules. Viewport width, viewport height, safe-area constraints, and embedded-environment stabilization may influence rendering only where the contract explicitly defines how they do so.

This means:

- authored section-local geometry remains canonical
- viewport-derived scaling and fitting are allowed only as explicit interpretation rules
- responsive behavior is not permitted to emerge as undocumented drift

Responsive behavior may be expressed at generation time, runtime, or both. That choice is an implementation detail. What is contractual is that any behavior affecting visible render output must come from explicit responsive rules, not from accidental differences between environments.

### Composition-Preserving Groups

Composition-preserving groups are first-class layout units within the render contract. Once present in authored render state, a group is not an editor-only convenience or a temporary authoring hint. It is part of the render contract that preview, publish, responsive adaptation, and mobile behavior must all respect.

A composition-preserving group preserves all of the following as part of the intended layout result:

- the internal relative geometry of its member elements
- the internal layering order of its member elements
- the intended adjacency, overlap, and separation relationships inside the composition
- the identity of the group as one atomic layout unit during responsive adaptation and mobile reflow

Responsive or mobile behavior may move, scale, fit, or otherwise adapt a composition-preserving group as a unit. It must not, by default:

- reorder members internally
- stack members independently as separate layout units
- separate members into different flow positions
- reinterpret the group as unrelated elements during responsive or mobile adaptation

Composition-preserving groups remain compatible with the rest of the render contract:

- a group remains part of one section and inherits that section's membership semantics
- a group resolves within the anchor semantics of its authored anchor family, including `content` and `fullbleed`
- a group follows the section-mode semantics of its containing section, including `fijo` and `pantalla`

A composition-preserving group preserves internal composition only. It does not replace or override anchor semantics, section-mode semantics, or other contract-level layout rules, and it must not become a universal escape hatch from the rest of the layout contract.

## 6. Anchor Model Target

The target preview system uses distinct anchor families and distinct section modes. These are part of the contract, not incidental implementation details.

`content`

- `content` is the section-contained anchor family for authored invitation content.
- Its geometry is interpreted relative to the section content container and the scale rules that apply to that container.
- It is not allowed to inherit bleed semantics implicitly.

`fullbleed`

- `fullbleed` is the section-scoped bleed anchor family.
- A `fullbleed` object belongs to a section, but its horizontal behavior is defined relative to viewport-width-oriented bleed semantics rather than only content-container width.
- `fullbleed` and `content` are distinct anchor families and must not be treated as interchangeable.

`fijo`

- `fijo` is the fixed-height section mode.
- The section's authored geometry and authored vertical structure remain canonical.
- Responsive behavior may scale or fit the section presentation, but it does not reinterpret the section as a viewport-height-fitting hero mode.

`pantalla`

- `pantalla` is the viewport-height-responsive section mode.
- It uses an explicit design-space vertical model and explicit viewport-height interpretation rules.
- Vertical placement in `pantalla` must be understood as normalized viewport-responsive placement, not as ordinary fixed-section Y placement.
- The target contract preserves the current visual behavior by default, including viewport-driven scaling and vertical offset behavior, but treats those behaviors as explicit contract rules rather than implicit runtime drift.

Together, these target rules mean:

- section-local authored layout remains canonical
- `content` and `fullbleed` define different horizontal anchor semantics
- `fijo` and `pantalla` define different vertical/section-mode semantics
- mobile and viewport adaptation must preserve those semantics rather than reinterpret them ad hoc

## 7. Mobile Behavior Target

Mobile behavior is a first-class part of the preview contract.

Mobile smart layout is not treated as an accidental fallback. It is part of the intended mobile rendering behavior for the invitation where the contract applies it. Post-generation mobile reflow is acceptable when it is an explicit contract-level behavior rather than hidden drift.

Desktop and mobile preview continue to use the same generated HTML. The target contract preserves the current model in which desktop and mobile are different viewport interpretations of the same invitation document, not two separately generated invitation documents.

Dual desktop/mobile preview in the modal remains part of the intended preview product contract. It is the intended way the dashboard preview surface communicates desktop and mobile rendering to the author.

Acceptable mobile reflow is limited to explicit contract-level reflow that preserves invitation meaning and rendering semantics. Mobile behavior may reorder, fit, or adapt content only where that behavior is part of the defined contract. Mobile behavior must not become a hidden second layout system with semantics that are different from the intended invitation render contract.

Unless explicitly authorized by contract, mobile behavior must not invert visual hierarchy, detach decorative elements from their intended primary elements, reinterpret grouped compositions as separate units, change anchor meaning, or break intended composition semantics.

Preview-specific embedded stabilization is allowed as behavior-preserving tooling. It may support the preview surface, but it must preserve the same intended invitation rendering behavior rather than create a different mobile rendering contract for preview.

## 8. Baseline-Preserved Behaviors

The following behaviors are part of the preserved preview baseline and must remain unchanged unless an explicit future product or architecture decision revisits them:

- the same generated invitation HTML is used for desktop and mobile preview
- the preview modal presents both desktop and mobile preview together rather than collapsing the product contract to one viewport at a time
- preview may re-read persisted state and then overlay live canonical render fields before building the prepared render contract
- grouped compositions, once present in the authored render state, are preserved as atomic layout units across preview, publish, and mobile behavior by default
- current `pantalla` rendering behavior is preserved by default, including its existing viewport-driven desktop/mobile interpretation
- current `fullbleed` rendering interpretation is preserved by default as a separate bleed-oriented anchor family
- current mobile smart layout output behavior is preserved by default as part of mobile invitation rendering
- preview behavior inside the embedded modal context is preserved by default as long as it remains behaviorally aligned with the intended invitation render contract

## 9. Explicitly Revisitable Behaviors

The following items are allowed to change later, but only through an explicit product or architecture decision rather than through incidental cleanup:

- the exact internal implementation of inline settle, flush, and live overlay transport
- the exact preview modal shell arrangement, chrome, and surrounding dashboard presentation details
- the exact mechanism used for iframe/runtime mutation and embedded stabilization
- the exact implementation split across controller, generator runtime, modal, and supporting helpers
- the exact heuristics, thresholds, and event wiring used to realize responsive/runtime behavior, as long as contract-level output rules remain preserved
- the exact internal representation used to compute the prepared render contract, as long as the contract itself and its visible consequences remain unchanged

## 10. Non-Goals

This document does not define:

- implementation steps
- refactor sequencing
- migration planning
- rollout strategy
- storage or code-module restructuring
- pixel-perfect per-object exception handling unless required to clarify the contract

This document defines the target behavior and architecture contract only.

## 11. Architectural Implications

Any future refactor, cleanup, or architectural replacement that claims to preserve preview behavior must preserve all of the following:

- one canonical prepared render contract for preview and publish
- shared preview/publish preparation semantics
- the explicit hybrid layout model
- composition-preserving group behavior as part of the render contract
- the distinct anchor semantics of `content`, `fullbleed`, `fijo`, and `pantalla`
- first-class mobile behavior, including same-HTML desktop/mobile interpretation
- the baseline-preserved visible preview behaviors listed in this document

This target contract allows substantial internal simplification, but only when that simplification preserves the contract-level render truth and the visible preview baseline. Replacing mechanisms is allowed. Replacing behavior is not allowed unless it is explicitly authorized by a later product or architecture decision.

## 12. Open Decisions

None at the target-contract level.

Future work may intentionally revisit behaviors listed in the "Explicitly Revisitable Behaviors" section, but those are not unresolved target-contract questions. They are deliberate future change points that require explicit decision-making.
