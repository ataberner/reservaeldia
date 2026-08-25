# Image Placement UX / Render Contract

Status: Canonical Contract.

Updated from implementation and code inspection on 2026-04-29.

This document is normative for the intended image-placement UX and technical contract. It also records the current implementation where it differs from the intended contract. No code behavior is changed by this document.

## Documentation Placement

This contract belongs under `docs/contracts` because image placement crosses editor UX, Firestore render data, preview HTML, and publish HTML. The architecture and data-model documents should link here instead of duplicating these role rules.

Existing documentation analyzed before adding this contract:

- `docs/architecture/ARCHITECTURE_OVERVIEW.md`
- `docs/architecture/EDITOR_SYSTEM.md`
- `docs/architecture/DATA_MODEL.md`
- `docs/architecture/ARCHITECTURE_GUIDELINES.md`
- `docs/architecture/INTERACTION_SYSTEM_CURRENT_STATE.md`
- `docs/architecture/SYSTEM_FRAGILITY_MAP.md`
- `docs/contracts/RENDER_COMPATIBILITY_MATRIX.md`
- `docs/contracts/PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md`

Primary code surfaces used for this audit:

- `src/components/CanvasEditor.jsx`
- `src/components/MenuOpcionesElemento.jsx`
- `src/components/editor/canvasEditor/useCanvasEditorSectionBackgroundUi.js`
- `src/utils/accionesFondo.js`
- `src/domain/sections/backgrounds.js`
- `src/components/editor/FondoSeccion.jsx`
- `src/components/editor/SectionDecorationEditorOverlay.jsx`
- `src/components/editor/SectionEdgeDecorationEditorOverlay.jsx`
- `src/components/editor/textSystem/render/konva/CanvasStageContentComposer.jsx`
- `src/components/editor/persistence/useBorradorSync.js`
- `functions/src/utils/generarHTMLDesdeSecciones.ts`
- `functions/src/utils/generarHTMLDesdeObjetos.ts`
- `functions/src/render/prepareRenderPayload.ts`
- `functions/src/utils/publishAssetNormalization.ts`

## UX Vocabulary

- Imagen (contenido): elemento normal del canvas. Participa en selección, multiselección, arrastre, redimensionado, rotación, orden de capa y render de contenido.
- Decoración: elemento visual no estructural. Pertenece al fondo de la sección y queda detrás del contenido.
- Fondo de la sección: superficie visual base de una sección. Es la capa más baja de los visuales propios de sección.
- Decoración arriba: ornamento estructural anclado al borde superior de la sección.
- Decoración abajo: ornamento estructural anclado al borde inferior de la sección.

## Selection-Box Boundary

The active selection-box model is documented in `docs/architecture/INTERACTION_SYSTEM_CURRENT_STATE.md`. `SELECTION_BOX_DRAG_BEHAVIOR.md` was requested as context, but this repo currently carries the merged current-state interaction document instead.

Normal images are `objetos` and must follow the normal object selection, multi-selection, drag, resize, rotation, and drag-overlay lifecycle. Section-owned visual roles are not `objetos` and must not enter normal object selection-box authority.

Normative rules:

- Section-owned visuals MUST use explicit section edit modes or section-owned overlays.
- Section-owned visuals MUST NOT be represented as selected object boxes.
- Converting an object image into a section-owned role MUST clear stale object selection for that image.
- During conversion, there MUST NOT be both a selected normal image object and a new section-owned visual derived from the same source image.
- Future section-owned overlays MUST respect the current visual authority model: `drag-overlay` > selected-phase box > hover. They must not introduce a competing object-box lifecycle.

## Current Data Model Summary

The canonical editable render state is stored in `borradores/{slug}` as:

- `objetos`
- `secciones`
- `rsvp`
- `gifts`

Normal content images live in `objetos` as objects with `tipo: "imagen"` and a `seccionId`.

Section-owned visual image roles live in `secciones`:

- Fondo de la sección: base fields such as `fondo`, `fondoTipo`, `fondoImagen`, `fondoImagenOffsetX`, `fondoImagenOffsetY`, and `fondoImagenScale`.
- Decoración: `decoracionesFondo.items[]`, normalized with `id`, `src`, `storagePath`, `x`, `y`, `width`, `height`, `rotation`, and `orden`.
- Decoración arriba / Decoración abajo: `decoracionesBorde.top` and `decoracionesBorde.bottom`, normalized as edge slots with `enabled`, `src`, `storagePath`, intrinsic dimensions, height limits, section-ratio limits, desktop/mobile offsets, and `mode`.
- Divisores superior/inferior generados: `divisores`, normalized as `{ top, bottom, height }`; these are section-owned SVG geometry, not image roles or canvas objects.

