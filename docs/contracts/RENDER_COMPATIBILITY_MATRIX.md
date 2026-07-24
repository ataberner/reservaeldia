# Render Compatibility Matrix

Status: Canonical Contract.

## Proposito

Este documento resume la compatibilidad real entre:

- editor (`CanvasEditor.jsx` + Konva)
- publishable draft preview HTML (`prepareRenderPayload` + `generateHtmlFromPreparedRenderPayload(..., { isPreview: true })`)
- template/fallback preview HTML (`generarHTMLDesdeSecciones(..., { isPreview: true })`)
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

La columna `Preview` indica que existe salida HTML de preview para esa rama. La paridad publish solo aplica a preview de borrador `draft-authoritative`; template preview (`template-visual`) y fallback local (`local-fallback`) son visuales y no deben usarse como prueba de publish.

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

Drifts explicitamente reconocidos por fixtures:

- `image-crop-materialization`
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
| `texto` | `si` | `soportado` | `soportado` | `soportado` | `parcial` por renderer/metricas | no bloquea por si solo | usar con checklist |
| `imagen` | `si` | `soportado` | `parcial` | `parcial` | `parcial` | puede bloquear por `image-asset-unresolved` o `image-crop-not-materialized` | usar con restricciones |
| `icono` raster | `si` | `soportado` | `soportado` | `parcial` | `alta` si `src` ya es publico | puede bloquear por `icon-asset-unresolved` | usar con restricciones |
| `icono` SVG inline (`tipo='icono'`, `formato='svg'`) | `si` | `soportado` | `soportado` | `soportado` | `alta` | sin warning especifico | usar con checklist |
| `icono-svg` legacy | `si` | `soportado` | `soportado` | `soportado` | `alta` | warning `legacy-icono-svg-frozen` | congelar contrato |
| `galeria` fija | `si` | `soportado` | `soportado` | `parcial` | `parcial` | puede bloquear por `gallery-media-unresolved` | usar con restricciones |
| `galeria` `dynamic_media` | `si` | `soportado` | `soportado` | `parcial` | `parcial` | puede bloquear por `gallery-media-unresolved` | usar con restricciones |
| `countdown` schema v1 | `si` | `soportado` | `soportado` | `soportado` | `parcial`; conserva compatibilidad congelada y `freezeZero` | warning `legacy-countdown-schema-v1-frozen`; target faltante/invalido bloquea | congelar contrato |
| `countdown` schema v2 | `si` | `soportado` | `soportado` | `soportado` | `alta` para SVG fixed/`currentColor`, bytes/transparencia PNG preservados, PNG contenido sin deformacion, seleccion Canvas como union contenido+frame, `frameScale` centrado `0.5..5`, `boxShadow` y distribucion editorial; lifecycle actual `freezeZero` | puede bloquear por `countdown-frame-unresolved`, `countdown-target-missing` o `countdown-target-invalid` | usar con baseline congelado |
| `mapa-google` | `si` | placeholder | `soportado` | omitido | `alta` en preview/publish, no participa en share image | puede bloquear si falta `placeId` o API key para publish | el iframe real se excluye de `share.jpg` |
| `rsvp-boton` | `parcial` | `parcial` | `parcial` | `parcial` | visual alta, funcional parcial; `enabled` normalizado desde legacy decide visibilidad funcional | warning `functional-cta-link-ignored`; `rsvp-missing-root-config` queda como compatibilidad solo si no puede normalizarse raiz | validar contrato completo |
| `regalo-boton` | `parcial` | `parcial` | `parcial` | `parcial` | visual alta, funcional parcial; `enabled` normalizado desde legacy decide visibilidad funcional | warning `gift-no-usable-methods`, warning `gift-modal-field-incomplete`, warning `functional-cta-link-ignored`; `gift-missing-root-config` queda como compatibilidad solo si no puede normalizarse raiz | validar contrato completo |
| fondo de seccion por color | `si` | `soportado` | `soportado` | `soportado` | `alta` | sin warning especifico | usar con checklist |
| fondo base de seccion por imagen | `si` | `soportado` | `soportado` | `parcial` | `parcial` | puede bloquear por `section-background-unresolved` | usar con restricciones |
| decoraciones de fondo | `si` | `soportado` | `soportado` | `parcial` | `parcial` | puede bloquear por `section-decoration-unresolved` | usar con restricciones |
| decoraciones de borde (`decoracionesBorde`) | `si` | `soportado` | `soportado` | `soportado` | `alta` en prepared payload | puede bloquear por `section-edge-decoration-unresolved` | usar con checklist; `intrinsic-clamp` por defecto, `ratio-band` como fallback explicito |
| `forma.rect` | `si` | `soportado` | `soportado` | `soportado` | `parcial` por renderer | sin warning especifico | usar con checklist |
| `forma.circle` | `si` | `soportado` | `soportado` | `soportado` | `parcial` por geometria | sin warning especifico | usar con checklist |
| `forma.line` | `si` | `soportado` | `soportado` | `soportado` | `parcial` por geometria | sin warning especifico | usar con checklist |
| `forma.triangle` | `si` | `soportado` | `soportado` | `soportado` | `parcial` por geometria | sin warning especifico | usar con checklist |
| `forma.diamond` / `star` / `heart` / `arrow` / `pentagon` / `hexagon` / `pill` | `si` | `soportado` | `soportado` | `soportado` | `requiere prueba manual` | solo bloquea si `figura` cae fuera del set soportado | soportado, pero validar manualmente |
| `altoModo: pantalla` + `yNorm` | `si` | `soportado` | `soportado` | `parcial` | `parcial` | warnings `pantalla-ynorm-missing` y `pantalla-ynorm-drift` | usar con restricciones |
| `mobileLayoutMode: preserve` | `si` | `soportado` | `soportado` | `soportado` | `alta` en generated HTML | sin warning especifico actual | opt-out explicito de smart reflow por seccion; preview/publish comparten `data-mobile-layout-mode="preserve"` |
| `functionalAssociation` RSVP/Gifts/Ceremony/Party/Dress Code | `si` en seccion o grupo raiz | `soportado` como render derivado | `soportado` | `soportado` | `alta` si entra por prepared payload | sin blocker propio; valida solo el estado visible final | `rsvp.enabled`/`gifts.enabled`, `eventDetails.mode` y `eventDetails.dressCode.enabled` son la autoridad; secciones/grupos omitidos no mutan geometria |
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
- target de countdown faltante o invalido; una fecha valida ya vencida no bloquea y renderiza `freezeZero`
- crop de imagen no materializable
- CTA funcional visible sin config raiz completa o sin metodos utilizables queda como advertencia/no disponible; `rsvp.enabled` y `gifts.enabled` son la autoridad funcional para CTAs y asociaciones RSVP/Gifts. `eventDetails.mode` es la autoridad funcional para asociaciones Ceremony/Party y `eventDetails.dressCode.enabled` para Dress Code. El campo CTA `hidden` se conserva solo como compatibilidad y se normaliza desde `enabled` durante preparacion de render.
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
