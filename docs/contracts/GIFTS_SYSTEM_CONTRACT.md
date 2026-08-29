# Gifts System Contract

Status: Canonical Contract.

## 1. Propósito y autoridad

Este documento es el entry point canónico del dominio **Regalos**. Define la
semántica funcional que deben compartir editor, preview, publicación y clientes
como `Diseñador AI`: activación, modalidades soportadas, visibilidad independiente,
completitud y comportamiento al conservar, mostrar u ocultar datos.

La autoridad continúa dividida sin duplicar owners:

- el shape persistido exacto de `gifts` pertenece a
  [DATA_MODEL.md](../architecture/DATA_MODEL.md);
- el CTA `regalo-boton`, su readiness y la apertura del modal en preview/publish
  pertenecen a
  [PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md](PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md);
- las actions accesibles para `Diseñador AI`, sus argumentos y validación
  pertenecen a
  [DESIGNER_AI_CAPABILITY_CONTRACT.md](DESIGNER_AI_CAPABILITY_CONTRACT.md) y al
  schema compartido;
- el copy, tono y forma de preguntar pertenecen a
  [AI_ASSISTANT_CONVERSATION_CONTRACT.md](AI_ASSISTANT_CONVERSATION_CONTRACT.md).

Antes de este contrato no existía un owner funcional enfocado equivalente. El
modelo de datos describía el shape y el contrato de interactividad describía el
CTA publicado, pero ninguno gobernaba por sí solo la experiencia completa de
configuración de Regalos.

## 2. Owners reales verificados

| Responsabilidad | Owner actual |
| --- | --- |
| Normalización cliente | `src/domain/gifts/config.js` |
| Normalización server | `functions/src/gifts/config.ts` |
| Control de editor/Asistente | `src/components/MiniToolbarTabRegalos.jsx` |
| Bridge hacia el estado del canvas | `src/components/editor/canvasEditor/useCanvasEditorGiftBridge.js` |
| Sincronización del CTA | `src/domain/functionalCtaButtons.js` y eventos del editor |
| Readiness de CTA | `functions/src/utils/functionalCtaContract.ts` |
| Validación de preview/publicación | `functions/src/render/prepareRenderPayload.ts` |
| Modal generado | `functions/src/utils/generarModalRegalos.ts` |
| Snapshot y actions de Diseñador AI | `src/domain/editor/designerAiCapabilities.js`, `src/domain/editor/designerAiActionExecutor.js` y `shared/designerAiCapabilityContract.cjs` |

No debe crearse una config paralela dentro del CTA, del chat o del prompt. El
root `gifts` conserva los datos funcionales; `regalo-boton` conserva únicamente
su representación visual y el disparador de apertura.

## 3. Modalidades soportadas

Regalos no persiste un enum de modalidad excluyente. La experiencia soporta
combinaciones de estos medios:

1. **Datos bancarios**, con los campos reales `holder` (Titular), `bank`
   (Banco o billetera), `alias`, `cbu` (presentado como CBU / CVU) y `cuit`.
2. **Lista externa**, representada por `giftListUrl` y controlada por
   `visibility.giftListLink`.
3. **Combinación de ambos**, porque cada dato bancario y el enlace externo tienen
   visibilidad independiente.

No existe hoy un campo separado para CVU, número de cuenta, moneda, SWIFT, IBAN,
mensaje por método ni proveedor de lista. No deben inventarse campos o
modalidades desde el prompt. Una ampliación comienza en el modelo/normalizador
del dominio y recién después alcanza a Designer AI.

### 3.1 Decisión proactiva del recorrido guiado

Cuando `guidedFlow` llega a Regalos, la primera decisión funcional debe distinguir
entre estas dos vías principales:

1. enlazar una **lista de regalos externa** confeccionada en otro servicio; o
2. mostrar **uno o más datos bancarios** directamente en la invitación.

No corresponde iniciar el bloque preguntando Alias, CBU ni otro campo bancario
antes de conocer esa elección. Tampoco hace falta una pregunta proactiva separada
sobre texto introductorio o texto del botón. Si el usuario rechaza por completo
la sección, `enabled:false` continúa siendo una decisión válida y terminal para
este bloque.

Esta elección organiza el recorrido, pero no agrega un enum persistido ni vuelve
excluyente al modelo de datos. El shape actual permite combinar medios. Si el
usuario pide explícitamente una combinación —al iniciar el bloque o más tarde—,
se respetan los valores y visibilidades solicitados mediante los mismos owners.
La conducción proactiva, en cambio, sigue una sola vía y no agrega preguntas de
la otra modalidad una vez que la primera quedó resuelta.

Para **lista externa**:

