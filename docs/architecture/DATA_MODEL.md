# DATA MODEL

## 1. Overview
The data model is the contract that keeps three different runtimes aligned:

1. The editor runtime in React + Konva.
2. Firestore persistence in `borradores`.
3. HTML generation for preview and publication.

In the current codebase, the canonical invitation render state is a Firestore draft document with four render fields:

- `objetos`
- `secciones`
- `rsvp`
- `gifts`

Everything else on the same draft document is auxiliary metadata. This distinction is critical because `normalizeDraftRenderState` explicitly discards non-render fields and returns only those four keys for editor, preview, and publish flows.

The system is only compatible with the modern array-based model. Legacy drafts based on `contenido` are still present in the repository, but the current dashboard editor treats them as incompatible.

## 2. Root Structure (Borrador / Invitacion)
The current root model has three layers:

1. Canonical render state stored in `borradores/{slug}`.
2. Auxiliary draft metadata stored on the same Firestore document.
3. Publication metadata stored separately in `publicadas/{publicSlug}` after publish.

### Canonical Render State
This is the only part of the draft document that `normalizeDraftRenderState` keeps:

| Field | Where Stored | Used By | Status |
| --- | --- | --- | --- |
| `objetos` | `borradores/{slug}` | editor, preview, publish | Canonical render array. Required for modern draft compatibility. |
| `secciones` | `borradores/{slug}` | editor, preview, publish | Canonical render array. Required for modern draft compatibility. |
| `rsvp` | `borradores/{slug}` | editor, preview, publish | Optional root config. Normalized before save and before publish. |
| `gifts` | `borradores/{slug}` | editor, preview, publish | Optional root config. Normalized before save and before publish. |

Normalized render shape:

```ts
{
  objetos: any[],
  secciones: any[],
  rsvp: object | null,
  gifts: object | null,
}
```

### Auxiliary Draft Metadata
These fields coexist with the render state in `borradores/{slug}`, but they are not part of the canvas schema consumed by `normalizeDraftRenderState`.

| Field | Used By | Status / Notes |
| --- | --- | --- |
| `slug` | draft creation, UI routing | Auxiliary metadata. Draft identifier. |
| `userId` | ownership, list queries, publish | Auxiliary metadata. Required for ownership checks. |
| `plantillaId` | template-derived drafts, publish | Auxiliary metadata. Links a draft back to its template. |
| `editor` | draft creation, template workspace | Auxiliary metadata. Modern draft creation writes `"konva"`. |
| `nombre` | dashboard UI, publication metadata | Auxiliary metadata. Human-readable title. |
| `tipoInvitacion` | UI, template workflows | Auxiliary metadata. Modern invitation-type field, normalized to values such as `boda`, `quince`, `cumple`, `empresarial`, `general`. |
| `tipo` | publish and template compatibility flows | Auxiliary compatibility metadata. Some server flows still read this instead of `tipoInvitacion`. |
| `plantillaTipo` | publish compatibility flow | Auxiliary compatibility metadata. Current publish code still checks it as a fallback for publication `tipo`. |
| `portada` | dashboard/template UI | Auxiliary metadata. Preview image candidate. |
| `thumbnailUrl` | dashboard UI | Auxiliary metadata. Another preview image candidate. |
| `previewUrl` | dashboard/template preview UI | Auxiliary metadata. Also treated as a preview-image candidate. |
| `thumbnailUpdatedAt` | draft listing UI | Auxiliary metadata. Used as a thumbnail cache-busting/version source. |
| `estadoBorrador` | trash lifecycle | Auxiliary metadata. Current code resolves `borrador_activo` and `borrador_papelera`. |
| `enPapeleraAt` | trash lifecycle | Auxiliary metadata. Trash timestamp. |
| `eliminacionDefinitivaAt` | trash lifecycle | Auxiliary metadata. Scheduled hard-delete timestamp. |
| `slugPublico` | draft-publication link | Auxiliary metadata. Active public slug for the draft. |
| `publicationLifecycle` | draft-publication link | Auxiliary metadata. Current code reads fields such as `state`, `activePublicSlug`, `firstPublishedAt`, `expiresAt`, `lastPublishedAt`, `finalizedAt`. |
| `ultimaPublicacion` | publish lifecycle | Auxiliary metadata. Last publication timestamp. |
| `ultimaOperacionPublicacion` | publish lifecycle | Auxiliary metadata. Current publish flow writes the operation used (`new` or `update`). |
| `publicationFinalizedAt` | publish lifecycle | Auxiliary metadata. Finalization timestamp when a publication is closed. |
| `publicationFinalizationReason` | publish lifecycle | Auxiliary metadata. Finalization reason string. |
| `lastPaymentSessionId` | publication payment flow | Auxiliary metadata. Latest payment session attached to the draft/publication. |
| `templateWorkspace` | template editor sessions | Auxiliary metadata. Template workspace state, not invitation render state. |
| `templateAuthoringDraft` | template authoring | Auxiliary metadata. Field-authoring payload, not invitation render state. |
| `templateInput` | template personalization flow | Auxiliary metadata. Stores applied input values and apply report. |
| `draftContentMeta` | source-of-truth tracking | Auxiliary metadata. Writes `policyVersion`, `canonicalSource`, `lastWriter`, optional `lastReason`, and `updatedAt`. |
| `ultimaEdicion` | UI ordering, persistence | Auxiliary metadata. Current editor updates it on save. |
| `creado` / `createdAt` / `updatedAt` | draft creation and maintenance | Auxiliary metadata. Observed in different creation and lifecycle flows. |

Preview metadata is not fully canonical today. Draft preview helpers still scan these compatibility keys when looking for an image candidate:

- `thumbnailUrl`
- `thumbnailurl`
- `thumbnail_url`
- `thumbnailURL`
- `portada`
- `previewUrl`
- `previewurl`
- `preview_url`
- `previewURL`

