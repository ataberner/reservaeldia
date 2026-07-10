# Gallery Layout Presets Contract

Status: Canonical Contract with deferred advanced renderers. This document owns the Gallery layout preset model. It is additive to the current Gallery object shape and preserves the existing `tipo: "galeria"`, `cells[]`, `mediaUrl`, and fixed/dynamic layout fields.

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
- `grid_count_1` through `grid_count_16`
- `grid_1x1` through `grid_4x4`

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

The simple Fotos-tab creation flow also keeps a dedicated photo-count catalog for compatibility:

| User-facing label | Internal preset id | Fixed render grid | Visible cells |
| --- | --- | --- | --- |
| `1 foto` | `grid_count_1` | `1x1` | 1 |
| `2 fotos` | `grid_count_2` | `1x2` | 2 |
| `3 fotos` | `grid_count_3` | `1x3` | 3 |
| `4 fotos` | `grid_count_4` | `2x2` | 4 |
| `5 fotos` | `grid_count_5` | `2x3` | 5 |
| `6 fotos` | `grid_count_6` | `2x3` | 6 |
| `7 fotos` | `grid_count_7` | `2x4` | 7 |
| `8 fotos` | `grid_count_8` | `2x4` | 8 |
| `9 fotos` | `grid_count_9` | `3x3` | 9 |
| `10 fotos` | `grid_count_10` | `3x4` | 10 |
| `11 fotos` | `grid_count_11` | `3x4` | 11 |
| `12 fotos` | `grid_count_12` | `3x4` | 12 |
| `13 fotos` | `grid_count_13` | `4x4` | 13 |
| `14 fotos` | `grid_count_14` | `4x4` | 14 |
| `15 fotos` | `grid_count_15` | `4x4` | 15 |
| `16 fotos` | `grid_count_16` | `4x4` | 16 |

These photo-count presets use the existing fixed `canvas_preserve` renderer with `ratio: "1:1"`. The grid may have more structural slots than the visible photo count; the renderer must honor the preset render limit so, for example, `grid_count_5` renders exactly five visible cells in a `2x3` geometry.

Photo-count presets are globally known shared presets, but they are meant for simple Gallery creation and explicit Gallery `allowedLayouts`. Generic Builder/catalog lists may omit them unless they opt into count presets.

The current Fotos-tab creation UI uses a compact visual rows/columns grid. That selector maps directly to exact grid-size presets:

| Visual selection | Internal preset id | Fixed render grid | Visible cells |
| --- | --- | --- | --- |
| `1x1` | `grid_1x1` | `1x1` | 1 |
| `2x3` | `grid_2x3` | `2x3` | 6 |
| `4x4` | `grid_4x4` | `4x4` | 16 |

All `grid_{cols}x{rows}` combinations from `1x1` through `4x4` are known shared presets. They use the same fixed `canvas_preserve` renderer with `ratio: "1:1"` and a visible-cell limit equal to `cols * rows`. They do not create a second Gallery object model or public renderer.

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

**Current:** Photo-count presets `grid_count_1` through `grid_count_16` are resolved inside the same shared preset application helper. They must preserve all local `cells[]` usages while limiting the visible fixed cells to the preset count in editor canvas, preview, and publish.

**Current:** Exact grid-size presets `grid_1x1` through `grid_4x4` are resolved by the same helper. They preserve all local `cells[]` usages and render the chosen `cols x rows` geometry exactly.

**Current:** The fixed visible-cell limit is derived from the selected preset's `maxPhotos` through `resolveGalleryLayoutRenderCellLimit(...)`. It is not a persisted per-cell visibility model.

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

**Current:** Normal users cannot create layout definitions. The simple Fotos-tab creation flow may instantiate a Gallery using known `grid_1x1` through `grid_4x4` presets. Existing Galleries that use `grid_count_1` through `grid_count_16` remain valid.

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
- `grid_count_1` through `grid_count_16` expose exact visible-cell counts and reuse the fixed renderer.
- `grid_1x1` through `grid_4x4` expose exact visual grid sizes and reuse the fixed renderer.
- Fixed photo-count presets with hidden preserved usages keep those usages in `cells[]` while rendering only visible cells.
- Visual selector labels can differ from internal preset ids; `Collage` must continue to write/read `squares`.
