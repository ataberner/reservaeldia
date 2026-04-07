# Preview/Publish Visual Baseline

Phase 1 freezes a lightweight visual-reference catalog for preview/publish parity work without changing runtime rendering behavior.

Contract anchor:

- `docs/architecture/PREVIEW_SYSTEM_ANALYSIS.md`
- `docs/contracts/RENDER_COMPATIBILITY_MATRIX.md`

Shared fixture source of truth:

- `shared/previewPublishVisualBaselineFixtures.mjs`
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

Preview and publish remain the canonical render-truth surfaces for parity work. The editor canvas is captured alongside them to improve visibility into authoring-versus-render comparisons without redefining the contract.

These views freeze invitation rendering reference points only. They do not freeze dashboard chrome, modal shell styling, or other surrounding product UI.

## Baseline Cases

| Case | Why this case exists | Parity mode | Views | Accepted warning-only drift | Focus checkpoints |
| --- | --- | --- | --- | --- | --- |
| `simple-pantalla-section` | Protect the minimal `pantalla` text baseline. | `shared-parity` | all five baseline views | none | `pantalla` viewport fit, content anchoring, text hierarchy |
| `decorative-fullbleed` | Protect current `fullbleed` behavior in a decorated `pantalla` section. | `warning-only` | all five baseline views | `fullbleed-editor-drift`, `pantalla-ynorm-drift` | bleed-layer width behavior, section decoration attachment, mobile anchor interpretation |
| `text-with-decoration-behind` | Protect text layering over current section background/decor rendering. | `shared-parity` | all five baseline views | none | text stays above decorations, decoration does not detach, no accidental bleed reinterpretation |
| `gallery` | Protect the current gallery layout family and cell ordering semantics. | `shared-parity` | all five baseline views | none | cell order, sizing pattern, desktop/mobile gallery family |
| `countdown` | Protect current countdown frame and unit composition. | `shared-parity` | all five baseline views | none | frame composition, unit structure, desktop/mobile countdown family |
| `mixed-fijo-pantalla` | Protect section ordering across one `pantalla` section plus fixed sections. | `shared-parity` | all five baseline views | none | section order, `pantalla` to `fijo` relationship, cross-section stability |

## Accepted Current Differences

The following differences are accepted in Phase 1 and must not be treated as regressions by themselves:

- preview modal chrome and dashboard shell are not parity targets
- embedded preview scroll or stabilization mechanics are not parity targets by themselves
- minor rounding or scale-precision variance is acceptable when the invitation structure does not change
- current warning-only drift remains accepted where explicitly present in a baseline case
- warning vocabulary that may remain acceptable where applicable is:
  `pantalla-ynorm-missing`, `pantalla-ynorm-drift`, `fullbleed-editor-drift`

## Regression Checkpoints

Treat any of the following as a regression in later phases unless a new product or architecture decision explicitly approves the change:

- any new hard mismatch code from `shared/previewPublishParity.test.mjs`
- changed anchor interpretation for `content` versus `fullbleed`
- changed section-mode interpretation for `fijo` versus `pantalla`
- changed layering or composition in the text-over-decoration case
- changed gallery cell ordering, sizing pattern, or layout family
- changed countdown frame or unit composition
- changed cross-section order or changed `fijo`/`pantalla` relationship in the mixed case

## Notes

- Phase 1 is manifest-only. No PNG or JPEG baselines are committed yet.
- Existing live capture scripts such as `scripts/inlineOverlayMatrixProbe.mjs` and `scripts/generarPreview.cjs` are not the baseline system for this phase.
- The countdown case is intentionally included now, but deterministic screenshot capture for countdown still requires a later frozen-clock harness.
