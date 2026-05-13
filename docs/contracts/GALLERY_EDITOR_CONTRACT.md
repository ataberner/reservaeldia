# Gallery Editor Contract

Status: Implemented core contract. This document owns Gallery behavior in the canvas editor, sidebar, role-based authoring model, and mutation boundary. It depends on [GALLERY_SYSTEM_CONTRACT.md](GALLERY_SYSTEM_CONTRACT.md) for invariants and on [GALLERY_LAYOUT_PRESETS_CONTRACT.md](GALLERY_LAYOUT_PRESETS_CONTRACT.md) for layout preset rules.

## Current Editor Behavior

**Current:** Gallery objects are selected as normal objects in `objetos[]`; they are not section-owned visuals.

**Current:** The live Gallery component is `src/components/editor/GaleriaKonva.jsx`.

**Current:** Gallery insertion is available to role-authorized template authors through the Gallery Builder flow in `DashboardSidebar.jsx` / `MiniToolbarTabGalleryBuilder.jsx`. It dispatches `insertar-elemento` with `tipo: "galeria"` and creates fixed cells initialized with `mediaUrl: null`.

**Current:** Gallery selection and transform behavior use the normal object interaction stack. `SelectionTransformer.jsx` special-cases single Gallery selections and attaches to `.gallery-transform-frame` when available.

**Current:** Gallery cell selection is transient editor state, not persisted data. Current bridges include `celdaGaleriaActiva`, `editor-gallery-cell-change`, and `window.asignarImagenACelda`.

**Current:** Dynamic-media Gallery cell assignment and clearing operate on visible populated cells, then rebuild the object through dynamic Gallery patch helpers.

**Current:** Fixed Gallery cell assignment updates the active slot index and preserves the fixed slot structure.

**Current:** The normal image sidebar separates selected-Gallery photo usages from available uploaded images when one Gallery is selected.

## Role-Based Authoring Model

### Admin / Superadmin Gallery Builder

**Current:** Admin and superadmin users may access a dedicated Gallery Builder tab in the sidebar.

**Current:** The Builder is role-restricted using the same site-management authority model as other advanced editor controls: `canManageSite` / admin / superadmin.

**Current:** The Builder is template-authoring only. It is not part of the normal invitation editing experience.

**Current:** The Builder is structurally authoritative for Gallery configuration inside templates. It may create/configure Gallery structures, choose layout presets, define defaults, and define which layouts are available to end users. Freeform responsive blueprint editing is still out of scope.

**Current:** The Builder must not write a second Gallery persistence model. It configures existing `tipo: "galeria"` objects and additive Gallery fields.

**Current:** The Builder uses the same visual layout selector model as the normal Gallery tab.

**Current:** If a Gallery is selected in the Builder context, selecting a layout configures that selected Gallery through the Gallery mutation boundary. The selected layout becomes `currentLayout`; if needed, the Builder may add that preset id to the Gallery's `allowedLayouts` so the resulting state remains valid.

**Current:** If no Gallery is selected, selecting a layout inserts a new Gallery immediately through the existing `insertar-elemento` / `tipo: "galeria"` insertion path, using the configured `allowedLayouts`, `defaultLayout`, and selected `currentLayout`.

**Current:** The Builder remains visible only in writable template-authoring sessions for admin/superadmin users through the existing `canManageSite` / `canAccessGalleryBuilder(...)` gate. Normal users must not see Builder insertion/configuration controls.

### End User Gallery Editing

**Current:** Normal users do not create Gallery object structures.

**Current:** Normal users edit Galleries already present in the template.

**Current:** Normal users manage photos inside those Galleries and may switch only among layouts allowed by the template/Gallery configuration.

**Current:** Normal users must not create new layouts, edit layout blueprints, bypass `allowedLayouts`, or access the Gallery Builder.

**Current:** Normal sidebar Gallery insertion has been replaced by selected-Gallery photo management for end-user editing.

## Selected-Gallery Sidebar Behavior

**Current:** When exactly one Gallery object is selected, the Gallery sidebar shows the selected Gallery's photo usages derived from that Gallery object's `cells[]`.

**Current:** The sidebar shows available/uploaded invitation images separately from selected-Gallery usages.

**Current:** Selected-Gallery operations mutate only the selected Gallery object.

**Current:** Removing a photo removes only that Gallery usage and never deletes the uploaded asset from the image library.

**Current:** If no Gallery is selected, selected-Gallery photo management controls are disabled/hidden while upload/library browsing remains available.

**Current:** The implemented selected-Gallery photo UI is a thumbnail grid with explicit move-up/move-down, replace, and remove controls. Reorder and replace already route through `src/domain/gallery/galleryMutations.js`.

Supported selected-Gallery operations:

- Add photo usages.
- Remove photo usages.
- Replace photo usages.
- Reorder photo usages.
- Switch `currentLayout` among allowed layouts.

### Selected-Gallery Layout Selector

**Current:** When exactly one Gallery object is selected, the Gallery sidebar owns a visual layout selector near the top of the Gallery panel, above the selected-Gallery photo list.

**Current:** The selector displays only layouts allowed by the selected Gallery/template configuration. It shows a clear selected state for the active resolved layout and commits layout changes through `switchGalleryLayout(gallery, layoutId)` in `src/domain/gallery/galleryMutations.js`.

**Current:** Draft/legacy Galleries that do not yet carry `allowedLayouts` still show the primary safe selector options in the normal Gallery tab. This is an editor-only fallback for visibility and switching; it must not change preview/publish rendering until the user selects a layout. On first selection, the Gallery mutation boundary materializes additive `allowedLayouts`, `defaultLayout`, and `currentLayout` fields on that selected Gallery so the existing renderer can update the canvas immediately.

**Current:** The primary user-facing selector labels are `1x4`, `2x2`, `2x3`, and `Collage`. Labels are UI presentation; persisted state remains stable preset ids as defined by [GALLERY_LAYOUT_PRESETS_CONTRACT.md](GALLERY_LAYOUT_PRESETS_CONTRACT.md). In particular, `2x3` maps to the existing internal `three_by_n` id and `Collage` maps to the existing internal `squares` id. `Full width` / `Ancho completo` is legacy-renderable but no longer selectable in either the normal Gallery tab or Builder selector.

**Current:** Layout previews are lightweight static CSS/SVG/icon previews. They are not live mini-rendered Galleries and do not create a second Gallery render path.

**Current:** Selecting a layout changes only the selected Gallery object's layout fields, preserves all `cells[]` photo usages, and leaves other Galleries untouched. Hidden/unrendered photos remain stored and manageable in the selected-Gallery photo list.

## Future Selected-Gallery Photo List UX

This section owns the next sidebar UX iteration only. It does not change the Gallery data model, preview/publish behavior, public viewer behavior, or mutation ownership.

### Vertical List Shape

**Future:** When exactly one Gallery is selected, the Gallery panel should show the selected Gallery photos as a vertical ordered list.

**Future:** Each populated photo row should contain:

- a dedicated drag-handle control on the left
- a photo thumbnail in the middle
- a replace/upload affordance on the right

**Future:** The row order must reflect the selected Gallery's local photo order as returned by `getGalleryPhotos(gallery)` / `getSelectedGalleryPhotoUsages(gallery)`.

**Future:** The vertical list is a presentation of the selected Gallery object's `cells[]`; it must not create a second sidebar-only ordering model.

### Order Mapping to `cells[]`

**Invariant:** Persisted Gallery order remains owned by the selected Gallery object's `cells[]`.

**Current:** `getGalleryPhotos(gallery)` returns populated Gallery usages with `displayIndex`, `sourceIndex`, optional `cellId`, resolved `mediaUrl`, and media identity metadata.

**Future:** Reorder UI must pass `displayIndex` positions to `reorderGalleryPhotos(gallery, from, to)` and commit the returned Gallery object through the existing editor update path.

**Future:** Reorder must preserve:

- stable `cell.id`
- `mediaUrl`
- `storagePath`
- `assetId`
- `fit`
- `bg`
- `alt`
- any unknown compatible cell metadata

**Future:** Fixed Gallery empty slots should not appear as draggable photo rows because they are not photo usages. They may appear as explicit add targets or empty-slot indicators, but those indicators must not participate in photo reorder.

**Future:** In fixed Galleries, populated rows follow fixed slot order while skipping empty slots. Reordering populated rows updates populated cell contents across occupied slots and preserves the fixed slot structure.

**Future:** In dynamic-media Galleries, populated rows follow the filtered media-cell order used by the dynamic Gallery mutation helpers.

### Hidden / Unrendered Preset Cells

**Current:** Layout presets can render fewer clickable cells than the total populated local Gallery photo list. Hidden preserved photos remain in `cells[]`.

**Future:** The selected-Gallery sidebar should show all populated photos owned by the selected Gallery, including photos hidden by the current layout preset.

**Future:** Drag reorder should support hidden populated photos because dragging a hidden photo earlier in the local order is how a user can make it visible in lower-visible-count layouts.

**Future:** The UI should mark hidden/unrendered rows when the current layout has a lower visible count than the populated photo list. The hidden marker is informational only; it must not create a separate hidden-photo persistence model.

**Future:** Public preview/publish viewer behavior remains generated DOM based. Hidden photos that are not rendered as clickable Gallery cells remain excluded from the public viewer until a layout renders them.

### Drag-Handle-Only Reorder

