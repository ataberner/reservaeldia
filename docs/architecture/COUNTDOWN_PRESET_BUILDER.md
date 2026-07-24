# Countdown Preset Builder

Status: Current Implementation Map.

This document maps the current administrative builder at
`/admin/countdown-presets/`. Code and executable tests remain the source of
truth. It does not change the persisted countdown schema or the public render
contract.

## Ownership

| Concern | Current owner |
| --- | --- |
| Page access and admin redirect | `src/pages/admin/countdown-presets.jsx` |
| Page composition and exit protection | `CountdownPresetBuilderPage.jsx` |
| Local builder state and asynchronous orchestration | `useCountdownPresetBuilderState.js` |
| Pure state transitions, fingerprints, filtering and simulation fixtures | `builderState.js` |
| Schema 2 form hydration and validation adapter | `builderFormModel.js`, `validators.js` |
| Form controls | `CountdownPresetForm.jsx`, `CountdownPresetFormSections.jsx` |
| Administrative catalog | `CountdownPresetList.jsx` |
| Builder simulation shell | `CountdownPresetPreviewPanel.jsx` |
| Existing builder countdown renderer | `CountdownPresetLivePreview.jsx` |
| Frame upload UX and browser validation | `SvgUploadInspector.jsx`, `frameAssetInspector.js` |
| Shared SVG/PNG frame contract | `shared/countdownFrameAssetContract.cjs` |
| Shared frame scale and centered geometry | `shared/countdownFrameGeometry.cjs` |
| Read-only version history | `CountdownPresetHistoryPanel.jsx` |
| Frontend callable boundary | `src/domain/countdownPresets/service.js` |
| Firestore/Storage lifecycle | `functions/src/countdownPresets/service.ts` |

## Local State Contract

`countdownBuilderReducer` is the only local authority for:

- editable form data;
- persisted-form baseline and stable dirty fingerprint;
- selected preset and selection epoch;
- draft metadata;
- validation and touched fields;
- active operation, recoverable error and last success;
- catalog filters;
- preview-only simulation state;
- read-only history state;
- pending accessible confirmation.

The hook owns side effects only. Catalog and history requests carry monotonic
request ids; asset hydration carries an `AbortController`; mutation responses
carry the selection epoch that originated them. A late response cannot replace
the current selection. When a save finishes after a newer local edit, it updates
the persisted baseline but preserves the newer form value, so dirty state
remains true.

There is no autosave. Save, publish, save-and-publish, archive, safe deletion and
duplication continue to use the existing backend lifecycle and idempotency
rules.

## Preview Contract

The simulation state is not part of the form fingerprint or save payload. It
supports desktop/mobile containers, zoom, light/dark/checkerboard backgrounds,
reduced motion, a custom date and four frozen-clock scenarios. The panel reuses
`CountdownPresetLivePreview` and the existing schema 2 render helpers; it does
not introduce another public renderer.

Default props preserve the Phase 0 baseline harness behavior. Injecting `nowMs`
freezes the builder timer only for simulation and tests.

The optional frame accepts SVG and PNG without changing schema 2. `svgRef`
remains the historical persisted key for read compatibility, while new assets
add `type`, `mimeType`, intrinsic dimensions and PNG alpha metadata. Old refs
without an explicit type are inferred as SVG. SVG keeps fixed/currentColor
behavior; PNG is always fixed-color and uses contained geometry so its original
proportion and colors are preserved.

`layout.frameScale` is an additive schema 2 layout field for the decorative
frame only. `1` preserves the historical size, the supported range is
`0.5..5`, and missing values read as `1`. The builder exposes it as
`Tamaño del frame`; replacing SVG/PNG preserves the value, while removing the
frame resets it to `1`. The materialized countdown stores the same value as
root `frameScale`. Builder, Konva, React preview, thumbnail generation and
published HTML all scale the frame from its center without changing numbers,
labels, chips, target time or the countdown layout box.

PNG upload validation distinguishes an alpha-capable PNG from one that contains
actual transparent pixels. `hasAlpha` remains compatible channel metadata;
optional `hasTransparency` records the decoded result for new assets. An opaque
PNG remains valid but produces a warning, and the local inspector uses a
checkerboard so an opaque white rectangle is visible before saving. Draft and
published frame bytes are not flattened or raster-converted by the preset
lifecycle.

For schema 2 in Canvas, `width`/`height` remain the resize/layout authority, but
they are not the selection-box authority. Konva derives `contentBounds` from
the unit/separator rectangles, `visualFrameBounds` from the contained PNG or
SVG plus `frameScale`, and `selectionBounds` from their union. The interactive
hitbox uses that union while a non-rendered layout metric preserves resize
flattening. Applying a preset recalculates natural dimensions instead of
retaining a stale oversized rectangle from the previous countdown.

## Version History

`listCountdownPresetVersionsAdmin` is an admin-only read operation over
`countdownPresets/{presetId}/versions`. It returns the root `activeVersion` and
serialized immutable versions. The UI may inspect a version and compare its
schema 2 sections with the current local draft without replacing the editor
state. It cannot activate, overwrite, delete or roll back a version.

## Duplication

`duplicateCountdownPreset` requires an explicit `operationId`. It:

1. selects the source draft, or otherwise reads exactly the immutable active
   version;
2. creates a deterministic new preset id from the operation;
3. copies frame and thumbnail assets into destination-owned staging paths;
4. creates a schema 2 draft-only root in a Firestore transaction;
5. records the completed operation under the source for replay;
6. removes assets from failed or replayed attempts.

The duplicate does not copy `activeVersion`, version documents, operation
history, tombstones or `legacyPresetProps`. Legacy-synchronized input is
normalized through the existing compatibility adapter and remains compatible.

## Compatibility And Deliberate Limits

- Persisted schema remains version 2.
- Draft PNG uploads are validated in the browser and decoded again with
  `sharp` in Functions. Current limits are 5 MB, 600–6000 px per side,
  24 megapixels and a maximum 3:1 aspect ratio. Transparency and at least
  1200 × 1200 px are recommendations, not blockers.
- SVG retains the existing sanitization contract and 500 KB hard limit.
- `fechaObjetivo`, invitation snapshots and public render payloads are
  untouched.
- Legacy/v1 reads, aliases, tombstones, immutable versions, staging and
  telemetry remain active.
- There is no rollback activation, autosave, schema v3, IANA timezone,
  per-breakpoint persisted overrides or new layout/temporal engine.
- Phase 0 renderer, lifecycle, catalog and temporal feature flags remain
  independent and default to off. The administrative UI does not use one of
  those runtime flags to create a parallel state or persistence path.

## Regression Anchors

- `src/domain/countdownPresets/builderState.test.mjs`
- `src/domain/countdownPresets/builderFormModel.test.mjs`
- `src/components/admin/countdown/countdownPresetFormInteraction.test.mjs`
- `src/components/admin/countdown/countdownPresetPreviewPhase3.test.mjs`
- `src/domain/countdownPresets/frameAssetInspector.test.mjs`
- `src/components/editor/countdown/countdownFramePngParity.test.mjs`
- `shared/countdownFrameAssetContract.test.mjs`
- `shared/countdownFrameGeometry.test.mjs`
- `functions/countdownFrameAssetValidation.test.mjs`
- `functions/countdownPresetPhase3Policy.test.mjs`
- `functions/countdownPresetPhase3Service.test.mjs`
- `npm run countdowns:baseline:check`
