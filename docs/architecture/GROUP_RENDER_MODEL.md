# GROUP_RENDER_MODEL

Status: Phase 2 architecture contract only.

This document defines the intended authored data model and prepared render contract for composition-preserving groups.

It aligns with:

- `ARCHITECTURE_GUIDELINES.md`
- `docs/architecture/PREVIEW_SYSTEM_TARGET.md`
- `ARCHITECTURE_OVERVIEW.md`
- `EDITOR_SYSTEM.md`
- `DATA_MODEL.md`

This document does not change current runtime behavior by itself. Phase 2 is documentation only.

## 1. Purpose

Composition-preserving groups are first-class render-contract units, not temporary editor hints. The goal of this document is to define one canonical group model that preview, publish, responsive/mobile adaptation, and later editor UI can all share.

Decision: the canonical authored representation for grouped elements is an explicit container object inside `objetos`, using `tipo: "grupo"`.

Decision: this model is the intended authored contract once later phases implement it. Phase 2 does not claim that the current runtime already accepts or renders `tipo: "grupo"`.

## 2. Why This Model

The chosen model is an explicit group container object embedded in the existing `objetos` array.

Why this is the best fit:

- It stays inside the already protected canonical render boundary: `objetos`, `secciones`, `rsvp`, `gifts`.
- It gives the group one explicit owner for section membership, anchor family, section mode, geometry frame, and child membership.
- It gives preview and publish a deterministic prepared render boundary instead of forcing them to infer a group from sibling objects.
- It gives responsive/mobile one atomic layout unit instead of relying on DOM clustering heuristics.
- It remains Firestore-serializable because the entire composition persists as one inline object record.
- It maps cleanly to future editor UX, where grouping acts on one authored object with ordered children rather than on loose sibling links.

Decision: a separate root `groups` field is not used in v1.

## 3. Chosen Authored Representation

Groups live inside `objetos` as a new top-level object family:

```json
{
  "id": "group-hero-couple",
  "tipo": "grupo",
  "seccionId": "section-hero",
  "x": 96,
  "y": 132,
  "yNorm": 0.264,
  "width": 420,
  "height": 180,
  "anclaje": "content",
  "children": [
    {
      "id": "title",
      "tipo": "texto",
      "x": 0,
      "y": 0,
      "width": 420,
      "texto": "Ana y Luis",
      "fontSize": 42,
      "fontFamily": "Cormorant Garamond",
      "colorTexto": "#2f2a27"
    },
    {
      "id": "ornament",
      "tipo": "icono",
      "x": 168,
      "y": 92,
      "width": 84,
      "height": 24,
      "src": "https://example.test/ornament.svg"
    }
  ]
}
```

Decision: `tipo: "grupo"` is the only authored representation for composition-preserving groups in v1.

Decision: group membership is explicit through `children[]`, not implicit through sibling links.

### 3.1 Minimum required group fields

- `id`
- `tipo` with value `"grupo"`
- `seccionId`
- `x`
- outer vertical position:
  - `y` for `fijo`
  - `yNorm` as canonical for `pantalla`
  - optional compatibility `y` may coexist in `pantalla`, matching current authored object practice
- `width`
- `height`
- `children`

Optional group fields:

- `anclaje`, defaulting to `content`
- existing object-level compatibility fields that already apply to top-level objects where later phases need them, such as `rotation`, `scaleX`, `scaleY`, `zIndex`, `motionEffect`, `role`, `enlace`

Decision: `width` and `height` are explicit authored frame fields for the outer group. They are not optional inferred metadata in v1.

### 3.2 Minimum required child fields

Each child must include:

- `id`
- `tipo`
- `x`
- `y`
- the minimum fields already required for that child family today

Examples:

- text child: current text fields such as `texto`, `width`, `fontSize`
- image child: current image fields such as `src`, `width`, `height`
- shape child: current shape fields such as `figura`, geometry, and style

Decision: child geometry is always group-local design-space geometry relative to the group origin.

### 3.3 Child ownership rules

Decision: children do not carry:

- `seccionId`
- `anclaje`
- `yNorm`

Those semantics belong to the outer group.

Decision: child ids must be unique within their parent group.

Decision: top-level object ids remain top-level identities as they do today. Child identity is scoped by `(group.id, child.id)` rather than by a new global child-id requirement.

## 4. Section, Anchor, and Mode Semantics

### 4.1 Section ownership

Decision: a group belongs to exactly one section through `seccionId`.

Decision: cross-section groups are forbidden.

Operational meaning:

- the group participates in section ordering exactly like any other top-level object
- the group inherits the containing section's `altoModo`
- the group cannot span section boundaries as one authored unit

