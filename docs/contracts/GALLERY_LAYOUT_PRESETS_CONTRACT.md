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

- `one_by_n`
- `two_by_n`
- `three_by_n`
- `banner`
- `full_width`
- `side_by_side`
- `squares`
- `slideshow`
- `marquee`
- `text_only`
- `single_page`

The implemented selectable v1 preset catalog is:

- `one_by_n`
- `two_by_n`
- `three_by_n`
- `squares`
- `banner`
- `side_by_side`
- `single_page`

The primary visual selector exposes these user-facing options:

| User-facing label | Internal preset id | Notes |
| --- | --- | --- |
| `1x4` | `one_by_n` | One fixed row; columns are resolved from the current populated photo count, falling back to the preset recommendation for empty Galleries. |
| `2x2` | `two_by_n` | Two fixed rows; columns are resolved from the current populated photo count, falling back to the preset recommendation for empty Galleries. |
| `2x3` | `three_by_n` | Legacy internal id retained; renders as two fixed rows and three fixed columns. Do not rename saved data from `three_by_n`. |
| `Collage` | `squares` | UI-only rename of the existing `squares` preset id. Do not migrate existing data from `squares`. The visual selector icon should use a lightweight static overlapping-photo preview. |

Legacy ids such as `banner`, `side_by_side`, `single_page`, and `full_width` remain readable/renderable for existing Galleries. `full_width` is no longer selectable in the normal Gallery tab or the admin/superadmin Builder selector. Existing Gallery data that references only `full_width` should fall back to a current selectable layout rather than crashing or exposing `full_width` again. New default Builder configuration should prefer the primary visual selector options above.

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

**Current:** Row-count presets such as `one_by_n` and `two_by_n` are resolved inside the shared preset application helper. They do not introduce a second renderer. The helper may derive the fixed-grid `cols` and render `height` from the selected preset, current Gallery photo count, and existing Gallery width so editor canvas, preview, and publish use the same render shape.

**Current:** The legacy internal `three_by_n` id is now the user-facing `2x3` preset. Its renderer must use exactly 2 rows and 3 columns. The id remains unchanged for compatibility.

**Future:** Presets that require behavior outside current fixed/dynamic rendering, such as slideshow or marquee, must still render through the same generated invitation HTML pipeline. They must not create a separate public viewer pipeline.

## Gallery-Level Layout Availability

Recommended additive Gallery object fields:

```js
{
  allowedLayouts: ["one_by_n", "two_by_n", "three_by_n", "squares"],
  defaultLayout: "one_by_n",
  currentLayout: "one_by_n"
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
- Visual selector labels can differ from internal preset ids; `Collage` must continue to write/read `squares`.
