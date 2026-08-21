# PREVIEW SYSTEM ANALYSIS

> Status: Current Implementation Map.
>
> Updated from code inspection on 2026-08-19.
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

Countdown targets participate in that prepared validation boundary. A missing
target produces `countdown-target-missing`, an unparsable target produces
`countdown-target-invalid`, and both block authoritative preview/publish. A
valid past target is allowed and all render surfaces use the current
`freezeZero` expiration policy.

Schema 2 countdown frames continue to resolve through the compatible
`frameSvgUrl` render field. Additive `frameAssetType: "png"` makes Builder,
Canvas, authoritative preview and publish use contained image geometry and
fixed original colors; absent type remains SVG-compatible. Asset URL
preparation and `countdown-frame-unresolved` validation are unchanged.

## 2. Draft Preview Flow

The draft preview path is:

1. The dashboard starts a guarded preview session and opens the modal in its loading state.
2. `ensureDraftFlushBeforeCriticalAction("preview-before-open")` waits for inline editing to settle and forces persistence flush.
3. The pipeline re-reads `borradores/{slug}` mainly to keep metadata and publication-link compatibility state current.
4. If publish compatibility is enabled, the pipeline resolves the public slug/URL used for preview display and `slugPreview`.
5. The pipeline calls `prepareDraftPreviewRender({ draftSlug, slugPreview })`.
6. The backend reads the owned draft, builds `prepareRenderPayload(...)`, validates it with `validatePreparedRenderPayload(...)`, and generates preview HTML through `generateHtmlFromPreparedRenderPayload(..., { isPreview: true })` only when validation allows it.
7. The result is classified as `previewAuthority: "draft-authoritative"` and the final HTML is committed to the active guarded session.

The live editor snapshot still exists as a compatibility aid inside the local preview pipeline, but backend-prepared draft HTML is generated from the backend-owned draft read after the critical flush. Draft preview authority comes from the backend prepared payload, not from the frontend snapshot overlay.

Repeated open actions while the same session is still preparing share one
in-flight operation. Closing the modal invalidates that session; a late result
may finish at the transport level but cannot commit HTML or loading state into
a later opening.

The superadmin user-directory flow is a read-only variant of this same draft
preview path. `getAdminDraftSnapshot` remains the canvas hydration boundary.
Because that editor cannot mutate or persist, preview skips inline settlement
and persistence flush, uses the already authorized snapshot only for the
frontend source/compatibility read, and calls the same backend prepared
renderer with `administrativeOwnerUid`. The callable requires superadmin again,
re-reads `borradores/{slug}`, and verifies that its stored `userId` matches the
requested owner before preparation. This path is still
`draft-authoritative`; it does not use the local fallback even when the normal
prepared-preview rollback flag is disabled.

Administrative read-only preview does not resolve publication-link metadata,
run the separate publication validation callable, expose the publish action,
or open checkout. Hiding those UI controls is backed by the controller and
page-shell gates; normal ownership remains mandatory in every validation,
checkout, and publish handler.

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

Render preparation also applies functional associations before validation and HTML generation. `rsvp.enabled` and `gifts.enabled` are the functional switch authority for RSVP/Gifts, `eventDetails.mode` is the authority for Ceremony/Party (`"single"` keeps Ceremony active and Party inactive; `"ceremony_party"` keeps both active), and `eventDetails.dressCode.enabled` is the authority for Dress Code. Section-level associations omit whole sections; group-level associations in shared sections omit inactive groups and may derive a reversible horizontal offset for the remaining active functionality. This derivation is shared by draft-authoritative preview and publish and does not mutate stored `objetos` or `secciones`; Dress Code text is carried by `eventDetails.dressCode.value` and the `event_dress_code` dynamic field.

Successful publish also requires the generated social share artifact. The backend
must capture the first `.inv > .sec` from the generated publish HTML, validate
`publicadas/{slug}/share.jpg` as a JPEG `1200x630`, inject Open Graph metadata
pointing to that generated image, and only then persist an active successful
publication. Template preview and local fallback preview remain visual-only and
must not be used as share-image authority.

Gallery preview/publish viewer behavior is governed by [`GALLERY_VIEWER_RENDER_CONTRACT.md`](../contracts/GALLERY_VIEWER_RENDER_CONTRACT.md). Gallery lightbox behavior is generated-HTML based: draft-authoritative preview and publish use the same global viewer runtime, collect clickable Gallery cells from the generated DOM, de-duplicate by media identity, and are covered by preview/publish parity tests.

## 5. Preview Iframe Runtime

