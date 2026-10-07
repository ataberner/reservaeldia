# AI Assistant System

Status: Canonical Architecture Reference.

Mapa actualizado contra implementación local el 2026-10-06. Evidencia de esta
auditoría, mediciones sintéticas y límites en la sección 15; no acredita despliegue.

Hardening P0 revalidado localmente el 2026-09-27. Evidencia y límites:
[DESIGNER_AI_P0_HARDENING.md](../testing/DESIGNER_AI_P0_HARDENING.md).

Etapa V1 local, 2026-09-28: [verificación y límites del cierre](../testing/DESIGNER_AI_V1_CLOSURE.md).

## 1. Propósito y autoridad

Este documento es el mapa técnico canónico de `Diseñador AI`, cuyo tab se muestra
como `Tu asistente`, con el mismo ícono `Sparkles` del tab `Asistente`
(identificador interno `designer-ai`). Define
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
| Gate de acceso frontend | `src/domain/editor/designerAiAccess.js` | Exige UID autenticado, draft writable y no selector; disponible para todos los roles, sin depender de la consulta administrativa. |
| Acceso al Asistente manual y su tour | `src/domain/editor/assistantAccess.js` | Exige `canManageSite` resuelto (admin o superadmin); Sidebar y Header lo consumen para botones, autoapertura, montaje y restauración del tour. |
| Entrada de tab, panel responsive, exclusión del Asistente e historial efímero por borrador | `src/components/DashboardSidebar.jsx` | Monta/desmonta `DesignerAiPanel`; abrirlo desactiva Assistant. Su estado React sobrevive al cambio de tab y se descarta con el `sidebarInstanceKey` al salir o cambiar de borrador. |
| UI, envío, loader, controles locales, stale guards y mensajes seguros | `src/components/editor/designerAi/DesignerAiPanel.jsx` | Consume y actualiza el historial del sidebar; no existe un reducer/store de conversación independiente. |
| Control especializado de ubicación | `src/components/editor/designerAi/DesignerAiLocationControl.jsx` | Superficie mínima de búsqueda/selección/cierre; ocupa el área de trabajo del chat mientras está activa y no monta el formulario completo de Detalles del evento. |
| Decisión y targeting conversacional de ubicación | `src/domain/editor/designerAiLocationInteraction.js` | Deriva phase, precarga y decisión Maps desde resultado + snapshot; no persiste un segundo modelo. |
| Proveedor Google Places | `src/domain/eventDetails/googlePlaces.js` | Loader, sesión de autocomplete, sugerencias y details compartidos por el tab manual y Diseñador AI. |
| Mutación canónica de ubicación | `src/domain/eventDetails/locationAuthoring.js` + `updateTemplateAuthoringEventLocation` | Coordina fields/defaults y el objeto `mapa-google`; diferencia escritura manual de selección Google. |
| Callable backend | `designerAiChat` inline en `functions/src/index.ts` | Autoriza y valida antes de I/O; relee el nombre mínimo solo al ingresar. La apertura automática retorna un saludo sin OpenAI; las demás intervenciones cargan secret e invocan el service. |
| Cliente OpenAI, instrucciones, input, validación de salida y errores upstream | `functions/src/designerAi/service.ts` | Usa Responses API sin streaming. |
| Saludo de apertura y pregunta guiada | `buildDesignerAiOpeningResponse` en el service + `src/domain/editor/designerAiGuidedConversation.js` | El backend personaliza el saludo; el frontend compone la pregunta desde el ledger vigente. El seed compartido vive en el capability contract. |
| Medición local de turnos | `src/domain/editor/designerAiTiming.js` | Evento local con duraciones, resultado y UUID de batch; sin mensajes ni snapshot. El service mide etapas internas y el callable las registra con su latencia total. |
| Tool schema, versión, allowlists y validación estructural/contextual | `shared/designerAiCapabilityContract.cjs` | Source checked-in; `functions/scripts/syncTemplateContract.cjs` genera copias para Functions. |
| Ledger, procedencia, completitud global/guiada, dependencias y priorización | `shared/designerAiConversationLedger.cjs` | `GUIDED_FLOW_BLOCKS` es la única prioridad ejecutable; también se copia mecánicamente a Functions. |
| Construcción de snapshot/contexto frontend | `src/domain/editor/designerAiCapabilities.js` | Reutiliza snapshot/bridges y normalizadores de los dominios reales. |
| Normalización de fecha numérica | `shared/authoringValueNormalization.cjs`, consumido por `eventDetails/date.js` y el service | Parser/calendario existente compartido. Solo para un mensaje íntegramente numérico, el backend agrega ISO/validez al contexto; no crea estado, acciones ni evidencia de guardado. |
| Ejecución de actions | `src/domain/editor/designerAiActionExecutor.js` | Corre en el navegador y delega en owners existentes; no hay tool executor backend. |
| Nombre de documento y metadata conversacional | `src/lib/dashboardDocumentNameBridge.js` + `src/components/DashboardHeader.jsx` | El header persiste `designerAiConversation`, incluida `usage.hasStarted`, mediante la autoridad de sesión. |
| Nombre registrado mínimo | `usuarios/{uid}.nombre`, leído por `designerAiChat` con `extractProfileFromDocData` | Solo el nombre normalizado llega al service; no se envía el perfil completo. |
| Persistencia del borrador | `src/components/editor/persistence/editorSessionPersistence.js` | Draft: Firestore bajo el usuario; templates no están habilitados para Designer AI. |
| Autorización backend | `functions/src/auth/adminAuth.ts` | `requireAuth` exige `request.auth.uid`; Designer AI no requiere claims administrativos ni `SUPERADMINS_UIDS`. |
| Autorización de escritura de drafts | `firestore.rules` | El cliente solo actualiza `borradores/{id}` si es owner y no cambia `userId`. |
| Tests | `shared/designerAi*.test.mjs`, `src/domain/editor/designerAi*.test.mjs`, `src/components/editor/designerAi/DesignerAiPanel.test.mjs`, `functions/designerAi*.test.mjs` | Cobertura estructural/dominio; no evalúan calidad del modelo real. |

## 3. Flujo actual de una intervención

```text
DashboardSidebar
  -> monta DesignerAiPanel para un draft writable autorizado
  -> Panel espera hidratación de metadata y authoring
  -> deriva first_entry/reentry y persiste usage.hasStarted
  -> relee snapshot mínimo + ledger global/guided después de esa persistencia
  -> callable designerAiChat valida auth y payload
  -> apertura automática: saludo estructurado sin modelo ni propuesta de cambios
     otros mensajes: service arma instrucciones + contexto + últimos turnos
       -> OpenAI devuelve una única function_call submit_designer_ai_result
       -> backend valida salida y devuelve propuesta estructurada
  -> Panel descarta sesión/revisión obsoleta y revalida el lote
  -> designerAiActionExecutor delega en owners existentes del editor
  -> Panel relee el borrador, reconcilia ledger y persiste metadata
  -> recién entonces muestra confirmación o fallback seguro
```

La function call de OpenAI es un sobre de salida estructurada; no ejecuta por sí
misma una tool de negocio. Las actions reales se ejecutan después en el cliente.
El panel también elimina actions, resolutions y controles de una apertura
automática recibida de un backend anterior: ingresar no autoriza una mutación.

En mobile, un draft editable con acceso al asistente abre `Tu asistente` al
ingresar. `designerAiInitialOpeningRef` consume esa decisión una vez por draft,
también en desktop, donde no abre automáticamente el panel de IA. Cambiar tabs,
cerrar manualmente, refrescar permisos o redimensionar no repite la apertura.
La carga tardía del acceso puede completar la apertura inicial móvil; el tour
manual no la reemplaza. Un nuevo montaje por recarga vuelve a ser un ingreso;
no hay una preferencia durable nueva de panel cerrado.

El placeholder tiene una sola definición runtime, en el textarea del panel:
`Contame que tenes en mente...`. Se puede componer el siguiente mensaje mientras
hay una operación en curso; el submit conserva la exclusión por `sendingRef` y
la barrera de hidratación. Reintentar o procesar un turno oculto no vacía ese texto.

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

`SYSTEM_INSTRUCTIONS` vive inline en `functions/src/designerAi/service.ts`. Para
mensajes que requieren interpretación, el service agrega un segundo mensaje
`developer` con snapshot mínimo y prioridad del
ledger, luego hasta seis turnos recientes y finalmente el mensaje del usuario.
La configuración observada es modelo `gpt-5.6-luna`, reasoning effort `none`,
text verbosity `low`, `max_output_tokens:4000`, `store:false`, una tool forzada y
sin parallel tool calls ni `previous_response_id`.

