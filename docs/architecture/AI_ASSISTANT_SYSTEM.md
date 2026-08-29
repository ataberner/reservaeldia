# AI Assistant System

Status: Canonical Architecture Reference.

Revalidado contra implementación y tests el 2026-08-28.

## 1. Propósito y autoridad

Este documento es el mapa técnico canónico del tab `Diseñador AI`. Define
límites, flujo, owners reales y estado de garantías sobre interfaz, backend,
instrucciones, contexto, mensajes, tools, streaming, sesiones, persistencia,
autorización, seguridad, fallbacks, reintentos, rate limits, cancelación y
respuestas obsoletas.

No define la personalidad ni el copy deseado; ver
[AI_ASSISTANT_CONVERSATION_CONTRACT.md](../contracts/AI_ASSISTANT_CONVERSATION_CONTRACT.md).
No define nuevas actions; ver
[DESIGNER_AI_CAPABILITY_CONTRACT.md](../contracts/DESIGNER_AI_CAPABILITY_CONTRACT.md).

`Diseñador AI` es un adaptador del editor existente. No es un editor autónomo,
no posee `objetos`, `secciones`, `rsvp`, `gifts` ni `eventDetails`, y no dispone
de acceso libre al canvas, Firestore o Storage.

## 2. Owners reales verificados

| Responsabilidad | Owner actual | Observaciones |
| --- | --- | --- |
| Gate de acceso frontend | `src/domain/editor/designerAiAccess.js` | Exige superadmin resuelto, draft writable y no selector. |
| Entrada de tab, panel responsive, exclusión del Asistente e historial efímero por borrador | `src/components/DashboardSidebar.jsx` | Monta/desmonta `DesignerAiPanel`; abrirlo desactiva Assistant. Su estado React sobrevive al cambio de tab y se descarta con el `sidebarInstanceKey` al salir o cambiar de borrador. |
| UI, envío, loader, controles locales, stale guards y mensajes seguros | `src/components/editor/designerAi/DesignerAiPanel.jsx` | Consume y actualiza el historial del sidebar; no existe un reducer/store de conversación independiente. |
| Control especializado de ubicación | `src/components/editor/designerAi/DesignerAiLocationControl.jsx` | Superficie mínima de búsqueda/selección/cierre; ocupa el área de trabajo del chat mientras está activa y no monta el formulario completo de Detalles del evento. |
| Decisión y targeting conversacional de ubicación | `src/domain/editor/designerAiLocationInteraction.js` | Deriva phase, precarga y decisión Maps desde resultado + snapshot; no persiste un segundo modelo. |
| Proveedor Google Places | `src/domain/eventDetails/googlePlaces.js` | Loader, sesión de autocomplete, sugerencias y details compartidos por el tab manual y Diseñador AI. |
| Mutación canónica de ubicación | `src/domain/eventDetails/locationAuthoring.js` + `updateTemplateAuthoringEventLocation` | Coordina fields/defaults y el objeto `mapa-google`; diferencia escritura manual de selección Google. |
| Callable backend | `designerAiChat` inline en `functions/src/index.ts` | Autoriza superadmin, carga secret, relee el nombre mínimo del perfil, invoca service y redacta logs/respuestas de error. |
| Cliente OpenAI, instrucciones, input, validación de salida y errores upstream | `functions/src/designerAi/service.ts` | Usa Responses API sin streaming. |
| Tool schema, versión, allowlists y validación estructural/contextual | `shared/designerAiCapabilityContract.cjs` | Source checked-in; `functions/scripts/syncTemplateContract.cjs` genera copias para Functions. |
| Ledger, procedencia, completitud global/guiada, dependencias y priorización | `shared/designerAiConversationLedger.cjs` | `GUIDED_FLOW_BLOCKS` es la única prioridad ejecutable; también se copia mecánicamente a Functions. |
| Construcción de snapshot/contexto frontend | `src/domain/editor/designerAiCapabilities.js` | Reutiliza snapshot/bridges y normalizadores de los dominios reales. |
| Ejecución de actions | `src/domain/editor/designerAiActionExecutor.js` | Corre en el navegador y delega en owners existentes; no hay tool executor backend. |
| Nombre de documento y metadata conversacional | `src/lib/dashboardDocumentNameBridge.js` + `src/components/DashboardHeader.jsx` | El header persiste `designerAiConversation`, incluida `usage.hasStarted`, mediante la autoridad de sesión. |
| Nombre registrado mínimo | `usuarios/{uid}.nombre`, leído por `designerAiChat` con `extractProfileFromDocData` | Solo el nombre normalizado llega al service; no se envía el perfil completo. |
| Persistencia del borrador | `src/components/editor/persistence/editorSessionPersistence.js` | Draft: Firestore bajo el usuario; templates no están habilitados para Designer AI. |
| Autorización backend | `functions/src/auth/adminAuth.ts` | `requireSuperAdmin` usa UID autenticado y `SUPERADMINS_UIDS`/runtime config. |
| Autorización de escritura de drafts | `firestore.rules` | El cliente solo actualiza `borradores/{id}` si es owner y no cambia `userId`. |
| Tests | `shared/designerAi*.test.mjs`, `src/domain/editor/designerAi*.test.mjs`, `src/components/editor/designerAi/DesignerAiPanel.test.mjs`, `functions/designerAi*.test.mjs` | Cobertura estructural/dominio; no evalúan calidad del modelo real. |