`draftContentMeta` is especially important because it records how the render state was last written:

- `policyVersion`
- `canonicalSource`
- `lastWriter`
- `lastReason`
- `updatedAt`

Current `lastWriter` values come from `buildDraftContentMeta` and are limited to:

- `modal`
- `canvas`
- `system`
- `publish`

### Publication Metadata (`publicadas/{publicSlug}`)
Publishing does not copy `objetos` or `secciones` into `publicadas`. It generates HTML from the draft render state, stores the HTML in Storage, and writes a metadata document separately.

Observed publication fields include:

| Field | Where Stored | Status / Notes |
| --- | --- | --- |
| `slug` | `publicadas/{publicSlug}` | Public invitation identifier. |
| `userId` | `publicadas/{publicSlug}` | Owner UID. |
| `plantillaId` | `publicadas/{publicSlug}` | Optional template link. |
| `urlPublica` | `publicadas/{publicSlug}` | Public URL. |
| `nombre` | `publicadas/{publicSlug}` | Display name copied from the draft. |
| `tipo` | `publicadas/{publicSlug}` | Publication metadata field. Current publish code derives it from `tipoInvitacion`, then falls back to `tipo`, then `plantillaTipo`, and normalizes the result through `normalizeInvitationType`. |
| `portada` | `publicadas/{publicSlug}` | Published preview image. |
| `invitadosCount` | `publicadas/{publicSlug}` | Auxiliary publication metric. |
| `rsvp` | `publicadas/{publicSlug}` | Normalized published RSVP config. |
| `gifts` | `publicadas/{publicSlug}` | Normalized published gifts config. |
| `estado` | `publicadas/{publicSlug}` | Publication state metadata. Backend lifecycle interpretation does not rely on `estado` alone; the current source of truth is `functions/src/payments/publicationLifecycle.ts`. |
| `publicadaAt` / `publicadaEn` | `publicadas/{publicSlug}` | Primary first-publication timestamps for active publication docs. Backend timeline helpers use these first and only fall back to lifecycle timestamps in callers that explicitly opt into that compatibility path. |
| `venceAt` / `vigenteHasta` | `publicadas/{publicSlug}` | Primary expiration timestamps. Backend lifecycle interpretation currently treats `venceAt ?? vigenteHasta` as the stored expiration input before any lifecycle/date-derived fallback. |
| `ultimaPublicacionEn` | `publicadas/{publicSlug}` | Latest publish timestamp. |
| `pausadaAt` | `publicadas/{publicSlug}` | Pause timestamp when applicable. |
| `enPapeleraAt` | `publicadas/{publicSlug}` | Trash timestamp when applicable. |
| `borradorSlug` | `publicadas/{publicSlug}` | Back-reference to the draft. |
| `ultimaOperacion` | `publicadas/{publicSlug}` | Publish operation metadata. |
| `lastPaymentSessionId` | `publicadas/{publicSlug}` | Payment linkage. |
| `iconUsage` / `iconUsageMeta` | `publicadas/{publicSlug}` | Publication-time icon analytics. |
| `slugOriginal` | `publicadas/{publicSlug}` | Optional original draft slug when draft slug and public slug differ. |

Relationship summary:

- `borradores/{slug}` is the canonical editable source.
- `publicadas/{publicSlug}` is a publication wrapper and lifecycle record.
- `publicadas/{publicSlug}` is not a fallback source for `objetos` or `secciones`.
- Published HTML is stored separately at `publicadas/{publicSlug}/index.html` in Firebase Storage.

### Backend Lifecycle Interpretation
The current backend source of truth for publication lifecycle interpretation is `functions/src/payments/publicationLifecycle.ts`.

That module currently centralizes:
- raw public-state resolution
- backend state resolution
- effective expiration inputs
- publication-date resolution used by backend lifecycle flows
- public accessibility inputs
- trash-purge input derivation

Current backend interpretation rules that matter for this model:
- public access checks in `functions/src/index.ts` first gate on the resolved raw public state and public accessibility, then separately reject/finalize expired publications
- effective expiration is currently resolved from `venceAt ?? vigenteHasta`, then `publicationLifecycle.expiresAt`, then derived publication-date inputs when the caller uses that derived path
- trash purge derivation currently uses `venceAt ?? vigenteHasta`, and if those fields are missing the backend purge path derives the purge input from publication-date inputs rather than from `publicationLifecycle.expiresAt`

## 3. Sections Model
Sections are stored in the `secciones` array inside the draft document. The editor and the HTML generator both sort sections by `orden`.

### Section Fields
| Field | Status | Notes |
| --- | --- | --- |
| `id` | Required in modern flow | Stable section identifier. Objects reference it through `seccionId`. |
| `orden` | Required in modern flow | Sorting key used by editor and HTML generator. |
| `altura` | Required in practice | Section height in editor pixels. Helpers still fall back to default heights when absent. |
| `fondo` | Required in practice | Base background value. Usually a color string. Background normalizers fall back to `#ffffff`. |
| `tipo` | Optional | Section classification used by creation/workflow code. |
| `altoModo` | Optional but behavior-critical | Section layout mode. Current code uses values such as `pantalla` and `fijo`. |
| `alturaFijoBackup` | Optional | Backup fixed height when toggling section modes. |
| `fondoTipo` | Optional | Base background kind. Current HTML generator checks `"imagen"` explicitly. |
| `fondoImagen` | Optional | Base background image URL/path. |
| `fondoImagenOffsetX` | Optional | Base image X offset. |
| `fondoImagenOffsetY` | Optional | Base image Y offset. |
| `fondoImagenScale` | Optional | Base image scale. Section normalizers clamp it to `>= 1`. |
| `fondoImagenDraggable` | Optional | Editor-only background interaction flag. |
| `decoracionesFondo` | Optional but normalized | Background decoration payload normalized to `{ items, parallax }`. |
| `decoracionesBorde` | Optional but normalized | Section edge decoration payload for top/bottom viewport-width ornaments. |

