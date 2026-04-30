# PREVIEW SYSTEM ANALYSIS

> Updated from code inspection on 2026-04-27.
>
> This document describes current behavior only. It is the central preview reference for authority, iframe parity, mobile scroll, and mobile height behavior.

Reviewed anchors:

- `src/hooks/useDashboardPreviewController.js`
- `src/domain/dashboard/previewPipeline.js`
- `src/domain/dashboard/previewSession.js`
- `src/domain/drafts/criticalFlush.js`
- `src/components/ModalVistaPrevia.jsx`
- `src/components/preview/previewFrameRuntime.js`
- `functions/src/payments/publicationPayments.ts`
- `functions/src/render/prepareRenderPayload.ts`
- `functions/src/utils/generarHTMLDesdeSecciones.ts`
- `functions/src/utils/mobileSmartLayout/scriptTemplate.ts`

## 1. Current Preview Contract

Preview has three explicit authority classes:

| Authority | Path | Meaning |
| --- | --- | --- |
| `draft-authoritative` | backend `prepareDraftPreviewRender` | Publish-faithful draft preview. It uses the same prepared render payload contract as publish. |
| `template-visual` | template preview local generation | Pre-draft visual preview only. It is not publish parity. |
| `local-fallback` | rollback/emergency local generation | Visual fallback only. It is not authoritative. |

Only `draft-authoritative` preview participates in publish parity. Template preview must never be described as publish-faithful.

For draft preview, validation blockers prevent trusted preview HTML. The backend returns validation and `blocked: true`; the controller must not treat that result as a trustworthy generated preview. Validation warnings can still allow preview.

## 2. Draft Preview Flow

The draft preview path is:

1. The dashboard starts a guarded preview session.
2. `ensureDraftFlushBeforeCriticalAction("preview-before-open")` waits for inline editing to settle and forces persistence flush.
3. The pipeline re-reads `borradores/{slug}` mainly to keep metadata and publication-link compatibility state current.
4. If publish compatibility is enabled, the pipeline resolves the public slug/URL used for preview display and `slugPreview`.
5. The pipeline calls `prepareDraftPreviewRender({ draftSlug, slugPreview })`.
6. The backend reads the owned draft, builds `prepareRenderPayload(...)`, validates it with `validatePreparedRenderPayload(...)`, and generates preview HTML through `generateHtmlFromPreparedRenderPayload(..., { isPreview: true })` only when validation allows it.
7. The result is classified as `previewAuthority: "draft-authoritative"`.

The live editor snapshot still exists as a compatibility aid inside the local preview pipeline, but backend-prepared draft HTML is generated from the backend-owned draft read after the critical flush. Draft preview authority comes from the backend prepared payload, not from the frontend snapshot overlay.

## 3. Template And Fallback Preview

Template preview and rollback/local fallback preview still use the local preview generator path:

- the source document is re-read from the template admin service or Firestore
- a compatible flush-boundary snapshot may be overlaid for visual recency
- the frontend path calls `generarHTMLDesdeSecciones(..., { isPreview: true })`

These paths are intentionally visual-only:

- `template-visual`: pre-draft template preview
- `local-fallback`: emergency local draft preview fallback

Neither path performs publish asset preparation, publish validation, or publish-faithful CTA/config reconciliation. A successful template or fallback preview is not evidence that publish will pass.

## 4. Publish Contract Relationship

Publish and draft-authoritative preview share the same backend prepared payload boundary:

- `prepareRenderPayload(...)`
- `validatePreparedRenderPayload(...)`
- `generateHtmlFromPreparedRenderPayload(...)`

Publish stores final HTML in Firebase Storage and remains the delivery artifact source. Draft-authoritative preview uses the same preparation and validation contract before generating temporary preview HTML.

## 5. Preview Iframe Runtime

`ModalVistaPrevia` renders the generated HTML into iframe `srcDoc` views:

- desktop logical viewport: `1280 x 820`
- mobile logical viewport: `390 x 844`
- fullscreen preview: one full-window iframe using the current viewport kind

The modal does not request separate HTML for desktop and mobile. It uses the same HTML and changes the iframe viewport, wrapper scale, and preview metadata.

Before iframe scripts run, `buildPreviewFrameSrcDoc(...)` injects:

- `data-preview-viewport="desktop|mobile"`
- `data-preview-layout-mode="parity|legacy"`

