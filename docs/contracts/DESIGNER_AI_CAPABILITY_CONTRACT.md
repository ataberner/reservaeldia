# Designer AI Capability Contract

Status: Canonical Contract.

## 1. Autoridad y alcance

Este documento es la autoridad normativa humana para:

- las capacidades operativas de `Diseñador AI`;
- la equivalencia con controles existentes de `Asistente`;
- las actions y controles confiables permitidos;
- la información y validaciones requeridas por cada familia de acción;
- el ledger de completitud, procedencia y dependencias;
- los límites y operaciones explícitamente fuera de alcance.

La autoridad ejecutable versionada es
`shared/designerAiCapabilityContract.cjs`. Si este documento, la copia de
Functions y el source compartido difieren, el source compartido y el código
vigente describen lo que el runtime realmente acepta; la discrepancia debe
corregirse en el mismo cambio.

Este documento **no** define voz, tono, saludo, idioma, longitud, emojis,
estructura de respuesta ni ejemplos de copy. Esas decisiones pertenecen a
[AI_ASSISTANT_CONVERSATION_CONTRACT.md](AI_ASSISTANT_CONVERSATION_CONTRACT.md).
La arquitectura, contexto, auth, persistencia y seguridad pertenecen a
[AI_ASSISTANT_SYSTEM.md](../architecture/AI_ASSISTANT_SYSTEM.md).

## 2. Invariante de producto

`Diseñador AI` es un adaptador conversacional, exclusivo para superadmins, sobre
capacidades ya expuestas por `Asistente`. No es una segunda autoridad del editor
ni una vía genérica al canvas.

```text
Asistente -> controles existentes -> valores disponibles
Diseñador AI -> actions allowlisted o controles locales -> esos mismos owners
```

Una capacidad solo existe para Designer AI cuando el snapshot vigente demuestra
que el control/binding equivalente está disponible. El prompt no puede ampliar
esta superficie. Que una capacidad quede fuera del interrogatorio proactivo no
la elimina: puede seguir disponible ante un pedido explícito. El conjunto de
capabilities y el conjunto de pendientes del recorrido guiado son contratos
relacionados, pero no idénticos.

V1 solo se monta en una sesión autenticada, editable, `draft`, no selector y con
rol superadmin. Los templates, vistas administrativas read-only y usuarios no
superadmin quedan fuera.

## 3. Fuentes de disponibilidad y owners

La navegación de `Asistente` se deriva de
`src/domain/editor/assistantMode.js` y
`src/domain/editor/assistantSubsteps.js`; `DashboardSidebar.jsx` monta los
controles reales en `MiniToolbar`.

Designer AI calcula su snapshot desde:

- nombre/metadata: `dashboardDocumentNameBridge` y `DashboardHeader`;
- render state: `editorSnapshotAdapter` y bridges de `CanvasEditor`;
- authoring fields/defaults/targets: `getTemplateAuthoringSnapshot`;
- portada: cover bridge existente;
- dominios: normalizadores de event details, RSVP, Gifts, Gallery y CTAs.

El borrador vigente es la fuente de verdad para valores. El ledger conserva
procedencia y decisiones, pero no reemplaza el dato efectivo ni su owner.

## 4. Inventario de capacidades V1

La tabla declara superficie y condición operativa. La semántica completa de cada
funcionalidad continúa en su documentación/código de dominio, según la sección 13.

### 4.1 Documento y evento

