# Diseñador AI — evidencia del hardening P0

Fecha: 2026-09-27. Alcance: implementación local, sin deploy, commit, push,
operaciones en producción ni cambios remotos de Firebase. Base:
`main`, `c5f8c6210401a615406b2750c29982a550a69e5f`; árbol inicial limpio.

## Correcciones posteriores a la revisión adversarial

La revisión del primer P0 dio **CHANGES REQUIRED**. La evidencia histórica más
abajo describe esa primera entrega; esta sección registra las correcciones H1,
H2, H4, H3 y M1, implementadas y probadas en ese orden, y la investigación M2.

- **H1:** la evidencia de Regalos usa `normalizeGiftConfig`, incluida URL canónica
  y espacios del titular. Una URL no vacía rechazada no acredita un borrado exitoso.
  La extracción posterior conserva una implementación canónica en
  `shared/giftsConfig.cjs`; la ruta pública del dominio sigue exportándola.
- **H2:** cada receipt liga acción, identidad local del documento y fingerprints
  de hojas observadas. El payload confirmado por el writer debe acreditar esos
  mismos fingerprints. Un cambio local durante el await produce conflicto, aunque
  la escritura original haya terminado bien. El ledger nunca transfiere esa prueba
  al valor nuevo. Un valor que cambia y vuelve al mismo valor sí coincide: es prueba
  de valor, no de ausencia de ediciones intermedias. No se persisten receipts ni
  valores bancarios adicionales, ni se agregan al contexto del proveedor.
- **H4:** `designerAiActionProjection.cjs` aplica todas las acciones relevantes
  en el mismo orden por owner. Los reducers de configuración son compartidos con
  el executor; los normalizadores de RSVP/Regalos conservan sus exportaciones
  anteriores mediante adapters. Personas, ubicación, Historia y movimiento de
  slots comparten sus funciones puras con los owners. Las resoluciones del backend
  usan la proyección; el ledger usa los efectos observados y no reproduce actions
  aditivas. Se eliminaron las comprobaciones redundantes del service que usaban
  el snapshot previo. Las precondiciones compartidas siguen siendo obligatorias.
- **H3:** el panel conserva en memoria el resultado original, receipts y token de
  la operación fallida. `Reintentar pendientes` reutiliza ese lote sin llamar al
  modelo: salta lo confirmado, reintenta solo el writer de una acción ya efectiva
  y continúa las no ejecutadas. Rechaza cambio de documento/epoch, fingerprints
  incompatibles o un efecto parcial no verificable. Una nueva solicitud descarta
  la recuperación anterior y puede repetir legítimamente una acción. El cierre o
  refresh pierde esta recuperación; no hay idempotencia distribuida ni rollback.
- **M1:** el historial original se redacta con el helper existente antes de
  truncarse a 700 caracteres. Se captura el input del proveedor y del repair en
  siete casos de borde. El mensaje actual explícito conserva el alcance anterior.
- **M2:** tres pruebas con React/ReactDOM/JSDOM montan el hook real de precarga
  `useDashboardStartupLoaders`, el owner `useCanvasEditorDraftMeta` y el hook real
  de identidad de operación. Con persistencia diferida se prueban A, A→B y A→B→A.
  La primera continúa normalmente; las navegaciones desmontan la instancia A y
  su continuación antigua no publica en la instancia visible. **No se reprodujo
  contaminación y no se modificó el owner de portada.** No prueba todos los
  posibles usos futuros del owner sin ese desmontaje, ni el router/Konva completos.

La segunda pasada agregó comprobaciones de reducers RSVP compuestos, orden de
Gallery y espacios significativos de Historia. Hay además una prueba integrada
del panel que pulsa el botón de recuperación, verifica una sola llamada al modelo,
cuatro intentos de escritura para A/B fallida/B reintentada/C, ningún mensaje de
éxito prematuro y una única opción RSVP agregada.

Verificación posterior, Node 20.19.5:

- Suite AI: **197/197** (antes: 153). **44 pruebas nuevas**: 41 regresiones H1–H4/M1
  y 3 sondas integradas M2. Ningún test existente se eliminó.
