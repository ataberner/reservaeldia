# PREVIEW SYSTEM ANALYSIS

> Updated from code inspection on 2026-03-30.
>
> Reference modules reviewed for this document: `src/components/DashboardHeader.jsx`, `src/pages/dashboard.js`, `src/hooks/useDashboardPreviewController.js`, `src/domain/dashboard/previewPipeline.js`, `src/domain/dashboard/previewSession.js`, `src/domain/drafts/criticalFlush.js`, `src/domain/drafts/flushGate.js`, `src/lib/editorRuntimeBridge.js`, `src/lib/editorSnapshotAdapter.js`, `src/components/CanvasEditor.jsx`, `src/components/editor/window/useEditorWindowBridge.js`, `src/components/editor/persistence/useBorradorSync.js`, `src/components/ModalVistaPrevia.jsx`, `src/components/preview/modalVistaPreviaLayout.js`, `functions/src/utils/generarHTMLDesdeSecciones.ts`, `functions/src/utils/generarHTMLDesdeObjetos.ts`, `functions/src/utils/mobileSmartSectionLayout.ts`, `functions/src/utils/mobileSmartLayout/*`.
>
> Priority rule for this document: findings below are based on the current implementation, not on intended architecture.

## 1. High-Level Overview of Preview Flow

The current dashboard preview flow is a controller-driven pipeline that begins in the dashboard header, crosses an editor runtime boundary, forces a persistence boundary, re-reads the stored source document, optionally overlays a live editor snapshot, generates full HTML by importing the backend generator into the frontend path, and then renders that HTML inside a preview modal.

For draft sessions, the visible trigger path is:

- `DashboardHeader` calls `generarVistaPrevia`
- `useDashboardPreviewController` starts a preview session and runs `ensureDraftFlushBeforeCriticalAction`
- the critical action path first waits for inline editing to settle, then forces persistence flush
- `runDashboardPreviewPipeline` re-reads `borradores/{slug}`, overlays a live editor snapshot, builds preview payload data, and dynamically imports `functions/src/utils/generarHTMLDesdeSecciones`
- the controller commits `htmlVistaPrevia` and preview metadata into React state
- `src/pages/dashboard.js` passes that state into `ModalVistaPrevia`
- `ModalVistaPrevia` renders the same generated HTML into two `iframe srcDoc` previews, one desktop-sized and one mobile-sized

For template sessions, the same controller path is used, but the document re-read comes from `getTemplateEditorDocument`, publish-compatibility reads are disabled, and the preview UI does not expose publish actions.

The preview system is therefore not a direct render of current React editor state. It is a multi-step path that combines:

- dashboard React state
- editor bridge methods exposed on `window.canvasEditor`
- a persistence flush transport
- a Firestore or template-service re-read
- a live render snapshot adapter
- a full HTML generator runtime

## 2. Step-by-Step Pipeline

### 2.1 Trigger

Preview is triggered from the dashboard header.

- `src/components/DashboardHeader.jsx` renders the preview button and wires `onClick={generarVistaPrevia}`.
- `src/components/DashboardLayout.jsx` receives `generarVistaPrevia` as a prop and passes it into `DashboardHeader`.
- `src/pages/dashboard.js` gets `generarVistaPrevia` from `useDashboardPreviewController({ slugInvitacion, modoEditor, editorSession })`.

Inside `src/hooks/useDashboardPreviewController.js`, `generarVistaPrevia` starts by:

- creating a preview session with `beginPreviewSession()`
- building a request identity from `slugInvitacion`, `editorSession`, and a sequence counter
- using `assertCurrentPreviewSession` and `isCurrentPreviewSession` guards so stale async work cannot commit into a newer preview session

This session guard remains active across the rest of the pipeline. After every async boundary, the controller checks whether the current preview request is still the active one.

### 2.2 Inline Settle

Before any preview flush or re-read, the controller waits for inline text editing to settle.

- `generarVistaPrevia` calls `ensureDraftFlushBeforeCriticalAction("preview-before-open")`.
- `ensureDraftFlushBeforeCriticalAction` first runs `runInlineCriticalBoundary`.
- the default implementation is `runDashboardPreviewControllerInlineCriticalBoundary`.