`decoracionesFondo` still accepts legacy `superior` / `inferior` shapes during normalization, but the current normalized free-decoration model is `items[]`. `decoracionesBorde` and generated `divisores` are independent from `decoracionesFondo`.

## Image Conversion Semantics

This section is normative.

When a normal image object is converted into any section-owned visual role:

- Fondo de la sección
- Decoración
- Decoración arriba
- Decoración abajo

the original image object MUST be removed from `objetos`.

The image changes role. The new owner is the target section field, and the source object must no longer exist as a normal canvas object. No duplication is allowed.

Current implementation:

- `reemplazarFondoSeccion` converts a normal image into the base section background and removes the original image object.
- `convertirImagenEnDecoracionFondo` converts a normal image into `decoracionesFondo.items[]` and removes the original image object.
- `usarImagenComoDecoracionBorde` converts a normal image into `decoracionesBorde.top` or `decoracionesBorde.bottom`, removes the original image object from `objetos`, clears stale object selection, and keeps the edge decoration as section-owned data.

Intended behavior:

- All conversions MUST behave consistently.
- The image becomes the new role.
- The original `tipo: "imagen"` object is removed.
- The resulting state MUST contain exactly one representation of that visual image.
- The editor SHOULD activate the owning section or the relevant section-owned edit mode after conversion.

## Cover Photo Metadata Contract

`portadaSource` identifies the canvas visual explicitly marked as cover. `portada` is
the draft URL projection and legacy fallback; template catalog/card workflows may
store a different preview image in that field. Neither is inferred from the ordered
first section's base background.

Normative rules:

- A base section background MUST NOT make an image a cover photo by itself.
- A cover photo MAY be a canvas image object or a base section background. The
  cover identity authority is `portadaSource`; the visual continues to be owned by
  `objetos[]` or `secciones[]` respectively.
- The gear menu for a selected canvas image object or base section background MUST
  offer `Usar como portada` only to admin/superadmin users through `canManageSite`.
- Selecting `Usar como portada` updates `portadaSource` and the `portada` URL
  projection. It MUST NOT convert, remove, duplicate, alter selection, or otherwise
  mutate the selected canvas object or a section visual.
- The Assistant cover card MUST resolve the current image from `portadaSource` when
  that reference is valid. Template sessions and template-derived drafts MUST NOT
  expose the card or cover substep without a resolved source, even when `portada`
  contains a catalog/card thumbnail. Only standalone legacy drafts MAY use
  `portada` without an explicit source.
- The full template document and template editor document MUST preserve
  `portadaSource`. Template catalog documents MUST NOT become the identity authority.
  Creating a draft from a template MUST copy the normalized source together with the
  render state whose object/section IDs it references.
- Replacing the current cover through the Assistant MUST always update `portada`.
  If the previous cover URL also identifies canvas image objects or one or more
  base section backgrounds, the replacement MUST update those matching visuals
  through their existing authorities while preserving object geometry and
  background placement. Unrelated visuals MUST remain unchanged.
- Cover metadata and linked visual replacements MUST be persisted through the
  existing editor-session persistence authority and write FIFO.

## Contextual Menu Contract

El menú previsto es:

Usar como:

- Imagen (contenido). Texto de ayuda: "Elemento de contenido. Podés moverlo, redimensionarlo, rotarlo y superponerlo con otros elementos."
- Usar como portada. Texto de ayuda: "La imagen sigue en el canvas y pasa a ser la foto de portada."
- Decoración. Texto de ayuda: "Elemento visual que queda detrás del contenido y no afecta el diseño en mobile."
- Fondo de la sección. Texto de ayuda: "Imagen principal que cubre toda la sección."
- Decoración arriba. Texto de ayuda: "Decoración anclada en la parte superior que se adapta al ancho de la pantalla."
- Decoración abajo. Texto de ayuda: "Decoración anclada en la parte inferior que se adapta al ancho de la pantalla."

La implementación actual en `MenuOpcionesElemento.jsx` expone un submenú agrupado `Usar como` para objetos de imagen normales:

- `Imagen (contenido)`
- `Usar como portada`
- `Decoración`
- `Fondo de la sección`
- `Decoración arriba`
- `Decoración abajo`

Visibilidad por rol:

- Usuarios regulares ven `Imagen (contenido)` y `Fondo de la sección`.
- Usuarios `admin` y `superadmin` ven además `Usar como portada`, `Decoración`, `Decoración arriba` y `Decoración abajo`.
- La fuente de permisos del editor es `canManageSite`, derivada de `isAdmin || isSuperAdmin` en `useAdminAccess()`.