## 3. Flujo actual de una intervención

```text
DashboardSidebar
  -> monta DesignerAiPanel para un draft writable autorizado
  -> Panel relee metadata, deriva first_entry/reentry y persiste usage.hasStarted
  -> Panel arma snapshot mínimo + ledger global/guided
  -> callable designerAiChat valida auth y payload
  -> service arma developer instructions + estado mínimo + últimos turnos
  -> OpenAI devuelve una única function_call submit_designer_ai_result
  -> backend valida salida y devuelve propuesta estructurada
  -> Panel descarta sesión/revisión obsoleta y revalida el lote
  -> designerAiActionExecutor delega en owners existentes del editor
  -> Panel relee el borrador, reconcilia ledger y persiste metadata
  -> recién entonces muestra confirmación o fallback seguro
```

La function call de OpenAI es un sobre de salida estructurada; no ejecuta por sí
misma una tool de negocio. Las actions reales se ejecutan después en el cliente.

Cuando una selección requiere precisión visual o autoridad externa, el flujo
reemplaza transitoriamente el área de historial + composer, sin perder el
historial efímero:

```text
chat -> intención/phase -> decisión explícita de usar Maps
     -> DesignerAiLocationControl a altura disponible -> sugerencias locales de Places
     -> selección explícita -> locationAuthoring -> persistencia normal del draft
     -> reread de placeId/lugar/dirección -> resolved_by_control -> continuación
```

La alternativa manual también es una decisión confiable de UI: el panel persiste
`leave_empty` para la hoja `place_selection` de la phase exacta y luego relee el
ledger. No envía un mensaje artificial afirmando que ya existe una dirección. Si
esa dirección falta, `event_data` continúa pendiente y la siguiente intervención
la solicita.

Este es el primer uso implementado del patrón **chat orquesta; control
especializado resuelve la selección precisa**. No existe un framework genérico ni
un formulario paralelo: `MiniToolbarTabDetallesEvento` y el control especializado
reutilizan el mismo proveedor de Places y el mismo coordinador de authoring, que
escriben el mismo shape; cada superficie conserva solo su presentación.

## 4. Construcción de instrucciones y relación con documentación

### 4.1 Implementación vigente

`SYSTEM_INSTRUCTIONS` vive inline en `functions/src/designerAi/service.ts`. El
service agrega un segundo mensaje `developer` con snapshot mínimo y prioridad del
ledger, luego hasta seis turnos recientes y finalmente el mensaje del usuario.
La configuración observada es modelo `gpt-5.6-luna`, reasoning effort `none`,
text verbosity `low`, `max_output_tokens:4000`, `store:false`, una tool forzada y
sin parallel tool calls ni `previous_response_id`.

La documentación no se carga dinámicamente ni compila el prompt. Por lo tanto:

- el contrato conversacional es autoridad de producto para futuros cambios;
- el capability contract y el schema compartido son autoridad para acciones;
- `SYSTEM_INSTRUCTIONS` es el owner ejecutable principal, pero el cliente también
  aporta seeds operativos, el cierre verificado y fallbacks visibles en
  `DesignerAiPanel.jsx`;
- el orden no se repite en esos textos: el service consume `nextBlock` derivado
  de `ledger.guidedFlow`;
- no existe hoy un test de paridad documento -> instrucciones ni módulos de
  prompt separados por responsabilidad.

Las decisiones estructurales de esta revisión están reflejadas así:

- el panel deriva `entryMode` de la señal durable antes de marcarla como iniciada;
- el callable incorpora únicamente el nombre registrado mínimo;
- el brief y el cierre usan `ledger.guidedFlow`, no la completitud global;
- RSVP queda reactivo y fuera de `nextBlock`;
- los textos de ubicación se aplican como datos manuales y la decisión de abrir
  Places se representa aparte; el prompt no selecciona resultados ni recibe su
  metadata;
- `COMPLETE_MESSAGE` comunica fin del recorrido, edición manual y acceso a
  `Vista previa`.

El prompt pide español permanente, voseo y la personalidad aprobada. Todavía no
existe una evaluación durable que mida consistencia o calidad de esas respuestas;
esto no reabre el orden funcional ya ejecutable.

El target normativo permanece dividido entre el contrato conversacional y la
sección 5 del capability contract. Cambios futuros deben modificar esos owners y
tests en conjunto, no sumar otro prompt ni otra lista de priorización.