`runDashboardPreviewControllerInlineCriticalBoundary` reads a bridge method from the editor runtime:

- `readCanvasEditorMethod("ensureInlineEditSettledBeforeCriticalAction")`

That bridge method is exposed from `CanvasEditor` through `useEditorWindowBridge`, which writes the method into `window.canvasEditor`.

Inside `src/components/CanvasEditor.jsx`, `ensureInlineEditSettledBeforeCriticalAction` delegates to:

- `ensureInlineSessionSettledBeforeCriticalAction` from `src/components/editor/canvasEditor/inlineCriticalBoundary.js`

The settle boundary reads current inline state through a getter that returns:

- `editing.id` from React state in `CanvasEditor`
- `getCurrentInlineEditingId()`, which reads `window._currentEditingId`
- `inlineOverlayMountedId`
- `inlineOverlayMountSession`

Current settle behavior:

- if there is no active inline session, it returns `{ ok: true, settled: true, skipped: true }`
- if there is an active `editing.id`, it requests finish through `requestInlineEditFinish`
- it then polls frame-by-frame until no active inline session remains
- the wait window is bounded by `maxWaitMs`, which the preview controller sets to `120`
- if the session is still active after that window, it returns a failure result and preview does not proceed

The settle boundary therefore depends on both React-owned inline state and `window`-level inline state.

### 2.3 Persistence Flush

If the inline settle boundary succeeds, the controller forces persistence flush before preview proceeds.

- `ensureDraftFlushBeforeCriticalAction` next calls `flushEditorPersistenceBeforeCriticalAction`
- that function lives in `src/domain/drafts/criticalFlush.js`

`flushEditorPersistenceBeforeCriticalAction` normalizes the editor session and branches by transport:

- if there is no valid slug or `editorMode !== "konva"`, it returns a skipped success result
- if the session kind is `template` and a direct flush bridge is available, it uses direct bridge transport
- otherwise it uses the event-based flush transport

Direct bridge transport:

- `useBorradorSync` registers `flushNow` through `onRegisterPersistenceBridge`
- `CanvasEditor` stores that bridge through `useCanvasEditorPersistenceBridge`
- `useEditorWindowBridge` exposes it on `window.canvasEditor.flushPersistenceNow`
- `flushEditorPersistenceBeforeCriticalAction` calls that bridge through `readCanvasEditorMethod("flushPersistenceNow")`

Event transport:

- `flushEditorPersistenceBeforeCriticalAction` calls `requestEditorDraftFlush`
- `requestEditorDraftFlush` dispatches `editor:draft-flush:request` and waits for `editor:draft-flush:result`
- the default timeout is `6000ms`
- `useBorradorSync` listens for the request event, runs `flushPersistBoundary`, and dispatches the result event

`useBorradorSync` performs the actual persistence boundary through its scheduler and current editor state snapshot. The flush path uses `latestStateRef.current`, which contains:

- `slug`
- normalized `editorSession`
- `objetos`
- `secciones`
- `rsvp`
- `gifts`
- `cargado`

If flush succeeds, `flushEditorPersistenceBeforeCriticalAction` captures a compatibility snapshot by calling:

- `readEditorRenderSnapshot()`

That snapshot is only captured after a successful flush result. The returned preview flush result can therefore include:

- success/failure metadata
- transport type
- `compatibilitySnapshot`

If flush fails, preview does not open and the controller commits an error state instead of continuing.

### 2.4 Data Re-Read

Once the critical boundary succeeds, `generarVistaPrevia` opens preview state and runs the preview pipeline.

- the controller calls `runPreviewPipeline`
- the default implementation is `runDashboardPreviewPipeline` in `src/domain/dashboard/previewPipeline.js`

Current re-read behavior branches by session kind.

For draft sessions:

- `runDashboardPreviewPipeline` calls `readDraftDocument`
- in the default controller wiring, that is `getDoc(doc(db, "borradores", draftSlug))`
- `resolveDraftDocumentData` accepts Firestore `DocumentSnapshot` shapes and extracts plain object data

For template sessions:

- `runDashboardPreviewPipeline` calls `readTemplateEditorDocument`
- in the default controller wiring, that dynamically imports `../domain/templates/adminService.js`
- the current implementation then calls `getTemplateEditorDocument({ templateId })`
- `resolveTemplateEditorDocument` reads `result.editorDocument`