### Background Decoration Payload
Current section background normalizers convert `decoracionesFondo` into this shape:

```ts
{
  items: BackgroundDecoration[],
  parallax: "none" | "soft" | "dynamic",
}
```

Each normalized background decoration item uses:

| Field | Status | Notes |
| --- | --- | --- |
| `id` | Required after normalization | Stable decoration identifier. |
| `decorId` | Optional | Catalog/reference identifier when present. |
| `src` | Required after normalization | Decoration image URL/path. |
| `storagePath` | Optional | Storage path used by publish-time URL resolution. |
| `nombre` | Optional with fallback | Human-readable label. Falls back to `"Decoracion"`. |
| `x` | Required after normalization | Section-local X position. |
| `y` | Required after normalization | Section-local Y position. |
| `width` | Required after normalization | Decoration width. |
| `height` | Required after normalization | Decoration height. |
| `rotation` | Required after normalization | Rotation in degrees. |
| `orden` | Required after normalization | Decoration stacking/order index. |

### Edge Decoration Payload
`decoracionesBorde` is a section-owned render primitive for top/bottom edge ornaments, not an object and not a full-section background. The current shape is:

```ts
{
  top?: EdgeDecorationSlot,
  bottom?: EdgeDecorationSlot,
  layout?: {
    maxCombinedSectionRatioDesktop?: number | null,
    maxCombinedSectionRatioMobile?: number | null,
  },
}

type EdgeDecorationSlot = {
  enabled?: boolean,
  src: string,
  storagePath?: string | null,
  decorId?: string | null,
  nombre?: string | null,
  heightModel?: "intrinsic-clamp" | "ratio-band",
  intrinsicWidth?: number | null,
  intrinsicHeight?: number | null,
  minHeightDesktopPx?: number | null,
  maxHeightDesktopPx?: number | null,
  maxSectionRatioDesktop?: number | null,
  minHeightMobilePx?: number | null,
  maxHeightMobilePx?: number | null,
  maxSectionRatioMobile?: number | null,
  heightDesktopRatio?: number | null,
  heightMobileRatio?: number | null,
  offsetDesktopPx?: number | null,
  offsetMobilePx?: number | null,
  mode?: "cover-x" | "contain-x",
}
```

Rules:

- `top` and `bottom` are the only supported slots.
- Missing slot or `enabled === false` does not render.
- Enabled slots require a publish-ready `src` after prepared-payload asset normalization; otherwise validation can block trusted preview/publish with `section-edge-decoration-unresolved`.
- Edge decorations render as section layers inside generated HTML, not as `.objeto` nodes and not as mobile smart-layout units.
- Default edge sizing uses `heightModel: "intrinsic-clamp"`: full-viewport width first, intrinsic aspect ratio when known, desktop/mobile min/max pixel caps, per-slot section-ratio caps, and a combined top+bottom section budget.
- Default sizing values are desktop `96..280px`, max `0.30` per slot, combined `0.58`; mobile `64..150px`, max `0.24` per slot, combined `0.40`.
- `heightDesktopRatio` and `heightMobileRatio` remain legacy/advanced fallback inputs. When `heightModel: "ratio-band"` is explicit, the renderer uses the ratio-band behavior instead of intrinsic clamp.
- Offsets are explicit pixel offsets per desktop/mobile mode; default is `0`.
- Offset convention is slot-relative: positive `top.offsetDesktopPx` moves the top decoration down into the section, while positive `bottom.offsetDesktopPx` moves the bottom decoration up into the section. Negative values move outward.
- Current canvas interaction edits `offsetDesktopPx` only. `offsetMobilePx` is preserved separately and is not changed by the desktop canvas drag overlay.
- `mode: "cover-x"` is the default. It fills the resolved edge band and preserves the content-facing side when controlled crop is needed. `mode: "contain-x"` preserves the full artwork inside the same band and may leave unused space.
- Normalization clamps ratios, min/max heights, combined budgets, intrinsic dimensions, and offsets. Offsets are clamped to `-240..240px`.

Important section rules:

- The stage/editor derives absolute section offsets at runtime. Offsets are not stored per object.
- Section visuals live on `secciones`, not in `objetos`.
- `altoModo: "fijo"` starts from persisted `altura`; mobile smart layout can expand the generated section at runtime when content needs more height.
- `altoModo: "pantalla"` uses viewport-height behavior and `yNorm` placement; it is not processed as a fixed-section smart-layout reflow.
- Mobile smart layout records runtime height interpretation with `data-msl-height-model` values such as `publish-like`, `publish-like-pending`, and `embedded-preview`. This marker is generated/runtime state, not Firestore data.
- `decoracionesFondo` supports legacy shapes (`superior` / `inferior`) but normalizes them into `items`.
- `decoracionesBorde` is independent from `decoracionesFondo`: use it for top/bottom full-width ornaments, not arbitrary positioned decorations.
- `fondo` can still act as a legacy image background fallback when it contains an image-like URL string.
- The normative image role and conversion contract lives in `docs/contracts/IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md`. When a normal `tipo: "imagen"` object is converted into a section-owned visual role, the original object must be removed from `objetos`; the section field becomes the single owner of that visual.
- Role-gated authoring is an editor UI rule, not a Firestore schema distinction. Regular users can author `Imagen (contenido)` and `Fondo de la sección`; `Decoración`, `Decoración arriba`, and `Decoración abajo` creation/management controls are visible only to admin/superadmin users. Existing `decoracionesFondo` and `decoracionesBorde` data remains valid and renderable regardless of the viewing user's role.

## 4. Elements Model
Elements are stored in the `objetos` array. The HTML generator groups them by `seccionId`, then splits each section into:

- bleed objects where `anclaje === "fullbleed"`
- content objects for all other values

