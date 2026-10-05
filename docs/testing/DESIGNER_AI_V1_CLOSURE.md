# Cerrar V1 del Diseñador AI — verificación local

Status: Testing Baseline.
Fecha: 2026-09-28. Base: `main`, `26d532a0`. Node 22.13.1, Windows.
Alcance: capacidades existentes y un booleano durable autorizado; sin nuevas
tools, modelo, memoria de chat, deploy ni push. Mantener este informe al cambiar los flujos/test aquí
enumerados; los contratos conversacional y de capabilities conservan autoridad.

## Resultado y límite de cierre

Los defectos E11, E12, E9, E10 y L1 fueron confirmados por inspección y corregidos
con regresiones locales. E8 funciona al reentrar al sidebar y después de recargar,
incluso con pendientes posteriores. P0 conserva tokens, receipts/fingerprints, proyección, recuperación,
validadores, owners, allowlist, autorización y `store:false`.

**V1 funcionalmente cerrada, con 537/537 tests y evidencia local/simulada.**
El usuario autorizó explícitamente el 2026-09-28 la marca única
`designerAiConversation.usage.guidedFlowCompleted`. Está implementada y probada:
es monotónica, no altera pendientes y permite recuperar edición tras una recarga.
La decisión anterior quedó resuelta en `AI_ASSISTANT_SYSTEM.md`, sección 8.1.
No quedan decisiones de implementación abiertas dentro de este alcance.

Tampoco se certifican inferencias de un modelo real, proveedores, uploads remotos,
Firestore real ni el editor completo con Konva: las pruebas son locales con I/O
sintético. Las comprobaciones visuales son fixtures del panel real con CSS local.
Falta el smoke E2E real después de publicar frontend. CI/Hosting sigue siendo un
problema de infraestructura separado: debe repararse antes de esa publicación.

## E8 y preview

`guided → complete → editing`: se confirma el lote y la metadata; el primer
estado completo observado guarda `usage.guidedFlowCompleted:true`, añade un
cierre y cambia el modo a edición. La marca conserva `true` cuando el ledger
vuelve a quedar incompleto; el modo se reconstruye desde ella al recargar.
No reemplaza la respuesta del turno. Una edición posterior conserva su respuesta,
incluso RSVP, Historia y fecha/hora. Si vuelve a faltar un dato, el ledger lo
registra; `nextBlock` deja de promover un interrogatorio en modo edición.

Texto exacto:

> La información principal de tu invitación ya está completa. Podés ver cómo
> quedó en la vista previa, ajustar cualquier parte desde el sidebar o seguir
> pidiéndome cambios por acá, como cambiar la hora, el Dress Code o una pregunta
> de RSVP.

Acciones: **Ver vista previa** y **Seguir ajustando**. La primera recibe el
`generarVistaPrevia` existente de `DashboardSidebar`; conserva el controller,
pipeline y flush del preview del editor. No hay action AI ni navegación nueva.
La segunda enfoca el composer. Ninguna modifica el ledger. Una apertura con un
ledger ya completo entra directamente en edición sin repetir cierre.

Regresiones de recarga: el harness destruye DOM, root React, historial y refs;
rehidrata únicamente una copia JSON del borrador con escrituras confirmadas.

- `guided → complete → editing → nuevo pendiente → reload → editing`.
- `guided → complete → reload → editing`.
- Borrador nunca completado, sin campo legacy: `reload → guided`.
- Edición con pendientes: resolverlos mantiene edición y no repite cierre.
- Borrador legacy actualmente completo: adquiere la marca sin repetir cierre.
- Fallo de metadata final: no guarda la marca ni anuncia finalización.

La normalización acepta únicamente el booleano `true`; el campo ausente es
`false`. La preparación del reingreso y la reconciliación conservan la marca.
El snapshot enviado al modelo solo recibe el modo derivado, no ese campo durable.
No se agregan escrituras: comparte el patch de metadata ya existente.

## Recuperación y feedback

- Antes de ejecutar: error recuperable muestra **Reintentar**. Conserva el pedido
  y los turnos anteriores, relee el estado vigente y revalida. No duplica el
  mensaje del usuario. También recupera la persistencia inicial fallida.
- Parcial: **Reintentar pendientes** reutiliza el resultado y receipts P0,
  verifica identidad/estado, salta acciones confirmadas y reintenta solo el
  writer cuando un efecto ya existe. No vuelve a consultar el modelo.
- Nueva intención: invalida el retry anterior y solicita una interpretación nueva.
- Conflicto de estado: la recuperación P0 rechaza reanudar; se pide otra solicitud.
- Preparación, aplicación y guardado usan texto simple. Un guardado retenido en
  la prueba no muestra confirmación hasta recibir el receipt.
- Cancelar Places permite volver al chat y cargar ubicación manual. El script
  fallido no permanece bloqueando cargas futuras.

Ejemplos producidos por el formatter/runtime:

```text
Listo. RSVP activado.

Listo, guardé 3 cambios:
✓ Ceremonia · Fecha: 12 de diciembre
✓ RSVP activado
✓ Pregunta «Restricciones alimentarias» activada

Se guardaron 2 de 3 cambios:
✓ Ceremonia · Fecha: 12 de diciembre
✓ RSVP activado
⚠ No pude confirmar el guardado del cambio: Pregunta «Restricciones alimentarias» activada

Podés reintentar los cambios pendientes.
```

Una respuesta breve específica del modelo se conserva cuando una sola acción
quedó acreditada. Los resúmenes cuentan `effective && persisted && !error`;
`executed` no basta. Regalos no reproduce valores bancarios en esos resúmenes.

## Matriz de capacidades

Los mensajes son escenarios reproducibles y los outputs del proveedor son
fixtures explícitas: prueban transporte/validación/backend → panel React →
executor → efectos/receipts → metadata/feedback, no NLU del proveedor real.

| Capacidad | Testeada | Resultado | Observaciones |
| --- | --- | --- | --- |
| Personas | Sí, integrada | Pasa | Ana/Juan → Ana/Pedro; nombre automático acompaña. |
| Modo del evento | Sí, integrada | Pasa | Simple → doble → simple → doble; datos Party conservados. |
| Fecha y hora | Sí, integrada + P0 | Pasa | 15/03/2027 18:30 → 19:00 conserva fecha; fecha posterior conserva hora. |
| Ubicación manual | Sí, integrada | Pasa | Lugar/dirección independientes de Ceremony y Party. |
| Places | Sí, loader + control React | Pasa local | Carga/error/timeout/retry, callers, elección humana; Google real no ejecutado. |
| Dress Code | Sí, integrada | Pasa | Activar/cambiar/desactivar; conserva texto oculto. |
| Historia | Sí, integrada | Pasa | Crear/reemplazar, también después del cierre. |
| Portada | Sí, owners/lifecycle P0 + L1 | Pasa local | A/A→B/A→B→A, cancelación; sin upload real ni E2E del selector nativo. |
| Gallery | Sí, integrada + dominio/handlers | Pasa local | Mover persistido; agregar/reemplazar por owners existentes; no completa sin finalización humana. Sin upload remoto. |
| RSVP | Sí, integrada | Pasa | Activar/desactivar; activar/quitar pregunta; label/tipo/required; agregar/renombrar/eliminar opción; orden; modal; corrección posterior. |
| Regalos | Sí, integrada + P0 | Pasa | Desactivado, alias solo, lista sola, combinación, ocultar/conservar/reactivar, cambiar/eliminar valor, copies. Datos ficticios. |
| Nombre del documento | Sí, integrada | Pasa | Automático al cambiar personas; explícito no es sobreescrito. |
| Post-completion | Sí, panel real | Pasa local | Hora/RSVP/Historia/fecha/Dress Code, nuevo pendiente, reentrada, preview y recarga. Resolver pendientes no repite cierre. |

Anclas nuevas: `designerAiAcceptance.test.mjs`, `designerAiV1.test.mjs`,
`testSupport/panelHarness.mjs` bajo `src/components/editor/designerAi/`;
`designerAiExecutionFeedback.test.mjs` en `src/domain/editor/`.
Anclas extendidas: `functions/designerAiService.test.mjs`,
`src/domain/eventDetails/googlePlaces.test.mjs`, `DesignerAiLocationControl.test.mjs`,
`designerAiLifecycle.test.mjs` y `src/lib/editorDocumentOperation.test.mjs`.

## Verificaciones ejecutadas

| Grupo | Casos distintos | Resultado |
| --- | ---: | --- |
| Base AI antes de cambios | 197 | 197 pasan |
| AI final | 234 | 234 pasan: 197 existentes + 37 nuevos |
| Dependencias afectadas | 262 | 262 pasan: 253 existentes + 9 nuevos |
| Ownership/packages/configuración/discovery | 41 | 41 pasan; además discovery 101/3/3 |
| Total final, sin sumar repeticiones | 537 | 537 pasan: 491 existentes + 46 nuevos |

Cada bloque tuvo sus tests antes del siguiente. La primera corrida E8 detectó
una assertion de prompt obsoleta; se sustituyó por la obligación aprobada de
edición/cierre único. Acceptance detectó errores de fixture (shape RSVP y un
mock de metadata que vaciaba el nombre); se corrigieron las fixtures, no el
producto. El gate inicial detectó la expectativa antigua `maxRetries:1`; ahora
verifica 0 porque el retry pertenece al deadline del service.

