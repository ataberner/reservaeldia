# Gallery System Contract

Status: Implemented core contract with known deferred preset renderers. This document is the entry point for the Gallery system contract. It describes current implementation truth, non-negotiable invariants, and links to focused subcontracts for editor behavior, layout presets, and preview/publish viewer rendering.

This is an evolution of the existing `tipo: "galeria"` system. It is not a replacement, not a new `album` object type, and not a parallel Gallery render pipeline.

## Canonical References

Use these docs as source of truth for surrounding systems:

- [ARCHITECTURE_OVERVIEW.md](../architecture/ARCHITECTURE_OVERVIEW.md)
- [EDITOR_SYSTEM.md](../architecture/EDITOR_SYSTEM.md)
- [INTERACTION_SYSTEM_CURRENT_STATE.md](../architecture/INTERACTION_SYSTEM_CURRENT_STATE.md)
- [DATA_MODEL.md](../architecture/DATA_MODEL.md)
- [PREVIEW_SYSTEM_ANALYSIS.md](../architecture/PREVIEW_SYSTEM_ANALYSIS.md)
- [RENDER_COMPATIBILITY_MATRIX.md](RENDER_COMPATIBILITY_MATRIX.md)
- [SYSTEM_FRAGILITY_MAP.md](../architecture/SYSTEM_FRAGILITY_MAP.md)
- [IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md](IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md)
- [GROUP_RENDER_MODEL.md](../architecture/GROUP_RENDER_MODEL.md)

## Focused Gallery Contracts

- [GALLERY_EDITOR_CONTRACT.md](GALLERY_EDITOR_CONTRACT.md): canvas/editor behavior, role-based authoring, sidebar behavior, selected-Gallery photo management, and the mutation boundary.
- [GALLERY_LAYOUT_PRESETS_CONTRACT.md](GALLERY_LAYOUT_PRESETS_CONTRACT.md): layout preset model, allowed layouts, default/current layout fields, responsive behavior, photo count rules, and template-level restrictions.
- [GALLERY_VIEWER_RENDER_CONTRACT.md](GALLERY_VIEWER_RENDER_CONTRACT.md): generated HTML markers, global public viewer/lightbox behavior, de-duplication, clicked-photo mapping, mobile behavior, and preview/publish parity.

Keep one canonical owner for each rule. Do not copy detailed editor rules into the viewer contract, do not copy preset schema into the editor contract, and do not copy public viewer runtime rules into the layout preset contract.

## Current Implementation Truth

**Current:** Gallery objects are normal render objects in `objetos[]` with `tipo: "galeria"`.

**Current:** Gallery objects center around `cells[]`. `mediaUrl` is the canonical render media field for populated cells. `url` and `src` are read-compatible fallbacks through `shared/renderAssetContract.cjs`.

**Current:** Gallery layout is expressed through existing fields such as `rows`, `cols`, `gap`, `radius`, `ratio`, `width`, `height`, `widthPct`, `galleryLayoutMode`, `galleryLayoutType`, and `galleryLayoutBlueprint`.

**Current:** The additive layout preset fields `allowedLayouts`, `defaultLayout`, and `currentLayout` are implemented for predefined selectable presets. Legacy Galleries without those fields continue to render through the existing fixed/dynamic fields.

**Current:** Gallery editor behavior is implemented across `DashboardSidebar.jsx`, `CanvasEditor.jsx`, `src/components/editor/events/useEditorEvents.js`, `src/components/editor/GaleriaKonva.jsx`, `ElementoCanvasRenderer.jsx`, `SelectionTransformer.jsx`, and the editor persistence modules.

**Current:** The requested path `src/components/editor/textSystem/render/konva/GaleriaKonva.jsx` is stale. The live component path is `src/components/editor/GaleriaKonva.jsx`.

**Current:** Gallery cell assignment keeps compatibility side channels: `celdaGaleriaActiva`, `editor-gallery-cell-change`, and `window.asignarImagenACelda`. New selected-Gallery photo operations route through `src/domain/gallery/galleryMutations.js`.

**Current:** Generated HTML renders clickable Gallery image cells as `.galeria-celda[data-gallery-image="1"]` with Gallery id, cell index/id where available, and media key markers. The public lightbox collects clickable Gallery cells globally from the generated invitation DOM and de-duplicates by media identity.

**Current:** Draft-authoritative preview and publish share the backend prepared render path. Publish validation can block Gallery media with `gallery-media-unresolved`.

## Invariants

These invariants apply to current behavior and future implementation:

- Preserve `tipo: "galeria"` as the only Gallery object type.
- Preserve Gallery objects as normal content objects in `objetos[]`.
- Preserve `cells[]` as the local Gallery photo/cell list.
- Preserve `mediaUrl` as the canonical render media field for populated Gallery cells.
- Preserve `url` and `src` as read-compatible Gallery cell media fallbacks.
- Preserve the current editor object selection model: a selected Gallery is a selected normal object, not a selected section-owned visual.
- Preserve draft-authoritative preview and publish through the backend prepared render path.
- Preserve current publish validation blockers, especially `gallery-media-unresolved`.
- Preserve current generated HTML base markers: `.galeria-celda` and `data-gallery-image="1"` for clickable image cells.
- Do not mix Gallery objects with section-owned image roles. Section backgrounds, free decorations, and edge decorations remain governed by [IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md](IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md).

## Implemented Architecture Summary

**Current:** Admin and superadmin users get a role-restricted Gallery Builder for template authoring only. It configures Gallery structure, layout presets, defaults, and end-user layout availability.

