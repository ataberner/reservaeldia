# Render Compatibility Matrix

## Proposito

Este documento formaliza la compatibilidad real entre el editor visual activo, el preview HTML y el publish HTML del proyecto.

Debe usarse antes de tocar:

- el runtime del editor
- el generador HTML compartido
- la persistencia de `objetos`, `secciones`, `rsvp` o `gifts`
- cualquier tipo de objeto o contrato transversal que afecte render

Regla de uso:

- este documento refleja implementacion real del repositorio
- no refleja intencion de producto
- si una rama no existe en codigo, no se considera soporte
- si un item renderiza pero pierde una parte critica del contrato, se marca `parcial`
- si el canvas no representa el resultado publicado, la fuente de verdad para decidir es `publish`, no el editor

## Como usar esta matriz

1. Leer primero `Produccion hoy`, `Bloquea expansion` y `Decision recomendada`.
2. Si `Bloquea expansion = si`, no agregar variantes, estilos ni comportamiento nuevo sobre ese contrato sin alinear primero editor, preview y publish.
3. Si `Produccion hoy = con restricciones`, el item solo es valido bajo las restricciones explicitas listadas en detalle y debe pasar [EDITOR_REGRESSION_CHECKLIST.md](/c:/Reservaeldia/docs/testing/EDITOR_REGRESSION_CHECKLIST.md).
4. Si `Produccion hoy = no`, no debe usarse para contenido nuevo ni para ampliar templates productivos.
5. `Paridad visual` mide parecido visual entre canvas y HTML.
6. `Paridad layout` mide posicion, tamano, anclaje, crop, secciones y reglas geometricas.
7. `Soporte funcional` mide comportamiento end-to-end, no solo la presencia de una caja visual.

## Alcance

Definiciones usadas en esta matriz:

- `Persistencia canonica`: estado guardado dentro del render state moderno (`objetos`, `secciones`, `rsvp`, `gifts`) que `normalizeDraftRenderState` conserva.
- `Editor`: runtime activo basado en `CanvasEditor.jsx` + Konva.
- `Preview`: HTML generado desde dashboard/template preview con `generarHTMLDesdeSecciones(..., { isPreview: true })`.
- `Publish`: HTML generado por `publishDraftToPublic` y materializado en Storage.

Estados usados:

- `si`: existe rama explicita y el contrato principal se materializa.
- `parcial`: existe rama, pero falta una parte importante del contrato o hay drift real entre runtimes.
- `no`: no existe rama explicita o el comportamiento no se materializa.
- `n/a`: la dimension no aplica para ese item.
- `no verificado`: la equivalencia no pudo cerrarse solo leyendo codigo.
- `requiere prueba manual`: hay codigo, pero la equivalencia fina depende de validacion manual.

## Politica de decision

- `seguro con checklist`: contrato usable hoy; se puede tocar con checklist manual y sin abrir expansion de alcance.
- `usar con restricciones`: contrato usable hoy solo bajo limites concretos ya conocidos.
- `alinear antes de extender`: contrato activo, pero sumar features nuevas profundiza drift actual.
- `congelar contrato`: mantener compatibilidad actual; no abrir nuevos casos de uso sobre esa variante.
- `no usar en contenido nuevo`: no debe seguir creciendo ni entrar en templates productivos nuevos.

## Resumen ejecutivo de decision