La ampliación autorizada de E8 añade siete tests (cinco de panel con persistencia,
uno de normalización/reingreso/reconciliación y uno de proyección de capabilities).
La corrida específica pasó 47/47 antes de volver a ejecutar las suites completas.
Evidencia final de esta ampliación: archivos `completion-marker-*` dentro del
directorio local de evidencia; sustituyen las corridas finales anteriores.

La primera repetición de ownership dio 40/41: el subproceso de la prueba de
inicialización de JSDOM agotó su timeout de 30 s (`ETIMEDOUT`). Esa prueba pasó
al repetir sin otras suites concurrentes, sin modificar código ni timeout.
La causa de esa demora no se atribuye al cambio ni se considera demostrada.
La corrida final previa al commit (`precommit-*`) pasó 537/537; ownership pasó
en el primer intento de esta revisión, incluido discovery, sin repetir ese timeout.

El gate necesitó `--cli` apuntando a una instalación local ya preparada del CLI
14.4.0; no descargó herramientas ni usó CLI global. Se mantienen manifiestos,
timeout de Function y registro de ownership. Sin red remota ni credenciales.

Build Functions y 64 copias canónicas consistentes. Lint: 262 archivos, cero
errores y 234 warnings (no es un resultado sin advertencias). Parseo de los
30 archivos JS/JSX/TS modificados o nuevos de esta tarea: cero errores.
`git diff --check`: pasa. Los 276 enlaces locales de los documentos modificados
apuntan a archivos existentes. Fixtures del panel con CSS local a 375 y 1280 px:
cierre y fallo parcial legibles, sin overflow horizontal, composer visible y
botones de al menos 44 px. No se ejecutó build/export de Hosting ni el gate
integral de emuladores/Rules porque no se modificaron esas superficies.

Reproducción (PowerShell, desde la raíz, con dependencias instaladas):

```powershell
npm.cmd --prefix functions run build
$ai = @(rg --files shared src functions -g '*designerAi*.test.mjs' -g 'DesignerAi*.test.mjs' -g '!node_modules' -g '!lib')
node --test --test-reporter=tap $ai
$dependencies = @(
  "src/components/editor/persistence/editorSessionPersistenceGuard.test.mjs"
  "src/components/editor/persistence/editorSessionPersistenceCore.test.mjs"
  "src/components/editor/persistence/draftWriteCoordinator.test.mjs"
  "src/components/editor/persistence/borradorSyncSessionLifecycle.test.mjs"
  "src/components/editor/persistence/borradorSyncScheduling.test.mjs"
  "src/components/editor/persistence/borradorSyncRetry.test.mjs"
  "src/components/editor/persistence/borradorSyncRenderState.test.mjs"
  "src/domain/gifts/config.test.mjs"
  "src/domain/gallery/sidebarModel.test.mjs"
  "src/domain/gallery/galleryMutations.test.mjs"
  "src/domain/gallery/galleryLayoutPresets.test.mjs"
  "src/domain/rsvp/config.test.mjs"
  "src/domain/eventDetails/time.test.mjs"
  "src/domain/eventDetails/personNames.test.mjs"
  "src/domain/eventDetails/locationAuthoring.test.mjs"
  "src/domain/eventDetails/location.test.mjs"
  "src/domain/eventDetails/googlePlaces.test.mjs"
  "src/domain/eventDetails/googleMapsStatic.test.mjs"
  "src/domain/eventDetails/eventDetailsCeremonyParty.test.mjs"
  "src/domain/eventDetails/date.test.mjs"
  "src/domain/eventDetails/countdownEventDetails.test.mjs"
  "src/lib/editorDocumentOperation.test.mjs"
  "src/lib/dashboardDocumentNameBridge.test.mjs"
  "src/lib/editorSnapshotAdapter.test.mjs"
  "src/lib/editorRuntimeBridge.test.mjs"
  "src/lib/editorBridgeContracts.test.mjs"
  "src/domain/editor/coverImage.test.mjs"
  "src/domain/functionalCtaButtons.test.mjs"
  "src/components/MiniToolbarTabImagen.mobileDrag.test.mjs"
  "src/domain/templates/storyText.test.mjs"
  "src/domain/templates/fieldValueResolver.test.mjs"
  "src/domain/templates/authoring/targetApplication.test.mjs"
)
node --test $dependencies
node scripts/local/verifyFunctionsOwnership.cjs --cli .local-isolation/prepared-hlifiv/workspace/scripts/local/tools/node_modules/firebase-tools
npm.cmd --prefix functions run lint
git diff --check
```

Artefactos ignorados: `.local-isolation/designer-ai-v1/` guarda los manifests de
tests, TAP por bloque/final, builds, lint, ownership y capturas a 375/1280 px.
La lista de dependencias incluye eventDetails, Gallery, RSVP, Gifts, persistencia,
bridges, portada, CTA, Historia y authoring. Los archivos de evidencia no son
dependencias del runtime ni deben entrar al commit.

## Deadline e impacto

Antes: hasta dos requests de 25 s por llamada SDK y otra llamada para reparación,
sin deadline común frente a una Function de 45 s. Ahora: 40 s compartidos,
25 s máximo por intento, un retry de transporte total, una reparación, mínimo
1 s para iniciar y 5 s de margen. La lectura del nombre comparte presupuesto y
tiene fallback a los 3 s. Timers y abort evitan esperar indefinidamente aun si el
upstream no resuelve. Los tests no llaman a OpenAI.

