# Reglas del Sistema de Texto del Editor Visual

Estado: vigente (Etapa 3)  
Fecha: 2026-03-30  
Alcance: render de texto Konva, edición inline DOM, handoff Konva↔DOM, métricas/layout, commit policy, bridges `window`, debug/trace y coexistencia `legacy` + `phase_atomic_v2`.

---

## 1) Propósito del sistema de texto

El sistema de texto existe para permitir edición visual inline confiable de elementos de texto en canvas, manteniendo consistencia entre:

- Render productivo en Konva/canvas.
- Edición en overlay DOM (caret, selección, input).
- Sincronización visual en handoff Konva↔DOM.
- Persistencia final del estado en objetos del editor.

Capas que lo componen:

- `text-system/runtime`
- `text-system/metrics-layout`
- `text-system/commit-policy`
- `text-system/adapters/konva-dom`
- `text-system/bridges/window`
- `text-system/debug`
- `text-system/render/konva`
- `text-system/render/dom-overlay`
- `CanvasEditor` como orquestador

Interacciones clave:

- `CanvasEditor` coordina sesión inline y delega a runtime/commit/render.
- `render/konva` y `render/dom-overlay` comparten geometría vía adapters y estado runtime.
- `commit-policy` consume estado inline y escribe patch final a objetos.
- `debug` observa y traza; no define comportamiento productivo.
- `bridges/window` encapsula compatibilidad legacy/harness global.

---

## 2) Responsabilidades por capa

| Capa | Responsable | No responsable |
|---|---|---|
| `runtime` | Ciclo de sesión inline, handoff visual, swap/mount overlay, sincronización de estado de sesión | Cálculo de patch final de negocio, render UI detallado |
| `metrics-layout` | Medición de texto, normalización de font style/weight, centrado y métricas reutilizables | Decisiones de UX, commits, side effects de edición |
| `commit-policy` | Reglas de `onInlineFinish`, construcción de patch final, orden de commit y cleanup | Render, resolver visibilidad Konva/DOM, debug visual |
| `adapters/konva-dom` | Traducción de estados Konva↔DOM (visibilidad/proyección/criterios de edición visible) | Lógica de negocio de commit o toolbar |
| `bridges/window` | Punto preferido para contratos formales `window` y compatibilidad legacy/harness | Render, métricas, transformaciones de dominio |
| `debug` | Emisión de trazas, snapshots, `runMatrix/clearTrace`, diagnósticos de alineación | Cambiar estado productivo o corregir flujo |
| `render/konva` | Dibujo de texto/elementos, ocultar texto durante inline edit según adapter, transformer/bounds y lecturas legacy de interacción ya existentes | Persistencia final de texto, definición de nuevos contratos globales |
| `render/dom-overlay` | Input inline DOM, caret/selección, layout de overlay y eventos inline | Persistencia final, reglas de commit |
| `CanvasEditor` | Orquestación, wiring de dependencias, composición de facades/hooks | Implementar lógica profunda de métricas/commit/debug en línea |

Regla general: cada capa debe poder describirse en una frase; si una función cruza más de una frase/capa, está mal ubicada.

---

## 3) Fuentes de verdad por etapa

| Etapa | Fuente de verdad primaria | Fuente secundaria | Regla |
|---|---|---|---|
| Antes de editar | `objetos` (estado React del editor) | Nodo Konva renderizado | Konva refleja objetos; no hay sesión inline activa |
| Durante edición inline | Contenido persistible: `editing.id` + `editing.value` | Overlay DOM para caret y selección | El valor que puede persistirse sale de la sesión inline; caret/selección se leen del DOM |
| Durante handoff visual | `inlineOverlayMountedId` + ack/swap de runtime | Adapter de visibilidad Konva↔DOM | No mostrar simultáneamente Konva y overlay para el mismo texto |
| Al confirmar commit | Resultado normalizado de texto inline + objeto destino | Métricas/centro bloqueado capturado | Commit se decide en `commit-policy`, no en render |
| Después del commit | `objetos` actualizado + `editing` finalizado | Estado visual de stage/layer | El estado persistido vuelve a ser `objetos` |
| Durante resize/transform | Geometría del nodo Konva en gesto activo | Patch final emitido al terminar gesto | Preview puede ser efímero; persistencia ocurre al commit de transform |
| Durante cambios tipográficos desde toolbar | Patch sobre `objetos` de seleccionados | Medición puntual para mantener centro | Toolbar no debe redefinir reglas de commit inline |

Regla transversal de estado:

- Estado visual de preview: temporal, derivado de sesión/refs/geometría/overlay.
- Estado persistido: solo `objetos`.
- Un cambio visual no implica persistencia hasta que exista escritura explícita en `objetos` mediante el flujo correspondiente.

---

## 4) Invariantes del sistema