`ModalVistaPrevia` renders the generated HTML into iframe `srcDoc` views:

- desktop dashboard viewport: embedded desktop and mobile frames, with logical viewports `1280 x 820` and `390 x 844`
- mobile dashboard viewport: a single embedded active frame that opens on the mobile logical viewport `390 x 844`
- mobile dashboard viewport can temporarily switch the active embedded frame to the desktop logical viewport `1280 x 820` through the modal viewport control
- fullscreen preview: one full-window iframe using the active viewport kind

The modal does not request separate HTML for desktop and mobile. It uses the same HTML and changes the iframe viewport, wrapper scale, and preview metadata.

Each visible preview surface mounts its iframe once when the HTML becomes available. Opening the modal, receiving that HTML, measuring the shell, or entering fullscreen must not schedule a post-commit `key` change that replaces the already loaded iframe document. A real `srcDoc` change remains the document-navigation authority; closing or switching to a different preview surface unmounts it normally.

Loading presentation has one shell authority per visible mockup:

- the modal shows the canonical heart presentation immediately, including while the critical flush and backend preparation are pending
- no provisional loading document is assigned to iframe `srcDoc`
- the final iframe mounts only after final generated HTML exists, so receiving that HTML does not replace a provisional iframe document
- the shell keeps the final iframe non-focusable and hidden from accessibility APIs until generated runtime readiness
- generated HTML retains its normal invitation loader and publish-compatible runtime unchanged
- the shell observes the generated `invitation-loader-hidden` event, with DOM-state fallback, and removes the stable outer presentation only after the final invitation has completed its loader exit
- HTML without the generated loader protocol becomes ready on iframe `load`
- the shell loading wrapper establishes `contain: layout paint`, so the shared
  presentation's published-page `position: fixed` loader is contained by the
  mockup from its first visible render and cannot cover the dashboard viewport
- the desktop overlap wrapper establishes its own stacking context and the
  mobile overlap wrapper is explicitly above it, so the desktop heart loader's
  local `z-index` cannot paint over or cut the mobile mockup outline

The generated loader remains part of the generated invitation contract. Inside
the modal it is a readiness producer rather than a second visible loading
authority. This prevents the old sequence of provisional iframe load, `srcDoc`
replacement, blank navigation commit, and generated loader restart.

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

Scaled mockups use CSS `zoom` on the logical iframe wrapper. `ModalVistaPrevia`
keeps its fixed logical viewport sizes. `TemplatePreviewModal` keeps the same
fixed logical widths and desktop/mobile layout heights. On tablet hosts from
`640px` through `1024px`, it derives the iframe viewing height from the measured
stage height and the existing width-owned scale, so the scaled wrapper occupies
the full available modal height without changing modal or invitation width. The
taller tablet iframe is only a viewing/scroll window: the
generated desktop layout and `pantalla` sections remain anchored to the
canonical `820px` logical height, so viewport-relative section geometry does
not grow with the shell. They do not use `transform: scale(...)`: transform scaling
makes Chromium resample the already-painted iframe surface and can
independently antialias two contiguous
section edges against the white document at fractional scale or
`devicePixelRatio`. Layout zoom paints the same logical iframe viewport at the
requested modal scale in one pass, so it preserves section bounds and scroll
behavior without adding paint, overlap, or iframe-document mutations. This is
owned by `ModalVistaPrevia` and `TemplatePreviewModal`; it does not change the
generated or published invitation HTML.

At non-native preview scale, `previewFrameRuntime` also prevents background
images from creating a second transformed raster edge. It maps the existing
`--bg-image-left` and `--bg-image-top` variables to the equivalent absolute
base position and disables the generated combined transform. For sections with
`soft` or `dynamic` parallax, only the live `--bg-parallax-y` delta uses the
individual compositor-friendly `translate` property. Keeping the changing
delta out of `top` avoids layout work on every scroll frame while preserving
the non-transformed base edge that prevents the scaled section seam.
Native-scale preview keeps the generated image transform authoritative. The
override changes neither image bounds nor parallax inputs; it is a
scaled-iframe rasterization rule, not part of the invitation render contract.

The same scaled-iframe boundary owns one narrower SVG raster correction for
section dividers. On every scaled embedded mockup, the SVG paint extends one
logical pixel beyond each clipped lateral edge. A generated `bottom` divider
also extends one pixel below its container; a `top` divider extends one pixel
above it. The existing divider container and section remain the clip
authorities. This keeps the path's closed edges outside Chromium's fractional
layout-zoom sample and avoids full-width blended rows or vertical edge slivers
that can otherwise expose the section background beneath the divider. It does
not move or overlap sections, change divider paths, affect native-scale
preview, or alter generated/published HTML.

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