- `Aptos hoy con checklist manual`: `texto`, `icono` SVG inline, fondo de seccion por color, fondo base de seccion por imagen, `forma.rect`, `forma.circle`, `forma.line`, `forma.triangle`.
- `Aptos hoy con restricciones explicitas`: `imagen`, `icono` raster, `galeria` fija, `galeria dynamic_media`, `countdown` schema v2, `rsvp-boton`, `regalo-boton`, decoraciones de fondo, `enlace`, `altoModo: pantalla + yNorm`.
- `Contratos a congelar temporalmente`: `icono-svg` legacy, `countdown` schema v1, `anclaje: fullbleed`.
- `No usar en contenido nuevo`: `forma.diamond`, `forma.star`, `forma.heart`, `forma.arrow`, `forma.pentagon`, `forma.hexagon`, `forma.pill`.
- `Alinear primero para roadmap`: `imagen`, galerias, `countdown` schema v2, CTA funcionales, `altoModo: pantalla + yNorm`, `motionEffect`, `anclaje: fullbleed`.
- `Drift tolerable hoy`: diferencias de renderer y metricas en `texto`, formulas geometricas entre canvas y HTML para `rect/circle/line/triangle`, diferencias visuales menores en fondos y decoraciones.
- `Drift peligroso hoy`: formas solo-editor, crop de `imagen`, assets no resueltos en publish, CTA acoplados a config raiz, `fullbleed`, `motionEffect`, layout vertical basado en `yNorm`.

## Matriz principal

| Item | Persist. | Editor | Preview | Publish | Paridad visual | Paridad layout | Soporte funcional | Produccion hoy | Bloquea expansion | Drift dominante | Decision recomendada |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `texto` | `si` | `si` | `si` | `si` | `parcial` | `parcial` | `n/a` | `si` | `no` | `renderer/metricas` | `seguro con checklist` |
| `imagen` | `si` | `si` | `parcial` | `parcial` | `parcial` | `parcial` | `n/a` | `con restricciones` | `si` | `render/layout` | `alinear antes de extender` |
| `icono` raster | `si` | `si` | `si` | `parcial` | `alta` | `alta` | `n/a` | `con restricciones` | `no` | `assets` | `usar con restricciones` |
| `icono` SVG inline (`formato: "svg"`) | `si` | `si` | `si` | `si` | `alta` | `alta` | `n/a` | `si` | `no` | `renderer` | `seguro con checklist` |
| `icono-svg` legacy | `si` | `si` | `si` | `si` | `alta` | `alta` | `n/a` | `con restricciones` | `si` | `legacy` | `congelar contrato` |
| `galeria` fija | `si` | `si` | `si` | `parcial` | `parcial` | `parcial` | `si` | `con restricciones` | `si` | `assets/funcional` | `alinear antes de extender` |
| `galeria` `dynamic_media` | `si` | `si` | `si` | `parcial` | `parcial` | `parcial` | `si` | `con restricciones` | `si` | `assets/layout` | `alinear antes de extender` |
| `countdown` schema v1 | `si` | `si` | `si` | `si` | `parcial` | `parcial` | `si` | `con restricciones` | `si` | `legacy/render` | `congelar contrato` |
| `countdown` schema v2 | `si` | `si` | `si` | `parcial` | `parcial` | `parcial` | `si` | `con restricciones` | `si` | `assets/layout` | `alinear antes de extender` |
| `rsvp-boton` | `parcial` | `parcial` | `parcial` | `parcial` | `alta` | `alta` | `parcial` | `con restricciones` | `si` | `funcional` | `alinear antes de extender` |
| `regalo-boton` | `parcial` | `parcial` | `parcial` | `parcial` | `alta` | `alta` | `parcial` | `con restricciones` | `si` | `funcional` | `alinear antes de extender` |
| fondo de seccion por color | `si` | `si` | `si` | `si` | `alta` | `alta` | `n/a` | `si` | `no` | `menor` | `seguro con checklist` |
| fondo base de seccion por imagen | `si` | `si` | `si` | `si` | `parcial` | `parcial` | `n/a` | `si` | `no` | `layout/assets` | `seguro con checklist` |
| decoraciones de fondo de seccion | `si` | `si` | `si` | `si` | `parcial` | `parcial` | `n/a` | `con restricciones` | `no` | `render/parallax` | `usar con restricciones` |
| `forma.rect` | `si` | `si` | `si` | `si` | `parcial` | `alta` | `n/a` | `si` | `no` | `renderer` | `seguro con checklist` |
| `forma.circle` | `si` | `si` | `si` | `si` | `parcial` | `parcial` | `n/a` | `si` | `no` | `geometria` | `seguro con checklist` |
| `forma.line` | `si` | `si` | `si` | `si` | `parcial` | `parcial` | `n/a` | `si` | `no` | `geometria` | `seguro con checklist` |
| `forma.triangle` | `si` | `si` | `si` | `si` | `parcial` | `parcial` | `n/a` | `si` | `no` | `geometria` | `seguro con checklist` |
| `forma.diamond` | `si` | `si` | `no` | `no` | `no` | `no` | `n/a` | `no` | `si` | `editor-only` | `no usar en contenido nuevo` |
| `forma.star` | `si` | `si` | `no` | `no` | `no` | `no` | `n/a` | `no` | `si` | `editor-only` | `no usar en contenido nuevo` |
| `forma.heart` | `si` | `si` | `no` | `no` | `no` | `no` | `n/a` | `no` | `si` | `editor-only` | `no usar en contenido nuevo` |
| `forma.arrow` | `si` | `si` | `no` | `no` | `no` | `no` | `n/a` | `no` | `si` | `editor-only` | `no usar en contenido nuevo` |
| `forma.pentagon` | `si` | `si` | `no` | `no` | `no` | `no` | `n/a` | `no` | `si` | `editor-only` | `no usar en contenido nuevo` |
| `forma.hexagon` | `si` | `si` | `no` | `no` | `no` | `no` | `n/a` | `no` | `si` | `editor-only` | `no usar en contenido nuevo` |
| `forma.pill` | `si` | `si` | `no` | `no` | `no` | `no` | `n/a` | `no` | `si` | `editor-only` | `no usar en contenido nuevo` |
| `altoModo: pantalla` + `yNorm` | `si` | `si` | `si` | `si` | `parcial` | `parcial` | `n/a` | `con restricciones` | `si` | `layout/responsive` | `alinear antes de extender` |
| `anclaje: fullbleed` | `si` | `no` | `si` | `si` | `no` | `no` | `n/a` | `no` | `si` | `html-only` | `congelar contrato` |
| `enlace` | `si` | `parcial` | `si` | `si` | `n/a` | `alta` | `parcial` | `con restricciones` | `no` | `html-only/funcional` | `usar con restricciones` |
| `motionEffect` | `si` | `parcial` | `si` | `si` | `parcial` | `n/a` | `parcial` | `con restricciones` | `si` | `html-only/animacion` | `alinear antes de extender` |

