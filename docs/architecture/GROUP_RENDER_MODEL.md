# GROUP RENDER MODEL

> Current grouped-object render contract for `tipo: "grupo"`.

## 1. Purpose

Groups preserve a composition of render objects as one authored object in `objetos`.
The group wrapper owns section placement and mobile layout identity. Its children remain
normal render objects, but their coordinates are local to the group frame.

## 2. Stored Shape

```ts
{
  id: string,
  tipo: "grupo",
  seccionId: string,
  anclaje?: "content" | "fullbleed",
  x: number,
  y: number,
  yNorm?: number,
  width: number,
  height: number,
  children: RenderObjectChild[],
}
```

Child objects use the same object-family contracts as root objects (`texto`, `imagen`,
`forma`, `countdown`, `galeria`, `rsvp-boton`, `regalo-boton`, and compatible legacy
families), with these group-local differences:

- `x` and `y` are relative to the group wrapper.
- `seccionId` belongs to the group, not the child.
- `anclaje` belongs to the group, not the child.
- `yNorm` belongs to the group in `altoModo: "pantalla"` sections, not the child.
- Nested groups are not supported in the v1 contract.

## 3. Render Invariants

- The group wrapper renders as the top-level `.objeto` and keeps `data-obj-id` for the
  authored group id.
- Children render nested under the wrapper with `data-group-id` and
  `data-group-child-id`; they do not expose top-level `data-obj-id`.
- Mobile smart layout treats the group wrapper as one isolated layout unit.
- Group child rendering must delegate to the same object renderer used by top-level
  objects. There must not be a separate typography, image, shape, CTA, countdown, or
  gallery rendering path for grouped children.
- Full-document collectors must recurse into `children[]` whenever they collect render
  capabilities or document-level dependencies from objects. This includes Google Fonts,
  countdown runtime activation, gallery lightbox activation, and functional CTA presence.

## 4. Typography

Grouped `tipo: "texto"` children use the same typography fields as ungrouped text:
`fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `textDecoration`, `align`,
`lineHeight`, `letterSpacing`, color aliases, stroke, shadow, and mobile text scale
fields.

The HTML renderer applies the same inline text CSS for grouped and ungrouped text.
The full-document Google Fonts collection must include both top-level text objects and
text objects nested inside groups. Missing recursive font collection is contract drift,
because the child still names the font in CSS but the document does not load it.

## 5. Preview And Publish

Draft-authoritative preview and publish both enter the prepared render payload and the
same HTML generator. A valid group must therefore render the same in preview and publish.
Template preview and local fallback preview may be visual-only, but when they use the
shared generator they must respect the same group traversal rules.