If the re-read does not resolve a document, the pipeline returns:

- `{ status: "missing-draft" }` for missing drafts
- `{ status: "missing-template" }` for missing template editor documents

For draft sessions only, the preview pipeline can also run publication-link compatibility lookup.

- `buildDashboardPreviewCompatibilityState` disables publish compatibility for template sessions
- when compatibility is enabled, `runDashboardPreviewPipeline` calls `resolvePublicationLinkForDraftRead`
- the current default readers are:
  - `getDoc(doc(db, "publicadas", publicSlug))`
  - a Firestore query on `publicadas` where `slugOriginal == draftSlug`, limited to one document

This compatibility read happens after the draft/template source payload has already been selected and after snapshot overlay has been applied.

### 2.5 Snapshot Overlay

After the document re-read, the preview pipeline resolves a live editor snapshot.

Current precedence:

- `previewBoundarySnapshot` from the flush result if present
- otherwise `readLiveEditorSnapshot()`, which is wired to `readEditorRenderSnapshot()`

The overlay operation is implemented by `overlayLiveEditorSnapshot` in `src/domain/dashboard/previewSession.js`.

Its current behavior is a shallow object merge:

- start with the re-read document data
- replace `objetos`
- replace `secciones`
- replace `rsvp`
- replace `gifts`

No deeper merge is performed inside those four render-state fields. If a live snapshot exists, those fields fully replace the corresponding fields from the re-read document.

The resulting `previewSourceData` is then passed through:

- `buildDashboardPreviewRenderPayload`

That payload builder currently performs:

- `prepareDashboardPreviewRenderState`
- `normalizeDraftRenderState`
- `normalizeRenderAssetState`
- `normalizeRsvpConfig` for preview use
- `normalizeGiftConfig` for preview use

Preview-side asset preparation is explicitly browser-safe normalization only. Publish-only preparation remains on the backend publish path.

### 2.6 HTML Generation

After preview payload preparation, the pipeline builds generator input and generates full HTML.

Generator input is created by:

- `buildDashboardPreviewGeneratorInput`

Current generator input behavior:

- compute `slugPreview` from detected public slug, detected public URL, or `slugInvitacion`
- set `generatorOptions.slug = slugPreview`
- set `generatorOptions.isPreview = true`
- pass root config through:
  - `gifts`
  - `rsvpSource`
  - `giftsSource`

The controller wiring dynamically imports the backend generator module into the frontend preview path:

- `import("../../functions/src/utils/generarHTMLDesdeSecciones")`

It then calls:

- `generarHTMLDesdeSecciones(previewPayload.secciones, previewPayload.objetos, previewPayload.rsvpPreviewConfig, generatorOptions)`

Inside `functions/src/utils/generarHTMLDesdeSecciones.ts`, the generator currently:

- recomputes the functional CTA contract if one was not explicitly supplied
- builds section HTML by splitting objects into content vs `fullbleed`
- delegates object HTML to `generarHTMLDesdeObjetos`
- injects document-level CSS and runtime scripts
- marks the document as preview when `isPreview` is true by setting `data-preview="1"` on `<html>` and `<body>`
- injects preview-only runtime such as:
  - preview template patch runtime
  - preview mobile scroll runtime

HTML generation therefore happens after:

- re-read
- snapshot overlay
- preview render-payload preparation

and before the preview modal is rendered.

### 2.7 Render in UI

When the generator returns HTML, the controller commits it into preview state through:

- `buildDashboardPreviewSuccessStatePatch`

That state is returned from `useDashboardPreviewController` and rendered by `src/pages/dashboard.js`, which passes:

- `visible={mostrarVistaPrevia}`
- `htmlContent={htmlVistaPrevia}`
- preview/public URL metadata
- publish validation state

into `src/components/ModalVistaPrevia.jsx`.

`ModalVistaPrevia` renders the same `htmlContent` into two separate `iframe srcDoc` views:

- a desktop preview using a fixed logical viewport of `1280 x 820`
- a mobile preview using a fixed logical viewport of `390 x 844`

The modal does not regenerate HTML per viewport. It uses the same HTML string twice and changes presentation through wrapper geometry and iframe viewport size.