La apertura automática se reconoce por la combinación de `entryMode:first_entry`
o `reentry` y el seed exacto `DESIGNER_AI_AUTO_START_MESSAGE`, compartido por cliente
y backend. No depende de inferir intención con el modelo. `buildDesignerAiOpeningResponse`
retorna `clarify`, arrays vacíos y control nulo; incluye `entryGreeting` opcional,
producido solo por el servidor, igual al saludo de `assistantMessage`. El modelo
no puede agregar ese campo. La UI toma ese saludo y deriva la pregunta del primer
pendiente actual; si habla con un backend anterior sin `entryGreeting`, usa un
saludo local seguro sin conservar preguntas potencialmente contradictorias.
En edición invita a pedir ajustes sin reabrir el recorrido. Un mensaje humano
con `entryMode:first_entry` que no coincide con el seed sigue pasando por el modelo.

En turnos guiados la salida agrega dos campos opcionales para compatibilidad:
`clarification:{leafId,kind}|null` (`missing_year`, `invalid_date`, `missing_value`)
y `notice:"unsupported_request"|null`. El schema del proveedor los requiere
nullable; el parser acepta la ausencia de versiones anteriores. No cambia la
versión de actions, payloads ni metadata persistida. El backend valida shape,
disponibilidad, tipo de hoja y resolución `needs_clarification` correspondiente.
El frontend valida el target contra `brief.nextStep` del snapshot real después
de persistir; una aclaración desactualizada usa la pregunta local sin otra
llamada al modelo. No se proyectan receipts de éxito para elegir preguntas.

El compositor guiado usa confirmaciones locales de receipts, avisos acotados y
la pregunta de `nextStep`; no incorpora `assistantMessage` libre ni intenta
separar preguntas por puntuación. En edición mantiene la respuesta libre. El
texto de los controles también es local. Así un resultado de backend anterior
sin esos campos sigue siendo utilizable sin cederle el orden de preguntas.

La documentación no se carga dinámicamente ni compila el prompt. Por lo tanto:

- el contrato conversacional es autoridad de producto para futuros cambios;
- el capability contract y el schema compartido son autoridad para acciones;
- `SYSTEM_INSTRUCTIONS` es el owner ejecutable de interpretación, pero el cliente
  consume el seed compartido y aporta el cierre verificado y fallbacks visibles en
  `DesignerAiPanel.jsx`;
- el orden no se repite en esos textos: el service consume `nextBlock` y `nextStep` derivados
  de `ledger.guidedFlow`;
- no existe hoy un test de paridad documento -> instrucciones ni módulos de
  prompt separados por responsabilidad.

Las decisiones estructurales de esta revisión están reflejadas así:

- el panel deriva `entryMode` de la señal durable antes de marcarla como iniciada;
- el callable incorpora únicamente el nombre registrado mínimo;
- el brief y el cierre usan `ledger.guidedFlow`, no la completitud global;
- RSVP aporta la decisión `rsvp.enabled` a `nextBlock`, después de Dress Code y
  antes de Regalos; su personalización interna continúa reactiva;
- los textos de ubicación se aplican como datos manuales y la decisión de abrir
  Places se representa aparte; el prompt no selecciona resultados ni recibe su
  metadata;
- `buildDesignerAiCompletionMessage` se agrega una sola vez ante la transición verificada a
  completo. Conserva la respuesta del turno y ofrece preview, edición manual y
  continuidad por AI. El modelo no redacta un cierre recurrente.

Desde la corrección conversacional del 2026-09-30, `deferred_by_user` se persiste
en las resoluciones existentes con fingerprint (ledger 4, protocolo 2.4.0).
Conserva un pendiente no terminal, pero deja de bloquear el recorrido. El brief
expone postergados y bloqueantes por separado; su prioridad sigue perteneciendo
al ledger compartido. Después del reread y guardado, `designerAiGuidedConversation`
compone las preguntas de transición y recupera una continuación ausente. Respeta
la aclaración mínima dentro del bloque (por ejemplo, el año faltante), controles
locales y modo edición. No agrega llamadas al modelo, memoria ni otra preview.
El cierre enumera los pendientes postergados; `guidedFlowCompleted` conserva sus
garantías de persistencia y monotonía.

Las elecciones de Regalos sin datos también usan esas resoluciones, mediante
`gifts.bank_details` y `gifts.external_list`; no agregan configuración funcional.
El ledger conserva la elección persistida, deriva las preguntas específicas y
la satisface sólo con datos visibles confirmados. El panel pasa al reconciliador
el snapshot previo al lote (también al reintentar) para renovar su fingerprint
únicamente tras receipts Gifts verificados, sin revivir una elección invalidada
por ediciones manuales. Validación y semántica pertenecen a la sección 4.4 del
capability contract. El renderer sólo aporta el texto de la pregunta.
Una solicitud vigente puede postergarse mediante `deferred_by_user` en su propia
hoja, conservando la elección y los datos. Mientras esas hojas representan el
pendiente, el recorrido no duplica el bloqueo con `gifts.enabled`; su estado
real y la validación funcional de Regalos permanecen en el ledger y el dominio.
Elegir una vía y postergarla en el mismo turno también requiere la activación
verificada antes de guardar esa nueva elección.

Desde el 2026-10-02, `event.{phase}.end_time` pertenece a
`outside_guided_flow`: conserva evidencia en el ledger global y edición mediante
`event.set_datetime`, pero no entra en `guidedFlow`, `nextBlock` ni sus pendientes
de cierre. El adaptador de preguntas no solicita hora de fin y las instrucciones
del backend restringen su uso a pedidos explícitos del usuario.

La reconciliación conserva `resolved_from_user` de un receipt efectivo y
persistido frente a una aclaración redundante del modelo en el mismo lote.
Regalos puede reutilizar `gifts.enabled:true` con `keep_existing` ante una
aclaración antigua, solo con procedencia de usuario y un medio visible completo
confirmado; no agrega estado ni atribuye evidencia a templates. El adaptador de
preguntas conserva solicitudes imperativas de datos dentro del bloque y deriva
el fallback de los medios elegidos aún incompletos.

El prompt pide español permanente, voseo y la personalidad aprobada. Todavía no
existe una evaluación durable que mida consistencia o calidad de esas respuestas;
esto no reabre el orden funcional ya ejecutable.

Portada también ofrece el cambio de la imagen actual antes de abrir el uploader.
La decisión de presentación vive en el `journeyRef` de la sesión, como Galería;
la postergación y la evidencia permanecen en el ledger existente. Tras un control
verificado, el service descarta resoluciones redundantes del modelo y normaliza
un `apply` que quedó vacío por ese filtro a `clarify`. Un `apply` originalmente
vacío o con otras resoluciones inválidas sigue rechazándose. No hay nueva action,
memoria durable ni relajación de la evidencia de persistencia.

Tras guardar y releer una portada con `resolved_by_control`, la continuación se
compone localmente desde `nextBlock`, sin otra llamada al modelo para proponer
cambios vacíos. `buildDesignerAiLocalContinuation` reutiliza las preguntas del
adaptador; registra la oferta de Galería en el handshake existente o retoma su
control si ya había consentimiento. El request local pasa el validador existente.
En edición solo confirma el cambio. `Continuar recorrido` también relee el ledger
y continúa localmente, sin repetir la llamada fallida ni crear resoluciones.

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
- hasta seis turnos anteriores, de hasta 700 caracteres cada uno; el actual se
  envía solo como `message` (máximo 1200), también al reintentar;
- snapshot saneado con availability, valores funcionales acotados, ledger
  global/guiado, `usage.hasStarted` y política de nombre;
- contexto server-side de ingreso con un único campo `registeredFirstName`,
  obtenido de `usuarios/{uid}.nombre` y normalizado a string vacío cuando no
  existe. Una continuación no relee el perfil.