### Shared Element Fields
| Field | Status | Notes |
| --- | --- | --- |
| `id` | Required in editor/runtime | Stable object identifier used by selection, history, and HTML `data-obj-id`. |
| `tipo` | Required | Primary object family selector. |
| `seccionId` | Required for rendering/publication | Links the object to its parent section. This is required in practice by grouping/render logic, even though `normalizeDraftRenderState` does not enforce referential integrity. |
| `x` | Required in practice | Section-local X in editor pixels. |
| `y` | Optional with fallback | Section-local Y in editor pixels. In `pantalla` mode it can be replaced by `yNorm`. |
| `yNorm` | Optional, section-mode-specific | Normalized Y used for `altoModo: "pantalla"` sections. |
| `rotation` | Optional with fallback | Rotation in degrees. Fallback is `0`. |
| `scaleX` | Optional with fallback | Horizontal scale. Fallback is `1`. |
| `scaleY` | Optional with fallback | Vertical scale. Fallback is `1`. |
| `anclaje` | Optional | `fullbleed` moves the object into the bleed layer and changes scaling rules in HTML. |
| `zIndex` | Optional | HTML generator applies it when present, but editor stacking mainly follows `objetos` array order. |
| `enlace` | Optional | If present, HTML wraps the object in an anchor. Accepts a string or `{ href, target, rel }`. |
| `role` / `rol` | Optional | Semantic role override used by motion/runtime data attributes. |
| `motionEffect` | Optional | Motion effect hint used by generated HTML runtime data attributes. |

### `texto`
Current text objects use these fields:

| Field | Status | Notes |
| --- | --- | --- |
| `texto` | Required in practice | Text content. Fallback is an empty string. |
| `width` | Optional but important | Controls wrapping width in both editor and HTML. |
| `fontSize` | Optional with fallback | Default HTML fallback is `24`. |
| `fontFamily` | Optional with fallback | Default fallback is `sans-serif`. |
| `fontWeight` | Optional with fallback | Default fallback is `normal`. |
| `fontStyle` | Optional with fallback | Default fallback is `normal`. |
| `textDecoration` | Optional with fallback | Default fallback is `none`. |
| `align` / `textAlign` | Optional with fallback | HTML normalizes to left/center/right behavior. |
| `lineHeight` | Optional with fallback | HTML derives a safe line-height when absent. |
| `letterSpacing` | Optional | Preserved into HTML. |
| `colorTexto` / `color` / `fill` | Optional with fallback | Current save path normalizes `texto` color compatibility fields. |
| `stroke` | Optional | Preserved into HTML with `strokeWidth`. |
| `strokeWidth` | Optional | Text stroke width. |
| `shadowColor` | Optional | Text shadow color. |
| `shadowBlur` | Optional | Text shadow blur. |
| `shadowOffsetX` / `shadowOffsetY` | Optional | Text shadow offsets. |
| `mobileTextScaleMode` | Optional | HTML recognizes `inherit`, `lock`, `custom`. |
| `mobileTextScaleMax` | Optional | Used when `mobileTextScaleMode === "custom"`. |

### `imagen`
Current image objects use:

| Field | Status | Notes |
| --- | --- | --- |
| `src` | Required for stable publish behavior | Main image URL/path. Publish-time URL resolution only rewrites `src`. |
| `url` | Optional fallback | HTML generator uses `src || url`. |
| `width` | Optional | HTML renders it when present. |
| `height` | Optional | HTML renders it when present. |
| `ancho` | Optional but required for crop-safe publish | Source image width used to materialize crop consistently in preview/publish HTML. |
| `alto` | Optional but required for crop-safe publish | Source image height used to materialize crop consistently in preview/publish HTML. |
| `cropX` | Optional | Source-space crop origin X used by canvas and HTML generation. |
| `cropY` | Optional | Source-space crop origin Y used by canvas and HTML generation. |
| `cropWidth` | Optional | Source-space crop width. |
| `cropHeight` | Optional | Source-space crop height. |

### `icono`
Current icon objects have two active branches:

| Field | Status | Notes |
| --- | --- | --- |
| `src` / `url` | Optional branch | Raster-like icon path/URL when `formato !== "svg"`. |
| `width` / `height` | Optional with fallback | HTML falls back to `24` for inline SVG branch. |
| `color` | Optional with fallback | Used by inline SVG rendering. |
| `formato` | Optional branch selector | `svg` enables inline SVG rendering. |
| `paths` | Required for inline SVG branch | Array of `{ d }` path objects. |
| `viewBox` | Optional with fallback | SVG view box. |

### `icono-svg` (legacy)
Legacy icon objects still publish if they carry:

| Field | Status | Notes |
| --- | --- | --- |
| `d` | Required for this branch | SVG path string. |
| `viewBox` | Optional with fallback | SVG view box. |
| `color` | Optional with fallback | Fill color. |
| `width` / `height` | Optional with fallback | Size in editor pixels. |

### `forma`
`forma` is a shared family keyed by `figura`.

Shared shape-style fields observed in editor/generator:

- `figura`
- `color`
- `stroke`
- `strokeWidth`
- `rotation`
- `scaleX`
- `scaleY`

Branch-specific fields:

| `figura` | Fields Used | Notes |
| --- | --- | --- |
| `rect` | `width`, `height`, `cornerRadius`, optional `texto`, `fontSize`, `fontFamily`, `fontWeight`, `fontStyle`, `textDecoration`, `align`, `colorTexto` | HTML generator supports text inside rectangular shapes. |
| `circle` | `radius`, `color` | HTML generator treats `x` and `y` as center-based for the published DOM conversion. |
| `line` | `points`, `strokeWidth`, `color` | `points` is a 4-number array `[x1, y1, x2, y2]` interpreted relative to object origin. |
| `triangle` | `radius`, `color` | HTML generator derives triangle box geometry from `radius`. |

Important compatibility note:

- The current editor runtime and the current HTML generator both implement these `forma.figura` branches: `rect`, `circle`, `pill`, `line`, `triangle`, `diamond`, `star`, `arrow`, `pentagon`, `hexagon`, and `heart`.
- Publish validation also treats those figures as the currently supported shape set.
- Assumption: fine-grained visual equivalence for the less common published shapes (`diamond`, `star`, `arrow`, `pentagon`, `hexagon`, `heart`) still requires manual verification beyond the current characterization coverage.

### `galeria`
Gallery objects use:

| Field | Status | Notes |
| --- | --- | --- |
| `rows` | Optional with fallback | Fixed-grid row count. |
| `cols` | Optional with fallback | Fixed-grid column count. |
| `gap` | Optional with fallback | Cell gap in pixels. |
| `radius` | Optional with fallback | Cell corner radius. |
| `width` | Required in practice | Base width for layout generation. |
| `height` | Optional | Used directly in fixed layout and as fallback in dynamic layout. |
| `ratio` | Optional | Layout ratio input. |
| `cells` | Optional but central | Array of gallery cells. |
| `galleryLayoutMode` | Optional | Current code recognizes `fixed` and `dynamic_media`. |
| `galleryLayoutType` | Optional | Dynamic layout subtype. |
| `galleryLayoutBlueprint` | Optional | Dynamic layout blueprint object used by the shared gallery layout resolver. |

Gallery cell payload:

| Field | Status | Notes |
| --- | --- | --- |
| `mediaUrl` | Preferred | Main cell media URL. |
| `url` / `src` | Compatibility fallback | Dynamic gallery rendering falls back to these when `mediaUrl` is absent. |
| `fit` | Optional | `cover` or `contain`. |
| `bg` | Optional | Cell background color. |

### `countdown`
Countdown objects have two active data shapes:

1. Legacy / v1 countdowns.
2. Schema v2 countdowns when `countdownSchemaVersion >= 2`.

Observed countdown fields:

| Field Group | Fields |
| --- | --- |
| Target date | `targetISO`, legacy `fechaObjetivo`, legacy `fechaISO` |
| Versioning | `countdownSchemaVersion`, `presetId`, legacy `layout` |
| Geometry | `width`, `height`, `tamanoBase`, `gap`, `paddingX`, `paddingY`, `chipWidth`, `boxRadius`, `framePadding` |
| Layout | `visibleUnits`, `distribution`, `layoutType`, `separator` |
| Typography | `fontFamily`, `fontSize`, `labelSize`, `letterSpacing`, `lineHeight`, `showLabels`, `labelTransform` |
| Styling | `color`, `labelColor`, `boxBg`, `boxBorder`, `separatorColor`, `frameSvgUrl`, `frameColor`, `frameColorMode` |
| Runtime animation | `entryAnimation`, `tickAnimation`, `frameAnimation` |
| Audit/debug | `countdownAuditTraceId`, `countdownAuditFixture`, `countdownAuditLabel` |

Legacy v1 countdowns may also use a `labels` object such as:

```ts
{
  dias: string,
  horas: string,
  min: string,
  seg: string,
}
```

### `rsvp-boton` and `regalo-boton`
CTA button objects share the same visual model:

| Field | Status | Notes |
| --- | --- | --- |
| `texto` | Optional with fallback | Button label. HTML falls back to invitation-specific defaults. |
| `width` / `height` | Optional with fallback | Button size. |
| `fontSize` | Optional with fallback | Button typography size. |
| `fontFamily` | Optional with fallback | Button font family. |
| `fontWeight` | Optional with fallback | Button font weight. |
| `fontStyle` | Optional with fallback | Button font style. |
| `textDecoration` | Optional with fallback | Button text decoration. |
| `align` | Optional with fallback | Button text alignment. |
| `cornerRadius` | Optional with fallback | Button radius. |

Important rule:

- The button object only stores canvas-level visual data.
- The RSVP form data lives in root `rsvp`.
- The gifts/bank data lives in root `gifts`.

## 5. Common Properties and Conventions
### Positioning System
- Object coordinates are section-local.
- The editor computes absolute stage Y by adding section offsets at runtime.
- The HTML generator never stores section offsets in the object. It regenerates layout from `secciones` plus section-local object coordinates.

### `altoModo` and `yNorm`
- `altoModo: "pantalla"` changes Y behavior.
- In that mode, `yNorm` can become the canonical vertical input for generated HTML.
- The HTML generator uses `yNorm * ALTURA_EDITOR_PANTALLA` as the source of truth when `yNorm` exists.
- If `yNorm` is missing, the system falls back to `y`.

### `anclaje`
- `anclaje: "fullbleed"` moves an object into the bleed layer in published HTML.
- Full-bleed objects use different scaling variables than section-content objects.

### Units
- `x`, `y`, `width`, `height`, `radius`, `gap`, offsets, and padding values are editor-pixel values.
- `rotation` is stored in degrees.
- `scaleX` and `scaleY` store object scaling multipliers.

### IDs and Ownership
- Section ownership is explicit through `obj.seccionId`.
- Section sorting is explicit through `seccion.orden`.
- `id` values are used as runtime identity keys, not as array indexes.

### Stacking and Order
- The editor's current z-order contract is the order of items in `objetos`.
- The HTML generator can still apply `zIndex` if present, but it is not the main ordering source in the editor.

### Semantic and Runtime Conventions
- `role` / `rol` can override semantic role inference for motion/runtime attributes.
- `motionEffect` is sanitized into the HTML runtime as `data-motion`.
- `enlace` wraps an object with an anchor without changing the underlying geometry model.
- Selection boxes, hover boxes, transformer state, `pendingDragSelection`, and `dragVisualSelection` are runtime-only editor state. They are not persisted in Firestore.
- Persisted geometry fields such as `x`, `y`, `width`, `height`, and `rotation` are not always the geometry source for the visible selection box. During active drag, the controlled drag overlay uses live Konva node bounds only, while selected-phase auto bounds can still fall back to object geometry when live nodes are missing.
- For a single `texto` element, the visible hover/selection/drag box is also runtime-only and comes from the live text visual bounds, not from a separate persisted visual-box field.
- After drag end, the visible selection box can temporarily represent the last controlled live-drag snapshot during settling instead of freshly persisted object geometry.