Modal layout is computed by:

- `computeModalVistaPreviaLayout` in `src/components/preview/modalVistaPreviaLayout.js`

That modal-level layout chooses one of three shell arrangements based on available stage size:

- `showcase-overlap`
- `dual-column-compact`
- `stacked-priority`

After each iframe loads, `ModalVistaPrevia` calls `applyPreviewFrameScale(event, scale, previewViewport)`:

- writes `data-preview-scale` and `data-preview-viewport` onto the iframe document `<html>` and `<body>`
- hides iframe scrollbars
- for mobile preview, adjusts iframe root/body overflow behavior
- stores `__previewScale` and `__previewViewportKind` on the iframe `window`
- dispatches `preview:mobile-scroll:enable`
- dispatches a `resize` event on the iframe window on the next animation frame

The modal also supports a fullscreen path, but fullscreen uses a single full-window iframe without the desktop/mobile wrapper shells.

## 3. Data Sources Involved at Each Step

| Step | Active data sources | Current behavior |
| --- | --- | --- |
| Trigger | Dashboard React state, controller refs, `editorSession`, `slugInvitacion` | `useDashboardPreviewController` uses React state plus refs such as `previewStateRef`, `previewSessionSequenceRef`, and `activePreviewSessionRef` to manage preview sessions and stale-request guards. |
| Inline settle | `window.canvasEditor`, `CanvasEditor` React state, `window._currentEditingId`, inline overlay mount state | The controller reads `ensureInlineEditSettledBeforeCriticalAction` through `readCanvasEditorMethod`. `CanvasEditor` resolves settle state from `editing.id`, `getCurrentInlineEditingId()`, `inlineOverlayMountedId`, and `inlineOverlayMountSession`. |
| Persistence flush | `window.canvasEditor.flushPersistenceNow`, `editor:draft-flush:*` events, `useBorradorSync.latestStateRef` | Template sessions prefer direct bridge flush. Draft sessions use the request/result event transport. The persisted payload comes from the current editor state tracked inside `useBorradorSync`. |
| Compatibility snapshot capture | `readEditorRenderSnapshot()`, snapshot adapter, legacy `window._*` globals | After successful flush, the controller captures a render snapshot. `readEditorRenderSnapshot` reads `window.editorSnapshot` first and falls back to legacy globals if needed. |
| Data re-read | Firestore `borradores/{slug}`, template admin service, optional publication reads | Draft preview re-reads Firestore. Template preview re-reads the template editor document. Draft preview can also read `publicadas` and query `slugOriginal` through the compatibility helper. |
| Snapshot overlay | Re-read payload plus live editor snapshot | `overlayLiveEditorSnapshot` shallow-copies the re-read object and replaces `objetos`, `secciones`, `rsvp`, and `gifts` with the live snapshot values. |
| Preview payload preparation | In-memory render payload, shared asset normalizer, RSVP/gifts normalizers | `buildDashboardPreviewRenderPayload` normalizes draft render state and browser-safe asset aliases, then builds preview-specific RSVP and gifts config. |
| HTML generation | Dynamic import of `functions/src` generator, in-memory payload | The frontend preview path imports `generarHTMLDesdeSecciones` and passes prepared `secciones`, `objetos`, `rsvpPreviewConfig`, and generator options. |
| Render in UI | Preview React state, same HTML string rendered twice | `ModalVistaPrevia` receives `htmlVistaPrevia` from React state and injects the same HTML into separate desktop and mobile iframes. |

### Snapshot Adapter Boundary

The current live snapshot adapter boundary is `src/lib/editorSnapshotAdapter.js`.

Current render snapshot read order:

1. `window.editorSnapshot.getRenderSnapshot()` if the adapter exists
2. legacy fallback from `window._objetosActuales`, `window._seccionesOrdenadas`, `window._rsvpConfigActual`, `window._giftsConfigActual`, and `window._giftConfigActual`

The editor keeps both sides active today:

- `useCanvasEditorGlobalsBridge` syncs `window.editorSnapshot`
- the same bridge also writes legacy globals such as `window._objetosActuales` and `window._seccionesOrdenadas`

## 4. Current Responsive Behavior

### 4.1 Modal-Level Preview Shell Scaling