- se solicita el enlace, sin inventarlo ni completarlo;
- el enlace debe normalizar a `http` o `https`;
- `giftListUrl` conserva el valor y `visibility.giftListLink:true` lo expone;
- no se solicitan datos bancarios;
- valores bancarios heredados pueden conservarse, pero quedan ocultos salvo
  elección explícita del usuario.

Para **datos bancarios**:

- se acepta cualquier subconjunto no vacío de `holder`, `bank`, `alias`, `cbu`
  y `cuit`;
- un solo campo válido alcanza; no se exige completar los cinco;
- se aprovechan todos los campos aportados en el mismo mensaje;
- no se solicita completar campos restantes una vez que existe al menos un dato
  visible válido y las visibilidades no confirmadas quedaron resueltas según la
  sección 4.

## 4. Representación y visibilidad

`DATA_MODEL.md` es la autoridad del shape. Funcionalmente:

| Dato | Valor persistido | Preferencia de exposición |
| --- | --- | --- |
| Titular | `gifts.bank.holder` | `gifts.visibility.holder` |
| Banco o billetera | `gifts.bank.bank` | `gifts.visibility.bank` |
| Alias | `gifts.bank.alias` | `gifts.visibility.alias` |
| CBU / CVU | `gifts.bank.cbu` | `gifts.visibility.cbu` |
| CUIT | `gifts.bank.cuit` | `gifts.visibility.cuit` |
| Lista externa | `gifts.giftListUrl` | `gifts.visibility.giftListLink` |

Reglas normativas:

- valor y visibilidad son decisiones distintas;
- ocultar un dato no debe borrar su valor;
- un valor oculto no se muestra en el modal ni se usa para afirmar que el
  usuario eligió publicarlo;
- mostrar un dato exige un valor completo después de normalización;
- el modal omite campos vacíos aunque su flag esté activo;
- el enlace externo solo es utilizable si normaliza a una URL `http` o `https`;
- `enabled:false` conserva los valores normalizados, pero desactiva el CTA y las
  asociaciones funcionales de Regalos.

El control actual del editor activa automáticamente la visibilidad al ingresar
un valor desde esa UI, y `Quitar de datos visibles` conserva el valor. Designer
AI dispone de una action que recibe valor y visibilidad juntos, por lo que debe
respetar explícitamente pedidos como conservar CBU/CUIT ocultos mientras muestra
Alias, Banco y Titular.

### 4.1 Visibilidad durante el recorrido de Designer AI

Al configurar la vía bancaria desde el recorrido guiado, la regla por defecto es
determinista:

- cada campo bancario que el usuario aporta y decide utilizar queda con su valor
  normalizado y `visibility.<field>:true`;
- cada campo bancario que el usuario **no** aporta queda con
  `visibility.<field>:false` y no bloquea la progresión;
- elegir la vía bancaria deja `visibility.giftListLink:false`, salvo que el
  usuario también haya pedido explícitamente conservar o mostrar una lista;
- elegir la vía de lista externa deja ocultos los campos bancarios no confirmados;
- ocultar no obliga a borrar: los valores existentes pueden conservarse en el
  root para una edición posterior.

“Aportado por el usuario” requiere evidencia de una decisión actual o previa
conservada por el contrato de conversación. La mera presencia de un valor o flag
en el draft no alcanza si proviene de la plantilla, un default, placeholder o
muestra. En particular, la normalización histórica puede producir visibilidad
default para Alias/CBU; Designer AI debe sobrescribir esos flags al configurar el
bloque y no tratarlos como consentimiento.

Ejemplo normativo: si el draft heredado contiene los cinco valores pero el
usuario aporta únicamente Alias y Titular, el resultado funcional es Alias y
Titular visibles con los valores aportados; CBU, Banco y CUIT ocultos. Su valor
heredado puede conservarse, pero no se presenta en el modal ni cuenta como una
elección confirmada.

## 5. Completitud y validaciones

Estados funcionales relevantes:

| Estado | Resultado |
| --- | --- |
| Regalos desactivado por decisión del usuario | Configuración válida para continuar el flujo; no se piden métodos. |
| Regalos activo sin método visible completo | No está listo como CTA funcional. |
| Regalos activo con al menos un método visible completo | Puede tener CTA funcional. |
| Algún dato visible sin valor, aunque exista otro método completo | El modal omite el dato incompleto y preview/publicación emiten la advertencia correspondiente. |
| Dato con valor pero oculto | Se conserva; no aparece en el modal. |

Para que el CTA publicado esté listo deben coexistir root `gifts`,
`enabled:true`, `regalo-boton` y al menos un método visible completo. Activar
Regalos desde los controles existentes puede crear o volver a mostrar el CTA;
esa creación acotada pertenece al owner funcional, no habilita creación genérica
de objetos.

