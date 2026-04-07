# RCA Inline Focus (Click 2) - Evidencia Operativa

Estado: evidencia operativa vigente. Este documento sigue siendo una guia de diagnostico; no prueba por si solo cierre definitivo de RCA.
Fuente arquitectonica: `docs/architecture/INTERACTION_SYSTEM_CURRENT_STATE.md`

## Flags de diagnostico

- `window.__DBG_INLINE_INTENT = true`
- `window.__INLINE_DIAG_ALIGNMENT = true`
- `window.__INLINE_FOCUS_RCA = true`

Los eventos de RCA se registran en:

- `window.__INLINE_FOCUS_RCA_TRACE`

## Evidencia actual en codigo

Marcadores confirmados en la implementacion actual:

- `intent-start-inline` en `src/components/editor/textSystem/render/konva/CanvasStageContentComposer.jsx`
- `overlay-ready-to-swap` en `src/components/editor/overlays/inlineEditor/useInlinePhaseAtomicLifecycle.js`
- `focus-reclaim-attempt` en `src/components/editor/textSystem/render/domOverlay/InlineTextOverlayEditor.jsx`
- calculo de `focusOperationalCore` y `focusOperationalStrict` en `src/components/editor/textSystem/debug/inlineFocusOperationalDebug.js`
- inicializacion y limpieza de `window.__INLINE_FOCUS_RCA_TRACE` en `src/components/editor/textSystem/debug/useInlineTraceBridge.js`

Implicancia:

- la instrumentacion sigue viva en los paths productivos actuales
- la existencia de estos marcadores no implica por si sola que el problema ya este cerrado

## Definicion de foco operativo (criterio de aceptacion)

Un estado se considera **focus operativo** solo si se cumplen todos, dentro de la misma sesion (`editingId + sessionId`):

1. `document.activeElement === editor contentEditable` del inline activo.
2. Hay seleccion/rango valido dentro del editor (`anchor/focus/range` dentro del editor).
3. Se registra `input` sin click adicional.
4. No hay `blur` inmediato no intencional tras activacion.

Nota: overlay visible o subrayado ortografico no implican foco operativo.

Senales verificables en traza:

- ownership base: `focusOperationalCore === true`
- confirmacion estricta de sesion: `sessionMetrics.focusOperationalStrict === true`
- sin blur espurio temprano: `sessionMetrics.blurBeforeFirstInput === false`

## Hipotesis a evaluar

- H1 (principal): foco inicial ocurre antes del estado semantico listo y no consolida ownership en click 2.
- H2: foco se logra pero se pierde por un handler/evento posterior.
- H3: foco queda activo pero caret/range no queda valido.
- H4: hay doble autoridad de foco/caret compitiendo.

## Timeline minimo a capturar (click1/click2/click3)

Orden esperado de inspeccion en `__INLINE_FOCUS_RCA_TRACE`:

1. `intent-select-only` (click 1)
2. `intent-start-inline` (click 2)
3. `overlay-ready-to-swap`
4. `overlay-swap-commit`
5. `focus-reclaim-attempt` (post-ready)
6. `input` (sin click 3, ideal)
7. `blur` (solo cuando corresponde terminar)

## Formato de evidencia (evento -> estado -> impacto)

Completar para cada hallazgo:

- `evento`: nombre y timestamp
- `estado`: `editingId`, `sessionId`, `overlayPhase`, `focusOperationalCore`, `selection`
- `impacto`: editable inmediato / requiere click adicional / blur inmediato

## Cierre de RCA

La RCA se considera cerrada cuando:

1. Hay causa dominante reproducible en multiples corridas.
2. Se descartan hipotesis alternativas con evidencia.
3. El flujo cumple foco operativo en click 2 sin hacks de timing.

## Assumption

- No se encontro en el repositorio una prueba unica que declare este incidente como cerrado. Hasta que exista esa evidencia, este documento debe leerse como bitacora de diagnostico y no como postmortem finalizado.