## Politica operativa para contratos con drift

### Objetos solo-editor

- `forma.diamond`, `forma.star`, `forma.heart`, `forma.arrow`, `forma.pentagon`, `forma.hexagon` y `forma.pill` no deben considerarse aptos para contenido productivo nuevo.
- Un `OK` en editor no valida preview ni publish para estos items.
- No conviene agregar estilos, presets ni nuevas variantes sobre estas formas hasta que exista materializacion HTML real.
- Si aparecen en contenido existente, tratarlos como compatibilidad limitada, no como base para expansion.

### Contratos HTML-only o con authoring incompleto

- `anclaje: fullbleed` existe en preview/publish, pero no tiene equivalente real en el canvas.
- `motionEffect` se configura en editor, pero la animacion real solo existe en runtime HTML.
- `enlace` se persiste en editor, pero el comportamiento funcional solo existe en preview/publish y excluye `rsvp-boton` y `regalo-boton`.
- Para estos contratos, la apariencia del canvas no es prueba suficiente de paridad.

### Contratos funcionales acoplados a config raiz

- `rsvp-boton` depende de `rsvp`.
- `regalo-boton` depende de `gifts`.
- El objeto visual por si solo no cierra el contrato.
- Cualquier cambio debe validarse como minimo en editor, preview y salida publica con configuracion raiz real.