Antes del callable el frontend elimina revisiones de media y fingerprints. El
backend vuelve a sanear, limita el snapshot a 160 KB y elimina del contexto del
modelo valores con procedencia `template_value` o `placeholder_or_sample`.
Los nombres sin confirmación positiva también se redactan, incluyendo legacy
`unknown`; texto presente no equivale a identidad confirmada. Panel y bridge
esperan `templateAuthoring.hydrated` antes de consumir la primera entrada. El
ledger conserva `names` como primer bloque pendiente; reentrada y reload no
convierten valores de plantilla en datos de usuario.
La procedencia sigue perteneciendo al ledger existente, no a un booleano paralelo:
`template_value`/`placeholder_or_sample` indican ejemplos; `unknown` representa
datos sin evidencia suficiente; `existing_user_data`/`user_current_session`
requieren evidencia de usuario. La confirmación es específica al fingerprint:
un receipt o una baseline confirmada no acreditan un valor posterior diferente.
El snapshot usa `getTemplateAuthoringSnapshot().templateInput.changedKeys` del
owner vivo cuando existe;
la metadata del header es un fallback de hidratación. Restaurar un default de
plantilla no se convierte en confirmación por diferir de la baseline de entrada.
Las claves de authoring presentes delimitan esa comparación, conservando los
dominios sin binding y el alias legacy de Dress Code. La definición normativa y
los casos de procedencia permanecen en el capability contract.
La lista externa de regalos expone presencia/configuración, no su URL.
Los valores bancarios ocultos o de Regalos desactivado se eliminan tanto del
payload del cliente como del input del proveedor en el backend. Se conserva
`configured`; los fingerprints y la revisión se calculan localmente antes de
esa proyección. Cambiar una URL de lista también cambia su fingerprint local.
Los valores bancarios ocultos conocidos también se redactan en turnos históricos
antes de enviar el contexto; el mensaje actual conserva los datos que el usuario
aporta expresamente. Esto no implementa detección general de datos sensibles.

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
estructura y coherencia interna de datos aportados por un cliente autenticado, no
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

- El callable exige autenticación mediante `requireAuth` antes de leer el secret o
  procesar el payload.
- Backend valida versión, claves exactas, tamaños, datos prohibidos, actions,
  IDs disponibles, dependencias, controles y resoluciones.
- Una salida `clarify` que contiene actions o un control ya validados se
  normaliza a `apply`: preserva la parte ejecutable del turno y permite que el
  mensaje solicite el dato restante sin convertir una respuesta parcial válida
  en error de servidor.
- `discardInactiveDesignerAiPhaseResolutions` proyecta el lote completo y usa
  la dependencia de fase del ledger. Solo descarta resoluciones conocidas de
  Party cuyo único problema sea su no aplicabilidad en un `single` confirmado.
  Conserva errores de valor/procedencia, reglas incompatibles y cualquier otro
  defecto para repair/rechazo. Un default no confirmado no habilita el descarte.
  Si únicamente había resoluciones redundantes, convierte `apply` a `clarify` sin
  inventar actions ni modificar el mensaje. La normalización no consume repair.
  Ver límites exactos en la sección 8.1 del capability contract; reemplaza la
  recuperación anterior que descartaba reglas asociadas a una hoja incorrecta.
- Frontend compara revisión, valida nuevamente y ejecuta únicamente el lote
  aprobado.
- El executor pre-valida el lote completo antes de la primera mutación.
- Cada action delega en bridges, normalizadores y eventos de owners existentes.
- `event.set_location_text` usa el coordinador de ubicación manual, persiste los
  fields de la phase y limpia metadata Google previa; nunca fabrica metadata.
- La búsqueda Places conserva todos los resultados devueltos y solo obtiene
  details del resultado que selecciona el usuario. API key, sesión y respuestas
  completas permanecen en el navegador.
- `getDesignerAiGooglePlaceVerifiedLeafIds` extiende la evidencia local de la
  selección a nombre/dirección no vacíos aportados por Google, tras comparar
  owner y snapshot de la phase. El panel persiste esas resoluciones, incluidas
  confirmaciones de textos iguales al template. `verifiedContinuation` hace que
  el formatter conserve el reconocimiento y derive la siguiente pregunta del
  ledger aunque no cambie el bloque; en edición evita reabrir preguntas.
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
- `designerAiActionEvidence` comprueba el efecto concreto de cada action, con
  espera acotada. El executor retorna `actionResults` con requested, executed,
  effective, persisted y error. El nombre espera el callback del header; las
  otras acciones esperan el flush existente y comparan el contenido de su
  escritura confirmada. Una revisión global distinta no acredita una acción.
- Al primer fallo se detiene el lote: las acciones siguientes quedan sin
  ejecutar. El ledger incorpora solo efectos confirmados y guardados; los
  intentos fallidos quedan `needs_clarification`. No existe rollback general.
- Las reglas terminales tienen precondiciones compartidas de valor, procedencia
  y dependencia, validadas por backend y frontend y al reconstruir el ledger.
  Una resolución antigua inválida se reabre; `keep_existing` no acepta vacíos,
  ejemplos, templates ni procedencia desconocida.
- `batchId` se deduplica en memoria dentro del panel. No existe idempotencia
  durable backend ni persistida entre remounts.
- El callable no habilita `enforceAppCheck` de forma explícita.
- `gallery_cell_upload` valida `galleryId`, `cellId` e índice. El panel los pasa
  al control simplificado; `MiniToolbarTabImagen` selecciona la Gallery, marca el
  slot exacto, lo desplaza a la vista y mueve el foco a su control. Ese target es
  solo el foco inicial: cambiar, agregar, eliminar o reordenar fotos actualiza el
  draft y el indicador transitorio de cambios, pero no completa la Gallery. El
  panel ofrece primero ayuda para cambiar las fotos, sin mostrar el editor de
  Gallery antes de la decisión. El modelo interpreta la respuesta; una solicitud
  anticipada de control se reemplaza por la pregunta. La sesión UI conserva el
  ofrecimiento/aceptación para no repetirlo por cada Gallery. Rechazar la ayuda
  usa `deferred_by_user` del ledger, recuerda asistente/tab Fotos y continúa tras
  confirmar su persistencia. Si acepta editar, el panel continúa únicamente cuando
  el usuario activa `Terminé con esta galería`,
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
| Progreso | `Preparando la respuesta…` mientras se espera el resultado; luego `designerAiExecutionFeedback` describe la acción validada que informa el executor (nombres, fecha, horario, ubicación, etc.) durante su aplicación y persistencia. El panel conserva `Guardando…` para la metadata final. El progreso se publica también en live region y no confirma éxito antes del receipt. No hay tokens parciales ni job durable. |
| Concurrencia por panel | `sendingRef` impide un segundo envío mientras hay uno pendiente; el textarea permite escribir el mensaje siguiente y los reintentos no lo borran. |
| Cancelación de red | El cliente no conserva un handle de cancelación del callable. El backend aborta intentos OpenAI al vencer su timeout/deadline compartido. |
| Cambio de sesión | Invalida irreversiblemente operaciones ligadas a documentId/kind y su ciclo de montaje, también A → B → A. Places, uploads y callbacks del header comprueban identidad antes de mutar/publicar. El request backend puede seguir consumiendo recursos. |
| Cambio de contenido | Antes de aplicar se compara `snapshot.revision`; un cambio produce fallback stale y cero mutación de ese lote. Durante la ejecución se debe detener el resto del lote ante una edición manual incompatible; los receipts conservan únicamente lo efectivamente guardado, sin rollback de escrituras previas. |
| Espera de reflejo | El panel relee hasta 120 frames y cancela esa espera local al cambiar sesión. |
| Duplicados | `appliedBatchIdsRef` evita repetir un batch durante el montaje actual; una respuesta repetida produce feedback explícito y cero escrituras adicionales. |

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
- Al recuperar historial guiado se contrasta la última continuación con el paso
  vigente. Si quedó desactualizada se agrega la pregunta local correcta sin
  borrar mensajes, abrir controles ni llamar al modelo. La huella del paso y
  sus hojas es sólo evidencia efímera de presentación: preserva una aclaración
  de año cuando sigue siendo válida y no se persiste ni decide la prioridad.
- Si se desmontó con un turno pendiente y el último mensaje conservado es del
  usuario, al volver informa la interrupción y pide revisar el borrador/enviar
  otra solicitud. No reproduce automáticamente un lote que pudo guardarse en parte.
- No se usa `previous_response_id`; cada request reconstruye contexto con un
  máximo de los seis turnos visibles más recientes, aunque la UI retenga treinta.

El sidebar conserva `designerAiJourneyRef` por documento y sesión. Tras el primer
cierre pasa a edición; el panel proyecta `conversation.mode` en el snapshot
efímero. El brief deja de impulsar `nextBlock` pero conserva `needsAttention` y
las hojas pendientes. Preview reutiliza el callback `generarVistaPrevia` que ya
consume el sidebar (controller/pipeline y flush existentes); no muta el ledger.

**Decisión aceptada — recuerdo del cierre tras recarga con nuevos pendientes.**
Autorización explícita del usuario, 2026-09-28: agregar únicamente el booleano
`designerAiConversation.usage.guidedFlowCompleted`. Implementado y verificado
por las regresiones E8 de `designerAiV1.test.mjs`: completo → pendiente → reload
conserva edición; volver a completar no repite el cierre.