## 6. Optional / Dynamic Fields
### Root Config: `rsvp`
Current normalized RSVP config shape on both the client and server is:

| Field | Status | Notes |
| --- | --- | --- |
| `version` | Required after normalization | Current server-side version is `2`. |
| `enabled` | Required after normalization | Boolean toggle. |
| `presetId` | Required after normalization | Current presets include `basic`, `wedding_complete`, `minimal`. |
| `limits.maxQuestions` | Required after normalization | Numeric limit. |
| `limits.maxCustomQuestions` | Required after normalization | Numeric limit. |
| `modal.title` | Required after normalization | Modal title. |
| `modal.subtitle` | Required after normalization | Modal subtitle. |
| `modal.submitLabel` | Required after normalization | Submit button label. |
| `modal.primaryColor` | Required after normalization | Hex color. |
| `questions[]` | Required after normalization | Ordered question array. |
| `questions[].id` | Required | Stable question identifier. |
| `questions[].source` | Required | `catalog` or `custom`. |
| `questions[].type` | Required | `short_text`, `long_text`, `number`, `single_select`, `boolean`, `phone`. |
| `questions[].label` | Required | Human-readable label. |
| `questions[].required` | Required | Required flag. |
| `questions[].active` | Required | Active flag. |
| `questions[].order` | Required | Ordering index. |
| `questions[].options[]` | Optional | Present for select-like questions. |
| `sheetUrl` | Optional normalized field | Preserved by both normalizers and exposed to the RSVP modal runtime for the optional secondary sheet/webhook POST. It is not read by `publicRsvpSubmit`. |

Legacy-compatible RSVP input aliases accepted by both normalizers:

| Legacy Input | Normalized Field |
| --- | --- |
| `title` | `modal.title` |
| `subtitle` | `modal.subtitle` |
| `buttonText` | `modal.submitLabel` |
| `primaryColor` | `modal.primaryColor` |

Question normalization rules that matter for compatibility:

- Only the known catalog IDs plus `custom_1` and `custom_2` are preserved.
- Custom question types normalize to `short_text` or `long_text`.
- Select option identity and `metricTag` stay template-defined; incoming option patches can only replace labels by matching option `id`.
- Missing `enabled` on an existing RSVP object normalizes as enabled/active for compatibility with published/server behavior.

### Public RSVP Submission Payload: `publicRsvpSubmit`
The public write endpoint accepts a different contract from the root RSVP config. It writes attendee responses under `publicadas/{slug}/rsvps`.

| Field | Status | Notes |
| --- | --- | --- |
| `slug` | Required | Public invitation slug. |
| `answers` | Optional structured input | Arbitrary question-id map, sanitized to primitive RSVP answer values. |
| `schemaQuestionIds` | Optional structured input | Ordered question ids for the submitted schema snapshot. Falls back to `Object.keys(answers)`. |
| `metrics` | Optional structured input | Attendance-derived summary input. The server sanitizes and recomputes the stored metric shape. |
| `nombre` | Optional legacy input | Compatibility alias for `answers.full_name`. |
| `cantidad` | Optional legacy input | Compatibility alias for `answers.party_size`. |
| `mensaje` | Optional legacy input | Compatibility alias for `answers.host_message`. |
| `asistencia` / `confirma` | Optional legacy input | Compatibility attendance aliases consumed only to mirror legacy output fields. |

Stored public RSVP records include both:

- current structured fields: `version`, `schemaVersion`, `schemaQuestionIds`, `answers`, `metrics`
- legacy mirrors: `nombre`, `asistencia`, `confirma`, `cantidad`, `mensaje`

### Root Config: `gifts`
Current normalized gifts config shape is:

| Field | Status | Notes |
| --- | --- | --- |
| `version` | Required after normalization | Current version is `1`. |
| `enabled` | Required after normalization | Boolean toggle. |
| `introText` | Required after normalization | Introductory text. |
| `bank.holder` | Required after normalization | Bank holder name, may be empty. |
| `bank.bank` | Required after normalization | Bank name, may be empty. |
| `bank.alias` | Required after normalization | Alias, may be empty. |
| `bank.cbu` | Required after normalization | CBU, may be empty. |
| `bank.cuit` | Required after normalization | CUIT, may be empty. |
| `visibility.holder` | Required after normalization | Visibility flag. |
| `visibility.bank` | Required after normalization | Visibility flag. |
| `visibility.alias` | Required after normalization | Visibility flag. |
| `visibility.cbu` | Required after normalization | Visibility flag. |
| `visibility.cuit` | Required after normalization | Visibility flag. |
| `visibility.giftListLink` | Required after normalization | Visibility flag. |
| `giftListUrl` | Required after normalization | Sanitized external URL, may be empty. |

### Template Workspace and Personalization Metadata
These fields are real Firestore data, but they are not part of the canonical invitation render state:

| Field | Notes |
| --- | --- |
| `templateWorkspace` | Template editor session metadata. Observed fields include `templateId`, `mode`, `readOnly`, `openedByUid`, `openedAt`, `lastCommittedAt`, `estadoEditorial`, `tags`, `templateName`, `permissions`. |
| `templateAuthoringDraft` | Template-authoring payload. Current workspace creation writes `version`, `sourceTemplateId`, `fieldsSchema`, `defaults`, `status`, `updatedAt`, `updatedByUid`. |
| `templateInput` | Template-personalization snapshot. Current modal flow writes `initialValues`, `values`, `defaults`, `changedKeys`, `applyReport`, `appliedAt`, `updatedAt`, `policyVersion`. |

