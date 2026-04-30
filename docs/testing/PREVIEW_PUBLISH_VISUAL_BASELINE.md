# Preview/Publish Visual Baseline

This document freezes a lightweight visual-reference catalog for preview/publish parity work without changing runtime rendering behavior.

Contract anchor:

- `docs/architecture/PREVIEW_SYSTEM_ANALYSIS.md`
- `docs/contracts/RENDER_COMPATIBILITY_MATRIX.md`
- `functions/src/render/prepareRenderPayload.ts`

Shared fixture source of truth:

- `shared/previewPublishVisualBaselineFixtures.mjs`
- `shared/previewPublishMobileGeometryParity.mjs`
- `artifacts/preview-publish-baseline/manifest.json`
- `shared/previewPublishParity.test.mjs`

## Required Views

Every baseline case must reserve the same five capture views:

- `canvas-editor`
- `preview-desktop-frame`
- `preview-mobile-frame`
- `publish-desktop`
- `publish-mobile`

`canvas-editor` represents the editor canvas authoring surface. It is included as an additional visual reference layer only. It is not render truth and it does not change the canonical preview/publish contract.

Publishable draft preview and publish share the backend prepared render payload and remain the canonical render-truth surfaces for parity work. The editor canvas is captured alongside them to improve visibility into authoring-versus-render comparisons without redefining the contract.

Preview authority is explicit in code:

- `draft-authoritative`: backend prepared draft preview and the only preview mode that participates in publish parity.
- `template-visual`: template modal/editor preview, pre-draft and visual-only.
- `local-fallback`: rollback/emergency local preview, visual-only.

Template and local fallback preview outputs must not be used as publish-faithful baseline views.

These views freeze invitation rendering reference points only. They do not freeze dashboard chrome, modal shell styling, or other surrounding product UI.

## Baseline Cases

| Case | Why this case exists | Parity mode | Views | Accepted warning-only drift | Focus checkpoints |
| --- | --- | --- | --- | --- | --- |
| `edge-decorations-pantalla` | Protect section-owned top/bottom edge ornaments in a `pantalla` section. | `shared-parity` | all five baseline views | none | viewport-width edge bands, intrinsic-clamp sizing budget, desktop offset interpretation, no `.objeto`, `pantalla` zoom compensation |
| `simple-pantalla-section` | Protect the minimal `pantalla` text baseline. | `shared-parity` | all five baseline views | none | `pantalla` viewport fit, content anchoring, text hierarchy |
| `decorative-fullbleed` | Protect current `fullbleed` behavior in a decorated `pantalla` section. | `warning-only` | all five baseline views | `fullbleed-editor-drift`, `pantalla-ynorm-drift` | bleed-layer width behavior, section decoration attachment, mobile anchor interpretation |
| `text-with-decoration-behind` | Protect text layering over current section background/decor rendering. | `shared-parity` | all five baseline views | none | text stays above decorations, decoration does not detach, no accidental bleed reinterpretation |
| `gallery` | Protect the current gallery layout family and cell ordering semantics. | `shared-parity` | all five baseline views | none | cell order, sizing pattern, desktop/mobile gallery family |
| `countdown` | Protect current countdown frame and unit composition. | `shared-parity` | all five baseline views | none | frame composition, unit structure, desktop/mobile countdown family |
| `mixed-fijo-pantalla` | Protect section ordering across one `pantalla` section plus fixed sections. | `shared-parity` | all five baseline views | none | section order, `pantalla` to `fijo` relationship, cross-section stability |
| `fixed-reflow-columns` | Protect the two-column mobile smart-layout path for fixed sections. | `shared-parity` | all five baseline views | none | fixed-only reflow, mobile column stacking, section height |
| `fixed-reflow-title-visual-columns` | Protect a centered section title above two icon/text columns. | `shared-parity` | all five baseline views | none | title anchor, lane bbox isolation, centered Ceremony/Fiesta mobile stack |
| `fixed-overflow-expansion` | Protect fixed-section expansion when mobile content exceeds authored height. | `shared-parity` | all five baseline views | none | overflow expansion, stale iframe gaps, downstream offsets |
| `grouped-cta-fixed-section` | Protect grouped CTA positioning and hit-layer preservation in fixed sections. | `shared-parity` | all five baseline views | none | group wrapper unit, nested CTA semantics, sibling stacking |
| `group-nested-children` | Protect group child offsets relative to the wrapper. | `shared-parity` | all five baseline views | none | atomic group movement, nested children, relative offsets |
| `fixed-fullbleed-mixed-lanes` | Protect fullbleed/content lane separation inside fixed sections. | `shared-parity` | all five baseline views | none | bleed lane, content lane, fit-scale lane intent |
| `pantalla-ynorm-positioning` | Protect multiple `yNorm` positions in one `pantalla` section. | `shared-parity` | all five baseline views | none | no fixed reflow, relative vertical spacing, viewport-fit formulas |