Para una imagen que ya es normal, `Imagen (contenido)` no cambia el rol del objeto. La conversión de visuales propios de sección de vuelta a imágenes normales se maneja con affordances específicas de cada rol, no desde este submenú de imagen normal.

El menú de una imagen base de sección expone `Usar como portada` como acción
directa para admin/superadmin y persiste una referencia
`{ kind: "section-background", sectionId }`.

## Decoration Permissions

This section is normative.

`Decoración`, `Decoración arriba`, and `Decoración abajo` are advanced design controls. Their creation and management entry points MUST be visible only to `admin` and `superadmin` users.

Regular users:

- MAY use `Imagen (contenido)`.
- MAY use `Fondo de la sección`.
- MUST NOT see conversion actions for `Decoración`, `Decoración arriba`, or `Decoración abajo`.
- MUST NOT see section-menu controls that manage or remove section-owned decorations.
- MUST NOT get normal object selection boxes for section-owned decorations.

Admin and superadmin users:

- MAY convert a normal image into `Decoración`, `Decoración arriba`, or `Decoración abajo`.
- MAY open decoration settings from the decoration itself, preferably by double-click.
- MAY manage decoration-specific settings from the decoration-owned gear/settings menu.

Section menu rule:

- The section actions menu MUST NOT expose delete buttons for `Decoración`, `Decoración arriba`, or `Decoración abajo`.
- Removing these visuals, when available, belongs to the decoration-specific settings menu, not to the section menu.

Selection rule:

- Role gating MUST NOT move section-owned decorations into `objetos`.
- Decoration editing remains a section-owned overlay/edit mode and stays outside normal selection, multi-selection, drag-overlay, resize, rotation, grouping, z-index, inline editing, and mobile smart-layout object flows.

## Mode Contracts

### 1. Imagen (contenido)

- Nombre visible: Imagen (contenido).
- Current internal representation: one `objetos[]` item with `tipo: "imagen"` and `seccionId`.
- Intended ownership: object-owned content associated to a section by `seccionId`.
- Editor behavior: normal object selection, multi-selection, drag, resize, rotation, object layer order, and persistence. Inline text editing is not applicable.
- Selection model: follows the normal selection-box and drag-overlay model in `INTERACTION_SYSTEM_CURRENT_STATE.md`.
- Stacking behavior: editor stacking follows `objetos` order; publish can also apply object `zIndex`. Normal content renders above section-owned visuals. Fullbleed images use the existing fullbleed object path, not this section-owned contract.
- Mobile behavior: follows object/mobile smart-layout and fullbleed object rules where applicable.
- Preview/publish rendering: rendered by `functions/src/utils/generarHTMLDesdeObjetos.ts`.
- Conversion behavior: this is the default inserted image role. Converting from this role to any section-owned visual MUST remove the object.
- Permissions: visible to regular users, admins, and superadmins.
- Current vs intended: the role exists and is presented as the current first-class `Usar como` option for normal image objects.

### 2. Decoración

- Nombre visible: Decoración.
- Current internal representation: `secciones[].decoracionesFondo.items[]`.
- Intended ownership: section-owned visual design. It is not content and not a normal object.
- Editor behavior: `FondoSeccion` renders it in the section background surface. Double-click opens `SectionDecorationEditorOverlay`, which supports drag, keep-ratio resize, and rotation through a custom section-owned transformer.
- Selection model: selecting the decoration selects/activates the section and may enter decoration edit mode. It does not participate in object multi-selection, object drag overlay, object z-index, grouping, or inline editing.
- Stacking behavior: behind normal content. In editor, free decorations are rendered after edge decorations within `FondoSeccion`. In generated HTML, `.sec-decor-layer` has `z-index: 1`; `.sec-content` has `z-index: 3`.
- Mobile behavior: generated HTML scales decoration position and size through section decoration CSS. It stays out of mobile smart layout.
- Preview/publish rendering: rendered by `renderSectionDecorations` in `generarHTMLDesdeSecciones.ts`; publish preparation can block unresolved assets with `section-decoration-unresolved`.
- Conversion behavior: current implementation removes the original normal image object and creates one decoration item. This matches the intended conversion rule.
- Permissions: creation and management controls are visible only to admin/superadmin users. Double-click opens a section-owned decoration edit/settings flow for those roles.
- Current vs intended: mostly aligned. The visible UX name is `Decoración` because this role is non-structural section decoration, not the base background.

### 3. Fondo de la sección