### 4.2 Internal layering

Decision: outer section-level layering follows normal top-level object ordering in `objetos`, with existing `zIndex` compatibility if present.

Decision: internal layering is preserved by `children[]` order.

Operational meaning:

- moving the group forward/backward in the section changes the group's relation to sibling top-level objects
- reordering `children[]` changes only the internal composition of that group
- responsive/mobile must preserve internal child order unless a later contract explicitly says otherwise

### 4.3 Relative geometry

Decision: the group frame is section-local.

Decision: child coordinates are group-local.

Operational meaning:

- `group.x` and outer vertical position place the group inside its section
- child `x` and `y` place each child inside the group frame
- internal overlap, adjacency, and separation are represented by child local offsets, not by later inference

### 4.4 Anchors: `content` vs `fullbleed`

Decision: `anclaje` is a group-level property, not a child-level property.

Decision: if omitted, the group defaults to `content`.

Decision: a `content` group renders wholly in the section content lane.

Decision: a `fullbleed` group renders wholly in the section bleed lane.

Decision: mixed child anchors inside one group are invalid in v1.

Operational meaning:

- the group does not weaken current anchor semantics
- a group preserves composition inside one anchor family
- a group is not an escape hatch that mixes content-lane and bleed-lane elements into one authored unit

### 4.5 Section modes: `fijo` vs `pantalla`

Decision: section-mode semantics apply at the outer group level only.

Decision: in `pantalla`, the group's outer vertical contract uses `yNorm` as the canonical authored vertical input, with optional compatibility `y` as current objects already do.

Decision: child local `y` remains ordinary group-local design-space `y` in both `fijo` and `pantalla`.

Operational meaning:

- `fijo` group: outer `y` is section-local authored vertical position
- `pantalla` group: outer `yNorm` controls the group's vertical placement inside the section's viewport-responsive interpretation
- the group preserves internal composition while the outer group participates in current section-mode semantics

## 5. Composition-Preserving Semantics

Composition-preserving means the group is one authored composition whose internal visual relationships are part of render truth.

Decision: the following are preserved as authored truth:

- internal child order
- internal local offsets
- internal overlap
- internal adjacency and spacing
- the identity of the group as one atomic responsive/mobile unit

Decision: the group preserves composition only. It does not replace section, anchor, CTA, or section-mode semantics.

### 5.1 Responsive/mobile behavior

Responsive/mobile is allowed to:

- move the group as one unit
- scale the group as one unit
- fit the group as one unit
- expand fixed-section height if later explicit mobile rules need more vertical space for the group as one unit

Responsive/mobile must never do by default:

- split child elements into separate reflow units
- cluster group children independently from each other
- reorder children
- stack children independently
- change one child's anchor family apart from the group
- move one child into a different flow position from its siblings
- reinterpret the group as unrelated standalone objects

Decision: composition-preserving groups are atomic during responsive/mobile adaptation by default.

Decision: later phases may add explicit exception rules, but no exception exists in v1.

## 6. Child Behavior Inside a Group

### 6.1 Text growth and content changes

Decision: if one text child changes size or content, that child's intrinsic box may change, but sibling child coordinates stay authored unless the author explicitly edits them.

Decision: the contract does not imply automatic internal reflow inside a group.

Operational meaning:

- a longer text child may increase its own rendered size
- later preparation/runtime may recompute resolved group bounds from authored child geometry plus intrinsic child size
- sibling positions remain authored and composition-preserving

### 6.2 Mixed object types

Decision: groups may contain mixed child object types, using current standalone object families.

Allowed examples:

- text + image
- text + icon
- shape + text
- gallery + caption
- countdown + decorative shapes
- functional CTA buttons, while still resolving CTA behavior from root `rsvp` or `gifts`

Not allowed as children:

- section-owned visuals stored on `secciones`, such as section background image and `decoracionesFondo`
- root config payloads such as `rsvp` and `gifts`

Assumption: current standalone object families can later be rendered as group children once later phases add support to preparation, generator, validation, and editor flows.

### 6.3 Nested groups

Decision: nested groups are forbidden in v1.

Deferred future possibility: nested groups may be revisited in a later architecture phase if a real authored use case requires them.

Reason:

- nested groups multiply complexity in selection, transform, validation, preparation, DOM emission, and mobile atomicity
- Phase 2 should define one explicit first-class model without introducing recursive composition rules yet

## 7. Prepared Render Contract

Decision: prepared render must resolve groups explicitly as groups, not as inferred sibling relationships.

Minimum semantic requirements at the prepared boundary:

- the outer group remains a distinct prepared layout unit
- resolved section ownership is explicit
- resolved anchor interpretation is explicit
- resolved section-mode interpretation is explicit
- resolved outer geometry is deterministic
- ordered prepared children are preserved inside the group
- child geometry remains relative to the prepared group frame or is otherwise emitted in a way that preserves the same semantics exactly

Illustrative prepared semantic shape:

```json
{
  "id": "group-hero-couple",
  "tipo": "grupo",
  "seccionId": "section-hero",
  "sectionMode": "pantalla",
  "anchor": "content",
  "frame": {
    "x": 96,
    "yNorm": 0.264,
    "width": 420,
    "height": 180
  },
  "children": [
    {
      "id": "title",
      "tipo": "texto",
      "x": 0,
      "y": 0
    },
    {
      "id": "ornament",
      "tipo": "icono",
      "x": 168,
      "y": 92
    }
  ]
}
```

Decision: low-level renderers may emit DOM children internally, but the render contract must preserve an explicit group boundary semantically for parity and mobile handling.

Decision: mobile preparation must consume explicit prepared group boundaries instead of re-discovering them heuristically from DOM overlap.

## 8. Firestore and Persistence Compatibility

Decision: groups persist inline inside `objetos`, so they remain compatible with the current Firestore pattern of one render-state document containing `objetos` and `secciones`.

Why this matters:

- one record owns the entire composition
- membership does not have to be reconstructed from sibling references
- persistence remains Firestore-serializable and document-local
- later draft normalization and publish preparation can treat the group as one canonical object family

Compatibility default:

- old ungrouped documents remain valid with no migration
- absence of `tipo: "grupo"` means the document still uses the current flat object model
- no backfill is required for Phase 2

Decision: grouped authored documents are a forward contract for later phases. Phase 2 does not require current runtimes to accept them yet.

## 9. Non-Goals

This phase does not:

- implement editor grouping UI
- implement preview runtime support
- implement publish runtime support
- implement mobile smart layout support
- add a fake editor-only grouping model
- revise current Phase 1 protected baseline behavior
- loosen current `content` vs `fullbleed` semantics
- loosen current `fijo` vs `pantalla` semantics
- define nested groups
- define cross-section groups

Decision: if later implementation needs behavior outside this document, that behavior must be added by explicit architecture work, not inferred ad hoc.

## 10. Rejected Alternatives

### 10.1 Independent objects linked only by `groupId`

Rejected because:

- it has no single canonical owner for section, anchor, section mode, frame, or child ordering
- prepared render would have to infer and reconcile conflicts between siblings
- persistence would spread one composition across multiple records
- responsive/mobile atomicity would fall back to heuristics instead of explicit contract data

### 10.2 Separate root `groups` array

Rejected because:

- it expands the canonical authored root boundary beyond the currently protected four fields
- every cross-runtime reader and writer would need a root-shape change before groups become authoritative
- it is less aligned with the current object-centric render model

### 10.3 Editor-only grouping metadata

Rejected because:

- preview target already defines groups as render-contract units
- editor-only metadata would create a second truth model
- preview, publish, and mobile would still need to invent their own grouping semantics later

## 11. Open Risks

- Embedded child arrays increase per-object payload size.
- Many current editor and validation paths assume flat top-level object iteration.
- Current mobile smart layout groups DOM nodes heuristically, so later phases must replace or override heuristic grouping with explicit group boundaries.
- Later HTML generation will need stable child addressing without breaking current `data-obj-id` assumptions for existing top-level objects.

Assumption: later phases can introduce stable prepared child addressing derived from `(group.id, child.id)` without requiring a new root-level identity system.

## 12. Recommended Phase 3 Entry Points

- Shared schema and validation in `shared/` for authored `tipo: "grupo"` objects and child payload rules.
- Preview/publish preparation boundary so groups remain explicit in the prepared render contract.
- HTML generator wrapper and data attributes so emitted DOM preserves explicit group boundaries and atomic semantics.
- Mobile smart layout updates so explicit groups are handled as atomic units instead of heuristic overlap clusters.
- Editor data-flow support for load, save, selection, transforms, and history before any grouping UI is exposed.

## 13. Final Decision Summary

Final chosen model:

- explicit first-class container object in `objetos`
- `tipo: "grupo"`
- explicit `children[]` membership
- one section owner
- one anchor family owner
- one outer section-mode owner
- atomic responsive/mobile behavior by default

Rejected alternatives:

- flat sibling objects linked only by `groupId`
- separate root `groups` array
- editor-only grouping metadata

Open risks:

- payload size
- flat-object assumptions in current code
- current mobile heuristic clustering

Recommended next implementation phase:

- Phase 3 should start at shared schema validation and prepared render contract work, then flow into generator/mobile support, and only later into editor grouping UX.
