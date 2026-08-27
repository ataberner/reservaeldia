# Designer AI Capability and Conversation Contract

Status: Canonical Contract.

## 1. Objetivo y alcance

`Diseñador AI` es un adaptador conversacional, exclusivo para superadmins, sobre
las capacidades que ya expone el tab `Asistente` del editor de borradores. No es
un segundo editor, un agente con acceso libre al canvas ni una nueva autoridad de
persistencia.

La equivalencia normativa es:

```text
Asistente -> controles -> todos sus valores disponibles
Diseñador AI -> conversación y controles confiables -> esos mismos valores
```

La conversación puede resolver varios valores a la vez, inferir únicamente lo
que sea seguro y aplicar reglas automáticas documentadas. No puede omitir una
capacidad por el solo hecho de que resulte incómoda de preguntar. La regla de
producto es:

> Reducir la cantidad de preguntas no significa reducir la cantidad de
> información que Diseñador AI debe completar. El objetivo es cubrir el 100 % de
> las capacidades disponibles de Asistente mediante una conversación más
> inteligente, agrupando preguntas, reutilizando información ya recibida y
> derivando automáticamente aquellos valores para los que exista una regla
> segura.

V1 está disponible únicamente en sesiones autenticadas, editables y de tipo
`draft`. No aparece en template workspaces, selector mode, vistas administrativas
read-only ni sesiones que no sean de superadmin.

Este documento es normativo para capacidad, completitud y experiencia
conversacional. La allowlist ejecutable versionada continúa en
`shared/designerAiCapabilityContract.cjs`; este contrato de UX no agrega acciones
ni cambia sus argumentos.

## 2. Evidencia y autoridades actuales

La navegación real de Asistente se define en `assistantMode.js` y
`assistantSubsteps.js`, y `DashboardSidebar.jsx` monta el control correspondiente
en `MiniToolbar`. El orden actual es Evento, Texto cuando existe el binding de
historia, Fotos cuando existe portada o alguna Gallery, Asistencia y Regalos.

Dentro de Evento, los substeps reales son Nombres, Fecha y hora y Ubicación. En
Fotos hay un substep de portada solo si ya existe una portada efectiva y uno por
cada objeto Gallery real. Designer AI debe calcular su universo desde estas
mismas condiciones, no desde una lista estática de campos supuestos.

El borrador vigente es siempre la fuente de verdad. El historial del chat solo
ayuda a resolver referencias conversacionales y procedencia durante la sesión;
no reemplaza valores, owners, bridges ni persistencia.

El flujo de runtime autorizado sigue siendo:

1. `DesignerAiPanel.jsx` relee un snapshot mínimo desde los bridges existentes.
2. `designerAiChat` valida autenticación, superadmin, versión y shape antes de
   interpretar el mensaje.
3. OpenAI devuelve una única llamada estructurada a
   `submit_designer_ai_result`.
4. Backend y frontend validan acciones y controles contra el contrato compartido
   y contra el snapshot vigente.
5. `designerAiActionExecutor.js` delega en los owners existentes. Autosave,
   coordinación FIFO y persistencia permanecen intactos.

Designer AI nunca recibe `setObjetos`, `setSecciones`, handles de Firestore,
credenciales de Storage, setters genéricos, strings de eventos arbitrarios ni un
transport alternativo.

## 3. Inventario completo de Asistente

### 3.1 Regla de disponibilidad

El inventario siguiente es el límite absoluto de V1. Un valor forma parte de la
conversación solo cuando el control equivalente existe realmente en Asistente
para el borrador actual:

- los campos dinámicos dependen de `fieldsSchema`, `applyTargets` y bindings
  reales;
- Party es estructuralmente disponible cuando existen sus bindings; su
  aplicabilidad depende de `eventDetails.mode === "ceremony_party"`;
- Historia depende del binding textual de `texto_historia`;
- Portada depende de que ya exista una portada efectiva;
- Galería depende de objetos reales `tipo: "galeria"` y sus slots visibles;
- RSVP y Regalos están siempre disponibles en un borrador editable.

`unavailable` significa que el valor no existe en el Asistente de ese borrador y
queda fuera del denominador de completitud. No autoriza a crearlo.

### 3.2 Identidad, pareja y evento