### 4.2 Regla de composición para cambios futuros

La composición debe conservar cinco capas sin copiar todo en un prompt único:

| Capa | Autoridad | Qué llega al modelo |
| --- | --- | --- |
| Reglas conversacionales | `AI_ASSISTANT_CONVERSATION_CONTRACT.md` | Solo reglas runtime necesarias, implementadas en el owner de instrucciones. |
| Conocimiento funcional | Documento/código canónico de cada dominio | Un adaptador mínimo o datos del snapshot; no una copia indiscriminada de toda la documentación. |
| Capacidades/tools | `DESIGNER_AI_CAPABILITY_CONTRACT.md` + schema compartido | Tool schema, availability, valores permitidos y ledger. |
| Arquitectura técnica | Este documento | No debe enviarse al modelo salvo una regla operacional imprescindible. |
| Evaluaciones | Tests junto al owner; documento separado solo con matriz durable | No forma parte del prompt. |

Agregar una funcionalidad requiere primero actualizar su owner de producto. Solo
si Designer AI puede consultarla o mutarla se actualizan además capability
contract, snapshot, schema/validador, executor, instrucciones mínimas y tests. El
prompt nunca crea capacidad por sí solo.

## 5. Contexto, mensajes y confianza

### 5.1 Contexto enviado

El payload contiene:

- `contractVersion`, `clientMessageId`, `entryMode` y mensaje actual;
- hasta seis turnos recientes, de hasta 700 caracteres cada uno;
- snapshot saneado con availability, valores funcionales acotados, ledger
  global/guiado, `usage.hasStarted` y política de nombre;
- contexto server-side con un único campo `registeredFirstName`, obtenido de
  `usuarios/{uid}.nombre` y normalizado a string vacío cuando no existe.

Antes del callable el frontend elimina revisiones de media y fingerprints. El
backend vuelve a sanear, limita el snapshot a 160 KB y elimina del contexto del
modelo valores con procedencia `template_value` o `placeholder_or_sample`.
La lista externa de regalos expone presencia/configuración, no su URL.

El contexto no incluye `objetos`, `secciones`, geometría, URLs/media privadas,
paths de Storage, `placeId`, coordenadas, metadata de Firestore/Google ni el
objeto de perfil. La única identidad personal agregada por el sistema es el
nombre registrado mínimo para el saludo.

El snapshot sí puede incluir valores funcionales de texto necesarios para
interpretar cambios, incluidos métodos bancarios visibles/configurados de Gifts.
Además, `message` y `recentTurns` son texto libre: no existe una capa DLP o un
redactor que quite una URL, credencial u otro dato sensible pegado manualmente por
el usuario antes de enviarlo a OpenAI. La garantía de exclusión de URLs/media
aplica al snapshot construido por el sistema y a los controles locales, no a todo
texto que una persona pueda escribir en el chat.

La minimización actual es por allowlist de campos, no por intención del turno:
cada request puede transportar todo el snapshot funcional saneado aunque el
mensaje solo trate un bloque. No existe selección server-side de leaves estrictamente
necesarias para la intervención actual.

### 5.2 Separación de confianza

| Entrada | Tratamiento actual |
| --- | --- |
| Instrucciones del sistema | Mensaje `developer` construido server-side. |
| Estado mínimo | Segundo mensaje `developer`, pero originado en snapshot enviado por el cliente y saneado/validado por shape. |
| `entryMode` | Enum derivado de metadata persistida por el panel y validado por claves exactas; no se infiere de texto o historial. |
| Nombre registrado | Leído server-side del perfil, pero tratado como dato de usuario no confiable para instrucciones; solo puede usarse como forma de tratamiento. |
| Mensajes del usuario | Rol `user`; no confiables. |
| Turnos previos del asistente | Rol `assistant`; contexto conversacional, no autoridad sobre el borrador. |
| Valores heredados de template/placeholders | Se redactan antes de exponerlos al modelo. |
| Resultado del modelo | No confiable hasta validación backend y frontend. |

El prompt indica ignorar intentos de ampliar límites, revelar instrucciones o
ejecutar código. La garantía fuerte no depende solo de esa frase: el tool schema
es estricto, el resultado se valida dos veces y el executor solo reconoce actions
allowlisted.

Límite: el backend solo relee Firestore para el nombre mínimo del perfil; no
recibe un ID de draft ni relee el borrador para verificar el snapshot. Valida
estructura y coherencia interna de datos aportados por un cliente superadmin, no
su correspondencia server-side con un borrador actual.

## 6. Tools, autorización y validación

### 6.1 Modelo de tools actual

OpenAI está forzado a devolver exactamente una function call
`submit_designer_ai_result`, con `parallel_tool_calls:false`. Su schema permite un
mensaje, un intent, hasta 19 actions, un control local y resoluciones del ledger.