Es monotónico (`false → true`). El panel lo establece solo si el ledger releído
con las resoluciones y receipts reconciliados tiene
`guidedFlow.completion.complete === true`; lo escribe en el patch de metadata
existente y espera su confirmación. Preserva un `true` anterior al persistir.
La preparación de reingreso también conserva la marca. No modifica el ledger,
sus pendientes, fingerprints ni evidencias; no se envía la marca al modelo,
solo el modo derivado. No se guardan mensajes, prompts ni otra memoria.

Compatibilidad: ausencia normaliza a `false`. Un borrador legacy actualmente
completo entra en edición y adquiere la marca en el guardado de metadata de
ingreso, sin repetir cierre; si está incompleto y no tiene marca, sigue guiado.
No se infiere una finalización histórica que el borrador legacy no documenta.

### 8.2 Persistencia

El chat no se persiste. Sí se persiste `designerAiConversation` dentro de
`borradores/{slug}` a través de `DashboardHeader` y
`editorSessionPersistence`. Ese campo contiene ledger versionado, baseline,
fingerprints/procedencia, resoluciones y política automática/explícita del
nombre, además de `usage.hasStarted` y `usage.guidedFlowCompleted`. No debe contener mensajes ni duplicar
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
Desde P0 las reconciliaciones generales esperan confirmación durable del bridge,
igual que la finalización de una Gallery, antes de mostrar éxito. Si falla, el
panel conserva el lote recuperable y sus receipts. En Gallery restaura el ledger
local previo, mantiene la Gallery pendiente y permite reintentar; las mutaciones
de fotos ya guardadas no se revierten.

### 8.3 Evidencia de primer ingreso, reingreso y nombre registrado

`designerAiConversation.usage.hasStarted` es la señal durable y única:

- ausencia o `false` produce `first_entry`;
- el panel prepara el ingreso, persiste `true` mediante el bridge existente,
  relee el snapshot vigente y envía `entryMode:first_entry`;
- un refresh o una sesión posterior sin historial efímero relee `true` y envía
  `entryMode:reentry`; desmontar/remontar solo el panel conservando historial no
  crea otro auto-start, como se detalla en 8.1;
- `autoStartedSessionRef` sigue evitando duplicados solo dentro del montaje, pero
  no participa de la clasificación durable;
- baseline, resolutions, mensajes, placeholders o contenido completo nunca se
  usan como heurística.

Compatibilidad legacy: un draft sin `usage` normaliza `hasStarted:false`; la
próxima apertura es su primer ingreso determinista y desde ese momento queda
marcado. No hay backfill ni reconstrucción histórica.

El callable relee `usuarios/{uid}` solo para `first_entry`/`reentry`, después de
autorizar y validar el payload, y usa
`extractProfileFromDocData` y pasa solo `profile.nombre` al service como
`registeredFirstName`. Si el documento/campo no existe o la lectura falla, usa
`null`/string vacío y el saludo no inventa nombre. El panel no recibe ni persiste
perfil, email, apellido o `nombreCompleto`.
La apertura automática devuelve únicamente el saludo seguro; no carga el cliente
OpenAI ni resuelve el secret. Las continuaciones omiten la lectura del perfil.

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
- Logs de éxito incluyen UID, trace ID, batch ID, latencia total del callable,
  intent, cantidad de actions, presencia de control, reparaciones y request ID
  de OpenAI cuando existe. Agregan `responseKind`, latencia del service, lectura
  del perfil y validación inicial, más las métricas numéricas de la sección 15.2.
- Logs de error incluyen UID, trace ID, latencia, clase/resumen seguro de error,
  métricas disponibles y request ID. `failureReason` usa el resumen fijo de la
  categoría: un diagnóstico interno puede contener IDs dinámicos provenientes
  del cliente y no se registra. El fallo de perfil usa `profile_read_failed`,
  sin serializar la excepción Firestore.
- El código actual no registra prompt, mensajes, snapshot, valores funcionales,
  URLs privadas ni secret en esos eventos.

Gap: no existe un helper central de redacción para futuros logs del subsistema;
la seguridad depende de conservar el allowlist de campos de logging actual.
Tampoco existe redacción de PII/secrets en el texto libre antes de enviarlo al
proveedor; este límite debe considerarse al definir la política de privacidad.

## 10. Fallbacks, reintentos y rate limits

### 10.1 Implementado

- `deadline.ts` comparte un deadline de 40 segundos desde el inicio del callable:
  lectura mínima del perfil (máximo 3 s, fallback vacío), request, un retry de
  transporte total y una reparación. El callable conserva 45 s, con margen de
  5 s. Cada intento recibe `min(25 s, tiempo restante)`, señal de abort y
  `maxRetries:0`; no hay retries ocultos del SDK. No inicia otro intento con
  menos de 1 s. Respeta Retry-After si cabe y usa demora acotada si falta.
- La apertura automática no necesita request ni repair de modelo. Una salida
  estructurada de interpretación que falla validación, incluidas claves faltantes o
  adicionales, se clasifica como `malformed-output`, nunca `invalid-payload`.
  Dispone de un único intento de
  reparación semántica con el motivo acotado del validador. La segunda salida
  vuelve a atravesar todas las validaciones; no se aplican resultados parciales.
- En `continuation` guiado, si sigue pendiente `venue_name`, el usuario repite
  su último mensaje humano y la interpretación vuelve sin acciones, control,
  aviso ni decisión útil (sólo vacío o `needs_clarification` de ese nombre),
  el service utiliza esa misma reparación única. Compara el historial acotado
  existente, ignorando mayúsculas y espacios; no requiere que la pregunta
  anterior sea idéntica porque puede contener feedback de la fecha guardada.
  Excluye aperturas, modo edición, preguntas con signos y acuses simples.
  No clasifica el texto como un nombre ni fabrica una mutación. Si tampoco
  logra interpretarlo en la reparación, devuelve un error recuperable con una
  sugerencia local para expresar el nombre, conservando `invalid_model_output`
  y el retry del panel. No agrega llamadas a los turnos que ya producen efectos
  o decisiones válidas. La primera respuesta breve se interpreta mediante las
  instrucciones contextualizadas por `nextStep`; el guard corta su repetición,
  no certifica que cualquier texto libre sea un lugar.
- El callable tiene timeout de 45 segundos.
- Timeout, upstream rate limit, secret ausente, payload inválido y fallo genérico
  se mapean a errores Firebase seguros.
- El callable adjunta a cada error una categoría segura, indicación de
  reintentabilidad y `referenceId`; el panel muestra una causa resumida y esa
  referencia. Los logs usan el mismo ID y un resumen fijo de la categoría, sin
  registrar diagnósticos con IDs dinámicos, payloads, prompts, secretos ni
  respuestas crudas del proveedor.
- El panel traduce códigos conocidos a mensajes sin detalle interno sensible.
- Antes de ejecutar ofrece `Reintentar` y relee el snapshot para interpretar el
  mismo pedido. Un fallo de metadata inicial también tiene retry explícito.
  Una nueva intención descarta la recuperación previa. Los errores parciales
  usan exclusivamente el lote/receipts P0, con conteo de guardados y pendientes.
- El loader Places comparte un intento por ventana, limita script/import a 12 s,
  espera el callback de Maps para `loading=async` (el evento `load` del script
  no acredita disponibilidad de la API), quita script/listeners/callback ante
  error/timeout y permite una carga nueva. Cada intento tiene callback propio;
  uno tardío no puede completar un retry posterior. El
  control conserva la búsqueda y ofrece retry y retorno a la alternativa manual.
  El snapshot de capabilities relee la metadata canónica de ubicación desde
  `authoring.values.__eventDetails.locations`, incluso sin objeto mapa en canvas,
  para verificar la selección persistida de la misma phase.
- Cancelar un selector de archivos liquida la solicitud pendiente y ambas
  operaciones de sidebar/toolbar; también al reemplazarla o desmontar. Una
  selección válida transfiere esa solicitud al upload existente.
- Si falla la generación de copy posterior a una decisión o control ya
  verificados, el panel conserva el cambio, lo diferencia del fallo
  conversacional y ofrece `Continuar recorrido` desde un snapshot nuevo.
- No se aplican actions si la respuesta conserva un defecto inválido después de
  la recuperación limitada por hoja o si falla antes de ejecución.

### 10.2 No implementado

- No hay fallback de modelo/proveedor.
- Fuera del retry de transporte acotado y la reparación no hay retry automático
  adicional; el resto requiere una acción explícita del usuario.
- No hay circuit breaker ni cola durable. La espera del único retry de
  transporte está limitada por el deadline compartido.