1. Existe una sola sesión inline activa por vez (`editing.id` / `_currentEditingId`).
2. Si un texto está en edición inline visible, su texto Konva equivalente debe quedar oculto visualmente.
3. El handoff Konva↔DOM se decide por adapter; no por condiciones duplicadas en múltiples capas.
4. `commit-policy` es la única capa que define el patch final de texto al terminar edición inline.
5. La secuencia de commit no debe alterarse sin diagnóstico: aplicar patch, finalizar edición, restaurar drag, redibujar, snapshots.
6. La coexistencia `legacy` y `phase_atomic_v2` se mantiene compatible hasta retiro planificado.
7. Las fórmulas tipográficas actuales se preservan (incluyendo `lineHeight * 0.92`, center lock y clamps actuales).
8. No se rompe compatibilidad de globals legacy/harness: `_currentEditingId`, `editing`, `_elementRefs`, `__getObjById`, `_resizeData`, `__INLINE_TRACE`, `__INLINE_TEST`.
9. `CanvasEditor`, `CanvasStageContent`, `InlineTextEditor`, `SelectionBounds`, `ElementoCanvas`, `FloatingTextToolbar` mantienen contrato público.
10. Debug puede observar todo, pero no cambiar el flujo productivo.
11. Métricas reutilizables viven en `metrics-layout`; no se duplican con variaciones locales.
12. Cualquier regla de visibilidad o proyección Konva↔DOM debe estar encapsulada en adapters.
13. Runtime y commit no deben escribir lógica de UI visual fina de toolbar.
14. Cambios multi-capa requieren plan explícito previo.
15. Preview y persistencia son estados distintos y no intercambiables.

---

## 5) Reglas de implementación futura

1. Lógica de métricas de texto:
- Va en `metrics-layout/services`.
- Render/toolbar pueden consumir servicios, no redefinirlos.

2. Lógica de commit:
- Va en `commit-policy`.
- Render DOM/Konva solo emite eventos y estado necesario.

3. Uso de adapters:
- Obligatorio cuando se traduzca estado entre Konva, DOM y viewport/canvas.
- Prohibido replicar conversiones en componentes de UI.

4. Hooks vs services vs utils:
- Hook: coordinación de estado/efectos React.
- Service: cálculo puro reutilizable sin side effects.
- Utils: helpers pequeños sin semántica de capa.
- Adapter: traducción entre modelos/capas externas.

5. Composición de archivos:
- No mezclar en un mismo archivo UI render + commit policy + métricas núcleo.
- No mezclar debug/harness con runtime productivo salvo puente explícito.

6. Legacy:
- Encapsular en bridges/adapters/facades.
- No eliminar paths legacy sin plan de retiro con validación cruzada.

7. Debug:
- Se agrega detrás de flags/eventos permitidos.
- No introducir dependencias de debug para que funcione el runtime.

8. Wrappers de compatibilidad (obligatorio):
- Deben preservar firma pública, orden lógico y semántica observable.
- Deben comportarse como adaptadores/reexports, no como nuevas capas funcionales.
- En esta etapa no pueden introducir mejoras funcionales, optimizaciones ni cambios heurísticos.

---

## 6) Anti-patrones a evitar

- Agregar nudges mágicos de alineación en más de un módulo.
- Duplicar medición de texto en runtime, toolbar y render con fórmulas distintas.
- Introducir nuevas escrituras criticas directamente contra `window` fuera de `bridges/window`; los fallbacks legacy ya existentes en render/konva son deuda controlada, no patron a expandir.
- Mezclar UI, métricas y commit en una misma función grande.
- Introducir nuevas ramas legacy sin encapsulación y contrato claro.
- Corregir síntomas visuales tocando timing sin diagnóstico de fuente de verdad.
- Resolver bugs de inline ajustando opacity/visibility en múltiples capas a la vez.
- Acoplar debug a decisiones productivas.
- Cambiar orden de efectos `raf/flushSync` sin prueba de no regresión.
- Expandir contratos públicos por conveniencia local.

---

## 7) Reglas especiales para bugs delicados

| Tema | Capa responsable primaria | No tocar sin plan previo | Señales de “parche” |
|---|---|---|---|
| Alineación Konva↔DOM | `adapters/konva-dom` + `metrics-layout` + `render/dom-overlay` | Fórmulas de proyección/offset y fuentes de verdad de geometría | Ajustar offsets “a ojo” en más de un archivo |
| Micromovimiento al entrar inline | `runtime` (handoff/timing) | Secuencia swap/mount/hide y orden `raf` | Agregar delay/timeout arbitrario sin traza |
| Multilínea | `metrics-layout` + `render/dom-overlay` + `commit-policy` | Reglas de normalización de saltos y cálculo de ancho/alto | Trimear o expandir saltos en capas distintas |
| Cursor/caret | `render/dom-overlay` + `debug` (diagnóstico) | Relación line box/caret y proyección Konva | Forzar CSS del caret sin validar métricas |
| Resize/transform de texto | `render/konva` (transformer) + `commit-policy` (persistencia) | Aplanado de escala y commit final de tamaño/posición | Corregir preview sin corregir commit final |
| Cambios de fuente/tamaño/alineación desde toolbar | `render/dom-overlay` (toolbar) + `metrics-layout` | Regla de centro bloqueado y cálculo de ancho reutilizable | Reimplementar medición local con fórmula distinta |

