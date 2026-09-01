# Render Compatibility Matrix

Status: Canonical Contract.

## Proposito

Este documento resume la compatibilidad real entre:

- editor (`CanvasEditor.jsx` + Konva)
- publishable draft preview HTML (`prepareRenderPayload` + `generateHtmlFromPreparedRenderPayload(..., { isPreview: true })`)
- admin template-editor preview HTML (`prepareRenderPayload` + `validatePreparedRenderPayload` + `generateHtmlFromPreparedRenderPayload(..., { isPreview: true })`)
- template-card/fallback preview HTML (`generarHTMLDesdeSecciones(..., { isPreview: true })`)
- publish HTML (`prepareRenderPayload` + `generateHtmlFromPreparedRenderPayload`)
- published share image (`publicadas/{slug}/share.jpg`) derived from the first section of generated publish HTML

Refleja implementacion y tests actuales del repositorio. No documenta arquitectura ideal.

La imagen social publicada se documenta en [PUBLISHED_SHARE_IMAGE_CONTRACT.md](PUBLISHED_SHARE_IMAGE_CONTRACT.md). No crea un nuevo mapeo editor -> imagen: debe derivarse del HTML de publish ya generado.

## Anclas reales de compatibilidad

La compatibilidad preview vs publish ya no es difusa. Hoy existe caracterizacion explicita en:

- `shared/previewPublishParity.test.mjs`
- `shared/previewPublishMobileGeometryParity.test.mjs`
- `functions/renderContractCompatibility.test.mjs`
- `functions/publicationPublishValidation.test.mjs`

La columna `Preview` indica que existe salida HTML de preview para esa rama. La paridad publish solo aplica a preview de borrador `draft-authoritative`; template preview (`template-visual`) y fallback local (`local-fallback`) son visuales y no deben usarse como prueba de publish. El editor admin de plantillas comparte el backend `prepare -> validate -> generate` y bloquea HTML invalido, pero conserva `template-visual` porque no recorre el estado personalizado ni el lifecycle de publicacion de un borrador.

Para la imagen social publicada, la ancla de compatibilidad es el HTML de publish generado, no el canvas, no el template preview y no una estructura simplificada. La primera seccion se identifica en el DOM renderizado como el primer `.inv > .sec`.

Casos con paridad compartida caracterizada:

- layout de secciones
- identidad de assets de seccion
- layout de objetos
- identidad de assets de objetos
- materializacion de crop de imagen
- contrato funcional de CTA
- contrato de config `rsvp`
- contrato de config `gifts`
- geometria mobile/reflow opt-in para preview iframe vs publish en `390x844`, `375x812`, y `414x896`

En mobile, el fit posterior al reflow debe mantener completamente dentro del
ancho del viewport a los objetos de contenido e interaccion de `.sec-content`,
incluidos texto, CTA, iconos, Gallery y el wrapper unico de un grupo. El ajuste
puede reducir uniformemente ese lane cuando sea necesario para preservar la
composicion. Los roles `decorative`/`background`, las capas propias de seccion y
el lane `.sec-bleed` no forman parte de ese bounds de contenido: conservan su
geometria de cobertura y pueden extenderse y recortarse lateralmente. Esta
clasificacion es runtime-only y nunca muta `objetos`, `secciones`, `yNorm` ni
estado del editor/Firestore.

En secciones mobile `fijo` con reflow automatico, la unidad de adaptacion no es
siempre cada objeto raiz por separado. El runtime infiere primero unidades de
composicion a partir de solape o proximidad acotada mas alineacion de ejes o
bordes. Cada unidad conserva sus vectores internos de distancia, alineacion y
orden; despues se decide si la unidad completa es anchor o flow y se apilan las
unidades que corresponda. Un `tipo: "grupo"` persistido conserva su contrato
atomico explicito. La inferencia no cruza `.sec-content` con `.sec-bleed`, no
incluye capas propias de seccion y no persiste agrupaciones nuevas. `pantalla`,
`mobileLayoutMode: preserve` y desktop conservan sus ramas existentes.

Una pareja raiz no agrupada que comparte la fila autorada, pero combina un
objeto centrado sobre el eje de la seccion con otro claramente lateral, no se
infiere como una unica unidad. En mobile `fijo` con reflow automatico se apilan
como unidades independientes y cada una se centra en el ancho disponible; si
empatan en `y`, la unidad originalmente centrada conserva precedencia. Esta
regla no separa wrappers de grupo ni objetos con un identificador de composicion
explicito compartido.

