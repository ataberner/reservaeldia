# PREVIEW / PUBLISH INTERACTIVITY CONTRACT

This document defines the current functional CTA contract across Editor, Preview, and Publish.

Scope is intentionally narrow:

- `rsvp-boton`
- `regalo-boton`
- grouped child behavior for those CTAs

This is not a general interaction or architecture document. It is grounded in the current generator, modal runtime, group render contract, preview pipeline, data model, and publish validation paths.

Grounding references:

- `functions/src/utils/generarHTMLDesdeObjetos.ts`
- `functions/src/utils/generarHTMLDesdeSecciones.ts`
- `functions/src/utils/generarModalRSVP.ts`
- `functions/src/utils/generarModalRegalos.ts`
- `shared/groupRenderContract.cjs`
- `src/domain/dashboard/previewSession.js`
- `src/domain/dashboard/previewPipeline.js`
- `functions/src/render/prepareRenderPayload.ts`
- `functions/src/payments/publicationPublishValidation.ts`

## 1. Interactive Element Definition

Current functional CTA types in scope:

| Element | Required object contract | Required root config dependency | Expected runtime behavior |
| --- | --- | --- | --- |
| `rsvp-boton` | Must keep `id` and `tipo="rsvp-boton"`. Top-level CTA must have valid section ownership. Grouped CTA child may inherit `seccionId` and `anclaje` from its parent group and must not redefine them. Visual fields such as `texto`, size, typography, and radius may fall back. | Root `rsvp` must exist and must be enabled. | Must render as a functional CTA node, remain clickable, and open the RSVP modal. |
| `regalo-boton` | Must keep `id` and `tipo="regalo-boton"`. Top-level CTA must have valid section ownership. Grouped CTA child may inherit `seccionId` and `anclaje` from its parent group and must not redefine them. Visual fields may fall back. | Root `gifts` must exist, must be enabled, and must expose at least one usable visible gift method. | Must render as a functional CTA node, remain clickable, and open the gifts modal. |

Additional scope rule:

- No other functional CTA type is currently defined by the shared CTA contract.
- Generic `enlace` wrapping is not a functional CTA and is outside this document.
- `enlace` on `rsvp-boton` or `regalo-boton` is not a fallback behavior. Publish already treats that link as ignored.

Important data rule:

- CTA objects are visual objects only.
- Functional behavior is resolved from root config plus CTA presence in `objetos`.
- `rsvp-boton` does not carry RSVP form data inside the object.
- `regalo-boton` does not carry gifts/bank data inside the object.

## 2. Behavioral Parity Definition

Behavioral parity is stricter than visual parity.

An interactive element is correct only if all of the following are true:

- it renders visually
- it is clickable in the generated runtime
- it triggers the correct action

For this contract:

- `rsvp-boton` is correct only if it opens the RSVP modal
- `regalo-boton` is correct only if it opens the gifts modal

Strict rule:

- Visual presence without working activation is a contract failure.
- A CTA rendered as `unavailable` may still be visible, but it is not behaviorally correct.
- A preview or publish result that shows the CTA but cannot activate it does not satisfy parity.

## 3. Group Interaction Contract

Groups may own layout, but they must not remove child function.

Group rules:

- A group MUST preserve child identity and child type.
- A grouped CTA child MUST remain a CTA child, not become decorative content.
- A group MAY own `seccionId`, `anclaje`, and `yNorm` for layout inheritance.
- A grouped child MAY omit those layout fields if the group is the layout owner.
- A group MUST NOT remove CTA semantics from its children.
- A group MUST NOT make the wrapper the only clickable target when the child CTA is the intended trigger.
- A group wrapper MUST NOT block pointer events for an interactive child.
- No flattening, wrapping, or nesting step may convert a functional CTA into a decorative node.

Required final HTML behavior for grouped CTAs:

- The child CTA must still be rendered as its own CTA node.
- The final DOM must preserve CTA discoverability by CTA semantics, not by node depth.
- Required CTA state must remain present on the child node.
- Event binding must still work when the CTA node is nested inside grouped output.

Required CTA semantics in generated HTML:

- A ready CTA must preserve `data-cta-state="ready"`.
- A ready `rsvp-boton` must preserve RSVP trigger semantics such as `data-accion="abrir-rsvp"` or `data-rsvp-open`.
- A ready `regalo-boton` must preserve gifts trigger semantics such as `data-accion="abrir-regalos"` or `data-gift-open`.
- An unavailable CTA must preserve unavailable state semantics instead of silently degrading into a decorative node.
- Group rendering may add `data-group-id` and `data-group-child-id`, but those additions must not replace CTA semantics.

