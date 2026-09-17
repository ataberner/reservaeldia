# Procedimientos por tipo de tarea

Status: Operational Diagnostic Evidence.
Categoría: Operational; procedimiento de trabajo vigente, no informe de ejecución.

Alcance: preparación y evidencia específicas para investigar, corregir,
implementar, refactorizar, medir, revisar y mantener documentación o tests.
Está subordinado al pedido original y a [AGENTS.md](../../AGENTS.md), que conserva
autorización, flujo global, Definition of Done y entrega. Seleccionar uno o varios
procedimientos no concede permisos ni amplía el pedido. Los contratos del
[índice](../DOCUMENTATION_INDEX.md#authority-and-conflicts) conservan sus invariantes.

Mantenimiento: actualizar el procedimiento afectado cuando cambien responsables,
fronteras de trabajo o evidencia disponible; verificar sus referencias contra
código y contratos. No copiar aquí reglas de producto ni comandos de runbooks.

Elegí el tipo de tarea y la [ruta del subsistema](../DOCUMENTATION_INDEX.md#5-reading-order-by-subsystem).
Combiná sólo los pasos necesarios si el pedido mezcla tipos. Una tarea trivial
puede resolverse con una preparación breve y evidencia en la entrega: este
documento no exige planes, informes intermedios ni archivos adicionales.
Antes de ejecutar verificaciones, revisá sus [efectos reales](../DOCUMENTATION_INDEX.md#verification-entry-points)
y las [limitaciones operativas](../architecture/SYSTEM_FRAGILITY_MAP.md#operational-readiness).

<a id="investigar"></a>

## A. Investigar o explicar

- **Aplica:** preguntas sobre comportamiento, responsabilidades, causas posibles o alcance de un cambio, incluida investigación sólo de lectura.
- **Preparación:** delimitá la pregunta, caso o entrada, resultado buscado y superficie; elegí el contrato y mapa específico, sin cargar subsistemas no alcanzados.
- **Secuencia:** trazá entrada, eventos, estado, transformación, persistencia y render hasta sus responsables. Seguí callers y consumidores; una carpeta o un nombre no demuestra autoridad. Contrastá implementación con contrato y diagnósticos/tests existentes. Separá hechos comprobados, declaraciones documentales, hipótesis y decisiones pendientes.
- **Evidencia:** recorrido con rutas y símbolos, obligación esperada frente a comportamiento observado, alcance de lectura/reproducción y límites de la conclusión. Una traza estática no demuestra ejecución ni estado desplegado. Si sólo se autorizó leer, entregá el hallazgo sin modificar código, tests o documentación ni generar instrumentación.
- **Decisión adicional:** reproducción que requiere accesos/efectos no autorizados; autoridades incompatibles; política material ausente. Registrá la pregunta en la autoridad existente si se permite documentar, o en la entrega si el alcance es sólo lectura; continuá lo independiente.

<a id="corregir"></a>

## B. Corregir un fallo

- **Aplica:** un caso incumple una obligación vigente y está autorizada su corrección.
- **Preparación:** identificá entrada, condición de disparo, resultado esperado por contrato y responsables del estado. Revisá trazas, flags, fixtures y regresiones existentes antes de agregar diagnósticos.
- **Secuencia:** reproducí en un entorno cuyo destino y efectos estén comprobados o trazá el caso concreto si no puede ejecutarse. Localizá la primera invariante rota y distinguí la causa de sus síntomas posteriores. Corregí en el responsable de esa invariante; seguí el efecto hasta consumidores afectados. En Gallery, por ejemplo, una pérdida de fotos al cambiar layout se contrasta con el contrato editor y la mutación invocada por el caller (`configureGalleryLayout` en el selector de grilla actual), antes de parchear la lista visual.
- **Evidencia:** caso que falla frente al contrato, explicación causal y verificación de regresión que discrimine el defecto; agregá negativos/bordes pertinentes (p. ej., layout no permitido, datos compatibles, objeto no seleccionado). Si faltó reproducción, declaralo y precisá qué demuestra la inspección o prueba alternativa.
- **Decisión adicional:** la solución cambia compatibilidad, datos o permisos fuera del pedido, o dos obligaciones aceptadas chocan. La presencia de deuda en el componente no exige refactorizarlo entero; delimitá el arreglo y registrá sólo el impedimento real.

<a id="implementar"></a>

## C. Implementar comportamiento

- **Aplica:** una capacidad nueva o un cambio funcional autorizado.
- **Preparación:** convertí el pedido en criterios observables de aceptación, incluidos errores y límites relevantes. Identificá contratos, writers, readers, runtimes y datos persistidos afectados; usá los [estándares](../architecture/ARCHITECTURE_GUIDELINES.md#code-quality-standards).
- **Secuencia:** completá el flujo autorizado desde la entrada hasta el resultado visible/persistido en sus responsables actuales. Conservá compatibilidad existente salvo cambio contractual autorizado. Si toca `shared/`, trazá wrapper, fuente y destinos del [mapa de copias](../architecture/ARCHITECTURE_OVERVIEW.md#shared-contract-copies); no edites destinos como fuentes independientes ni confíes en watch. Comprobá todos los consumidores afectados y actualizá los que lo requieran; una sincronización/build sólo se ejecuta si sus escrituras están dentro del alcance.
- **Evidencia:** criterios cubiertos por pruebas o comprobaciones proporcionales, errores/negativos relevantes y compatibilidad entre consumidores. UI desktop/mobile y paridad preview/publish se verifican cuando el flujo los alcanza; indicar qué runtime/artefacto se comprobó. Si no se puede actualizar o comprobar un consumidor necesario, el flujo queda explícitamente incompleto.
- **Decisión adicional:** ambigüedad material sobre comportamiento, acceso, esquema o compatibilidad. Registrá alternativas propuestas y cambio condicionado en el contrato responsable; no inventes esa política para terminar la implementación.

<a id="refactorizar"></a>

## D. Refactorizar

- **Aplica:** reorganización interna autorizada sin cambio de comportamiento.
- **Preparación:** definí responsabilidad a reorganizar y comportamiento preservado: interfaces, forma de datos, errores, efectos y orden temporal relevantes. Seleccioná caracterización existente; si falta, cubrí el comportamiento necesario antes de moverlo.
- **Secuencia:** trazá dependencias y distinguí conocimiento duplicado de adapters legítimos. El re-export `publicationPublishValidation.ts` conserva imports de consumidores; su existencia no crea otro validador. Hacé pasos acotados y revisables usando los responsables actuales, preservando orden de escrituras/flush cuando aplique. No mezcles limpieza ajena ni cambios funcionales encubiertos.
- **Evidencia:** responsabilidad antes/después, interfaces y efectos conservados y resultados comparables. Para persistencia, los tests del core y del coordinador FIFO son anclas específicas; no demuestran por sí solos Rules o integración remota.
- **Decisión adicional:** nueva autoridad de estado, eliminación de compatibilidad o cambio funcional necesario. Separá esa decisión del refactor; un movimiento de funciones dentro del mismo responsable no necesita un ADR.

<a id="rendimiento"></a>

## E. Mejorar rendimiento

- **Aplica:** reducción de una latencia, costo de render, carga o consumo observables.
- **Preparación:** definí métrica, escenario/fixture, dispositivo o viewport, versión, entorno, caché y repeticiones. Sin medición inicial, el siguiente paso es obtener la línea base; todavía no hay cuello demostrado ni mejora que atribuir. Revisá medición existente, por ejemplo `previewTiming` y los eventos de etapas del preview, antes de instrumentar.
- **Secuencia:** medí con destinos y efectos autorizados, localizá el costo dominante y justificá una intervención concreta. Repetí el mismo escenario y condiciones; separá variabilidad, caché y esperas externas del efecto del cambio. Verificá que no se alteraron contratos, errores, orden de operaciones o experiencia.
- **Evidencia:** valores antes/después, condiciones y repeticiones, dispersión relevante y límite de atribución. Una reducción de líneas, un memo o una medición de otro dispositivo no prueba mejora. Las capturas visuales sólo cubren apariencia, no latencia.
- **Decisión adicional:** no hay medición comparable posible, se necesitan servicios/datos fuera del alcance o se propone sacrificar calidad/compatibilidad. Entregá hipótesis y medición pendiente; no presentes optimización especulativa como resultado comprobado.

<a id="revisar"></a>

## F. Revisar o auditar

- **Aplica:** evaluación de un diff o una superficie definida, sin permiso implícito para corregir.
- **Preparación:** delimitá base/diff, objetivo de revisión y contratos relevantes; separá cambios preexistentes. Para una auditoría sin diff, delimitá entrada y fronteras muestreadas.
- **Secuencia:** inspeccioná diff, contrato, implementación, consumidores y pruebas. Trazá cada posible hallazgo hasta un caso y obligación concretos; valorá impacto y alcance. Usá sólo verificaciones autorizadas y distinguí defecto demostrado de hipótesis o preferencia de estilo.
- **Evidencia:** hallazgos priorizados con ubicación, condición de disparo, consecuencia y respaldo; incertidumbres y cobertura omitida separadas. Ausencia de hallazgos en una muestra no certifica todo el subsistema.
- **Decisión adicional:** ampliar la auditoría, reproducir con efectos no autorizados o implementar recomendaciones requiere alcance adicional. Registrá contradicciones según el índice; no cambies tests/contratos para silenciar un hallazgo.

<a id="documentar-tests"></a>

## G. Documentar o actualizar tests

- **Aplica:** mantener una autoridad documental, describir implementación o ajustar evidencia de regresión; editar tests requiere que el pedido lo autorice.
- **Preparación:** clasificá el contenido: contrato normativo, decisión con estado, mapa observado o evidencia de pruebas. Buscá primero su autoridad más pequeña y contrastá afirmaciones con implementación, callers y consumidores concretos.
- **Secuencia:** corregí el mapa si quedó obsoleto; cambiá un contrato sólo cuando el cambio contractual esté autorizado. No conviertas un bug en expectativa por coincidir con el código. Documentá decisiones aceptadas aún no implementadas con estados de aceptación e implementación/verificación separados. Ante antecedentes faltantes, escribí «no registrado»; alternativas nuevas son propuestas actuales, no historia.
- **Evidencia:** diff y enlaces/anchors/rutas/símbolos comprobados; hechos separados de declaraciones y pendientes. Para tests, explicá qué comportamiento discrimina la prueba, negativos/bordes pertinentes y resultados realmente ejecutados; inspeccioná imports y artefactos consumidos antes de correrla. Un test que lee `functions/lib/` no prueba automáticamente el `src` actual.
- **Decisión adicional:** dos autoridades aceptadas incompatibles o cambio de producto/permisos sin aceptación. Registrá pregunta, opciones, información faltante y cambio dependiente en su dueño actual. [Q1](../architecture/SYSTEM_FRAGILITY_MAP.md#open-operational-decisions) permanece allí hasta resolución explícita; documentarla no la resuelve.

## Anclas para aplicar estos procedimientos

- Mutaciones Gallery: [ruta focalizada](../DOCUMENTATION_INDEX.md#gallery-subsystem), [mutaciones](../../src/domain/gallery/galleryMutations.js) y [tests](../../src/domain/gallery/galleryMutations.test.mjs). Para un cambio local de layout, ampliar a persistencia/render sólo si esos consumidores cambian.
- Persistencia/refactor: [responsables actuales](../architecture/ARCHITECTURE_OVERVIEW.md#current-boundaries), [core tests](../../src/components/editor/persistence/editorSessionPersistenceCore.test.mjs) y [FIFO tests](../../src/components/editor/persistence/draftWriteCoordinator.test.mjs).
- Preview/rendimiento: [mapa específico](../architecture/PREVIEW_SYSTEM_ANALYSIS.md), [etapas de pipeline](../../src/domain/dashboard/previewPipeline.js), [timing](../../src/domain/dashboard/previewTiming.js) y [controlador](../../src/hooks/useDashboardPreviewController.js). La presencia de trazas no constituye una línea base medida.
- Componente con deuda: [complejidad actual](../architecture/ARCHITECTURE_OVERVIEW.md#10-known-complexity-areas) y contrato del flujo afectado. Corregir una invariante local no requiere adoptar una arquitectura nueva.

Estas anclas son rutas de preparación. No indican que los tests se hayan ejecutado
en una tarea ni sustituyen la evidencia requerida por el contrato específico.