Las allowlists y shapes exactos viven en
`shared/designerAiCapabilityContract.cjs`; el documento canónico humano es
`DESIGNER_AI_CAPABILITY_CONTRACT.md`.

### 6.2 Garantías implementadas

- El callable exige autenticación y `requireSuperAdmin` antes de leer el secret o
  procesar el payload.
- Backend valida versión, claves exactas, tamaños, datos prohibidos, actions,
  IDs disponibles, dependencias, controles y resoluciones.
- Una salida `clarify` que contiene actions o un control ya validados se
  normaliza a `apply`: preserva la parte ejecutable del turno y permite que el
  mensaje solicite el dato restante sin convertir una respuesta parcial válida
  en error de servidor.
- Una resolución `resolved_by_rule` cuya regla allowlisted no corresponde al
  `leafId` conocido se descarta antes de validar el resto de la salida. Esta
  recuperación es *fail closed*: la hoja sigue pendiente y solo preserva actions
  independientes que sí sean válidas; los demás defectos estructurales continúan
  rechazando el lote.
- Frontend compara revisión, valida nuevamente y ejecuta únicamente el lote
  aprobado.
- El executor pre-valida el lote completo antes de la primera mutación.
- Cada action delega en bridges, normalizadores y eventos de owners existentes.
- `event.set_location_text` usa el coordinador de ubicación manual, persiste los
  fields de la phase y limpia metadata Google previa; nunca fabrica metadata.
- La búsqueda Places conserva todos los resultados devueltos y solo obtiene
  details del resultado que selecciona el usuario. API key, sesión y respuestas
  completas permanecen en el navegador.
- El selector de ubicación reemplaza temporalmente el área de trabajo del chat,
  usa todo su alto disponible y conserva el historial en memoria. Se monta con
  phase y precarga derivadas del snapshot; no expone fecha, horario, Dress Code,
  RSVP ni Regalos. Su cierre explícito vuelve al historial y al composer.
- Firestore Rules exige ownership para persistir el draft y preserva `userId`.

### 6.3 Límites y gaps

- No existe autorización server-side por action ni ejecución server-side de
  tools; la mutación es client-side.
- El backend no verifica ownership, editabilidad, slug ni revisión real del draft
  porque no recibe/relee esa identidad.
- La atomicidad solo cubre prevalidación. Si un owner falla después de que otro se
  aplicó, no hay rollback transaccional; el error expone `appliedActions` al panel.
- `waitForAppliedSnapshot` abandona la espera después de 120 frames. Verifica
  nombre y ubicaciones manuales contra sus valores esperados, incluido que no
  quede selección Google; otras familias de actions todavía no se verifican
  individualmente y conservan el gap general de evidencia por efecto.
- `batchId` se deduplica en memoria dentro del panel. No existe idempotencia
  durable backend ni persistida entre remounts.
- El callable no habilita `enforceAppCheck` de forma explícita.
- `gallery_cell_upload` valida `galleryId`, `cellId` e índice. El panel los pasa
  al control simplificado; `MiniToolbarTabImagen` selecciona la Gallery, marca el
  slot exacto, lo desplaza a la vista y mueve el foco a su control. Ese target es
  solo el foco inicial: cambiar, agregar, eliminar o reordenar fotos actualiza el
  draft y el indicador transitorio de cambios, pero no completa la Gallery. El
  panel continúa únicamente cuando el usuario activa `Terminé con esta galería`,
  persiste la resolución de la hoja `guided_completion` exacta y confirma esa
  persistencia. Cerrar el control no reconcilia la hoja.
- `google_place_picker` valida la phase contra disponibilidad/mode. El panel
  precarga lugar + dirección, reemplaza visualmente historial y composer con el
  control a altura completa y permite cerrarlo para volver al chat sin
  reconciliar la hoja.
  La selección solo continúa cuando el owner releído coincide exactamente con el
  `placeId`, lugar y dirección elegidos y el snapshot de capabilities refleja
  esos textos y `placeSelected` en la misma phase. La reconciliación recibe ese
  snapshot posterior, resuelve solo la hoja del target y deriva otra vez el
  primer pendiente real; esa comparación es local.

## 7. Streaming, concurrencia, cancelación y obsolescencia

| Tema | Estado actual |
| --- | --- |
| Streaming de respuesta | No implementado. `responses.create` retorna completo y el callable responde al final. |
| Progreso | Solo loader local (`Pensando…`/live region). No hay eventos, tokens parciales ni job durable. |
| Concurrencia por panel | `sendingRef` impide un segundo envío mientras hay uno pendiente. |
| Cancelación de red | No implementada. No se conserva `AbortController` ni handle de cancelación del callable. |
| Cambio de sesión | Incrementa secuencia, limpia estado y descarta respuestas tardías. El request backend puede seguir consumiendo recursos. |
| Cambio de contenido | Antes de aplicar se compara `snapshot.revision`; un cambio produce fallback stale y cero mutación de ese lote. |
| Espera de reflejo | El panel relee hasta 120 frames y cancela esa espera local al cambiar sesión. |
| Duplicados | `appliedBatchIdsRef` evita repetir un batch durante el montaje actual. |