| Valor funcional | Dónde vive / owner actual | Cómo se modifica en Asistente | Resolución permitida | Tratamiento conversacional |
| --- | --- | --- | --- | --- |
| Nombre visible del borrador | `dashboardDocumentNameBridge`, `DashboardHeader` y patch de sesión | Input `Nombre del evento` | Elección explícita o regla automática de la sección 6 | No se pregunta por defecto. Se deriva de los nombres salvo que exista un nombre personalizado explícito. |
| Nombre de la primera persona | Default dinámico `event_primary_person_name` y targets vinculados; `updateTemplateAuthoringEventPersonNames` | Input `Nombre de la primera persona` | Usuario o dato personalizado previo confiable | Preguntar junto con el segundo nombre; aceptar nombre simple o completo. |
| Nombre de la segunda persona | Default dinámico `event_secondary_person_name` y targets vinculados; mismo owner | Input `Nombre de la segunda persona` | Usuario o dato personalizado previo confiable | Igual que el anterior; actualizar también formatos combinados vinculados. |
| Modalidad del evento | Root `eventDetails.mode` normalizado | Select `single` / `ceremony_party` | Usuario, dato previo o inferencia inequívoca | Inferir `ceremony_party` si el relato distingue ceremonia y fiesta; inferir `single` solo si habla inequívocamente de un único evento. En otro caso preguntar. |
| Fecha de ceremonia/evento único | Default dinámico y target countdown de Ceremony | Input `Fecha` | Usuario, dato previo o inferencia contextual inequívoca | Conversar junto con horarios y lugar de la misma fase. |
| Hora de inicio de ceremonia/evento único | Default dinámico de Ceremony y fallback del countdown | Input `Hora de inicio` | Usuario o dato previo | Es necesaria cuando la superficie está disponible. Una hora ambigua requiere aclaración. |
| Hora de fin de ceremonia/evento único | Default dinámico de Ceremony | Input opcional `Hora Fin` | Usuario, dato previo o regla de omisión opcional | Si no se menciona, puede quedar vacía mediante la regla documentada “no mostrar hora de fin”; no exige una pregunta aislada. |
| Fecha de fiesta | Default dinámico y target countdown de Party | Input `Fecha`, solo en `ceremony_party` | Usuario, dato previo o derivación segura | Puede copiar la fecha de ceremonia solo cuando expresiones como “después”, “ese mismo día” o equivalentes lo hagan inequívoco. |
| Hora de inicio de fiesta | Default dinámico de Party y fallback del countdown | Input `Hora de inicio`, solo en `ceremony_party` | Usuario o dato previo | Preguntar junto con fecha y lugar de fiesta si falta. |
| Hora de fin de fiesta | Default dinámico de Party | Input opcional `Hora Fin` | Usuario, dato previo o regla de omisión opcional | Mismo criterio que la hora de fin de ceremonia. |
| Nombre del lugar de ceremonia/evento único | Default y targets con rol `ceremony_venue_name` | Input opcional `Nombre del lugar` | Usuario, dato previo, Places o regla de omisión opcional | Puede quedar vacío si existe una dirección suficiente y el usuario no indicó un nombre. |
| Dirección de ceremonia/evento único | Default y targets con rol `ceremony_venue_address` | Input `Dirección` | Usuario, dato previo o selección de Places | Debe quedar inequívoca o pasar a `requires_control`; no se inventan direcciones. |
| Selección precisa de Google Places para ceremonia | Configuración de ubicación y asociación con el mapa oculto existente/permitido | Lista de sugerencias bajo lugar o dirección | Solo control local confiable | El modelo solicita el selector. `placeId`, coordenadas y metadata no entran al chat ni a OpenAI. |
| Nombre del lugar de fiesta | Default y targets con rol `party_venue_name` | Input opcional `Nombre del lugar` | Usuario, dato previo, Places o regla de omisión opcional | Mismo criterio que Ceremony, con feature `party`. |
| Dirección de fiesta | Default y targets con rol `party_venue_address` | Input `Dirección` | Usuario, dato previo o selección de Places | Mismo criterio que Ceremony, sin mezclar asociaciones entre fases. |
| Selección precisa de Google Places para fiesta | Configuración Party y asociación de mapa | Lista de sugerencias Party | Solo control local confiable | Mismo criterio de privacidad y control local. |
| Mostrar Dress Code | `eventDetails.dressCode.enabled` | Switch `Dress Code` | Decisión del usuario o dato previo personalizado | Un `false` heredado/default no equivale por sí solo a una decisión. Preguntar una vez dentro de “información para invitados”. |
| Texto de Dress Code | Default/target con rol `dress_code` y `eventDetails.dressCode.value` | Input `Texto del Dress Code`, cuando está activo | Usuario, dato previo o inferencia literal segura | “Vamos de elegante sport” puede activar y establecer el texto. Al desactivar se preserva el texto, pero queda no aplicable. |

Las mutaciones de nombres, fechas, horarios, ubicación, Dress Code y story deben
seguir aplicando `applyTargets` mediante sus owners actuales. Los objetos de
texto vinculados conservan width, alineación, wrapping, tipografía y geometría.
El countdown vinculado conserva la fecha objetivo a través de su owner actual;
esto no habilita a conversar sobre visibilidad o formato del countdown.

### 3.3 Texto e imágenes

| Valor funcional | Dónde vive / owner actual | Cómo se modifica en Asistente | Resolución permitida | Tratamiento conversacional |
| --- | --- | --- | --- | --- |
| Texto de historia | `templateAuthoringDraft.defaults.texto_historia` y objeto de texto vinculado, con el objeto como autoridad visual | Textarea `Texto historia`, solo si hay binding | Texto del usuario, dato personalizado previo o decisión explícita de no usarlo | Pedir una idea o un texto en un bloque breve. No editar otros textos ni alterar layout. |
| Portada existente | Owner de portada y bridge/upload actual de `MiniToolbarTabImagen` | `Cambiar imagen de portada` | Dato personalizado previo aceptado o control local | Si la portada proviene de plantilla, ofrecer conservarla o reemplazarla. Si se reemplaza, abrir el uploader existente. Nunca crear una portada ausente. |
| Contenido de cada slot visible de cada Gallery existente | `cells[]` local del objeto `tipo: "galeria"`; `galleryMutations` | Reemplazo/upload por celda, incluidas celdas vacías | Dato personalizado previo aceptado, decisión de dejar vacío o control local | Tratar cada slot existente sin enviar media URL. Una negativa puede resolver la celda como “se deja como está/vacía”. |
| Orden de fotos pobladas de cada Gallery existente | Orden de slots/cells de la Gallery; `moveGalleryPhotoToSlot` | Drag, teclado y handles de reordenamiento | Orden previo aceptado o instrucción inequívoca | Preguntar por el orden una sola vez por Gallery cuando haya más de una foto, o aplicar la corrección indicada. No cambia layout ni preset. |

Asistente simplificado no permite crear/eliminar Galleries, cambiar su grilla o
layout, quitar fotos mediante la barra avanzada, insertar imágenes libres ni
usar la biblioteca como vía alternativa. Esas operaciones tampoco pertenecen a
Designer AI.

### 3.4 Asistencia (RSVP)

RSVP vive en la configuración root normalizada por `src/domain/rsvp/config.js`.
Los helpers de `editorOps.js` son la autoridad de preguntas, opciones y orden.
La activación crea, muestra u oculta el CTA funcional por el mecanismo actual;
no habilita texto o estilo del CTA RSVP.

