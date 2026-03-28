# Render Compatibility Matrix

## Proposito

Este documento resume la compatibilidad real entre:

- editor (`CanvasEditor.jsx` + Konva)
- preview HTML (`generarHTMLDesdeSecciones(..., { isPreview: true })`)
- publish HTML (`preparePublicationRenderState` + `generarHTMLDesdeSecciones`)

Refleja implementacion y tests actuales del repositorio. No documenta arquitectura ideal.

## Anclas reales de compatibilidad

La compatibilidad preview vs publish ya no es difusa. Hoy existe caracterizacion explicita en:

- `shared/previewPublishParity.test.mjs`
- `functions/renderContractCompatibility.test.mjs`
- `functions/publicationPublishValidation.test.mjs`

Casos con paridad compartida caracterizada:

- layout de secciones
- identidad de assets de seccion
- layout de objetos
- identidad de assets de objetos
- materializacion de crop de imagen
- contrato funcional de CTA
- contrato de config `rsvp`
- contrato de config `gifts`

Drifts explicitamente reconocidos por fixtures:

- `image-crop-materialization`
- `object-asset-identity`
- `rsvp-config-contract`
- `gifts-config-contract`

Advertencias de publish que no cuentan como mismatch duro en la suite de paridad:

- `pantalla-ynorm-missing`
- `pantalla-ynorm-drift`
- `fullbleed-editor-drift`
- `rsvp-missing-root-config`
- `gift-missing-root-config`
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
| `countdown` schema v1 | `si` | `soportado` | `soportado` | `soportado` | `parcial` | warning `legacy-countdown-schema-v1-frozen` | congelar contrato |
| `countdown` schema v2 | `si` | `soportado` | `soportado` | `parcial` | `parcial` | puede bloquear por `countdown-frame-unresolved` | usar con restricciones |
| `rsvp-boton` | `parcial` | `parcial` | `parcial` | `parcial` | visual alta, funcional parcial | warning `rsvp-missing-root-config`, blocker `rsvp-disabled-with-button`, warning `functional-cta-link-ignored` | validar contrato completo |
| `regalo-boton` | `parcial` | `parcial` | `parcial` | `parcial` | visual alta, funcional parcial | warning `gift-missing-root-config`, warning `gift-no-usable-methods`, warning `gift-modal-field-incomplete`, blocker `gift-disabled-with-button`, warning `functional-cta-link-ignored` | validar contrato completo |
| fondo de seccion por color | `si` | `soportado` | `soportado` | `soportado` | `alta` | sin warning especifico | usar con checklist |
| fondo base de seccion por imagen | `si` | `soportado` | `soportado` | `parcial` | `parcial` | puede bloquear por `section-background-unresolved` | usar con restricciones |
| decoraciones de fondo | `si` | `soportado` | `soportado` | `parcial` | `parcial` | puede bloquear por `section-decoration-unresolved` | usar con restricciones |
| `forma.rect` | `si` | `soportado` | `soportado` | `soportado` | `parcial` por renderer | sin warning especifico | usar con checklist |
| `forma.circle` | `si` | `soportado` | `soportado` | `soportado` | `parcial` por geometria | sin warning especifico | usar con checklist |
| `forma.line` | `si` | `soportado` | `soportado` | `soportado` | `parcial` por geometria | sin warning especifico | usar con checklist |
| `forma.triangle` | `si` | `soportado` | `soportado` | `soportado` | `parcial` por geometria | sin warning especifico | usar con checklist |
| `forma.diamond` / `star` / `heart` / `arrow` / `pentagon` / `hexagon` / `pill` | `si` | `soportado` | `soportado` | `soportado` | `requiere prueba manual` | solo bloquea si `figura` cae fuera del set soportado | soportado, pero validar manualmente |
| `altoModo: pantalla` + `yNorm` | `si` | `soportado` | `soportado` | `parcial` | `parcial` | warnings `pantalla-ynorm-missing` y `pantalla-ynorm-drift` | usar con restricciones |
| `anclaje: fullbleed` | `si` | `parcial` | `soportado` | `soportado` | `parcial` porque el canvas no representa la salida final | warning `fullbleed-editor-drift` | congelar contrato |
| `enlace` | `si` | `parcial` | `soportado` | `soportado` | `parcial` | CTA funcional ignora `enlace` | usar con restricciones |
| `motionEffect` | `si` | `parcial` | `soportado` | `soportado` | `parcial` porque la animacion real vive en HTML | no tiene warning especifico actual | validar en HTML |

## Bloqueadores y advertencias por tipo de riesgo

Bloqueadores de publish hoy:

- assets sin resolver para `imagen`, `icono` raster, `galeria`, `countdown` v2, fondos de seccion y decoraciones
- crop de imagen no materializable
- CTA funcional con config raiz deshabilitada
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
- Para preview vs publish, la fuente de verdad actual es la combinacion de `previewPublishParity` y de `validatePreparedPublicationRenderState`, no inspeccion manual aislada del canvas.
- Si un cambio toca `imagen`, galerias, CTA funcionales, `pantalla/yNorm` o `fullbleed`, ejecutar tambien [EDITOR_REGRESSION_CHECKLIST.md](/c:/Reservaeldia/docs/testing/EDITOR_REGRESSION_CHECKLIST.md).

## Assumption

- La equivalencia visual exacta de las formas publicadas menos comunes (`diamond`, `star`, `heart`, `arrow`, `pentagon`, `hexagon`) no esta congelada por fixtures especificos del mismo nivel que `pill`. El soporte de rama esta confirmado en codigo y validation, pero la paridad fina sigue requiriendo prueba manual.