Una respuesta descartada por sesión/revisión no debe mostrarse ni ejecutarse. Esa
protección es local; no cancela el procesamiento server-side ni impide costo
upstream.

## 8. Sesiones, identidad, orden y persistencia

### 8.1 Sesión e historial

- `DashboardSidebar` pasa como `sessionKey` el draft key/slug disponible.
- No existe `conversationId` durable ni una colección de conversaciones/mensajes.
- `DashboardSidebar` conserva en estado React como máximo los treinta mensajes
  visibles más recientes del borrador actual.
- IDs de mensaje se generan en cliente con rol, timestamp y sufijo aleatorio.
- El backend valida `clientMessageId`, pero no lo usa como clave idempotente.
- Desmontar solo el panel al alternar tabs no pierde esos mensajes ni inicia otra
  conversación al volver. Cambiar o cerrar el borrador remonta el sidebar y
  descarta el historial.
- No se usa `previous_response_id`; cada request reconstruye contexto con un
  máximo de los seis turnos visibles más recientes, aunque la UI retenga treinta.

### 8.2 Persistencia

El chat no se persiste. Sí se persiste `designerAiConversation` dentro de
`borradores/{slug}` a través de `DashboardHeader` y
`editorSessionPersistence`. Ese campo contiene ledger versionado, baseline,
fingerprints/procedencia, resoluciones y política automática/explícita del
nombre, además de `usage.hasStarted`. No debe contener mensajes ni duplicar
valores funcionales. En ledger v3, la finalización explícita de cada Gallery se
guarda como una resolución de `media.gallery.{galleryId}.guided_completion`; no
se agrega un flag al objeto Gallery ni al draft fuera de
`designerAiConversation`. Los drafts legacy sin esa resolución conservan sus
fotos, pero vuelven a presentar esa Gallery como pendiente: no se reconstruye la
decisión con fingerprints.

`activeControl` es la única señal transitoria de Gallery en edición. El indicador
“hubo cambios” se deriva localmente comparando slots/orden contra el snapshot con
el que se abrió el control y no sobrevive a un remount porque no gobierna
completitud. El cierre del control lo descarta sin alterar la resolución durable.

La marca inicial usa callbacks del bridge y el panel espera confirmación del patch
antes de enviar el auto-start; un error impide iniciar y muestra fallback seguro.
Las reconciliaciones generales posteriores continúan fire-and-forget: sus
errores se registran en consola y el borrador releído sigue siendo autoridad. La
finalización de una Gallery es la excepción: el panel espera el callback durable
del bridge antes de cerrar el control y continuar. Si falla, restaura el ledger
local previo, mantiene la Gallery pendiente y permite reintentar; las mutaciones
de fotos ya guardadas no se revierten.

### 8.3 Evidencia de primer ingreso, reingreso y nombre registrado

`designerAiConversation.usage.hasStarted` es la señal durable y única:

- ausencia o `false` produce `first_entry`;
- el panel prepara el snapshot de ingreso, persiste `true` mediante el bridge
  existente y envía `entryMode:first_entry`;
- un remount, cambio de tab, refresh o sesión posterior relee `true` y envía
  `entryMode:reentry`;
- `autoStartedSessionRef` sigue evitando duplicados solo dentro del montaje, pero
  no participa de la clasificación durable;
- baseline, resolutions, mensajes, placeholders o contenido completo nunca se
  usan como heurística.

Compatibilidad legacy: un draft sin `usage` normaliza `hasStarted:false`; la
próxima apertura es su primer ingreso determinista y desde ese momento queda
marcado. No hay backfill ni reconstrucción histórica.

El callable relee `usuarios/{uid}` después de autorizar, usa
`extractProfileFromDocData` y pasa solo `profile.nombre` al service como
`registeredFirstName`. Si el documento/campo no existe o la lectura falla, usa
`null`/string vacío y el saludo no inventa nombre. El panel no recibe ni persiste
perfil, email, apellido o `nombreCompleto`.

### 8.4 Retención

No se verificó una política específica de retención o borrado para
`designerAiConversation`; hoy sigue el ciclo de vida del documento draft. El
chat solo se retiene en memoria dentro del `DashboardSidebar` asociado al
borrador actual y se descarta al cambiar o cerrar ese borrador. La request a
OpenAI configura `store:false`, pero el repositorio no documenta una política
adicional del proveedor aplicable a estas requests.

## 9. Secretos, logs y privacidad

