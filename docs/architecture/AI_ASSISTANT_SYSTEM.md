# AI Assistant System

Status: Canonical Architecture Reference.

Mapa actualizado el 2026-10-09. La sección 15
conserva evidencia fechada de cambios anteriores; la sección 16 registra el
endurecimiento de seguridad, su verificación local y el estado al 2026-10-07.
La sección 17 registra el deploy acotado de ubicación manual y Dress Code,
sin incluir el rollout de seguridad que entonces seguía pendiente. La sección 18
registra la decisión de cuotas y la evidencia operativa actual.

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
| Autorización y política de consumo backend | `functions/src/designerAi/admission.ts` + `admissionStore.ts` | Identidad Firebase, cuenta no anónima, verificación de email aplicable, ownership/estado del draft, cuotas, reserva e idempotencia transaccional. Sin bypass administrativo. |
| Frontera anterior al decoder Firebase | `functions/src/designerAi/requestBoundary.ts` + contrato compartido | Acota envelope/estructura antes del decoder recursivo; conserva metadata, CORS y validaciones SDK. También protege `.run`. |
| Inicialización web App Check | `src/config/initializeFirebaseAppCheck.js` + `initializeFirebaseServices.js` | reCAPTCHA Enterprise en navegador de producción, renovación automática y caché sobre la app para HMR; omite SSR y emuladores. |
| Datos bancarios y listas externas de Regalos | `src/domain/editor/designerAiGiftApproval.js` + `DesignerAiGiftConfirmation.jsx` | Bancos aportados se guardan por chat; un dato heredado no confirmado se solicita sin mostrarlo. La lista externa conserva aprobación local del lote antes de mutar. |
| Autorización de escritura de drafts | `firestore.rules` | El cliente solo actualiza `borradores/{id}` si es owner y no cambia `userId`. |
| Tests | `shared/designerAi*.test.mjs`, `src/domain/editor/designerAi*.test.mjs`, `src/components/editor/designerAi/DesignerAiPanel.test.mjs`, `functions/designerAi*.test.mjs` | Cobertura estructural/dominio; no evalúan calidad del modelo real. |

## 3. Flujo actual de una intervención