En secciones mobile `altoModo: pantalla`, un objeto raiz independiente conserva
la proporcion vertical de `yNorm` respecto del alto visible seguro de la
seccion. El fallback compatible sin `yNorm` deriva la misma proporcion desde
`y / 500`. Cuando varios objetos elegibles forman una composicion espacial en
las coordenadas autoradas `800 x 500`, el runtime conserva un unico anclaje
vertical proporcional para la unidad y escala sus vectores internos con el
ancho final de `.sec-content`; no estira cada `yNorm` de la unidad por separado.
Esta inferencia ocurre despues del fit, no ordena ni apila unidades, no expande
la seccion y no se ejecuta bajo `mobileLayoutMode: preserve`. El wrapper de un
grupo participa como una sola unidad y sus children conservan offsets locales;
Gallery y CTA siguen el mismo contrato de objeto raiz. Las decoraciones de
fondo propias de seccion normalizan su `y` autorado contra los mismos 500 px de
referencia. `.sec-bleed`, fondos y decoraciones de borde mantienen sus owners y
reglas de cover/slot. Esta adaptacion existe solo bajo mobile; desktop conserva
la geometria previa.

El ownership de scroll mobile conserva una sola autoridad efectiva por
superficie. El publish mobile usa el root del documento (`<html>`) y mantiene
`<body>` fuera del scroll vertical después del loader. Los mockups mobile
embebidos que declaran `data-preview-scroll-authority="body"` usan el body-root
del shell como excepción explícita. Ninguna rama intercepta el gesto ni escribe
la posición para simular scroll.

Initial generated-HTML readiness is shared by draft-authoritative preview and
publish. The generated runtime waits for parsed DOM/base geometry and only the
critical render resources in the first section: its base background, edge
decorations, countdown frames, ordinary image objects, gallery cells, and a
bounded request for fonts used there. All first-section network images are
emitted eager/high-priority and as head preloads; subsequent-section images are
lazy/low-priority. It must not gate the invitation loader on global
`window.load`, global font readiness, or resources in later sections. Critical
failure and the single bounded timeout fail closed: the invitation stays
hidden, the canonical loader presents an error and retry action, and a late
readiness event cannot reveal that failed document. The outer preview shell
consumes both `invitation-loader-hidden` and `invitation-runtime-failed`; retry
reloads the public document or remounts the preview iframe.

Prepared asset normalization keeps Storage as authority. It reads object
metadata at most once per path for compatibility assets. A canonical persisted
descriptor (`storagePath`, `storageGeneration`, `storageDownloadToken`) whose
token matches the Firebase download URL skips both metadata and signing reads;
otherwise normalization verifies metadata and falls back to a signed read URL
when necessary. Cropped image source dimensions (`ancho`, `alto`) are persisted
by upload/editor owners. Prepared preview must never download full image bytes
to infer them; a legacy crop without dimensions remains blocked until the
editor migration is flushed. Preview responses omit the duplicated prepared
render payload by default and include it only for explicit diagnostics.

Drifts explicitamente reconocidos por fixtures:

- `object-asset-identity`
- `rsvp-config-contract`
- `gifts-config-contract`

Advertencias de publish que no cuentan como mismatch duro en la suite de paridad:

- `pantalla-ynorm-missing`
- `pantalla-ynorm-drift`
- `fullbleed-editor-drift`
- `gift-no-usable-methods`

## Leyenda

- `soportado`: existe rama explicita en editor, preview y/o publish para el contrato principal
- `parcial`: existe rama, pero depende de assets resueltos, config raiz, o el canvas no representa fielmente la salida HTML
- `no`: no existe rama actual o el contrato no se materializa
- `requiere prueba manual`: hay codigo actual, pero la equivalencia fina no esta congelada por tests representativos

## Matriz