| Capacidad | Disponibilidad | Owner/mutación | Información o condición requerida |
| --- | --- | --- | --- |
| Nombre visible del borrador | Draft editable, nunca template | `document.set_name` -> document-name bridge/header | Nombre explícito o regla automática segura. |
| Nombres de las dos personas | Existen fields/bindings de personas | `event.set_people` -> `updateTemplateAuthoringEventPersonNames` | Ambos strings; se actualizan targets vinculados. |
| Modalidad | Siempre en draft V1 | `event.set_mode` -> `eventDetails.mode` | `single` o `ceremony_party`; inferencia solo inequívoca. |
| Fecha/inicio/fin de Ceremony | Binding de fecha o fields de horario Ceremony | `event.set_datetime` -> authoring owners + countdown vinculado | Phase + al menos un valor; fecha `YYYY-MM-DD`, hora `HH:MM`. |
| Fecha/inicio/fin de Party | Binding/fields Party y modo efectivo `ceremony_party` | Mismo owner con feature Party | Party debe estar activa antes o en el mismo lote. |
| Lugar/dirección manual de Ceremony | Fields de ubicación Ceremony | `event.set_location_text` -> `locationAuthoring` -> authoring owner | Phase, venue name y address strings; no inventar dirección. La escritura manual desvincula metadata Google previa. |
| Lugar/dirección manual de Party | Fields de ubicación Party y Party activa | Mismo owner con feature Party | No mezclar targets de Ceremony y Party. |
| Selección precisa de Places | Ubicación de la phase disponible | Control local `google_place_picker` -> control especializado -> `locationAuthoring` | El modelo solo indica phase; búsqueda, selección y metadata permanecen locales. |
| Dress Code visible/texto | Binding Dress Code existente | `event.set_dress_code` -> root config + target dinámico | `enabled` y texto; al desactivar se preserva valor normalizado. |

`event.set_datetime` conserva el countdown vinculado mediante el owner de fecha.
Eso no habilita visibilidad, formato, layout ni preset del countdown.

### 4.2 Texto e imágenes

| Capacidad | Disponibilidad | Owner/mutación | Información o condición requerida |
| --- | --- | --- | --- |
| Texto de historia | Binding real `texto_historia` | `story.set_text` -> default con `applyTargets:true` | Texto de hasta el límite ejecutable; conserva geometría/estilo del objeto vinculado. |
| Reemplazo de portada | Portada efectiva resuelta | Control local `cover_upload` | No acepta URL/media del modelo; no crea portada ausente. |
| Contenido de slot Gallery | Gallery real y slot visible vigente | Control local `gallery_cell_upload` | `galleryId`, `cellId`/índice existentes; media queda local. |
| Orden de fotos Gallery | Gallery real con origen poblado y destino distinto | `gallery.move_photo` -> `galleryMutations` | IDs/índices del snapshot; no cambia layout/preset. |

V1 no crea/elimina Galleries, no cambia grilla/layout/presets, no elimina media
por una ruta alternativa y no inserta imágenes libres.

### 4.3 RSVP

RSVP usa root config normalizada por `src/domain/rsvp/config.js` y operaciones de
`src/domain/rsvp/editorOps.js`. Las questions/options válidas son únicamente las
que existen en el snapshot vigente.

| Capacidad | Action | Validación mínima |
| --- | --- | --- |
| Habilitar/deshabilitar | `rsvp.set_enabled` | Boolean. Sincroniza visibilidad/creación permitida del CTA. |
| Activar/desactivar pregunta | `rsvp.set_question_active` | `questionId` vigente + boolean. |
| Label/tipo/required | `rsvp.update_question` | ID vigente; al menos un campo no null; tipo en `short_text`, `long_text`, `single_select`, `boolean`, `number`, `phone`. |
| Orden | `rsvp.move_question` | IDs distintos y `before`/`after`. |
| Agregar opción | `rsvp.add_option` | Pregunta vigente de tipo `single_select`; label válido. |
| Renombrar opción | `rsvp.rename_option` | Pregunta/opción vigentes. |
| Quitar opción | `rsvp.remove_option` | Opción vigente y al menos una opción restante. |
| Modal | `rsvp.update_modal` | Uno o más de title, subtitle, submit label y color; color no null usa `#RRGGBB`. |

La configuración pertenece al root `rsvp`; el objeto `rsvp-boton` es un CTA
visual/funcional y no contiene las preguntas. Diseñador AI no puede cambiar el
texto/estilo del CTA salvo los efectos que el owner actual derive al activar la
funcionalidad.

### 4.4 Regalos

Regalos usa root config normalizada por `src/domain/gifts/config.js` y los helpers
de CTA existentes. Su semántica funcional completa está en
[GIFTS_SYSTEM_CONTRACT.md](GIFTS_SYSTEM_CONTRACT.md).