### Contratos dependientes de assets ya resueltos

- `imagen` pierde crop en HTML.
- `icono` raster puede fallar en publish si depende de `url` y no de `src` resuelto.
- `galeria` fija y `dynamic_media` dependen de `cells[].mediaUrl` ya resuelto.
- `countdown` schema v2 depende de `frameSvgUrl` ya resuelto para cerrar el contrato visual completo en publish.

## Detalle por item

### `texto`

- `Soporte tecnico`: `Persistencia si`, `Editor si`, `Preview si`, `Publish si`.
- `Paridad`: visual `parcial`; layout `parcial`; funcional `n/a`.
- `Produccion hoy`: `si`.
- `Bloquea expansion`: `no`.
- `Drift dominante`: `renderer/metricas`.
- `Diferencias conocidas`: el editor renderiza texto con Konva y overlay DOM; preview/publish renderizan DOM absoluto desde `generarHTMLDesdeObjetos`.
- `Observaciones tecnicas`: el HTML aplica `mobileTextScaleMode`, `mobileTextScaleMax`, `enlace` y `motionEffect`; el editor no reproduce todas esas capas.
- `Decision recomendada`: `seguro con checklist`.
- `Fuentes verificadas`: `src/components/editor/textSystem/render/konva/ElementoCanvasRenderer.jsx`, `src/components/editor/textSystem/commitPolicy/useInlineCommitPolicy.js`, `functions/src/utils/generarHTMLDesdeObjetos.ts`.

### `imagen`

- `Soporte tecnico`: `Persistencia si`, `Editor si`, `Preview parcial`, `Publish parcial`.
- `Paridad`: visual `parcial`; layout `parcial`; funcional `n/a`.
- `Produccion hoy`: `con restricciones`.
- `Bloquea expansion`: `si`.
- `Drift dominante`: `render/layout`.
- `Diferencias conocidas`: el editor soporta `cropX`, `cropY`, `cropWidth` y `cropHeight`; el HTML solo emite `<img>` sin materializar crop.
- `Observaciones tecnicas`: publish reescribe `src` no-HTTP, pero no resuelve un contrato equivalente al crop del canvas.
- `Consecuencia practica`: hoy es usable si la imagen no depende de crop para verse correcta en publish.
- `Decision recomendada`: `alinear antes de extender`.
- `Fuentes verificadas`: `src/components/editor/textSystem/render/konva/ElementoCanvasRenderer.jsx`, `src/components/editor/textSystem/render/konva/CanvasStageContentComposer.jsx`, `functions/src/utils/generarHTMLDesdeObjetos.ts`.

### Iconos

- `icono` raster:
- `Soporte tecnico`: `Persistencia si`, `Editor si`, `Preview si`, `Publish parcial`.
- `Paridad`: visual `alta`; layout `alta`; funcional `n/a`.
- `Produccion hoy`: `con restricciones`.
- `Bloquea expansion`: `no`.
- `Drift dominante`: `assets`.
- `Diferencias conocidas`: el generador acepta `url || src`, pero publish solo reescribe `src`.
- `Consecuencia practica`: usar con `src` ya resuelto o con URL publica final.

- `icono` SVG inline (`formato: "svg"`):
- `Soporte tecnico`: `Persistencia si`, `Editor si`, `Preview si`, `Publish si`.
- `Paridad`: visual `alta`; layout `alta`; funcional `n/a`.
- `Produccion hoy`: `si`.
- `Bloquea expansion`: `no`.
- `Drift dominante`: `renderer`.
- `Consecuencia practica`: contrato estable para uso productivo con checklist manual.

- `icono-svg` legacy:
- `Soporte tecnico`: `Persistencia si`, `Editor si`, `Preview si`, `Publish si`.
- `Paridad`: visual `alta`; layout `alta`; funcional `n/a`.
- `Produccion hoy`: `con restricciones`.
- `Bloquea expansion`: `si`.
- `Drift dominante`: `legacy`.
- `Consecuencia practica`: mantener compatibilidad; no abrir variantes nuevas sobre esta rama legacy.