- No hay rate limit propio por UID, draft, IP o ventana temporal; solo se mapea el
  429 del proveedor.
- No hay presupuesto/cuota del producto ni cálculo de costo. Los logs técnicos
  cuentan tokens informados por respuestas del proveedor; no hay dashboard de
  costo ni se atribuye consumo a intentos que no devolvieron usage.

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

Cuando no existe documento enfocado, el código demuestra el comportamiento
vigente; no define automáticamente la regla esperada. Se investigan owners y
evidencia siguiendo `DOCUMENTATION_INDEX.md`, sin inventar decisiones de producto
ni copiar una autoridad paralela dentro de los docs del asistente.

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
| Autorización del callable | Implementado | `requireAuth`, para todos los roles autenticados. |
| Autorización server-side de cada tool | No implementado | Tools se ejecutan en cliente; backend solo valida propuesta. |
| Validación estructural backend/frontend | Implementado | Contrato compartido y validadores. |
| Desfase de versión frontend/backend | Implementado y testeado | Antes de validar el payload, cualquier `contractVersion` no vacía distinta de la vigente recibe una respuesta segura que conserva la versión del cliente y solicita recarga; no llega a OpenAI ni se presenta como mensaje inválido. |
| Validación contra draft server-side | No implementado | Snapshot proviene del cliente; no hay reread backend. |
| Contexto mínimo sin media/geometría | Implementado y testeado | Sanitizer + payload builder + service tests. |
| Minimización por necesidad del turno | Parcial | El shape es acotado, pero se envían todos los valores allowlisted del snapshot. |
| Redacción de texto libre antes de OpenAI | Parcial | Los valores bancarios conocidos ocultos/desactivados se redactan en el historial original antes del límite de longitud. El mensaje actual explícito queda fuera de esa minimización; no hay DLP general. |
| Separación de contenido no confiable | Parcial | Roles y validación existen; estado de cliente se usa como developer context después de sanear. |
| Evidencia antes de confirmar | Implementado para actions | Cada action verifica su efecto canónico y el payload confirmado por el writer existente. Receipts locales ligan acción/documento/fingerprints; el ledger rechaza acreditar un valor posterior diferente. Places y media conservan sus controles humanos y owners. |
| Nunca afirmar ejecución sin evidencia completa | Implementado en el flujo de aplicación | Un fallo corta el lote y bloquea su mensaje de éxito. No equivale a bloquear ediciones posteriores ni otras pestañas. |
| Chat persistido | No implementado deliberadamente | Hasta treinta mensajes en memoria React por borrador; solo los seis turnos más recientes forman el contexto de cada request. |
| Metadata de ledger persistida | Implementado | `designerAiConversation` en draft. |
| Primer ingreso vs reingreso | Implementado | `designerAiConversation.usage.hasStarted`, `prepareDesignerAiConversationEntry` y persistencia confirmada antes del auto-start. |
| Nombre registrado en el saludo | Implementado con fallback | Solo el ingreso relee `usuarios/{uid}.nombre`; ausencia/error produce string vacío. El saludo automático es determinista y la pregunta deriva del ledger, sin evaluación del modelo. |
| Español permanente, tono aprobado y voseo consistente | Parcial | El prompt actual pide español rioplatense y voz compatible; no hay eval durable ni paridad completa con el contrato. |
| Orden guiado `Nombres -> estructura -> evento -> Dress Code -> RSVP -> Regalos -> portada -> Galleries` | Implementado y testeado | `GUIDED_FLOW_BLOCKS`, `ledger.guidedFlow` y brief derivado en el ledger compartido. |
| RSVP en el recorrido principal | Implementado y testeado localmente | Incluye su activación; personalización del formulario sigue reactiva, con la misma allowlist. |
| Aprovechar varios datos adelantados | Parcial | El schema acepta lotes de hasta 19 actions y el prompt pide agrupar, pero no hay evaluación real de cumplimiento conversacional. |
| Ubicación chat-first manual/Places | Implementado y testeado | Datos manuales se aplican por el owner, la decisión Maps es explícita, el control especializado reutiliza Places y la selección se verifica localmente antes de continuar. |
| Keys personalizadas de ubicación | Defecto pendiente, reproducido localmente 2026-10-07 | El writer usa la key asociada al rol, pero `resolveEventLocationFromAuthoring` aún lee keys canónicas para nombre/dirección. Un campo con rol válido y key personalizada puede quedar escrito sin que el snapshot verifique su efecto. Es independiente del bucle sin actions: el borrador investigado usaba keys canónicas. Requiere corregir el lector y verificar sus consumidores de editor/render antes de ampliar el arreglo. |
| Regalos con valor/visibilidad independientes y lista externa | Implementado en dominio/capability | Root normalizada, flags por método, URL externa, actions y validación de readiness existentes. |
| Recorrido guiado interno de Regalos | Hardening P0 implementado y testeado | Usa métodos visibles confirmados, oculta defaults no elegidos conservando datos y excluye intro/botón de la completitud. Alias solo, lista externa y combinación se prueban contra las actions existentes, sin estado de modalidad adicional. |
| Portada y múltiples Galleries por disponibilidad real | Implementado en orquestación/control | Portada conserva evidencia por fingerprint. Cada Gallery con slots aporta una hoja durable, respeta el orden del snapshot y avanza solo por finalización explícita; cambios y cierre del control no completan. |
| Cierre único + edición + `Ver vista previa` | Implementado y verificado localmente, incluida recarga | Transición verificada, `usage.guidedFlowCompleted` monotónico por documento y callback de preview existente. Reabrir o resolver pendientes después del cierre conserva edición y no repite el cierre. |
| Retención de `designerAiConversation` | Inferido | Sigue al draft por ubicación del campo, sin política aprobada propia. |
| Política de retención | Gap documental/producto | No hay plazo, borrado selectivo ni obligación aprobada. |
| Streaming/cancelación real | No implementado | Respuesta completa y descarte local. |
| Prevención de respuesta obsoleta | Implementado en cliente | Session sequence + revision check. |
| Idempotencia durable | No implementado | Sets en memoria por montaje. |
| Reintentos | Parcial | Un retry de transporte controlado por el service (`maxRetries:0` en SDK), una reparación semántica y continuación verificada. Un lote parcial puede reanudarse en la sesión actual: valida identidad y estado, salta efectos confirmados y reintenta su writer cuando corresponde. No es idempotencia durable; nueva intención y desmontaje invalidan esa recuperación. |
| Rate limit propio | No implementado | Solo traducción de 429 upstream. |
| Redacción de logs | Implementada por allowlist actual | Sin helper/policy automatizada para cambios futuros. |
| Evaluación conversacional real | No implementada | Tests usan fixtures/mock y assertions de source. |
| Owner único de instrucciones/copy runtime | Parcial | Interpretación en service; seed compartido; preguntas derivadas en el adaptador guiado; cierre y fallbacks de UI conservan sus owners. No se carga documentación como prompt. |

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

La proyección previa a validar reglas vive en
`shared/designerAiActionProjection.cjs`. Configuración y ejecución comparten
`designerAiConfigReducers.cjs`, `rsvpCatalog.cjs`, `rsvpConfig.cjs`,
`rsvpEditorOps.cjs` y `giftsConfig.cjs`; los módulos públicos bajo `src/domain/`
conservan sus exports. `authoringValueNormalization.cjs` y `gallerySlotOrder.cjs`
extraen las funciones puras existentes que usa también esa proyección. Todos se
empaquetan mediante `functions/scripts/syncTemplateContract.cjs`.

El ledger valida las reglas contra el estado ya observado, sin reducir otra vez
las acciones. La evidencia, recuperación, límites M2/L1 y verificaciones del P0
están en [DESIGNER_AI_P0_HARDENING.md](../testing/DESIGNER_AI_P0_HARDENING.md).

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
- `src/components/editor/designerAi/designerAiLifecycle.test.mjs`
- `src/components/editor/designerAi/DesignerAiLocationControl.test.mjs`
- `src/components/MiniToolbarTabImagen.mobileDrag.test.mjs`
- `functions/designerAiService.test.mjs`
- `functions/designerAiAuthorization.test.mjs`

Estas pruebas cubren contratos ejecutables, no calidad conversacional de una
respuesta real del modelo. Los criterios para crear una evaluación durable
independiente viven en `AI_ASSISTANT_CONVERSATION_CONTRACT.md`.

## 15. Auditoría local del 2026-10-06

### 15.1 Hallazgos, causas y decisiones implementadas