| Valor funcional | Cómo se modifica en Asistente | Resolución permitida | Tratamiento conversacional |
| --- | --- | --- | --- |
| RSVP habilitado | Switch `Pedir confirmación de asistencia` | Decisión del usuario o dato previo personalizado | Preguntar una sola vez si el estado no tiene procedencia de usuario. Apagarlo no borra ni vuelve inaccesible su configuración en Asistente. |
| Activación de cada pregunta disponible | Agregar/Quitar campo | Elección explícita, dato previo o conjunto recomendado aceptado explícitamente | Una frase exhaustiva como “solo nombre, asistencia y alergias” resuelve como activas esas preguntas y como inactivas todas las demás. |
| Orden de preguntas activas | Drag/teclado | Orden explícito, dato previo o regla de orden recomendado aceptada | No preguntar posición por posición. Proponer o conservar un orden completo y permitir correcciones. |
| Label de cada pregunta activa | Editor `Nombre del campo` | Usuario, dato previo o default de catálogo aceptado por regla | Los defaults de catálogo pueden usarse tras aceptar el conjunto recomendado; labels propios de plantilla requieren procedencia o confirmación. |
| Tipo de cada pregunta activa | Select `Tipo de respuesta` | Usuario, dato previo o tipo de catálogo aceptado por regla | Valores: `short_text`, `long_text`, `single_select`, `boolean`, `number`, `phone`. No mostrar nombres internos al usuario. |
| Required de cada pregunta activa | Checkbox `Obligatorio` | Usuario, dato previo o default de catálogo aceptado por regla | Resolver en conjunto: por ejemplo, “nombre y asistencia obligatorios; alergias opcional”. |
| Existencia y label de cada opción de `single_select` | Agregar, renombrar y quitar opción | Usuario, dato previo u opciones de catálogo aceptadas por regla | Tratar el conjunto completo; conservar al menos una opción. No preguntar opción por opción si el usuario acepta las estándar. |
| Título del modal | `Ajustes del formulario` -> `Título principal` | Usuario, dato previo o default de sistema documentado | El default `Confirmar asistencia` puede resolverse por regla si no fue reemplazado por copy de plantilla. |
| Subtítulo del modal | `Texto de ayuda` | Usuario, dato previo o default de sistema documentado | Mismo criterio de procedencia. |
| Etiqueta de envío | `Texto del botón` dentro de ajustes del modal | Usuario, dato previo o default de sistema documentado | El default `Enviar` puede resolverse por regla. No confundir con el CTA RSVP del canvas. |
| Color primario del modal | Picker `Color botón` | Usuario, dato previo o token/default de sistema documentado | Es la única capacidad de color RSVP autorizada. No habilita colores genéricos del canvas. |

El catálogo real que Asistente puede activar, sujeto a `maxQuestions: 12`, es:

| ID estable | Nombre visible inicial | Tipo inicial | Required inicial |
| --- | --- | --- | --- |
| `full_name` | Nombre y apellido | Texto corto | Sí |
| `attendance` | ¿Asistís? | Opciones Sí/No | Sí |
| `party_size` | Cantidad de personas | Número | No |
| `event_scope` | Ceremonia / Fiesta / Ambos | Opciones | No |
| `menu_type` | Tipo de menú | Opciones | No |
| `dietary_notes` | Alergias o restricciones alimentarias | Texto largo | No |
| `phone_whatsapp` | Teléfono / WhatsApp | Teléfono | No |
| `plus_one` | ¿Vas con acompañante? | Sí/No | No |
| `plus_one_name` | Nombre del acompañante | Texto corto | No |
| `children_count` | Cantidad de niños | Número | No |
| `host_message` | Mensaje para los anfitriones | Texto largo | No |
| `song_suggestion` | Canción sugerida | Texto corto | No |
| `needs_transport` | ¿Necesitás transporte? | Sí/No | No |
| `custom_1`, `custom_2` | Pregunta personalizada 1/2 | Texto corto | No |

Los dos slots custom están además sujetos a `maxCustomQuestions: 2`. Los presets
del catálogo son defaults internos, no una capacidad conversacional adicional:
Designer AI resuelve sus valores a través de las acciones RSVP existentes.

### 3.5 Regalos

Regalos vive en la configuración root normalizada por
`src/domain/gifts/config.js`. La activación usa el CTA funcional actual y puede
crear el botón permitido por esa activación.

| Valor funcional | Cómo se modifica en Asistente | Resolución permitida | Tratamiento conversacional |
| --- | --- | --- | --- |
| Regalos habilitado | Switch `Mostrar opciones de regalos` | Decisión del usuario o dato previo personalizado | Preguntar una vez. Apagarlo no borra ni vuelve inaccesibles métodos y copy en Asistente. |
| Titular: valor y visibilidad | Agregar/editar/ocultar `Titular` | Usuario, dato previo o decisión explícita de ocultar | Tratar valor y visibilidad como dos hojas dependientes. |
| Banco: valor y visibilidad | Agregar/editar/ocultar `Banco` | Igual | Igual. |
| Alias: valor y visibilidad | Agregar/editar/ocultar `Alias` | Igual | Igual. |
| CBU/CVU: valor y visibilidad | Agregar/editar/ocultar `CBU / CVU` | Igual | Igual; no inferir números. |
| CUIT: valor y visibilidad | Agregar/editar/ocultar `CUIT` | Igual | Igual; no inferir identificadores. |
| Lista externa: URL y visibilidad | Agregar/editar/ocultar `Lista externa` | Usuario, dato previo o decisión de ocultar | Solo HTTP(S) válido por el normalizador existente. La URL no se registra en logs. |
| Texto introductorio | `Ajustes de regalos` -> `Texto introductorio` | Usuario, dato previo o default de sistema documentado | El default del sistema puede resolverse por regla; copy de plantilla no se acepta como personalizado sin procedencia. |
| Texto del botón de regalos | `Ajustes de regalos` -> `Texto del botón` | Usuario, dato previo o default funcional documentado | `Ver regalos` puede resolverse por regla. Se actualiza el CTA existente o el creado al activar. |

