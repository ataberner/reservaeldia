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