**Future:** Drag-and-drop reorder must begin only from the row's dedicated drag handle.

**Future:** Pointer or touch gestures on the thumbnail must not start reorder; the thumbnail is reserved for selecting/replacing the photo.

**Future:** The drag operation is local to the sidebar DOM. It must not use the canvas/Konva object drag pipeline, editor drag overlay, guide/snapping system, or `window._isDragging` globals.

**Future:** During drag, the selected Gallery object remains the selected editor object. The drag must not change canvas selection, active Gallery cell state, object z-order, object geometry, or section ownership.

**Future:** The implementation should commit one mutation on drop/reorder confirmation, not repeatedly write Gallery state on every pointer move.

**Future:** If a drag is cancelled, no Gallery mutation should be committed.

**Future:** No new direct `window.*` mutation APIs may be introduced for drag-and-drop. Existing side-channel APIs remain compatibility bridges only for current active-cell workflows.

### Thumbnail Replacement Flow

**Future:** Clicking a row thumbnail should start replacement for that specific Gallery usage.

**Future:** Replacement must call `replaceGalleryPhoto(gallery, target, photo)` through the existing mutation boundary and preserve the row/cell position.

**Future:** The replacement source should use the existing upload/image-library flow. If the user uploads a device file, it must first become an uploaded image-library asset, then the Gallery usage is replaced with that asset's `mediaUrl` plus `storagePath` / `assetId` when available.

**Future:** Replacing a photo affects only the selected Gallery usage. It must not delete, overwrite, or reorder uploaded image-library records.

**Future:** The right-side upload/replace affordance may open the same replacement flow as the thumbnail. If product design needs separate meanings, the distinction must be documented before implementation.

### Accessibility and Keyboard

**Future:** The vertical list should be keyboard usable.

**Future:** Each row should expose the photo position and total count in accessible labels.

**Future:** Drag handles should have explicit labels such as "Reorder photo 2 of 5".

**Future:** Keyboard reorder should be available through either handle-focused commands or explicit move-up/move-down controls. Removing the existing up/down fallback is not allowed until keyboard drag is proven accessible.

**Future:** Thumbnail replacement controls should be buttons with labels that identify the target photo position.

**Future:** Focus should remain in the list after reorder, replace, or remove whenever the target row still exists.

### Mobile Behavior

**Future:** Mobile should use the same vertical list model and mutation boundary.

**Future:** Drag handles must be large enough for touch and must avoid accidental sidebar scroll hijacking. Touch drag should start only on the handle.

**Future:** If reliable touch drag is not implemented in the first pass, mobile must keep explicit move-up/move-down controls as the supported reorder path.

### Existing Utilities and Library Guidance

**Current:** No dedicated sortable-list or drag-and-drop library is present in the root `package.json`.

**Current:** The repo has custom pointer-drag patterns for editor/admin surfaces, but those are not a shared Gallery sortable-list utility.

**Future:** The first implementation should either:

- use a small sidebar-local pointer/keyboard sortable interaction that delegates all mutations to `reorderGalleryPhotos`, or
- introduce a focused sortable-list dependency only after an explicit dependency decision.

**Future:** Do not reuse the canvas editor drag systems for sidebar row sorting. Those systems own object geometry, selection visuals, guides, and drag-settle handoff, which are unrelated to sidebar list ordering.

### Interaction Risks

Changing the selected-Gallery list can break editor interaction if implemented incorrectly:

- Starting reorder from the whole row can conflict with thumbnail replacement and sidebar scrolling.
- Reusing canvas drag state can disturb Gallery object selection, hover, transformer attachment, or drag overlay state.
- Mutating local UI order without committing through `galleryMutations.js` can desynchronize the sidebar from `cells[]`.
- Treating hidden preset photos as deleted can break layout switching and preview/publish parity.
- Treating fixed empty slots as draggable photos can corrupt fixed Gallery slot identity.
- Uploading directly into a Gallery without the image-library flow can mix uploaded assets with Gallery usages.

### Unresolved Product Decisions

- Whether the thumbnail and right-side replace/upload affordance open exactly the same chooser or have distinct behaviors.
- Whether row hidden-state labels should be based on preset visible count only or on actual canvas-rendered visibility after responsive layout.
- Whether to add a sortable-list dependency or implement a sidebar-local pointer/keyboard sortable helper.
- Whether empty fixed slots should be shown as add-target rows, a single add button, or not shown at all.

## Canvas Behavior

**Current:** Selecting a Gallery object keeps the current normal object selection model.

**Current:** Selecting a Gallery cell remains a transient UI affordance, but the Gallery object remains the only persisted owner of photo usages.

**Current:** Gallery photo edits must not change Gallery object section ownership, z-order, normal selection behavior, or transform behavior.