- Dependencias: **229/229**, más **35/35** tests existentes de Historia, resolución
  de valores y authoring alcanzados por las extracciones. Ownership: **41/41**.
- Total distinto: **502**. No se suman dos veces las repeticiones por bloque.
- Tres builds Functions y discovery local de 101/3/3 endpoints, sin credenciales
  ni red externa; **64 copias** sincronizadas. Lint: **0 errores**; el warning
  `_options` de RSVP es código existente ahora incluido en el alcance canónico.
- Parseo local y `git diff --check`. Logs regenerables en
  `.local-isolation/designer-ai-followup-*.log/json`.

La fixture histórica de política de nombre ya no fabrica receipts con dos
booleanos: acredita el snapshot efectivo y su fingerprint. Su expectativa
funcional no cambió. Los tests de normalización verifican valores escritos y
continuación del lote; las pruebas de backend no omiten sus validadores reales.

Sin nuevas escrituras en el camino exitoso ni agrupación de flushes. Sí hay
lecturas/fingerprints locales adicionales y una copia acotada del lote para
recuperación. Se mantienen los costos aceptados del P0 (hasta 21 escrituras por
lote de 20 acciones, incluida metadata).

Pendientes: M2 depende del desmontaje vigente; L1 (listeners de operaciones
canceladas desde algunos selectores) sigue Low sin cambios. La recuperación
conservadora rechaza también estados modificados manualmente y lotes cuyos
efectos anteriores ya no coinciden, en vez de intentar reinterpretarlos. Siguen
fuera de alcance coordinación entre pestañas, reread server-side del draft,
rate limiting propio, cancelación de I/O y DLP general. No hubo commit, push,
deploy ni cambios remotos.

## Cambios por bloque — primera entrega

| Bloque | Problema y solución | Implementación | Regresiones |
| --- | --- | --- | --- |
| P0.1 | Respuestas demoradas consultaban el runtime vigente. La operación captura documento y ciclo del control; cambio, cierre o desmontaje la invalida irreversiblemente. Se verifica inmediatamente antes de entrar al owner. | `src/lib/editorDocumentOperation.js`, `src/hooks/useEditorDocumentOperation.js`, `DesignerAiLocationControl.jsx`, `DashboardSidebar.jsx`, `MiniToolbarTabImagen.jsx`, `DashboardHeader.jsx` | `editorDocumentOperation.test.mjs`: A→A, A→B, A→B→A, cancelación, Places/portada/Gallery; además ejecuta los handlers reales de Places y guardado de nombre con promesas demoradas. |
| P0.2 | Emitir un evento o cambiar React no acredita aplicación ni durabilidad. El executor produce resultados por acción, relee el efecto concreto y espera el owner de persistencia. | `designerAiActionEvidence.js`, `designerAiActionExecutor.js`, `DesignerAiPanel.jsx`, `dashboardDocumentNameBridge.js`, `DashboardHeader.jsx`, `borradorSyncPersist.js`, ledger compartido | Executor: consumidor ausente, valor incorrecto, éxito real, fallo de escritura, contenido durable incorrecto, A aplicado/B falla/C no ejecutado. Bridge: aceptación y confirmación exacta, rechazo, timeout. Ledger: ninguna propuesta ni escritura fallida se vuelve terminal. |
| P0.3 | Fecha y hora parciales se reconstruían desde el snapshot inicial; fechas irreales, Gallery incoherente y Party inactivo podían pasar. Se escriben solo propiedades solicitadas y se consulta el estado efectivo. | Executor, capability contract compartido, `functions/src/designerAi/service.ts`, panel | Fecha→hora conserva fecha nueva y hora final previa; calendario/bisiestos; índices inexistentes y pares ID/índice inconsistentes; modo secuencial y efectivo final de Party, también controles. |
| P0.4 | Una regla podía ocultar pendientes sin valor ni procedencia suficiente. Precondiciones compartidas se ejecutan en backend, frontend y reconstrucción del ledger. | `shared/designerAiConversationLedger.cjs`, `shared/designerAiCapabilityContract.cjs`, service | `designerAiResolutionRules.test.mjs` cubre las diez reglas, compatibilidad, procedencia y replay; service prueba aceptación/rechazo de `keep_existing`. |
| P0.5 | Activar Regalos añadía todas las hojas y copies al recorrido. Se derivan pendientes de medios elegidos y visibles; los no confirmados se ocultan conservando valores. | Ledger, executor, instrucciones existentes del service | Alias solo, lista sola, combinación, método elegido vacío, ocultos heredados, copies opcionales. No se agregó modalidad persistida ni cambió el contrato de producto. |
| P0.6 | Datos bancarios ocultos entraban en el contexto; cambiar la URL de lista no siempre invalidaba revisión. La proyección de contexto elimina valores ocultos/desactivados en ambos límites y retiene existencia. También redacta esos valores conocidos en turnos históricos. El fingerprint local de URL detecta cambios. | Capability snapshot/payload, helpers compartidos de minimización, service | Payload e historial enviado sin valores ocultos ni fingerprints de medios; revisión/fingerprints locales preservados; captura del input real de `responses.create` simulado sin los valores bancarios ocultos. |