| Item | Persistencia | Editor | Preview | Publish | Paridad hoy | Preflight publish | Decision operativa |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `texto` | `si` | `soportado` | `soportado` | `soportado` | `parcial` por renderer/metricas | no bloquea por si solo | usar con checklist; la personalizacion de lugar/direccion conserva `width` y wrap del objeto vinculado |
| `imagen` | `si` | `soportado` | `parcial` | `parcial` | `parcial` | puede bloquear por `image-asset-unresolved` o `image-crop-not-materialized` | usar con restricciones |
| `icono` raster | `si` | `soportado` | `soportado` | `parcial` | `alta` si `src` ya es publico | puede bloquear por `icon-asset-unresolved` | usar con restricciones |
| `icono` SVG canonico (`tipo='icono'`, `formato='svg'`, `iconRender` v1) | `si` | `soportado` como imagen del snapshot compartido | `soportado` | `soportado` | `alta`: misma composicion/data URL, `contain`, paints fijos y `currentColor` selectivo | bloquea por `icon-svg-canonical-invalid` | contrato moderno para inserciones nuevas |
| `icono` SVG `paths[]` compat | `si` | `soportado` | `soportado` | `soportado` | `alta` dentro del contrato historico de paths/fill unico | bloquea por `icon-svg-geometry-missing` si queda vacio | adapter congelado; no usar para inserciones nuevas |
| `icono-svg` legacy | `si` | `soportado` | `soportado` | `soportado` | `alta` | warning `legacy-icono-svg-frozen` | congelar contrato |
| `galeria` fija | `si` | `soportado` | `soportado` | `parcial` | `parcial` | puede bloquear por `gallery-media-unresolved` | usar con restricciones |
| `galeria` `dynamic_media` | `si` | `soportado` | `soportado` | `parcial` | `parcial` | puede bloquear por `gallery-media-unresolved` | usar con restricciones |
| `countdown` schema v1 | `si` | `soportado` | `soportado` | `soportado` | `parcial`; conserva compatibilidad congelada y `freezeZero` | warning `legacy-countdown-schema-v1-frozen`; target faltante/invalido bloquea | congelar contrato |
| `countdown` schema v2 | `si` | `soportado` | `soportado` | `soportado` | `alta`: contrato compartido para geometria/distribucion/`gap` decimal/separadores, stacking frame-chip-texto, tipografia, SVG fixed/`currentColor`, bytes/transparencia PNG preservados, PNG contenido sin deformacion, seleccion Canvas como union contenido+frame, `frameScale` centrado `0.5..5`, `boxShadow` y distribucion editorial; lifecycle actual `freezeZero` | puede bloquear por `countdown-frame-unresolved`, `countdown-target-missing` o `countdown-target-invalid` | usar con baseline congelado |
| `mapa-google` | `si` | placeholder | `soportado` | omitido | `alta` en preview/publish, no participa en share image | puede bloquear si falta `placeId` o API key para publish | el iframe real se excluye de `share.jpg` |
| `rsvp-boton` | `parcial` | `parcial` | `parcial` | `parcial` | visual alta, funcional parcial; `enabled` normalizado desde legacy decide visibilidad funcional y `questions[].options` explicitas conservan membresia en preview/publish | warning `functional-cta-link-ignored`; `rsvp-missing-root-config` queda como compatibilidad solo si no puede normalizarse raiz | validar contrato completo |
| `regalo-boton` | `parcial` | `parcial` | `parcial` | `parcial` | visual alta, funcional parcial; `enabled` normalizado desde legacy decide visibilidad funcional | warning `gift-no-usable-methods`, warning `gift-modal-field-incomplete`, warning `functional-cta-link-ignored`; `gift-missing-root-config` queda como compatibilidad solo si no puede normalizarse raiz | validar contrato completo |
| fondo de seccion por color | `si` | `soportado` | `soportado` | `soportado` | `alta` | sin warning especifico | usar con checklist |
| fondo base de seccion por imagen | `si` | `soportado` | `soportado` | `parcial` | `parcial` | puede bloquear por `section-background-unresolved` | usar con restricciones |
| decoraciones de fondo | `si` | `soportado` | `soportado` | `parcial` | `parcial` | puede bloquear por `section-decoration-unresolved` | usar con restricciones |
| decoraciones de borde (`decoracionesBorde`) | `si` | `soportado` | `soportado` | `soportado` | `alta` en prepared payload | puede bloquear por `section-edge-decoration-unresolved` | usar con checklist; `intrinsic-clamp` por defecto, `ratio-band` como fallback explicito |
| divisores SVG de seccion (`divisores`) | `si` | `soportado` | `soportado` | `soportado` | `alta`; canvas y HTML usan el mismo catalogo/path y una sola autoridad visible por union | no requiere asset ni blocker propio | section-owned, pointer-inert, fuera de `.objeto`, z-index y smart layout; `top` de la seccion siguiente prevalece si el `bottom` anterior reclama la misma union |
| `forma.rect` | `si` | `soportado` | `soportado` | `soportado` | `parcial` por renderer | sin warning especifico | usar con checklist |
| `forma.circle` | `si` | `soportado` | `soportado` | `soportado` | `parcial` por geometria | sin warning especifico | usar con checklist |
| `forma.line` | `si` | `soportado` | `soportado` | `soportado` | `parcial` por geometria | sin warning especifico | usar con checklist |
| `forma.triangle` | `si` | `soportado` | `soportado` | `soportado` | `parcial` por geometria | sin warning especifico | usar con checklist |
| `forma.diamond` / `star` / `heart` / `arrow` / `pentagon` / `hexagon` / `pill` | `si` | `soportado` | `soportado` | `soportado` | `requiere prueba manual` | solo bloquea si `figura` cae fuera del set soportado | soportado, pero validar manualmente |
| `altoModo: pantalla` + `yNorm` | `si` | `soportado` | `soportado` | `parcial` | `parcial`; preview autoritativa/publish comparten proporcion vertical mobile | warnings `pantalla-ynorm-missing` y `pantalla-ynorm-drift` | mobile preserva `yNorm` contra el alto visible; usar con restricciones por warnings legacy |
| `mobileLayoutMode: preserve` | `si` | `soportado` | `soportado` | `soportado` | `alta` en generated HTML | sin warning especifico actual | opt-out explicito de smart reflow por seccion; preview/publish comparten `data-mobile-layout-mode="preserve"` |
| composicion mobile inferida (`fijo`/`auto`) | no agrega persistencia | no cambia grupos ni geometria autorada | `soportado` | `soportado` | `alta` en draft-authoritative preview/publish | sin warning especifico actual | infiere unidades por relaciones geometricas antes de anchor/flow; preserva vectores internos, grupos explicitos y separacion content/fullbleed |
| composicion mobile inferida (`pantalla`) | no agrega persistencia | no cambia `yNorm`, grupos ni geometria autorada | `soportado` | `soportado` | `alta` en draft-authoritative preview/publish | sin warning especifico actual | proyecta relaciones a `800 x 500`, conserva un anclaje vertical proporcional por unidad y escala offsets internos con content fit; sin ordering, stack ni expansion |
| contencion mobile de contenido | no agrega persistencia | no cambia geometria autorada | `soportado` | `soportado` | `alta` en draft-authoritative preview/publish | sin warning especifico actual | `.sec-content` mantiene contenido/interaccion dentro del viewport; roles decorativos, capas de seccion y `.sec-bleed` conservan crop tipo cover |
| `functionalAssociation` RSVP/Gifts/Ceremony/Party/Dress Code/Countdown | `si` en seccion o grupo raiz; Countdown solo en seccion | `soportado` como render derivado | `soportado` | `soportado` | `alta` si entra por prepared payload | sin blocker propio; valida solo el estado visible final | `rsvp.enabled`/`gifts.enabled`, `eventDetails.mode`, `eventDetails.dressCode.enabled` y `mostrarCuentaRegresiva` del Countdown contenido son la autoridad; secciones/grupos omitidos no mutan geometria |
| `anclaje: fullbleed` | `si` | `parcial` | `soportado` | `soportado` | `parcial` porque el canvas no representa la salida final | warning `fullbleed-editor-drift` | congelar contrato |
| `enlace` | `si` | `parcial` | `soportado` | `soportado` | `parcial` | CTA funcional ignora `enlace` | usar con restricciones |
| `motionEffect` | `si` | `parcial` | `soportado` | `soportado` | `parcial` porque la animacion real vive en HTML | no tiene warning especifico actual | validar en HTML |
| published share image | `publicadas.share` + `publicadas/{slug}/share.jpg` | no | no | artefacto derivado de publish HTML | deriva de la primera `.inv > .sec`; no agrega mapeo editor/render | bloquea publish si no se genera y confirma como JPEG `1200x630` | usar [PUBLISHED_SHARE_IMAGE_CONTRACT.md](PUBLISHED_SHARE_IMAGE_CONTRACT.md) |