- Nombre visible: Fondo de la sección.
- Current internal representation: section base background fields, including `fondoTipo: "imagen"` and `fondoImagen`.
- Intended ownership: section-owned base layer.
- Editor behavior: `FondoSeccion` renders the base image. Background edit mode supports dragging the image and bottom-right keep-ratio resizing to maintain cover behavior. Rotation is disabled.
- Selection model: section-owned edit mode, not normal object selection. Converting to this role must clear the source object selection.
- Stacking behavior: lowest section visual layer. Generated HTML uses `.sec-bg` with `z-index: 0`.
- Mobile behavior: generated HTML uses responsive background-image layout and runtime image positioning. Current canvas editing is based on the 800px editor coordinate model.
- Preview/publish rendering: rendered by `renderSectionBackgroundLayer` in `generarHTMLDesdeSecciones.ts`; publish preparation can block unresolved assets with `section-background-unresolved`.
- Conversion behavior: current implementation removes the original normal image object. This matches the intended conversion rule.
- Permissions: visible to regular users, admins, and superadmins.
- Current vs intended: aligned for conversion. Known gap: `fondoImagenDraggable` is persisted as a section field, but current editability is controlled by editor state rather than by that persisted flag.

### 4. Decoración arriba

- Nombre visible: Decoración arriba.
- Current internal representation: `secciones[].decoracionesBorde.top`.
- Intended ownership: section-owned structural edge visual.
- Editor behavior: `FondoSeccion` renders the top edge image. Double-click opens `SectionEdgeDecorationEditorOverlay`, which supports vertical offset editing only. It does not support normal resize, rotation, grouping, or object z-index.
- Selection model: section-owned edge edit mode. It must not become a selected object box.
- Stacking behavior: behind normal content. Generated HTML uses `.sec-edge-layer` with `z-index: 1`.
- Mobile behavior: publish HTML supports separate mobile height caps, section-ratio caps, and `offsetMobilePx`. The current canvas overlay edits `offsetDesktopPx` only.
- Preview/publish rendering: rendered by `renderSectionEdgeDecorations` in `generarHTMLDesdeSecciones.ts`; publish preparation can block unresolved assets with `section-edge-decoration-unresolved`.
- Conversion behavior: current implementation writes the edge slot, removes the original `tipo: "imagen"` object from `objetos`, and clears stale object selection.
- Permissions: creation and management controls are visible only to admin/superadmin users. Double-click opens the section-owned edge-decoration edit/settings flow for those roles.
- Current vs intended: aligned for conversion. The edge visual remains section-owned and does not become a normal selectable object.

### 5. Decoración abajo

- Nombre visible: Decoración abajo.
- Current internal representation: `secciones[].decoracionesBorde.bottom`.
- Intended ownership: section-owned structural edge visual.
- Editor behavior: same edge-decoration editor as top, but offset convention is bottom-relative. Positive desktop offset moves the bottom decoration upward into the section.
- Selection model: section-owned edge edit mode. It must not become a selected object box.
- Stacking behavior: behind normal content. Generated HTML uses `.sec-edge-layer` with `z-index: 1`.
- Mobile behavior: same responsive edge model as top, with separate `offsetMobilePx`. The current canvas overlay edits `offsetDesktopPx` only.
- Preview/publish rendering: rendered by `renderSectionEdgeDecorations` in `generarHTMLDesdeSecciones.ts`; publish preparation can block unresolved assets with `section-edge-decoration-unresolved`.
- Conversion behavior: current implementation writes the edge slot, removes the original `tipo: "imagen"` object from `objetos`, and clears stale object selection.
- Permissions: creation and management controls are visible only to admin/superadmin users. Double-click opens the section-owned edge-decoration edit/settings flow for those roles.
- Current vs intended: aligned for conversion. The edge visual remains section-owned and does not become a normal selectable object.

## Current Behavior Summary

- Cover-photo identity is read from `portadaSource`; only standalone legacy drafts
  use auxiliary `portada` metadata as a fallback. It is not inferred from the first
  section, and template/card thumbnails do not enable Assistant cover controls.
- The gear menus for a selected canvas image or base section background expose
  `Usar como portada` to admin/superadmin users. Regular users do not see it.
- Assistant cover replacement updates matching canvas image objects and preserves
  an existing dual cover/background role by replacing matching base section
  sources with geometry and placement preserved.