Si Regalos está activo, el flujo solo es funcional al publicar cuando existe al
menos un método visible y completo. La conversación no puede declararlo completo
con un método visible vacío.

### 3.6 Capacidades explícitamente excluidas

Aunque existan en otros tabs del editor, no pertenecen a Asistente simplificado
y el validador debe rechazarlas: posiciones, geometría, fuentes, tamaños,
colores genéricos, layouts, texto libre fuera de bindings verificados,
creación/eliminación de objetos o secciones, creación/eliminación/layout/presets
de Gallery, imágenes libres o biblioteca, visibilidad/formato del countdown,
visibilidad del mapa, formato de fecha o dirección, texto/estilo del CTA RSVP,
propiedades genéricas del canvas, código, Firestore o Storage directos.

Los únicos side effects acotados de creación siguen siendo el CTA funcional de
RSVP/Regalos creado por su activación y el mapa oculto creado por una selección
real de Places.

## 4. Allowlist versionada sin cambios

Las acciones originadas por el modelo son exclusivamente:

- `document.set_name`
- `event.set_people`, `event.set_mode`, `event.set_datetime`,
  `event.set_location_text`, `event.set_dress_code`
- `story.set_text`
- `gallery.move_photo`
- `rsvp.set_enabled`, `rsvp.set_question_active`, `rsvp.update_question`,
  `rsvp.move_question`, `rsvp.add_option`, `rsvp.rename_option`,
  `rsvp.remove_option`, `rsvp.update_modal`
- `gifts.set_enabled`, `gifts.set_method`, `gifts.set_intro_text`,
  `gifts.set_button_text`

Los controles locales confiables poseen exclusivamente:

- `media.replace_cover`
- `media.set_gallery_cell`
- `event.select_google_place`

El modelo puede pedir el control correspondiente, pero no proporcionar media
URLs, assets, metadata de Storage, `placeId`, coordenadas o metadata de Google.
Cada acción conserva su shape exacto (`additionalProperties:false`), origen,
límites y validación de IDs contra el snapshot. Un prompt no puede ampliar esta
lista.

## 5. Modelo de estado conversacional y completitud

### 5.1 Ledger por valor

La unidad de completitud es cada hoja disponible del inventario, no el bloque
grueso ni una respuesta del chat. Para cada hoja, el planificador debe poder
representar al menos estos estados semánticos (los nombres de implementación
pueden variar):

| Estado | Significado | ¿Terminal? |
| --- | --- | --- |
| `unavailable` | El control/binding no existe en Asistente para este borrador. | Fuera del denominador |
| `pending` | Disponible, pero sin valor ni decisión confiable. | No |
| `needs_clarification` | Hay un dato parcial, ambiguo o conflictivo. | No |
| `requires_control` | Solo puede resolverse mediante uploader, Gallery o Places. | No |
| `resolved_from_user` | El usuario lo informó o decidió explícitamente. | Sí |
| `resolved_from_existing_user_data` | Existe evidencia confiable de personalización previa. | Sí |
| `resolved_by_rule` | Una regla segura y documentada fijó el valor. | Sí |
| `resolved_by_control` | El control confiable completó la interacción y el borrador refleja el resultado. | Sí |
| `not_applicable_by_dependency` | Una decisión terminal de su parent lo vuelve inoperante; por ejemplo, Party en modo single u opciones de una pregunta que no es `single_select`. | Sí |

`completed` es solo un estado agregado. No reemplaza la procedencia anterior.
`coveredCapabilityIds` o una negativa almacenada en el chat tampoco prueban por
sí solos completitud: tras cada turno se relee el borrador y se reconcilia el
ledger.

### 5.2 Definición formal de completitud

Sea `A(draft)` el conjunto de hojas estructuralmente disponibles del inventario:
sus bindings/targets existen o pertenecen a una configuración siempre editable
de Asistente. Incluye hojas temporalmente inoperantes por un parent, como Party
en modo single. El flujo está completo solo si para todo `v` en `A(draft)` se
cumple una de estas condiciones:

1. `v` tiene un estado terminal con procedencia válida; o
2. `v` quedó `not_applicable_by_dependency` por una decisión terminal de su
   parent.

En forma compacta:

```text
complete(draft) = every(value in A(draft), isTerminal(value.status))
```

La pregunta “¿qué valores de Asistente todavía no fueron correctamente
tratados?” se responde con todas las hojas no terminales. La conversación solo
cierra cuando esa lista es vacía.

Dependencias relevantes:

- Party queda no aplicable en `single`, pero vuelve a evaluarse si el modo cambia
  a `ceremony_party`;
- el texto de Dress Code queda no aplicable mientras Dress Code está apagado,
  aunque se preserve su valor;
- con RSVP apagado, la visibilidad funcional del CTA queda inactiva, pero
  preguntas, orden y modal siguen siendo capacidades editables de Asistente. Si
  el usuario decide no personalizarlas mientras RSVP está apagado, se resuelven
  mediante la regla documentada de preservar su configuración normalizada, no
  como `not_applicable_by_dependency`;
- propiedades de una pregunta inactiva quedan no aplicables, sin borrar su
  configuración;
- opciones quedan no aplicables si el tipo no es `single_select`;
- con Regalos apagado, el CTA queda inactivo, pero métodos, intro y texto del
  botón siguen siendo editables. Una decisión de no personalizarlos los resuelve
  mediante la regla de preservar su configuración normalizada;
