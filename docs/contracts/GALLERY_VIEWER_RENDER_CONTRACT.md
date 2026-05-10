# Gallery Viewer Render Contract

Status: Implemented core contract. This document owns Gallery generated HTML, preview/publish behavior, and public viewer/lightbox behavior. It depends on [GALLERY_SYSTEM_CONTRACT.md](GALLERY_SYSTEM_CONTRACT.md) for invariants and on [GALLERY_LAYOUT_PRESETS_CONTRACT.md](GALLERY_LAYOUT_PRESETS_CONTRACT.md) for layout visibility rules.

## Current Preview / Publish Behavior

**Current:** Draft-authoritative preview and publish share backend preparation through `prepareRenderPayload(...)` and generated HTML.

**Current:** Template/fallback preview is visual-only and must not be treated as publish parity.

**Current:** `functions/src/utils/generarHTMLDesdeObjetos.ts` renders Gallery cells.

**Current:** Clickable Gallery image cells use:

- `class="galeria-celda galeria-celda--clickable"`
- `data-index="{cell index}"`
- `data-gallery-image="1"`
- `data-gallery-id="{gallery object id}"`
- `data-gallery-cell-index="{local populated/slot index}"`
- `data-gallery-media-key="{resolved media identity}"`
- `role="button"`
- `tabindex="0"`

**Current:** If stable `cell.id` exists, clickable cells also include `data-gallery-cell-id="{cell id}"`.

**Current:** Empty fixed Gallery cells do not include `data-gallery-image="1"`.

**Current:** Generated HTML uses `cell.mediaUrl` for Gallery image `src`. Legacy `url` and `src` cells must be normalized into `mediaUrl` before or during the prepared render path.

**Current:** `functions/src/utils/generarModalGaleria.ts` includes the Gallery modal only when `hayGaleriaConImagenes(...)` finds a Gallery cell with non-empty `mediaUrl`.

**Current:** The public lightbox collects `.galeria-celda[data-gallery-image="1"]` across the generated invitation DOM and opens one global de-duplicated `images` list.

**Current:** Publish validation can block unresolved Gallery media with `gallery-media-unresolved`.

## Global Viewer Scope

**Current:** "Global" means all clickable Gallery cells present in the generated invitation HTML runtime DOM.

**Current:** It does not mean all uploaded images, all editor image-library assets, or editor-only transient state.

**Current:** It is not limited to the currently visible viewport or scroll position. For v1, it means the whole generated invitation HTML document, including all rendered sections/pages that expose clickable Gallery cells.

**Future:** If a future public runtime introduces mutually exclusive pages that should scope the viewer to only the active page, that is a separate product decision and is out of scope for this contract.

**Future:** If runtime personalization or mobile layout code changes the live generated DOM, the viewer collection should be derived from the live generated DOM after Gallery cells exist.

**Current:** Hidden preserved photos from a layout with fewer visible cells are not included unless they are rendered as clickable Gallery cells. V1 global viewer collection is generated clickable DOM only.

## Generated HTML Markers

Every clickable Gallery cell includes:

- `class="galeria-celda"`
- `data-gallery-image="1"`
- `data-gallery-id="{gallery object id}"`
- `data-gallery-cell-index="{local populated/slot index}"`
- `data-gallery-media-key="{resolved media identity}"`

If stable `cell.id` exists, clickable cells also include:

- `data-gallery-cell-id="{cell id}"`

The `<img>` inside each cell remains the render source for the displayed photo.

Empty fixed Gallery cells must not include `data-gallery-image="1"`.

## Global Collection Order

**Current:** The public runtime collects clickable Gallery cells across the generated invitation HTML with a document-order query equivalent to:

```js
document.querySelectorAll(".galeria-celda[data-gallery-image='1']")
```

**Current:** Collection order is DOM order:

1. section/page DOM order in the generated invitation HTML
2. Gallery DOM order inside each section/page
3. clickable Gallery cell DOM order inside each Gallery

**Current:** DOM order is the public viewer authority. The viewer must not rebuild ordering from editor-only arrays at runtime.

## Media Identity and De-duplication

**Current:** Media identity for de-duplication uses this precedence:

1. `data-gallery-media-key`
2. normalized image `currentSrc`
3. normalized image `src`

**Current:** The media key emitted into HTML is resolved from source data with this precedence:

1. normalized `storagePath`
2. normalized `assetId`
3. normalized absolute `mediaUrl`

**Current:** When `storagePath` is missing, de-duplication falls back to `assetId`, then normalized absolute `mediaUrl`.

**Future:** If two cells point to the same underlying asset but only have different signed/download URLs and no shared `storagePath` or `assetId`, they are not guaranteed to de-duplicate.

**Current:** De-duplication is stable. First occurrence in global DOM order wins; later duplicates map to that canonical item.

## Clicked-Photo Mapping

**Current:** On click or keyboard activation, the runtime resolves the clicked cell's media identity.

**Current:** The viewer opens at the first global item matching that identity.

**Future:** If no identity is available, the runtime may fall back to the clicked cell's position in the collected document-order list.

**Current:** Clicking a duplicate opens the canonical first retained viewer item for that photo.

**Current:** Keyboard activation preserves current Enter/Space behavior.

## Mobile Behavior

**Current:** Mobile uses the same global collection, de-duplication, and order as desktop.

**Future:** Swipe/navigation behavior may remain as the current lightbox interaction model, but it must navigate the global de-duplicated collection.

**Future:** Mobile preview parity must use the draft-authoritative preview path when evaluating publish behavior.

## Preview / Publish Parity

**Current:** Draft-authoritative preview and publish use the same generated Gallery markers and global viewer runtime.

**Future:** Template/fallback preview may remain visual-only, but must not be used to claim global viewer publish parity.

**Current:** Global viewer changes did not introduce a separate public viewer pipeline. The viewer remains generated as part of invitation HTML.

**Current:** Publish validation continues blocking unresolved Gallery media with `gallery-media-unresolved`.

## Viewer Testing Anchors

- Multiple Galleries render with Gallery id, cell id/index, and media key markers.
- Empty fixed cells do not become clickable viewer items.
- Global viewer collects all generated clickable Gallery cells in DOM order.
- Global viewer de-duplicates repeated photos by media identity.
- Clicking a duplicate opens the canonical first retained item.
- Missing `storagePath` falls back to `assetId`, then normalized `mediaUrl`.
- Keyboard Enter/Space still opens the viewer.
- Mobile preview/publish parity preserves global order and de-duplication.
- Legacy `url` / `src` cells normalize before generated HTML depends on `mediaUrl`.
- Unresolved Gallery media still blocks publish with `gallery-media-unresolved`.