- Solo Functions importa `openai` y lee `defineSecret("OPENAI_API_KEY")`.
- El navegador no recibe el SDK server-side ni la clave.
- Requests a OpenAI usan `store:false` y no usan `previous_response_id`.
- Logs de éxito incluyen UID, trace ID, batch ID, latencia, intent, cantidad de
  actions, presencia de control, cantidad de reparaciones semánticas y request ID
  de OpenAI.
- Logs de error incluyen UID, trace ID, latencia, clase segura de error y request
  ID.
- El código actual no registra prompt, mensajes, snapshot, valores funcionales,
  URLs privadas ni secret en esos eventos.

Gap: no existe un helper central de redacción para futuros logs del subsistema;
la seguridad depende de conservar el allowlist de campos de logging actual.
Tampoco existe redacción de PII/secrets en el texto libre antes de enviarlo al
proveedor; este límite debe considerarse al definir la política de privacidad.

## 10. Fallbacks, reintentos y rate limits

### 10.1 Implementado

- El cliente OpenAI usa timeout de 25 segundos y `maxRetries:1`.
- Una salida estructurada que falla validación dispone de un único intento de
  reparación semántica con el motivo acotado del validador. La segunda salida
  vuelve a atravesar todas las validaciones; no se aplican resultados parciales.
- El callable tiene timeout de 45 segundos.
- Timeout, upstream rate limit, secret ausente, payload inválido y fallo genérico
  se mapean a errores Firebase seguros.
- El callable adjunta a cada error una categoría segura, indicación de
  reintentabilidad y `referenceId`; el panel muestra una causa resumida y esa
  referencia. Los logs usan el mismo ID y conservan el motivo controlado del
  validador, sin registrar payloads, prompts, secretos ni respuestas crudas del
  proveedor.
- El panel traduce códigos conocidos a mensajes sin detalle interno sensible.
- Si falla la generación de copy posterior a una decisión o control ya
  verificados, el panel conserva el cambio, lo diferencia del fallo
  conversacional y ofrece `Continuar recorrido` desde un snapshot nuevo.
- No se aplican actions si la respuesta conserva un defecto inválido después de
  la recuperación limitada por hoja o si falla antes de ejecución.

### 10.2 No implementado

- No hay fallback de modelo/proveedor.
- No hay retry automático de proveedor fuera del retry del SDK y de la única
  reparación semántica; la recuperación adicional requiere la acción explícita
  `Continuar recorrido`.
- No hay backoff, circuit breaker ni cola durable.
- No hay rate limit propio por UID, draft, IP o ventana temporal; solo se mapea el
  429 del proveedor.
- No hay presupuesto/cuota del producto ni telemetría de tokens/costo visible en
  este subsistema.

## 11. Conocimiento funcional y carga por dominio

Designer AI no es autoridad sobre cómo funciona Reserva el Día. El snapshot usa
adaptadores de dominio y el contrato de capabilities solo declara qué porción es
accesible. La lectura documental para cambios debe seguir esta tabla:

| Dominio consultado o modificado | Autoridad documental | Owners de código usados hoy |
| --- | --- | --- |
| Borrador y metadata | [DATA_MODEL.md](DATA_MODEL.md) | normalizadores/bridges de editor y `DashboardHeader`. |
| Detalles del evento, Ceremony/Party, Dress Code y campos dinámicos | [DATA_MODEL.md](DATA_MODEL.md) | `src/domain/eventDetails/`, `src/domain/templates/storyText.js` y authoring bridges. |
| Mapas y selección de lugar | [DATA_MODEL.md](DATA_MODEL.md) y [RENDER_COMPATIBILITY_MATRIX.md](../contracts/RENDER_COMPATIBILITY_MATRIX.md) | `googlePlaces.js`, `locationAuthoring.js`, control especializado compartido por `MiniToolbarTabDetallesEvento` y Diseñador AI; el modelo no recibe metadata de Places. |
| Textos vinculados | [DATA_MODEL.md](DATA_MODEL.md) y [EDITOR_SYSTEM.md](EDITOR_SYSTEM.md) | authoring defaults/`applyTargets`; Designer AI solo accede a bindings explícitos como historia/event details. |
| Editor, bridges y persistencia | [EDITOR_SYSTEM.md](EDITOR_SYSTEM.md) | `CanvasEditor`, `editorSnapshotAdapter`, `editorSessionPersistence`. |
| Interacción/geometría del canvas | [INTERACTION_CONTRACT.md](INTERACTION_CONTRACT.md) | Fuera de alcance de actions V1. |
| Galerías | [GALLERY_SYSTEM_CONTRACT.md](../contracts/GALLERY_SYSTEM_CONTRACT.md) y contratos enfocados | `galleryMutations`, `sidebarModel`, Gallery runtime. |
| Portada e imágenes por rol | [IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md](../contracts/IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md) | cover bridge y `MiniToolbarTabImagen`. |
| Secciones, imágenes decorativas y configuración visual | [DATA_MODEL.md](DATA_MODEL.md), [IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md](../contracts/IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md) y autoridades de diseño/CSS del índice | Fuera de alcance de actions V1 salvo efectos acotados documentados de CTAs/mapa. |
| RSVP | [DATA_MODEL.md](DATA_MODEL.md) y [PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md](../contracts/PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md) | `src/domain/rsvp/` y functional CTA helpers. |
| Regalos | [GIFTS_SYSTEM_CONTRACT.md](../contracts/GIFTS_SYSTEM_CONTRACT.md) como entry point; [DATA_MODEL.md](DATA_MODEL.md) para shape y [PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md](../contracts/PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md) para CTA/modal | `src/domain/gifts/`, `MiniToolbarTabRegalos.jsx` y functional CTA helpers. |
| Countdown vinculado y paridad render | [DATA_MODEL.md](DATA_MODEL.md) y [RENDER_COMPATIBILITY_MATRIX.md](../contracts/RENDER_COMPATIBILITY_MATRIX.md) | `countdownEventDetails`; solo cambia target al cambiar fecha. |
| Preview/publicación | [PREVIEW_SYSTEM_ANALYSIS.md](PREVIEW_SYSTEM_ANALYSIS.md) y contratos de render/publicación | No son actions directas de Designer AI V1. |
| Guided Tour del Asistente | [GUIDED_TOUR_SYSTEM.md](GUIDED_TOUR_SYSTEM.md) | Sistema independiente; Designer AI debe mantenerlo desmontado. |