For published share image readiness, the renderer uses the generated publish
HTML, isolates the first `.inv > .sec` inside the browser context, and waits
only for images inside that captured section. Images in later sections are
diagnostic input, not blockers for `share.jpg`.

Gallery-specific behavior is summarized in [`GALLERY_SYSTEM_CONTRACT.md`](GALLERY_SYSTEM_CONTRACT.md). Global Gallery viewer behavior is owned by [`GALLERY_VIEWER_RENDER_CONTRACT.md`](GALLERY_VIEWER_RENDER_CONTRACT.md). The matrix rows above describe current render support and current publish blockers. Photo-count presets `grid_count_1` through `grid_count_16` remain within the fixed `galeria` row and must use the same generated HTML markers and viewer runtime. Global viewer behavior is generated-HTML based and is covered by render compatibility, publication validation, preview/publish parity, and mobile geometry parity tests for multi-Gallery collection, duplicate handling, and clicked-photo index mapping.

## Bloqueadores y advertencias por tipo de riesgo

Bloqueadores de publish hoy:

- assets sin resolver para `imagen`, `icono` raster, `galeria`, `countdown` v2, fondos de seccion, decoraciones de fondo y decoraciones de borde
- snapshots SVG canonicos invalidos y objetos SVG compat sin geometria bloquean antes de generar publish; un catalog asset original no reemplaza el snapshot persistido
- target de countdown faltante o invalido; una fecha valida ya vencida no bloquea y renderiza `freezeZero`
- crop de imagen no materializable
- CTA funcional visible sin config raiz completa o sin metodos utilizables queda como advertencia/no disponible; `rsvp.enabled` y `gifts.enabled` son la autoridad funcional para CTAs y asociaciones RSVP/Gifts. `eventDetails.mode` es la autoridad funcional para asociaciones Ceremony/Party, `eventDetails.dressCode.enabled` para Dress Code y `mostrarCuentaRegresiva` para la asociacion de seccion Countdown. El campo CTA `hidden` se conserva solo como compatibilidad y se normaliza desde `enabled` durante preparacion de render.
- `figura` fuera del set soportado de publish
- referencia de seccion faltante