## Centered Title Reflow Fix

Root cause fixed on 2026-04-30:

- A short centered title above two visual columns was not classified as a full-width mobile item when icons/shapes were present.
- The title stayed in the flow, got assigned to one lane during two-column detection, and expanded that lane bounding box.
- The stacker then preserved source offsets inside that contaminated lane, so the first visual column could render left of the mobile center.

Corrected rule:

- `data-role="title"` text with `text-align:center`, a box centered on the section content axis, and no same-row content peer is an anchor for mobile lane detection.
- Centered labels inside visual columns remain flow items because their boxes are not centered on the section axis, or because a centered middle-column label still has same-row peers.

Avoided risks:

- The fix does not anchor every centered text when non-text content exists.
- The legacy centered full-width heuristic remains restricted to sections without visible non-text objects.
- Desktop geometry is untouched because the rule runs only inside the mobile smart-layout runtime.

Manual validation:

- With `¿Dónde?` present, mobile preview and mobile publish center Ceremony and Fiesta on the same axis.
- With `¿Dónde?` removed, the previous centered Ceremony/Fiesta stack remains unchanged.
- Desktop preview and publish keep the original side-by-side composition.

## Accepted Current Differences

The following differences are accepted in the current baseline and must not be treated as regressions by themselves:

- preview modal chrome and dashboard shell are not parity targets
- embedded preview scroll or stabilization mechanics are not parity targets by themselves
- minor rounding or scale-precision variance is acceptable when the invitation structure does not change
- current warning-only drift remains accepted where explicitly present in a baseline case
- warning vocabulary that may remain acceptable where applicable is:
  `pantalla-ynorm-missing`, `pantalla-ynorm-drift`, `fullbleed-editor-drift`

## Regression Checkpoints

Treat any of the following as a regression unless a new product or architecture decision explicitly approves the change:

- any new hard mismatch code from `shared/previewPublishParity.test.mjs`
- changed anchor interpretation for `content` versus `fullbleed`
- changed section-mode interpretation for `fijo` versus `pantalla`
- changed layering or composition in the text-over-decoration case
- changed gallery cell ordering, sizing pattern, or layout family
- changed countdown frame or unit composition
- changed cross-section order or changed `fijo`/`pantalla` relationship in the mixed case
- changed mobile smart-layout height expansion between preview iframe and publish
- changed group-child offsets relative to the group wrapper
- changed fullbleed/content lane separation in fixed sections
- changed `decoracionesBorde` rendering into object/smart-layout nodes, or changed top/bottom viewport-width anchoring, intrinsic-clamp sizing budget, or offset behavior

## Notes

- The baseline remains manifest-first. No PNG or JPEG baselines are committed yet.
- Mobile geometry parity capture is available through the opt-in Node test guarded by `PREVIEW_PUBLISH_MOBILE_GEOMETRY=1`; normal CI keeps the deterministic fixture/diff tests only. The snapshot includes section, object, group-child, and edge-decoration geometry. Edge decoration sizing is governed by the generated HTML intrinsic-clamp model; the editor canvas can adjust only desktop edge offsets today, and mobile edge offsets remain a separate render field.
- The current preview iframe supports publish-like layout mode by default through `data-preview-layout-mode="parity"`. Set `NEXT_PUBLIC_MOBILE_PREVIEW_PARITY_MODE=0` to use the legacy iframe height/overflow mutation path during rollback.
- Mobile height diagnostics may expose `data-msl-height-model`; `publish-like` is expected for publish and parity preview, while `embedded-preview` belongs to the legacy iframe mode.
- Existing live capture scripts such as `scripts/inlineOverlayMatrixProbe.mjs` and `scripts/generarPreview.cjs` are not the baseline system.
- The countdown case is intentionally included now, but deterministic screenshot capture for countdown still requires a later frozen-clock harness.