- `Decision recomendada`:
- raster `usar con restricciones`
- inline SVG `seguro con checklist`
- legacy `congelar contrato`

- `Fuentes verificadas`: `src/components/editor/textSystem/render/konva/ElementoCanvasRenderer.jsx`, `functions/src/utils/generarHTMLDesdeObjetos.ts`, `functions/src/payments/publicationPayments.ts`.

### Galerias

- `galeria` fija:
- `Soporte tecnico`: `Persistencia si`, `Editor si`, `Preview si`, `Publish parcial`.
- `Paridad`: visual `parcial`; layout `parcial`; funcional `si`.
- `Produccion hoy`: `con restricciones`.
- `Bloquea expansion`: `si`.
- `Drift dominante`: `assets/funcional`.
- `Diferencias conocidas`: publish no reescribe `cells[].mediaUrl`; la galeria funciona si esas URLs ya son finales.

- `galeria` `dynamic_media`:
- `Soporte tecnico`: `Persistencia si`, `Editor si`, `Preview si`, `Publish parcial`.
- `Paridad`: visual `parcial`; layout `parcial`; funcional `si`.
- `Produccion hoy`: `con restricciones`.
- `Bloquea expansion`: `si`.
- `Drift dominante`: `assets/layout`.
- `Diferencias conocidas`: editor y HTML comparten `resolveGalleryRenderLayout`, pero publish sigue dependiendo de `mediaUrl` ya resuelto.

- `Observaciones tecnicas`: esta familia tiene mejor reutilizacion de layout que otros contratos, pero no cierra el problema de materializacion de assets en publish.
- `Consecuencia practica`: usable hoy solo si el pipeline de assets ya entrega `mediaUrl` publicos estables.
- `Decision recomendada`: `alinear antes de extender`.
- `Fuentes verificadas`: `src/components/editor/GaleriaKonva.jsx`, `functions/src/utils/generarHTMLDesdeObjetos.ts`, `shared/templates/galleryDynamicLayout.js`, `functions/src/utils/generarModalGaleria.ts`.

### Countdowns

- `countdown` schema v1:
- `Soporte tecnico`: `Persistencia si`, `Editor si`, `Preview si`, `Publish si`.
- `Paridad`: visual `parcial`; layout `parcial`; funcional `si`.
- `Produccion hoy`: `con restricciones`.
- `Bloquea expansion`: `si`.
- `Drift dominante`: `legacy/render`.
- `Consecuencia practica`: util para compatibilidad existente, no como base para evolucion del sistema.

- `countdown` schema v2:
- `Soporte tecnico`: `Persistencia si`, `Editor si`, `Preview si`, `Publish parcial`.
- `Paridad`: visual `parcial`; layout `parcial`; funcional `si`.
- `Produccion hoy`: `con restricciones`.
- `Bloquea expansion`: `si`.
- `Drift dominante`: `assets/layout`.
- `Diferencias conocidas`: `frameSvgUrl` se usa tal como llega; publish no lo reescribe de forma general.
- `Observaciones tecnicas`: el layout es mas rico que v1 y hoy es el contrato que mas conviene estabilizar si se va a seguir invirtiendo en countdowns.
- `Consecuencia practica`: usable hoy si `frameSvgUrl` ya es URL final y si se valida visualmente publish.

- `Decision recomendada`:
- v1 `congelar contrato`
- v2 `alinear antes de extender`

- `Fuentes verificadas`: `src/components/editor/countdown/CountdownKonva.jsx`, `src/domain/countdownPresets/toCanvasPatch.js`, `functions/src/utils/generarHTMLDesdeObjetos.ts`, `functions/src/utils/generarHTMLDesdeSecciones.ts`.