- Normal image/content is represented as an object in `objetos`.
- Base background, free background decoration, and top/bottom edge decorations are represented as section data in `secciones`.
- The data model already distinguishes base background, free decoration, and edge decoration as separate primitives.
- The contextual gear menu now groups normal image role actions under the intended `Usar como` vocabulary.
- Regular users see only `Imagen (contenido)` and `Fondo de la sección` in the normal-image `Usar como` submenu.
- Admin/superadmin users see the advanced decoration roles in the same submenu.
- Base-background, free-decoration, and top/bottom edge-decoration conversion remove the source image object.
- Section-owned visuals render below normal content and outside smart-layout object flows.
- Section-owned editor overlays are custom section edit surfaces, not normal object selection boxes.
- Generated section dividers are pointer-inert section layers and never enter object selection, grouping, z-index, rotation, resize, drag, or smart-layout flows.
- The section actions menu does not expose delete buttons for free, top, or bottom decorations.
- Desktop preview/publish uses controlled edge-layer overflow for top/bottom decorations so full edge artwork is not cropped merely because the preview viewport is wider than the 800px editor canvas.

## Preview / Publish Contract

Draft-authoritative preview and publish both use the backend prepared render payload path. Section-owned visuals are generated in `generarHTMLDesdeSecciones.ts`, while normal image objects are generated in `generarHTMLDesdeObjetos.ts`.

Edge decoration render strategy:

- `Decoración arriba` and `Decoración abajo` render as section-owned edge layers, not as `.objeto` nodes.
- Generated HTML keeps the base background, edge decoration, free decoration, and content surfaces in separate ordered layers.
- Desktop preview/publish may allow controlled vertical overflow only for `decoracionesBorde` edge artwork. This preserves the full edge ornament when the editor canvas shows it fully.
- Mobile edge behavior remains on the existing mobile sizing and offset path; desktop overflow changes must not redefine mobile geometry.
- Edge decorations stay behind content and remain `pointer-events: none`.

Generated divider render strategy:

- `divisores.top` and `divisores.bottom` use the deterministic path catalog in `shared/sectionDividerPresets`.
- Canvas (`FondoSeccion`) and generated preview/publish HTML (`generarHTMLDesdeSecciones`) consume the same path and height normalization.
- Each path is clipped inside its owning section and filled with the adjacent section's deterministic base/fallback color, preserving a continuous junction without changing logical section height or object offsets.
- A physical junction has one visible divider owner. If the preceding section has `bottom` and the following section has `top`, the following section's `top` slot wins in normal document order and the preceding `bottom` slot is suppressed only at render time. Both persisted values remain unchanged. This avoids a second straight color boundary between two independently clipped SVGs.
- Dividers have no external asset; publish asset validation continues to validate image backgrounds and decorations without adding an alternate transport or bypass.

Publish preparation validates unresolved assets separately:

- `section-background-unresolved`
- `section-decoration-unresolved`
- `section-edge-decoration-unresolved`

The final public HTML is stored in Firebase Storage as `publicadas/{slug}/index.html`. `publicadas/{slug}` stores publication metadata, not render arrays.

## Known Gaps

- Base background canvas offsets are edited in the 800px editor model, while generated HTML applies responsive CSS positioning. Exact cross-viewport parity is not fully documented here.
- Edge decoration canvas editing changes `offsetDesktopPx` only. `offsetMobilePx` is preserved but not edited by the current overlay.
- `decoracionesFondo` still carries legacy naming compatibility for `superior` / `inferior`, which can confuse the distinction between free decorations and edge decorations.
- `decoracionesFondo.parallax` supports `none`, `soft`, and `dynamic`; other motion fields in the system use different option sets. Treat this as naming and behavior coupling, not as a unified motion contract.
- Generated HTML intentionally separates base background, edge decorations, free decorations, and content into ordered layers. Internal overlap should still be tested when free decorations and edge decorations are visually close.
- Role gating is currently UI-level. The underlying conversion/removal helpers remain available to existing editor code paths and are not a security boundary by themselves.

## Regression Risks

- Selection and multi-selection can regress if a converted image remains in `objetos` or remains selected after becoming section-owned.
- Drag-overlay startup/settling can regress if section-owned overlays are routed through normal object drag state.
- Persistence can regress if section-owned visuals are written outside `secciones` or if conversion leaves duplicate representations.
- Preview/publish compatibility can regress if section-owned asset fields are renamed without updating publish asset normalization and validation.
- Mobile parity can regress if desktop-only canvas edits are assumed to cover mobile edge offsets or responsive background positioning.
- Template and legacy normalization can regress because `decoracionesFondo` accepts legacy shapes while `decoracionesBorde` is a newer primitive.

## Required Changes Not Implemented By This Document

- Decide the UX for editing `offsetMobilePx` for top/bottom decorations.
- Run browser-level mobile preview/publish geometry validation before changing responsive background or edge-decoration sizing rules.