For the current runtime, CTA discoverability means the grouped child must still preserve its CTA class and CTA trigger semantics, including the ready/unavailable state and modal trigger attributes when applicable.

Important current-system detail:

- Group-child rendering currently may remove `data-obj-id` from the child root.
- That is acceptable only if the grouped CTA remains discoverable by CTA semantics.
- Final DOM discoverability for grouped CTAs MUST NOT depend on `data-obj-id`.

## 4. Rendering Rules Across Environments

### Editor

- Live interaction is allowed.
- Editor-specific overlay/runtime behavior is allowed.
- The editor may simulate CTA behavior through editor runtime bridges and overlay logic.
- Editor visual success alone does not prove preview/publish correctness.

### Preview

- Publishable draft preview MUST match publish behavior.
- Publishable draft preview MUST use the backend prepared render payload before generating HTML and is classified as `previewAuthority: "draft-authoritative"`.
- Validation blockers in that backend prepared payload prevent trusted preview HTML.
- Draft-authoritative preview MUST evaluate CTA correctness in generated HTML runtime, not in editor canvas runtime.
- Draft-authoritative preview MUST NOT rely on editor-only overlay logic, Konva hit behavior, or selection/runtime bridges to make a CTA appear functional.
- A grouped CTA that is visible but not clickable in draft-authoritative preview is a contract failure.
- Draft-authoritative mobile preview uses `data-preview-layout-mode="parity"` in the iframe shell so responsive/runtime layout uses the publish-like fixed-section height model. `NEXT_PUBLIC_MOBILE_PREVIEW_PARITY_MODE=0` is the rollback path for the previous iframe layout mutation behavior.
- Template preview is classified as `previewAuthority: "template-visual"`: it is pre-draft, visual-only, and not publish parity.
- Rollback/local preview is classified as `previewAuthority: "local-fallback"`: it is emergency visual fallback, not publish parity.

### Publish

- Publish is the final source of truth.
- Publish uses the prepared render payload, validation, and generated HTML runtime.
- Publish behavior for ready CTAs MUST match draft-authoritative preview behavior exactly.
- A CTA that is ready in publish but non-interactive in final HTML is a contract failure.

## 5. Current Covered Cases

| Case | Expected behavior | Current behavior | Status |
| --- | --- | --- | --- |
| Grouped `rsvp-boton` | Renders, remains independently clickable, opens RSVP modal in Preview and Publish. | Generator preserves ready CTA trigger semantics inside grouped output; render compatibility tests cover this path. | Covered |
| Grouped `regalo-boton` | Renders, remains independently clickable, opens gifts modal in Preview and Publish. | Generator preserves ready CTA trigger semantics inside grouped output; render compatibility tests cover this path. | Covered |

Any regression to "visible but not interactive" remains a behavioral parity failure.

## 6. Contract Rules

- Interactive behavior MUST NOT depend on node depth.
- Interactive behavior MUST NOT depend on grouping.
- Interactive behavior MUST NOT depend on render phase.
- Interactive behavior MUST NOT depend on editor-only runtime overlays.
- Grouped CTA children MUST remain independently clickable.
- Group wrappers MUST NOT consume or neutralize child CTA activation.
- Final DOM MUST expose all functional CTAs regardless of grouping.
- Final DOM MUST preserve CTA semantics even when grouped child rendering changes wrapper classes or group metadata.
- CTA correctness MUST be evaluated from the generated DOM and runtime behavior, not from canvas appearance.
- A CTA rendered without required root config is not correct.
- A CTA rendered with disabled root config is not correct.
- A CTA rendered as visually present but behaviorally inactive is not correct.

## 7. Validation Expectations

Current preflight already validates important parts of this contract:

- grouped render shape and group contract issues
- missing root config for RSVP/gifts
- disabled root config for RSVP/gifts
- gifts without usable visible methods
- incomplete visible gift modal fields
- ignored `enlace` on functional CTAs

Before Publish, the system must also validate the behavior-level contract:

- every ready CTA present in render state must produce a discoverable CTA node in final DOM
- a grouped CTA child must preserve CTA trigger semantics after group rendering
- a grouped CTA child must remain clickable in draft-authoritative Preview
- a grouped CTA child must remain clickable in Publish
- clicking grouped `rsvp-boton` must open the RSVP modal
- clicking grouped `regalo-boton` must open the gifts modal
- a CTA rendered but not interactive must be surfaced as a contract failure
- a CTA inside a group that loses functionality must be surfaced as a contract failure

Validation consequence:

- "Rendered but not interactive" is not a pass.
- "Visible in Editor only" is not a pass.
- "Works top-level but fails when grouped" is not a pass.