### CTA funcionales

- `rsvp-boton`:
- `Soporte tecnico`: `Persistencia parcial`, `Editor parcial`, `Preview parcial`, `Publish parcial`.
- `Paridad`: visual `alta`; layout `alta`; funcional `parcial`.
- `Produccion hoy`: `con restricciones`.
- `Bloquea expansion`: `si`.
- `Drift dominante`: `funcional`.
- `Diferencias conocidas`: el boton renderiza, pero la experiencia completa depende de `rsvp` en raiz y preview no envia RSVP real.

- `regalo-boton`:
- `Soporte tecnico`: `Persistencia parcial`, `Editor parcial`, `Preview parcial`, `Publish parcial`.
- `Paridad`: visual `alta`; layout `alta`; funcional `parcial`.
- `Produccion hoy`: `con restricciones`.
- `Bloquea expansion`: `si`.
- `Drift dominante`: `funcional`.
- `Diferencias conocidas`: el boton renderiza, pero la experiencia completa depende de `gifts` en raiz.

- `Observaciones tecnicas`: el contrato real es `objeto en canvas + config raiz + runtime HTML`.
- `Consecuencia practica`: el boton visual no valida por si solo el feature.
- `Decision recomendada`: `alinear antes de extender`.
- `Fuentes verificadas`: `src/components/editor/events/useEditorEvents.js`, `functions/src/utils/generarHTMLDesdeObjetos.ts`, `functions/src/utils/generarModalRSVP.ts`, `functions/src/utils/generarModalRegalos.ts`.

### Fondos y decoraciones de seccion

- fondo de seccion por color:
- `Soporte tecnico`: `Persistencia si`, `Editor si`, `Preview si`, `Publish si`.
- `Paridad`: visual `alta`; layout `alta`; funcional `n/a`.
- `Produccion hoy`: `si`.
- `Bloquea expansion`: `no`.
- `Decision recomendada`: `seguro con checklist`.

- fondo base de seccion por imagen:
- `Soporte tecnico`: `Persistencia si`, `Editor si`, `Preview si`, `Publish si`.
- `Paridad`: visual `parcial`; layout `parcial`; funcional `n/a`.
- `Produccion hoy`: `si`.
- `Bloquea expansion`: `no`.
- `Drift dominante`: `layout/assets`.
- `Diferencias conocidas`: editor usa transformacion y clipping propios; HTML materializa offsets y scale con otro renderer.
- `Decision recomendada`: `seguro con checklist`.

- decoraciones de fondo de seccion:
- `Soporte tecnico`: `Persistencia si`, `Editor si`, `Preview si`, `Publish si`.
- `Paridad`: visual `parcial`; layout `parcial`; funcional `n/a`.
- `Produccion hoy`: `con restricciones`.
- `Bloquea expansion`: `no`.
- `Drift dominante`: `render/parallax`.
- `Diferencias conocidas`: el editor las ve estaticas; HTML puede sumar runtime de parallax.
- `Decision recomendada`: `usar con restricciones`.

- `Fuentes verificadas`: `src/components/editor/FondoSeccion.jsx`, `functions/src/utils/generarHTMLDesdeSecciones.ts`, `functions/src/utils/sectionBackground.ts`, `functions/src/payments/publicationPayments.ts`.

### Formas con soporte completo en editor, preview y publish