Cuando no existe documento enfocado para una regla de un dominio, el código
vigente es fuente de verdad según `DOCUMENTATION_INDEX.md`; la solución no es
copiar una interpretación dentro de los docs del asistente.

## 12. Garantías, inferencias y gaps

Clasificación usada aquí:

- **Implementado**: existe una barrera verificable en código/tests.
- **Solo documentado**: este cambio establece la regla objetivo, pero el runtime
  todavía no la garantiza completamente.
- **Inferido**: se deduce del flujo actual, sin política/contrato explícito.
- **Gap/Parcial**: falta la barrera o solo cubre parte del riesgo.

| Área | Clasificación | Evidencia o gap |
| --- | --- | --- |
| Secret aislado en Functions | Implementado | `defineSecret`, SDK solo backend. |
| Autorización del callable | Implementado | `requireSuperAdmin`. |
| Autorización server-side de cada tool | No implementado | Tools se ejecutan en cliente; backend solo valida propuesta. |
| Validación estructural backend/frontend | Implementado | Contrato compartido y validadores. |
| Desfase de versión frontend/backend | Implementado y testeado | Antes de validar el payload, cualquier `contractVersion` no vacía distinta de la vigente recibe una respuesta segura que conserva la versión del cliente y solicita recarga; no llega a OpenAI ni se presenta como mensaje inválido. |
| Validación contra draft server-side | No implementado | Snapshot proviene del cliente; no hay reread backend. |
| Contexto mínimo sin media/geometría | Implementado y testeado | Sanitizer + payload builder + service tests. |
| Minimización por necesidad del turno | Parcial | El shape es acotado, pero se envían todos los valores allowlisted del snapshot. |
| Redacción de texto libre antes de OpenAI | No implementado | Mensaje y turnos recientes se envían después de límites de longitud, sin DLP. |
| Separación de contenido no confiable | Parcial | Roles y validación existen; estado de cliente se usa como developer context después de sanear. |
| Evidencia antes de confirmar | Parcial | Ubicación manual y selección Places se verifican contra valores esperados; portada usa fingerprint; Gallery usa finalización explícita persistida y no el fingerprint de sus cambios. Otras actions aún no tienen verificación individual por efecto. |
| Nunca afirmar ejecución sin evidencia completa | Solo documentado | Regla normativa en el contrato conversacional; el reread actual no verifica individualmente todos los efectos. |
| Chat persistido | No implementado deliberadamente | Hasta treinta mensajes en memoria React por borrador; solo los seis turnos más recientes forman el contexto de cada request. |
| Metadata de ledger persistida | Implementado | `designerAiConversation` en draft. |
| Primer ingreso vs reingreso | Implementado | `designerAiConversation.usage.hasStarted`, `prepareDesignerAiConversationEntry` y persistencia confirmada antes del auto-start. |
| Nombre registrado en el saludo | Implementado con fallback | El callable relee solo `usuarios/{uid}.nombre`; ausencia/error produce string vacío. La calidad del saludo no tiene eval real. |
| Español permanente, tono aprobado y voseo consistente | Parcial | El prompt actual pide español rioplatense y voz compatible; no hay eval durable ni paridad completa con el contrato. |
| Orden guiado `Nombres -> estructura -> evento -> Regalos -> Dress Code -> portada -> Galleries` | Implementado y testeado | `GUIDED_FLOW_BLOCKS`, `ledger.guidedFlow` y brief derivado en el ledger compartido. |
| RSVP fuera del interrogatorio principal | Implementado y testeado | No integra `guidedFlow`; la allowlist/action RSVP continúa disponible para pedidos explícitos. |
| Aprovechar varios datos adelantados | Parcial | El schema acepta lotes de hasta 19 actions y el prompt pide agrupar, pero no hay evaluación real de cumplimiento conversacional. |
| Ubicación chat-first manual/Places | Implementado y testeado | Datos manuales se aplican por el owner, la decisión Maps es explícita, el control especializado reutiliza Places y la selección se verifica localmente antes de continuar. |
| Regalos con valor/visibilidad independientes y lista externa | Implementado en dominio/capability | Root normalizada, flags por método, URL externa, actions y validación de readiness existentes. |
| Recorrido guiado interno de Regalos | Gap de runtime documentado | El owner funcional exige elegir lista externa o datos bancarios, ocultar defaults no confirmados y excluir intro/botón de la completitud. El ledger vigente todavía agrega todos los métodos, `gifts.intro_text` y `gifts.button_text` al `guidedFlow`; la corrección futura debe reutilizar las actions existentes y `GIFTS_SYSTEM_CONTRACT.md`, sin crear otro estado de modalidad. |
| Portada y múltiples Galleries por disponibilidad real | Implementado en orquestación/control | Portada conserva evidencia por fingerprint. Cada Gallery con slots aporta una hoja durable, respeta el orden del snapshot y avanza solo por finalización explícita; cambios y cierre del control no completan. |
| Cierre del recorrido + edición manual + `Vista previa` | Implementado | Depende de `guidedFlow.completion.complete` y usa cierre acotado en el panel. |
| Retención de `designerAiConversation` | Inferido | Sigue al draft por ubicación del campo, sin política aprobada propia. |
| Política de retención | Gap documental/producto | No hay plazo, borrado selectivo ni obligación aprobada. |
| Streaming/cancelación real | No implementado | Respuesta completa y descarte local. |
| Prevención de respuesta obsoleta | Implementado en cliente | Session sequence + revision check. |
| Idempotencia durable | No implementado | Sets en memoria por montaje. |
| Reintentos | Parcial | Un retry del SDK, una reparación semántica de salida y recuperación explícita de la continuación verificada; sin fallback de modelo ni backoff propio. |
| Rate limit propio | No implementado | Solo traducción de 429 upstream. |
| Redacción de logs | Implementada por allowlist actual | Sin helper/policy automatizada para cambios futuros. |
| Evaluación conversacional real | No implementada | Tests usan fixtures/mock y assertions de source. |
| Owner único de instrucciones/copy runtime | Parcial | Prompt principal en service; seeds, cierre y fallbacks también viven en el panel. |