**Current:** Normal users do not access the Gallery Builder. They edit photos inside selected Galleries already present in the template and may switch only among layouts allowed by the Gallery configuration.

**Current:** Gallery layout presets are predefined. End users must not edit arbitrary `galleryLayoutBlueprint` data or create new layouts.

**Current:** A Gallery object may carry additive preset fields:

```js
{
  allowedLayouts: ["one_by_n", "two_by_n", "three_by_n", "squares"],
  defaultLayout: "one_by_n",
  currentLayout: "one_by_n"
}
```

**Current:** Layout switching preserves all Gallery photo usages in local `cells[]` order. Layouts decide how many photos are visible/rendered; switching layouts does not delete hidden photos and does not mutate uploaded assets.

**Current:** The primary visual layout selector labels are `1x4`, `2x2`, `2x3`, and `Collage`. These labels map to stable preset ids in [GALLERY_LAYOUT_PRESETS_CONTRACT.md](GALLERY_LAYOUT_PRESETS_CONTRACT.md). `2x3` is a UI label for the existing internal `three_by_n` id, and `Collage` is a UI label for the existing internal `squares` id. `full_width` remains a legacy render-compatible id but is no longer a selectable option.

**Current:** Preview and published invitations use one generated-HTML viewer runtime that collects clickable Gallery cells globally from the generated invitation DOM.

## Non-goals / Out of Scope

- No new `album` object type.
- No duplicate Gallery render system.
- No separate public viewer pipeline outside generated invitation HTML.
- No second Gallery persistence model.
- No editor rewrite.
- No freeform end-user Gallery blueprint editing.
- No section-owned image mixing.
- No deletion of uploaded image-library assets when removing a Gallery usage.
- No grouped-Gallery child editing unless group-child selection/editing is separately designed.
- No use of template/fallback preview as proof of publish parity.

## Definition of Done

The Gallery implementation is considered contract-ready only when all of these are true:

- Existing `tipo: "galeria"` objects still load, render, persist, preview, and publish.
- Existing Gallery cells using `mediaUrl`, `url`, or `src` remain readable through normalization.
- Admin/superadmin Gallery Builder is role-restricted and template-authoring only.
- Normal users can manage photos only inside existing template Galleries and can switch only among allowed layouts.
- Selected-Gallery sidebar shows selected-Gallery photos separately from available/uploaded images.
- Add/remove/replace/reorder/switch-layout mutate only the selected Gallery object.
- Removing a Gallery photo does not delete the uploaded image asset.
- Current selection and transform behavior for Gallery objects still works.
- Current side-channel APIs still work as compatibility bridges or have documented replacements.
- No new direct `window.*` mutation API is introduced.
- Generated HTML preserves current Gallery markers and adds Gallery id, cell id/index, and media key markers.
- Draft-authoritative preview and publish use the same global Gallery viewer runtime.
- Public viewer collects all generated clickable Gallery cells globally in DOM order.
- Public viewer de-duplicates duplicate photos by media identity.
- Clicking a duplicate opens the canonical first retained viewer item for that photo.
- Mobile viewer order and de-duplication match desktop.
- Publish still blocks unresolved Gallery media with `gallery-media-unresolved`.
- Grouped Gallery render compatibility is preserved, while grouped cell editing remains explicitly out of scope unless separately designed.

## Testing Anchors

Existing tests to preserve and extend:

- `shared/renderAssetContract.test.mjs`
- `functions/renderContractCompatibility.test.mjs`
- `functions/publicationPublishValidation.test.mjs`
- `shared/previewPublishParity.test.mjs`
- `shared/previewPublishMobileGeometryParity.test.mjs`
- `src/components/editor/persistence/borradorSyncRenderState.test.mjs`

Required coverage:

- Multiple Galleries in one generated invitation.
- Global viewer collection across all generated Gallery cells.
- Duplicate photo de-duplication.
- Clicked duplicate maps to the canonical first retained item.
- Mobile preview/publish parity for global Gallery viewer order and de-duplication.
- Selected-Gallery sidebar add/remove/replace/reorder.
- Layout switching and allowed-layout restrictions.
- Legacy Gallery cells using only `url` or `src`.
- Unresolved Gallery media still blocks publish with `gallery-media-unresolved`.
- Grouped Gallery render compatibility.

## Assumptions

- Assumption: global viewer de-duplication should use `storagePath` first, then `assetId`, then normalized absolute `mediaUrl`.
- Assumption: clicking a duplicate should open the canonical retained item for the same photo, not preserve a duplicate instance in the global viewer.
- Assumption: grouped Gallery public rendering should participate in global viewer collection if generated HTML exposes normal Gallery markers.
- Assumption: editor sidebar management for grouped child Galleries remains out of scope until group-child selection/editing is explicitly designed.
- Assumption: fixed Gallery add behavior should not create hidden, non-rendering cells. The future implementation must either expand fixed layout intentionally or reject the add when no empty slot exists.

## Remaining Product Decisions

- Whether fixed Galleries with no empty slot should auto-expand the grid or reject add-photo actions.
- Whether hidden preserved photos in a low-visible-count layout should remain viewer-inaccessible until a layout displays them, or whether a future generated HTML metadata channel should expose them. The v1 contract treats the viewer as clickable generated DOM only.
- Whether legacy selectable ids such as `banner`, `side_by_side`, and `single_page` should remain visible in future Builder defaults or become compatibility-only after templates are migrated.