- ocultar un método resuelve su visibilidad; su valor conservado debe quedar
  resuelto por una decisión previa o por la regla explícita de preservación, no
  desaparecer del ledger;
- la decisión de orden de Gallery solo aplica cuando hay al menos dos fotos
  pobladas.

Cambiar un parent reabre todas las hojas que vuelvan a ser aplicables. Un error
de validación o de control nunca transforma una hoja en terminal.

### 5.3 Procedencia de valores existentes

Un valor no vacío no es sinónimo de un dato real de la pareja. El planificador
debe distinguir, sin enviar canvas completo:

- `user_current_session`: informado o decidido en la conversación actual;
- `existing_user_data`: personalización previa demostrable;
- `automatic_rule`: producido por una regla de este contrato;
- `system_default`: default estable del producto que una regla permite aceptar;
- `template_value`: contenido heredado del diseño;
- `placeholder_or_sample`: ejemplo, placeholder o dato demostrativo;
- `unknown`: no hay evidencia suficiente de su origen.

Son evidencia admisible la personalización ya registrada por los owners
actuales, cambios explícitos del usuario y comparación con un baseline de
template cuando exista. El historial del chat no puede contradecir el borrador.
Si la procedencia no puede probarse, se clasifica como `unknown`, no como
`existing_user_data`.

Valores como `Borgoña · Floral contemporánea`, nombres de ejemplo, lugares de
muestra, copy temático y fotos heredadas no se consideran personalizados por
estar presentes. Nunca se inicia preguntando si se quiere conservar el nombre
de la plantilla. Se reemplazan por una regla segura o se tratan dentro del
bloque natural correspondiente.

Los defaults estables del sistema pueden cerrarse mediante reglas explícitas:

- la hora de fin opcional queda vacía si el usuario no indicó una;
- el nombre opcional del lugar queda vacío si una dirección inequívoca basta;
- labels, tipos, required y opciones del catálogo RSVP pueden conservar sus
  defaults cuando el usuario acepta explícitamente un conjunto recomendado;
- título, subtítulo, submit label y color iniciales de RSVP pueden conservar el
  default del sistema si no fueron sustituidos por contenido de plantilla;
- intro y texto funcional del botón de Regalos pueden conservar sus defaults del
  sistema bajo el mismo criterio;
- si el usuario decide mantener RSVP o Regalos apagado y no configurar ahora sus
  opciones internas, la conversación puede preservar toda su configuración
  normalizada mediante `resolved_by_rule`. Esta decisión se registra hoja por
  hoja como `preserve_while_inactive`; no equivale a que esas capacidades no
  existan. Si luego se activa la superficie, las hojas preservadas por esa regla
  se reabren para confirmar o personalizar lo que pasa a ser visible.

Estas reglas reducen preguntas, pero cada aplicación debe dejar procedencia
`resolved_by_rule`. No convierten cualquier contenido de plantilla en default de
sistema.

## 6. Regla automática para el nombre del evento

### 6.1 Fuentes y condición

La regla usa los valores efectivos de `event_primary_person_name` y
`event_secondary_person_name` leídos por el mismo bridge de nombres que utiliza
Asistente. Los targets combinados (`event_couple_names_*`) son consumidores, no
fuentes alternativas.

Ambos nombres están suficientemente definidos cuando, después de trim y
normalización de espacios:

- cada uno contiene al menos un nombre identificable;
- ninguno coincide con un placeholder, ejemplo o valor de template conocido;
- no existe ambigüedad acerca de cuál corresponde a cada persona.

No se exige apellido. Cuando ambos quedan resueltos, el nombre automático es:

```text
Casamiento {Nombre 1} y {Nombre 2}
```

Ejemplo: `Casamiento Ana y Luz`.

### 6.2 Momento de aplicación y prioridad

La derivación se aplica en el mismo lote que completa o corrige ambos nombres,
si el nombre vigente está vacío, es genérico/de template o continúa bajo la
regla automática. Usa las acciones ya permitidas `event.set_people` y
`document.set_name`; no requiere una acción nueva.

La elección explícita del usuario tiene prioridad. Si pide “La fiesta de Ana y
Luz”, `document.set_name` guarda ese texto y el nombre pasa a modo explícito. La
regla automática existe para evitar una pregunta, no para quitar la capacidad
de nombrar el borrador.

### 6.3 Correcciones y sincronización

Mientras el nombre esté gestionado por la regla, corregir cualquiera de los
nombres debe recalcularlo en el mismo lote. Por ejemplo, cambiar `Luz` por
`Lucía` produce `Casamiento Ana y Lucía`.

Un nombre explícito nunca se sobreescribe al cambiar los nombres de las
personas. La procedencia automática/explícita debe poder reconstruirse desde el
borrador o metadata del owner del nombre, no solo desde el historial efímero. Un
cambio manual del input `Nombre del evento` en Asistente se considera explícito.
Asistente y Designer AI deben compartir esta política para que alternar tabs o
recargar no rompa la sincronización.

Si no hay procedencia persistida, solo es segura la actualización cuando el
nombre actual coincide con el resultado automático calculado antes del cambio.
En cualquier otro caso se preserva y se trata como explícito/ambiguo; nunca se
sobrescribe por heurística destructiva.

## 7. Estrategia conversacional

### 7.1 Principios

La conversación debe sentirse como acompañamiento breve para preparar la
invitación, no como un formulario trasladado al chat:

- preguntar por el evento y el resultado, no por campos o propiedades;
- extraer todos los datos válidos de cada mensaje, aunque pertenezcan a varios
  bloques;
- aplicar en un único lote todas las acciones compatibles;
- reconciliar el borrador y construir la pregunta siguiente desde las hojas que
  realmente sigan no terminales;