La revisión contrastó los contratos con entrada, hidratación, reingreso, ledger,
snapshot, callable, propuesta, ejecución y persistencia. Las diferencias de
implementación se corrigieron hacia las reglas vigentes; abrir mobile y el
placeholder responden al pedido explícito de esta auditoría. No hubo cambios de
modelo, permisos, owners de escritura, render ni publicación.

| Prioridad / problema | Causa comprobada | Corrección / alcance |
| --- | --- | --- |
| P0: primera pregunta distinta de Nombres | La UI conservaba cualquier pregunta del modelo si el bloque seguía siendo el mismo, aun cuando contradecía `nextBlock`. La entrada podía además recibir una propuesta de mutación. | Saludo de apertura sin modelo, pregunta desde el ledger y apertura de solo lectura incluso ante respuestas de un backend anterior. No se altera la interpretación de mensajes humanos. |
| P0: procedencia desactualizada | La metadata de `changedKeys` del header podía quedar vieja tras una edición manual. Una baseline de entrada y un default restaurado no demuestran por sí solos confirmación. | Snapshot desde el authoring vivo; evidencia conservada solo para su fingerprint; defaults/unknown no adquieren confirmación por ingreso o cambio de historial. No se agrega otra metadata de confirmación. |
| P0: snapshot anterior a espera de persistencia inicial | El ingreso retenía el snapshot capturado antes de guardar metadata y podía ignorar una edición durante la espera/reintento. | Se relee después de confirmar el guardado inicial. |
| P0: edición manual sobrescrita durante un lote | El control de revisión anterior a ejecutar no cubría la espera de frames, el writer del owner ni el guardado entre acciones. Capturar el estado observado después de esa espera absorbía la edición manual como baseline. | El executor proyecta el estado esperado desde el snapshot previo mediante la proyección canónica; detiene las acciones siguientes e invalida recuperación incompatible. Regresiones cubren primer frame, writer y flush. El panel también verifica cambios durante el guardado final de metadata antes de mostrar éxito. |
| P1: mobile no comenzaba desplegado o podía reabrirse | La decisión inicial no estaba consumida por identidad de draft y se mezclaba con la apertura del Asistente manual. | Apertura móvil una vez por draft con acceso; cierre, tabs, permisos tardíos y resize no fuerzan reapertura. Desktop consume la decisión sin autoabrir IA. |
| P1: turno pendiente silencioso o escritura en composer perdida | Desmontar conservaba el mensaje del usuario pero invalidaba la operación; el envío oculto/retry vaciaba el composer. | Mensaje de interrupción al reabrir, sin replay; escritura permitida durante espera; solo un envío explícito vacía su propio texto. |
| P1: duplicado sin explicación / progreso prematuro | La deduplicación salía silenciosamente y el progreso inicial anunciaba cambios antes de conocer el resultado. | Feedback explícito de duplicado sin mutación; `Preparando la respuesta…` antes de la propuesta y progreso específico solo después de validarla. |
| P1: I/O y diagnósticos innecesarios | Cada turno leía perfil antes de validar. Los logs podían serializar la excepción Firestore o IDs dinámicos del validador. | Validación antes de I/O, perfil solo en entradas, logs con categorías fijas y métricas numéricas. |
| P2: copy del composer | Existía un placeholder distinto en el textarea. | Se modifica su definición única al texto solicitado, sin constante paralela. |

Los tests V1/lifecycle que antes aplicaban acciones durante el auto-start ahora
envían un pedido humano explícito antes de probar progreso, cierre o recuperación.
Conservan las assertions de escrituras, modo edición, persistencia y ausencia de
opciones duplicadas; no se usa el nuevo saludo para justificar cambios no pedidos.

Verificación final local, 2026-10-06:

- **471/471** tests del asistente, shared, backend, Sidebar, authoring, bridge y
  persistencia. Ejecutados con `node --test --test-concurrency=2 --test-reporter=tap`
  sobre el listado conservado en
  `.local-isolation/assistant-audit-20261006/tested-files.txt`; resultado en
  `.local-isolation/assistant-audit-20261006/tests.tap`.
- **60/60** tests de `functions/renderContractCompatibility.test.mjs` y
  `shared/previewPublishParity.test.mjs`, usando el build actual y fixtures
  sintéticos. Resultado en `.local-isolation/assistant-audit-20261006/render-tests.tap`.
- `npm.cmd --prefix functions run build`: compilación y **70 copias** compartidas
  verificadas. `npm.cmd --prefix functions run lint`: **274 archivos, cero errores,
  234 advertencias**. Reporte `.local-isolation/assistant-audit-lint.json`.
- Diff incremental revisado contra la copia inicial del working tree; no se
  revirtieron cambios ajenos. `git diff --check` sin errores.

Ejecuciones focales adicionales (incluyen subconjuntos de la batería anterior):

- Backend (`designerAiService`, `designerAiAuthorization`, `designerAiDates`,
  `designerAiResolutionSchema`) más panel V1/lifecycle: **126/126**, exit 0.
- `functionOwnership`, `runtimeConfiguration` y `discoveryInitialization`, con
  guards de red existentes: **22/22**, exit 0. El registro actual descubrió
  102/3/3 endpoints, 108 en total, sin desconocidos ni duplicados y con metadata
  coincidente. No son inventario remoto ni discovery con la CLI real.
- Typecheck de Functions y revisión de whitespace del diff pasaron. El gate
  completo `verify:ownership` quedó bloqueado por ausencia de la CLI local fijada;
  no se instaló ni se reconstruyeron los paquetes secundarios con el disco casi
  lleno. Las pruebas parciales no reemplazan ese gate.

Los anchors adicionales están en `designerAiTurnSafety.test.mjs`,
`designerAiNames.test.mjs`, `designerAiTiming.test.mjs`, las regresiones del ledger
y los tests responsive del Sidebar, junto a sus respectivos owners. Los conteos
anteriores corresponden a las ejecuciones puntuales indicadas, no a una garantía
de toda la aplicación ni a una prueba del modelo real. La auditoría no desplegó,
no consultó borradores reales ni invocó OpenAI.

Alcance de archivos mantenidos de esta auditoría (las modificaciones ajenas del
working tree no forman parte de esta lista):

- UI: `src/components/DashboardSidebar.jsx`,
  `src/components/editor/designerAi/DesignerAiPanel.jsx`.
- Estado y ejecución: `shared/designerAiCapabilityContract.cjs` y su wrapper `.js`,
  `shared/designerAiConversationLedger.cjs`,
  `src/domain/editor/designerAiCapabilities.js`, `designerAiGuidedConversation.js`,
  `designerAiActionExecutor.js`, `designerAiTiming.js`, y
  `src/components/editor/templateAuthoring/useTemplateFieldAuthoring.js`.
- Backend: `functions/src/designerAi/service.ts` y el bloque `designerAiChat`
  con sus imports en `functions/src/index.ts`. Se sincronizaron los dos contratos
  de AI en `functions/shared/` y `functions/lib/shared/` mediante el build.
- Tests: `functions/designerAiService.test.mjs`,
  `functions/designerAiAuthorization.test.mjs`,
  `shared/designerAiConversationLedger.test.mjs`,
  `src/components/DashboardSidebar.access.test.mjs`,
  `src/components/editor/templateAuthoring/DynamicFieldRuntimeHardening.test.mjs`;
  en `src/domain/editor/`: `designerAiCapabilities.test.mjs`,
  `designerAiGuidedConversation.test.mjs`, `designerAiActionExecutor.test.mjs`,
  `designerAiTiming.test.mjs`; en `src/components/editor/designerAi/`:
  `DesignerAiPanel.test.mjs`, `designerAiLifecycle.test.mjs`,
  `designerAiMapsContinuation.test.mjs`, `designerAiNames.test.mjs`,
  `designerAiV1.test.mjs`, `designerAiTurnSafety.test.mjs` y
  `testSupport/panelHarness.mjs`.
- Documentación existente: este mapa, `GUIDED_TOUR_SYSTEM.md`,
  `AI_ASSISTANT_CONVERSATION_CONTRACT.md` y `DESIGNER_AI_CAPABILITY_CONTRACT.md`.

Limitaciones de verificación: responsive/lifecycle se ejercitan con React/JSDOM,
no con navegación visual real en dispositivos; no se ejecutó build/export de
Next ni el gate integral de emuladores. Las Rules, configuración desplegada y
calidad conversacional del modelo real no quedan certificadas por estas suites.

### 15.2 Latencia: medición y optimizaciones

Antes de esta revisión solo se registraba `latencyMs` del service en éxitos;
omitía el tiempo previo del perfil y no separaba preparación, proveedor, retry y
validación. La instrumentación ahora permite distinguir estas etapas:

| Superficie / métrica | Qué mide y qué no mide |
| --- | --- |
| Frontend `contextMs` | Preparación local desde la admisión del envío y snapshot; puede incluir la marca inicial de uso de un envío humano previo al auto-start. No incluye hidratación anterior ni el tiempo humano escribiendo. |
| `callableMs` | Espera del callable, incluida red y trabajo backend; no debe sumarse otra vez con sus métricas internas. |
| `actionsAndPersistenceMs` | Ejecución, evidencia y persistencia de actions por los owners existentes. |
| `metadataMs` | Confirmación de metadata conversacional del camino principal. El guardado inicial anterior al auto-start y la recuperación parcial no tienen desglose propio; sus esperas dentro del turno sí afectan su duración total. |
| `firstFeedbackMs` | Momento en que el efecto React observó el estado de progreso. Es feedback percibido aproximado, no el primer token del modelo. |
| `responseReadyMs` / `responseVisibleMs` | Fin de procesamiento local / efecto React posterior al commit del resultado. No acreditan el paint exacto del navegador. |
| Backend `latencyMs`, `serviceLatencyMs`, `profileReadMs`, `payloadValidationMs` | Callable total, service, lectura de perfil y validación previa al I/O. |
| `telemetry.contextPreparationMs`, `providerMs`, `retryWaitMs`, `resultValidationMs` | Preparación de input/schema, suma de intentos del proveedor, espera de retry y validación de propuestas. Incluye errores cuando se dispone de medición. |
| `providerAttempts`, `transportRetryCount`, `repairCount` | Cantidades para diferenciar una respuesta lenta de varios intentos. |
| `inputBytes`, `toolSchemaBytes`, `inputTokens`, `outputTokens` | Tamaño del input base y schema; tokens informados por respuestas recibidas, sumando repair. No se inventa usage de intentos fallidos ni se calcula costo. |

Frontend emite `CustomEvent("designer-ai-turn-timing")` local, sin envío de red:
solo duraciones, `outcome` (`success`, `error`, `duplicate`) y, si es UUID válido,
`batchId` para correlacionar con el log backend. No contiene texto, snapshot,
identidad del draft ni `clientMessageId` arbitrario. En consola local puede
observarse con `window.addEventListener("designer-ai-turn-timing", e => console.table(e.detail))`.
No se mide TTFT real: no hay streaming y la respuesta útil se presenta después de
validar/persistir. Nunca se aplican fragmentos parciales de una function call.

Optimizaciones verificables por operaciones eliminadas:

- Apertura automática: **una llamada al modelo → cero**. También evita instanciar
  el SDK y resolver el secret en ese camino; conserva la lectura mínima de perfil.
- Continuación: **una lectura de perfil → cero**. Se conserva el deadline global
  de 40 s, el máximo de 25 s por intento, un retry de transporte y una reparación
  semántica. Apertura/reingreso mantienen el fallback de perfil a los 3 s.

No se midieron cold starts, red, Firestore ni latencia real de OpenAI. No se
atribuyen milisegundos productivos a esas optimizaciones. El contexto sigue
acotado por allowlists, con instrucciones inline y una tool forzada; no descarga
documentación remota. Seleccionar contexto por intención, cambiar modelo/schema,
caché de perfil o streaming exigiría evaluar pérdida de información, invalidación
y calidad; no se implementó por especulación.

Baseline CPU local con fixture `production-recovery`, proveedor en memoria sin
I/O, dos warmups y diez muestras, Node/Windows del workspace: input **26.526 bytes**,
schema **24.660 bytes**. Medianas: validación de payload **1,029 ms**, preparación
**2,024 ms**, proveedor simulado **0,223 ms**, validación de resultado **0,454 ms**,
total **3,763 ms**. Es una medición del pipeline local, no una comparación
antes/después ni un benchmark del proveedor; las medianas de etapas no tienen
por qué sumar exactamente la mediana total.

Reproducción desde la raíz en PowerShell, después de sincronizar/compilar las
fuentes actuales con el build existente:

```powershell
@'
import { performance } from 'node:perf_hooks';
import service from './functions/lib/designerAi/service.js';
import { designerAiDateCases, dateCasePayload } from './functions/testSupport/designerAiDateCases.mjs';
const payload = dateCasePayload(designerAiDateCases.find(x => x.id === 'production-recovery'));
const samples = [];
const client = { responses: { create: async () => ({ output: [{ type: 'function_call', name: 'submit_designer_ai_result', arguments: JSON.stringify({ intent: 'clarify', assistantMessage: 'Seguimos.', actions: [], controlRequest: null, resolutions: [] }) }] }) } };
for (let i = 0; i < 12; i++) {
  const r = await service.interpretDesignerAiChat({ payload, client, now: () => performance.now() });
  samples.push({ ...r.telemetry, totalMs: r.latencyMs });
}
const keys = ['payloadValidationMs', 'contextPreparationMs', 'providerMs', 'resultValidationMs', 'totalMs'];
const medians = Object.fromEntries(keys.map(k => { const s = samples.slice(2).map(x => x[k]).sort((a,b) => a-b); return [k, +((s[4]+s[5])/2).toFixed(3)]; }));
console.log({ warmup: 2, samples: 10, inputBytes: samples[0].inputBytes, toolSchemaBytes: samples[0].toolSchemaBytes, medianMs: medians });
'@ | node --input-type=module
```

Persisten los límites de secciones anteriores: sin idempotencia durable del
backend ni cuota propia, sin cancelación del callable desde el cliente y sin
evaluación con modelo real. Detener un lote ante conflicto no es una transacción
ni revierte escrituras confirmadas; múltiples ventanas y cambios remotos siguen
requiriendo evidencia de concurrencia adicional.

### 15.3 Despliegue autorizado y verificado — 2026-10-06

Después de la auditoría, el usuario autorizó el deploy. Se publicaron Hosting y
únicamente `functions:default:designerAiChat` en `reservaeldia-7a440`.
Verificación final: **2026-10-06T21:42:58Z**, Hosting
`NKbUsXF1v6rnlef7ZMwAe`, función ACTIVE `designeraichat-00038-dax`.
El inventario de 108 funciones sólo cambió en ese callable; su configuración,
entorno y binding de `OPENAI_API_KEY` se conservaron. No se desplegaron Rules.

La release reutilizó la base publicada `60df068f` y sus cambios del asistente,
con hashes de fuentes y backups previos. Durante el deploy del backend se detectó
otra publicación de Hosting (`gYHZPEkovQPXb-3vrw_yJ`). Se detuvo la publicación del
frontend, se preservaron sus dos archivos de portada y su historial estático,
y se recompiló sin incorporar cambios pendientes ajenos. Los detalles y la
comparación de fuentes están en `.local-isolation/assistant-audit-release-20261006/`.

La copia exacta pasó **469 tests del asistente**, **60 de render** y el gate completo
de ownership: **41 tests, tres builds y discovery real de las tres codebases** con
CLI 14.4.0. Los dos tests menos respecto de la auditoría local pertenecen al piloto
de música excluido del release. Lint: cero errores y 234 advertencias. Next
build/export y retención de assets pasaron. En producción se comprobaron el build,
76 archivos estáticos, los bytes del bundle del asistente y el rechazo 401 de una
llamada anónima. Evidencia final: `release-result.json` en el directorio indicado.
No se probaron borradores autenticados ni llamadas al modelo real en producción.

### 15.4 Corrección del orden durante toda la conversación — 2026-10-06

La revisión posterior reprodujo un defecto que el fix de apertura no cubría:
cuando el bloque no cambiaba, el compositor conservaba cualquier pregunta del
modelo. El chequeo de signos/verbos no validaba su tema; además el orden interno
preguntaba dirección antes del nombre del lugar y el reingreso podía conservar
una pregunta antigua. Las ofertas pasivas de Maps tenían otra prioridad,
dependiente de actions/resolutions y de texto no confirmado.

El cambio autorizado consolida estas decisiones en `brief.nextStep`. La UI
deriva pregunta y ofertas pasivas desde el mismo snapshot confirmado. Las
continuaciones automáticas no abren Maps ni adelantan portada/galerías;
los pedidos humanos conservan sus controles reactivos. El historial se conserva
y se reconcilia localmente con el paso actual. No se incorpora un cursor durable
ni se modifican los owners del borrador, render, persistencia o publicación.

La aclaración estructurada y el aviso acotado descritos en sección 4 conservan
compatibilidad con backend/frontend anteriores. En una combinación temporal de
versiones puede pedirse una fecha completa en lugar de sólo el año; los datos
aportados y las acciones válidas se conservan. Un texto libre del modelo nunca
se usa como evidencia de cambio guardado ni como selector del próximo dato.