| Capacidad | Action | Validación mínima |
| --- | --- | --- |
| Habilitar/deshabilitar | `gifts.set_enabled` | Boolean. Sincroniza visibilidad/creación permitida del CTA. |
| Método y visibilidad | `gifts.set_method` | Método en `holder`, `bank`, `alias`, `cbu`, `cuit`, `giftListLink`; valor nullable y boolean visible. |
| Texto introductorio | `gifts.set_intro_text` | String dentro del límite del schema. |
| Texto del botón | `gifts.set_button_text` | String no vacío; el CTA debe existir o crearse activando Gifts en el mismo lote. |

Si Regalos queda activo, la configuración solo puede considerarse funcional con
al menos un método visible y completo. Los números bancarios y URLs nunca se
infieren. La normalización/validez funcional final continúa perteneciendo al
dominio Gifts y al contrato de interactividad de preview/publicación.

No existe ni se necesita una action de “modalidad”: lista externa frente a datos
bancarios es una decisión del recorrido que se materializa con
`gifts.set_enabled` y uno o más `gifts.set_method`. La misma action permite
ocultar un valor sin borrarlo. `gifts.set_intro_text` y
`gifts.set_button_text` permanecen disponibles ante pedidos explícitos, pero no
forman parte de la completitud guiada. La semántica de qué campos quedan visibles
y cuándo el bloque termina pertenece exclusivamente a
`GIFTS_SYSTEM_CONTRACT.md`.

## 5. Flujo guiado funcional principal

Esta sección es la autoridad de producto para el **orden de pendientes** del
recorrido guiado principal. El contrato conversacional decide cómo expresarlo;
los owners de cada dominio deciden qué significan y cómo se validan sus datos.
El owner ejecutable de priorización debe ser
`shared/designerAiConversationLedger.cjs`, no una lista libre duplicada en el
prompt.

### 5.1 Orden canónico

El orden de alto nivel es:

1. **Nombres** de quienes se casan.
2. **Estructura del evento**: un evento único o Ceremony + Party.
3. **Datos del evento** aplicables a la estructura resuelta.
4. **Regalos**.
5. **Dress Code**.
6. **Portada**, si existe una portada editable.
7. **Galerías**, si existe al menos una Gallery aplicable.
8. **Cierre** del recorrido guiado principal.

La prioridad se calcula sobre el borrador releído. Solo se propone el primer
bloque aplicable que todavía tenga una decisión o dato necesario pendiente; el
sistema puede conocer otros pendientes, pero no debe convertirlos en un listado
proactivo extenso.

### 5.2 Reglas por bloque

- **Nombres:** si ambos nombres tienen valor y procedencia confiable, no se
  preguntan otra vez. Un placeholder, muestra o valor heredado no confirmado no
  resuelve el bloque. El nombre automático del documento es un efecto derivado
  seguro de los nombres, no otro interrogatorio previo.
- **Estructura:** `eventDetails.mode` debe resolverse como `single` o
  `ceremony_party` antes de pedir indiscriminadamente fechas, horarios o lugares.
  `single` vuelve Party no aplicable; `ceremony_party` habilita los fields reales
  disponibles para ambas fases.
- **Datos del evento:** se completan únicamente los bindings existentes de fecha,
  inicio, fin, lugar y dirección para las fases aplicables. End time y venue name
  pueden resolverse solo mediante las reglas seguras ya versionadas. Lugar y
  dirección aportados por chat se escriben inmediatamente como ubicación manual.
  Luego debe quedar una decisión explícita: buscar/verificar mediante Places o
  conservar los datos manuales. Places requiere el control local; rechazarlo usa
  `leave_empty` sobre `place_selection` y no resuelve una dirección ausente.
  La acción inline de carga manual registra esa decisión directamente en el
  ledger y la persiste antes de continuar; no se transforma en una orden
  sintética para que el modelo vuelva a interpretarla. Con solo nombre de lugar,
  la alternativa manual significa ingresar la dirección y no puede presentarse
  como si ya existieran ambos datos.
