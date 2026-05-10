# Gallery Layout Presets Contract

Status: Implemented core contract with deferred advanced renderers. This document owns the Gallery layout preset model. It is additive to the current Gallery object shape and preserves the existing `tipo: "galeria"`, `cells[]`, `mediaUrl`, and fixed/dynamic layout fields.

## Current Layout Model

**Current:** Gallery layout is represented by fields on the Gallery object:

- `rows`
- `cols`
- `gap`
- `radius`
- `ratio`
- `width`
- `height`
- `widthPct`
- `galleryLayoutMode`
- `galleryLayoutType`
- `galleryLayoutBlueprint`

**Current:** The current code recognizes fixed layout and `galleryLayoutMode: "dynamic_media"`.

**Current:** Shared layout logic lives in `shared/templates/galleryDynamicLayout.*` and frontend helpers in `src/domain/templates/galleryDynamicMedia.js`.

**Current:** `shared/templates/contract.js` has template-level `galleryRules`, but those rules currently describe upload constraints such as `maxImages`, `recommendedRatio`, `recommendedSizeText`, and optional `maxFileSizeMB`. They are not a layout preset contract.

**Current:** `allowedLayouts`, `defaultLayout`, and `currentLayout` are implemented as additive Gallery object fields for predefined selectable presets. Galleries without these fields continue to render through the existing fixed/dynamic fields.

## Preset Model

**Current:** Layouts are predefined presets, not arbitrary freeform Gallery editors for end users.

**Current:** Presets are globally defined in `shared/galleryLayoutPresets.cjs`, exposed to the frontend through `src/domain/gallery/galleryLayoutPresets.js`, and synced into Functions by `functions/scripts/syncTemplateContract.cjs`.

**Current:** Template authors choose which presets are allowed for each Gallery through the role-restricted Gallery Builder.

**Current:** Normal users may switch only among selectable presets allowed by the selected Gallery/template.

Example preset ids:

- `banner`
- `full_width`
- `side_by_side`
- `squares`
- `slideshow`
- `marquee`
- `text_only`
- `single_page`

The implemented selectable v1 preset catalog is:

- `squares`
- `banner`
- `full_width`
- `side_by_side`
- `single_page`

The catalog also reserves non-selectable ids for deferred renderers:

- `slideshow`
- `marquee`
- `text_only`

Those deferred presets are not exposed to end users until render behavior is implemented and tested.

## Preset Definition Shape

Implemented global preset definition shape:

```js
{
  id: "banner",
  label: "Banner",
  previewKind: "wide",
  minPhotos: 1,
  maxPhotos: 1,
  recommendedPhotoCount: 1,
  emptyCellsAllowed: false,
  supportsDynamicMedia: false,
  selectableByEndUsers: true,
  render: {
    galleryLayoutMode: "fixed",
    galleryLayoutType: "canvas_preserve",
    rows: 1,
    cols: 1,
    ratio: "16:9"
  }
}
```

**Current:** Preset definitions are treated as trusted product/template configuration, not user-authored draft data.

**Current:** If a preset maps to the current renderer, it maps to existing `galleryLayoutMode`, `galleryLayoutType`, row/column, and ratio behavior rather than adding a second renderer.

**Future:** Presets that require behavior outside current fixed/dynamic rendering, such as slideshow or marquee, must still render through the same generated invitation HTML pipeline. They must not create a separate public viewer pipeline.

## Gallery-Level Layout Availability

Recommended additive Gallery object fields:

```js
{
  allowedLayouts: ["banner", "squares", "slideshow"],
  defaultLayout: "banner",
  currentLayout: "banner"
}
```

**Current:** `allowedLayouts` lists the preset ids a normal user may select for that Gallery.

**Current:** `defaultLayout` is the template-authoring default.

**Current:** `currentLayout` is the selected layout for the draft.

**Current:** If `currentLayout` is missing, the editor/runtime falls back to `defaultLayout`. If both are missing, the current fixed/dynamic fields remain authoritative for backward compatibility.

**Current:** If `currentLayout` is not in `allowedLayouts`, the editor/runtime falls back to `defaultLayout` if allowed, otherwise the first valid allowed layout. This normalization is covered by tests.

## Layout Switching Rules

**Current:** Switching layouts preserves all photo usages in local `cells[]` order.

**Current:** Switching layouts does not delete hidden photos.

**Current:** Switching layouts does not mutate uploaded image assets.

**Current:** Layouts decide how many photos are visible/rendered.

**Current:** Local Gallery order remains independent from layout selection.

**Current:** Hidden preserved photos are not part of the public global viewer unless the generated HTML renders them as clickable Gallery cells. V1 viewer behavior is based on generated clickable DOM cells only.

**Current:** Empty-cell behavior is defined by the selected preset/current renderer mapping. Fixed visual grids may allow empty cells; dynamic media layouts generally filter empty cells.

## Admin Builder Responsibilities

**Current:** The admin/superadmin Gallery Builder defines:

- Gallery structure.
- Allowed layouts.
- Default layout.
- Layout preset availability.
- Responsive Gallery behavior.
- Gallery defaults.

**Current:** The Builder must not expose arbitrary freeform blueprint editing to normal users.

**Current:** Builder output must remain compatible with existing Gallery object fields and the mutation boundary in [GALLERY_EDITOR_CONTRACT.md](GALLERY_EDITOR_CONTRACT.md).

## End User Restrictions

**Current:** Normal users can switch among allowed layouts only.

**Current:** Normal users cannot create layouts.

**Current:** Normal users cannot edit `galleryLayoutBlueprint` directly.

**Current:** Normal users cannot bypass template restrictions by writing `currentLayout` outside `allowedLayouts`.

## Layout Testing Anchors

- `allowedLayouts` restricts normal-user layout selection.
- `defaultLayout` fallback works when `currentLayout` is missing.
- Invalid `currentLayout` normalizes to an allowed layout.
- Switching layouts preserves all `cells[]` photo usages.
- Switching to a lower-visible-count layout does not delete hidden photos.
- Switching layouts does not mutate uploaded image-library assets.
- Legacy Galleries without preset fields still render through current fixed/dynamic fields.
- Preset-to-current-renderer mapping preserves preview/publish parity.