La normalización limita texto, sanea flags y URLs, pero no valida semánticamente
que Alias, CBU o CUIT pertenezcan a una cuenta real. El sistema no debe afirmar
esa verificación ni inferir números bancarios o URLs.

### 5.1 Completitud específica de `guidedFlow`

La completitud del bloque guiado es más acotada que el inventario total de
capabilities y no exige recorrer todas las propiedades de `gifts`:

| Decisión efectiva | Condición terminal del bloque |
| --- | --- |
| No incluir Regalos | `enabled:false` respaldado por decisión del usuario. |
| Lista externa | `enabled:true`, `giftListUrl` válido y `visibility.giftListLink:true`. |
| Datos bancarios | `enabled:true` y al menos uno de `holder`, `bank`, `alias`, `cbu` o `cuit` con valor normalizado no vacío y visibilidad activa. |
| Combinación explícita | Todos los medios que el usuario pidió en ese intercambio quedaron aplicados; al menos uno es visible y completo. |

En la vía bancaria, los campos no aportados quedan ocultos y se consideran
resueltos para el recorrido; no son datos faltantes. `introText` y el texto del
`regalo-boton` tampoco son pendientes del flujo principal: conservan sus valores
actuales/default y permanecen disponibles ante pedidos explícitos.

El bloque no está resuelto si se eligió lista externa pero falta una URL válida,
si se eligieron datos bancarios pero todavía no existe ningún dato visible
completo, o si la ejecución/persistencia no pudo verificarse. La existencia de un
valor heredado visible no sustituye la decisión del usuario.

## 6. Controles y comportamiento visible

`MiniToolbarTabRegalos.jsx` expone actualmente:

- el switch `Mostrar opciones de regalos`;
- la lista de datos visibles, con estado completo/incompleto;
- alta, edición y ocultamiento independiente de medios;
- ajustes del texto introductorio y del texto del botón;
- creación/visibilidad del CTA y vista previa local del modal.

Preview y publicación muestran solo los métodos visibles completos. Los datos
bancarios se presentan con acción de copiar y la lista externa abre un enlace en
otra pestaña con aislamiento `noopener noreferrer`.

La visibilidad funcional de secciones o grupos asociados a Regalos deriva de
`gifts.enabled`; no se agrega otro switch en secciones, CTA o Designer AI.

## 7. Superficie de Diseñador AI

Designer AI puede, si el snapshot vigente declara disponible Regalos:

- habilitar o deshabilitar la sección;
- configurar valor y visibilidad de cada uno de los seis medios allowlisted;
- cambiar texto introductorio;
- cambiar texto del botón.

No puede inventar datos, verificar titularidad bancaria, crear otro tipo de
modal, agregar campos, cambiar estilos/layout del CTA ni eludir la sanitización
de URL. El inventario exacto y la validación pertenecen al capability contract.

En el recorrido guiado principal, Regalos se consulta después de los datos del
evento. La primera pregunta presenta la decisión lista externa/datos bancarios.
Una negativa completa a la sección resuelve el bloque sin preguntas adicionales.
Elegida una vía, se solicita solo su dato mínimo faltante, se aprovechan varios
valores incluidos en un mismo mensaje y se aplican las reglas de visibilidad de
la sección 4.1. `introText` y texto del botón son capabilities reactivas: no se
preguntan proactivamente ni bloquean el avance a Dress Code.

## 8. Evidencia y fallas

Una action propuesta no prueba que Regalos quedó configurado. La confirmación
requiere ejecución por los owners existentes y reread del borrador. Si una URL
resulta inválida, un método visible queda vacío, el CTA no queda listo o falla el
bridge, el asistente debe mantener el bloque pendiente y no afirmar éxito.

Desactivar Regalos no equivale a borrar sus valores. Reactivarlo reabre las
decisiones internas que el ledger haya preservado mientras estaba inactivo.

### 8.1 Estado de implementación verificado al 2026-08-28

Implementado actualmente:

- shape y normalización V1, cinco campos bancarios y lista externa;
- flags de visibilidad independientes y conservación de valores ocultos;
- actions `gifts.set_enabled`, `gifts.set_method`, `gifts.set_intro_text` y
  `gifts.set_button_text`;
- ejecución por el bridge existente, sincronización de `regalo-boton`,
  persistencia en el draft y reread dentro del snapshot;
- URL externa saneada y readiness con al menos un método visible completo.

Gap de runtime respecto de este contrato:

- `shared/designerAiConversationLedger.cjs` incorpora hoy, al activar Regalos,
  todas las hojas `gifts.method.*`, `gifts.intro_text` y `gifts.button_text` al
  `guidedFlow`; por eso todavía puede bloquear el avance por campos y textos que
  este contrato define como opcionales/reactivos;