The preview modal has its own responsive behavior before the generated document runs any of its own layout logic.

This behavior lives in:

- `src/components/ModalVistaPrevia.jsx`
- `src/components/preview/modalVistaPreviaLayout.js`

Current modal behavior:

- define fixed logical viewport sizes for desktop and mobile previews
- compute wrapper scaling so those logical viewports fit inside the modal stage
- choose one of three shell arrangements:
  - overlap presentation for wide stages
  - dual-column presentation for medium stages
  - stacked presentation for narrower stages

This modal-level behavior scales the outer preview shells. It does not rewrite the generated HTML.

### 4.2 Generated-Document Viewport and Scale Computation

The generated HTML contains its own responsive CSS and runtime logic in `functions/src/utils/generarHTMLDesdeSecciones.ts`.

Current document-level behavior:

- define `--content-w`, `--sx`, `--bx`, `--vh-safe`, `--vh-logical`, `--pantalla-y-base`, `--pantalla-y-compact`, and `--pantalla-y-offset`
- center sections with `.sec { width: 100vw; left: 50%; transform: translateX(-50%); }`
- keep `.sec-content` centered on desktop and switch it to `width: 100%` with safe-area padding on mobile
- compute viewport values from a combination of:
  - `document.documentElement.clientWidth` / `clientHeight`
  - `window.innerWidth` / `innerHeight`
  - `window.visualViewport`
  - embedded-iframe detection
  - screen short-side and long-side fallbacks

The runtime computes:

- `contentW = min(800, vw)`
- `sx = contentW / 800`
- `bx = vw / 800`

This logic runs on:

- `load`
- `resize`
- `visualViewport.resize`
- `visualViewport.scroll` when the runtime accepts it
- `orientationchange`

### 4.3 Current Mobile `pantalla` Handling

The current `pantalla` behavior is encoded inside the same generated-document runtime in `generarHTMLDesdeSecciones.ts`.

Current behavior for `pantalla` sections:

- use a design-space height of `500`
- on desktop, compute `sfinal` from safe viewport height divided by `500`
- on desktop, also set `--content-w-pantalla` to `800 * sfinal`
- on mobile, compute `zoomExtra` from device aspect ratio when the device is taller than the base design aspect ratio
- on mobile, compute `bgzoom` separately from content zoom
- on mobile, keep `TEXT_ZOOM_FACTOR` at `0`, so `sfinal` currently remains `sx` for content scaling even when hero zoom changes
- on mobile, compute `pantallaTextZoom` from viewport-height thresholds
- on mobile, compute `pantallaYBasePx` from spare logical vertical space
- on mobile, set `--vh-logical` to `calc(var(--vh-safe) / var(--zoom))`

Current mobile `pantalla` behavior therefore includes:

- viewport-fit logic
- optional hero/background zoom
- text zoom
- a uniform vertical base offset

### 4.4 Object-Level Responsive Behavior

The current object-level responsive behavior lives in `functions/src/utils/generarHTMLDesdeObjetos.ts`.

Current scaling model:

- content objects use `sContenidoVar(obj)`
- `sContenidoVar(obj)` resolves to:
  - `var(--sfinal)` for objects inside `pantalla` sections
  - `var(--sx)` for objects inside `fijo` sections
- `fullbleed` objects use:
  - `var(--bx)` for X scale
  - `var(--sx)` for Y scale

Current object families with explicit mobile-aware behavior include:

- text objects:
  - carry `data-debug-texto="1"`
  - carry `data-text-scale-mode`
  - use `--text-scale-effective`
- countdown objects:
  - carry `data-mobile-cluster="isolated"`
  - carry `data-mobile-center="force"`
- dynamic gallery objects:
  - compute distinct desktop and mobile cell rectangles
  - switch to mobile rect variables under `@media (max-width: 767px)`

### 4.5 Mobile Reflow Runtime

The generated HTML also injects a separate mobile reflow runtime through:

- `functions/src/utils/mobileSmartSectionLayout.ts`
- `functions/src/utils/mobileSmartLayout/*`

The current generator sets:

- `ENABLE_MOBILE_SMART_LAYOUT = true`

and injects the mobile smart layout script with options including:

- `onlyFixedSections: true`
- `onlyWhenReordered: true`
- fit-scale and gap parameters