No se cambian modelo, tokens, límites de historial, flushes ni número de escrituras del
camino exitoso. El cierre por control ya verificado puede evitar una llamada de
continuación. No se atribuye una mejora de latencia promedio sin medición real.
Se verificó el SDK instalado y la [documentación oficial de retries](https://developers.openai.com/api/docs/guides/rate-limits).

## Git y riesgos fuera de alcance

El commit de cierre incluye exclusivamente V1, sin push ni deploy. Quedan fuera
e intactos los cambios preexistentes de
`.firebase/hosting.b3V0.cache` y `src/components/landing/LandingFooter.jsx`.
El diff crece principalmente por regresiones y harness de integración. No es un
refactor del editor; las extracciones son formatter de feedback y deadline.

Fuera de alcance: streaming, Undo AI, RAG, nuevas capacidades/tools/presets,
memoria de chat, rate limiting, coordinación multitab, reread server-side del
draft, DLP general y P1 completo. La verificación local no certifica servicios
desplegados; ese límite debe distinguirse de las capacidades probadas y de esos
futuros trabajos.

## Inventario del diff de esta tarea

Excluye los dos archivos preexistentes. Incluye cuatro copias generadas por el
sync canónico; no hay cambios en manifests de dependencias ni registro de Functions.

36 archivos: +1702 / −157 líneas; 7 archivos nuevos.

| Archivo | + | − |
| --- | ---: | ---: |
| `docs/DOCUMENTATION_INDEX.md` | 4 | 0 |
| `docs/architecture/AI_ASSISTANT_SYSTEM.md` | 62 | 17 |
| `docs/architecture/DATA_MODEL.md` | 9 | 2 |
| `docs/contracts/AI_ASSISTANT_CONVERSATION_CONTRACT.md` | 19 | 4 |
| `docs/contracts/DESIGNER_AI_CAPABILITY_CONTRACT.md` | 14 | 9 |
| `docs/testing/DESIGNER_AI_V1_CLOSURE.md` (nuevo) | 304 | 0 |
| `functions/designerAiService.test.mjs` | 94 | 1 |
| `functions/discoveryInitialization.test.mjs` | 1 | 1 |
| `functions/lib/shared/designerAiCapabilityContract.cjs` | 1 | 0 |
| `functions/lib/shared/designerAiConversationLedger.cjs` | 3 | 2 |
| `functions/shared/designerAiCapabilityContract.cjs` | 1 | 0 |
| `functions/shared/designerAiConversationLedger.cjs` | 3 | 2 |
| `functions/src/designerAi/deadline.ts` (nuevo) | 67 | 0 |
| `functions/src/designerAi/service.ts` | 37 | 19 |
| `functions/src/index.ts` | 7 | 1 |
| `shared/designerAiCapabilityContract.cjs` | 1 | 0 |
| `shared/designerAiConversationLedger.cjs` | 3 | 2 |
| `shared/designerAiConversationLedger.test.mjs` | 15 | 0 |
| `src/components/DashboardSidebar.jsx` | 19 | 3 |
| `src/components/MiniToolbarTabImagen.jsx` | 4 | 2 |
| `src/components/editor/designerAi/DesignerAiLocationControl.jsx` | 17 | 11 |
| `src/components/editor/designerAi/DesignerAiLocationControl.test.mjs` | 40 | 0 |
| `src/components/editor/designerAi/DesignerAiPanel.jsx` | 150 | 39 |
| `src/components/editor/designerAi/DesignerAiPanel.test.mjs` | 4 | 4 |
| `src/components/editor/designerAi/designerAiAcceptance.test.mjs` (nuevo) | 151 | 0 |
| `src/components/editor/designerAi/designerAiLifecycle.test.mjs` | 5 | 2 |
| `src/components/editor/designerAi/designerAiV1.test.mjs` (nuevo) | 234 | 0 |
| `src/components/editor/designerAi/testSupport/panelHarness.mjs` (nuevo) | 156 | 0 |
| `src/domain/editor/designerAiActionExecutor.js` | 3 | 0 |
| `src/domain/editor/designerAiCapabilities.js` | 1 | 0 |
| `src/domain/editor/designerAiCapabilities.test.mjs` | 15 | 0 |
| `src/domain/editor/designerAiExecutionFeedback.js` (nuevo) | 56 | 0 |
| `src/domain/editor/designerAiExecutionFeedback.test.mjs` (nuevo) | 36 | 0 |
| `src/domain/eventDetails/googlePlaces.js` | 52 | 36 |
| `src/domain/eventDetails/googlePlaces.test.mjs` | 77 | 0 |
| `src/lib/editorDocumentOperation.test.mjs` | 37 | 0 |

El mayor crecimiento corresponde a escenarios y harness nuevos, y a este informe.
El panel concentra el cambio funcional de mayor tamaño (cierre, retries y feedback);
no se reemplazó su arquitectura ni se agruparon sus flushes.

## Corrección del recorrido observado — 2026-09-30

Estado al cerrar la implementación: regresión local; sin deploy, push ni consultas a datos
productivos. Esta sección actualiza el comportamiento conversacional descrito
arriba; sus resultados anteriores permanecen como evidencia histórica.

### Causas verificadas en código

| Síntoma | Primer responsable identificado antes de modificar |
| --- | --- |
| Resumen y confirmación duplicados | `withDesignerAiExecutionFeedback` anteponía el resumen a cualquier respuesta con más de una action. `augmentAutomaticEventName` agregaba `document.set_name` en cada `apply` bajo política automática, aunque el valor coincidiera. |
| Fecha visual convertida a texto largo | `executeEventAction` escribía ISO mediante `updateTemplateFieldValues`; `resolveTemplateTargetValue` elegía transform/preset y, si faltaba, fecha larga. No inspeccionaba la representación visible. El parser tampoco cubría `/` y `.` con año corto. |
| Ceremonia en un evento único | `describeAction` traducía directamente `phase:ceremony` a Ceremonia. Ya existía `getDesignerAiLocationPhaseLabel`, con Evento para `single`; no existe subtipo persistido Fiesta. |
| Nunca propone RSVP | Excluido expresamente tanto del orden/hojas de `guidedFlow` como del prompt del service. |
| Regalos no continúa después de Dress Code | Regalos existía, pero el lugar seguía como primer pendiente. La postergación solo era una instrucción temporal al modelo; no había estado durable para omitir esa hoja ni continuación verificada tras el turno. El modelo podía saltar a Dress Code y volver a detenerse en el lugar. |
| No cierra ni ofrece preview | El cierre exigía todas las hojas guiadas terminales. El lugar desconocido seguía bloqueándolo. El CTA ya existía, pero no se alcanzaba esa transición. |

Esto explica el mecanismo reproducido localmente. No se dispone del payload,
ledger ni respuesta estructurada originales de producción para certificar el
estado exacto de aquel turno; el texto observado fue aportado por el usuario.

### Comportamiento resultante

- Orden: nombres → estructura → datos aplicables → Dress Code → RSVP → Regalos
  → portada/galerías aplicables → cierre. Historia mantiene su alcance reactivo.
  RSVP usa sí/no y el formulario existente; no agrega un interrogatorio sobre
  todas sus opciones de personalización.
- `deferred_by_user` se guarda en las resolutions existentes, con fingerprint.
  Es no terminal: se conserva en pendientes globales y guiados, pero se excluye
  de `blockingLeafIds` y de `nextBlock`. La aclaración de un año faltante continúa
  bloqueando esa operación. Datos nuevos o receipts verificados reemplazan la
  postergación; no se inventan valores ni se agrega memoria de chat.
- El panel deriva la continuación del ledger releído después de persistir. Una
  respuesta sin siguiente pregunta recibe la pregunta del bloque vigente; un
  cambio de bloque no queda a elección del modelo. Las aclaraciones dentro del
  mismo bloque, explicaciones de partes fuera de alcance y controles se conservan.
- Pocas actions confirmadas usan una respuesta natural. Los resúmenes complejos,
  parciales o pedidos explícitamente siguen disponibles. Los nombres automáticos
  exitosos no se repiten en feedback normal; sus receipts siguen intactos.
- Fecha/hora conserva por vista el patrón numérico/textual, separadores, año y
  formato horario mediante el owner de authoring. Los valores siguen normalizados;
  schema, bindings y estilos no se reescriben. Si no hay patrón reconocible, se usa
  el preset existente. No se introdujeron formatos ni controles AI nuevos.
- `single` usa **Evento** en feedback determinista. Decir Fiesta permanentemente
  requeriría nuevo estado semántico, que no se agregó; el contrato registra ese límite.
- El cierre incluye los pendientes postergados, **Ver vista previa** y **Seguir
  ajustando**, además de mencionar sidebar y chat. El callback sigue siendo
  `generarVistaPrevia` del sidebar, con el mismo modal/controller/flush. No hay
  nueva action, navegación ni generador de preview.
- Tras cierre y recarga, `guidedFlowCompleted` conserva el modo edición aunque
  quede el lugar pendiente. No se repite el cierre ni se reinicia onboarding.

### Regresión y verificación reproducible

Fixture anonimizado:
`src/components/editor/designerAi/testSupport/conversationRegressionFixture.mjs`.
Usa nombres y ubicación sintéticos; mantiene la fecha incompleta, año posterior,
hora posterior, lugar desconocido, Dress Code y el `ok` que antes detenía la charla.
`designerAiConversationRegression.test.mjs` ejecuta el panel React real, validación
backend compartida, executor, owners de proyección, receipts y persistencia
sintética, con estas cuatro variantes:

1. Lugar pendiente + RSVP no + Regalos no.
2. Lugar definido + RSVP no + Regalos no.
3. Lugar pendiente + RSVP sí + Regalos no.
4. Hora y postergación en un turno + RSVP sí + lista de regalos.

Todas verifican continuidad, cierre, CTA existente, persistencia de pendientes y
corrección posterior en edición tras destruir/recrear DOM, refs e historial.
Los outputs del proveedor son fixtures: **no es un eval de NLU del modelo real**.
La expresión espontánea de la postergación sigue siendo interpretada por el
modelo; su persistencia, prioridad, completitud y continuación son deterministas.

Tests de presentación cubren `24|12|26`, `24/12/26`, `24/12/2026`, `24.12.26`,
texto largo/capitalización, separadores con espacios, cambio solo de hora,
countdown ISO, estilos/bindings intactos y formato explícito del editor.
Negativos de postergación cubren terminales, no disponibles, hojas fuera del
recorrido, rule inválida, mutación simultánea y ausencia de terminalización falsa.

Comandos locales (PowerShell usa `npm.cmd`):

```powershell
$aiTests = @(rg --files shared src/domain/editor src/components/editor/designerAi functions -g '*designerAi*.test.mjs' -g '*DesignerAi*.test.mjs')
node --test --test-reporter=tap @aiTests src/domain/templates/authoring/designerAiPresentation.test.mjs src/domain/templates/authoring/targetApplication.test.mjs src/domain/templates/authoring/migration.test.mjs src/domain/templates/personalization.test.mjs src/domain/eventDetails/date.test.mjs src/domain/eventDetails/time.test.mjs src/components/editor/templateAuthoring/DynamicFieldRuntimeHardening.test.mjs
npm.cmd --prefix functions run build
npm.cmd --prefix functions run contracts:check:built
npm.cmd --prefix functions run lint
npm.cmd --prefix functions run verify:ownership -- --cli <firebase-tools-fijada-preparada>
```

Resultados: **344/344** en la suite conjunta final, incluidos los casos de
conversación, postergación, presentación y nombre automático ya coincidente.
Ownership: 41/41, tres builds y discovery local 101/3/3. Functions lint:
262 archivos, cero errores, 234 advertencias; no se ocultan las advertencias.
Build de Functions y sincronización de las 64 copias compartidas completados.
Reportes locales: `.local-isolation/designer-ai-verification.tap`,
`designer-ai-final-feedback.tap`, `designer-ai-ownership.log`, `designer-ai-lint.log`.

Verificación visual adicional: markup producido por el panel real en JSDOM,
renderizado con CSS del panel en Chromium local sin red a 375 y 1280 px. Se
inspeccionaron las capturas de transición RSVP y cierre con pendiente: sin
overflow horizontal, composer visible y botones de 44 px. Script/evidencia en
`.local-isolation/designer-ai-conversation/visual.mjs` y `visual.json`; capturas
`rsvp-375.png`, `rsvp-1280.png`, `complete-375.png`, `complete-1280.png`.
El primer arranque de Chromium venció por timeout; el reintento headless con
`--no-sandbox` completó las cuatro vistas. No se usó un perfil de usuario.

Límites: el montaje y las acciones usan JSDOM; la inspección de layout usa una
copia de ese DOM en Chromium, no una sesión Firebase completa. No se ejecutó un
build de producción de Next, modelo real, Places real, upload remoto ni preview
conectado a Firebase durante esa etapa. El despliegue autorizado posteriormente
y su verificación se registran al final de este documento.
Las regresiones previas de aislamiento, retries/deadline, receipts, controles y
post-completion forman parte de las suites AI ejecutadas; esto no certifica el
estado desplegado de los servicios.

### Alcance de despliegue

Afecta frontend (panel/feedback/authoring), backend `designerAiChat` de codebase
`default`, y dos contratos compartidos con sus cuatro copias generadas. Protocolo
2.3.0 / ledger 4: requieren frontend y backend coordinados; los clientes
incompatibles reciben el fallback de recarga existente. No cambian endpoints,
modelos, permisos, Secrets, Rules, esquema funcional del evento, RSVP ni Regalos.
La implementación inicial no incluyó deploy, push ni migración. Cambios ajenos en `LandingFooter.jsx` y
`.firebase/hosting.b3V0.cache` se conservaron fuera del alcance.

### Magnitud del diff de esta corrección

32 archivos dentro del alcance: 28 mantenidos y 4 copias CJS generadas. Los
owners funcionales modificados son el ledger/contrato compartido, el service,
el panel, el feedback/continuación y la proyección de fecha/hora de authoring.
Incluye tests y fixture de regresión, adaptación de expectativas anteriores y
cuatro documentos. Las copias se generaron mediante el build, no a mano.
Los artefactos locales de verificación quedan fuera del diff versionable.

### Despliegue autorizado — 2026-09-30

Tras la instrucción explícita «hace deploy», se publicó una copia aislada de
`eebffec5938cffb3d0620e46482c928d5c84d011` más los 32 archivos de esta corrección.
La copia excluyó los cambios previos del footer y del caché local de Hosting.
No hubo commit, push, migración ni despliegue de Rules o de otras Functions.

- Proyecto: `reservaeldia-7a440`; Firebase CLI 14.4.0.
- Build de producción Next completado: 14 páginas; build
  `FulLwXuXap90FMqkLRorI`. Se conservaron los assets de la versión anterior.
- Build backend completado, con las 64 copias de contratos coincidentes.
- `functions:default:designerAiChat`: deploy exitoso; revisión
  `designeraichat-00027-ner`, ACTIVE. La comparación de inventario confirmó que
  únicamente cambió esta función. Configuración de servicio, nombres/valores de
  variables del source y binding de `OPENAI_API_KEY` versión 2 conservados.
- Hosting: versión `bf62159b19a3bf6c`, publicada a las 16:53:02 UTC.
  En `https://reservaeldia.com.ar` se verificaron buildId, 133 assets con caché
  correcta y coincidencia byte a byte del chunk del dashboard con la release.
- Smoke callable sin credenciales: HTTP 401 / `UNAUTHENTICATED`, CORS correcto.
  Cero logs ERROR en la nueva revisión desde el inicio del deploy hasta la
  consulta de las 16:53:45 UTC. No se ejecutó conversación autenticada/modelo real
  ni se modificaron invitaciones como parte del smoke.

El CLI advirtió sobre Node 20 (retiro anunciado para 2026-10-30) y el SDK
firebase-functions desactualizado; no se cambió runtime ni dependencias.
Evidencia reproducible y sanitizada en
`.local-isolation/designer-ai-conversation-deploy/`: `source-evidence.json`,
`before.json`, `after.json`, `remote-before.json`, `remote-after.json`,
`deploy-backend.json`, `deploy-hosting.json`, `smoke.json`, scripts y release.

### Incidente de reglas incompatibles — 2026-09-30

El mensaje reportado «olo fiesta», después de preguntar por evento único o
ceremonia/fiesta, produjo la referencia
`973c55a9-d415-44d3-9822-b7214df952cd`. La lectura acotada de logs confirmó
`malformed-output` a las 17:43:01 UTC en `designeraichat-00027-ner`: cinco
resolutions rechazadas porque la regla no correspondía a la hoja, después del
reintento semántico existente. El log conserva índices y causa; no conserva los
pares concretos ni la respuesta. No se atribuye el error al typo ni se presenta
una reconstrucción sintética como salida real del modelo.

Causa de código: el schema estático aceptaba el producto de cualquier leafId,
status y rule; la compatibilidad por hoja solo se aplicaba al validar después.
Además, el repair recibía índices sin hoja/regla. El fix genera una restricción
del mismo `submit_designer_ai_result` por request, desde el predicado compartido
de compatibilidad: IDs disponibles, pares hoja/regla compatibles, estados sin
regla con null y Gallery controlada. Usa `$defs`/`anyOf` dentro de los límites
documentados de [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
No cambia modelo, action types, protocolo, capacidad ni reglas semánticas.
Los errores ahora identifican únicamente hojas/reglas conocidas; no reflejan
identificadores desconocidos ni valores de contenido.

Regresión: `functions/designerAiResolutionSchema.test.mjs` incluye el typo y el
turno anterior anonimizados, cinco pares inválidos sintéticos de la misma clase,
repair exitoso y rechazado, compatibilidad de reglas, Gallery, IDs desconocidos
o unavailable, null/status, inmutabilidad y ledger máximo de 700 hojas. AJV
comprueba que el schema anterior acepta el lote erróneo y el nuevo lo rechaza.
La semántica continúa rechazándolo si un proveedor incumple el schema.

Verificación local: 350/350 tests de las suites AI y consumidores; build backend
con 64 copias coincidentes; lint de 263 archivos con 0 errores/234 warnings;
ownership 41/41 y discovery CLI 101/3/3. Evidencia `incident-*.tap/log/json` en
`.local-isolation/designer-ai-conversation-deploy/`. Los outputs del proveedor
son fixtures; no se invocó el modelo real ni se accedió al draft del usuario.

Publicado como continuación del deploy autorizado, únicamente en
`functions:default:designerAiChat`: revisión `designeraichat-00028-noy`, ACTIVE.
La paridad remota confirmó configuración/binding conservados y ningún cambio
en otras Functions; se normalizó el orden no semántico de `eventFilters` porque
la API devolvió permutaciones en dos triggers de catálogo. Hosting sigue en
`bf62159b19a3bf6c` y el dashboard coincide byte a byte. Smoke a las 17:59:00 UTC:
HTTP 401 esperado, CORS correcto y cero logs ERROR desde el inicio del deploy.
Sin conversación autenticada ni prueba del proveedor real; sin commit ni push.
Evidencia del hotfix en `.local-isolation/designer-ai-rule-pair-hotfix/`.

### Segundo incidente: evidencia atribuida por el modelo — 2026-09-30

La referencia `3a31bf10-3054-4284-bb3a-4ff8e311d889` corresponde a las
19:04:34 UTC en `designeraichat-00028-noy`. La revisión anterior sí estaba
desplegada y recibía el tráfico; la corrección anterior era incompleta.
El log registró doce hojas de fecha/hora/lugar con `resolved_from_user` sin una
action que aportara evidencia. El validador rechazó correctamente el lote.
No se leyó el borrador ni se conservó una respuesta real del modelo.

Causa: la tool seguía ofreciendo `resolved_from_user` aunque el owner de ese
estado ya es `reconcileDesignerAiConversationState`, desde receipts ejecutados,
efectivos y persistidos. Se excluye ese estado del schema enviado al proveedor;
se mantienen la compatibilidad de respuestas anteriores respaldadas, la
validación semántica y todos los controles de evidencia. El schema de
postergación reutiliza el predicado de elegibilidad del validador. Se explicita
que omitir un dato no lo posterga y que `ceremony` es también la fase técnica
de una fiesta única, tanto en actions como en resolutions y controles.

El repair existente ahora recibe un resumen acotado de índices y metadatos
conocidos de la propuesta rechazada, sin valores ni texto libre. Los tipos de
acción desconocidos también se anonimizan en el diagnóstico. No cambia modelo,
tool, capacidades, protocolo, cantidad de reintentos ni deadline global.

La regresión incluye las afirmaciones de evidencia sin action, compatibilidad
legacy, derivación desde receipts persistidos/no persistidos, elegibilidad de
postergación y minimización del contexto de repair. Se probó además el proveedor
real con snapshots y mensajes sintéticos: ocho casos finales aprobados, una sola
llamada por caso, incluyendo `solo fiesta` repetido, `olo fiesta`, paso de
plantilla doble a single, evento doble y estructura/hora/lugar postergado juntos.
Se verificaron actions y las tres hojas de ubicación postergadas. Las iteraciones
previas detectaron postergaciones de datos no mencionados y confusión de fase;
se conservan sus resultados fallidos como evidencia, junto con la corrida final
`live-evidence-eval-v6.json`. Una muestra acotada no garantiza todas las salidas
futuras del modelo ni sustituye una conversación autenticada con el borrador real.

Estas evaluaciones usaron el modelo vigente, `store:false` y la versión de clave
ya vinculada al servicio, leída solo en memoria. No modificaron invitaciones ni
escribieron secretos en archivos, argumentos, entorno o logs. Evidencia técnica
en `.local-isolation/designer-ai-conversation-deploy/evidence-*` y
`live-evidence-eval*.json`; el script limita cada corrida a 16 llamadas.

Checks locales de la corrección: 355/355 tests de AI y consumidores; 11/11 del
schema/repair después del ajuste final de tipos (sin cambio de JavaScript);
build con 64 copias coincidentes; ownership 41/41 y discovery CLI 101/3/3;
lint 263 archivos, 0 errores y los 234 warnings anteriores. `git diff --check`
sin errores. El hotfix modifica dos owners de código, dos copias generadas,
un archivo de regresión y dos documentos. Solo requiere desplegar el backend.

Desplegado como continuación de la autorización existente, desde copia aislada:
`functions:default:designerAiChat`, revisión `designeraichat-00029-rav`, ACTIVE
y con todo el tráfico dirigido a la última revisión. Operación finalizada a las
19:37:01 UTC. La comparación remota confirmó que solo cambió esa función, sin
variación de configuración, entorno ni binding del secreto. Hosting permanece
en `bf62159b19a3bf6c`. El servicio compilado de la release coincide con el probado.
Smoke a las 19:37:51 UTC: chunk del dashboard idéntico, HTTP 401 anónimo esperado,
CORS correcto y cero logs ERROR en la nueva revisión desde el inicio del deploy.
No se ejecutó chat autenticado sobre una invitación real. Evidencia y hashes en
`.local-isolation/designer-ai-evidence-hotfix/`. Sin commit ni push.

### Nombres confirmados y Google Places — 2026-09-30

**Causas comprobadas antes de modificar.** Para legacy sin metadata, el fallback
de `hasDemonstrableExistingValue` consideraba cualquier texto no placeholder como
`existing_user_data`. Además, el header podía hidratarse antes que authoring: el
bridge exponía su snapshot vacío, el ledger declaraba nombres unavailable y la
entrada se consumía preguntando estructura. `hasStarted` no era evidencia de
nombres; el orden determinista ya colocaba `names` primero.

Se exige procedencia positiva por nombre desde las autoridades existentes:
receipt durable con fingerprint, baseline modificado o changedKeys de
personalización. Reentrada/reload no acreditan nombres heredados, mientras que
una confirmación explícita igual al template sí los resuelve. La entrada espera
la hidratación de authoring; no se agrega memoria durable. El backend redacta
nombres no confirmados y la política automática del documento exige nombres
confirmados o `event.set_people` válido en el lote. `guidedFlowCompleted` conserva
editing para legacy ya completados.

**Maps: clasificación principal C (loader).** El cliente usa
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, incorporada por Next durante el build. El chunk
publicado coincidía byte a byte con la release anterior y contenía esa clave;
no se perdió configuración en Hosting. La página no enviaba CSP. Se verificaron
las APIs Maps/Places habilitadas y metadata de restricciones de las keys del
proyecto para el dominio. No se vinculó el valor de la key con un recurso mediante
lookup: la prueba real con esa misma key/origin confirmó autorización efectiva.
No se imprimieron claves ni se modificó configuración remota.

El loader usaba `loading=async`, pero trataba el evento `load` del script como
disponibilidad de `importLibrary`. En un navegador limpio, el script respondió
200 y emitió load antes de exponer la API: ambos intentos fallaron (165 ms/3 ms).
Ahora espera el callback propio de cada intento, según el
[contrato de carga de Google Maps](https://developers.google.com/maps/documentation/javascript/load-maps-js-api).
Con el mismo origin/clave, las dos búsquedas posteriores devolvieron cinco
sugerencias cada una (1777 ms/719 ms). Se conserva timeout de 12 s, limpieza y
retry; un callback viejo no puede acreditar un intento posterior.

La prueba de navegador usó una página sintética bajo el origin de producción,
sin cargar Firebase/Auth ni abrir/escribir invitaciones. Solo ejecutó el loader,
sesión y dos búsquedas Places, sin selección automática ni request de details.
El favicon abortado por el aislamiento no es un fallo Maps. No sustituye una
conversación autenticada sobre el borrador del usuario.

**Defecto adicional E (integración del control).** El acceptance test con panel,
control y owner reales detectó que capabilities no pasaba `values` al resolver
la ubicación. La metadata canónica `__eventDetails.locations` quedaba fuera de
la verificación y `placeSelected` permanecía false sin un objeto mapa. Se relee
esa metadata existente; se mantiene la exigencia de selección humana, misma
phase, efecto local y persistencia antes de continuar.

**Regresiones.** Once casos de nombres cubren primera/segunda entrada, reload,
confirmados y coincidentes con template, uno confirmado, vacío, legacy,
completed legacy con/sin fields dinámicos y carrera de hidratación. Tres escenarios combinados recorren
nombres → single → fecha/hora → Places con selección, fallo/retry/selección o
fallo/cancelación/ubicación manual; todos continúan hacia Dress Code. Se mantiene
la conversación de producción anonimizada y sus variantes RSVP/Regalos, pendientes,
cierre con preview y corrección posterior en editing. Las respuestas del modelo
y transportes de persistencia de estos tests son fixtures; la selección humana,
owners, ledger y receipts se comprueban con los componentes reales.

Checks: 423/423 tests de AI y consumidores; build backend con 64 copias coherentes;
lint de 263 archivos con 0 errores y los 234 warnings previos. Nueve fixtures
antiguos que asumían nombres reales por texto se corrigieron aportando procedencia
explícita, sin cambiar sus assertions funcionales. Evidencia local sanitizada en
`.local-isolation/designer-ai-names-maps/` (`regressions-final.tap`, `lint.log`,
`maps-configuration.json`, `maps-browser-before.json`, `maps-browser-after.json`).
El usuario autorizó posteriormente deploy al terminar; no autorizó push.

Ownership pasó 41/41 tests y discovery real del CLI (101/3/3 endpoints), sin
operaciones remotas. El primer build frontend produjo 14 páginas y preservó la
release anterior. La revisión final agregó el caso legacy sin authoring: la
entrada espera el documento cargado, pero no exige hidratar un owner desactivado.

**Deploy autorizado y verificado.** Se publicó desde la copia aislada
`.local-isolation/designer-ai-names-maps-deploy/release`, conservando las mejoras
anteriores y excluyendo los cambios ajenos de footer/caché. Solo se desplegaron
`functions:default:designerAiChat` y Hosting; sin commit, push, Rules, migraciones
ni cambios de configuración remota.

- Backend: `designeraichat-00030-nud`, ACTIVE, todo el tráfico en la última
  revisión. El inventario confirmó que ninguna otra Function cambió; entorno,
  configuración de servicio y binding del secreto versión 2 conservados.
- Hosting: versión `25db471ac482bf77`, publicada el 2026-09-30 a las 21:32:02 UTC.
  Build Next final `i8d2Dh8eQW-TZgzqUOKiq`; 14 páginas y 73 assets verificados
  en producción, con retención de la release anterior.
- El dashboard publicado coincide byte a byte con la release; se comprobó la
  presencia del callback corregido, el control de hidratación y la clave pública
  Maps del build, sin imprimirla. Backend compilado idéntico al probado.
- Smoke a las 21:32:44 UTC: HTTP 401 anónimo esperado, CORS correcto y cero logs
  ERROR en la nueva revisión desde el inicio del deploy. No hubo conversación
  autenticada sobre una invitación real como parte del smoke.

El diff incremental de este incidente abarca 20 archivos: seis de código,
dos copias generadas, nueve de pruebas/harness y tres documentos. La release
incluye 41 archivos del trabajo acumulado sobre HEAD; no atribuir todo ese diff
a este incidente. Fuente, hashes y evidencia remota sanitizada en
`source-evidence.json`, `remote-before.json`, `remote-after.json`,
`deploy-backend.json`, `deploy-hosting.json`, `published-fixes.json`, `smoke.json`
y `hosting-production.log` dentro del directorio de deploy. `git diff --check`
sin errores. Los avisos previos de runtime Node 20, SDK y Browserslist no se
resolvieron en este alcance; el build y el deploy finalizaron correctamente.

### Ofrecer ayuda antes de abrir galerías — 2026-10-01

El usuario pidió preguntar antes de presentar el panel de fotos. La causa era
concreta: las instrucciones del service ordenaban solicitar `gallery_cell_upload`
apenas `nextBlock` fuese Galleries; el panel montaba directamente ese control.
La pregunta de continuación tampoco ofrecía la decisión de recibir ayuda.

Se reemplaza esa instrucción por pregunta → aceptación → control existente. El
panel contiene además un guard de presentación: una solicitud anticipada se
convierte en la pregunta, conservando feedback respaldado por receipts. El modelo
interpreta la respuesta natural; la sesión UI recuerda ofrecimiento/aceptación
para no preguntar de nuevo por cada Gallery. No se agrega estado durable, tools
ni un segundo editor. La decisión no acredita fotos cambiadas ni completitud.

Ante rechazo/postergación, el modelo propone `deferred_by_user` para las hojas
`guided_completion` pendientes referidas; se valida y persiste con el ledger
existente. Recién entonces se informa que puede hacerlo desde el asistente o el
tab Fotos y se continúa por el primer pendiente real o el cierre con preview.
La postergación sobrevive reload sin modificar imágenes. Un pedido posterior
reabre el mismo control en editing, sin reiniciar onboarding. Aceptar conserva
la finalización explícita por Gallery, evidencia, aislamiento y uploads existentes.

Se agregan siete regresiones de panel real con transporte sintético en
`src/components/editor/designerAi/designerAiGalleryChoice.test.mjs`: solicitud
prematura interceptada, sí y dos galerías consecutivas, no con cierre/reload,
no con otro bloque pendiente, retry del proveedor, persistencia fallida y
edición posterior y recovery de un pedido combinado con una mutación. Los casos
de rechazo se parametrizan, resultando siete tests.
Evidencia local en `.local-isolation/designer-ai-gallery-choice/`.

Verificación: 430/430 tests de AI y consumidores en `regressions-final.tap`;
7/7 específicos de galerías; backend compilado con 64 copias coherentes; lint con
0 errores y 234 warnings previos. Ownership: 41/41 y discovery CLI 101/3/3 en
`ownership-final.log`. La primera corrida de ownership agotó los 30 s al arrancar
JSDOM en un proceso nuevo mientras corrían otras verificaciones; la repetición
por separado pasó sin cambiar timeouts. Se conserva el fallo en `ownership.log`.
Las expectativas existentes de orden y foco de slots se mantuvieron en el prompt;
no se cambió la autoridad de finalización por control.

Publicado como continuación del deploy autorizado de V1, desde copia aislada:
backend `designeraichat-00031-nok`, ACTIVE con todo el tráfico en la revisión
nueva, y Hosting `e40e5a8b2fb3ed87` a las 03:37:33 UTC del 2026-10-01. Solo
cambió `designerAiChat` en el inventario de Functions; entorno, configuración y
binding del secreto versión 2 conservados. No hubo push, commit ni cambios de
Rules/configuración remota. Se excluyeron footer y caché ajenos al cambio.

Build final `4ED4qbNR2DzzHOk8xeK55`: 14 páginas, 69 assets comprobados en
producción y retención de la release anterior. El dashboard coincide byte a byte
con la release y contiene la decisión de galerías y las correcciones previas de
Maps/nombres. Backend compilado idéntico al probado. Smoke a las 03:38:07 UTC:
HTTP 401 anónimo esperado, CORS correcto, cero logs ERROR en la revisión nueva
desde el inicio del deploy. No se ejecutó chat autenticado sobre un borrador real.
Evidencia en `.local-isolation/designer-ai-gallery-choice-deploy/`, incluyendo
`source-evidence.json`, `remote-before.json`, `remote-after.json`, `smoke.json`,
`published-fixes.json` y `hosting-production.log`. Diff incremental: ocho archivos
(tres de código, dos de tests y tres documentos); `git diff --check` sin errores.

## Fechas numéricas cortas — 2026-10-01

El caso reportado (`24/12/26` → pedido de cuatro dígitos → `2026` → pedido
redundante de día/mes) ocurre en la interpretación conversacional. El parser
existente `normalizeVisibleEventDateValue` ya reconoce día/mes/año, separadores
`/`, `.` y `|`, y expande 00–99 a 2000–2099. El input del proveedor ya conserva
los turnos recientes acotados. Las instrucciones solo exigían aclarar fechas sin
año y no distinguían año corto de año ausente ni explicitaban cómo completar
el año desde los datos previos del usuario.

Las instrucciones aceptan esos formatos, emiten la misma `event.set_datetime`
con ISO y conservan el día/mes inequívoco de los turnos existentes al recibir
solo el año. La evaluación real detectó que el prompt solo no alcanzaba: llegó
a rechazar `29/02/28` alegando que 2028 no era bisiesto. Se extrajo el parser
numérico/calendario existente a `shared/authoringValueNormalization.cjs`, con
consumo por el editor y el backend. Para mensajes compuestos íntegramente por
una fecha numérica, el modelo recibe `numericDateInterpretation` con ISO y
validez ya calculados. No asigna phase, no ejecuta ni afirma persistencia;
texto mixto/alternativas queda bajo interpretación conversacional. No agrega
otro parser, memoria, tool ni estado persistente; mantiene validación, receipts,
deadline, minimización y proyección visual actuales. No cambia formatos del canvas.

Casos versionados en `functions/testSupport/designerAiDateCases.mjs`: fecha
corta/larga, día primero, puntos, barras verticales, bisiesto, fecha imposible,
año ausente, año aislado, continuación textual, recuperación del intercambio
reportado y varias fechas previas ambiguas. `dateCasePayload` y
`assertDateInterpretation` permiten evaluarlos con el cliente inyectable de
`interpretDesignerAiChat`; las pruebas ordinarias no invocan servicios externos.
`designerAiDates.test.mjs` verifica paridad con el parser y transporte del contexto.
El fixture de panel agrega fecha corta al recorrido completo hasta preview,
preservación de formato/binding y edición posterior.

Evidencia local: `.local-isolation/designer-ai-short-date/`. La primera evaluación
tenía la estructura single todavía pendiente; se corrigió el fixture para
representar la decisión ya confirmada del caso real. Se conservan las corridas
intermedias. El cambio comparte normalización entre frontend y backend, sin
modificar capacidades ni configuración remota.

Verificación final de contenido: 435/435 regresiones locales, incluidas fechas,
presentación, aislamiento, recovery, nombres, Places, galerías y cierre. En la
evaluación real sintética, las 12 fechas/clarificaciones fueron correctas; 11/12
respuestas pasaron además todos los asserts secundarios. En `year-followup` el
modelo postergó espontáneamente la hora final, aunque la fecha era correcta.
La repetición aislada pasó sin esa postergación y sin alterar el código ni el
assert. Se conservan ambos resultados (`live-eval-final-matrix.json` y
`live-eval.json`): la variabilidad de resoluciones ajenas a la fecha sigue siendo
una limitación observada del modelo, no una garantía resuelta por este cambio.
El smoke de despliegue no escribe una invitación real.

Ownership final: 41/41 y discovery CLI 101/3/3. La primera corrida agotó el
timeout existente de 30 s del proceso de JSDOM; la segunda pasó sin modificar
el test ni los límites (`ownership.log`, `ownership-final.log`). Build de
Functions con las 64 copias compartidas coherentes (`build-final.log`).

Publicado desde copia aislada, sin push ni commit: backend
`designeraichat-00032-cir`, ACTIVE con todo el tráfico en la revisión nueva;
Hosting `83b8938d85bd9624`, release 2026-10-01 14:54:26 UTC. Solo cambió
`designerAiChat` en el inventario; entorno y binding de secreto versión 2
conservados. Se excluyeron los cambios ajenos de footer/caché.

Build `jKUSS9Za4sHvKllma30_9`: 66 assets estáticos verificados en producción,
incluido el chunk compartido `3627-e04ced9eeadb9693.js` con el parser. Dashboard,
parser y backend compilado coinciden con la release probada; siguen presentes
las correcciones de nombres, Maps y elección de galerías. Smoke 14:55:52 UTC:
HTTP 401 anónimo esperado, CORS correcto y cero logs ERROR de la revisión nueva.
Lint final: 0 errores / 234 warnings existentes. Evidencia y hashes en
`.local-isolation/designer-ai-short-date-deploy/`; diff incremental respecto
del trabajo previo en `.local-isolation/designer-ai-short-date/incremental.patch`.

## Continuación después de seleccionar Places — 2026-10-01

Regresión anonimizada: se aporta el nombre del lugar, se elige buscar en Maps,
se selecciona y guarda un resultado y el asistente vuelve a pedir la dirección
manual junto con el horario de fin. Se reprodujo localmente con el panel, owner,
ledger y persistencia reales y respuesta sintética equivalente a la reportada.
No se leyó ni modificó una invitación de producción para reproducirla.

Causas en código:

- `withDesignerAiGuidedContinuation` conservaba cualquier pregunta del modelo
  si antes/después seguía en `event_data`; no distinguía la continuación después
  de verificar un control. La pregunta obsoleta sobrevivía aunque la dirección
  estuviera resuelta y solo faltara el horario de fin.
- La reconciliación Places terminalizaba únicamente `place_selection`. Cuando el
  valor elegido coincidía con el ya visible (template o pendiente/postergado),
  podía conservar procedencia/resolución anterior. El backend redacta los valores de template;
  confirmar explícitamente el resultado debe aportar evidencia a sus textos.

`getDesignerAiGooglePlaceVerifiedLeafIds` reutiliza la verificación exacta del
owner y del snapshot de la misma phase. Acredita selección y textos no vacíos
aportados por Google, nunca los conservados por fallback ni una phase hermana.
El panel persiste esas resoluciones antes de continuar. No cambia Google Places,
su loader, credenciales, formato de dirección ni el owner de persistencia.

La continuación verificada conserva el reconocimiento anterior a la primera
pregunta y usa la pregunta existente derivada de las hojas pendientes. No
reutiliza preguntas obsoletas ni sus conectores. En edición solo reconoce el
cambio; las aclaraciones normales dentro de un bloque, como pedir el año,
conservan su comportamiento. Se reutiliza `verifiedContinuation`, incluido retry;
no se agrega estado durable, capacidades ni información enviada al proveedor.

Cobertura: `designerAiMapsContinuation.test.mjs` prueba dirección nueva, igual a
template, needs_clarification, deferred_by_user, edición posterior, dos fases,
cancelación, fallo de escritura y fallo de metadata con retry, reload y
corrección manual posterior. Inyecta la pregunta repetida para verificar que no
se muestre aun si la propone el modelo. `designerAiLocationInteraction.test.mjs`
cubre evidencia incorrecta, campos ausentes/fallback y fases no aplicables.
Se preserva la minimización: Place ID y coordenadas no viajan en el callable.

Evidencia incremental: `.local-isolation/designer-ai-maps-continuation/`.
`red-valid-fixture.tap` conserva los seis fallos que reproducían la repetición
antes del cambio. Las primeras expectativas se ampliaron con casos negativos;
un fixture unitario incompleto se corrigió usando el sanitizador canónico.
Alcance desplegable: frontend; Functions y contratos compartidos sin cambios
respecto de la release de fechas.

Verificación: 446/446 tests AI y consumidores (`regressions-final.tap`), incluidos
10 tests de la nueva conversación/continuación y los casos negativos del helper.
No se invocó el modelo real ni Google Places para estas regresiones: la selección
y la respuesta problemática se inyectan; owners, ledger y formatter son reales.

Publicado únicamente en Hosting desde copia aislada: versión `1813d4c128534874`,
release 2026-10-02 00:09:39 UTC (1 de octubre, 21:09:39 en Buenos Aires), build
`Qg2sR4dcBe7R8dZyfs94y`. Build/lint/typecheck de Next y verificación local pasaron;
los 66 assets estáticos se verificaron también contra producción. El dashboard
publicado coincide byte a byte con la release e incluye los cambios previos de
nombres, galerías y Maps; el chunk compartido de fechas también coincide.
Functions conserva `designeraichat-00032-cir`: ninguna función cambió, ni su
configuración o binding de secreto. Smoke a las 00:10:31 UTC: HTTP 401 anónimo
esperado, CORS correcto y cero logs ERROR desde el inicio del deploy. No se
ejecutó una conversación autenticada ni se modificaron datos de invitaciones.
Evidencia de build, hashes y verificaciones en
`.local-isolation/designer-ai-maps-continuation-deploy/`. Se excluyeron los cambios
ajenos de footer/caché; no se hizo push ni commit.

## Hora de finalización reactiva — 2026-10-02

Cambio de producto solicitado: no preguntar proactivamente por la hora de fin.
La causa era su pertenencia a `event_data`/`guidedFlow` y la pregunta explícita
en `buildDesignerAiGuidedQuestion`. El ledger ahora conserva ambas hojas
`event.{phase}.end_time` en `outside_guided_flow`, con los mismos valores,
procedencia y validadores. No las marca resueltas ni postergadas artificialmente;
no participan de `nextBlock`, bloqueantes ni pendientes del cierre guiado.
Se elimina la pregunta del adaptador y se alinea el prompt: solo pedir aclaración
si el usuario ya solicitó un cambio de hora de fin ambiguo. `event.set_datetime`
sigue disponible para aportes espontáneos y correcciones, incluso en edición.

Regresiones nuevas: single/doble con fin pendiente, needs_clarification o
deferred_by_user; avance a Dress Code, cierre sin fin, persistencia/reload y
corrección posterior. La conversación de producción completa ya no necesita
`optional_end_time_omitted` para llegar a `Ver vista previa`. Tras Maps se pregunta
por el siguiente dato real, nunca por la hora de fin. Reglas antiguas de omisión
siguen compatibles con metadata existente.

453/453 tests AI y consumidores pasaron en el árbol de trabajo; tras ajustar el
fixture de cierre, sus cinco variantes también pasaron. La copia aislada exacta
para despliegue pasó nuevamente 453/453. Ownership: 41 tests, tres builds y
discovery real de las tres codebases, sin operaciones remotas. Build de Functions
con 64 copias compartidas coherentes. Tests de proveedor/selección sintéticos;
no se ejecutó conversación autenticada ni se modificaron invitaciones reales.
Evidencia en `.local-isolation/designer-ai-no-end-time/` y
`.local-isolation/designer-ai-no-end-time-deploy/`.

La release parte de `como-migration-deploy`, build `7WQSslIcDttRwv0dx0Rzc`, y
aplica exclusivamente el diff incremental de esta tarea. Conserva los fixes
publicados de arranque y migración del editor, Maps, fechas y galería, sin incluir
otros cambios pendientes del working tree. Requiere Hosting y solamente
`functions:default:designerAiChat`; no requiere cambios de credenciales, reglas,
configuración remota o modelo.

Durante la preparación, el disco local se llenó al exportar Next y el primer
intento de Functions falló en predeploy antes de actualizar la función. Se
liberaron únicamente las carpetas `.next/cache` de las cuatro releases aisladas
anteriores y se regeneraron `.next`/`out` del build fallido. Se conservaron
fuentes, hashes, assets publicados y evidencia. El rebuild pasó con build
`BA3BygiZPjw1D4Klz9CWG` y 71 assets estáticos (incluye retención); lint de Functions
sin errores y con los 234 warnings previos. El diff incremental verificado no
modificó ningún archivo ajeno a la tarea (`final-audit.json`).

Deploy completado: `designerAiChat` revisión `designeraichat-00033-leh`, ACTIVE,
y Hosting `126379e844370745` (2026-10-02 03:58:09 UTC). El inventario confirma
que solo cambió esa función; configuración y binding de secreto conservados.
HTML del dashboard y 71 assets verificados en producción; el chunk del dashboard
coincide byte a byte con el build probado. Smoke 03:58:59 UTC: 401 anónimo esperado,
CORS correcto y cero logs ERROR de la revisión nueva. Sin push ni commit.

## Regalos confirmado vuelve desde Galería — 2026-10-03

El chat reportado guarda un alias, ofrece fotos, repite el consentimiento y vuelve
a pedir modalidad/datos de Regalos. Se reprodujeron cuatro fallos locales
(`designer-ai-gifts-loop/red.tap`) con datos sintéticos y owners reales:

- Una `needs_clarification` del modelo reemplazaba el estado derivado de un
  receipt efectivo/persistido del mismo lote, incluso para alias o activación.
- Una aclaración persistida de `gifts.enabled` no se recalculaba cuando ya había
  un medio visible completo confirmado. Por eso `nextBlock` seguía en Regalos.
- Con ese estado, una oferta de galería escrita por el modelo no activaba el
  ofrecimiento local; al solicitar luego el control se volvía a pedir permiso.
- “Pasame el alias” no tenía signos de pregunta: el adaptador lo trataba como
  falta de continuación y agregaba otra elección de modalidad.

No se leyó el estado ni la salida estructurada del draft real; estos son caminos
reproducidos compatibles con el chat, no una atribución a un payload no observado.
La corrección protege receipts vigentes del lote frente a aclaraciones redundantes;
reutiliza `keep_existing` para activación ya confirmada cuando el medio tiene
evidencia propia; y conserva solicitudes imperativas del modelo dentro del mismo
bloque. Un medio elegido incompleto pide solo su valor. No se agrega modalidad,
memoria, tool ni regla de resolución; templates, datos incompletos, valores sin
procedencia y postergaciones no reciben confirmación automática.

`designerAiGiftsLoop.test.mjs` cubre tres caminos del alias, un solo consentimiento
de fotos, cierre/preview, reload en editing, procedencias confiables/no confiables,
datos incompletos, postergación, medio adicional pendiente y fallo de guardado con
retry. Las regresiones previas de nombres, fecha, Maps, RSVP y galería se conservan.
Evidencia en `.local-isolation/designer-ai-gifts-loop/`; release aislada sobre la
última publicada en `.local-isolation/designer-ai-gifts-loop-deploy/`.

Verificación: 466/466 regresiones AI/consumidores pasaron en root y en la copia
aislada. El ajuste final conserva solicitudes de datos tanto en `clarify` como
en `apply`; sus 28 tests de Regalos, conversación y Maps pasaron. Lint: cero
errores y los 234 warnings existentes. Ownership: tres builds y 41/41 tests;
discovery de default agotó inicialmente el límite de 10 s y las tres codebases
pasaron al repetir solo esa etapa en la misma copia sin credenciales, sin cambiar
los límites. No se invocó un modelo real ni se modificaron invitaciones para
estas verificaciones. Fuentes y hashes de backend quedan iguales después del
ajuste final, que solo afecta al formatter y su test de frontend.

La release final también pasó nuevamente 466/466 (`regressions-final.tap`) y
el build Next `PIbO9shMTQOX2BUOfnKqj`, con 69 assets estáticos verificados localmente.
El build previo del formatter no se publicó. Los hashes de entradas excluyen el
reporte de lint generado heredado de la release base; se conserva la captura
anterior a esa exclusión y se siguen verificando todas las fuentes de código.

Deploy verificado: backend `designeraichat-00034-lux`, ACTIVE; Hosting
`3bc3fba25ae617e5` (2026-10-03 03:37:34 UTC). Solo cambió `designerAiChat` en el
inventario de Functions; entorno y binding de secreto conservados. HTML y 69
assets verificados contra producción, dashboard idéntico byte a byte al build.
Smoke 03:38:39 UTC: HTTP 401 anónimo esperado, CORS correcto y cero logs ERROR
de la revisión nueva. Sin conversación autenticada, push ni commit.

## Portada: ofrecer el cambio y continuar después de guardarlo — 2026-10-05

Causa comprobada de la pregunta: el formatter de continuación tenía el texto
“¿Qué foto quieren usar para la portada?” y el prompt no definía la oferta previa
de cambiar la imagen actual. Se reemplaza por esa decisión y se protege la
apertura anticipada del uploader durante inicio/continuación. El pedido humano
abre el mismo `MiniToolbarTabImagen` con scope `cover`; no cambia su lifecycle.
Rechazar conserva la foto, registra `deferred_by_user` y continúa. La aceptación
solo vive en el `journeyRef` existente, no en memoria durable nueva.

El error reportado era el fallback de la llamada posterior al control. En logs
de producción se observó `malformed-output` a las 20:41:58 UTC del 2026-10-05 con
la razón “apply requiere acciones, una decisión o un control local”. Se reprodujo
localmente ese rechazo: el service descartaba una resolución redundante de una
hoja `resolved_by_control`, pero conservaba `intent:apply` sin acciones y luego
lo rechazaba. Ahora normaliza ese resultado a `clarify`, como ya hacía para las
resoluciones redundantes de Party. Respuestas originalmente vacías, hojas
desconocidas y otras resoluciones inválidas siguen rechazándose. La evidencia
local terminal no se sustituye ni se inventa.

Límite diagnóstico: el log prueba esa razón de rechazo y el fixture reproduce
un camino compatible; no se inspeccionó el payload del modelo ni el borrador
privado para atribuirle cada paso interno. Solo se guardaron categorías/fecha
del log, sin usuarios, chats ni datos bancarios.

Siete regresiones de panel cubren oferta antes del control, solicitud anticipada,
“la subo acá”, imagen idéntica sin falsa completitud, cambio real, rechazo,
cancelación, reload/editing, cierre/preview, Regalos → Portada → Galería,
persistencia fallida y retry posterior al control sin volver a subir la imagen.
Dos regresiones backend cubren portada y Places ya verificados, conservando
negativos de `apply` vacío y hojas inválidas. Pasaron 475/475 regresiones en root.
La prueba del panel usa owner/transport sintéticos y el validador backend real;
el lifecycle de upload conserva además las regresiones V1 existentes.

Evidencia: `.local-isolation/designer-ai-cover-choice/`; release aislada sobre
`PIbO9shMTQOX2BUOfnKqj` en `.local-isolation/designer-ai-cover-choice-deploy/`.
No se agregan habilidades, tools, modelo ni configuración.

La release exacta pasó también 475/475 pruebas, build de Functions con 64 copias
verificadas y lint con cero errores/234 warnings previos. Ownership ejecutó los
tres builds, 41/41 tests y discovery real de default/Payments/Email sin llamadas
remotas. El primer intento desde la release no pudo copiar un archivo auxiliar
de rollback ausente; se ejecutó desde el repo completo y se verificó igualdad
de 256 entradas backend/shared con la release. El log terminó en `Ownership gate
passed`; el wrapper PowerShell reportó código 1 con `NativeCommandError` por
warnings de stderr, sin fallas de tests ni discovery en la salida.

Deploy verificado: Hosting `d1d1cd5dea66d307`, publicado el 2026-10-05 a las
21:11:09 UTC, build `svo6cZFIHLG6jXhVbvUAY`; backend `designeraichat-00035-vuh`,
ACTIVE. Inventario posterior: únicamente `designerAiChat` cambió; entorno y
binding del secreto se conservaron. HTML y 69 assets coinciden con la release,
incluido el chunk del dashboard byte a byte.

El smoke inicial detectó dos ERROR en stderr. Se diagnosticaron como rechazos
del SDK Firebase a dos GET (400), anteriores al handler y al smoke, no errores
del service AI. Se conserva ese resultado fallido y la clasificación por fechas
exactas en `error-classification.json`; el chequeo posterior `smoke-classified`
pasó a las 21:15:28 UTC, con cero errores nuevos/sin clasificar, POST anónimo 401
y CORS correcto. No se ejecutó un chat autenticado ni un upload en producción.

Advertencias operativas observadas, fuera de este cambio: Browserslist antiguo
en el build y Firebase CLI anunció decommission de Node 20 el 2026-10-30. No se
cambió runtime ni dependencias. Sin push ni commit; cambios ajenos conservados.

## Portada: nuevo rechazo de continuación vacía — 2026-10-05

La prueba posterior volvió a fallar con la revisión `designeraichat-00035-vuh`
ya desplegada. Logs de 21:20:45, 21:20:58 y 21:24:57 UTC registran
`malformed-output` con “apply requiere acciones, una decisión o un control local”.
No era falta de deploy. En esa revisión el filtro anterior ya convierte las
resoluciones redundantes descartadas a `clarify`; el rechazo restante corresponde
a un `apply` originalmente vacío. La validación lo rechaza correctamente.

La causa de la interrupción de UX es la llamada adicional al modelo después de
guardar/verificar la portada, cuando solo hace falta presentar el siguiente
pendiente ya determinado por el ledger. Se reprodujo contra el panel de la
release publicada, con transporte sintético que devuelve ese mismo rechazo:
las dos variantes de aceptación fallan en `deployed-regression-red.tap`.

La corrección usa `buildDesignerAiLocalContinuation` después del reread y de
confirmar `media.cover:resolved_by_control`. Reutiliza las preguntas existentes
y la prioridad del ledger. No vuelve a consultar al modelo, aplicar cambios ni
escribir resoluciones para avanzar. En edición solo confirma. Ofrece Galería una
vez y conserva su aceptación; si ya había consentimiento, abre el control actual
validado para la primera Gallery pendiente, sin seleccionar imágenes ni finalizarla.
`Continuar recorrido` relee el estado y utiliza esa misma presentación local,
incluidos errores previos de continuación de otros controles. Si una edición
manual completó lo restante, guarda primero `guidedFlowCompleted`; una falla
de metadata conserva el botón de reintento y no muestra el cierre. El guardado
y el callback mantienen la autoridad de sesión existente.

El backend, su rechazo de `apply` vacío, los receipts y las garantías de subida
permanecen vigentes. La hoja debe coincidir con la evidencia persistida antes de
confirmar la portada. Una falla de metadata no anuncia éxito; cancelar o volver a
publicar la misma imagen tampoco aporta evidencia nueva por sí solo.

Regresiones: 22/22 de Portada/Maps, incluyendo recuperación local sin repetir el
proveedor y cierre durable tras edición manual; 479/479 de AI y consumidores en
root antes del último refuerzo del reintento. Se mantiene el recorrido con
vista previa, reentrada en editing, consentimiento único de Galería y guardado
fallido. No se leyó el contenido del draft ni la salida privada del modelo.
Evidencia en `.local-isolation/designer-ai-cover-continuation/`; release frontend
aislada sobre `svo6cZFIHLG6jXhVbvUAY` en
`.local-isolation/designer-ai-cover-continuation-deploy/`.

La release final pasó 480/480 regresiones (`regressions-final.tap`) y build Next
`eloIt8YPR7O0nkPgbDCrF`, con 69 assets estáticos. El build previo al refuerzo del
reintento no se publicó; se conservan sus hashes/log y los del resultado final.
Ocho archivos en el diff incremental, incluyendo tests/harness y documentación;
el audit confirma que no se modificaron archivos ajenos a este pedido.

Deploy exclusivo de Hosting: `1a363d7363a3d27d`, publicado el 2026-10-05 a las
21:45:05 UTC. Verificación HTTP de HTML, 69 assets y chunk de dashboard idéntico
al build probado. Functions y configuración sin cambios; `designerAiChat` sigue
en `designeraichat-00035-vuh`, ACTIVE. Smoke de 21:45:36 UTC: POST anónimo 401
esperado, CORS correcto, cero logs ERROR desde el inicio de este deploy.
Sin conversación autenticada ni upload real en producción, push o commit.

## Checkpoint local en main — 2026-10-05

Consolidación del trabajo existente sobre `eebffec5938cffb3d0620e46482c928d5c84d011`,
sin funcionalidades nuevas, push ni deploy. Incluye las correcciones de apertura
del editor y migración de authoring ya publicadas junto con Diseñador AI, sus
regresiones y las seis copias compartidas requeridas por el contrato de Functions.
La revisión corrigió solamente una fila documental que aún mostraba el orden
anterior del recorrido. El código coincide con la última release local publicada,
sin considerar diferencias de finales de línea.

Verificaciones ejecutadas sobre el árbol del checkpoint:

- `npm.cmd --prefix functions run build`: correcto; 64 copias coincidentes.
- `npm.cmd --prefix functions run typecheck`: correcto, `tsc --noEmit`.
- Suite AI y consumidores: **490/490**. Es el comando de regresiones de esta
  sección más `googlePlaces.test.mjs`, `location.test.mjs`, `personNames.test.mjs`,
  `src/domain/templates/authoring/service.test.mjs` y
  `src/components/editor/canvasEditor/useCanvasEditorStartupStatus.test.mjs`.
- `npm.cmd --prefix functions run lint`: 265 archivos, **0 errores y 234 warnings**
  existentes. No hay un comando de lint frontend independiente configurado.
- Gate canónico `verifyFunctionsOwnership.cjs`: tres builds, **41/41** tests y
  discovery CLI de default/Payments/Email (101/3/3), sin operaciones remotas.
  La primera corrida tuvo un timeout de 30 s en la prueba no modificada de
  inicialización JSDOM (40/41); el gate completo pasó al repetirlo por separado
  sin cambiar código, assertions ni límites. Se conservan ambos logs.
- `npm.cmd run build`: correcto; 14 páginas exportadas, build
  `mQpByv4VSp6pAcN7H5yx3`, 78 archivos estáticos verificados y retención de assets.
  Persiste el aviso previo de Browserslist desactualizado.

Se revisaron todos los archivos modificados/nuevos y se verificó la ausencia de
credenciales y artefactos locales en la selección. Footer y caché de Hosting se
preservaron en un stash identificado, fuera del commit. Evidencia y respaldo en
`.local-isolation/designer-ai-main-checkpoint/`, excluidos del versionado.
Estas verificaciones no invocan el modelo real, Places remoto ni invitaciones de
producción; no sustituyen una prueba autenticada del producto.