- **Regalos:** la primera decisión proactiva elige entre una lista externa y
  datos bancarios. No se empiezan a pedir campos antes de resolver esa elección.
  Una negativa completa del usuario resuelve el bloque sin pedir datos internos.
  Modalidad, visibilidad, tratamiento de defaults y completitud continúan según
  `GIFTS_SYSTEM_CONTRACT.md`; intro y texto del botón son capabilities reactivas,
  no pendientes del recorrido.
- **Dress Code:** se consulta si se desea mostrar. Una negativa conserva el valor
  normalizado oculto y continúa. Una afirmativa requiere el texto real y el
  binding disponible.
- **Portada:** se omite si `availability.cover` es falso. Si existe, el cambio usa
  `cover_upload` y solo queda resuelto ante cambio real del fingerprint.
- **Galerías:** se omiten si no hay una Gallery real con slots editables. Las
  Galleries aplicables se recorren de a una y en el orden vigente del snapshot.
  `gallery_cell_upload` conserva `galleryId` y slot para seleccionar la Gallery
  correcta y enfocar un target inicial, pero ese slot no define completitud. Un
  reemplazo, agregado, eliminación o reordenamiento solo modifica la Gallery:
  la etapa queda terminal únicamente cuando el usuario activa la finalización
  explícita dentro de su control especializado. Cerrar el control conserva las
  mutaciones ya aplicadas y mantiene esa Gallery pendiente.

La fuente única de cuál Gallery sigue pendiente es el orden de hojas
`guided_completion` del ledger. `activeControl` identifica de forma transitoria
la Gallery en edición. El estado “hubo cambios” también es transitorio y se
deriva contra el snapshot de apertura; sirve para la UX, pero no terminaliza la
hoja. Solo la resolución `resolved_by_control` persistida representa “el usuario
terminó esta Gallery”. No se agrega ese estado al objeto `tipo: "galeria"`.

Una hoja terminal por control local conserva esa autoridad frente a la
continuación conversacional: una `resolution` redundante del modelo se descarta
para esa hoja y nunca degrada `resolved_by_control`. Esto no relaja la validación
de hojas pendientes ni permite generalizar evidencia a otra phase.

La decisión de producto actual pide reemplazar las imágenes existentes al final
del recorrido; no define como preguntas proactivas llenar slots vacíos ni
reordenar fotos. `gallery.move_photo` continúa disponible ante un pedido
explícito. De forma equivalente, `story.set_text` sigue siendo una capability
reactiva: no tiene posición aprobada dentro del orden anterior y no debe
insertarse silenciosamente como bloque proactivo.

### 5.3 Adaptación y procedencia

- No se pregunta otra vez una hoja terminal respaldada por evidencia vigente.
- Si el usuario adelanta varios datos válidos, se validan y aprovechan en el
  mismo turno aunque correspondan a bloques posteriores.
- Si un turno contiene datos ejecutables y además deja otro dato pendiente, las
  actions válidas se conservan y el resultado operativo es `apply`; la respuesta
  puede preguntar inmediatamente por lo faltante. `clarify` queda reservado
  para resultados sin actions ni controles locales.
- Tras cada lote se relee el borrador y se recalcula el primer pendiente; el chat
  no reemplaza ese estado.
- Una corrección explícita reabre y actualiza la hoja afectada y sus dependencias
  documentadas.
- Los bloques no disponibles por template/configuración se saltan.
- Se solicita solamente información necesaria para una action, control o
  resolución válida. Nunca se completan huecos con inferencias no allowlisted.
- Una postergación explícita del usuario no vuelve terminal la hoja ni cambia el
  orden canónico. Durante la conversación activa puede omitirse temporalmente
  esa pregunta y avanzar a otro dato aplicable; el ledger conserva el pendiente
  para retomarlo más adelante. No se persiste un segundo orden ni un estado
  funcional ficticio de completitud.

### 5.4 RSVP y cierre funcional

RSVP **no forma parte del interrogatorio proactivo del recorrido guiado
principal**. Sus capabilities V1 permanecen disponibles si el usuario pide
configurarlo; esta exclusión no desactiva ni modifica RSVP en el producto.