## 13. Cambio seguro y mantenimiento

Un cambio del subsistema debe:

1. empezar por `DOCUMENTATION_INDEX.md` y los owners del dominio afectado;
2. mantener una sola allowlist en el contrato compartido fuente;
3. no agregar setters genéricos, prompt paralelo ni estado alternativo;
4. actualizar conversación solo en su contrato y owner de instrucciones;
5. actualizar capacidad solo en capability contract, schema, snapshot, executor y
   tests coordinados;
6. demostrar auth, validación positiva/negativa/ambigua/error, stale response,
   persistencia y aislamiento de Guided Tour en proporción al cambio;
7. actualizar este mapa cuando cambie cualquier owner, trust boundary, política
   de persistencia o garantía de seguridad.

## 14. Anclas de tests actuales

- `shared/designerAiCapabilityContract.test.mjs`
- `shared/designerAiConversationLedger.test.mjs`
- `src/domain/editor/designerAiAccess.test.mjs`
- `src/domain/editor/designerAiCapabilities.test.mjs`
- `src/domain/editor/designerAiActionExecutor.test.mjs`
- `src/domain/editor/designerAiNamePolicyIntegration.test.mjs`
- `src/domain/editor/designerAiLocationInteraction.test.mjs`
- `src/domain/eventDetails/googlePlaces.test.mjs`
- `src/domain/eventDetails/locationAuthoring.test.mjs`
- `src/lib/dashboardDocumentNameBridge.test.mjs`
- `src/components/editor/designerAi/DesignerAiPanel.test.mjs`
- `src/components/editor/designerAi/DesignerAiLocationControl.test.mjs`
- `src/components/MiniToolbarTabImagen.mobileDrag.test.mjs`
- `functions/designerAiService.test.mjs`
- `functions/designerAiAuthorization.test.mjs`

Estas pruebas cubren contratos ejecutables, no calidad conversacional de una
respuesta real del modelo. Los criterios para crear una evaluación durable
independiente viven en `AI_ASSISTANT_CONVERSATION_CONTRACT.md`.