Assumption: older template-authoring documents may carry extra nested fields. The table above describes the currently written workspace shape.

### Dynamic and Compatibility Fields
These fields are valid in the current model, but they are branch-specific rather than universal:

- `galleryLayoutMode`, `galleryLayoutType`, `galleryLayoutBlueprint`
- `countdownSchemaVersion`
- countdown audit fields
- `motionEffect`
- `role` / `rol`
- `enlace`

### Legacy-Compatible Aliases
The current generator and normalizers still read multiple legacy-compatible names:

- text color: `colorTexto`, `color`, `fill`
- text alignment: `align`, `textAlign`
- image/icon source: `src`, `url`
- gallery cell media source: `mediaUrl`, `url`, `src`
- countdown target date: `targetISO`, `fechaObjetivo`, `fechaISO`
- invitation type root metadata: `tipoInvitacion`, template/publication fallbacks such as `tipo`
- preview metadata: `thumbnailUrl`, `thumbnailurl`, `thumbnail_url`, `thumbnailURL`, `previewUrl`, `previewurl`, `preview_url`, `previewURL`, and `portada`

## 7. Firestore Representation
### `borradores`
The modern draft schema is embedded in a single Firestore document:

- no render subcollections
- no per-section child documents
- `objetos` and `secciones` stored inline as arrays
- `rsvp` and `gifts` stored inline as root objects

Current editor persistence behavior:

- `useBorradorSync` writes `objetos`, `secciones`, `rsvp`, `gifts`.
- It also writes `draftContentMeta` and `ultimaEdicion`.
- It strips `undefined` recursively before writing.
- It normalizes section decoration payloads before writing.
- It normalizes countdown geometry, line points, and text compatibility style fields before writing.

Section-level workflows can also update the same draft document directly outside the debounce cycle, including:

- section creation
- section deletion
- section reorder
- section height changes
- `altoModo` toggles

Current ordering rule:

- those direct section writes now join the same draft-write FIFO used by autosave and flush, so persistence order is serialized even though the write triggers are still split

### `publicadas`
`publicadas/{publicSlug}` is a separate Firestore metadata document written by the publish flow.

It stores:

- publication ownership and lifecycle metadata
- normalized `rsvp`
- normalized `gifts`
- back-reference to `borradorSlug`
- public URL and preview metadata

It does not store:

- `objetos`
- `secciones`
- the generated HTML itself

### `publication_checkout_sessions`
`publication_checkout_sessions/{sessionId}` stores the backend checkout/session lifecycle.

Observed fields include:

- `uid`, `draftSlug`, `operation`, `publicSlug`
- `amountBaseArs`, `amountArs`, `discountAmountArs`, `discountCode`, `discountDescription`, `currency`
- `pricingSnapshot` with `pricingVersion`, `operationType`, `appliedPrice`, `currency`
- `status`, `expiresAt`, `lastError`
- `mpPreferenceId`, `mpPaymentId`, `mpStatus`, `mpStatusDetail`
- `publicUrl`
- `receipt` with `operation`, `amountBaseArs`, `amountArs`, `discountAmountArs`, `discountCode`, `discountDescription`, `currency`, `approvedAt`, `paymentId`, `publicSlug`, `publicUrl`
- `createdAt`, `updatedAt`

Current status values in code:

- `awaiting_payment`
- `payment_processing`
- `payment_rejected`
- `payment_approved`
- `publishing`
- `published`
- `approved_slug_conflict`
- `expired`

### `public_slug_reservations`
`public_slug_reservations/{slug}` stores temporary public-slug claims for checkout flows that need a new public slug.

Observed fields include:

- `slug`, `uid`, `draftSlug`, `sessionId`
- `status`
- `expiresAt`
- `createdAt`, `updatedAt`

Current status values in code:

- `active`
- `consumed`
- `released`
- `expired`

Important behavior:

- reservation status updates are session-id-sensitive
- slug availability and update-slug resolution also inspect `publicadas/{slug}` and can finalize an expired active publication before treating a slug as reusable

### HTML Output
Published HTML is stored in Firebase Storage, not Firestore:

- `publicadas/{publicSlug}/index.html`

The HTML is always generated from draft render data, not edited in place as a Firestore document.

## 8. Data Transformation Flow
### Editor State -> Firestore -> HTML Generation
#### 1. Editor Load
Input:

- raw `borradores/{slug}` document

Transformation:

- `normalizeDraftRenderState` keeps only `objetos`, `secciones`, `rsvp`, `gifts`
- Storage-backed URLs are refreshed recursively on load
- section decoration payloads are normalized
- `rsvp` and `gifts` are normalized through dedicated config normalizers
- missing `yNorm` values are backfilled for `altoModo: "pantalla"` sections

Output:

- React state in `CanvasEditor`

#### 2. Editor Save
Input:

- live editor state: `objetos`, `secciones`, `rsvp`, `gifts`

Transformation:

- countdown geometry is flattened
- line points are validated
- text color/stroke/shadow compatibility fields are normalized
- section decorations are normalized
- `undefined` values are removed
- `draftContentMeta` and `ultimaEdicion` are updated

Output:

- updated `borradores/{slug}` document

#### 3. Preview
Input:

- publishable draft preview: owned draft read by the backend after the critical flush
- template/fallback preview: persisted template/draft re-read plus an optional critical-flush boundary snapshot

Transformation:

- preview requests a critical flush before opening
- preview re-reads the draft document or template editor document
- publishable draft preview calls `prepareDraftPreviewRender`, which uses `prepareRenderPayload(...)`, `validatePreparedRenderPayload(...)`, and `generateHtmlFromPreparedRenderPayload(...)`
- if backend validation has blockers, preview receives validation without trusted HTML
- template/fallback preview can still overlay a compatible editor boundary snapshot and call `generarHTMLDesdeSecciones(secciones, objetos, rsvp, opciones)` locally
- preview results carry explicit authority:
  - `draft-authoritative`: backend prepared draft preview, publish-faithful
  - `template-visual`: pre-draft template preview, visual-only
  - `local-fallback`: rollback/emergency local preview, visual-only