Las rutas abreviadas de UI están en `src/components/` y
`src/components/editor/designerAi/`; los módulos de dominio y sus tests, en
`src/domain/editor/`. Las copias de contratos en `functions/shared/` y
`functions/lib/shared/` se generan con el sincronizador canónico.

## Hallazgos corregidos

- **E1:** contaminación entre drafts por continuación asíncrona. También se
  protegieron uploads de portada/Gallery y la publicación tardía del nombre en
  el header.
- **E2:** falso éxito por dispatch/revisión, ledger anticipado y ausencia de
  confirmación durable. Gallery ya no anuncia “guardado” por un cambio local.
- **E3:** fecha/hora parcial que restauraba el valor inicial.
- **E4–E6:** cobertura por síntomas del resto del P0: controles/fechas inválidos,
  reglas terminales sin precondiciones y completitud excesiva de Regalos.
- **E7 adicional:** cambio entre dos URLs de lista externa con la misma revisión.
- Revisión final: una escritura fallida podía hacer que el valor optimista se
  reinterpretara como dato existente resuelto. Ahora su hoja queda explícitamente
  pendiente, con procedencia desconocida, y `keep_existing` no la puede cerrar.
- Revisión final: el header publicaba metadata conversacional antes de su
  escritura. Ahora solo publica esa metadata tras confirmación y en su documento.
- Revisión final: marcas terminales antiguas con valores vacíos o de ejemplo
  se revalidan al reconstruir el ledger. Se reabre el pendiente; no se migra ni
  escribe el draft al leerlo.

## Resultados y persistencia

Cada resultado conserva `action`, `requested`, `executed`, `effective`,
`persisted`, `error`. `executed` significa que se intentó invocar el owner;
no equivale a efecto. `effective` exige el valor/configuración relevante.
`persisted` exige confirmación del camino existente de escritura y concordancia
del contenido escrito. La comprobación no usa una revisión global como prueba.

El nombre usa aceptación síncrona y callback durable del header. El resto usa
`flushPersistenceNow`: el owner de autosave devuelve el payload de su escritura
confirmada. AI no escribe Firestore directamente ni crea otro writer. Configs y
canvas conservan sus respectivos owners y el coordinador existente.

El lote se pre-valida completo y conserva el orden por owner. Se verifica cada
acción antes de continuar. A confirmada/B fallida/C pendiente produce A
`persisted:true`, B con error y C `executed:false`. No hay rollback general.
El panel no publica el mensaje de éxito del modelo en ese caso. La reconciliación
conserva lo acreditado y deja pendientes los intentos fallidos, incluso cuando
sus valores ya se ven localmente. La metadata de progreso también se espera.

Places espera su owner de authoring y compara el resultado Google exacto en la
misma fase. Portada conserva el owner que publica estado después de persistir.
Gallery espera el flush y compara sus slots antes de guardar su finalización;
al finalizar se desmonta el control de edición, invalidando uploads pendientes.

## Precondiciones de reglas