- `forma.rect`, `forma.circle`, `forma.line`, `forma.triangle`:
- `Soporte tecnico`: `Persistencia si`, `Editor si`, `Preview si`, `Publish si`.
- `Paridad`: visual `parcial`; layout `alta/parcial` segun la forma.
- `Produccion hoy`: `si`.
- `Bloquea expansion`: `no`.
- `Drift dominante`: `renderer` en `rect`; `geometria` en `circle`, `line` y `triangle`.
- `Diferencias conocidas`: el HTML reinterpreta formulas geometricas para `circle`, `line` y `triangle`; `rect` ademas traduce texto embebido a DOM flex.
- `Consecuencia practica`: son las formas mas seguras para trabajar hoy, pero siguen requiriendo checklist manual cuando se tocan transformaciones o generacion HTML.
- `Decision recomendada`: `seguro con checklist`.
- `Fuentes verificadas`: `src/components/editor/textSystem/render/konva/ElementoCanvasRenderer.jsx`, `src/components/editor/textSystem/render/konva/CanvasStageContentComposer.jsx`, `functions/src/utils/generarHTMLDesdeObjetos.ts`.

### Formas solo-editor

- `forma.diamond`, `forma.star`, `forma.heart`, `forma.arrow`, `forma.pentagon`, `forma.hexagon`, `forma.pill`:
- `Soporte tecnico`: `Persistencia si`, `Editor si`, `Preview no`, `Publish no`.
- `Paridad`: visual `no`; layout `no`; funcional `n/a`.
- `Produccion hoy`: `no`.
- `Bloquea expansion`: `si`.
- `Drift dominante`: `editor-only`.
- `Diferencias conocidas`: existen en Konva e insertion defaults, pero no tienen rama equivalente en `generarHTMLDesdeObjetos`.
- `Consecuencia practica`: un template que dependa de estas formas no tiene contrato de salida publica real.
- `Decision recomendada`: `no usar en contenido nuevo`.
- `Fuentes verificadas`: `src/components/editor/events/computeInsertDefaults.js`, `src/components/editor/textSystem/render/konva/ElementoCanvasRenderer.jsx`, `functions/src/utils/generarHTMLDesdeObjetos.ts`.

### `altoModo: pantalla` + `yNorm`

- `Soporte tecnico`: `Persistencia si`, `Editor si`, `Preview si`, `Publish si`.
- `Paridad`: visual `parcial`; layout `parcial`; funcional `n/a`.
- `Produccion hoy`: `con restricciones`.
- `Bloquea expansion`: `si`.
- `Drift dominante`: `layout/responsive`.
- `Diferencias conocidas`: el editor usa `ALTURA_PANTALLA_EDITOR` y migra `yNorm` al cargar; el HTML usa referencia fija y variables CSS propias.
- `Observaciones tecnicas`: es un contrato central del layout vertical y cualquier deriva aqui impacta muchas categorias de objetos.
- `Consecuencia practica`: no conviene sumar nueva logica de responsive vertical ni nuevos atajos de posicionamiento sin alinear antes este contrato.
- `Decision recomendada`: `alinear antes de extender`.
- `Fuentes verificadas`: `src/components/editor/persistence/useBorradorSync.js`, `src/components/editor/textSystem/render/konva/CanvasStageContentComposer.jsx`, `functions/src/utils/generarHTMLDesdeObjetos.ts`.

### `anclaje: fullbleed`

- `Soporte tecnico`: `Persistencia si`, `Editor no`, `Preview si`, `Publish si`.
- `Paridad`: visual `no`; layout `no`; funcional `n/a`.
- `Produccion hoy`: `no`.
- `Bloquea expansion`: `si`.
- `Drift dominante`: `html-only`.
- `Diferencias conocidas`: el HTML separa objetos bleed y content; el editor no materializa esa semantica.
- `Consecuencia practica`: no debe abrirse trabajo nuevo sobre `fullbleed` desde el editor mientras el canvas no represente el contrato real.
- `Decision recomendada`: `congelar contrato`.
- `Fuentes verificadas`: `functions/src/utils/generarHTMLDesdeSecciones.ts`, `functions/src/utils/generarHTMLDesdeObjetos.ts`, `src/domain/templates/previewTextPositionSnapshot.js`.

### `enlace`