Output:

- preview HTML string when generation is allowed
- `previewAuthority` classification

#### 4. Publish
Input:

- owned draft document

Transformation:

- `normalizeDraftRenderState` extracts canonical render state
- `prepareRenderPayload(...)` resolves publish-ready assets and functional CTA state
- `validatePreparedRenderPayload(...)` classifies blockers and warnings before HTML generation
- `generateHtmlFromPreparedRenderPayload(...)` builds final HTML through `generarHTMLDesdeSecciones`
- HTML is saved to Storage
- publication metadata is written to `publicadas/{publicSlug}`
- draft-publication linkage fields are written back to `borradores/{slug}`

Output:

- `publicadas/{publicSlug}` Firestore metadata
- `publicadas/{publicSlug}/index.html` Storage file

### Consistency Rules Across Stages
- `seccionId` must keep each object attached to a valid section.
- `altoModo`, `y`, and `yNorm` must mean the same thing in editor persistence and HTML generation.
- section ordering must stay sortable by `orden`.
- root `rsvp` and `gifts` must remain root-level configs, not embedded into button objects.
- publish readiness is not inferred only from generator support. The current backend contract is `prepareRenderPayload(...)` plus `validatePreparedRenderPayload(...)`, which can produce either blockers or warnings for the same stored render fields.

## 9. Validation Rules and Constraints
These are the current code-grounded rules that must not be broken:

- Modern dashboard/editor flows require array-based `secciones` and `objetos`. Legacy `contenido` drafts are not compatible.
- `borradores` is the canonical source for render arrays. `publicadas` is not a substitute source of truth for `objetos` or `secciones`.
- Every renderable object must carry a valid `seccionId`.
- Section rendering and publication depend on sorting by `orden`.
- Background images and background decorations belong to section data, not object data.
- `altoModo: "pantalla"` and `yNorm` must stay aligned. If one changes without the other, preview/publish positioning becomes unreliable.
- `rsvp-boton` depends on root `rsvp`, and `regalo-boton` depends on root `gifts`.
- Gallery and countdown objects have specialized schemas and cannot be treated like generic shapes or text blocks.
- Line shapes depend on a valid `points` array and line-point normalization.
- Persisted payloads must stay Firestore-serializable. Current save code strips `undefined` recursively to enforce this.
- Publish-time HTML generation depends on the same render fields the editor writes. Changing field names without updating both sides is a breaking data-model change.

## 10. Known Risks and Fragile Areas
- Legacy `contenido` drafts still exist in the repository, but the modern dashboard editor rejects them as non-modern data.
- `y` vs `yNorm` drift is a real risk in `altoModo: "pantalla"` sections.
- Text color and style aliases are normalized during save. Code that assumes only one text color field is unsafe.
- `decoracionesFondo` normalization is compatibility-sensitive because it converts legacy `superior` / `inferior` structures into `items`.
- Dynamic gallery fields depend on the shared gallery layout resolver. Blueprint/schema mismatches can change published layout unexpectedly.
- Countdown v1 and v2 coexist. The data shape is not identical across those branches.
- `publicadas` metadata is not the canonical render model. Debugging publication issues against `publicadas` alone is incomplete.
- Publication metadata `tipo` is normalized from `tipoInvitacion` first, but compatibility fallbacks (`tipo`, `plantillaTipo`) still exist. Metadata drift is narrower than before, not fully eliminated.
- `public_slug_reservations` is not a pure availability index. Slug availability and update-slug resolution can expire active reservations and finalize expired publications during lookup before treating a slug as reusable.
- Storage-backed URLs are mutable across load and publish. A path or signed URL can be rewritten without changing the logical object/section identity.
- RSVP root config and `publicRsvpSubmit` use different contracts. `sheetUrl` belongs to the config/runtime path, while attendee submissions are stored from `slug` + `answers`/`metrics` with legacy mirrors. Mixing those surfaces is unsafe.
- Publish-supported shape figures now include `rect`, `circle`, `pill`, `line`, `triangle`, `diamond`, `star`, `arrow`, `pentagon`, `hexagon`, and `heart`, but manual parity checks are still prudent for the less common branches.

## 11. Compatibility and Asset Resolution
### Legacy Draft Compatibility
- Modern editor flows require the array-based render model.
- Legacy `contenido` documents are still readable by older utility code, but they are explicitly treated as incompatible by the current dashboard editor.

### Load-Time URL Refresh
- The editor load path refreshes Storage-backed URLs recursively for both `objetos` and `secciones`.
- This is done to avoid stale Firebase Storage tokens without changing the logical data model.

### Template Asset Normalization
- Template asset normalization clones private/shared Storage paths into template-safe shared asset paths.
- Current deep normalization rewrites these keys when found anywhere in the template payload: `src`, `url`, `mediaUrl`, `fondoImagen`.

### Publish-Time Asset Resolution
- Publish resolves section base images and section decoration images before generating HTML.
- Publish resolves top-level `imagen` and `icono` object `src` values when they are Storage paths.
- Publish does not perform deep asset resolution for every possible nested object field.

Practical rule:

- Storage-backed media should be persisted in the field that the publish path actually resolves.
- For top-level image/icon objects, that stable field is `src`.
- For gallery cells and other nested asset structures, URLs should already be public or already normalized before publish.

### Data Identity vs URL Identity
Storage-backed asset fields can be rewritten across load, template cloning, and publish:

- original Storage path
- refreshed download URL
- signed publication URL

Those rewrites do not mean the logical invitation element changed. The stable identity remains the draft structure:

- section `id`
- object `id`
- `seccionId`
- normalized root config identity