- no volver a preguntar un dato resuelto con suficiente certeza;
- preguntar únicamente ante vacío, placeholder, procedencia incierta,
  ambigüedad, dependencia reabierta o control pendiente;
- confirmar brevemente lo que acaba de quedar resuelto y avanzar;
- no mantener una secuencia fija ni un árbol de frases prefabricadas.

La extracción no está limitada al tema de la pregunta. Si al preguntar por la
ceremonia el usuario también informa fiesta, Dress Code y Regalos, se procesan
todos esos datos.

### 7.2 Bloques semánticos recomendados

El orden es una prioridad adaptable, no un wizard rígido:

| Bloque | Hojas que puede reunir | Criterio de pregunta |
| --- | --- | --- |
| Pareja y forma del evento | Ambos nombres; modo | Preguntar nombres juntos. Inferir el modo del relato o aclararlo en una frase corta. El nombre del borrador se deriva. |
| Ceremonia o evento único | Fecha, inicio, fin opcional, lugar, dirección, Places | Pedir cuándo y dónde en una sola pregunta natural. La hora de fin no merece una pregunta aislada. |
| Fiesta | Fecha, inicio, fin opcional, lugar, dirección, Places | Pedir los datos juntos; derivar misma fecha solo con contexto inequívoco. |
| Información para invitados | Dress Code; story si existe | No mezclar ambos si exige una respuesta extensa. Resolver activación y contenido. |
| Asistencia | Activación; conjunto/orden/configuración de preguntas; modal | Primero decidir si habrá RSVP. Si sí, ofrecer un conjunto razonable y permitir describir ajustes en lenguaje natural. |
| Regalos | Activación; métodos/visibilidad; intro; botón | Primero decidir si se mostrará. Si sí, pedir los medios relacionados juntos y aplicar defaults documentados cuando corresponda. |
| Imágenes | Portada existente; slots y orden de cada Gallery | Ofrecer el control para una superficie a la vez. Preguntar conservar/reemplazar solo cuando la procedencia actual no sea de usuario. |

Normalmente una intervención pregunta por un bloque. Puede combinar dos bloques
estrechamente relacionados si la frase sigue siendo corta —por ejemplo, nombres
y panorama de ceremonia—, pero no enumera una lista extensa de temas. La menor
cantidad razonable de intercambios se obtiene extrayendo bien las respuestas, no
apilando todo en una sola pregunta.

### 7.3 Planificación de la próxima pregunta

Después de cada respuesta:

1. interpretar el mensaje completo contra todas las capacidades disponibles;
2. resolver referencias con borrador + últimos turnos, dando prioridad al
   borrador;
3. prevalidar y aplicar todas las acciones válidas juntas;
4. releer el borrador y reconciliar el ledger hoja por hoja;
5. confirmar solo los cambios relevantes del turno;
6. seleccionar el bloque de mayor prioridad que aún contenga hojas no
   terminales;
7. formular una pregunta breve que pueda resolver varias hojas relacionadas;
8. si no queda ninguna, cerrar.

No se marca como cubierta una capacidad solo porque el usuario cambió de tema.
“Después vemos las fotos” mantiene sus hojas pendientes; “dejemos las fotos como
están” puede resolverlas si el usuario acaba de tomar una decisión informada
sobre las fotos visibles.

### 7.4 Confirmaciones

Las confirmaciones son proporcionales y enlazan naturalmente con lo siguiente:

- `Listo, ceremonia el 14 de noviembre a las 18 y fiesta a las 21. ¿Quieren indicar algún dress code?`
- `Perfecto, ya quedó.`
- `Bien, dejamos elegante sport. Ahora vemos la confirmación de asistencia.`

No se listan action types, IDs ni estados internos. Tampoco se repite toda la
información acumulada en cada turno.

## 8. Controles especiales

No todo se resuelve escribiendo. La conversación conduce al control real y
mantiene uno solo activo a la vez:

- `Nos falta la portada. Elegí la foto que quieran usar.` abre el uploader de
  portada existente;
- `Ahora pueden elegir la foto para la segunda celda de la galería.` monta el
  flujo Gallery acotado al `galleryId` y slot vigentes;
- `Para ubicarlo con precisión, elegí una sugerencia del lugar.` monta el bloque
  actual de Google Places para Ceremony o Party.

Al completar o cerrar el control, Designer AI relee el borrador. Solo el cambio
real reflejado produce `resolved_by_control`; abrir el control no basta. Uploads,
assets, URLs y metadata de Places no se incorporan a OpenAI.

Estos montajes no agregan `data-assistant-tour-*`, anchors, substeps de tour ni
lógica de navegación. Abrir Designer AI mantiene `assistantActive=false` y el
Guided Tour recibe `mounted:false`.

## 9. Correcciones posteriores y conflictos

El usuario puede corregir cualquier valor autorizado aunque estuviera terminal:

- `Al final la fiesta empieza a las 21:30` actualiza solo ese horario;
- `Mejor no mostremos el CUIT` cambia su visibilidad y preserva el valor;
- `Sumemos una pregunta por transporte` activa/configura la pregunta existente;
- `Prefiero que se llame Nuestra fiesta` vuelve explícito el nombre del evento.

La corrección invalida la resolución anterior, se aplica por el owner existente
y vuelve a terminal solo después de releer el borrador. Si afecta dependencias,
se reabre lo necesario: activar Party vuelve pendientes sus datos; cambiar una
pregunta a `single_select` abre la resolución de opciones; activar Regalos exige
al menos un método visible y completo.

Ante dos interpretaciones plausibles, no se elige silenciosamente: se confirma
solo la ambigüedad concreta. Nunca se deshacen valores no mencionados.

## 10. Tono, inicio, fuera de alcance y cierre

### 10.1 Voz