El cierre del recorrido principal depende solo de los bloques aprobados en 5.1,
no de haber recorrido todas las capabilities existentes. El texto de cierre debe
comunicar fin del recorrido, no completitud absoluta de la invitación, según el
contrato conversacional.

Estado de implementación al 2026-08-28: el **orden entre bloques** está
implementado en el owner ejecutable.
`shared/designerAiConversationLedger.cjs` expone `GUIDED_FLOW_BLOCKS` en el orden
de 5.1 y construye `ledger.guidedFlow` con las hojas aplicables. Su
`guidedFlow.completion.complete` gobierna el cierre del recorrido; la
`completion` global se conserva para diagnóstico y estado operacional sin poder
bloquear ese cierre. Cada Gallery aplicable aporta exactamente una hoja
`media.gallery.{galleryId}.guided_completion`, ordenada según el snapshot. Los
slots, sus fingerprints y `media.gallery.{galleryId}.order` quedan fuera de
`guidedFlow` y mantienen sus estados/capabilities reales; por eso una mutación
no puede avanzar el recorrido. RSVP e historia también permanecen fuera. El
prompt consume el `nextBlock` derivado y no mantiene otra lista ejecutable.

Existe un gap acotado dentro de Regalos: cuando `gifts.enabled` queda terminal y
activo, el ledger vigente incorpora todas las hojas `gifts.method.*`,
`gifts.intro_text` y `gifts.button_text` al recorrido. Debe evolucionar para que
la completitud se derive de la modalidad elegida y de las condiciones del owner
Gifts, sin convertir campos bancarios no aportados ni copies opcionales en
pendientes. Las actions existentes ya alcanzan para expresar los cambios; esta
corrección no autoriza un segundo estado de modalidad ni otra prioridad en el
prompt.

## 6. Actions originadas por el modelo

La allowlist exacta V1 es:

- `document.set_name`
- `event.set_people`
- `event.set_mode`
- `event.set_datetime`
- `event.set_location_text`
- `event.set_dress_code`
- `story.set_text`
- `gallery.move_photo`
- `rsvp.set_enabled`
- `rsvp.set_question_active`
- `rsvp.update_question`
- `rsvp.move_question`
- `rsvp.add_option`
- `rsvp.rename_option`
- `rsvp.remove_option`
- `rsvp.update_modal`
- `gifts.set_enabled`
- `gifts.set_method`
- `gifts.set_intro_text`
- `gifts.set_button_text`

La tool estricta acepta hasta 19 actions en una salida. Cada action usa
`additionalProperties:false`; los argumentos y límites exactos viven en el
schema ejecutable para evitar duplicar otra definición de shapes en prose.

## 7. Controles locales confiables

El modelo puede solicitar, pero no ejecutar ni completar por sí solo:

| Control solicitado | Acción local representada | Datos permitidos desde el modelo |
| --- | --- | --- |
| `cover_upload` | `media.replace_cover` | Solo el type. |
| `gallery_cell_upload` | `media.set_gallery_cell` | Gallery y slot ya presentes en snapshot. |
| `google_place_picker` | `event.select_google_place` | Solo `ceremony` o `party`. |

Media URLs, assets, tokens, paths, `placeId`, coordenadas y metadata no son
argumentos del modelo. Para ubicación, el panel conserva el chat, muestra inline
solo la superficie especializada de Places para la phase exacta y precarga la
búsqueda desde el lugar/dirección ya persistidos. El usuario debe elegir un
resultado; no existe selección automática ante múltiples sugerencias. El
frontend marca `resolved_by_control` solo después de comprobar la evidencia que
corresponde al dominio. Portada exige un cambio real del fingerprint. Gallery
exige la acción explícita de finalización del usuario y la persistencia
confirmada de su hoja `guided_completion`; los fingerprints de slots se usan
solo para distinguir cambios durante la edición. Places exige que la selección
esperada se refleje en el owner. Abrir, cerrar o cancelar cualquier control no
completa nada.

En `ceremony_party`, `event.ceremony.{venue_name,address,place_selection}` y
`event.party.{venue_name,address,place_selection}` son hojas independientes. La
verificación de Places debe coincidir simultáneamente con el owner local y con el
snapshot de capabilities releído para la phase solicitada; nunca terminaliza las
hojas hermanas de la otra phase. Después de reconciliar el control, la
continuación se deriva nuevamente del primer pendiente de `guidedFlow`. Regalos
solo puede ser el siguiente bloque proactivo cuando no queda ninguna hoja
aplicable de `event_data`.