Current mobile smart layout behavior:

- only runs on mobile
- defaults to fixed sections only
- reads absolutely positioned object nodes from `.sec-content` and `.sec-bleed`
- clusters overlapping nodes
- orders clusters for mobile reading
- stacks clusters into a mobile reading flow
- can expand fixed-section inline heights in the generated DOM
- applies fit scaling to content and bleed wrappers
- preserves and restores baseline inline styles through `data-msl-*` attributes

This runtime operates on generated DOM after HTML generation. It does not mutate Firestore data or editor state.

### 4.6 Preview-Specific Mobile Scroll Behavior

`generarHTMLDesdeSecciones.ts` also injects a preview-only mobile scroll runtime.

Current behavior:

- only starts when the document is marked as preview, embedded, and the viewport kind is `mobile`
- normalizes scroll handling for the iframe context
- listens for `preview:mobile-scroll:enable`
- coordinates iframe-root scrolling through the generated document runtime

This runtime is activated by `ModalVistaPrevia` after the mobile iframe loads.

## 5. Current Layout Model

### 5.1 Container-Based vs Viewport-Based

The current layout model is mixed.

It is container-based in the sense that:

- objects belong to sections through `seccionId`
- object coordinates are section-local in persisted data
- most objects are rendered inside `.sec-content`, not directly against the viewport

It is also viewport-shaped in the sense that:

- each `.sec` spans `100vw`
- mobile and desktop scale variables are computed from the current viewport
- `pantalla` sections derive their geometry from viewport height and safe-area measurements
- `fullbleed` objects use viewport-width scaling on the X axis

The current generator therefore does not use a purely container-based or purely viewport-based model. It uses section-local authored coordinates that are later interpreted through viewport-derived scale variables.

### 5.2 Section Modes: `fijo` vs `pantalla`

Current section modes come from `seccion.altoModo`.

For `fijo` sections:

- section height is based on persisted `altura`
- CSS height is `calc(var(--sfinal) * var(--hbase) * 1px)`
- in practice `--sfinal` stays aligned with width-based scaling
- object top positions use persisted `y` scaled through `pxY`

For `pantalla` sections:

- section height is viewport-height based
- the design-space reference height is `500`
- content scaling can be driven by safe viewport height on desktop
- object top positions are computed from normalized vertical placement logic

### 5.3 Position Fields: `x`, `y`, `yNorm`

The current object renderer uses:

- `x`
- `y`
- `yNorm`

Current position behavior:

- `x` is treated as authored horizontal position in editor space
- `y` is used for normal section-local vertical position
- `yNorm` is preferred for `pantalla` sections

Inside `generarHTMLDesdeObjetos.ts`:

- `getYPxEditor(obj)` prefers `yNorm * 500` when `yNorm` is present
- if `yNorm` is missing, it falls back to numeric `y`
- `topCSS(obj)` uses `topPantallaCSS` for `pantalla` sections and `pxY(obj, y)` otherwise

Current `pantalla` top calculation includes:

- normalized Y placement within a design-space block of `500px`
- `--pantalla-y-base`
- `--pantalla-y-offset`
- `--pantalla-y-compact`

### 5.4 Anchor Model: Content vs `fullbleed`

Current section rendering splits objects into two anchor families:

- content objects
- `fullbleed` objects

This split happens in `generarHTMLDesdeSecciones.ts`:

- `objsBleed` are rendered into `.sec-bleed`
- `objsContenido` are rendered into `.sec-content`

Current scaling consequences:

- content objects scale through `sContenidoVar`
- `fullbleed` objects do not use `sfinal` on the X axis
- `fullbleed` objects use viewport-oriented width scaling and width-spanning section placement

### 5.5 Scale Variables: `--sx`, `--bx`, `--sfinal`

The current generator uses three main scale variables.

- `--sx`: content-width scale relative to the base width of `800`
- `--bx`: viewport-width scale relative to the base width of `800`
- `--sfinal`: final content scale used by `pantalla` content objects

Current interpretation:

- for normal fixed content, `--sx` is the main scale
- for `pantalla` content, `--sfinal` is the main scale
- for `fullbleed` X placement, `--bx` is used

### 5.6 Family-Specific Layout Encoding