Regla transversal: si un bug toca más de una fila, requiere mini-plan antes de codificar.

---

## 8) Criterios para futuros refactors

1. Si cambia timing de handoff o efectos, primero diagnóstico con trazas/snapshots.
2. Si afecta más de una capa, requiere plan escrito con fuentes de verdad por etapa.
3. Si toca Konva↔DOM handoff, no mezclar en el mismo cambio con rediseño de commit.
4. Si toca métricas, validar contra ambos caminos (`legacy` y `phase_atomic_v2`).
5. Si toca globals `window`, mantener compatibilidad de nombre, forma y semántica.
6. Si toca transformer/resize, separar preview de persistencia final y verificar ambos.
7. Todo refactor debe declarar invariantes preservados y riesgos explícitos.
8. No aprobar refactor con “mejora visual” sin prueba de no regresión de flujo inline completo.
9. Preferir facades/wrappers para transición gradual antes de mover contratos.
10. Cada PR de refactor debe indicar qué capa cambió y por qué esa capa es la dueña.

---

## 9) Checklist de revisión de cambios en el sistema de texto

Antes de aprobar un cambio, responder “sí” a estas preguntas:

1. ¿Está clara la capa dueña del cambio y coincide con su responsabilidad?
2. ¿Está explícita la fuente de verdad en la etapa afectada?
3. ¿El cambio separa estado visual de preview vs estado persistido en `objetos`?
4. ¿Se preserva el timing sensible (`flushSync`, `raf`, swap/handoff) o se justifica con diagnóstico?
5. ¿Si toca Konva↔DOM, la traducción está encapsulada en adapters?
6. ¿Si toca métricas, reutiliza `metrics-layout` sin duplicar fórmulas?
7. ¿Si toca commit, toda la regla vive en `commit-policy`?
8. ¿Si toca globals, usa `bridges/window` y mantiene compatibilidad observable?
9. ¿Si usa wrappers de compatibilidad, preserva firma, orden lógico y semántica sin mejoras funcionales?
10. ¿El cambio evita mezclar en un mismo bloque UI + métricas + commit + debug?

Si alguna respuesta es “no”, el cambio no está listo para aprobación.

---

## 10) Resumen ejecutivo (10–15 reglas clave)

1. Una sesión inline activa a la vez.
2. Durante inline visible, Konva del mismo texto se oculta.
3. Handoff Konva↔DOM se decide en adapters/runtime, no en UI dispersa.
4. Contenido persistible durante inline: `editing.value`; caret/selección: overlay DOM.
5. Commit final de texto solo en `commit-policy`.
6. Métricas y centrado solo en `metrics-layout`.
7. Nuevos contratos `window` solo via `bridges/window`; fallbacks legacy ya existentes de seleccion/drag no son API nueva.
8. Debug observa; runtime decide.
9. Mantener compatibilidad `legacy` + `phase_atomic_v2` hasta retiro planificado.
10. No duplicar fórmulas tipográficas (`lineHeight`, spacing, centrado).
11. No cambiar orden `flushSync/raf` sin diagnóstico y validación.
12. No mezclar commit, métricas y render en la misma función.
13. Preview visual y persistencia en `objetos` son estados distintos.
14. Wrappers deben preservar firma, orden lógico y semántica observable.
15. Fix visual sin fuente de verdad clara es parche.

## 11) Contratos cross-runtime vigentes

1. La surface formal de compatibilidad actual incluye:
- `window.canvasEditor`
- `window.editorSnapshot`
- eventos nombrados usados por preview, sidebar y bridges
- helpers formales como `__getObjById` y `__getSeccionInfo`

2. Estado scratch transitorio no es contrato estable:
- no documentarlo como API publica
- no usarlo como fuente primaria para preview ni para consumers externos

3. Para consumers externos:
- preview y otras lecturas fuera del editor deben preferir snapshot adapters o bridges formales
- los globals legacy se consideran fallback de migracion, no surface recomendada para nuevas dependencias

4. Comportamiento runtime actual para seleccion e interaccion:
- `render/konva` y `SelectionTransformer` deben preferir la selection runtime interna del editor y los helpers de visual mode antes que globals legacy cuando leen seleccion, pending drag o drag visual state
- `_elementosSeleccionados`, `_pendingDragSelectionId` y `_pendingDragSelectionPhase` siguen existiendo como fallback de compatibilidad durante drag/selection/transform
- esto describe el runtime actual, no la arquitectura destino; la deuda restante vive en timing de interaccion y fallbacks de compatibilidad, no en nuevos contratos recomendados