The embedded mobile mockups (`mobile-preview-focused` on a mobile dashboard
viewport and `mobile-preview-paired` beside desktop) use `<body>` as their only
effective scroll authority:

- `<html>` is a fixed-height viewport with `overflow-y:hidden`
- `<body>` has viewport height with `overflow-y:auto`; invitation content grows inside it
- `document.scrollingElement` may still report `<html>` in Chrome, so focused-preview code resolves the effective root from the explicit `data-preview-scroll-authority="body"` contract
- the outer preview wrapper continues to clip and scale the logical `390 x 844` iframe; it is not a scroll authority

This exception is owned by `buildPreviewFrameSrcDoc(...)` and
`applyPreviewFrameScale(...)` in the frontend iframe shell. It is enabled only
when the viewport is mobile, layout mode is parity, the surface is
`mobile-preview-focused` or `mobile-preview-paired`, and the requested
authority is `body`. Fullscreen preview, desktop preview, published HTML,
share-image rendering, and dashboard captures retain their existing contracts.

Published mobile HTML keeps `<html>` / `document.documentElement` as its single
effective vertical scroll authority. The generated mobile CSS keeps horizontal
clipping on both roots without turning `<body>` into a second vertical scroller:
`<body>` uses `overflow-x:clip` with `overflow-y:visible` after the invitation
loader releases its temporary body lock. This rule is publish-only; desktop and
preview root selection remain unchanged.

Production evidence from `i/icon` on 2026-08-19 reproduced the failure with
stable section geometry: the first touch moved `body.scrollTop` only 16 px while
`documentElement.scrollTop` stayed at `0`; the next gesture transferred to the
document root. Both nodes computed `overflow-y:auto` because the shared
`overflow-x:hidden` declaration coerced the otherwise-visible vertical axis to
`auto`. Keeping published `<body>` vertically non-scrollable made the first
gesture move the document root directly, with unchanged section heights and
scroll range. Smart layout, font/image readiness, and observer timing were not
the divergence point.

Physical Android 15 / Chrome 150 A/B evidence established the cause on
2026-07-22: variants with both `<html>` and `<body>` effectively scrollable
failed the first gesture while scroll transferred from small `bodyScrollTop`
values to `<html>`. The otherwise identical `body-root-only` variant scrolled
on the first gesture with `<html>` fixed at zero. Transform, scale, iframe
dimensions, and mockup clipping were unchanged. The cause is therefore double
effective scroll authority and first-gesture transfer/latching between the two
surfaces, not iframe scaling.

The generated preview-only mobile marker still performs no input handling. It
does not intercept touch, pointer, wheel, or scroll events and never converts
input into `scrollTop`, `scrollTo`, or `scrollBy` writes. The embedded mobile
srcDoc adapter changes its authority marker to `body` and adapts generated
preview target scrolling to the explicit effective-root resolver instead of
trusting `document.scrollingElement` alone.

The preview shell itself installs no `wheel`, `touchmove`, `pointermove`, or
`scroll` handlers in either viewport and performs no root-scroll writes.
Desktop retains the document root; both embedded mobile mockups retain the
explicit body root. Generated parallax observes native scroll sources with
passive listeners and coalesces notifications into one RAF update. The scaled
preview raster adapter must therefore keep that update compositor-only rather
than turning `--bg-parallax-y` into a changing layout property.

Constraints:

- scroll must work inside mobile preview
- published mobile must keep `<html>` as its only effective vertical scroll root; `<body>` must not consume or mirror the first gesture
- the preview shell must not distort invitation layout to make scroll work
- wheel scrolling stays native on the iframe document root, including wheel events emitted on touch-capable devices
- touch scroll must not rewrite `scrollTop` after the document root already consumed the gesture
- a delayed or mirrored `body.scrollTop` value must not be treated as a new delta
- hiding scrollbar chrome is allowed; disabling scroll is not
- Gallery and gift modals keep using their existing `body` overflow lock and restoration
- RSVP background locking is declared only by the embedded body-root preview contract and preserves the current body position while the modal is open

Generated base `html` and `body` use `height:auto; min-height:100%`, so the root can
represent content taller than the viewport in preview and publication. The
embedded mobile shell overrides that base geometry with its body-root contract.
The base section geometry runtime performs its first `compute()` synchronously
after the generated invitation DOM is present. This establishes fixed-section
heights and a root scroll range before the document becomes interactable;
subsequent RAF/resize work may refine geometry but does not own scroll position.
Mobile Smart Layout boot is idempotent so `DOMContentLoaded` plus `load` cannot
schedule duplicate 150/600/1800 ms passes and never owns either root position.