La voz de Reserva el Día es cálida, simple, cercana, tranquila, contemporánea y
segura. La tecnología queda en segundo plano. Se habla de la pareja, el evento,
los invitados y la invitación; no de campos, snapshots, tools, acciones o
allowlists.

Se evitan emojis, exclamaciones repetidas, elogios automáticos, diminutivos
forzados, romanticismo excesivo y clichés como “el día más mágico”, “amor
eterno” o “hacer realidad sus sueños”.

### 10.2 Inicio recomendado

El primer turno visible siempre incluye una bienvenida breve y la primera
pregunta adaptada a lo que realmente falta. Formulación base:

> Hola, vamos a darle forma a su invitación. Yo los voy guiando y la dejamos
> lista a medida que avanzamos. Para empezar, ¿cómo se llaman y cuándo y dónde es
> la ceremonia?

Si nombres o Ceremony ya son datos personalizados confiables, la segunda frase
pregunta por el primer bloque pendiente en lugar de repetirlos. Nunca comienza
leyendo un nombre técnico/heredado, preguntando si se conserva la plantilla,
explicando que es una IA o enumerando capacidades.

### 10.3 Fuera de alcance

El límite técnico permanece intacto, pero la respuesta es natural:

> Ese cambio de tipografía se hace desde el editor. Por acá puedo ayudarte con
> los datos del evento, la asistencia, los regalos y las fotos que ya están en la
> invitación. Nos quedaba definir el dress code, ¿quieren indicar alguno?

La respuesta no menciona “acción inválida” ni “fuera de la allowlist”. Si el
mismo mensaje contiene además datos válidos, esos datos se aplican; se rechaza
solo la parte fuera de alcance y se continúa con el flujo pendiente.

### 10.4 Cierre

Cuando y solo cuando el ledger no contiene hojas disponibles no terminales:

> Listo, ya tenemos todo. La información de la invitación quedó preparada. Si
> después quieren cambiar algo, pueden volver por acá.

No se generan preguntas artificiales, recomendaciones adicionales ni una
revisión de todo el formulario.

## 11. Ejemplos normativos

Los textos son ejemplos de dinámica, no un catálogo rígido de respuestas.

### 11.1 Mucha información en un solo mensaje

Contexto: el borrador tiene bindings de Ceremony, Party, Dress Code e Historia;
una portada de template, una Gallery de tres slots, RSVP y Regalos.

**Diseñador AI**

> Hola, vamos a darle forma a su invitación. Yo los voy guiando y la dejamos
> lista a medida que avanzamos. ¿Cómo se llaman y cuándo y dónde es la ceremonia?

**Usuario**

> Somos Ana y Luz. Nos casamos el 14 de noviembre de 2026 a las 18 en la
> Parroquia San José, Diego Palma 215, San Isidro. Después festejamos a las 21 en
> Estancia La Linda, Ruta 8 km 47. El dress code es elegante sport.

**Diseñador AI**

> Listo: ceremonia el 14 de noviembre a las 18 y fiesta ese día a las 21. Dejamos
> elegante sport. ¿Quieren sumar un texto breve sobre ustedes en la invitación?

Resultado del turno, sin exponerlo en el chat: resuelve ambos nombres, deriva
`Casamiento Ana y Luz`, infiere `ceremony_party`, aplica fecha/horarios/lugares y
activa Dress Code. Las horas de fin quedan vacías por la regla opcional. Si las
direcciones requieren precisión cartográfica, el control Places se ofrece antes
de dar cada ubicación por resuelta.

**Usuario**

> No, dejemos la historia vacía. Sí queremos confirmación: solo nombre y apellido,
> asistencia, cantidad de personas y alergias. Nombre y asistencia obligatorios;
> el resto opcional. Dejemos los textos estándar del formulario.

**Diseñador AI**

> Perfecto, la confirmación quedó con esas cuatro preguntas. ¿Quieren mostrar
> opciones de regalo?

La palabra “solo” resuelve también la inactividad de todo el resto del catálogo;
los labels, tipos, opciones y modal estándar quedan `resolved_by_rule` según la
elección explícita.

**Usuario**

> Sí. Mostremos alias `ANA.LUZ`, CBU `0000000000000000000000` y titular Ana Pérez.
> Ocultemos banco, CUIT y lista externa. El texto introductorio puede quedar como
> está y el botón que diga “Ver regalos”.

**Diseñador AI**

> Bien, ya quedaron listos los datos de regalos. Nos falta elegir las imágenes.
> Empecemos por la portada.

**Control local de portada**

> La pareja elige y sube una foto. El borrador refleja la nueva portada.

**Diseñador AI**

> Portada lista. Ahora elijan las tres fotos de la galería; después pueden
> ordenarlas como prefieran.

**Control local de Gallery**

> La pareja completa los tres slots y ordena las fotos. El borrador refleja las
> mutaciones de la Gallery existente.

**Diseñador AI**

> Listo, ya tenemos todo. La información de la invitación quedó preparada. Si
> después quieren cambiar algo, pueden volver por acá.

### 11.2 Respuestas progresivas

Contexto: invitación de evento único, sin binding de Historia ni superficies de
Fotos. RSVP y Regalos todavía no tienen decisiones de usuario.

**Diseñador AI**

> Hola, vamos a preparar su invitación de a poco. ¿Cómo se llaman?

**Usuario**

> Martina y Juan.

**Diseñador AI**

> Perfecto, ya quedó a nombre de Martina y Juan. ¿Cuándo y dónde es el evento?

El borrador se llama automáticamente `Casamiento Martina y Juan`.

**Usuario**

> El 6 de marzo de 2027.

**Diseñador AI**

> Anotado el 6 de marzo. ¿A qué hora empieza y en qué lugar es?

**Usuario**

> A las ocho de la noche, en Salón del Río.

**Diseñador AI**

> Listo, empieza a las 20. Me falta la dirección del salón.

**Usuario**