| Regla | Estado y procedencia requeridos; rechazo |
| --- | --- |
| `keep_existing` | Valor semánticamente válido y procedencia de usuario actual o dato de usuario existente. Rechaza vacío, ejemplo, template, desconocido y finalización de Gallery. `false` explícito sigue siendo una decisión válida para flags. |
| `optional_end_time_omitted` | Hoja de hora final de fase aplicable y valor efectivo vacío. No omite una hora existente. |
| `optional_venue_name_omitted` | Nombre de lugar de fase aplicable y efectivamente vacío. No sustituye una dirección. |
| `leave_empty` | Solo hojas opcionales compatibles y realmente vacías; Maps manual exige dirección válida y ausencia de selección Google. |
| `same_day_party` | Party activo, fechas reales e iguales, fecha de ceremonia respaldada por usuario o acción explícita. |
| `automatic_event_name` | Nombre derivado de nombres efectivos válidos; acción correspondiente o política automática ya conservada. No convierte un nombre explícito en automático por una regla inválida. |
| `preserve_while_inactive` | Hoja interna RSVP/Regalos cuyo owner está efectivamente apagado; no resuelve el switch del owner. |
| `system_default` | Hoja compatible, valor exacto del default y procedencia de sistema. |
| `catalog_defaults` | Hoja RSVP compatible, valor válido y procedencia de sistema. El snapshot actual no acredita defaults de catálogo para preguntas: no se inventa esa evidencia. |
| `recommended_order` | Hoja de orden compatible, al menos dos elementos y procedencia de usuario. No acredita orden heredado de plantilla. |

## Verificaciones — primera entrega

Runtime: **Node 20.19.5**, disponible en el entorno. Todas las llamadas AI y
persistencias de los tests de dominio están simuladas; no se llamó a proveedores
ni a Firebase real.

- Suite específica: **153/153**, 13 archivos.
- Dependencias afectadas: **229/229**, 32 archivos: persistencia y ciclo de sesión,
  RSVP, Regalos, fecha/hora/lugares, Gallery, portada, CTA, bridges y snapshots.
- Nuevas regresiones: **63 casos** respecto de las suites anteriores: 44 en AI,
  17 de identidad/handlers y 2 del bridge durable. Se ampliaron además aserciones
  de tests existentes.
- Builds TypeScript y sincronización canónica: completados; **48 copias**
  consistentes. No se cambió el schema de tools, modelo, acceso ni `store:false`.
- Lint de Functions/contratos: **253 archivos, 0 errores, 233 advertencias**.
- Parseo sintáctico local de los JS/JSX/TS afectados: sin diagnósticos.
- Ownership: las tres codebases compilaron. La primera ejecución tuvo un timeout
  de 30 segundos en la carga de JSDOM; la repetición de las mismas 41 pruebas,
  en la misma copia aislada y sin cambiar timeouts, pasó **41/41**. El discovery
  posterior usa el CLI fijado por el repositorio, sin credenciales y con red
  externa bloqueada: pasó en `default`, `payments` y `email`.
- Una ejecución completa posterior del gate también pasó: tres builds,
  **41/41** y los tres discoveries. Después del último ajuste de replay se
  repitieron el build, la sincronización y la suite AI que lo consume.
- Total de pruebas distintas aprobadas en la validación final: **423**. La
  ejecución inicial fallida del gate se conserva como antecedente; no se cuenta
  como aprobada ni se suma dos veces la repetición.

Evidencia local regenerable: `.local-isolation/designer-ai-p0/ai-tests.tap`,
`dependency-tests.tap`, `ownership-tests.tap`, `lint.json` y logs `discovery-*`.
Son artefactos ignorados, no nuevos archivos para commit.

Tests anteriores ajustados explícitamente: los del executor antes trataban un
listener que solo registraba eventos como aplicación; ahora simulan consumidores
y escrituras. El test del nombre automático usa nombres efectivos coherentes
con el nombre solicitado. El test del header exige receipt con identidad y
metadata confirmada. Las fixtures de completitud usan valores reales y reglas
explícitas para omitir horarios o elegir dirección manual; antes fabricaban
`resolved_from_user` sobre valores vacíos y muestras. No se eliminaron tests ni se modificaron contratos de
producto para hacerlos pasar.

## Límites que permanecen