- las instrucciones runtime solo exigen “al menos un método visible y completo”:
  todavía no garantizan por sí mismas que la primera decisión sea lista externa
  frente a datos bancarios, ni que todos los defaults no confirmados queden
  ocultos;
- no existe una action nueva necesaria para corregirlo: el gap corresponde a la
  selección de hojas/completitud del ledger, a la composición de las actions
  existentes y a sus tests. Esta tarea documental no modifica ese runtime.
- `gifts` no persiste procedencia por campo. Baseline, source context y
  resoluciones del ledger aportan evidencia para usos posteriores, pero un draft
  template-derived que recibió ediciones manuales de Regalos antes de su primer
  baseline puede no distinguirlas inequívocamente de defaults heredados. El
  runtime futuro no debe resolver esa ambigüedad por mera presencia del valor;
  el tratamiento de compatibilidad —por ejemplo, pedir una confirmación única—
  requiere una decisión de producto/migración separada.

## 9. Ejemplos funcionales normativos

Los casos siguientes describen resultados y reglas durables. No son respuestas
literales que el modelo deba repetir.

| Caso | Resultado recomendado | Resultado que debe evitarse | Regla protegida |
| --- | --- | --- | --- |
| Elección inicial | Presentar lista externa y datos bancarios como las dos vías del bloque; aceptar una negativa completa si el usuario la expresa. | Empezar pidiendo CBU/Alias o preguntar primero por textos accesorios. | Modalidad antes que campos. |
| Lista externa | Pedir solo el link, normalizarlo, mostrarlo y continuar tras evidencia. | Pedir datos bancarios, inventar/completar la URL o afirmar una integración con el proveedor. | Vía externa acotada. |
| Un único dato bancario | Conservar y mostrar ese dato, ocultar los otros cuatro y completar el bloque. | Exigir Banco, CBU, CUIT y Titular restantes. | Subconjunto no vacío suficiente. |
| Varios datos bancarios | Aplicar todos en un lote, visibles, y ocultar los no aportados. | Repreguntar cada valor o mantener visibles defaults no confirmados. | Flujo adaptable y visibilidad derivada. |
| Todos los datos bancarios | Persistir los cinco valores y mostrarlos, después del reread. | Omitir uno, mezclarlos o afirmar validación bancaria externa. | Fidelidad y evidencia. |
| Plantilla con defaults | Reemplazar los aportados; ocultar todo default no confirmado aunque conserve su valor. | Mantener Alias/CBU u otro dato visible solo porque la plantilla lo traía. | Default no equivale a consentimiento. |
| Modalidad y datos en un mensaje | “Datos bancarios + Alias + Titular” habilita la sección y aplica ambos campos sin repetir preguntas. | Preguntar otra vez la modalidad, Alias o Titular; exigir campos adicionales. | Aprovechamiento de información adelantada. |
| Texto introductorio explícito | Aplicar `gifts.set_intro_text` ante el pedido y verificarlo. | Negarlo por ser opcional o convertirlo en requisito del recorrido. | Capability reactiva. |
| Texto del botón explícito | Aplicar `gifts.set_button_text`, sincronizar el CTA y verificarlo. | Cambiarlo sin pedido o usarlo como condición de completitud. | Copy del CTA reactivo. |
| Recorrido sin pedidos de copy | Conservar intro y botón actuales/default y avanzar cuando la modalidad esté resuelta. | Preguntar proactivamente qué introducción o etiqueta quiere. | Ajustes opcionales fuera del interrogatorio. |

## 10. Tests y mantenimiento

Anclas actuales:

- `src/domain/gifts/config.test.mjs`
- `src/domain/functionalCtaButtons.test.mjs`
- `functions/publicationPublishValidation.test.mjs`
- `functions/renderContractCompatibility.test.mjs`
- `shared/functionalAssociations.test.mjs`
- `shared/previewPublishParity.test.mjs`
- `src/domain/editor/designerAiCapabilities.test.mjs`
- `src/domain/editor/designerAiActionExecutor.test.mjs`
- `shared/designerAiCapabilityContract.test.mjs`
- `shared/designerAiConversationLedger.test.mjs`
- `docs/testing/EDITOR_REGRESSION_CHECKLIST.md`

Un cambio de campos, normalización, visibilidad o completitud debe actualizar
primero los owners de Gifts y `DATA_MODEL.md`; luego, según la superficie
afectada, el contrato de interactividad, Designer AI, preview/publicación y sus
tests. Este documento no debe copiar schemas ejecutables ni copy conversacional.