After load, `applyPreviewFrameScale(...)`:

- writes `data-preview-scale`
- confirms viewport and layout-mode attributes on `<html>` and `<body>`
- stores `__previewScale`, `__previewViewportKind`, and `__previewLayoutMode` on the iframe window
- hides scrollbar chrome
- dispatches `preview:mobile-scroll:enable`
- dispatches `resize` on the next animation frame

These iframe mutations are preview-shell behavior. They must minimize layout distortion and should not be treated as changes to the invitation render contract.

## 6. Mobile Preview Parity Mode

Mobile preview parity mode is the default.

Default behavior:

- `data-preview-layout-mode="parity"`
- embedded mobile preview uses the publish-like fixed-section height model
- iframe shell styles keep the document scrollable while avoiding the old embedded-preview height mutation path

Rollback behavior:

- set `NEXT_PUBLIC_MOBILE_PREVIEW_PARITY_MODE=0`
- the iframe uses `data-preview-layout-mode="legacy"`
- legacy mode restores the older embedded-preview height/overflow mutation behavior

Parity mode means preview tries to match published mobile behavior. It does not mean the iframe is identical to a real public page: the preview is still embedded in a scaled shell, receives preview metadata, and runs preview-only scroll/runtime helpers.

## 7. Mobile Scroll Ownership

In mobile preview, scroll ownership belongs to the iframe document root:

- `<html>` is the scroll root
- `<body>` remains visible-height content
- the outer preview wrapper clips and scales the iframe but should not become the invitation scroll authority

The generated preview-only mobile scroll runtime starts only for preview, embedded, mobile documents. It waits for `preview:mobile-scroll:enable`, then normalizes wheel/body scroll back to the root document scroll.

Constraints:

- scroll must work inside mobile preview
- the preview shell must not distort invitation layout to make scroll work
- body-level scroll leakage should be redirected to the root
- hiding scrollbar chrome is allowed; disabling scroll is not

## 8. Mobile Height Model

Section height is decided by a combination of generation-time section mode and runtime mobile layout:

- `fijo` sections start from persisted `altura` and width-based scale.
- `pantalla` sections are viewport-height based and use the `pantalla`/`yNorm` placement model.
- mobile smart layout can reflow and expand fixed sections after HTML generation.
- mobile smart layout does not mutate Firestore or editor state.

The smart-layout runtime is enabled for mobile and is configured for fixed sections by default. It clusters generated DOM nodes, decides whether reflow is needed, stacks flow content when needed, applies fit scale, and can expand fixed-section height to avoid clipping.

Height model markers:

- `data-msl-height-model="publish-like"`: normal publish-like height model, including parity preview.
- `data-msl-height-model="publish-like-pending"`: parity preview fixed section skipped until prepared scale is available.
- `data-msl-height-model="embedded-preview"`: legacy embedded-preview model.

Runtime decisions are intentionally separate from generation decisions. Generation writes section/object HTML and base CSS; the runtime reacts to actual mobile viewport, font/image readiness, and DOM measurements.

`decoracionesBorde` is generated as a section-owned edge layer, not as an object. It stays out of mobile smart layout, uses renderer-owned `--edgezoom` compensation, and sizes the edge band from section height with separate desktop/mobile ratios. This keeps top/bottom ornaments viewport-width and visually balanced in `pantalla` sections during draft-authoritative preview and publish.

## 9. Known Constraints

- Template preview is not authoritative.
- Local fallback preview is not authoritative.
- Draft preview is authoritative only when it comes from the backend prepared payload.
- Mobile layout still relies partly on runtime logic.
- Fullbleed, edge-decoration layering, and complex mobile layouts remain sensitive to viewport, fit-scale, and smart-layout timing.
- The editor interaction system remains complex and is documented separately in `INTERACTION_SYSTEM_CURRENT_STATE.md`.

## 10. Testing Anchors

Use these references for parity work:

- `docs/contracts/RENDER_COMPATIBILITY_MATRIX.md`
- `docs/testing/PREVIEW_PUBLISH_VISUAL_BASELINE.md`
- `shared/previewPublishParity.test.mjs`
- `shared/previewPublishMobileGeometryParity.test.mjs`
- `functions/renderContractCompatibility.test.mjs`
- `functions/publicationPublishValidation.test.mjs`