**Current:** Layout switching affects only the selected Gallery object's layout fields and rendered geometry. It does not mutate uploaded image assets.

**Current:** Gallery object edits must not create or modify section-owned image roles. Those remain governed by [IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md](IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md).

## Future Mutation Boundary

**Current Owner:** Gallery photo mutations are centralized in the pure editor-domain helper `src/domain/gallery/galleryMutations.js`.

**Current:** The boundary imports or delegates to existing Gallery layout helpers such as `src/domain/templates/galleryDynamicMedia.js` and preset helpers. It must not duplicate fixed/dynamic layout math.

**Current:** The boundary returns an updated Gallery object or object patch and does not mutate inputs in place.

Required operations:

| Operation | Required behavior |
| --- | --- |
| `getGalleryPhotos(gallery)` | Return populated Gallery photo usages in local display order, with resolved `mediaUrl`, source cell index, optional `cell.id`, and media identity metadata. |
| `addGalleryPhotos(gallery, photos, options)` | Add one or more usages to the selected Gallery only. Dynamic Galleries append/rebuild through dynamic helpers. Fixed Galleries fill empty slots first and must not append hidden non-rendering cells. |
| `removeGalleryPhoto(gallery, target)` | Remove one usage from the selected Gallery only. It must not delete the uploaded asset. |
| `replaceGalleryPhoto(gallery, target, photo)` | Replace one usage in place while preserving local position and cell styling such as `fit` and `bg`. |
| `reorderGalleryPhotos(gallery, from, to)` | Reorder populated usages inside the selected Gallery only while preserving Gallery layout identity. |
| `switchGalleryLayout(gallery, layoutId)` | Set `currentLayout` only when `layoutId` is a known selectable preset allowed by the Gallery and preserve all photo usages. For draft/legacy Galleries with no `allowedLayouts`, materialize the safe primary `allowedLayouts` fallback plus `defaultLayout` on first switch. Preset-to-render mapping is applied by render helpers, not by deleting or reshaping `cells[]`. |
| `configureGalleryLayout(gallery, layoutId, options)` | Builder-only configuration helper. Preserve all photo usages, ensure the selected layout is allowed, and keep `defaultLayout` / `currentLayout` valid without creating a new Gallery. |
| `normalizeGalleryState(gallery, context)` | Normalize fixed/dynamic state, canonicalize cell media, and preserve backward compatibility with existing Gallery objects. |
| `resolveGalleryMediaKey(cell)` | Resolve identity with `storagePath`, then `assetId`, then normalized `mediaUrl`. |

## Compatibility Bridges

**Current:** Existing side-channel APIs are compatibility bridges:

- `window.asignarImagenACelda`
- `editor-gallery-cell-change`
- `celdaGaleriaActiva`

**Current:** Bridges delegate to the mutation boundary where they perform Gallery mutations.

**Future Deprecated:** New Gallery sidebar flows must not add new direct `window.*` mutation APIs.

**Future Deprecated:** New code should not add independent Gallery mutation logic in `DashboardSidebar.jsx`, `GaleriaKonva.jsx`, or generated DOM event handlers.

## Grouped Galleries

**Current:** Grouped Gallery objects can render as group children. Inside groups, `ElementoCanvasRenderer.jsx` renders Gallery children passively and does not expose independent cell editing.

**Current:** Grouped Gallery render compatibility must remain intact.

**Out of scope:** Grouped-Gallery child cell editing is not part of this contract unless group-child selection/editing is separately designed.

## Editor Testing Anchors

- Selected Gallery sidebar displays only the selected Gallery's populated photo usages.
- Future selected-Gallery photo list renders as a vertical ordered list derived from `cells[]`.
- Future drag reorder starts only from a dedicated handle and commits through `reorderGalleryPhotos`.
- Future thumbnail replacement preserves row/cell position and commits through `replaceGalleryPhoto`.
- Hidden preset photos remain visible/manageable in the sidebar and are not deleted by layout switching.
- Fixed Gallery empty slots are not draggable photo rows.
- Available image library remains separate from selected-Gallery usages.
- Add/remove/replace/reorder mutate only the selected Gallery object.
- Removing a Gallery usage does not delete the uploaded asset.
- Layout switching respects `allowedLayouts`.
- Visual layout selector appears above the selected-Gallery photo list and displays `Collage` for the `squares` id.
- Builder selector updates the selected Gallery when one is selected and inserts a new `tipo: "galeria"` only when no Gallery is selected.
- Normal users cannot open the Gallery Builder.
- Admin/superadmin Builder is available only in template-authoring context.
- Current side-channel bridges still work during migration.
- No new direct `window.*` mutation API is introduced.
- Grouped Gallery render remains compatible; grouped child editing remains unsupported.