Some layout rules are embedded directly into object-family renderers.

Current examples:

- text objects encode text scaling mode and preserve absolute geometry by applying visual text zoom through `transform`
- countdown objects embed mobile clustering and centering hints through `data-mobile-*` attributes
- galleries in `dynamic_media` mode precompute separate desktop and mobile cell layouts and expose them as CSS custom properties

The current layout model is therefore not only section-level. Some responsive layout decisions are carried by object HTML and `data-*` attributes that later influence runtime reflow.

## 6. Known Implicit Assumptions in the Code

- The preview controller assumes a mounted editor runtime can expose `window.canvasEditor.ensureInlineEditSettledBeforeCriticalAction`. If that bridge method is unavailable, the inline critical boundary returns a failure result and preview does not continue.
- The preview flush boundary assumes the active editable session is the Konva editor path. If `editorMode !== "konva"` or there is no usable slug, flush is treated as skipped.
- The snapshot overlay path assumes the render-state boundary consists of four top-level fields: `objetos`, `secciones`, `rsvp`, and `gifts`. Those are the only fields replaced by `overlayLiveEditorSnapshot`.
- The preview payload builder assumes browser-safe asset alias normalization is enough for preview generation. Publish-only preparation is intentionally left outside the preview path.
- The generator path assumes one HTML string can serve both desktop and mobile preview. The modal changes viewport size and wrapper scale, but it does not request separate desktop and mobile HTML documents.
- The generated document runtime assumes iframe/mobile preview may report unstable viewport values, so it uses embedded-context checks, `visualViewport`, and screen-dimension fallbacks to derive a more stable viewport width and height.
- The mobile smart layout runtime assumes it can improve mobile reading order and fit by mutating generated DOM positions after HTML generation. It operates on absolute nodes inside the generated document rather than on source draft data.
- The generator assumes functional CTA readiness can be derived from the object list plus root `rsvp` and `gifts` config when a resolved CTA contract is not passed in explicitly.
- Draft preview assumes publication-link compatibility may still require fallback reads and fallback field families when publish compatibility is enabled.
- Assumption: the template preview path uses the same generator/runtime semantics as the draft preview path after the document re-read, except where the controller explicitly disables publish compatibility and publish actions.

## 7. Areas Where Behavior Depends on Timing or Side Effects

- Inline settle is time-bounded. `ensureInlineSessionSettledBeforeCriticalAction` waits frame-by-frame and fails if the inline session remains active after `120ms`.
- Draft flush over the event transport is time-bounded. `requestEditorDraftFlush` waits for `editor:draft-flush:result` and fails on timeout after `6000ms`.
- Preview session state depends on stale-request guards. `useDashboardPreviewController` creates request keys and checks `assertCurrentPreviewSession` after async boundaries so older preview work cannot overwrite newer state.
- Preview opens before HTML exists. `generarVistaPrevia` commits `buildDashboardPreviewOpenedState()` before the HTML generator resolves, so the modal can render its loading state first and receive HTML later.
- Snapshot capture is a side effect of successful flush. The compatibility snapshot used for overlay is only captured after the flush boundary returns success.
- Re-read and overlay are separate phases. The preview source document is re-read first and the live snapshot is overlaid afterward, so the final preview input is not identical to either the persisted document or the live editor state by itself.
- The iframe document receives post-load mutations. `ModalVistaPrevia` mutates iframe document attributes and styles after load, writes preview metadata into the iframe window, and dispatches `preview:mobile-scroll:enable` plus `resize`.
- Generated HTML layout depends on runtime events. The generated document recomputes viewport-derived layout on `load`, `resize`, `visualViewport` events, and `orientationchange`.
- Preview-only scroll behavior depends on a custom event. The mobile preview scroll runtime waits for `preview:mobile-scroll:enable`, which is dispatched from the parent preview modal after iframe load.
- Template preview patch behavior depends on `postMessage`. The preview patch runtime listens for `template-preview:apply`, applies DOM/text operations, and may defer scroll work through `requestAnimationFrame`.
- Mobile smart layout depends on post-generation DOM reflow. The runtime restores baseline node styles, clusters absolute elements, reorders them for mobile reading, and can expand fixed section heights after the original HTML has already been generated.