- La confirmación de escritura no es un bloqueo contra cambios posteriores de
  otra pestaña. No se implementaron transacciones multitab ni idempotencia durable.
- Invalida continuaciones antes de mutar; no cancela una llamada al proveedor,
  un upload a la biblioteca ni una escritura ya entregada a su owner. Estos
  pueden terminar sobre su destino original; no habilitan una mutación en B.
- El backend valida el snapshot de un cliente superadmin; no relee el draft ni
  recibe su ID. Autorización server-side y Rules existentes no se ampliaron.
- El mensaje actual puede contener un dato que el usuario aporta expresamente.
  Se redactan los valores bancarios ocultos conocidos en el historial enviado;
  no se detectan todas las posibles credenciales/datos sensibles en texto libre
  ni variantes de formato. No es un DLP general. Los datos bancarios visibles de
  Regalos activo continúan disponibles para interpretar ediciones.
- La verificación durable agrega flushes y puede aumentar escrituras/latencia.
  No se optimizaron ni agruparon sin evidencia los guardados de authoring.
- Se conserva el límite de espera de efecto y no se agregó cancelación de red,
  rate limiting, App Check, métricas de tokens/costo ni evals del modelo.
- Fuera de P0: cierre fijo que puede sustituir una pregunta al completar el
  recorrido (E8), recuperación del script Places tras fallo (E9), presupuesto de
  timeout/reintentos (E10), reinicio tras fallo del auto-start (E11), duplicación
  de mensajes largos y clasificación de ciertos errores de shape (E12).
- Siguen pendientes streaming, Undo, historial durable, política de retención,
  mejoras generales de accesibilidad/mobile y simplificaciones estructurales
  de la auditoría. No se agregaron capacidades ni dependencias.
- No se hizo E2E visual ni validación contra proveedores/Firestore real. No se
  puede afirmar calidad de conversación real a partir de estos tests simulados.

La intervención más extensa es P0.2: cruza executor, panel, ledger, header y
el receipt del owner de persistencia. Esa extensión es necesaria para distinguir
efecto local de escritura confirmada; no cambia quién escribe los datos.

## Inventario Git — primera entrega

26 archivos existentes modificados y 6 nuevos. Cuatro de los modificados son
copias generadas de los dos contratos compartidos. No se modificaron paquetes,
lockfiles, Rules, registro de ownership ni entrypoints de Functions.

Archivos existentes:

```text
docs/architecture/AI_ASSISTANT_SYSTEM.md
functions/designerAiService.test.mjs
functions/src/designerAi/service.ts
functions/shared/designerAiCapabilityContract.cjs
functions/shared/designerAiConversationLedger.cjs
functions/lib/shared/designerAiCapabilityContract.cjs
functions/lib/shared/designerAiConversationLedger.cjs
shared/designerAiCapabilityContract.cjs
shared/designerAiCapabilityContract.js
shared/designerAiCapabilityContract.test.mjs
shared/designerAiConversationLedger.cjs
shared/designerAiConversationLedger.test.mjs
src/components/DashboardHeader.jsx
src/components/DashboardSidebar.jsx
src/components/MiniToolbarTabImagen.jsx
src/components/editor/designerAi/DesignerAiLocationControl.jsx
src/components/editor/designerAi/DesignerAiPanel.jsx
src/components/editor/designerAi/DesignerAiPanel.test.mjs
src/components/editor/persistence/borradorSyncPersist.js
src/domain/editor/designerAiActionExecutor.js
src/domain/editor/designerAiActionExecutor.test.mjs
src/domain/editor/designerAiCapabilities.js
src/domain/editor/designerAiCapabilities.test.mjs
src/domain/editor/designerAiNamePolicyIntegration.test.mjs
src/lib/dashboardDocumentNameBridge.js
src/lib/dashboardDocumentNameBridge.test.mjs
```

Archivos nuevos:

```text
docs/testing/DESIGNER_AI_P0_HARDENING.md
shared/designerAiResolutionRules.test.mjs
src/domain/editor/designerAiActionEvidence.js
src/hooks/useEditorDocumentOperation.js
src/lib/editorDocumentOperation.js
src/lib/editorDocumentOperation.test.mjs
```