- `Soporte tecnico`: `Persistencia si`, `Editor parcial`, `Preview si`, `Publish si`.
- `Paridad`: visual `n/a`; layout `alta`; funcional `parcial`.
- `Produccion hoy`: `con restricciones`.
- `Bloquea expansion`: `no`.
- `Drift dominante`: `html-only/funcional`.
- `Diferencias conocidas`: el editor lo configura y persiste; preview/publish envuelven en `<a>`; el generador omite ese wrapping para `rsvp-boton` y `regalo-boton`.
- `Consecuencia practica`: el comportamiento debe validarse en HTML generado, no en canvas.
- `Decision recomendada`: `usar con restricciones`.
- `Fuentes verificadas`: `src/components/MenuOpcionesElemento.jsx`, `functions/src/utils/generarHTMLDesdeObjetos.ts`.

### `motionEffect`

- `Soporte tecnico`: `Persistencia si`, `Editor parcial`, `Preview si`, `Publish si`.
- `Paridad`: visual `parcial`; layout `n/a`; funcional `parcial`.
- `Produccion hoy`: `con restricciones`.
- `Bloquea expansion`: `si`.
- `Drift dominante`: `html-only/animacion`.
- `Diferencias conocidas`: el editor configura y persiste `motionEffect`, pero la animacion real solo existe en runtime HTML.
- `Observaciones tecnicas`: el runtime HTML tiene reglas especificas para galerias, countdowns y CTA RSVP, no una proyeccion visible en canvas.
- `Consecuencia practica`: no usar el canvas como validacion suficiente para efectos.
- `Decision recomendada`: `alinear antes de extender`.
- `Fuentes verificadas`: `src/domain/motionEffects/index.js`, `functions/src/utils/generarHTMLDesdeObjetos.ts`, `functions/src/utils/generarMotionEffectsRuntime.ts`.

## Zonas de mayor riesgo actual

### 1. Drift de render

- `imagen`: el editor soporta crop y el HTML no.
- `forma.diamond`, `forma.star`, `forma.heart`, `forma.arrow`, `forma.pentagon`, `forma.hexagon`, `forma.pill`: solo existen en editor.
- `anclaje: fullbleed`: existe en HTML, no en el canvas.
- `Consecuencia operativa`: no sumar nuevas variantes de render ni nuevas formas hasta cerrar primero la salida HTML real.

### 2. Drift de assets

- `icono` raster depende de `src` resuelto para cerrar publish.
- `galeria` fija y `dynamic_media` dependen de `cells[].mediaUrl` ya resuelto.
- `countdown` schema v2 depende de `frameSvgUrl` ya resuelto.
- `Consecuencia operativa`: cualquier trabajo que toque assets debe validar publish real, no solo preview o editor.

### 3. Drift funcional

- `rsvp-boton` depende de `rsvp` raiz y preview no envia RSVP real.
- `regalo-boton` depende de `gifts` raiz.
- `enlace` no aplica a CTA funcionales aunque el campo exista.
- `Consecuencia operativa`: el objeto visual no alcanza; hay que validar contrato completo de datos y runtime publico.

### 4. Drift de layout y responsive

- `altoModo: pantalla` + `yNorm` es la zona mas sensible del layout vertical.
- `texto` depende de metricas distintas entre Konva y DOM.
- `circle`, `line` y `triangle` usan formulas geometricas diferentes entre canvas y HTML.
- `Consecuencia operativa`: cualquier cambio de transformacion, snap, resize, reflow o responsive debe tratarse como cambio de alto riesgo.

### 5. Contratos editor-only y HTML-only

- `formas solo-editor` no deben seguir creciendo.
- `fullbleed` y `motionEffect` no deben tomarse como contratos de authoring cerrados.
- `enlace` es un contrato funcional HTML-first, no un comportamiento visible en canvas.
- `Consecuencia operativa`: si un cambio toca uno de estos contratos, primero hay que decidir si el objetivo es compatibilidad, alineacion o congelamiento. No conviene mezclar esas tres metas en la misma iteracion.