## 8. Mobile Height Model

Section height is decided by a combination of generation-time section mode and runtime mobile layout:

- `fijo` sections start from persisted `altura` and width-based scale.
- `pantalla` sections are viewport-height based and use the `pantalla`/`yNorm` placement model.
- mobile smart layout can reflow and expand fixed sections after HTML generation.
- mobile smart layout does not mutate Firestore or editor state.
- `mobileLayoutMode: "preserve"` on a section is an explicit opt-out from smart reflow. The runtime still measures the section for normal mobile fit/height behavior, but skips anchor detection, clustering, ordering, and stack reflow.

The smart-layout runtime is enabled for mobile and is configured for fixed sections by default. It clusters generated DOM nodes, decides whether reflow is needed, stacks flow content when needed, applies fit scale, and can expand fixed-section height to avoid clipping.

Centered title rule:

- A generated text object with semantic `data-role="title"`, `text-align:center`, a box centered on the fixed section content axis, and no same-row content peer is treated as a mobile anchor before column/lane detection.
- This fixes the 2026-04-30 centered-title reflow bug where a top title such as `¿Dónde?` entered the flow, was assigned to one of the two visual lanes, and polluted that lane bounding box. The affected ceremony column was then centered against `title + column` instead of the mobile section center.
- Column labels remain flow items because their own boxes are left/right of the section center, or because a centered middle-column label still has same-row peers.
- The avoided risk is over-anchoring every centered text when icons/shapes are present. The legacy full-width text heuristic still only runs when no visible non-text object is present.

Height model markers:

- `data-msl-height-model="publish-like"`: normal publish-like height model, including parity preview.
- `data-msl-height-model="publish-like-pending"`: parity preview fixed section skipped until prepared scale is available.
- `data-msl-height-model="embedded-preview"`: legacy embedded-preview model.

Runtime decisions are intentionally separate from generation decisions. Generation writes section/object HTML and base CSS; the runtime reacts to actual mobile viewport, font/image readiness, and DOM measurements.

Functional group centering is a generation/prepared-payload derivation that runs before mobile smart layout. On mobile, the smart-layout runtime still treats a group wrapper as one layout unit, so the derived horizontal offset becomes the baseline position and does not alter `yNorm` or group-child local coordinates.

`decoracionesBorde` is generated as a section-owned edge layer, not as an object. It stays out of mobile smart layout, uses renderer-owned `--edgezoom` compensation, and sizes the edge band from section height with separate desktop/mobile ratios. This keeps top/bottom ornaments viewport-width and visually balanced in `pantalla` sections during draft-authoritative preview and publish.

## 9. Runtime Version And Deployment Compatibility

Template preview keeps the HTML generator behind a browser `import()`:

1. the dashboard template card calls `openTemplateModal(...)`
2. the controller opens the modal and reads the full template document
3. `generateTemplatePreviewHtml(...)` delegates to
   `generateDashboardPreviewHtmlFromRenderState(...)`
4. `previewSession.js` imports
   `functions/src/utils/generarHTMLDesdeSecciones` on demand

Next.js assigns that generator to a content-hashed lazy chunk. A dashboard tab
retains the Webpack chunk map from the build that originally loaded the page.
Therefore a hosting release must keep the static assets of recent builds
available; fresh HTML alone is not sufficient for a tab that was open before
the release.

The production build wrapper snapshots the just-built `out/_next/static` tree,
merges the latest three release snapshots without overwriting content, and
fails if the same immutable path ever has different bytes. GitHub Actions
restores and saves this bounded history and serializes live deployments. When
the cache is empty, the live workflow first seeds it from the current public
dashboard, its manifest, and the current deploy inventory, including lazy
chunks. The
post-build verifier requires the dashboard HTML, `BUILD_ID`, build manifest,
and local static references to agree. Live deployments additionally verify
that the new dashboard build ID and every deployed current/retained static file
are available with the expected cache policy.

Dashboard HTML remains `no-cache, no-store`; `/_next/static` remains
content-hashed and `immutable`. There is no application service worker in the
current implementation.

If a tab predates the retention window or an asset is otherwise unavailable,
template preview classifies the rejected import as a chunk-load failure and
offers an explicit application update. That recovery reload is allowed only
once per active `buildId` in the tab session. It is secondary recovery, not the
deployment compatibility mechanism.

Focused anchors:

- `scripts/retainNextStaticAssets.cjs`
- `scripts/bootstrapNextStaticHistory.cjs`
- `scripts/verifyNextStaticRelease.cjs`
- `src/domain/runtime/chunkLoadRecovery.js`
- `src/hooks/useDashboardTemplateModal.js`

## 10. Known Constraints

- Template preview is not authoritative.
- Local fallback preview is not authoritative.
- Draft preview is authoritative only when it comes from the backend prepared payload.
- Mobile layout still relies partly on runtime logic.
- Fullbleed, edge-decoration layering, and complex mobile layouts remain sensitive to viewport, fit-scale, and smart-layout timing.
- The editor interaction system remains complex and is documented separately in `INTERACTION_SYSTEM_CURRENT_STATE.md`.

## 11. Testing Anchors

Use these references for parity work:

- `docs/contracts/RENDER_COMPATIBILITY_MATRIX.md`
- `docs/testing/PREVIEW_PUBLISH_VISUAL_BASELINE.md`
- `shared/previewPublishParity.test.mjs`
- `shared/previewPublishMobileGeometryParity.test.mjs`
- `functions/renderContractCompatibility.test.mjs`
- `functions/publicationPublishValidation.test.mjs`

Focused loading/session coverage:

- `src/components/preview/modalVistaPreviaLifecycle.test.mjs`
- `src/components/preview/previewFrameRuntime.test.mjs`
- `shared/previewMobileNativeScrollRuntime.test.mjs`
- `src/hooks/useDashboardPreviewController.controller.test.mjs`
- `src/domain/dashboard/previewPipeline.test.mjs`
- `src/components/editor/header/canvasEditorHeaderReadOnlyPreview.test.mjs`
- `functions/publicationPaymentReads.test.mjs`
- `src/domain/dashboard/previewTiming.test.mjs`
- `src/domain/runtime/chunkLoadRecovery.test.mjs`
- `scripts/retainNextStaticAssets.test.mjs`

Append `previewTiming=1` to the dashboard URL to start one diagnostic session
per modal opening. Every browser record uses
`[PREVIEW:TIMING][session=<opaque-id>]`, `performance.now()`, the preview type,
target, source, viewport, and surface. The session records:

- click/open, inline-edit settlement, FIFO persistence flush
- persisted source read and publication-link resolution
- `prepareDraftPreviewRender` start/end and frontend callable round trip
- backend-owned draft read, `prepareRenderPayload`,
  `validatePreparedRenderPayload`, preview-payload construction,
  `generateHtmlFromPreparedRenderPayload`, response cloning/assembly, and total
  backend duration
- the calculated difference between the frontend round trip and backend total,
  labeled as network/callable/serialization transport
- frontend HTML receipt, `buildPreviewFrameSrcDoc`, definitive React commit,
  each visible iframe mount and `load`
- iframe bootstrap, `DOMContentLoaded`, critical fonts, the first critical
  image resource when Resource Timing exposes it, window resources, invitation
  runtime readiness, `invitation-loader-hidden` emission/reception, external
  loader commit, and interactive visibility

Desktop and mobile mockups share the preparation/backend rows and have separate
iframe/runtime rows. The final `console.table` is emitted only after every
currently visible mockup is ready. Closing, changing controller context, error,
validation blocking, or a stale response finalizes the session with a
non-success status; late events are ignored. Marks, measures, listeners, and
temporary session collections are cleaned at completion. Diagnostic metadata
is injected only into preview `srcDoc`; generated/published HTML and the normal
callable response remain unchanged while the flag is absent. The
instrumentation does not bypass validation, change waits, or select a different
renderer.

## 12. 2026-04-30 Centered Title Reflow Fix

Modified files:

- `functions/src/utils/mobileSmartLayout/scriptTemplate.ts`
- `shared/previewPublishVisualBaselineFixtures.mjs`
- `shared/previewPublishVisualBaseline.test.mjs`
- `shared/previewPublishMobileGeometryParity.test.mjs`
- `artifacts/preview-publish-baseline/manifest.json`
- `docs/architecture/PREVIEW_SYSTEM_ANALYSIS.md`
- `docs/testing/PREVIEW_PUBLISH_VISUAL_BASELINE.md`

Manual validation steps:

- Open or publish a fixed section with a centered `¿Dónde?` title above Ceremony and Fiesta visual columns.
- Check mobile preview and mobile publish: title stays centered, Ceremony stacks centered below it, Fiesta stacks centered below Ceremony.
- Remove the `¿Dónde?` title and repeat: Ceremony and Fiesta must remain centered.
- Check desktop preview/publish: the original side-by-side desktop layout must not move.