> Costanera 450, Rosario. No vamos a poner dress code.

**Diseñador AI**

> Bien, ya quedó la ubicación y no mostramos dress code. ¿Quieren pedir
> confirmación de asistencia?

**Usuario**

> No, ni confirmación ni regalos.

**Diseñador AI**

> Listo, ya tenemos todo. La información de la invitación quedó preparada. Si
> después quieren cambiar algo, pueden volver por acá.

La ausencia de Historia/Fotos no genera preguntas; esas hojas están
`unavailable`. Desactivar RSVP y Regalos, junto con la decisión de no
personalizarlos por ahora, resuelve sus configuraciones hoja por hoja mediante
la regla `preserve_while_inactive`, sin recorrerlas una por una. No las clasifica
como inexistentes: si luego se activan, vuelven a evaluarse.

### 11.3 Corrección y pedido fuera de alcance

**Usuario**

> Al final la fiesta es a las 21:30 y quiero poner todos los textos en dorado.

**Diseñador AI**

> Listo, la fiesta empieza a las 21:30. El color de los textos se cambia desde el
> editor. Por acá seguimos con los datos de la invitación; nos falta definir si
> quieren mostrar opciones de regalo.

La acción válida se aplica y la parte fuera de alcance se rechaza sin perder el
hilo ni ampliar capacidades.

## 12. Implementación vigente del contrato

El runtime implementa este contrato mediante una sola capa compartida:

- `shared/designerAiConversationLedger.cjs` enumera las hojas estructurales,
  estados, procedencias, dependencias, reglas terminales, bloques y política de
  nombre. Functions recibe una copia mecánica por el sincronizador existente;
- `buildDesignerAiCapabilitySnapshot` relee los bridges vigentes y construye el
  ledger. La revisión incluye valores mínimos, fingerprints y resoluciones; no
  existe cobertura por IDs agregados ni `coveredCapabilityIds`;
- `DesignerAiPanel` pre-valida el lote, lo aplica por el executor existente,
  relee el borrador y recién entonces reconcilia y persiste metadata. Un control
  local solo resuelve su hoja cuando cambia el fingerprint real del target;
- `designerAiChat` interpreta todas las hojas del mensaje, devuelve acciones y
  resoluciones estructuradas, y vuelve a validarlas. El brief prioriza el primer
  bloque con hojas no terminales, no un paso fijo;
- `designerAiConversation` persiste baseline, procedencia, reglas y la política
  automática/explícita del nombre, pero no duplica valores, canvas ni chat;
- al resolver o corregir ambos nombres, backend agrega
  `document.set_name` con `Casamiento {Nombre 1} y {Nombre 2}` solo cuando la
  política lo permite. Las ediciones manuales del nombre quedan explícitas y las
  ediciones de nombres en Asistente recalculan el nombre mientras siga automático.

La versión del protocolo de snapshot/resoluciones es `2.0.0`. La lista y los
shapes de acciones autorizadas permanecen sin cambios.

## 13. Autorización, OpenAI e aislamiento

La visibilidad frontend requiere `loadingAdminAccess === false`,
`isSuperAdmin === true`, sesión `draft`, estado editable y no selector. Perder
una condición desmonta el panel. El callable ejecuta `requireSuperAdmin` antes de
procesar payload o secret.

Solo Functions importa el SDK oficial `openai`. `designerAiChat` usa
`defineSecret("OPENAI_API_KEY")`, Responses API, `store:false`, una función
estricta y sin `previous_response_id`. El navegador nunca recibe SDK ni key.

El contexto remoto contiene únicamente valores relevantes, disponibilidad,
procedencia mínima necesaria y ledger de completitud. No contiene objetos,
secciones, canvas, geometría, media URLs, paths/tokens de Storage ni metadata de
Firestore. Los logs no contienen prompts, valores privados, chat ni secrets.

Diseñador AI no participa del Guided Tour: no agrega
`data-assistant-tour-*`, steps, anchors, targets, preferencias, observers ni
overlay. Asistente conserva su navegación, markup y comportamiento.

## 14. Criterios de verificación documental para una implementación futura

Una implementación cumple este contrato cuando puede demostrar:

1. paridad entre cada hoja disponible del inventario de Asistente y su vía
   conversacional/control;
2. procedencia que no confunde datos de template con datos de usuario;
3. aplicación automática y sincronización segura del nombre del evento;
4. extracción multiacción de una sola respuesta;
5. selección de la próxima pregunta desde el ledger reconciliado, no desde una
   secuencia rígida;
6. cierre solo con cero hojas no terminales;
7. correcciones que reabren dependencias y preservan valores no mencionados;
8. controles locales para Places y media sin datos sensibles en OpenAI;
9. rechazo natural de pedidos fuera de alcance;
10. ausencia de regresiones en Asistente, persistencia y Guided Tour.

Anclas actuales de código y tests:

- `src/domain/editor/assistantMode.js`
- `src/domain/editor/assistantSubsteps.js`
- `src/components/MiniToolbarTabDetallesEvento.jsx`
- `src/components/MiniToolbarTabTexto.jsx`
- `src/components/MiniToolbarTabImagen.jsx`
- `src/components/MiniToolbarTabRsvp.jsx`
- `src/components/MiniToolbarTabRegalos.jsx`
- `src/domain/editor/designerAiCapabilities.js`
- `src/domain/editor/designerAiActionExecutor.js`
- `shared/designerAiCapabilityContract.cjs`
- `functions/src/designerAi/service.ts`
- `shared/designerAiCapabilityContract.test.mjs`
- `src/domain/editor/designerAiCapabilities.test.mjs`
- `src/domain/editor/designerAiActionExecutor.test.mjs`
- `functions/designerAiService.test.mjs`
- Assistant/Guided Tour anchors de `GUIDED_TOUR_SYSTEM.md`