```text
DashboardSidebar
  -> monta DesignerAiPanel para un draft writable autorizado
  -> Panel espera hidratación de metadata y authoring
  -> deriva first_entry/reentry y persiste usage.hasStarted
  -> relee snapshot mínimo + ledger global/guided después de esa persistencia
  -> frontera HTTP acota estructura antes del decoder Firebase
  -> callable designerAiChat valida App Check, identidad y payload
  -> transacción verifica ownership/estado, política, cuotas e idempotencia y reserva consumo
  -> apertura automática: saludo estructurado sin modelo ni propuesta de cambios
     otros mensajes: service arma instrucciones + contexto + últimos turnos
       -> OpenAI devuelve una única function_call submit_designer_ai_result
       -> backend valida salida y devuelve propuesta estructurada
  -> Panel descarta sesión/revisión obsoleta y revalida el lote
  -> si falta un dato bancario, aclaración por chat; si cambia la lista externa, revisión local del lote
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
La continuación posterior se compone localmente desde el snapshot persistido,
sin otra llamada al modelo que pueda reabrir Maps. La decisión manual vigente
se conserva al aportar después la dirección; no completa datos ausentes ni
traslada evidencia a otra fase.

Este es el primer uso implementado del patrón **chat orquesta; control
especializado resuelve la selección precisa**. No existe un framework genérico ni
un formulario paralelo: `MiniToolbarTabDetallesEvento` y el control especializado
reutilizan el mismo proveedor de Places y el mismo coordinador de authoring, que
escriben el mismo shape; cada superficie conserva solo su presentación.

## 4. Construcción de instrucciones y relación con documentación

### 4.1 Implementación vigente

`SYSTEM_INSTRUCTIONS` vive inline en `functions/src/designerAi/service.ts`. Para
mensajes que requieren interpretación, conserva un único mensaje `developer`
con instrucciones estáticas. El snapshot mínimo, prioridad del ledger y contexto
de ingreso se envían como datos `CONTEXTO_NO_CONFIABLE` en un mensaje `user`.
Hasta seis turnos recientes se serializan en otro bloque de datos `user`: sus
etiquetas de rol no se convierten en mensajes `assistant` auténticos. Finalmente
se envía el mensaje actual del usuario. El contexto de reparación tampoco recibe
autoridad `developer`.
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
`clarification:{leafId,kind}|null` (`missing_year`, `invalid_date`, `missing_value`,
`missing_phase`)
y `notice:"unsupported_request"|null`. El schema del proveedor los requiere
nullable; el parser acepta la ausencia de versiones anteriores. No cambia la
versión de actions, payloads ni metadata persistida. El backend valida shape,
disponibilidad, tipo de hoja y resolución `needs_clarification` correspondiente.
El frontend valida el target contra `brief.nextStep` del snapshot real después
de persistir; una aclaración desactualizada usa la pregunta local sin otra
llamada al modelo. No se proyectan receipts de éxito para elegir preguntas.

El compositor guiado usa confirmaciones locales de receipts, avisos acotados y
la pregunta de `nextStep`; no incorpora `assistantMessage` libre ni intenta
separar preguntas por puntuación. En edición también compone feedback desde
receipts, controles y aclaraciones estructuradas del pedido actual; no retoma
la secuencia guiada ni publica afirmaciones libres del modelo. El
texto de los controles también es local. Así un resultado de backend anterior
sin esos campos sigue siendo utilizable sin cederle el orden de preguntas.

En el protocolo 2.6, `missing_phase` requiere ceremonia y fiesta, un campo
disponible en ambas y una resolución de aclaración. La hoja identifica el dato,
no una fase ya elegida; no se permite una acción ni selección de Maps que la
suponga. Edición pregunta por esa elección explícita; guiado conserva la
prioridad de su paso vigente. La continuación de un control verificado descarta
aclaraciones antiguas y las preguntas de nombres distinguen primera/segunda
persona.

Ante una negativa breve e inequívoca a la pregunta vigente de incluir Dress Code,
el service exige `event.set_dress_code(false)` y utiliza la reparación semántica
acotada si el modelo sólo posterga u omite el cambio. La comprobación requiere
modo guiado, el paso de visibilidad pendiente y la última pregunta compatible;
no interpreta «no sé» o «después» como exclusión. Desactivar conserva el texto
normalizado existente, incluso si su procedencia de plantilla lo oculta al
modelo: se normaliza el argumento de la acción ya validada antes de ejecutarla,
respetando cambios anteriores del mismo lote. La confirmación visible sigue
dependiendo del owner, el guardado y sus receipts.

Aceptar incluir Dress Code sin aportar texto usa la resolución existente
`event.dress_code.value:needs_clarification`, sin action de contenido, junto con
`clarification:{leafId:"event.dress_code.value",kind:"missing_value"}`. El ledger
elige `dress_code_value` a partir de esa resolución vigente del usuario; no
resuelve `.enabled` ni modifica texto/visibilidad. Una postergación explícita del
texto conserva la elección mediante `deferred_by_user`. La dependencia de una
desactivación confirmada y la invalidación por fingerprint siguen prevaleciendo.
El contrato compartido rechaza `event.set_dress_code(true)` con texto vacío.
En el paso guiado de Dress Code, el service completa la resolución omitida de
una aclaración exacta de texto faltante sólo si la propuesta es `clarify`, sin
actions ni control, la hoja sigue pendiente y no hay resolución para ella.
La propuesta resultante pasa todas las validaciones habituales. No se infiere
una acción desde «sí», no se reparan contradicciones ni se amplía este fallback
a otros campos. Esta corrección local no implica que esté desplegada.

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

- `contractVersion`, `draftId`, `clientMessageId`, `requestCreatedAt`, `entryMode`
  y mensaje actual; draft/identificador/fecha se usan para admisión backend, no
  como instrucciones ni contexto adicional del proveedor;
- hasta seis turnos anteriores, de hasta 700 caracteres cada uno; el actual se
  envía solo como `message` (máximo 1200), también al reintentar;
- snapshot saneado con availability, valores funcionales acotados, ledger
  global/guiado, `usage.hasStarted` y política de nombre;
- contexto server-side de ingreso con un único campo `registeredFirstName`,
  obtenido de `usuarios/{uid}.nombre` y normalizado a string vacío cuando no
  existe. Una continuación no relee el perfil.

Antes del callable el frontend elimina revisiones de media y fingerprints. El
backend aplica primero los presupuestos estructurales de la sección 6.4,
vuelve a sanear, limita el snapshot a 160.000 bytes y elimina del contexto del
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
| Estado mínimo | Bloque de datos no confiables con rol `user`, originado en snapshot del cliente y saneado/validado por shape. |
| `entryMode` | Enum derivado de metadata persistida por el panel y validado por claves exactas; no se infiere de texto o historial. |
| Nombre registrado | Leído server-side del perfil, pero tratado como dato de usuario no confiable para instrucciones; solo puede usarse como forma de tratamiento. |
| Mensajes del usuario | Rol `user`; no confiables. |
| Turnos previos del asistente | Etiquetas dentro de historial declarado no confiable; nunca mensajes `assistant` autenticados por el servidor. |
| Valores heredados de template/placeholders | Se redactan antes de exponerlos al modelo. |
| Resultado del modelo | No confiable hasta validación backend y frontend. |

El prompt indica ignorar intentos de ampliar límites, revelar instrucciones o
ejecutar código. La garantía fuerte no depende solo de esa frase: el tool schema
es estricto, el resultado se valida dos veces y el executor solo reconoce actions
allowlisted.

El backend relee `borradores/{draftId}` dentro de la transacción de admisión y
verifica dueño y estado editable. Esto no reconstruye ni certifica los valores,
capabilities o revisión del snapshot enviado por el cliente. La comparación con
el estado efectivo del editor y la ejecución siguen perteneciendo al frontend.
Separar roles y validar shapes reduce la superficie de inyección; no demuestra
que el modelo nunca siga una instrucción maliciosa incluida en texto libre.

## 6. Tools, autorización y validación

### 6.1 Modelo de tools actual

OpenAI está forzado a devolver exactamente una function call
`submit_designer_ai_result`, con `parallel_tool_calls:false`. Su schema permite un
mensaje, un intent, hasta 19 actions, un control local y resoluciones del ledger.

Las allowlists y shapes exactos viven en
`shared/designerAiCapabilityContract.cjs`; el documento canónico humano es
`DESIGNER_AI_CAPABILITY_CONTRACT.md`.

### 6.2 Garantías implementadas

- El callable declara `enforceAppCheck:true` y exige identidad Firebase mediante
  `requireDesignerAiIdentity`, sin cuentas anónimas ni bypass por rol. Una cuenta
  con contraseña requiere email verificado salvo la excepción existente de
  identidad Google vinculada. El estado de activación web se registra en 6.4.
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
- El backend verifica ownership y estado editable del draft; no certifica la
  revisión ni los valores concretos del snapshot cliente.
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
- `batchId` se deduplica en memoria dentro del panel. La admisión backend sí
  deduplica solicitudes de proveedor de forma durable; no convierte las
  mutaciones del editor en una transacción ni en ejecución exactamente una vez.
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

<a id="designer-ai-admission"></a>

### 6.4 Admisión y frontera de seguridad — 2026-10-07

Decisión aceptada: implementar el plan de seguridad solicitado el 2026-10-07.
Estado: código implementado; la evidencia local histórica está en la sección 16
y la decisión comercial y verificación operativa actuales en la sección 18.

`DESIGNER_AI_REQUEST_LIMITS`, en el contrato compartido, es el owner de los
presupuestos técnicos: envelope de 256 KiB, profundidad 16, 16.384 nodos,
700 elementos por array como máximo global, 64 claves por objeto y 4.000 unidades
UTF-16 por string. El snapshot normalizado conserva el límite de 160.000 bytes.
Las colecciones conocidas tienen límites menores: 20 Galleries, 24 slots por
Gallery, 20 preguntas y 20 opciones por pregunta; hasta 700 leaves/IDs guiados.
El mensaje actual admite 1.200 caracteres y el historial seis turnos de 700.
Son defensas técnicas, no cuotas comerciales de uso.

El wrapper inspecciona tamaño bruto y estructura iterativamente antes del
decoder Firebase. Rechaza claves `__proto__`, `prototype`, `constructor` y
`@type`; esas palabras como valores no se prohíben. Las llamadas directas al
servicio también rechazan ciclos, accesores, prototipos ajenos, coerciones y
tipos incompatibles. Los campos desconocidos acotados del snapshot conservan
su descarte por la proyección existente. Arrays se acotan antes de procesarse;
los IDs guiados se deduplican con `Set`. Un envelope rechazado se reemplaza por
uno vacío para que el SDK produzca su error y CORS habituales sin decodificar
ni registrar el contenido original. El parser HTTP anterior sigue perteneciendo
al framework; estas barreras no son una garantía sobre ese parser.

App Check usa el enforcement del callable y **reCAPTCHA Enterprise** en web.
La preparación remota del 2026-10-07 habilitó las APIs y configuró el proveedor
Enterprise SCORE, tres dominios de producción, umbral 0,5 y TTL de tokens de
3.600 segundos. La clave pública restringida vive en
`src/config/initializeFirebaseAppCheck.js`; no es un secret del modelo.
La inicialización local está implementada antes de obtener servicios Firebase,
con renovación automática y caché por app/HMR; omite SSR y emuladores.
El 2026-10-09 los logs de la revisión productiva `designeraichat-00045-yob`
registraron verificaciones `app:VALID` y `auth:VALID`, además de rechazos posteriores
por admisión `disabled`. Esto acredita aceptación de App Check en esa revisión;
no es una prueba de navegador autenticada ejecutada durante esta activación.
App Check complementa identidad, ownership y cuotas; no sustituye
ninguno ni demuestra que una persona autorizada tenga buenas intenciones.

La reserva de `admissionStore.ts` es una transacción Firestore que lee política,
draft, petición y contadores. Exige `draft.userId === uid`, excluye el workspace
legacy de plantilla y exige el estado `ACTIVE` del owner canónico de lifecycle. La política server-side
`designerAiUsage/config` habilita el servicio y aporta modelo, versión, tasas de
costo, límites por UID/minuto/día y presupuesto global diario. Una configuración
ausente, deshabilitada, inválida o de otro modelo impide la llamada al proveedor;
un fallo contable no abre una vía alternativa. También las aperturas sin modelo
pasan por ownership, política y cuotas, con reserva monetaria cero.

Cada UID puede tener una solicitud activa. La lease dura 120 segundos; liberarla
por vencimiento no reintegra costo incierto. Los contadores usan ventanas de
minuto y día **UTC** calculadas por el servidor, también al reintentar una
transacción. La solicitud acepta antigüedad máxima de diez minutos y un minuto
de tolerancia futura; no confía en la fecha del cliente para crear ventanas.

La clave idempotente combina UID y `clientMessageId` mediante SHA-256; el registro
liga también digest del payload, `requestCreatedAt` y draft. Repetir un ID con
otra carga es conflicto. Una petición activa, completada o con resultado
desconocido no vuelve a despacharse automáticamente, incluso tras vencer la
lease. No se guarda ni reproduce el mensaje del modelo como respuesta cacheada.

Antes del proveedor se reserva un techo calculado server-side para el máximo de
tres intentos: llamada inicial, un retry de transporte global y una reparación.
El costo se expresa en microUSD y redondea hacia arriba con enteros; precios y
modelo pertenecen a la política versionada. Sólo se reduce la reserva cuando
hay usage válido de **todos** los intentos despachados. Timeout, caída o resultado
incierto conservan el techo reservado. La liquidación es idempotente y libera
concurrencia; no devuelve un costo incierto por una expiración. Es contabilidad
interna de consumo del proveedor, no un cobro nuevo al usuario del producto.

La tarifa de referencia conservadora revisada el 2026-10-07 y revalidada el
2026-10-09 para `gpt-5.6-luna`
es USD 0,50 por millón de tokens de entrada y USD 1,80 por millón de salida
(`500000` y `1800000` microUSD por millón). Cubre los precios publicados de
contexto largo/escritura de caché; puede sobreestimar la factura real y debe
revisarse al cambiar modelo o tarifas. Fuente: [ficha oficial del modelo](https://developers.openai.com/api/docs/models/gpt-5.6-luna).

**Decisión comercial aceptada — 2026-10-09:** el usuario aprobó USD 5 globales
por día, 100 solicitudes por usuario/día y 10 por usuario/minuto. Reemplaza la
propuesta anterior de USD 10 diarios, que no se había aplicado. Se conserva una
solicitud activa por usuario. El presupuesto aprobado es `5000000` microUSD;
la política versionada es `assistant-security-20261009-v1`. Las aperturas sin
modelo también cuentan como solicitudes. Las ventanas siguen siendo UTC: el
presupuesto diario se reinicia a las 21:00 de Argentina. Este límite contabiliza
consumo del modelo, no costos de Firestore, Functions ni reCAPTCHA.
La activación exige política aprobada, precios/modelo vigentes y App Check
verificado; su resultado y límites de verificación se registran en la sección 18.
El payload concreto está en
`.local-isolation/assistant-activation-20261009/policy.json`.
El schema, unidades y retención viven en [DATA_MODEL](DATA_MODEL.md); la
denegación del canal cliente pertenece a [Security Contract](../contracts/SECURITY_CONTRACT.md).

## 7. Streaming, concurrencia, cancelación y obsolescencia

| Tema | Estado actual |
| --- | --- |
| Streaming de respuesta | No implementado. `responses.create` retorna completo y el callable responde al final. |
| Progreso | `Preparando la respuesta…` mientras se espera el resultado; luego `designerAiExecutionFeedback` describe la acción validada que informa el executor (nombres, fecha, horario, ubicación, etc.) durante su aplicación y persistencia. El panel conserva `Guardando…` para la metadata final. El progreso se publica también en live region y no confirma éxito antes del receipt. No hay tokens parciales ni job durable. |
| Concurrencia por panel | `sendingRef` impide un segundo envío mientras hay uno pendiente; el textarea permite escribir el mensaje siguiente y los reintentos no lo borran. |
| Concurrencia por UID | Reserva transaccional con una solicitud activa y lease; cubre múltiples pestañas/instancias del servicio. |
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
- El backend liga `clientMessageId` al UID y al digest de la solicitud para
  deduplicar el consumo del proveedor; no es un ID durable de conversación.
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

La contabilidad independiente `designerAiUsage` escribe `expiresAt` a siete días
para solicitudes y contadores; la configuración no expira. Ese campo no borra
documentos por sí solo: no acredita una política TTL activada ni un proceso de
limpieza desplegado. Su modelo y límites están en [DATA_MODEL](DATA_MODEL.md).
No se deben borrar reservas manualmente para permitir repetir una petición de
resultado desconocido.

## 9. Secretos, logs y privacidad

- Solo Functions importa `openai` y lee `defineSecret("OPENAI_API_KEY")`.
- El navegador no recibe el SDK server-side ni la clave.
- Requests a OpenAI usan `store:false` y no usan `previous_response_id`.
- Logs de éxito incluyen UID, trace ID, batch ID, latencia total del callable,
  intent, cantidad de actions, presencia de control, reparaciones y request ID
  de OpenAI cuando existe. Agregan `responseKind`, latencia del service, lectura
  del perfil y validación inicial, más las métricas numéricas de la sección 15.2.
- Logs de error incluyen UID, trace ID, latencia, clase/resumen seguro de error,
  métricas disponibles y request ID. `validationCode` identifica la etapa de
  rechazo mediante una allowlist estática, sin copiar el mensaje del validador.
  `failureReason` usa el resumen fijo de la
  categoría: un diagnóstico interno puede contener IDs dinámicos provenientes
  del cliente y no se registra. El fallo de perfil usa `profile_read_failed`,
  sin serializar la excepción Firestore.
- El código actual no registra prompt, mensajes, snapshot, valores funcionales,
  URLs privadas ni secret en esos eventos.
- `designerAiUsage` conserva hashes, estado, contadores, importes y tiempos,
  sin prompts, chat, snapshots ni respuestas del modelo. Sus hashes son
  identificadores seudónimos de operación, no una garantía de anonimato.

Gap: no existe un helper central de redacción para futuros logs del subsistema;
la seguridad depende de conservar el allowlist de campos de logging actual.
Tampoco existe redacción de PII/secrets en el texto libre antes de enviarlo al
proveedor; este límite debe considerarse al definir la política de privacidad.

## 10. Fallbacks, reintentos y rate limits

### 10.1 Implementado

- `deadline.ts` limita el trabajo a 37 segundos desde el inicio del callable:
  admisión, lectura mínima del perfil (máximo 3 s, fallback vacío), request,
  un retry de transporte total y una reparación. Reserva los últimos 3 s del
  presupuesto total de 40 s para liquidación, con intentos acotados y consumo
  conocido conservado aunque falle el primer cierre. Los errores de deadline
  de admisión y liquidación también se presentan como timeout. El callable
  conserva 45 s, con margen de 5 s. Cada intento del proveedor recibe
  `min(25 s, tiempo restante de trabajo)`, señal de abort y
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
- Admisión transaccional aplica cuotas por UID y presupuesto global antes del
  proveedor, con reserva conservadora y bloqueo de duplicados; ver 6.4.
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
- `designerAiExecutionFeedback` detalla campo y valor bancario guardado desde
  `snapshot.values.gifts.methods`, únicamente con receipt vigente verificado por
  `matchesDesignerAiActionEvidence`. El mismo formatter se usa en guiado,
  edición y resultados parciales; progreso, datos ocultos y cambios sin guardado
  conservan feedback sin valores. Regresión:
  `designerAiExecutionFeedback.test.mjs` y `designerAiBankConfirmation.test.mjs`.
  Implementación local del 2026-10-08, posterior a la release de la sección 17;
  esta mejora todavía no se declara desplegada.
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
- No hay un rate limit adicional por IP ni por draft, ni dashboard de costo.
  La política por UID/global fue aprobada explícitamente el 2026-10-09; su estado
  operativo está en la sección 18. La implementación no habilita cuotas implícitas.

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
| Autorización del callable | Implementada; App Check observado en producción | Identidad no anónima, verificación de email aplicable y ownership/estado; sin bypass administrativo. Logs de la revisión `00045-yob` registran App Check y auth válidos el 2026-10-09. No equivale a una prueba autenticada de navegador de extremo a extremo; ver sección 18. |
| Autorización server-side de cada tool | No implementado | Tools se ejecutan en cliente; backend solo valida propuesta. |
| Validación estructural backend/frontend | Implementado | Contrato compartido y validadores. |
| Desfase de versión frontend/backend | Implementado y testeado | Antes de validar el payload, cualquier `contractVersion` no vacía distinta de la vigente recibe una respuesta segura que conserva la versión del cliente y solicita recarga; no llega a OpenAI ni se presenta como mensaje inválido. |
| Validación contra draft server-side | Parcial | Transacción relee dueño y lifecycle; valores/capabilities/revisión del snapshot siguen originándose en cliente. |
| Contexto mínimo sin media/geometría | Implementado y testeado | Sanitizer + payload builder + service tests. |
| Minimización por necesidad del turno | Parcial | El shape es acotado, pero se envían todos los valores allowlisted del snapshot. |
| Redacción de texto libre antes de OpenAI | Parcial | Los valores bancarios conocidos ocultos/desactivados se redactan en el historial original antes del límite de longitud. El mensaje actual explícito queda fuera de esa minimización; no hay DLP general. |
| Separación de contenido no confiable | Implementada en composición; límite semántico pendiente | Único developer estático; snapshot/historial como datos user, sin roles assistant fabricables. No acredita inmunidad a prompt injection ni clasificación infalible de alcance. |
| Aprobación de listas externas de Regalos | Implementado localmente | Propuesta local del lote completo y aprobación efímera ligada a sesión/contexto para URL. Los bancos se gestionan por chat, sin adoptar defaults; ver capability contract 8.3 y sección 21. |
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
| Keys personalizadas de ubicación y horarios | Corregido y desplegado 2026-10-09 | Lectores y writers usan el binding real del rol. Snapshot y procedencia consumen esas mismas claves; las regresiones verifican ida/vuelta y restauración de defaults. Ver cierre de la auditoría conversacional al final de este documento. |
| Regalos con valor/visibilidad independientes y lista externa | Implementado en dominio/capability | Root normalizada, flags por método, URL externa, actions y validación de readiness existentes. |
| Recorrido guiado interno de Regalos | Hardening P0 implementado y testeado | Usa métodos visibles confirmados, oculta defaults no elegidos conservando datos y excluye intro/botón de la completitud. Alias solo, lista externa y combinación se prueban contra las actions existentes, sin estado de modalidad adicional. |
| Portada y múltiples Galleries por disponibilidad real | Implementado en orquestación/control | Portada conserva evidencia por fingerprint. Cada Gallery con slots aporta una hoja durable, respeta el orden del snapshot y avanza solo por finalización explícita; cambios y cierre del control no completan. |
| Cierre único + edición + `Ver vista previa` | Implementado y verificado localmente, incluida recarga | Transición verificada, `usage.guidedFlowCompleted` monotónico por documento y callback de preview existente. Reabrir o resolver pendientes después del cierre conserva edición y no repite el cierre. |
| Retención de `designerAiConversation` | Inferido | Sigue al draft por ubicación del campo, sin política aprobada propia. |
| Retención de contabilidad AI | TTL activo; limpieza efectiva no verificada | `expiresAt` técnico de siete días; TTL `ACTIVE` revalidado en producción el 2026-10-09. No se verificó una eliminación concreta ni cambia la retención del ledger/chat. |
| Streaming/cancelación real | No implementado | Respuesta completa y descarte local. |
| Prevención de respuesta obsoleta | Implementado en cliente | Session sequence + revision check. |
| Idempotencia durable del proveedor | Implementado localmente | UID + clientMessageId + digest/fecha; duplicados activos/completados/desconocidos no redespatchan. Batch del editor sigue deduplicado en memoria. |
| Reintentos | Parcial | Un retry de transporte controlado por el service (`maxRetries:0` en SDK), una reparación semántica y continuación verificada. Un lote parcial puede reanudarse en la sesión actual: valida identidad y estado, salta efectos confirmados y reintenta su writer cuando corresponde. Esa recuperación de mutaciones no es idempotencia durable; nueva intención y desmontaje la invalidan. |
| Rate limit y presupuesto propios | Implementados; política activada | Transacciones por UID/minuto/día, una lease activa y reserva global diaria. Valores aceptados y configuración creada/verificada el 2026-10-09; no se ejecutó una prueba autenticada posterior a la activación. Ver sección 18. |
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

En la medición del 2026-10-06 persistían estos límites: sin idempotencia durable
del backend ni cuota propia (implementadas después, sección 16), sin cancelación del callable desde el cliente y sin
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

<a id="assistant-security-20261007"></a>

## 16. Seguridad del Asistente — implementación y release parcial del 2026-10-07

Alcance autorizado: endurecer la entrada, admisión/costo, confianza del contexto y
confirmación de destinos de Regalos. No agrega capacidades del modelo ni un
cobro al usuario. La versión de protocolo pasa a `2.5.0`; un cliente incompatible
que supera App Check recibe recarga segura sin consumo de proveedor. Una pestaña
anterior sin App Check puede ser rechazada antes de esa respuesta y requiere
recarga manual. El ledger conserva versión 4.

Cambios implementados y owners:

- `requestBoundary.ts` y el contrato compartido cierran el recorrido recursivo
  sin límites y el procesamiento de arrays antes del recorte. Conservan el
  protocolo/error/CORS del callable y su metadata de descubrimiento.
- `admission.ts`/`admissionStore.ts` agregan ownership/estado, elegibilidad de
  identidad, cuotas configurables, reserva conservadora, lease y deduplicación
  durable. `firestore.rules` deniega la colección y descendientes al cliente,
  además de excluirlos del fallback. La política comercial pendiente está en 6.4.
- `service.ts` mantiene únicamente instrucciones estáticas como `developer` y
  serializa snapshot/historial como datos no confiables. Una respuesta clasificada
  `out_of_scope` usa copy determinista sin actions; esto no garantiza una
  clasificación semántica infalible ni sustituye evaluaciones con modelo real.
- `designerAiGiftApproval.js` y la UI local muestran efectos sobre destinos
  sensibles antes de ejecutar el lote. El executor exige una aprobación vigente
  y de un uso; la regla normativa está en capability contract, sección 8.3.
- La inicialización Enterprise/App Check está implementada en navegador de
  producción. La configuración remota del proveedor está preparada según 6.4;
  enforcement de la nueva función y cliente aún no se declaran desplegados aquí.

Evidencia ejecutada durante esta etapa, sin invocaciones al modelo real:

| Verificación | Resultado y alcance |
| --- | --- |
| `node --test shared/designerAiRequestBoundary.test.mjs shared/designerAiCapabilityContract.test.mjs shared/designerAiConversationLedger.test.mjs shared/designerAiResolutionRules.test.mjs shared/designerAiDeferrals.test.mjs` | 119 aprobadas. Incluye 3.000 niveles, arrays sobredimensionados, claves peligrosas, accesores, Unicode y límites de colecciones. |
| `node --test functions/designerAiRequestBoundary.test.mjs` | 3 aprobadas contra SDK real y HTTP en loopback. Metadata/`.run`, CORS permitido y distinto origen, errores previos al decoder, auth malformado y App Check faltante. No prueba un token Enterprise real. |
| TypeScript aislado de `requestBoundary.ts`; lint de los siete archivos de esa frontera | Cero diagnósticos TS; cero errores de lint y un warning preexistente por `sanitizeCapabilityIdList`. No equivale a lint completo del proyecto. |
| `node --test scripts/local/environment.test.mjs src/config/initializeFirebaseAppCheck.test.mjs src/firebaseInitializationContract.test.mjs` | 14 aprobadas; caché/HMR, orden, SSR y emuladores. |
| `npm --prefix functions run build` | Aprobado durante la integración local; genera copias y compilación, no despliega. |
| `npm --prefix functions run lint -- --report .local-isolation/assistant-security-lint.json` | 283 archivos; cero errores y 234 advertencias existentes. Sin autofix ni exclusiones nuevas. |
| Suites `functions/designerAi{Service,Dates,ResolutionSchema,RequestBoundary,Admission}.test.mjs` | 188 aprobadas; proveedor simulado y HTTP del SDK en loopback. Los cuatro casos nuevos de contexto/perfil, alcance, techo y tipos se repitieron y aprobaron. |
| `functions/designerAiAuthorization.test.mjs` | 14 aprobadas contra el export compilado; admisión anterior al proveedor y errores seguros. |
| Ownership de Functions | Tres codebases compiladas; 41/41 tests y discovery real del CLI con su límite original de 10 s. Default: 102 endpoints/6,60 s; payments: tres/4,07 s; email: tres/3,30 s. Evidencia: `.local-isolation/assistant-security/ownership-final-yP6q9W/` y `ownership-final-fguzQJ/`. |
| Reglas y transacciones contra Firestore Emulator real | 101 aprobadas: 99 denegaciones AI1, un control positivo y una prueba de carreras/reserva/replay/presupuesto. Alcance focal; no equivale al runner completo de Rules. Evidencia: `.local-isolation/assistant-security-rules/focal-session/`. |
| Confirmación de Regalos y regresiones del panel/executor | Suites de dominio, executor y UI aprobadas; la suite final de confirmación aprobó sus ocho casos. Incluyen lote completo, callbacks obsoletos, cambios de revisión, aprobación de un uso y cancelación. |
| Revisión visual de la confirmación | Fixture SSR del componente final con CSS exportado de producción, navegador CUA en 320×720, 390×844 y 1280×800: sin overflow horizontal y botones de 44 px. Verifica layout; interacción cubierta por las suites. Evidencia: `.local-isolation/assistant-security/gift-confirmation-visual/measurements-cua.json`. |
| Build/export Next y retención estática | Aprobados; build `dQVl7VR0Mfdo9Rsdxkesn`, tres builds retenidos y 29 assets restaurados. Verificación local: 42 referencias HTML, tres manifests, 102 referencias de manifests y 92 archivos estáticos. No está publicado. |

Preparación remota comprobada: `designerAiUsage.expiresAt` tiene TTL `ACTIVE`;
los documentos técnicos nuevos asignan siete días y config no contiene expiración.
El GET de `designerAiUsage/config` devolvió 404: todavía no se habilitó una política.
El manifest local hace explícito `maxInstances: 100`, conservando el valor observado
en producción; la firma del registro cambia sólo por esa opción. App Check se
enforcea en el SDK y no aparece como opción en el wire manifest de esta versión.

Despliegue parcial autorizado: se publicaron únicamente las reglas Firestore.
La comparación previa confirmó que las reglas remotas coincidían con Git HEAD;
la comparación posterior confirmó coincidencia con el archivo local nuevo.
Ruleset `0c9c8245-acd3-4770-a6d9-b2335a709a8a`, actualizado a las
`2026-10-08T00:08:17.326190Z` (7 de octubre en Argentina); SHA-256 del texto
normalizado `df9f0b8fc137f5877728700f40408f9d3219c90c400c09fa39706596f63a35d4`.
Readback: `.local-isolation/assistant-security/rules-release.json`.

Incidencias y límites de la evidencia: el runner completo de Rules agotó su
espera al iniciar el CLI de emuladores; otro intento quedó sin espacio al copiar
el workspace. La prueba focal posterior usó el JAR fijado, identidad demo,
credenciales limpias y red externa bloqueada, y verificó cleanup. No se declara
aprobado el runner completo. El build Next inicial también falló por espacio;
pasó después de limpiar únicamente cachés regenerables y copias fallidas propias.
La primera integración de Functions detectó fuentes cambiantes durante build;
se repitió una vez finalizadas las ediciones y pasó.
El último build de backend también aprobó y comprobó sus 72 copias compartidas:
`.local-isolation/assistant-security/final-backend-build.log`.
Ownership conservó los timeouts iniciales de JSDOM y del discovery de payments;
ambos pasaron al repetir sin cambiar fuentes, expectativas ni límites. No se
demostró la causa exacta de esos timeouts. Las tres discoveries finales y los
41 tests se ejecutaron con credenciales limpias y red externa bloqueada.

Functions y Hosting de esta etapa todavía no se publicaron. Los límites
comerciales siguen pendientes de respuesta del usuario, sin valores inferidos.
También falta la prueba positiva de App Check: dos intentos de navegador aislado
agotaron su arranque antes de invocar `getToken` (cero solicitudes de token).
Eso no verifica ni refuta el proveedor configurado. Evidencia:
`.local-isolation/assistant-security/appcheck-live-verification.json`.
El rollout restante requiere política aprobada, cliente primero y token real
verificado antes de activar enforcement del callable. El asistente anterior
continúa en producción mientras se resuelven estos puntos.

## 17. Ubicación manual y negativa a Dress Code — deploy del 2026-10-08

Despliegue autorizado y verificado de las dos correcciones de conversación:
la elección manual continúa desde el snapshot persistido y conserva la decisión
de no usar Maps; una negativa inequívoca a incluir Dress Code exige la acción
de desactivarlo, en lugar de tratarla como postergación. El texto oculto del
template se conserva. Los casos ambiguos y las postergaciones explícitas no
se convierten en negativas.

La release se preparó en una copia aislada de
`54a822d927d2139cd4b87c7c79a1f6b0987674ba`, con sólo los cambios de runtime en
`DesignerAiPanel.jsx`, `designerAiConversationLedger.cjs` y `service.ts`, sus
regresiones y caché de webpack deshabilitada para ese build aislado. Se mantuvo
el protocolo productivo `2.4.0`. Los cambios pendientes de seguridad, admisión,
App Check y confirmación de Regalos de la sección 16 quedaron fuera.

Resultado remoto:

- `designerAiChat` ACTIVE en `designeraichat-00044-voy`; selector exclusivo
  `functions:default:designerAiChat`. Inventario de 108 Functions: sólo cambió
  esa función. No se desplegaron Rules, pagos ni email.
- Hosting `TWHaPEncmR1X-Hywb7f-T`, con assets de la versión anterior retenidos.
  Dashboard verificado, 117 archivos estáticos disponibles con caché inmutable
  y SHA-256 de los 118 contenidos (dashboard más estáticos) idénticos al build.
- Configuración propia, binding del secreto y opciones de runtime preservados.
  El CLI omitió la variable administrada `FUNCTION_SIGNATURE_TYPE=http` que
  tenía la revisión previa; se compararon ambas revisiones en memoria y todas
  las demás variables coinciden. El callable nuevo respondió 401
  `UNAUTHENTICATED` al POST anónimo. No se invocó el modelo real ni se editaron
  borradores durante la verificación.

Verificaciones locales: build de Functions y sus 72 copias, build/export Next,
retención y verificación estática aprobados; lint sin errores y 234 advertencias
existentes. Se verificaron 622 casos del asistente: la primera ejecución tuvo
621 aprobados y un caso `missing-secret` interceptado por el modo emulador;
su suite completa pasó 145/145 al usar modo producción con credenciales vacías
y red externa bloqueada, sin modificar fuentes ni expectativas.

El gate completo de ownership **no se declara aprobado**: tres builds y 41
tests pasaron; discovery de default (102 endpoints) y payments (tres) pasó.
Discovery de email agotó su límite original de 10 segundos dos veces; no se
determinó la causa. Email y su ownership permanecen idénticos al baseline y
fuera del selector desplegado. La validación del target del asistente quedó
registrada separadamente. Se conservaron también el primer timeout de default
y las verificaciones interrumpidas durante una pausa prolongada del entorno.

Evidencia reproducible en
`.local-isolation/assistant-response-release-20261007/`: `source-manifest.json`,
`output-manifest.json`, `assistant-tests-summary.json`,
`ownership-target-result.json`, `revision-environment-comparison.json`,
`backend-smoke.json`, `hosting-content-verification.json` y `release-result.json`.
`verify-build.cjs`, `resolve-test-environment.cjs`, `verify-target-ownership.cjs`
y `verify-backend-after-deploy.cjs` conservan los comandos y guards utilizados;
`deploy.cjs` registra ambos selectores y rechaza repetir un intento sin revisión.

<a id="assistant-activation-20261009"></a>

## 18. Política de uso y activación — 2026-10-09

**Decisión aceptada:** completar la configuración faltante con los valores
aprobados en 6.4. Alcance operativo: exclusivamente
`projects/reservaeldia-7a440/databases/(default)/documents/designerAiUsage/config`.
No requiere desplegar Functions ni Hosting: cada admisión relee esa política.

**Hechos previos a la escritura:** la inspección de solo lectura de las
`2026-10-09T16:07:45.674Z` encontró `designerAiChat` `ACTIVE`, revisión
`designeraichat-00045-yob`, actualizada a `2026-10-09T03:56:06.055266047Z`.
El documento de configuración devolvió 404. Los logs de esa revisión registraron
`app:VALID` y `auth:VALID`, además de rechazos `disabled`: la configuración ausente
bloqueaba incluso el saludo automático antes del modelo. El TTL de
`designerAiUsage.expiresAt` estaba `ACTIVE` y el texto de las Rules publicadas
coincidía con `firestore.rules` local. Esto actualiza el estado observado después
de las secciones históricas 16 y 17; no certifica todos los cambios de un deploy
general ni la funcionalidad completa del asistente.

**Activación verificada:** el payload aprobado tiene nueve campos,
`enabled:true`, modelo `gpt-5.6-luna` y versión
`assistant-security-20261009-v1`. Se validó contra el parser de la fuente actual
y el modelo del servicio. La creación devolvió HTTP 200, sin respuesta incierta;
un GET independiente confirmó igualdad exacta de los nueve campos. Firestore
registró `createTime` y `updateTime` `2026-10-09T16:14:47.839384Z`
(13:14:47 de Argentina). La revisión `designeraichat-00045-yob` se conservó.
El SHA-256 del payload serializado es
`91bd59c99ca4698621c2c2686994ab32d47fa6c684c05524a06cfd8f11bb3a87`.

La operación verificó revisión activa y ausencia antes de crear, y sólo podía
crear el documento ausente, sin sobrescribir uno existente. No hubo deploy,
edición de borradores ni llamadas al proveedor. El guard conserva el intento
y exige inspección ante resultados inciertos, sin repetir automáticamente la
escritura. El rollback preparado, no ejecutado, cambia sólo `enabled:false`
con precondición sobre el `updateTime` registrado; preserva contadores y reservas
y no cancela solicitudes ya admitidas.

**Límites:** esta operación no ejecuta una prueba autenticada en navegador ni
una llamada al modelo real. Los logs positivos de App Check son evidencia remota
preexistente. El panel conserva la burbuja de error al cerrarse y reabrirse;
una recarga completa permite solicitar de nuevo el saludo con la política vigente.

Evidencia local en `.local-isolation/assistant-activation-20261009/`:
`inspection.json`, `policy.json`, `approval.json`, `before-apply.json`,
`create-attempt.json` y `activation-receipt.json`; procedimientos
`validate-policy.cjs`, `inspect.cjs`, `activate.cjs` y `rollback.cjs`.
No contienen tokens ni contenido del chat. El timestamp de creación citado es
el del servidor; `verifiedAt` usa el reloj local y presenta un desfase menor.

## 19. Afirmativa a Dress Code sin texto — corrección local del 2026-10-09

Estado inicial: implementado localmente, sin deploy; incluido posteriormente en
la release de la sección 20. La elección pendiente pide el texto mediante
el ledger, conserva contenido/visibilidad y sobrevive a recarga. El service
recupera la resolución omitida de una aclaración válida de Dress Code, sin
acciones ni control; el contrato rechaza habilitar con texto vacío. Los errores
registran una categoría `validationCode` fija, sin contenido de la conversación.

Verificación ejecutada con proveedor e I/O del editor simulados:

- Suite de Assistant en `shared`, `functions`, `src/domain/editor` y
  `src/components/editor/designerAi`: **695/696**. Se excluyeron las suites
  `designerAiAdmission` y `designerAiRequestBoundary`, fuera del cambio.
  Las nuevas pruebas de Dress Code pasan, incluidas recarga, postergación,
  rechazo posterior, datos heredados y fallo al persistir metadata.
- La única falla es `designerAiConversationRegression.test.mjs:48`, variante
  con lista de Regalos. Se reprodujo con ledger, capability contract y service
  de `HEAD` cargados en memoria: **4/5** en esa suite. La fixture omite aceptar
  el diálogo obligatorio de Regalos; no se modificó su expectativa ni ese flujo.
- `npm.cmd --prefix functions run build`: aprobado, **72 copias** coherentes.
  Lint: **285 archivos, 0 errores, 234 advertencias**; `git diff --check` sin errores.
- Ownership: tres builds y **41/41 pruebas** aprobados; discovery de Payments y
  Email aprobado. **El gate completo no pasa**: discovery de `default` agota
  sus 10 segundos, también al repetirlo sin otras verificaciones en paralelo.
  No se amplió el timeout. Las 389 fuentes/configuraciones de la copia aislada
  coinciden con el árbol actual antes y después de las comprobaciones.

Evidencia local: `.local-isolation/dress-code-tests-20261009.tap`,
`dress-code-lint-20261009.json`, `dress-code-ownership-20261009.log` y
`ownership-0URajF/discovery-{recheck,quiet}-result.json` bajo el mismo directorio.
No se probó el modelo real ni producción. El diagnóstico exacto de la salida
remota rechazada originalmente no estaba conservado en sus logs; la regresión
cubre el hueco reproducido, sin atribuirle un campo remoto no observado.

## 20. Robustez conversacional — implementación y release del 2026-10-09

Implementación y despliegue autorizados por el usuario tras la auditoría de ocho
defectos reproducidos localmente. Incluye la corrección de Dress Code de la
sección 19. No modifica la política de USD 5/día, 100 solicitudes por usuario/día
y 10 por minuto, revalidada contra el documento productivo antes de desplegar.

Correcciones en sus owners existentes:

| Defecto | Corrección y evidencia |
| --- | --- |
| RSVP confirma una activación descartada por límites | Snapshot/proyección conservan límites normalizados; validador comprueba capacidad en orden de ejecución y el receipt exige el `active` solicitado. `designerAiCapabilityContract.test.mjs`, `designerAiActionEvidence.test.mjs`. |
| Prosa de edición afirma guardados inexistentes o valores distintos | Feedback y continuación usan receipts y campos estructurados. Las regresiones del panel prueban cero escrituras ante una afirmación falsa y confirmación del horario realmente guardado. `designerAiVerifiedEditing.test.mjs`. |
| Regalos adopta valores heredados ocultos | El diálogo local existente exige aprobación para un método no confirmado seleccionado con `value:null`, incluidos Titular, Banco y CUIT; también cubre reintentos. `designerAiGiftApproval.test.mjs`, `designerAiVerifiedEditing.test.mjs`. |
| Fechas numéricas contradicen el parser | El service valida coherencia con la fecha numérica completa y usa su única reparación existente. No inventa una fecha válida para una imposible. `designerAiDates.test.mjs`. |
| Plantillas parciales ofrecen campos inexistentes | Disponibilidad por binding de fecha/inicio/fin; dependencias preservan `unavailable`; validación antes de ejecutar. `designerAiCapabilities.test.mjs`. |
| Texto legítimo se considera ejemplo después de guardarlo | Evidencia positiva, persistida y ligada al fingerprint prevalece sobre la heurística inicial. Incluye «Bodega Borgoña», recarga y controles negativos. `designerAiConversationLedger.test.mjs`. |
| Claves personalizadas pierden procedencia | Snapshot y lectores de horarios/ubicación usan los mismos bindings reales que los writers; restaurar defaults no los confirma por diferencia con el baseline. Tests de capabilities, time y location. |
| Deadline impide liquidar consumo conocido | Trabajo acotado a 37 s y cierre dentro de 40 s; telemetría conocida independiente del error posterior; liquidación idempotente y categoría timeout. `designerAiAuthorization.test.mjs`. |

El protocolo `2.6.0` también permite la aclaración estructurada `missing_phase`,
sin elegir ceremonia/fiesta ni abrir Maps antes de aclararla. Edición conserva
la pregunta correcta de primera/segunda persona y de fin de evento después de
una respuesta breve. Una continuación verificada de un control descarta preguntas
antiguas. Los clientes previos reciben el aviso seguro
`assistant_admission/client_update_required` antes de consumir cuota; su compositor
guiado podía ocultar un aviso enviado como prosa conversacional.

Verificación final local:

- **957 aprobadas, 0 fallos, 2 omitidas** en 959 pruebas: 477 de backend/shared
  con entorno de producción y red externa bloqueada, 480 de frontend con React
  de pruebas. Las dos omitidas requieren opt-in de Chromium para gestos de mapas,
  sin cambios en esta entrega. Incluye paridad preview/publish y render.
- Build de Functions y **72 copias** compartidas; build/export de Next y
  verificación estática aprobados. Lint: **285 archivos, 0 errores, 234 warnings**
  preexistentes. `git diff --check` aprobado.
- Ownership completo aprobado: tres builds, **41/41 pruebas**, discovery real
  de **102 default + 3 payments + 3 email**, sin cambiar timeouts del gate.
- Las ejecuciones iniciales conservaron los fallos de entorno: React `act` no
  existe en su bundle productivo, mientras render exige modo producción. La
  ejecución final separa ambos entornos. Se actualizaron fixtures de texto libre
  y la confirmación explícita de Regalos según los contratos, conservando las
  assertions de estado y persistencia.

Fuentes y outputs están fijados por SHA-256 en
`.local-isolation/assistant-conversation-release-20261009/`:
`source-manifest.json`, `output-manifest.json`, `checks.cjs`, resultados de build,
`backend-tests.log`, `frontend-tests.log`, `lint.json` y `ownership.log`.
Las pruebas usan proveedor e I/O sintéticos; no certifican la frecuencia de
errores de un modelo real.

Despliegue terminado y verificado a `2026-10-09T21:43:14.308Z`:

- `designerAiChat` ACTIVE en `designeraichat-00046-jos`; selector exclusivo
  `functions:default:designerAiChat`. Sólo cambió ese endpoint del inventario
  de 108, conservando opciones, configuración propia y binding del secreto.
- Hosting `IytliUncEZnnP0BE-0LXq`, con assets de la release previa retenidos.
  Dashboard y **74 estáticos** comprobados; SHA-256 de **75 contenidos** idéntico
  al build. Los contratos y la configuración de cuotas también se revalidaron.
- POST anónimo al callable rechazado con 401 `UNAUTHENTICATED`. No se ejecutaron
  conversaciones reales ni mutaciones de borradores en la comprobación remota.
- La CLI de backend terminó con exit 0. Su primera consulta posterior falló;
  `verify-backend.cjs` repitió sólo las lecturas y el smoke con éxito, antes de
  publicar Hosting. No se repitió el deploy del callable.

Evidencia: `deploy-backend-result.json`, `backend-smoke.json`,
`remote-after-backend.json`, `deploy-hosting-result.json`,
`remote-after-hosting.json`, `hosting-verification.json` y `release-result.json`
en el directorio de esta release. `deploy.cjs` verifica hashes y gates antes de
publicar, restringe los selectores y rechaza repetir un deploy sin revisar el
resultado anterior.

## 21. Ajuste del recorrido y confirmaciones por chat — 2026-10-09

Decisión aceptada por el usuario después de revisar ejemplos; implementación y
deploy solicitados explícitamente. Sustituye la revisión bancaria de la sección
20 y su feedback detallado habitual; conserva las demás correcciones de esa
release. El alcance comprende únicamente:

- Datos bancarios aportados: ejecución mediante los owners existentes, sin
  diálogo de aprobación, y confirmación de campo/valor guardado en el chat.
  `designerAiGiftApproval.js` conserva la revisión de listas externas y rechaza
  adoptar datos bancarios heredados con `value:null`: el Panel pide el valor sin
  mostrar defaults y conserva los demás cambios válidos. Ocultar implícitamente
  una URL de plantilla no confirmada al elegir datos bancarios tampoco abre el
  panel; una acción explícita sobre la lista o una URL confirmada conserva su
  revisión.
- Feedback no bancario breve, sin eco de valores ni listas automáticas por el
  tamaño del lote. Los receipts siguen siendo la evidencia interna; resúmenes
  solicitados y fallos parciales conservan la información necesaria.
- Fecha separada antes del horario. `designerAiConversationLedger.cjs` exige
  evidencia positiva; una fecha no vacía o un delta de baseline no acreditan
  elección del usuario. La comparación viva del binding también corrige una
  clasificación histórica de default como `existing_user_data`, sin migración
  ni borrado de datos. Conserva confirmaciones explícitas del mismo default,
  datos adelantados, postergaciones y disponibilidad real. Es un defecto
  reproducido localmente, no un diagnóstico remoto del borrador del usuario.
- Dress Code pregunta inclusión y texto en un solo turno. Valor directo o
  afirmativa con valor aplican juntos; negativa oculta y continúa; una afirmativa
  breve contextual pide el texto sin guardar «Sí» ni adoptar ejemplos.

Los contratos conversacional y de capacidades documentan estas decisiones.
Las regresiones viven junto a esos owners y en los tests del Panel; el nuevo
`shared/designerAiDateProvenance.test.mjs` cubre procedencia, reingreso y orden.
Evidencia de esta release en
`.local-isolation/assistant-chat-ux-release-20261009/`.

Verificación de la implementación final:

- **998 aprobadas, 0 fallos, 2 omitidas** en 1000 pruebas: 496 de backend/shared
  y 502 de frontend. Las dos omitidas requieren opt-in de Chromium para gestos
  de mapas, fuera de este cambio. Incluye los casos de URL heredada visible,
  banco incompleto, reintento y reingreso, y la paridad preview/publish y render.
- Build de Functions con **72 copias** compartidas y ownership completo
  aprobados: tres builds, **41/41 pruebas**, discovery de **102 default +
  3 payments + 3 email**, sin modificar los timeouts del gate.
- Lint: **285 archivos, 0 errores, 234 warnings** preexistentes.
  `git diff --check` aprobado. La comparación con la última release productiva
  limita las diferencias a siete archivos de runtime del asistente y sus tests.
- La primera suite de frontend detectó cuatro expectativas de tests anteriores
  al feedback breve/estado de control; se corrigieron conservando las assertions
  de persistencia. Después del ajuste de la URL heredada se ejecutó nuevamente
  la suite completa de frontend, con 502 aprobadas y ningún fallo. Los logs
  anteriores se conservan; no se suman repeticiones al total de pruebas.

`assistant-tests-result.json`, `backend-tests.log`, `frontend-tests.log`,
`ownership.log`, `lint.json`, `scope-verification.json` y `runtime-changes.diff`
contienen la evidencia. `backend-validation-continuity.json` compara las fuentes
de backend/shared con la copia del gate aprobado tras el último ajuste, limitado
al frontend. Las pruebas usan proveedor e I/O sintéticos; no certifican la
frecuencia de errores de un modelo real.

Despliegue terminado y verificado a `2026-10-10T01:23:38.772Z` (2026-10-09 en
Argentina):

- Build/export de Next y verificación estática aprobados; fuentes y output
  fijados por SHA-256 en `source-manifest.json` y `output-manifest.json`.
- `designerAiChat` ACTIVE en `designeraichat-00047-ner`, mediante el selector
  exclusivo `functions:default:designerAiChat`. Es el único endpoint modificado
  del inventario de 108; conserva opciones, entorno y binding del secreto.
- Hosting `K_kj99GRhhfxrXJvUrrNv` publicado y servido por el dominio productivo.
  Dashboard y **74 archivos estáticos** verificados; SHA-256 de **75 contenidos**
  coincide con el build. Se retienen los assets de la release previa.
- Configuración productiva revalidada: **USD 5/día, 100 solicitudes por usuario
  al día y 10 por minuto**, sin cambios. El callable rechaza el POST anónimo
  con 401 `UNAUTHENTICATED`. No se hicieron conversaciones reales con el modelo
  ni mutaciones de borradores en la comprobación remota.
- La CLI del backend terminó con exit 0. Falló una consulta posterior;
  `verify-backend.cjs` repitió únicamente las lecturas y el smoke, con éxito.
  No se repitió el despliegue de la función. Hosting y su verificación posterior
  terminaron correctamente en la misma ejecución.

Evidencia final: `deploy-backend-result.json`, `backend-smoke.json`,
`remote-after-backend.json`, `deploy-hosting-result.json`,
`remote-after-hosting.json`, `hosting-verification.json` y `release-result.json`
en el directorio de esta release. Estado: **implementado, desplegado y
verificado dentro del alcance aprobado**.