Advertencias de publish hoy:

- contratos legacy congelados (`countdown` v1, `icono-svg`)
- drift de `pantalla` entre `y` y `yNorm`
- `fullbleed` no representado de la misma forma en canvas
- CTA funcional sin config raiz completa o sin metodos de regalo utilizables
- `enlace` ignorado en CTA funcionales

## Reglas practicas

- No tratar una figura como "editor-only" si existe rama real en `generarHTMLDesdeObjetos.ts` y en `publicationPublishValidation.ts`.
- No tratar una rama como "soportada" solo porque existe HTML. Si depende de assets resueltos o config raiz, queda `parcial`.
- Para preview vs publish, la fuente de verdad actual es la combinacion de `previewPublishParity`, `prepareRenderPayload`, y `validatePreparedRenderPayload`, no inspeccion manual aislada del canvas.
- Para imagen social publicada, usar solo el HTML de publish generado como fuente visual. El renderer debe esperar `document.readyState === "complete"`, `document.fonts.ready`, carga/error de imagenes de la primera seccion, al menos dos animation frames, y el asentamiento acotado de animaciones/transiciones finitas de entrada en la primera seccion; luego debe validar un clip finito y capturar el primer `.inv > .sec` en `1200x630`. Los loops infinitos/decorativos y las secciones no capturadas no deben bloquear la captura.
- La imagen social publicada es un artefacto obligatorio de publish. Si el renderer excede su presupuesto backend, encuentra error, o el `share.jpg` no se confirma como JPEG `1200x630`, el publish falla de forma controlada y no debe persistir una publicacion exitosa con fallback generico. El presupuesto actual incluye cold start de Chromium y reserva tiempo final para screenshot. El HTML final nunca debe publicar un `og:image` faltante.
- Para cambios de roles de imagen, usar tambien [IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md](IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md). Ese contrato define la semantica normativa de conversion: una imagen normal convertida en visual propio de seccion debe eliminar el objeto original.
- Para cambios mobile/reflow, usar `shared/previewPublishMobileGeometryParity.test.mjs`. La captura browser completa es opt-in con `PREVIEW_PUBLISH_MOBILE_GEOMETRY=1`; los tests deterministas cubren fixtures, tolerancias y diff shape.
- Si un cambio toca `imagen`, galerias, CTA funcionales, `pantalla/yNorm` o `fullbleed`, ejecutar tambien [EDITOR_REGRESSION_CHECKLIST.md](../testing/EDITOR_REGRESSION_CHECKLIST.md).

## Assumption

- La equivalencia visual exacta de las formas publicadas menos comunes (`diamond`, `star`, `heart`, `arrow`, `pentagon`, `hexagon`) no esta congelada por fixtures especificos del mismo nivel que `pill`. El soporte de rama esta confirmado en codigo y validation, pero la paridad fina sigue requiriendo prueba manual.