No cambia el modelo ni sus límites. Resolver preguntas y restaurar continuaciones
es trabajo local sin requests adicionales. Continúan las métricas de 15.2;
esta corrección no afirma una reducción medida de latencia del proveedor.
Tests relevantes agregados: `designerAiReentry.test.mjs`, selector en
`shared/designerAiConversationLedger.test.mjs`, compositor/control de ubicación,
schema y service; se conservan regresiones de nombres, Maps, regalos, imágenes,
hora de fin, receipts y recuperación. La evidencia reproducible de esta entrega
se conserva en `.local-isolation/assistant-question-order-20261006/`.

Despliegue autorizado completado: Hosting `XKh5Xm63lpR5sKP9o5FD2` y
`designerAiChat` ACTIVE `designeraichat-00039-jod`. La copia exacta pasó **512/512
tests del asistente/dependencias**, **60/60 de render**, **41/41 del gate de
ownership**, tres builds y discovery de las tres codebases. Lint: cero errores,
234 advertencias preexistentes. Next build/export y retención estática pasaron.
Se verificaron remotamente 75 archivos estáticos, los bytes del bundle, rechazo
anónimo 401 y que sólo cambió ese callable dentro del inventario de 108 funciones.
Configuración, Secrets bindings, Rules y fuentes ajenas se conservaron. No hubo
pruebas autenticadas de borradores ni turnos contra el modelo real en producción.
El registro de despliegue documental se agregó después de congelar las fuentes
publicadas; `release-result.json` conserva los hashes exactos de esa release.

### 15.5 Nombres heredados al crear desde plantilla — 2026-10-06

El reporte posterior de apertura directamente por ceremonia/fiesta permitió
reproducir un defecto anterior al ledger. `copiarPlantilla` produce
`templateAuthoringDraft` con defaults, sin `templateInput` ni defaults superiores.
La migración a v2 rellenaba estos últimos ausentes con vacíos antes de combinar
fuentes: los vacíos reemplazaban el baseline de la plantilla y sus nombres de
ejemplo aparecían en `changedKeys` como si fueran datos del usuario.

La migración ahora combina fuentes dispersas antes de normalizar valores
faltantes. Conserva vacíos explícitos, baselines personalizados y valores reales.
La prueba de integración usa el productor de metadata del backend, el servicio
real de carga, persistencia en memoria, reingreso y edición manual posterior.
Los tests anteriores construían snapshots ya normalizados y no cubrían esa
entrada. No cambia el orden de preguntas ni se fuerza una pregunta en la UI.

También se corrige la lectura de nombres con claves personalizadas y roles
semánticos válidos. Valor y procedencia siguen el mismo binding del owner de
nombres; la aparición posterior de un objeto visual no confirma defaults ni
un cambio en una vista combinada confirma campos individuales sin modificar.
El snapshot público, los writers y el contrato de acciones conservan su shape.

Límite: un borrador ya migrado por la versión defectuosa puede haber persistido
baselines vacíos y confirmación derivada de ellos. Es indistinguible localmente
de algunos casos de edición real; no se invalidan confirmaciones en masa ni se
reescriben sus datos. Requiere revisar el borrador y la evidencia de su origen.
Schemas sin roles de nombres siguen sin ofrecer esa capability: habilitarla
solamente en el ledger dejaría al owner sin campos donde guardar la respuesta.

La corrección es local, sin requests adicionales ni cambios en el proveedor.
Evidencia de esta entrega: `.local-isolation/assistant-template-names-20261006/`.

El borrador concreto aportado por el usuario se verificó contra su plantilla,
sin cambios desde antes de su creación. Trece campos coincidían con los ejemplos,
sus tres baselines estaban vacíos y no existían resolutions explícitas. Se
restauraron solamente esas referencias y once procedencias inferidas, con backup,
precondición `updateTime` y readback. Valores actuales y render no se modificaron;
el selector pasó de `event_structure` a `names`. Esta reparación puntual no es
una migración automática de otros borradores. Una pestaña abierta debe recargarse
para descartar su snapshot anterior.

Despliegue verificado: Hosting `PB9aq2tXeYXpvjJkwpdpY`, preservando la release
concurrente de acceso a música `fGEE0idle-MTjFMTaZ60g` y sus fuentes verificadas.
Se comprobaron 124 archivos estáticos y los bytes de los bundles del asistente;
el inventario de funciones quedó idéntico, con `designerAiChat` en
`designeraichat-00039-jod`. No se desplegaron Functions ni Rules.

La copia exacta verificó 638 tests del asistente/dependencias, 15 de música,
60 de render y 41 de ownership, además de tres builds y discovery real de las
tres codebases. Se conserva evidencia de dos incidencias del runner: un timeout
de inicialización que pasó al repetir sin cambios y siete fallos de música por
mezclar `NODE_ENV=test` con modo Firebase de producción. Los quince tests de
música pasaron con construcción de URLs de producción y red remota bloqueada;
no se modificaron tests para aceptar esos fallos. Lint: cero errores y 234
advertencias. Next build/export, retención estática y revisión independiente del
diff pasaron. No se ejecutaron turnos contra el modelo real ni verificación visual
autenticada. Este registro se agregó después de congelar las fuentes del deploy;
`release-result.json` conserva sus hashes exactos.

### 15.6 Regalos confirmados que vuelven a quedar pendientes — 2026-10-06

Se reprodujo el intercambio reportado con acciones válidas de activación y alias
visible, acompañadas de `requires_control` sobre `gifts.enabled`, la visibilidad
del alias o su valor. Schema y validator admitían ese estado en cualquier hoja,
aunque Regalos no tiene control local. La reconciliación podía reemplazar el
receipt persistido con esa resolución y volver a pedir la modalidad o el alias.
La reproducción prueba el defecto; no atribuye al incidente una respuesta del
proveedor cuya traza no está disponible.

El contrato compartido restringe ese estado a hojas con control compatible.
Backend y panel descartan únicamente la resolución redundante sin control sobre
una hoja cubierta por una action válida; los demás errores mantienen validación
estricta. La reconciliación conserva la autoridad del receipt efectivo y
persistido frente a ese conflicto. El alias no se confirma por existir un valor
ni por la propuesta del modelo. Persistencia fallida, controles reales pendientes
y campos explícitamente ocultos conservan su comportamiento.

La corrección no introduce requests, cambios de modelo ni escrituras nuevas.
No reinterpreta metadata histórica como confirmada: una etiqueta de procedencia
aislada no demuestra un receipt anterior. Un nuevo turno válido permite guardar
y resolver los datos. Las regresiones cubren backend, schema, ledger, panel,
reingreso y reintento. Evidencia del cambio y deploy:
`.local-isolation/assistant-gifts-control-20261006/`.

Despliegue autorizado verificado: `designerAiChat` ACTIVE en
`designeraichat-00040-vit`, con configuración y demás funciones sin cambios.
Se conservó Hosting `wW-VpiFp17XL8QkfoZnmz`: una publicación concurrente desde el
workspace ya incluía el arreglo frontend. Se verificaron 78 archivos estáticos,
los bytes de los 24 assets del dashboard y 65 tests del contrato/ledger sobre
los módulos compilados reales, además del enlace normalizador → validator →
ejecución del Panel. El build aislado `o9RrJtSV_3ToyaZqlnr-N` pasó, pero no se
publicó por encima de esa release concurrente y sus assets.

La copia de backend verificó 683 tests del asistente/dependencias, 15 de música,
60 de render y 41 de ownership, con tres builds y discovery de las tres
codebases. Lint: cero errores y 234 advertencias existentes. Se conservaron los
fallos de preparación: faltaban fixtures/configuraciones de verificación en la
copia frontend anterior; se restauraron sin cambiar expectativas y pasaron los
checks afectados. El primer deploy agotó los 10 segundos del discovery local
antes de subir código; el reintento usó 60 segundos sólo para el CLI, conservando
el timeout de producción. Se verificó rechazo anónimo 401, sin turnos contra el
modelo real ni modificación de borradores.

Los historiales ya afectados no se reparan sólo al recargar. Si quedó
`gifts.enabled` en `requires_control`, actualizar únicamente el alias no confirma
esa activación. Una nueva confirmación explícita de activar Regalos y dejar
visible el alias permite resolver las hojas afectadas con evidencia persistida;
no se infiere esa confirmación automáticamente desde metadata ambigua. Este
registro se agregó después de congelar las fuentes del backend y se distingue
del manifiesto de la publicación frontend concurrente en `release-result.json`.