La decisión de no usar Maps no inventa `placeId`, coordenadas ni metadata. Si
existen lugar y dirección suficientes, conserva esa ubicación manual y continúa;
si falta la dirección, permanece pendiente y se solicita solamente ese dato.
El estado transitorio de decisión/control vive en el panel y el ledger; el draft
persiste solo los fields manuales o el shape Google canónico, no una segunda
máquina de estados de ubicación.

## 8. Validación, confirmación e inferencia

### 8.1 Validación obligatoria

Antes de la primera mutación, el lote completo debe superar:

1. versión de contrato;
2. origen permitido (`model` o `trusted_control`);
3. type allowlisted y shape exacto;
4. capability disponible en snapshot;
5. IDs de Gallery/question/option vigentes;
6. formatos de fecha/hora/color;
7. dependencias secuenciales de Party, Gifts y opciones RSVP;
8. validación de resolutions contra leaves/rules vigentes.

Backend y frontend aplican el mismo contrato. El executor vuelve a prevalidar
antes de delegar en owners. La validación no vuelve transaccionales a varios
owners: si uno falla después de otro ya aplicado, se reporta ejecución parcial y
no se afirma rollback.

Como recuperación defensiva y *fail closed* por hoja, el backend descarta una
resolución `resolved_by_rule` cuando tanto la hoja como la regla existen pero esa
regla no está autorizada para ese `leafId` exacto. La hoja permanece pendiente y
las actions válidas del mismo turno todavía pueden superar la validación. No se
reinterpreta la regla, no se marca la hoja como resuelta y no se toleran por esta
vía shapes inválidos, hojas desconocidas, estados desconocidos ni reglas fuera de
la allowlist: esos casos continúan invalidando la salida completa.

### 8.2 Cuándo se requiere decisión del usuario

No hace falta una confirmación adicional cuando el usuario pidió de forma
explícita una action no destructiva, aportó todos sus datos y no existe
ambigüedad. Sí se requiere aclaración o control antes de mutar cuando:

- hay dos phases/targets plausibles;
- falta un dato requerido;
- un valor heredado no tiene procedencia confiable;
- se necesita elegir media o un Place real;
- la inferencia no está cubierta por una regla segura de la sección 10;
- la action modificaría una capacidad distinta de la mencionada, salvo una
  dependencia documentada y necesaria.

La forma lingüística de esa aclaración pertenece al contrato conversacional.

## 9. Capacidades explícitamente excluidas

El validador debe rechazar:

- posiciones, geometría, selección, orden Z y propiedades genéricas del canvas;
- fuentes, tamaños y colores genéricos;
- layouts y estilos de objetos/secciones;
- creación/eliminación genérica de objetos o secciones;
- creación/eliminación/layout/presets de Gallery;
- imágenes libres, biblioteca, URLs o metadata de media;
- visibilidad/formato/preset del countdown;
- visibilidad/formato del mapa y metadata precisa de Places;
- formato de fecha/dirección;
- texto/estilo genérico de CTAs;
- código, comandos, Firestore, Storage, secrets o eventos arbitrarios.

Los únicos side effects acotados de creación son los ya pertenecientes a owners
existentes: CTA RSVP/Gifts al activar su root config y mapa oculto tras una
selección local real de Places.

## 10. Ledger, procedencia y completitud

### 10.1 Estados

| Estado | Semántica | Terminal |
| --- | --- | --- |
| `unavailable` | El control/binding no existe en este draft. | Fuera del denominador. |
| `pending` | Existe pero no tiene valor/decisión confiable. | No. |
| `needs_clarification` | Dato parcial, ambiguo o conflictivo. | No. |
| `requires_control` | Requiere uploader/Gallery/Places local. | No. |
| `resolved_from_user` | Informado o decidido explícitamente. | Sí. |
| `resolved_from_existing_user_data` | Personalización previa demostrable. | Sí. |
| `resolved_by_rule` | Regla segura versionada. | Sí. |
| `resolved_by_control` | Control local aportó la evidencia exigida por su dominio: cambio funcional verificado o finalización explícita durable. | Sí. |
| `not_applicable_by_dependency` | Parent terminal vuelve inoperante la hoja. | Sí. |

```text
complete(draft) = every(available leaf, isTerminal(status))
```

Esa fórmula describe `ledger.completion.complete` y su completitud operacional
total. El mismo ledger expone además:

```text
guidedComplete(draft) = every(ledger.guidedFlow.leafIds, isTerminal(status))
```

`ledger.guidedFlow.leafIds` se deriva de los bloques de 5.1, dependencias,
availability y medios realmente aplicables. Para Galleries contiene una hoja
durable de finalización por Gallery, no sus slots. Excluye RSVP, historia, orden
Gallery, fingerprints de contenido, slots y capabilities reactivas sin posición
aprobada.
`ledger.guidedFlow.completion.complete` es el único criterio ejecutable de cierre
del recorrido principal; no marca esas otras hojas como completadas.

No existe completitud por “capability mencionada”, bloque visitado ni chat
recorrido. Tanto la completitud total como la del recorrido deben derivarse de
hojas aplicables y terminales después de releer el borrador.

### 10.2 Procedencia

El ledger distingue:

- `user_current_session`
- `existing_user_data`
- `automatic_rule`
- `system_default`
- `template_value`
- `placeholder_or_sample`
- `unknown`

Un valor no vacío no prueba personalización. `templateInput.changedKeys` puede
aportar evidencia; valores de template/placeholders se mantienen no confiables.
El historial no puede contradecir el borrador.

### 10.3 Reglas seguras versionadas

Solo se aceptan estas reglas ejecutables:

- `automatic_event_name`
- `optional_end_time_omitted`
- `optional_venue_name_omitted`
- `same_day_party`
- `catalog_defaults`
- `system_default`
- `preserve_while_inactive`
- `keep_existing`
- `leave_empty`
- `recommended_order`

Cada regla se valida contra tipos de leaf compatibles. `preserve_while_inactive`
no convierte RSVP/Gifts en inexistentes: al activarlos, las hojas internas se
reabren. `not_applicable_by_dependency` también se revierte cuando cambia el
parent.

### 10.4 Nombre automático del documento

Con dos nombres reales, no placeholders y sin ambigüedad, la regla produce:

```text
Casamiento {Nombre 1} y {Nombre 2}
```

Se aplica solo si el nombre está vacío, proviene de template/placeholder o sigue
bajo política `automatic`. Un nombre explícito nunca se sobreescribe. Mientras
la política sea automática, corregir una persona recalcula el nombre. Sin
procedencia persistida, solo es segura la actualización si el nombre actual
coincide con el resultado automático anterior.

## 11. Correcciones y evidencia de ejecución

- Cualquier valor autorizado puede corregirse aunque fuera terminal.
- No se deshacen valores no mencionados.
- Cambiar un parent reabre dependencias que vuelven a aplicar.
- Una action propuesta no es evidencia de ejecución.
- El panel solo confirma éxito después de validación, ejecución y reread.
- Una revisión distinta entre request y respuesta cancela el lote completo antes
  de aplicar.
- Un control solo resuelve por la evidencia propia de su dominio: cambio de
  fingerprint para portada; confirmación explícita y persistida para la Gallery
  exacta; o coincidencia exacta de `placeId`, lugar y dirección seleccionados
  para Places, más la misma phase reflejada en el snapshot de capabilities. Los
  fingerprints de contenido/orden de una Gallery no son evidencia de
  finalización. La metadata se compara localmente y no llega a OpenAI. La
  evidencia de una Gallery, Ceremony o Party no se generaliza a otra.
- Un error no vuelve terminal una hoja pendiente.

La política textual de confirmaciones, errores y negativas está en
`AI_ASSISTANT_CONVERSATION_CONTRACT.md`.

## 12. Implementación y arquitectura

El flujo ejecutable actual es:

1. `DesignerAiPanel.jsx` relee snapshot y ledger.
2. `designerAiChat` autoriza superadmin y valida payload.
3. OpenAI devuelve una única `submit_designer_ai_result` estricta.
4. Backend valida resultado; frontend valida revisión, actions, controles y
   resolutions otra vez.
5. `designerAiActionExecutor.js` delega en owners existentes.
6. El panel relee, reconcilia y persiste `designerAiConversation`.

La arquitectura completa, incluido el límite client-side de tools, está en
`AI_ASSISTANT_SYSTEM.md`. La versión actual del protocolo es `2.2.0`; el ledger
usa versión `3`. La versión 3 agrega una finalización durable por Gallery dentro
de `designerAiConversation.resolutions`. Un draft legacy sin esa resolución
conserva sus fotos, pero la Gallery queda pendiente hasta la primera finalización
explícita; no se infiere completitud por diferencias contra la plantilla.

## 13. Conocimiento funcional: rutas canónicas

Este contrato declara accesibilidad, no reescribe la funcionalidad del producto.

| Superficie | Autoridad que continúa gobernando cómo funciona |
| --- | --- |
| Draft, metadata, fields dinámicos, `eventDetails`, RSVP | [DATA_MODEL.md](../architecture/DATA_MODEL.md) y owners de dominio. |
| Regalos | [GIFTS_SYSTEM_CONTRACT.md](GIFTS_SYSTEM_CONTRACT.md) como entry point; [DATA_MODEL.md](../architecture/DATA_MODEL.md) para shape y [PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md](PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md) para CTA/modal. |
| Editor/bridges/persistencia | [EDITOR_SYSTEM.md](../architecture/EDITOR_SYSTEM.md). |
| Gallery | [GALLERY_SYSTEM_CONTRACT.md](GALLERY_SYSTEM_CONTRACT.md) y contratos enfocados. |
| Portada/roles de imagen | [IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md](IMAGE_PLACEMENT_UX_RENDER_CONTRACT.md). |
| CTA RSVP/Gifts y publicación | [PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md](PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md). |
| Countdown/mapa/render | [DATA_MODEL.md](../architecture/DATA_MODEL.md) y [RENDER_COMPATIBILITY_MATRIX.md](RENDER_COMPATIBILITY_MATRIX.md). |
| Interacción genérica del canvas | [INTERACTION_CONTRACT.md](../architecture/INTERACTION_CONTRACT.md); fuera de alcance V1. |

Si una funcionalidad cambia, se actualiza primero su owner. Este contrato solo se
actualiza además si cambia la porción accesible para Designer AI.

## 14. Anclas de código y tests

Código:

- `src/domain/editor/assistantMode.js`
- `src/domain/editor/assistantSubsteps.js`
- `src/domain/editor/designerAiCapabilities.js`
- `src/domain/editor/designerAiActionExecutor.js`
- `shared/designerAiCapabilityContract.cjs`
- `shared/designerAiConversationLedger.cjs`
- `functions/src/designerAi/service.ts`
- `src/components/editor/designerAi/DesignerAiPanel.jsx`

Tests:

- `shared/designerAiCapabilityContract.test.mjs`
- `shared/designerAiConversationLedger.test.mjs`
- `src/domain/editor/designerAiCapabilities.test.mjs`
- `src/domain/editor/designerAiActionExecutor.test.mjs`
- `src/domain/editor/designerAiNamePolicyIntegration.test.mjs`
- `functions/designerAiService.test.mjs`

## 15. Regla de cambio

Una ampliación de capability requiere en el mismo cambio:

1. owner funcional y documentación canónica del dominio;
2. availability/values mínimos del snapshot;
3. action/control y schema compartido, sin setters genéricos;
4. validación backend/frontend contra identidad vigente;
5. adaptación del executor al owner existente;
6. leaves, dependencias y procedencia del ledger;
7. tests positivos, negativos, ambiguos, stale y de error;
8. actualización de este contrato y de `AI_ASSISTANT_SYSTEM.md` si cambia una
   frontera técnica.

El contrato conversacional se modifica solo si cambia cómo debe comunicarse esa
capacidad; no se duplica esa regla aquí.
