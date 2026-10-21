# Editor Regression Checklist

Status: Testing Baseline.

## Como usar este checklist

Aplicarlo en cualquier cambio que toque:

- seleccion, multiseleccion, drag, resize o rotacion
- texto inline y overlay DOM
- preview o publish desde el dashboard
- persistencia del borrador
- secciones, `altoModo`, fondos o decoraciones

Marcar cada caso como `OK`, `FAIL` o `N/A`.

Preparar un borrador con:

- al menos 3 secciones
- una seccion `fijo`
- una seccion `pantalla`
- una seccion con fondo base de imagen
- dos textos, uno multilinea
- una imagen comun
- una `forma`
- una `forma.line`
- dos o mas objetos cercanos para multiseleccion y drag grupal
- una galeria `tipo: "galeria"` con tres fotos, una foto repetida en otra galeria, y `allowedLayouts/defaultLayout/currentLayout`
- si el cambio toca CTA o countdown, incluir tambien esos objetos

## 0. Inicio del editor

### [ ] Loader unico de canvas y sidebar

1. Abrir un borrador con carga normal en desktop y mobile.
2. Repetir con red o recursos deliberadamente lentos.
3. Desde que comienza la resolucion de la ruta y durante toda la carga, verificar que la placa `Estamos preparando tu invitacion` cubra el area completa debajo del header.
4. Confirmar que ni el canvas ni el sidebar sean visibles, enfocables o interactuables antes de que el runtime del editor reporte `ready`.
5. En la salida del loader, confirmar que canvas y sidebar aparezcan juntos y sin parpadeo.
6. Cerrar y volver a abrir el panel del sidebar.
7. Repetir con el modo Asistente y con una cuenta habilitada para la visita guiada.

Resultado esperado:

- existe una sola placa de carga para todo el workspace del editor
- no aparece antes ninguna placa `Abriendo plantilla interna`, `Abriendo editor` ni equivalente
- el sidebar nunca aparece antes que el canvas
- la placa se retira solo mediante el gate de startup existente, sin otro estado ni temporizador
- el sidebar conserva su apertura/cierre normal despues de la carga
- el Asistente y su visita guiada esperan a que la placa haya terminado de salir y conservan sus targets reales

Regresion de apertura con secciones funcionales ocultas:

- abrir un borrador cuya primera seccion guardada tenga una imagen y este oculta
  por su configuracion funcional; el inicio debe esperar solo los recursos de la
  primera seccion que realmente se renderiza;
- repetir con fondo de color en la primera seccion visible y con una imagen que
  falla; ambos casos deben permitir completar el inicio;
- si la misma sesion vuelve a cargar, retirar `ready` hasta terminar la nueva
  hidratacion y comprobar la URL actual de cada recurso, sin reutilizar el estado
  de una imagen anterior bajo el mismo ID;
- cambiar imagenes despues del inicio no debe reabrir la placa de carga.

Ancla automatizada (React, datos sinteticos y sin Firebase):
`node --test src/components/editor/canvasEditor/useCanvasEditorStartupStatus.test.mjs`.

### [ ] Apertura y reapertura tras migrar campos dinamicos

- abrir una copia de plantilla con objetos y secciones, tanto con authoring v1
  como con v2 sin `templateInput`; esperar la migracion y reabrir el borrador;
- comprobar que conserva los IDs, contenido y geometria de objetos y secciones,
  incluso si la precarga de authoring omite las secciones o la escritura queda
  en cola detras de una edicion;
- la migracion inicial escribe solo authoring, valores y `eventDetails`, sin
  reemplazar `objetos` ni `secciones`; inicia despues de hidratar el canvas;
- una sesion de solo lectura no persiste la migracion y una reapertura ya
  migrada no vuelve a escribirla.

Ancla automatizada (servicio y migrador reales; persistencia sintetica):
`node --test src/domain/templates/authoring/service.test.mjs`.

## 1. Seleccion y drag

### [ ] Seleccion simple y limpieza de seleccion

1. Seleccionar un objeto.
2. Seleccionar otro objeto.
3. Hacer click en stage vacio.

Resultado esperado:

- solo queda seleccionado el ultimo objeto clickeado
- el transformer queda anclado al nodo correcto
- el click en stage vacio limpia la seleccion sin residuos visuales

### [ ] Marquee incluyendo lineas

1. Iniciar marquee desde zona vacia.
2. Encerrar objetos normales y una linea.
3. Soltar el puntero.

Resultado esperado:

- la preseleccion coincide con la seleccion final
- la linea entra si su geometria intersecta el area
- no queda marquee colgada al terminar

### [ ] Multiseleccion + drag grupal

1. Construir multiseleccion con Shift o marquee.
2. Arrastrar el grupo.
3. Soltar y volver a mover uno de los elementos seleccionados.

Resultado esperado:

- todos los seleccionados se mueven juntos
- se preservan las distancias relativas
- la multiseleccion sigue coherente al terminar el drag

### [ ] Regresiones P1 de drag y geometria

1. Mover una multiseleccion, seleccionar solo su lider y moverlo de inmediato; repetir con un seguidor, Gallery y Countdown, y despues de esperar mas de 400 ms. Deshacer y rehacer ambos movimientos.
2. Desde una seccion editable `fijo` y otra `pantalla`, soltar un objeto sobre una seccion bloqueada. Incluir una seccion previa y texto con offsets; repetir con Gallery y Countdown.
3. Alinear una Gallery como objeto movido y como referencia en layouts `one_by_n`, `two_by_n` y `three_by_n`, con escala 1 y 0.6.
4. Alinear lineas verticales, horizontales e invertidas cuyos endpoints incluyan cero.

Resultado esperado:

- cada movimiento individual valido produce un commit; finales repetidos de seguidores no agregan commits ni consumen el siguiente gesto
- un drop rechazado restaura nodo, estado y dato persistible a la pose aceptada; el overlay muestra esa pose antes del settle y el transformer vuelve a la misma seleccion
- Gallery usa su frame visual, sin sumar overlays de celdas ni usar una altura persistida obsoleta
- un endpoint cero conserva su valor; no se convierte en el default 100

Regresiones automatizadas (Node 20, sin servicios externos):

```powershell
node --test src/drag/dragGrupal.test.mjs src/components/editor/canvasEditor/dragPositionFinalization.test.mjs src/hooks/useGuiasCentrado.geometry.test.mjs
```

El probe optativo `src/drag/dragPhase1.browser.test.mjs` monta React-Konva y los
handlers reales en una pagina sintetica offline. Se habilita con
`DRAG_PHASE1_BROWSER=1`; `CHROME_EXECUTABLE_PATH` permite usar un Chromium local
en lugar del cache del repositorio. No descarga herramientas ni conecta Firebase.
Su alcance no incluye el montaje completo del composer ni el handoff real del
overlay/transformer, que requieren el recorrido manual anterior.

Mantener separada la falla conocida de `src/domain/editor/canvasObjectPositioning.test.mjs`
(`uses yNorm as the screen-section visual authority`): su fixture declara altura 100
para una seccion `pantalla` con `ALTURA_PANTALLA_EDITOR=500`. No modificar su
expectativa para ocultar la inconsistencia; la correccion de ese fixture/contrato
queda fuera de esta fase.

### [ ] Select-and-drag en el mismo gesto

1. Tomar un objeto no seleccionado.
2. Empezar a arrastrarlo en el mismo pointer-down o touch-start.
3. Soltar y repetir el gesto una segunda vez.

Resultado esperado:

- el objeto pasa a seleccionado sin requerir un click previo
- el drag arranca sin parpadeo del transformer ni canvas en blanco
- no queda pending drag selection colgada al terminar

### [ ] Modos visuales de seleccion

1. Seleccionar un objeto comun.
2. Seleccionar una `forma.line`.
3. En la barra flotante de la linea, cambiar el color y probar el grosor minimo, uno intermedio y el maximo.
4. Repetir la seleccion y los cambios de la linea en mobile.
5. Editar inline un texto ya seleccionado.

Resultado esperado:

- un objeto comun muestra transformer
- una linea muestra bounds indicator y `LineControls`, no el transformer generico
- la barra flotante de una linea ofrece `Color` y `Grosor`; el grosor refleja y actualiza `strokeWidth` entre 1 y 50 px sin cambiar el color ni los puntos
- el control sigue accesible en mobile mediante el scroll horizontal existente de la barra
- durante inline edit se suprimen los visuales primarios de seleccion
- no aparecen dobles bordes ni overlays superpuestos

### [ ] Overlay de drag y restauracion del transformer

1. Seleccionar un objeto o grupo.
2. Iniciar drag y observar el overlay visual.
3. Soltar y esperar el settle del drag.

Resultado esperado:

- el drag overlay aparece durante predrag o drag activo cuando corresponde
- el transformer se oculta o se desacopla sin dejar residuos visuales
- al terminar el settle, el transformer vuelve a anclarse a la seleccion correcta
- no queda drag visual selection residual

### [ ] Snap y guias durante drag individual

1. En desktop, arrastrar lentamente y luego rapido texto, imagen, forma, icono, Gallery, countdown y CTA/boton cerca del centro de seccion y de centros/bordes de otros objetos.
2. Entrar y salir repetidamente del radio, competir entre dos candidatos y soltar inmediatamente despues de un snap.
3. Repetir con zoom/escala normal y reducida; confirmar legibilidad en canvas de aproximadamente 320, 390 y 430 px cuando la infraestructura lo permita.
4. Durante el mismo drag desktop, mantener Alt/Option, mover, soltar la tecla y continuar moviendo.
5. Probar cajas separadas, tangentes, parcialmente solapadas, contenidas y totalmente apiladas.
6. Finalizar, cancelar, invalidar el target cuando sea reproducible y comenzar una nueva sesion sobre el mismo objeto.
7. En touch, repetir scroll vertical, gesto inicialmente horizontal y drag; Alt/Option no participa.

Resultado esperado:

- toda guia activa coincide exactamente con la geometria del nodo y con la posicion finalmente persistida; nodo, drag overlay y guia no divergen
- centro de seccion usa la referencia visual mas fuerte; centro-centro, borde-borde y centro-borde se distinguen sin cambiar el lenguaje violeta existente
- los candidatos evidentes de cada eje participan de forma estable y determinista, sin chatter al competir
- las lineas entre objetos nunca invierten extremos ni atraviesan cajas solapadas por asumir un gap inexistente
- grosor, dash y radio magnetico conservan una percepcion aproximadamente constante al cambiar la escala, sin cambiar las coordenadas legales del snap
- Alt/Option elimina snap y guia mientras esta presionado y los reactiva al liberarse; touch conserva su algoritmo compartido y el scroll vertical
- drag end, cancelacion, geometria/target invalido, error y nueva sesion no dejan guias ni locks stale

### [ ] GEO03/SNAP01: texto transformado y cache de referencias (2026-10-14)

1. Usar texto con rotaciones 0, 45, 90, 180 y negativas, alineacion izquierda/centro/derecha, offsets y escalas distintas. Alinear el texto arrastrado y usarlo como referencia; comparar centro/bordes del frame medido, guias, seleccion y pose final. Repetir con CSS zoom 1 y 0.6; incluir transformacion heredada cuando el fixture la permita, incluso rotacion local cero bajo un padre rotado.
2. Seleccionar, iniciar drag, soltar alineado, deshacer/rehacer y abrir/cerrar inline. Confirmar que la caja de seleccion y el overlay DOM usan la misma geometria sin aplicar dos veces la rotacion o el zoom; revisar caret, focus y handoff en el editor completo. Borrar todo el texto y volver a escribir: una medida cero conserva la matriz y el origen de insercion. Un Stage con transformacion nativa utiliza el backend transformado existente, sin reenviar su traslacion a decoraciones sinteticas.
3. Con candidatos precalculados, mover una referencia de X100 a X300 sin reemplazar `objetos`; repetir con cambio de tamano, rotacion, escala, reemplazo del nodo y una nueva sesion. La guia anterior debe desaparecer y la nueva referencia participar en la siguiente muestra valida.
4. Cambiar las dimensiones medidas de un texto por carga tardia de fuente y el layout interno de una Gallery durante la sesion. Confirmar que se usa la nueva caja, aunque siga existiendo el mismo nodo raiz. Repetir la carga de fuente por el lifecycle real `fonts-loaded`, ademas del probe sintetico.
5. Ocultar/eliminar una referencia, moverla a otra seccion o desacoplar su nodo. No debe quedar una guia o lock stale. Una referencia visible bloqueada conserva su papel de referencia sin adquirir permiso de edicion.
6. Mantener una alineacion y modificar otro target o un eje independiente del mismo target. Confirmar que solo se libera el lock cuya ancla quedo invalidada; cambios visuales sin cambio geometrico no causan saltos. Repetir Alt/Option, cancelacion y nueva sesion.

Resultado esperado:

- la autoridad comun proyecta el rectangulo local del texto con su matriz real; sus esquinas, AABB, guias y proyeccion DOM coinciden en el espacio de coordenadas correspondiente
- el snap transforma su delta de stage a coordenadas locales del padre antes de mover el nodo
- entradas de cache estables reutilizan sus bounds; cambios relevantes actualizan solo las referencias afectadas, sin recalcular todos los bounding boxes por muestra
- no se incorporan RAF ni listeners de geometria adicionales; se preservan radios 10/6 px, liberacion 18/14 px, expansion inicial por 1.75 durante 120 ms, prioridades y bypass Alt

Regresiones automatizadas de Fase 2 (Node 20):

```powershell
node --test src/components/editor/canvasEditor/konvaAuthoritativeBounds.test.mjs src/components/editor/canvasEditor/textGeometryConsumers.test.mjs src/hooks/useGuiasCentrado.cache.test.mjs src/hooks/useGuiasCentrado.geometry.test.mjs src/lib/editorAlignmentGuides.test.mjs src/components/editor/canvasEditor/editorAlignmentGuidesIntegration.test.mjs
```

Los tests de autoridad usan matrices Konva reales con dimensiones de texto
suministradas. El test de cache ejecuta hook, resolvers y snapping reales con un
adapter de lifecycle React de una sola renderizacion; comprueba reuso contando
lecturas de bounds. `editorAlignmentGuidesIntegration.test.mjs` sigue siendo
verificacion estatica de source y no sustituye una interaccion montada.

El mismo probe offline de Fase 1 incorpora las pruebas de Fase 2 con otro flag:

```powershell
$env:DRAG_PHASE2_BROWSER = "1"
node --test src/drag/dragPhase1.browser.test.mjs
Remove-Item Env:DRAG_PHASE2_BROWSER
```

Requiere Chromium local; `CHROME_EXECUTABLE_PATH` permite elegirlo. Escribe bundle,
capturas y `evidence.json` en `.local-isolation/drag-phase2-browser`, bloquea trafico
externo y no monta Firebase. Incluye Text/React-Konva reales, mutacion de target
durante mouse drag, remeasurement de fuente local y cambio de layout Gallery.
La remeasurement del probe no certifica el lifecycle de carga de fuentes del
editor completo. Tampoco cubre su composer completo, autosave remoto ni handoff
inline/seleccion/settling. Esos limites requieren las interacciones manuales
anteriores. Registrar resultados y versiones al ejecutarlo; estos checks no
constituyen mediciones de FPS ni prueban una mejora de rendimiento.

### [ ] PERF01/PERF02/UX01: medicion del drag (2026-10-15)

Antes de comparar, registrar versiones de Node/navegador, sistema, CPU, DPR,
viewport, escala CSS efectiva, modo React/Next, rasterizador e instrumentacion.
Usar Node 20. No comparar tiempos de desarrollo con produccion ni pasadas
instrumentadas con pasadas de timing. Ejecutar un solo benchmark a la vez,
sin builds, emuladores arrancando u otras suites en paralelo.

1. Repetir 1, 10, 50 y 100 elementos, normal y Alt, con un calentamiento separado
   y al menos cinco repeticiones por caso. Conservar timestamps y resultados por
   gesto; no reemplazarlos por un unico promedio. Confirmar que el gesto realmente
   mueve/commitea, termina sin guias residuales y conserva la pose aceptada.
2. Cubrir texto, texto rotado, imagen, forma, Gallery, grupo, multiseleccion y
   secciones. El laboratorio admite zoom 1/0.6; en el editor real registrar la
   escala disponible sin inyectar un control o cambiar CSS para simularla.
3. Separar trayectoria horizontal/vertical/diagonal, microajustes, inversion,
   movimiento rapido, gestos consecutivos y release inmediato. Registrar que las
   entradas son mouse sintetico enviado mediante CDP, no mouse/trackpad fisicos.
4. Timing: flags de debugging apagados, RAF pasivo y metricas CDP. Los intervalos
   RAF y su frecuencia describen callbacks headless, no frames presentados ni
   latencia fisica de pantalla. Informar presupuestos 16.67/8.33 ms sin deducir la
   frecuencia de un monitor que no fue medida. Paint queda no disponible si no
   se tomo una traza que lo permita.
5. Diagnostico separado: spans de calculo, aplicacion de snap, publicacion y
   dibujo; bounds, DOM reads, cache, React Profiler y scene/hit Konva. Los spans
   anidados son inclusivos: no sumarlos como CPU exclusiva. Una lectura DOM por
   si sola no acredita layout forzado. Los wrappers se aplican solamente al
   bundle/copia de laboratorio y no al codigo que ejecuta el usuario.
6. Para PERF01, ejecutar las regresiones con debugging apagado y encendido:
   apagado no debe proyectar geometria de mismatch ni escribir snapshots de
   texto; encendido debe seguir diagnosticando. La trayectoria y guias deben
   coincidir. Conservar las relecturas funcionales pre/post snap.
7. Para PERF02, medir por separado el sync post-snap y el resumen normal en el
   composer real, incluyendo primer movimiento, release, siguiente gesto y
   handoff. La escena offline no acredita por si sola ese lifecycle.
8. Cache: medir referencias elegibles, hits/misses y costo de validacion;
   repetir las invalidaciones GEO03/SNAP01. Reducir lecturas no permite retener
   cajas o locks obsoletos.
9. UX: distinguir liberacion del lock anterior de adquisicion de otro. Repetir
   microajustes, inversion y cruces diagonales a ambos lados de 120 ms; medir
   desplazamiento en pixeles de pantalla. No cambiar tolerancias en esta fase.

Entradas reproducibles (artefactos ignorados en `.local-isolation/drag-performance`):

```powershell
node --test src/hooks/useGuiasCentrado.diagnostics.test.mjs src/components/editor/canvasEditor/selectionOverlayDiagnostics.test.mjs
node src/hooks/testSupport/guideUxProbe.mjs
$env:DRAG_PERF_BROWSER = "1"
$env:DRAG_PERF_LABEL = "baseline"
$env:DRAG_PERF_MATRIX = "core"
$env:DRAG_PERF_REPETITIONS = "5"
$env:DRAG_PERF_DURATION_MS = "1000"
$env:DRAG_PERF_MODE = "timing"
node --test src/drag/dragPerformance.browser.test.mjs
$env:DRAG_PERF_MODE = "diagnostic"
node --test src/drag/dragPerformance.browser.test.mjs
```

El runner offline usa Chromium ya instalado (`CHROME_EXECUTABLE_PATH` opcional),
bloquea red externa y no incluye Firebase. `DRAG_PERF_MATRIX=smoke` cubre las ocho
familias; `ux` agrega trayectorias dirigidas; `full` extiende cantidades. El
manifest describe cobertura, fuente y SHA-256 del bundle. `DRAG_PERF_BUILD_ONLY=1`
congela un bundle sin medir y `DRAG_PERF_USE_FROZEN=1` permite repetirlo sin
recompilar; quitar ambos flags para construir la version posterior al cambio.
`DRAG_PERF_FAMILIES=text,shape` y `DRAG_PERF_COUNTS=100` permiten repetir un
subconjunto del mismo protocolo sin cambiar el bundle. Conservar tambien una
familia no afectada como control de variabilidad, no atribuir toda diferencia
temporal al cambio y no sobrescribir las carpetas del baseline.

El resumen reproducible de los registros excluye warmups, agrupa por escenario
y conserva separados los spans inclusivos y cada scope de Profiler:

```powershell
node src/drag/testSupport/summarizeDragPerformance.mjs .local-isolation/drag-performance/baseline-timing-core/results.json .local-isolation/drag-performance/after-perf01-timing-core/results.json
```

Con cinco gestos, usar mediana y rango para tiempos por gesto; percentiles de
frames/handlers agrupan sus muestras. El JSON puede existir tras una ejecucion
interrumpida: comprobar tambien el resultado TAP y la cantidad de escenarios.

Para el editor completo, preparar e iniciar una sesion con el
[procedimiento local aislado](../operations/DEVELOPMENT_WORKFLOW.md), luego usar
`DRAG_PERF_LOCAL=1`, `DRAG_PERF_LOCAL_SESSION=<raiz de la sesion activa>` y
`node --test src/drag/dragPerformance.local.test.mjs`. Este runner valida proyecto
demo, destinos loopback y entorno de la sesion; usa datos sinteticos y comprueba
autosave contra el emulador. No iniciar Next directamente desde el repositorio
principal ni reutilizar un perfil de navegador personal. Al terminar, limpiar
los flags `DRAG_PERF_*` de la shell y detener la sesion por su supervisor.
El dashboard alterna zoom logico 0.8/1; `useViewportScale` aplica un boost de
1.15 al primero, por lo que su escala CSS efectiva es 0.92 en desktop. No
etiquetarlo como una medicion a escala 1 ni inyectar estado para simular 0.6.
El runner real conserva hashes vivos de fuentes y del protocolo: una copia
efimera instrumentada no queda descrita por su manifest inicial de sesion.
Confirmar seleccion, ausencia de edicion inline, `draggable` y escala nativa
antes de medir. Un click de preparacion puede activar inline; un gesto que no
mueve realmente el nodo no es una muestra rapida valida. Comparar la pose con
`resolveCanonicalNodePose` y el offset de seccion despues de release y settling,
ademas de comprobar Firestore=modelo. El helper espera dos RAF despues de soltar;
no describirlo como regrab en el mismo frame.

Evidencia ejecutada en esta pasada: 290/290 tests relacionados, 11/11 Chromium
de Fases 1/2 y siete pasadas offline (1008 gestos, 840 medidos, 168 warmups).
El smoke real previo al cambio cubrio cuatro gestos de texto/N10, pero los
intentos posteriores no completaron una comparacion real repetible. PERF02,
handoff/undo-redo real y estudio de dispositivos quedan pendientes. La falla
conocida `canvasObjectPositioning.test.mjs` sigue separada (6 pass, 1 fail).
No usar estos resultados para declarar un incremento de FPS: las corridas
temporales y su control sin cambios muestran variabilidad importante.

Los resultados y decisiones de esta pasada pertenecen a
[Interaction System Current State, seccion 5.8](../architecture/INTERACTION_SYSTEM_CURRENT_STATE.md#58-drag-performance-follow-up-2026-10-15).
Mantener separada la falla conocida de `canvasObjectPositioning.test.mjs`
(`0.1` frente a `0.502`); no modificar su expectativa para cerrar esta bateria.

### [ ] Fase 3B: editor real, comparabilidad y handoff (2026-10-15)

Esta ampliacion conserva la evidencia anterior de la seccion 5.8 como historica.
El estado verificado y la decision PERF02 B estan en
[Current State 5.9](../architecture/INTERACTION_SYSTEM_CURRENT_STATE.md#59-phase-3b-real-editor-measurement-and-partial-functional-validation-2026-10-15).
No interpretar los checks de pose/persistencia como aprobacion del contrato
completo de interaccion.

1. Preparar exclusivamente la copia y los emuladores del procedimiento local
   aislado. Registrar hashes vivos de fuentes y de todos los helpers del
   protocolo, version de navegador/Node, viewport, rasterizador y flags. Comprobar
   espacio libre y salud de la sesion antes de nuevas capturas; una falla de disco
   no autoriza reconstruir resultados como si hubieran terminado.
2. Registrar la preparacion real de seleccion, ausencia de inline y de overlays
   DOM que intercepten el punto. Refs Konva presentes no bastan para declarar UI
   lista. Cambios posteriores en preparacion conservan otro hash de protocolo;
   no usarlos como una comparacion temporal equivalente. El harness funcional
   valida `elementFromPoint` y la ancestry del hit Konva, registra intentos y
   elige un punto interior expuesto de la root esperada, sin controles Transformer.
   Galeria/countdown usan su frame existente; no se modifica el producto para
   alcanzar un punto. Un intento sin movimiento valido no completa el batch.
3. La copia 3B declara un prop inicial de zoom solo para pruebas, consumido por
   `useViewportScale`: comprobar escala efectiva 1/0.6 y Stage nativo 1. No es un
   control nuevo del producto ni un cambio CSS/Stage. Mantener las mismas fuentes
   de fixture/configuracion en cada par; conservar el boost existente.
4. Separar timing sin instrumentacion privada del diagnostico del composer real.
   Descartar warmups y exigir cinco repeticiones por celda. Para RAF distinguir
   antes de mouseup, intervalo que cruza release y trabajo posterior; ScriptDuration
   CDP conserva su ventana completa. No inferir FPS presentado, paint ni layout
   forzado a partir de RAF o lecturas DOM.
5. Comparar por caso solamente cuando ambos segmentos tienen la misma identidad,
   repeticiones, iniciales y reset undo visual/modelo/persistido. Conservar
   `completed:false`, timeout, `unknown_endcollection` y hashes originales. La
   comparacion text-only de A3 con B2 admite cuatro casos comunes/ocho celdas;
   no cambia sus matrices ni transforma B-shape en evidencia A/B.
6. PERF01: comprobar dos llamadas de diagnostico de texto por muestra Normal
   antes y cero despues con cobertura real del probe. El callback de mismatch
   sigue invocado y retorna antes de proyectar; preservar los dos bounds reads
   funcionales, deltas y sync. DOM global no es una atribucion exclusiva al guard.
7. PERF02: guardar muestras, contexto y spans exactos de la segunda resolucion;
   reportar p95, costo absoluto y union de intervalos como porcentaje del callback.
   No sumar spans inclusivos ni sustituir un poligono por el AABB de guias.
   Decision B actual: diferir reutilizacion; p95 residual 0.2 ms y 1.05–3.54% del
   callback de texto instrumentado no justifican alterar tokens/handoff.
8. Cache: distinguir preparacion, hits y validacion de entradas. B Normal observa
   0/9/49/99 fingerprints por muestra y dos bounds reads del activo; una cache hit
   sigue validando. El costo instrumentado de N100 no acredita el mismo porcentaje
   de CPU en produccion ni permite eliminar invalidacion.
   Completar PERF02 con el sync entero: B texto/N100/escala1/Normal, cinco gestos,
   dos llamadas/muestra, p95 0.3 ms/llamada y union p95 0.6 ms (10.38% del callback
   instrumentado); `mostrarGuias` inclusivo p95 4.8 ms. Referencia:
   `overlay-snap-focus-summary.json`, proyeccion de datos existentes. No sumar con
   bounds/cache ni presentarlo como ahorro realizable. Long tasks de ventana
   completa: medianas seis/709 ms por gesto; incluyen otras fases, no solo drag
   activo. Decision B se conserva por costo absoluto, alcance y riesgo funcional.
9. React: usar los root commit callbacks disponibles, sin llamarlos renders de
   componentes. Konva: los wrappers por instancia pueden eludir el wrapper del
   prototipo; usar tambien los contadores existentes por capa, sin sumarlos.
   Ausencias y listas top-five no equivalen a cero. Referencia B texto/N100:
   root commits medianos 53 Normal / 31 Alt; overlay sync 2/1 llamadas por
   muestra; capa `objects-main` 61/61 scene/hit y `drag-overlay` 139/139 Normal,
   121/121 Alt por sesion. Son contadores de metodos, no frames presentados.
10. Handoff funcional: por familia/escala/Normal-Alt, conservar cinco gestos
    consecutivos sin reseed, alternar direccion y terminar con release inmediato.
    Comprobar pose canonical, estabilidad release/settle, una seleccion visible,
    persistencia de TODAS las roots y children locales de grupos. Al final exigir
    undo/redo por teclado y reload sin reseed. History debe vaciar seleccion y
    frames, conservando las poses restauradas; no exigir la seleccion anterior.
11. Immediate Normal individual debe corregir un miss deliberado de 2 px de
    pantalla y conservar la pose del ultimo move hasta release. Registrar el
    numero real de lineas: cero no invalida la mutacion imperativa ni prueba
    presentacion de guias. Una prueba pausada separada debe mostrar una linea
    vertical exactamente en el centro y capturas durante/despues.
12. Mantener `strictInteractionCheck` separado: `dragVisualSelection` residual
    sigue siendo fallo del contrato aunque pose, autosave y frame visible sean
    correctos. No convertir el defecto en expectativa aceptada. Repetir despues
    de una correccion autorizada regrab, cancelacion, nuevo gesto e historial.
13. En capturas dedicadas separar pointerdown/pointerup, release hasta stop del
    probe y observacion adicional. Verificar el offset pagina/traza con EventTiming
    y red con requestId; no restar relojes sin ancla. El perfil completo incluye
    preparacion anterior al gesto. Conservar self/idle/unknown, timeDeltas reales,
    categorias sin evidencia como `null` y scopes inclusivos sin sumarlos.
14. Para atribuir exportacion exigir stacks y fuente, no una etiqueta por
    coincidencia parcial del nombre. `ElementoCanvas` no es `toCanvas`.
    Requests de thumbnail posteriores no prueban que todo release sea exportacion.
    Excluir estas capturas con overhead y observacion extra de timing A/B y de
    aceptacion de handoff inmediato. No inferir forced layout ni presentacion.

Checkpoint verificado: timing por casos 160 gestos medidos/variante, con 21/160
endpoints diferentes (todos Normal; Alt 80/80 iguales). El control A sin cambios
tiene 15/40 endpoints diferentes y variacion temporal importante. Diagnostico
texto: 40 medidos/variante, Normal 15/20 endpoints iguales y Alt 20/20. No declarar
una mejora causal de FPS/CPU a partir de estos deltas. `A-diag-core-v2` quedo
excluido enteramente por ENOSPC/results vacio; el B conservado mantiene su hash.

Handoff aceptado por batch: **32 batches/160 gestos**, 64 undo/redo y 32 reloads.
Cada familia completa tiene 20 gestos, 8 operaciones history y 4 reloads:
shape/text (V3, 40), rotated/image/gallery (V8, 60), countdown (V9, 20) y
group/multisection (V11, 40). V3/V8/V9 conservan `completed:false`; solo V11
termino completo. Las fuentes son iguales entre los cuatro; sus hashes de
runner distintos se preservan y no constituyen comparacion timing.

Excluir countdown4 de V8 y group5 de V9: el primero no probo movimiento final
nuevo porque ya estaba centrado; el segundo fallo la comparacion de reload al
agregarse defaults canonicos de estilo de texto. El harness mantuvo las
aserciones y ajusto solo trayectoria (Y40 cuando el centro ya coincide, aun con
un unico evento) y fixture de grupo (normalizador persistente existente antes
del seed). No atribuir esos ajustes a un cambio del producto.

Los 160 checks estrictos de gesto y 64 de historial fallan por estado transitorio
residual, sin checks ausentes: no hay PASS integral. Hay 14 correcciones inmediatas
individuales de 2 px y 14 ejemplos pausados/28 PNGs. Immediate registra 3 nodos de
guia en galeria, 1/3 en countdown y 0 en las otras familias individuales; conservar
esa observacion sin equipararla a presentacion. Grupo tiene expectativas separadas.

Multiseleccion sigue sin batch completo: cuatro intentos de un unico movimiento y
release inmediato fallan (V10 Normal/1 y tres celdas V12 restantes). Los 16 sweeps
previos movieron y persistieron ambas roots, pero fallaron strict cleanup y no
cuentan como batches completos. No hay validacion de persistencia/history/reload
del quinto gesto; "must commit" en el assert no prueba cuantos commits hubo.

Tres V12 muestran pointer-down `(260,140)`, activacion `(380,140)`, preview delta
`(0,0)` y `hasPreviewSinceActivation:false`. El motor manual rebasa el origen al
primer move que supera el umbral, retorna sin preview y el release en ese punto
calcula delta cero. En V10 el resultado esta observado y la ruta del motor es
inferida de fuente. Tambien falla con Alt: snapping no es requisito del fallo.
Conservar estos casos y caracterizar armed/update/finish sin activacion artificial;
decidir el comportamiento esperado del primer sample antes de corregirlo. Los
contratos inspeccionados no exigen descartarlo. Faltan 20 gestos aceptados; esta
trayectoria sintetica no demuestra su frecuencia con dispositivos fisicos.

La captura dedicada `B-trace-postrelease-v1-real-timing-core` completo 8 gestos,
con una traza/perfil Normal por shape/text N100/escala1. Gesto activo observado:
1624.583/1654.965 ms; release hasta stop del probe: 570.257/417.659 ms;
observacion extra: 1509.400/1508.800 ms. Scripting por union de intervalos en
release: 541.486/396.747 ms; self React en esa ventana: 396.239/281.547 ms,
con trabajo React development entre los frames importantes. Clonacion Konva
9.805/8.780 ms y raster/export 29.464/27.761 ms inclusivos aparecen en la
observacion extra, no explican todo release y no se suman a categorias self.
Source y red respaldan export/thumbnail posterior (Storage POST HTTP200,
76.531/41.538 ms request-to-finished); no es un perfil de produccion ni A/B.

La sesion nueva conserva fuentes B exactas (1282 hashes, cero AST privado) y el
aislamiento canonico. `restart-closure-20261015.json` y
`restart-ready-20261015.json` documentan cierre, puertos libres y servicios nuevos.
No mezclar su estado frio/coleccion con la sesion del core anterior ni convertir
el reinicio o un ajuste de preparacion del harness en una correccion productiva.

Artefactos bajo `.local-isolation/drag-phase3b/` (ignorados; conservarlos junto
con hashes y logs, no asumir su presencia en otro checkout):

- `final-metrics-table.md/.json`: tabla compacta con timing y diagnostico separados.
- `core-case-comparison.json` y `control-comparison.json`: casos completos y control
  sin cambios; incluyen paridad y limites del A interrumpido.
- `diagnostic-case-comparison.json` y `diagnostic-case-endpoint-parity.json`:
  comparacion de casos comunes de texto y discrepancias de endpoints.
- `functional-handoff-v3-coverage.json`: solo los 40 gestos funcionales aceptados;
  no incorpora intentos sin evidencia util.
- `functional-handoff-complete-160-coverage.json` y
  `functional-handoff-complete-160-summary.json`: 32 batches completos con 64
  history, 32 reloads, checks estrictos fallidos y procedencia de V3/V8/V9/V11;
  conservan los originales incompletos y excluyen sus batches no terminados.
- `multiselect-activation-report.json`: cuatro fallos inmediatos, 16 sweeps
  previos, mecanismo observado en tres V12, limite de inferencia en V10 y hashes
  de los readbacks. No usar `handoff-last-observation` de repeat3 como evidencia
  del quinto gesto fallido.
- `real-ux-case-coverage.json`, `real-ux-case-summary.json` y
  `real-ux-residual-table.md`: agregado parcial de 12/14 casos UX, con fuentes,
  resets, indices, residuos y los casos immediate excluidos.
- `dedicated-capture-findings.md` y
  `runs/B-trace-postrelease-v1-real-timing-core/dedicated-capture-summary.json`:
  dos capturas dedicadas con ventanas, stacks, red, hashes y limites.

Reprocesamiento local sin servicios ni nuevas mediciones (Node 20):

```powershell
node .local-isolation/drag-phase3b/summarizeDiagnosticFocus.mjs --case-scope-text .local-isolation/drag-phase3b/runs/A-diag-text-v3-real-diagnostic-core/results.json .local-isolation/drag-phase3b/runs/B-diag-core-v2-real-diagnostic-core/results.json --out .local-isolation/drag-phase3b/diagnostic-case-comparison
node .local-isolation/drag-phase3b/aggregateFunctionalHandoff.mjs .local-isolation/drag-phase3b/runs/B-handoff-v3-real-timing-handoff/results.json --out .local-isolation/drag-phase3b/functional-handoff-v3-coverage.json
node .local-isolation/drag-phase3b/aggregateFunctionalHandoff.mjs .local-isolation/drag-phase3b/runs/B-handoff-v3-real-timing-handoff/results.json .local-isolation/drag-phase3b/runs/B-handoff-special-v8-real-timing-handoff/results.json .local-isolation/drag-phase3b/runs/B-handoff-tail-v9-real-timing-handoff/results.json .local-isolation/drag-phase3b/runs/B-handoff-group-sections-v11-real-timing-handoff/results.json --out .local-isolation/drag-phase3b/functional-handoff-complete-160-coverage.json
node .local-isolation/drag-phase3b/writeFinalMetricsTable.mjs
node .local-isolation/drag-phase3b/summarizeDedicatedCapture.mjs .local-isolation/drag-phase3b/runs/B-trace-postrelease-v1-real-timing-core
```

Ultima verificacion de analizadores locales: **33/33 PASS** en ocho archivos
(agregadores funcional/de casos, traza, CPU, UX, resumen diagnostico y tabla de
comparacion), incluyendo los cinco tests CPU, cuatro del agregador UX y cuatro
del analizador UX. Cubre nombres completos de raster/export y collector instalado
sin fuente instrumentada. Reemplaza los checkpoints anteriores sin sumar suites
repetidas. Son tests de evidencia y no sustituyen los
gestos pendientes. El resumen general del editor real permanece en
`src/drag/testSupport/summarizeRealDragPerformance.mjs`; los helpers de muestras,
observacion e instrumentacion son de pruebas, sin import productivo. Para una
captura futura, `analyzeCpuProfile.mjs` y `analyzeCdpTrace.mjs` separan self/idle,
intervalos inclusivos y datos faltantes. Las dos capturas actuales aportan
evidencia de exportacion posterior y eventos Paint, nunca de layout forzado o
frames presentados. UX real con observadores diagnosticos conserva aceptacion
parcial, separada de timing A/B y de los tests de reloj controlado.

UX utiliza observadores diagnosticos sobre fuentes B sin AST privado. El primer
run conserva un caso horizontal/escala1 completo (12 gestos, dos warmups), luego
falla el timeout del overlay local esperado durante preparacion de otro caso.
El ajuste de setup a 10 s y el filtro de trayectorias no cambian producto ni el
gesto medido. El rerun horizontal/escala0.6 completo sus 12 gestos; las trayectorias
restantes completaron diez casos mas antes del fallo immediate/escala1/Alt.
El agregado conserva **12/14 casos completos, 120 medidos y 24 warmups excluidos**;
fuentes/sesion iguales, protocolo del primer run distinto y originales incompletos
sin elevar a `completed:true`. Los 60 pares Normal/Alt tienen secuencia espacial
cliente igual; se emparejaron 6240 muestras sin mismatch de coordenadas. Ultimo
motion y nodo final coinciden en los 120 gestos; strict cleanup falla 120/120.

Residuos de ancla local frente desplazamiento cliente: tabla firmada X/Y y p95/max
de magnitud por trayectoria/escala en `real-ux-residual-table.md` y Current State5.9.
No interpretarlos como AABB, latencia o frames presentados; no comparar magnitud
XY con umbrales por eje. Los offsets Alt pequenos/estables no prueban lag fisico.
No se observan pasos de eje opuestos al cursor por encima de epsilon0.5px, lo que
no descarta jitter perceptual ni identifica locks.

El collector `realSamples.version:1` puede estar instalado con `samples:[]` y
fuentes `privateInstrumentation:false`: callbacks/outcomes y lock identity/age
deben quedar `null`, nunca cero. No usar timestamps de input como adquisicion de
lock. La decision de histeresis sigue apoyandose en clockprobe separado y requiere
validacion de usuarios/dispositivos.

Immediate1 conserva solo dos warmups y un Normal medido fuera de casos completos;
el cambio Y de ese Normal no valida el X solicitado. El Alt siguiente falla
movimiento real. Immediate0.6 reproduce esa secuencia parcial en
`B-ux-immediate06-lastpos-v1-real-diagnostic-ux`; ambos casos se conservan como
incompletos, sin incorporarlos a la tabla ni presentar el Y-snap como exito X.

Defecto nativo confirmado a0.6: mismo nodeId31, primer Alt `(240,120)->(320,120)`;
undo devuelve `(240,120)` pero `_lastPos` conserva `(320,120)`. Otro unico move al
mismo destino encuentra la cache igual y `Konva.Node._setDragPosition` omite
`setAbsolutePosition`, pese a la pose actual distinta. Normal solo cambia Y a112;
Alt siguiente no cambia pose. El fallo1 reproduce el resultado pero no captura
esos campos internos. No confundir esta cache nativa con SNAP01 ni con el origen
de activacion del motor manual multiseleccion. Mantener la regresion fallida y
corregir su ciclo drag/undo en alcance productivo separado; no agregar un move
de activacion para ocultarla.

El browser observa nodo/cache/resultado; no traza la rama interna. La
caracterizacion separada del metodo instalado Konva9.3.20 pasa **3/3**: reproduce
el destino repetido omitido tras reset normal y controla destino diferente/nodo
nuevo. Root y copia B tienen `Node.js` identico. Evidencia:
`native-last-position-after-undo-report.json`, SHA256
`6c03a44b67de0e3821376072cf2405461ad7ed7a67c53ffb2486f6cec73265a0`.
Reproducible sin browser: `node --test .local-isolation/drag-phase3b/konva-last-position-characterization.test.mjs`.
Son tres caracterizaciones adicionales a los 33 analizadores, no una correccion
productiva ni PASS de los dos casos immediate excluidos.

Preparacion seed: deduplicar el preseed inicial por familia/N. Si el PATCH falla
con `TimeoutError`/`AbortError`, `verifySeedAfterTimeout.mjs` permite una unica
GET autenticada con limite de 5 s, nunca reintenta el write. Aceptar solo owner y
sesion exactos y `isDeepStrictEqual` de TODOS los campos REST esperados, incluidos
tipos escalares y strings timestamp. No aceptar normalizacion equivalente,
campos faltantes/extra ni respuestas parciales; si la lectura o comparacion falla,
conservar el error original. Registrar aceptaciones en
`manifest.seedResponseReconciliations` y version de helper/runner. Esto sucede
fuera de medicion y no corrige la persistencia productiva.

El helper de seed tiene **14/14 PASS** propios, separados de los 33 tests de
analizadores, incluidos negativos y preservacion del error original. Reproducible
sin servicios: `node --test src/drag/testSupport/verifySeedAfterTimeout.test.mjs`.
No ejecutar durante otra captura para no introducir carga externa.

Agregar solamente casos completos con cinco Normal/cinco Alt,
warmups y todos los resets verificados; preservar `completed:false`, hashes y
casos omitidos. Comparar desviaciones Normal/Alt solo si coincide la secuencia
real de desplazamiento del cursor; no sumar esta poblacion a la comparacion
temporal A/B ni interpretar edades de evento como locks de 120 ms.

Reprocesamiento del agregado parcial (Node20, sin servicios):

```powershell
node .local-isolation/drag-phase3b/aggregateRealDragUx.mjs .local-isolation/drag-phase3b/runs/B-ux-real-v1-real-diagnostic-ux/results.json .local-isolation/drag-phase3b/runs/B-ux-horizontal06-v3-real-diagnostic-ux/results.json .local-isolation/drag-phase3b/runs/B-ux-remaining-v1-real-diagnostic-ux/results.json .local-isolation/drag-phase3b/runs/B-ux-immediate06-lastpos-v1-real-diagnostic-ux/results.json --out .local-isolation/drag-phase3b/real-ux-case-coverage.json
node .local-isolation/drag-phase3b/writeUxCaseSummary.mjs .local-isolation/drag-phase3b/real-ux-case-coverage.json
```

Clockprobe repetido en artefacto NUEVO
`ux/guide-ux-evidence-phase3b-20261015.json`: 15 hashes, 12 fronteras, 16
trayectorias por repeticion y cinco repeticiones identicas. Confirma activacion
10/6px, liberacion18/14px y multiplicador1.75 hasta120ms inclusive (31.5/24.5px).
No sobrescribe la evidencia Phase3, ni suma esas repeticiones como tests de FPS
independientes. Usar el export `runGuideUxProbe()` para guardar otra ruta; su CLI
historico escribe en Phase3. El nuevo probe no cambia valores ni selecciona una
calibracion UX. El conjunto final de analizadores cuenta33 tests distintos, no
la suma de las corridas28/8/33.

Cierre operativo: conservar el fallo del wrapper canonico (exit3, no confirmo
detencion del arbol propio) y su marker original. La verificacion independiente
`closure-poststop-verification-20261015.json` encuentra 13 PIDs propios ausentes,
ocho puertos libres y cero Chrome propios; no reetiqueta ese fallo como PASS.
`closure-isolated-config-provenance.json` confirma configuracion/source congelados
B en runtime, distintos de cambios concurrentes posteriores de raiz que se
preservaron. No tratar esa evidencia de hashes como traza de acceso del sistema.

### [ ] Fase 3C: destino repetido, limpieza y release inmediato

Ejecutar con Node20 las suites `src/drag/konvaDragSession.test.mjs`,
`src/drag/dragGrupal.test.mjs` y
`src/components/editor/textSystem/render/konva/dragVisualSelectionLifecycle.test.mjs`,
junto a `src/components/editor/textSystem/render/konva/preservedGroupHandoff.test.mjs`,
ademas de las regresiones de Fases1/2, geometria, seleccion, overlay, touch intent,
historial y persistencia. No cambiar la expectativa conocida de
`canvasObjectPositioning.test.mjs` (`0.1 !== 0.502`).

En el editor real aislado, con Normal/Alt y zoom1/0.6:

1. Arrastrar texto a un destino, deshacer, repetir exactamente ese destino con
   un solo movimiento y soltar inmediatamente. Verificar el destino X completo,
   pose visual/canonica/persistida y mismo nodo; un cambio Y por snapping no
   demuestra que X haya sido aplicado. No insertar un movimiento de activacion
   para ocultar la omision nativa.
2. Arrastrar una multiseleccion desde armed: al primer movimiento que supera el
   umbral ambos nodos deben moverse. Soltar en ese mismo punto debe persistir
   ambos desplazamientos una vez. Verificar tambien subumbral/cancelacion,
   cambio de direccion, pointer ajeno y touch con intencion de scroll.
3. Durante settling conservar los IDs de drag hasta completar el handoff. Al
   retirarse overlay, exigir `dragVisualSelection` con `ids:[]`,
   `predragActive:false`, `sessionKey:null`, `dragId:null`; `pendingDragSelection`
   vacio, guias/overlay ausentes y seleccion/transformer coherentes.
4. Repetir gestos consecutivos, undo/redo y recarga del borrador emulado con
   texto rotado, imagen, Gallery, Countdown, grupo persistido y varias secciones.
   El teardown de una sesion anterior no debe borrar la identidad de la nueva.
5. Al actualizar Konva, comprobar la regresion con los metodos nativos instalados
   y revisar si sigue siendo necesario el adapter privado `_lastPos`. No ampliar
   ese reset a cada movimiento ni modificar la dependencia/prototipo global.
6. Para el grupo persistido, distinguir por identidad de nodo el overlay y el
   indicador seleccionado. Un unico marco visible no prueba que hubo handoff:
   el overlay anterior debe dejar de pintar y el indicador seleccionado asumir
   la representacion. Durante el probe, el indicador debe estar montado pero
   oculto; bounds invalidos, miembros faltantes o una sesion reemplazada no
   deben confirmar readiness. Conservar la politica de fallback propia del
   renderer seleccionado, sin crear otra autoridad geometrica.

Conservar los fallos de Fase3B y generar resultados nuevos bajo
`.local-isolation/drag-phase3c/`; la escena offline no reemplaza el editor real.
El runner real requiere `DRAG_PERF_EVIDENCE_PHASE=drag-phase3c` y
`DRAG_PERF_STRICT_HANDOFF=1` para esta aceptacion, junto al opt-in local y la
sesion canonica validada. No sobrescribir un manifest existente. El detector de
instrumentacion debe ignorar sus propios strings/comentarios, pero rechazar
declaraciones inyectadas reales en JS/JSX; no excluir archivos del inventario de
hashes para resolver falsos positivos. La regresion inmediata de grupo exige el
delta completo del lider antes/despues de release, con tolerancia de redondeo
CDP, y la traslacion final de ambos miembros; no sumar un segundo movimiento.
Estas pruebas validan correccion funcional, no mejora de FPS, latencia fisica ni
calibracion UX. Mantener PERF-02 y tolerancias/histeresis fuera de esta correccion.

Para agregar la evidencia local, `analyzePhase3cAcceptance.mjs` requiere rutas
explicitas de `runs/.../results.json` y `--out` a un archivo nuevo. Comprueba el
protocolo archivado, fuentes identicas, `completed:true`, poses, historial,
recargas y limpieza estricta. La matriz completa exige nueve familias, dos
zooms y Normal/Alt: 180 gestos consecutivos, 72 checks de historial y 36
recargas, mas 20 destinos inmediatos repetidos tras undo y cuatro calentamientos.
No aceptar un run parcial aunque todos sus gestos capturados hayan pasado.
Conservar aparte el timeout inicial V2 (45 gestos aprobados antes de bloquearse
la siguiente apertura del dashboard); su causa no fue establecida ni corregida
por el pase posterior de esa apertura. Las tandas nuevas completas usan el mismo
protocolo, sin ampliar timeout ni editar datos o resultados fallidos.

Resultado final 2026-10-15: `acceptance-final-v2.json` aprueba esa matriz completa,
sin errores ni celdas faltantes. Usar exclusivamente las nueve tandas
`phase3c-{family}-v2-real-timing-handoff` y
`phase3c-immediate-v3-real-timing-ux`; excluir `families-v2` parcial y V1.
`final-browser-runtime-evidence-v2.json` verifica las 391 fuentes, nueve hashes
de protocolo y seis archivos productivos identicos. Los 319 tests relacionados,
76 de infraestructura (mas un opt-in omitido), 16 del analizador y 11 Chromium
offline pasan con Node20. La suite conocida de posicionamiento conserva su
unica falla separada. Ver alcance y limites en el estado actual, seccion5.10.

### [ ] Latencia cursor-elemento: entrada y dibujo separados (2026-10-16)

1. Partir del editor real aislado con diez objetos y repetir texto, forma e
   imagen lejos de guias, Normal/Alt desde el press, zoom1/0.6. Registrar backend
   grafico, modo dev/produccion y procedencia fisica/CDP; no comparar poblaciones
   distintas como si fueran una optimizacion.
2. Separar press, espera del umbral, preparacion/predrag, primer native y
   movimiento continuo. Conservar LongTasks previos y pausas tardias aunque
   el p95 del handler sea bajo. Captura→nodo y eventos scene no acreditan
   presentacion fisica. Corregir el offset de agarre una sola vez.
3. El observer de capas debe preservar wrappers instalados por imagen y freeze:
   V2 usa eventos publicos, sin reemplazar `drawScene`. Excluir tiempos de imagen
   V1; una posicion cuantizada repetida no requiere un dibujo nuevo.
4. Evidencia de esta investigacion: 72/72 gestos de produccion local con GPU
   deshabilitada y seis del control con backend grafico habilitado. En el control
   desaparecen cinco LongTasks iniciales de imagen sin cambiar producto; esto
   no resuelve el sintoma de un dispositivo fisico ni demuestra mejora de FPS.
5. Ejecutar la prueba manual preparada en
   `.local-isolation/drag-latency-20261016/manual-real-input.md` en el dispositivo
   afectado. El snippet fue validado sin input; el gesto fisico sigue pendiente.
   Conservar datos y percepcion por separado, y detener la sesion demo propia.

Ver metodologia, tabla, limites y decision sin cambio productivo en
[Interaction System Current State, seccion 5.11](../architecture/INTERACTION_SYSTEM_CURRENT_STATE.md#511-cursor-following-latency-investigation-2026-10-16).

### [ ] Canvas alto y reutilizacion del hit bitmap vacio (2026-10-16)

1. Repetir 30 objetos identicos con una y ocho secciones, texto e imagen,
   Normal/Alt, conservando zoom, DPR, backend GPU y posiciones. Separar los
   tiempos de entrada, callbacks RAF y rasterizacion nativa diferida.
2. Conservar la primera limpieza de los hits anteriores al drag. Mientras Konva
   no dibuja hits, omitir solamente clears repetidos de un bitmap probado vacio.
   Al soltar, comprobar `getIntersection` en la nueva posicion y ausencia del
   hit anterior; repetir seleccion, drag, undo/redo y release inmediato.
3. Cubrir resize/reemplazo del canvas, hijos que vuelven a ser interactivos,
   clip/cache del layer, `drawHit` personalizado, argumentos de export/cache,
   excepciones, freeze/thaw y lift/restauracion de imagen. No cambiar listening
   para conseguir una mejora ni confundir bitmap vacio con geometria obsoleta.
4. Ejecutar `konvaLayerHitDraw.test.mjs` y el opt-in
   `KONVA_HIT_DRAW_BROWSER=1` de `konvaLayerHitDraw.browser.test.mjs`; este ultimo
   valida pixeles Konva reales sin Firebase. Complementar con el editor completo,
   grupos, Gallery, Countdown, texto rotado y persistencia aislada.
5. Comparar tambien una repeticion original sin cambios: A1/guard/A2 mostro
   variabilidad importante. La eliminacion medida de trabajo nativo no acredita
   por si sola una mejora de FPS o que el trackpad fisico siga al cursor sin atraso.

Ver evidencia y limites en
[Interaction System Current State, seccion 5.12](../architecture/INTERACTION_SYSTEM_CURRENT_STATE.md#512-long-invitation-canvas-cost-2026-10-16).

### [ ] Re-seleccion despues del drag

1. Mover un objeto o grupo.
2. Apenas soltar, clickear el stage vacio.
3. Volver a seleccionar el mismo objeto.

Resultado esperado:

- la deseleccion funciona de inmediato
- el objeto puede volver a seleccionarse sin bloqueo temporal
- no reaparece una seleccion vieja

### [ ] Alineacion inicial de texto

1. Insertar un titulo, subtitulo o parrafo mediante las acciones genericas de Texto.
2. Confirmar la seleccion y ampliar su caja desde la barra vertical lateral derecha del transformer.
3. Insertar tambien un preset que declare explicitamente alineacion izquierda o derecha.

Resultado esperado:

- el texto generico nuevo nace centrado dentro de su transformer y conserva esa alineacion al cambiar el ancho de la caja
- el control lateral de ancho se representa como una barra vertical, no como un circulo
- el resize lateral modifica solo el ancho de la caja, no el tamano del texto
- la alineacion explicita de un preset no es reemplazada por el default centrado

### [ ] Scroll tactil vs marquee

1. En mobile o emulacion tactil, hacer scroll vertical sobre el canvas sin intentar seleccionar.
2. Repetir iniciando un marquee real desde zona vacia.

Resultado esperado:

- el scroll normal no arma marquee por error
- el marquee real sigue funcionando despues del scroll
- el rectangulo de seleccion no deriva respecto al puntero

### [ ] Scroll tactil sobre objetos vs drag

Ejecutar la siguiente matriz en dispositivos reales; la emulacion tactil sirve solo como smoke check:

| Dimension | Cobertura minima |
| --- | --- |
| Navegador | Chrome Android y Safari iOS |
| Estado de seleccion | elemento no seleccionado y elemento ya seleccionado |
| Objetivo | texto, imagen, galeria, countdown, grupo persistido `tipo: "grupo"` y lider de una multiseleccion |
| Gesto | scroll vertical inmediato, scroll vertical iniciado despues de una pausa, toque breve, movimiento menor al umbral, drag con inicio horizontal y continuacion vertical o diagonal |
| Limites | cerca de anchors de resize/rotacion, controles de seleccion y sobre canvas vacio |
| Interrupcion | release dentro y fuera del canvas, `touchcancel`, `pointercancel`, perdida de foco y desmontaje del editor |

Resultado esperado:

- el scroll vertical sobre objetos no selecciona ni mueve el objeto, aunque empiece despues de una pausa; la posicion permanece exacta mientras la intencion esta pendiente
- una vez que el gesto pertenece al scroll, nunca se convierte luego en drag
- ni el tiempo transcurrido ni una pausa estacionaria habilitan drag: el movimiento inicial vertical sigue siendo scroll
- un movimiento inicial horizontal claramente intencional entra al flujo normal de predrag, drag overlay y settle; una vez confirmado puede continuar vertical o diagonalmente con precision
- el toque breve y el movimiento menor al umbral seleccionan cuando corresponde sin desplazar el elemento
- antes de confirmar drag se conserva el scroll nativo; no se observa bloqueo causado por `preventDefault` o `touch-action: none` prematuros
- los anchors y controles conservan resize, rotacion y seleccion sin iniciar drag del objeto subyacente; el canvas vacio conserva scroll y tap sin marquee accidental
- release, cancelacion, perdida de foco y unmount limpian listeners, seleccion diferida, lease de Konva, draggable temporal, touch action, predrag, hover y overlay

### [ ] Ceremonia/Fiesta: composiciones independientes por modalidad

1. Abrir un documento legado sin editar: no crear `seccion.eventLayout` ni escribir
   una migración por apertura. Mantener la presentación inicial.
2. En `single`, mover una raíz de Ceremonia con otras raíces asociadas visibles:
   nodo final, coordenada canónica y guardado coinciden; los compañeros conservan
   su posición visible. Repetir con texto legado `__groupAlign`, forma, Gallery y
   Countdown, Normal/Alt y zoom 1/0,6.
3. Hacer multiselección y soltar después de un desplazamiento: una actualización
   conjunta conserva todos los miembros. Repetir un drag individual inmediatamente.
4. Cambiar `ceremony_party → single`, mover, volver a ambos, mover y regresar a
   `single`: recuperar cada composición sin desplazamientos acumulativos. Party
   oculto conserva datos y su posición de la modalidad correspondiente.
5. Deshacer/rehacer movimiento, modalidad y reset. No revertir valores semánticos
   editados en el sidebar. Verificar el payload persistido además de React/Konva.
6. Usar «Restablecer distribución de esta modalidad»: recuperar sólo las posiciones
   iniciales de la modalidad activa, respetar secciones bloqueadas y permitir undo.
7. Guardar/recargar y repetir la alternancia. Un checkpoint existente desalineado
   con `eventDetails.mode` debe materializarse en memoria sin inicializar secciones
   legadas. Repetir undo de modalidad con una sección bloqueada y luego desbloquear.
8. Agrupar, mover, desagrupar, trasladar entre secciones, duplicar y eliminar:
   no recuperar checkpoints de IDs que dejaron de ser raíces de esa sección.
   Undo restaura el snapshot completo; nuevos IDs usan su posición actual.
9. Resize/rotación manual sin cambio inicial de `x/y`: congelar la composición y
   conservar el ancla. Previews y release encolados desde el mismo render legado
   no aplican dos veces la inversa del offset. Rechazos no modifican objetos.
10. Editar texto y cambiar medidas: conservar el comportamiento de auto-width y
    centro visual; no convertir mediciones automáticas en una edición de layout.
11. Verificar el HTML preparado para ambos modos con mobile `auto` y `preserve`;
    documentar por separado el generador local y el flujo completo de preview.

Anclas ejecutables: `shared/eventLayout*.test.mjs`,
`canvasEditor/eventLayoutEditorState.test.mjs`,
`canvasEditor/eventLayoutMutationBoundaries.test.mjs`,
`history/historyEventMode.test.mjs`, `window/eventLayoutReset.test.mjs`,
`persistence/eventLayoutPersistence.test.mjs` y
`templateAuthoring/eventLayoutAuthoringState.test.mjs` bajo `src/components/editor/`.
Ejecutar con Node 20. Evidencia local:
`.local-isolation/event-layout-implementation-20261016/`.
La falla preexistente `0.1 !== 0.502` en `canvasObjectPositioning.test.mjs`
permanece separada; no cambiar su expectativa para aprobar esta batería.

## 2. Texto inline

### [ ] Expansion de seccion por contenido de texto

1. En una seccion con Pantalla OFF, ubicar un texto cerca del borde inferior y
   agregar lineas o palabras que provoquen wrap; confirmar la edicion inline.
2. Repetir con `Nuestra historia` desde el Tab Texto y desde su texto vinculado;
   incluir dos vistas en distintas secciones y una vista dentro de un grupo.
3. Borrar parte del contenido, vaciarlo y repetir una actualizacion sin cambios.
4. Repetir con Pantalla ON, texto que todavia cabe y otra seccion precedente.
5. Arrastrar, cambiar ancho/tamano, insertar imagenes y editar ornamentos sin
   modificar contenido de texto. Repetir en desktop y mobile con zoom.
6. Guardar/recargar y abrir preview despues de editar; comprobar tambien undo/redo
   del texto libre y que los valores dinamicos mantienen su politica de historial.

Esperado:

- solo el crecimiento de contenido hacia abajo expande la altura necesaria, sin
  margen adicional ni contraccion posterior;
- Pantalla ON conserva su altura, y los demas gestos conservan su comportamiento;
- las otras posiciones/tamanos y el frame de grupo permanecen intactos;
- texto y altura se guardan juntos por el owner existente.

Anclajes automatizados: `src/domain/sections/textContentExpansion.test.mjs`,
`src/components/editor/textSystem/commitPolicy/textSectionExpansion.test.mjs` y
`src/components/editor/textSystem/metricsLayout/services/textContentBounds.browser.test.mjs`.
Este ultimo usa Puppeteer/Konva con datos sinteticos y requests bloqueados; valida
geometria desktop/mobile, no una sesion completa del editor ni Firebase.

### [ ] Entrada a inline edit sin click extra

1. Seleccionar un texto.
2. Ejecutar el gesto normal para entrar a inline edit.
3. Escribir inmediatamente.

Resultado esperado:

- se abre el overlay DOM sobre el texto correcto
- aparece caret activo dentro del editor inline
- se puede escribir sin requerir un click adicional

### [ ] Seleccion inicial y caret por tercer click

1. En un texto de una sola linea, hacer click para seleccionarlo y un segundo click para entrar a inline edit.
2. Confirmar que al entrar queda seleccionado todo el contenido.
3. Hacer un tercer click en el inicio, medio y final del texto.
4. Repetir la secuencia con un texto multilinea corto y con uno largo; clickear tambien en la primera, una intermedia y la ultima linea.

Resultado esperado:

- el segundo click conserva la seleccion completa inicial tanto en una linea como en multilinea
- el tercer click quita la seleccion completa y deja un unico caret en la ubicacion clickeada
- la sesion inline no se cierra ni vuelve a abrir durante el tercer click
- no hay parpadeo entre caret, seleccion completa y seleccion de objeto
- el comportamiento existente de una sola linea no cambia

### [ ] Commit por click afuera, `Escape` y `Tab`

1. Editar un texto.
2. Confirmar una vez con click afuera.
3. Repetir con `Escape`.
4. Repetir con `Tab`.

Resultado esperado:

- la edicion cierra limpio en los tres casos
- el texto final queda reflejado en canvas
- no queda overlay ni transformer en estado conflictivo

### [ ] Multilinea y saltos de linea

1. Editar un texto multilinea creado con la caja fija actual.
2. Repetir con un texto legado de plantilla o borrador que no tenga `width` persistido.
3. Escribir hasta superar el ancho visible y agregar o quitar saltos con `Enter`.
4. Mover el caret con teclado y confirmar la edicion.

Resultado esperado:

- los saltos se preservan
- tanto el texto nuevo como el legado conservan el ancho visual inicial y hacen wrap; el transformer no crece horizontalmente con cada caracter
- el overlay sigue alineado con el texto visible
- el commit final no salta de posicion

### [ ] Texto vacio

1. Editar un texto comun.
2. Borrar todo el contenido.
3. Confirmar la edicion.

Resultado esperado:

- el objeto se elimina si esa es la regla actual del tipo texto
- no quedan handles, hover ni seleccion fantasma
- el autosave posterior sigue funcionando

### [ ] Campo dinamico Texto historia

1. Abrir una sesion de edicion de plantilla con usuario admin o superadmin.
2. Seleccionar un elemento de texto y abrir el engranaje.
3. Confirmar que la opcion dinamica aparece como `Texto historia`.
4. Vincular el texto a `Texto historia`.
5. Abrir el Tab Texto y editar el campo bajo `Nuestra historia`.
6. Editar inline el mismo contenido directamente desde el canvas, confirmar y repetir cancelando con `Escape`.
7. Abrir un borrador o plantilla que declara `Texto historia` pero no tiene ninguna vista vinculada; repetir con un documento que no declara el field.
8. Con el transformer, cambiar el ancho de la caja del texto marcado y volver a editar desde `Nuestra historia`.
9. Abrir el modo asistente en un borrador con `Texto historia` vinculado.
10. Abrir el modo asistente en un borrador sin `Texto historia` vinculado.
11. Repetir la revision del engranaje con un usuario sin permiso admin/superadmin sobre un borrador que hereda el campo.
12. En el asistente o Tab Evento, enfocar nombre, fecha, hora, lugar y direccion con textos dinamicos vinculados en diferentes secciones.
13. En el Tab Texto, enfocar y editar `Nuestra historia` con su texto vinculado fuera del viewport actual.
14. Vincular dos vistas al mismo field, una como child de grupo, y editar primero desde canvas y luego desde sidebar.

Resultado esperado:

- solo admin/superadmin puede asignar o reasignar `Texto historia` desde el engranaje
- la opcion no aparece como `Textto historia`
- el Tab Texto muestra `Nuestra historia` cuando el field existe en schema, aunque no tenga vista; un documento sin el field no inventa el control
- editar desde el sidebar actualiza el texto del canvas
- el texto editado desde el sidebar conserva el ancho y la alineacion de la caja; si el contenido es largo, envuelve dentro de esa caja
- el transformer del canvas sigue pudiendo cambiar el ancho de la caja del texto marcado
- el contenido vinculado usa la misma UX inline que un texto normal, pero cambia el valor estructurado y todas sus vistas sin escribir directamente el objeto seleccionado
- al seleccionar una única vista vinculada aparece arriba el indicador discreto `🔗 <nombre del campo>`; no aparece en texto común ni en multiselección y no bloquea clicks
- `Escape` restaura el valor de entrada en canvas y sidebar; vaciar el contenido no elimina ni desvincula la vista
- editar desde canvas o sidebar actualiza las dos vistas, incluido el child agrupado, y conserva ancho, alineacion y wrapping
- en modo asistente, el paso `Texto` aparece despues de `Evento` si existe `Texto historia` en schema, no por presencia de una vista
- el Tab Texto en modo asistente muestra solo `Nuestra historia` y su caja de texto
- un usuario sin permiso no puede reasignar el campo desde el engranaje y el vinculo heredado no se elimina
- al enfocar campos dinamicos del sidebar, el canvas hace scroll suave hasta el primer objeto vinculado sin cambiar seleccion, hover, transformer ni modo inline
- al enfocar campos editables del sidebar, su contenido queda seleccionado y escribir reemplaza el valor existente

### [ ] Campos dinámicos: estado, eliminación y recuperación de vistas

1. Preparar un field con dos vistas de texto, una de ellas como child de grupo; repetir con ubicación/mapa y fecha/countdown de una misma phase.
2. Verificar que el indicador integrado muestre `Visible`, `Oculto` o `Insertar` dentro del borde derecho del input, sin iconos de ojo ni una etiqueta duplicada debajo o al costado.
3. Con tres vistas, activar repetidamente el indicador visible/oculto y confirmar que selecciona y centra el primer, segundo y tercer root en orden de canvas, vuelve al primero en la cuarta activación y usa el wrapper para un child agrupado. Eliminar una vista durante el recorrido y confirmar que continúa desde un root válido.
4. Intentar quitar una vista vinculada con teclado y con menú touch. Cancelar una vez con `Cancelar` y otra con `Escape`.
5. Confirmar `Quitar`; repetir con selección mixta y con eliminación de sección/grupo.
6. Editar el dato desde el sidebar cuando no queda ninguna vista, recargar y comprobar que el valor sigue disponible para sidebar/modal/Designer AI.
7. Restaurar con cache, después de mover, redimensionar, cambiar estilo y formato. Repetir sin cache, con sección original ausente y con colisión del ID archivado.
8. Eliminar un child dinámico dentro de un grupo y restaurarlo. Verificar que vuelve standalone y que no reaparecen siblings.
9. Con varias vistas del mismo field, quitar una y confirmar que no se ofrece restore; quitar todas en un mismo batch y comprobar que la última por orden visual estable es la recuperable.
10. Ejecutar delete -> undo -> cambiar el valor -> redo/undo, y repetir después de reload.
11. Simular fallo de persistencia durante la confirmación.
12. Repetir el diálogo en desktop y mobile, con teclado, lector semántico y `prefers-reduced-motion`.
13. Vincular ambos nombres sólo mediante `Nombres de los casados (&)`, quitar esa vista y restaurar primero desde cada uno de los dos inputs en ejecuciones separadas.

Resultado esperado:

- el indicador deriva `visible | hidden | absent`, lo presenta dentro del input como `Visible | Oculto | Insertar`, muestra badge sólo para más de una vista y no cuenta targets stale ni vistas inválidas; activaciones sucesivas recorren circularmente los roots vinculados en orden de canvas sin crear otra selección; mapa/countdown no duplican la etiqueta junto a sus checkboxes
- mapas cuentan para nombre/dirección y countdowns para fecha/horario de inicio de su phase; no se persiste otro índice de visibilidad
- el `alertdialog` aparece junto a la selección en desktop y como tarjeta compacta separada de los bordes en mobile, sin extenderse hasta el pie de la pantalla; nombra los campos alcanzados y explica brevemente que se recuperan con `Volver a insertar` en el panel de datos; inicia foco en `Cancelar`, contiene/retorna foco, responde a `Escape` y mantiene targets táctiles de al menos 40 px
- cancelar no cambia selección, refs, history, persistencia ni objetos; un fallo de persistencia también conserva la vista y muestra feedback
- confirmar quita sólo vistas y targets, conserva field y valor estructurado, y persiste la mutación alcanzada antes de limpiar selección
- editar el dato ausente no recrea objetos; restaurar inserta como máximo una vista y aplica siempre el valor estructurado actual
- con cache se recuperan posición, estilo, tamaño, formato y targets exactos; sin cache se usan builders/defaults consistentes para texto, mapa o countdown
- la restauración respeta la asociación funcional, remapea IDs en conflicto y usa la sección original editable o un fallback normalizado
- undo/redo restaura vista, targets y recovery, nunca revierte el valor dinámico actual
- una vista combinada de nombres afecta el estado de ambos inputs; restaurar desde cualquiera recupera una sola vista combinada con su formato y targets previos

## 3. Preview boundary

For normal draft sessions, expected preview means `draft-authoritative` backend prepared preview. If prepared validation returns blockers, the pass condition is that no trusted stale HTML is shown and the blocker message matches the current publish validation contract.

### [ ] Preview inmediatamente despues de editar un objeto

1. Mover un objeto o cambiar su tamano.
2. Abrir preview sin esperar el debounce completo.

Resultado esperado:

- preview refleja el ultimo estado editado
- no aparece una version previa del objeto
- la apertura no falla por flush si el editor esta operativo

### [ ] Preview inmediatamente despues de inline text edit

1. Editar un texto inline.
2. Confirmar el cambio.
3. Abrir preview de inmediato.
4. Repetir con un texto vinculado y con un field date/time editado desde su control tipado anclado.

Resultado esperado:

- preview muestra el texto ya confirmado
- no reaparece el texto anterior por debounce pendiente
- los targets vinculados conservan sus transforms y preview no serializa estado de la sesion inline

### [ ] Preview despues de mutacion directa de seccion

1. Reordenar una seccion, cambiar su altura o alternar `pantalla/fijo`.
2. Abrir preview de inmediato.

Resultado esperado:

- preview refleja el nuevo orden o altura
- la mutacion directa de seccion no queda atras del autosave

### [ ] Reabrir preview despues de varios cambios

1. Abrir preview.
2. Cerrar preview.
3. Hacer mas cambios en objetos o secciones.
4. Abrir preview otra vez.

Resultado esperado:

- la segunda apertura usa el estado mas reciente
- no reaparece una snapshot vieja

### [ ] Fallo de guardado al abrir preview y reintento

1. En un entorno aislado, demorar o rechazar la escritura del borrador.
2. Editar repetidamente `Nuestra historia` desde el panel y desde inline; abrir preview.
3. Ante timeout o error, comprobar el modal en desktop y mobile.
4. Restablecer el guardado y pulsar `Reintentar` varias veces durante la misma espera.
5. Cerrar durante un intento pendiente y completar luego esa operacion.

Resultado esperado:

- el modal permanece abierto con el error y `Reintentar`, sin spinner permanente ni HTML anterior
- no hay reintentos automaticos; los clicks repetidos comparten un intento en curso
- los valores pendientes consecutivos guardan el ultimo snapshot completo, incluido el texto y la altura, antes del flush confirmado
- las mutaciones de seccion/schema/history y el flush mantienen su orden; solo se agrupan snapshots de valores que aun no comenzaron a escribirse
- la preparacion no comienza antes del guardado confirmado; cerrar impide que un resultado tardio reabra el modal

## 4. Persistencia y orden de guardado

### [ ] Autosave basico

1. Mover un objeto.
2. Esperar mas de 2 segundos.
3. Recargar el borrador.

Resultado esperado:

- el cambio persiste despues del reload
- no vuelve una version anterior

### [ ] Mutacion directa de seccion + reload

1. Crear, borrar o reordenar una seccion.
2. Recargar el borrador.

Resultado esperado:

- el cambio de seccion persiste
- no se mezcla con un orden previo

### [ ] Autosave + mutacion directa + flush critico

1. Hacer un cambio de objeto que dispare autosave debounced.
2. Antes de esperar el debounce, hacer una mutacion directa de seccion.
3. Abrir preview o iniciar publish para forzar flush.

Resultado esperado:

- el resultado observa el orden real mas reciente
- no se pierde ni el cambio de objeto ni el cambio de seccion

### [ ] Reload integral despues de cambios mixtos

1. Mezclar cambios de objeto, texto y seccion.
2. Esperar guardado o forzar flush desde preview.
3. Recargar el borrador.

Resultado esperado:

- el editor hidrata el ultimo estado valido
- no mezcla estado viejo y nuevo

### [ ] Persistencia atómica de datos y vistas dinámicas

1. Editar nombres, ubicación, fecha y horario mientras sus debounces siguen pendientes.
2. Antes de que venzan, quitar o restaurar una vista dinámica y abrir preview para forzar flush crítico.
3. Recargar el editor y repetir en template workspace cuando corresponda.

Resultado esperado:

- el flush drena primero los edits pendientes y persiste el snapshot completo más reciente
- drafts ordenan una sola mutación alcanzada de `templateInput`, `templateAuthoringDraft`, `objetos`, `secciones` y `eventDetails` mediante el coordinator compartido
- templates delegan una sola vez al owner editorial; no reaparece una cola privada de authoring
- después de reload no se mezclan valores nuevos con targets/recovery viejos ni viceversa

## 5. Transformaciones e imagenes

### [ ] Resize y rotacion

1. Hacer resize de una imagen o forma.
2. Rotar un objeto compatible.
3. Recargar el borrador.

Resultado esperado:

- la geometria final persiste
- no reaparece escala intermedia

### [ ] Resize del mapa de Google

1. Seleccionar un mapa y comprobar que el unico control de resize es la esquina inferior derecha; cambiar ancho y alto libremente desde esa esquina.
2. Desde la esquina, llevar un eje por debajo de 200 px y seguir moviendo el otro.
3. Alcanzar el borde del canvas y continuar redimensionando en el eje disponible.
4. Soltar y observar el primer paint antes del settle y de la carga de la nueva imagen; repetir con un mapa rotado, zoom CSS del editor y mobile.
5. Repetir con escala heredada menor que uno; guardar y recargar el borrador.

Resultado esperado:

- solo aparece el control de resize `bottom-right`; permite cambiar la proporcion y conserva el control de rotacion
- llegar a un limite no congela el otro eje ni exige volver el puntero a la caja
- el Transformer sigue el contenido sin sumar el borde al tamaño
- al soltar se conservan la posicion, las medidas normalizadas y escala uno
- desde el primer paint tras soltar, mapa y Transformer conservan el tamano confirmado sin un frame intermedio con el tamano anterior
- la imagen se conserva durante el gesto y mientras carga la nueva medida

Regresion automatizada: `MAP_TRANSFORMER_BROWSER=1 node --test src/domain/eventDetails/googleMapTransformer.browser.test.mjs` (Chromium local, sin servicios remotos).

El chequeo del primer paint cubre la secuencia de patch puro, commit React de
los hijos y sincronizacion del Group y del Transformer en `useLayoutEffect`
de Konva. Una captura posterior al settle por si sola no verifica esa secuencia.

### [ ] Imagen comun que cruza entre secciones

1. En desktop, ubicar una imagen comun cerca del borde inferior de una seccion `fijo` y redimensionarla hasta que una parte quede sobre la seccion siguiente.
2. Repetir desde una seccion `pantalla` y desde la seccion siguiente hacia arriba.
3. Confirmar el resultado en canvas, preview `draft-authoritative` desktop y publish desktop.
4. Repetir en preview/publish mobile con una composicion cuya adaptacion mobile conserve el cruce.
5. En una de las secciones, configurar otra imagen como `Fondo de la seccion`, moverla/redimensionarla en el modo de edicion de fondo y confirmar que nunca se vea fuera de esa seccion.
6. Configurar `Decoracion arriba` y `Decoracion abajo` con offsets que lleven parte de la imagen fuera de la seccion; comprobar el limite superior e inferior en canvas, preview y publish.

Resultado esperado:

- la imagen completa sigue visible a ambos lados del limite entre secciones
- el fondo de la seccion adyacente no pinta por encima de la porcion que sobresale
- fondos y decoraciones propios de seccion siguen recortados por sus owners
- el fondo de seccion sigue recortado tambien mientras se edita; esta excepcion de overflow pertenece solo a `Imagen (contenido)`
- las decoraciones top/bottom pueden exceder su banda interna, pero ningun pixel cruza el limite de la seccion propietaria
- el cruce visual no duplica el objeto ni cambia por si solo su `seccionId`
- preview y publish conservan la misma visibilidad y geometria

### [ ] Drift visual despues de drag, settle o scroll

1. Arrastrar un objeto cerca de los limites del viewport o durante auto-scroll de secciones.
2. Soltar, esperar el settle y volver a seleccionarlo.
3. Si el cambio toca mobile, repetir tras un scroll del viewport.

Resultado esperado:

- bounds, transformer y line controls vuelven a la geometria correcta
- no queda offset visual entre el objeto y su overlay
- no reaparece un drag overlay viejo despues del scroll o restore

### [ ] Fondo base de seccion

1. Entrar al modo mover fondo.
2. Mover la imagen base.
3. Salir del modo.
4. Recargar el borrador.
5. Abrir el Tab Fotos en un borrador que tenga `portada`, aunque la primera seccion use color u otra imagen de fondo.
6. Confirmar que aparece `Cambiar imagen de portada` antes de `Galeria`.
7. Como admin/superadmin, seleccionar varias imagenes del canvas y una imagen base de seccion, abrir sus engranajes y confirmar que todas ofrecen `Usar como portada`; repetir como usuario regular y confirmar que esa accion no aparece.
8. Usar `Usar como portada` sobre una imagen de canvas que no sea fondo y verificar que el objeto y el fondo existente no cambian.
9. Reemplazar esa portada desde la tarjeta subiendo una imagen nueva y confirmar que el objeto de canvas que representaba la portada usa la nueva fuente sin cambiar su geometria.
10. Configurar otra portada que use la misma URL que un fondo base y reemplazarla desde el Asistente con una miniatura ya subida.
11. Repetir el reemplazo de portada con una imagen pesada desde el dispositivo.
12. Probar un fondo de primera seccion sin `portada` persistida.
13. En Editar plantilla, marcar una imagen de canvas como portada, guardar y volver a abrir la plantilla; confirmar que el Asistente muestra esa imagen aunque el thumbnail de la tarjeta sea distinto.
14. Crear un borrador desde esa plantilla y confirmar que el Asistente sigue mostrando el objeto marcado; cambiar la foto desde `Cambiar imagen de portada` y verificar que ese mismo objeto se actualiza en el canvas del borrador.
15. Abrir una plantilla y un borrador derivado sin `portadaSource`; aunque tengan una miniatura `portada`, confirmar que no muestran el substep ni la sección `Cambiar imagen de portada`.

Resultado esperado:

- el fondo queda ligado a su seccion correcta
- salir del modo devuelve el editor a interaccion normal
- la transformacion persiste
- el Tab Fotos y el substep del Asistente muestran la vista previa en plantillas y borradores derivados solo si existe una `portadaSource` valida, independientemente del fondo de la primera seccion
- un borrador independiente legacy puede seguir mostrando una `portada` sin fuente explicita
- si existe `portadaSource` valida, la tarjeta del Asistente muestra siempre la fuente actual del objeto o fondo de canvas marcado, aunque la URL `portada` legacy estuviera desactualizada
- guardar/reabrir una plantilla y copiarla a un borrador conserva `portadaSource` y los IDs referenciados; el thumbnail de catálogo no reemplaza esa autoridad
- un fondo de primera seccion sin `portada` no habilita por si solo la tarjeta ni el substep de portada
- `Usar como portada` persiste metadata solamente y conserva el objeto `imagen` seleccionado sin convertirlo, eliminarlo ni duplicarlo
- `Usar como portada` queda oculto para usuarios regulares y no depende de que ya exista una portada o un fondo de imagen
- reemplazar desde el Asistente cambia siempre `portada` y reemplaza los objetos `imagen` que usaban la fuente anterior sin cambiar su geometria
- si la portada anterior tambien era un fondo base, reemplaza ese fondo en su lugar; los objetos y fondos que no coinciden permanecen sin cambios
- durante la subida desde el dispositivo, la tarjeta conserva la portada anterior y muestra `Subiendo imagen...`
- el control de portada queda temporalmente deshabilitado y se reactiva al terminar o fallar
- si falla la subida o el reemplazo, la portada anterior se conserva y no queda loader permanente
- offsets, escala y configuracion responsive del fondo se conservan al cambiar la fuente
- la seccion `Cambiar imagen de portada` permanece mientras la fuente marcada siga resolviendo a un visual real y desaparece cuando la plantilla o borrador derivado no tiene una portada valida

### [ ] Iconos SVG canonicos

1. En el tab de iconos, insertar un SVG simple recoloreable y uno multicolor/no cuadrado aprobados.
2. Cambiar el color del recoloreable; confirmar que el multicolor conserva sus pinturas y no ofrece una mutacion global engañosa.
3. Seleccionar, arrastrar, redimensionar y rotar ambos iconos en desktop; repetir seleccion/drag/resize alcanzado en mobile.
4. Guardar, recargar y abrir preview `draft-authoritative`.
5. Generar el HTML de publicacion por el flujo preparado.
6. Simular Firestore no disponible y verificar el tab; repetir intentando insertar un item que acaba de desactivarse.
7. Abrir un borrador anterior con `tipo: "icono", formato: "svg", paths[]` y otro con `tipo: "icono-svg"`.

Resultado esperado:

- el catalogo muestra solo documentos explicitamente `active`; ante fallo de Firestore queda vacio y no enumera Storage
- la frontera de insercion vuelve a verificar aprobacion y nunca crea un SVG sin `iconRender` valido
- shapes, grupos, transforms, strokes, colores y proporcion del `viewBox` se conservan en canvas, preview y publicacion
- solo las partes `currentColor` responden al selector; las pinturas fijas/multicolor permanecen intactas
- drag, resize, seleccion, transformer y touch mantienen las autoridades de interaccion existentes
- los dos contratos legacy siguen visibles y editables sin depender del estado actual del catalogo

## 6. Publish-adjacent checks

### [ ] Galerias: sidebar, presets y visor global

1. En una sesion normal, seleccionar una galeria existente.
2. Verificar que el panel muestra fotos de la galeria seleccionada separadas de imagenes disponibles.
3. Confirmar que el panel tiene un solo scroll vertical continuo: fotos de la galeria, boton de subida e `Imagenes disponibles` avanzan juntos.
4. Confirmar que la seccion `Imagenes disponibles` sigue mostrando miniaturas subidas debajo de los controles de galeria.
5. Limpiar seleccion de canvas en un borrador que tenga exactamente una galeria y confirmar que el panel sigue mostrando sus fotos sin pedir seleccionarla.
6. En un borrador con dos o mas galerias sin seleccion de canvas, elegir una desde el selector/listado del panel.
7. Usar `Agregar galeria`, elegir una celda del selector visual `1x1` a `4x4` y confirmar que la galeria se inserta inmediatamente en el canvas.
8. Crear al menos dos galerias simples con distintos presets, por ejemplo 5 fotos y 16 fotos.
9. Con una celda valida de galeria seleccionada, elegir una miniatura subida y subir una imagen desde dispositivo; confirmar que se asignan solo a esa celda.
10. Sin celda de galeria seleccionada, elegir una miniatura subida y subir una imagen desde dispositivo; confirmar que se insertan como objetos `imagen` normales en el canvas.
11. Repetir con una referencia residual a una galeria eliminada o a un indice de celda invalido.
12. Agregar, reemplazar, quitar y reordenar una foto usando los controles explicitos de la galeria.
13. Reemplazar una foto de galeria subiendo una imagen pesada desde el dispositivo.
14. Cambiar de seleccion o de tab mientras esa subida sigue en curso.
15. Cambiar entre layouts permitidos desde el selector visual: `1x4`, `2x2`, `2x3` y `Collage` cuando esten permitidos. Confirmar que `Ancho completo` / `Full width` no aparece como opcion seleccionable.
16. Abrir preview y hacer click en una foto de cualquiera de dos galerias.

Resultado esperado:

- usuarios normales no ven el Gallery Builder ni herramientas de estructura
- usuarios normales con editor writable ven el control simple `Agregar galeria` en Fotos y pueden insertar galerias `tipo: "galeria"`
- con una sola galeria, el panel la usa automaticamente aunque no este seleccionada en canvas
- con varias galerias, el panel permite elegir cual editar sin seleccionar en canvas
- las miniaturas subidas permanecen visibles debajo de la galeria y se desplazan con el scroll unico del panel
- las operaciones explicitas de galeria afectan solo la galeria seleccionada en canvas o la galeria elegida en el panel
- las imagenes disponibles o subidas desde dispositivo se asignan a galeria solo con una celda/posicion valida seleccionada; sin celda valida se insertan como objetos `imagen` normales en el canvas
- las galerias creadas desde Fotos quedan seleccionadas/activas y tienen imagenes, layout, reemplazos y persistencia independientes
- durante el reemplazo desde dispositivo, solo la fila/foto afectada muestra `Subiendo imagen...`
- la foto anterior permanece visible hasta que la nueva URL se aplica
- no se puede iniciar otro reemplazo sobre esa misma foto mientras sube, pero las demas fotos no quedan marcadas como cargando
- si falla la subida o el reemplazo, la foto anterior se conserva y no queda loader permanente
- el selector visual aparece arriba de la lista local de fotos y muestra `Collage` para el id interno `squares`
- quitar una foto no elimina el asset subido
- cambiar layout preserva todas las fotos, aunque algunas queden ocultas
- los presets `grid_1x1` a `grid_4x4` renderizan el tamano visual exacto elegido; `grid_count_1` a `grid_count_16` siguen renderizando el numero visible exacto de celdas y conservan fotos ocultas en `cells[]`
- el canvas cambia de forma inmediatamente al pasar, por ejemplo, de `1x4` a `2x3`, y `2x3` se renderiza como 2 filas por 3 columnas
- el visor de preview recorre fotos clickeables de todas las galerias en orden DOM y de-duplica repetidas
- publish sigue bloqueando `gallery-media-unresolved` si una celda con media no tiene URL publicable

### [ ] Galerias: lista vertical futura

Aplicar cuando se implemente la lista vertical sortable descrita en `GALLERY_EDITOR_CONTRACT.md`.

1. Seleccionar una galeria con tres o mas fotos.
2. Confirmar que las fotos aparecen una debajo de otra en el mismo orden local de la galeria.
3. Intentar arrastrar desde la miniatura.
4. Arrastrar desde el handle dedicado y soltar en otra posicion.
5. Hacer click en una miniatura y reemplazarla desde el flujo de imagenes existente.
6. Cambiar a un layout que oculte algunas fotos y repetir reorder con una foto oculta.
7. En mobile, repetir con touch o usar el fallback Subir/Bajar si drag touch no esta habilitado.

Resultado esperado:

- solo el handle inicia drag
- el drag no cambia seleccion de canvas, z-index, geometria ni celda activa
- el nuevo orden se refleja en `cells[]` mediante `reorderGalleryPhotos`
- `cell.id`, `mediaUrl`, `storagePath`, `assetId` y metadatos se conservan
- la miniatura inicia reemplazo, no reorder
- el reemplazo mantiene la posicion de la fila/celda y no borra el asset subido
- las fotos ocultas por preset siguen gestionables en la lista
- las celdas fijas vacias no aparecen como filas draggable

### [ ] Gallery Builder restringido

1. Abrir una sesion de autor de plantilla con permisos admin/superadmin.
2. Confirmar que aparece el Builder de galeria.
3. Con una galeria seleccionada, cambiar layout desde el selector visual.
4. Sin galeria seleccionada, elegir un layout desde el selector visual.
5. Repetir en una sesion normal o read-only.

Resultado esperado:

- el Builder solo aparece con `canManageSite`, sesion de plantilla y editor escribible
- el Builder configura presets permitidos/default/current sin editar blueprints libres
- si hay galeria seleccionada, el selector actualiza esa galeria sin insertar otra
- si no hay galeria seleccionada, el selector inserta una nueva `tipo: "galeria"` con ese layout
- no se crea un tipo `album` ni un segundo modelo de persistencia

### [ ] Checkout / publish entry despues de cambios pendientes

1. Dejar cambios recientes sin esperar debounce completo.
2. Abrir el flujo de publicacion.

Resultado esperado:

- el flush previo confirma el estado reciente
- si publish validation falla, el mensaje corresponde al contrato actual
- si no falla, no se usa un snapshot viejo

### [ ] CTA funcional con config raiz real

1. Probar `rsvp-boton` con `rsvp` real.
2. Probar `regalo-boton` con `gifts` real.
3. Abrir preview.

Resultado esperado:

- el estado visual y el funcional coinciden con la config raiz actual
- en preview de borrador normal, el resultado es `draft-authoritative`
- no asumir OK solo porque el boton se ve bien en canvas

### [ ] Detalles del evento: Ceremonia / Fiesta

1. En un borrador basado en plantilla, abrir el tab Detalles del evento.
2. Cambiar entre `Un solo evento` y `Ceremonia y fiesta`.
3. Editar fecha, horario, lugar, direccion, mapa y countdown de Ceremonia.
4. En modalidad doble, editar los mismos datos para Fiesta.
5. Volver a `Un solo evento` y luego a `Ceremonia y fiesta`.
6. Activar `Mostrar Dress Code`, editar el texto y verificar que el canvas vinculado se actualiza.
7. Desactivar `Mostrar Dress Code` y volver a activarlo.
8. Elegir una sugerencia de Google Maps cuyo nombre y direccion sean mas largos que los textos iniciales de la plantilla; verificar el resultado en Ceremonia y Fiesta.
9. Redimensionar cada texto vinculado desde el nodo lateral y volver a reemplazar la ubicacion.
10. Después de una selección Google, escribir manualmente otro lugar/dirección y confirmar que se limpian `placeId`, coordenadas/componentes y visibilidad del mapa sin perder los textos manuales.
11. Crear múltiples mapas y countdowns de una phase; editar sus fields y comprobar que todas las vistas reciben la proyección.
12. Quitar todos los mapas/countdowns, cambiar datos o seleccionar Places y confirmar que no se reinsertan automáticamente; restaurarlos desde su indicador especializado.
13. Después de seleccionar Places, editar sólo el nombre del lugar y comprobar que la selección se conserva; editar la dirección y comprobar que se limpia.
14. Editar inline nombres individuales y combinados, lugar, dirección, Dress Code y texto largo; verificar sidebar, todas las vistas y layout.
15. Seleccionar targets de fecha con formatos sólo fecha y fecha + hora; comprobar que el texto del canvas conserva su formato durante toda la sesión, que aparece el control compacto con el picker nativo cerrado, abrirlo desde el icono de calendario y probar Enter, blur, `Escape` y apertura inmediata de preview.
16. Pegar varias líneas en un field corto y superar un `maxLength` declarado; repetir con textarea y con nombres combinados en formato de dos líneas.
17. Con dos targets del mismo field de fecha usando presets distintos, cambiar fecha/hora inline y luego cambiar sólo el formato del target seleccionado desde el sidebar.

Resultado esperado:

- `Un solo evento` mantiene Ceremonia activa y Fiesta inactiva
- `Ceremonia y fiesta` mantiene ambas funcionalidades activas
- canvas y sidebar escriben sobre el mismo valor estructurado; cada cambio se proyecta a todas las vistas sin crear otro owner ni otra entrada de history visual
- los fields cortos no aceptan contenido multilinea incompatible, textarea conserva sus líneas y `couple_names:linebreak` conserva un único separador semántico
- fecha/hora almacenan valores tipados separados; un target fecha + hora actualiza ambos, un cambio de hora desde sidebar lo reproyecta, y cada target mantiene su transform explícito
- seleccionar fecha abre el control compacto con el picker nativo cerrado y el canvas nunca muestra transitoriamente el valor crudo del input; el icono de calendario abre el picker y agrega hora sólo si el preset efectivo del target la muestra; editar el valor nunca cambia el preset y el selector de formato del sidebar cambia únicamente el target seleccionado
- editar una dirección manual limpia Places/mapas, editar sólo el nombre del lugar los conserva, y ningún cambio de contenido altera width/alignment/wrapping
- los datos de Fiesta se conservan aunque el bloque no se muestre
- `templateInput.values` conserva los valores aunque no haya vistas; `eventDetails.dressCode.value` es sólo el mirror del field `dress_code`
- los campos dinamicos `event_ceremony_*` y `event_party_*` sincronizan tab, canvas, preview y HTML publico
- ubicación manual y ubicación Google comparten los mismos fields de lugar/dirección; la segunda conserva metadata autoritativa en `values.__eventDetails.locations[phase]` y cada `mapa-google` guarda sólo su proyección compatible
- todas las vistas válidas de mapa/countdown se actualizan; editar o seleccionar datos sin vistas no inserta objetos
- el countdown usa fecha y horario de inicio canónicos de su phase, nunca horario de finalización; el preset explícito de cada target de fecha prevalece sobre el fallback del field
- nombre y direccion conservan inicialmente el ancho definido en la plantilla, envuelven valores largos creciendo en altura y aceptan cambios posteriores de ancho desde el nodo lateral
- el campo dinamico `event_dress_code` sincroniza tab, canvas, preview y HTML publico
- los campos legacy `event_date`, `event_start_time`, `event_end_time`, `event_venue_name` y `event_venue_address` aparecen migrados a Ceremonia al cargar

### [ ] Contador: catalogo, visibilidad y fecha del evento

1. Abrir el tab Contador con un contador existente y verificar el switch superior en estados activo e inactivo.
2. Seleccionar varios presets y confirmar que el tab no muestra sliders, selectores de color ni ningun panel contextual del diseño elegido.
3. Ocultar y volver a mostrar el contador; cambiar de tab entre cada accion.
4. En Detalles del evento, cambiar la fecha y el horario de Ceremonia; volver a Contador y aplicar otro preset.
5. Confirmar que Contador no muestra ni permite editar una segunda `Fecha del evento`.
6. Revisar presets circulares, cuadrados, verticales, horizontales y compactos, incluido `Aro floral` cuando este disponible.
7. Repetir el catalogo con sidebar desktop y en anchos mobile de 320 px y 390 px, con movimiento normal y con reduccion de movimiento activa.
8. Antes de cambiar cada preset, registrar el centro del bounds visual del countdown; repetir entre presets de dimensiones distintas, frame SVG, PNG contenido, sin frame y `frameScale` diferentes.
9. Repetir la preservacion de centro en una seccion `fijo` y una `pantalla`; luego mover, redimensionar, recargar el borrador y editar visibilidad/fecha sin cambiar el preset.

Resultado esperado:

- el switch usa el mismo lenguaje visual, foco visible y semantica `role="switch"` de Asistencia y Regalos
- el tab contiene unicamente el switch y el catalogo de presets; seleccionar una miniatura no agrega paneles, controles ni espacios vacios
- `mostrarCuentaRegresiva` controla la visibilidad sin eliminar el objeto ni alterar su preset, geometria o fecha
- el valor aplicado a `fechaObjetivo` proviene de Detalles del evento; el tab Contador no mantiene un input ni una fecha editable alternativa
- cambiar de preset preserva el flujo existente entre los datos del evento y el contador
- cambiar de preset conserva el centro exacto del bounding visual efectivo aunque cambien dimensiones, escala o frame; en `pantalla`, `yNorm` conserva el mismo centro mobile
- cargar, mover, redimensionar o editar propiedades distintas del preset no activa ninguna correccion adicional de posicion
- cada miniatura ocupa al maximo uno de los ejes disponibles, conserva una guarda interna uniforme y permanece centrada, completa y sin deformacion ni recorte
- la altura del preview se deriva de la proporcion visual del preset dentro del rango comun de 88 px a 288 px; los contadores horizontales usan tarjetas mas bajas y los circulares o verticales disponen de mayor altura
- los marcos PNG contenidos usan sus dimensiones intrinsecas para excluir del calculo el espacio vacio del viewport interno; `Aro floral` aprovecha sustancialmente el area util
- todas las miniaturas usan exactamente la misma superficie gris-lavanda suave dentro del viewport, sin decisiones por luminancia, preset, color o tipo de asset
- la superficie uniforme permite reconocer textos blancos, negros, claros e intensos y frames PNG/SVG sin modificar colores, datos ni render del contador; el nombre y la tarjeta exterior conservan su superficie normal
- las tarjetas conservan jerarquia, foco y targets tactiles utilizables sin desbordar el sidebar en los anchos verificados
- la reduccion de movimiento elimina las transiciones decorativas del switch y de las tarjetas

### [ ] Contador: paridad integral del preset y separacion entre chips

1. En el constructor, crear, guardar, publicar, volver a editar y duplicar un preset schema v2 con `gap` en `0`, `0.5`, `27.5` y `48`.
2. Para cada valor, comparar preview del constructor, miniatura viva del tab Contador, Canvas, preview autoritativa y HTML publicado.
3. Repetir con distribuciones horizontal/`centered`, vertical, grid y editorial; incluir frame SVG, PNG transparente, texto blanco, fondo propio y sin frame.
4. En `multiUnit`, usar un fondo de chip opaco y confirmar que el frame queda por encima del fondo y por debajo del texto.
5. Usar un separador de cuatro caracteres y, en un borrador compatible que tenga `separatorColor`, confirmar el mismo color en Canvas, preview y publicacion.
6. Probar anchos desktop y mobile representativos, valores de countdown activo y expirado, y `prefers-reduced-motion`.

Resultado esperado:

- `gap` conserva una unica unidad en pixeles de editor, incluidos cero y decimales, sin conversiones por superficie
- las posiciones y dimensiones de unidades/separadores coinciden con `shared/countdownLayoutContract.cjs`; solo cambian el wrapper y la escala de cada viewport
- numeros, etiquetas, `lineHeight`, `letterSpacing`, padding, radios y sombras conservan el contrato materializado
- SVG llena la caja de frame; PNG conserva proporcion y alfa mediante geometria `contain`
- constructor, Canvas, preview autoritativa y publicacion mantienen el mismo orden de capas y la misma opacidad
- los adapters v1 y aliases de fecha siguen siendo compatibilidad intencional; no se reescriben como schema v2

### [ ] Asociaciones funcionales RSVP / Regalos / Ceremonia / Fiesta / Dress Code

1. En edicion de plantilla como admin/superadmin, asociar una seccion completa a RSVP y otra a Regalos desde el menu de seccion.
2. Asociar secciones completas a Ceremonia, Fiesta y Dress Code desde el mismo menu.
3. En una seccion compartida, agrupar las columnas RSVP y Regalos desde multiseleccion y asignar cada grupo desde el engranaje.
4. Seleccionar varios roots independientes para RSVP, Regalos, Ceremonia, Fiesta y Dress Code, asignar cada asociacion desde el engranaje y confirmar que no aparece ningun wrapper `tipo: "grupo"`.
5. Volver a seleccionar por separado cada root asociado, moverlo y editar su texto o tipografia mediante el owner normal del elemento; repetir la asignacion con anchors o secciones distintas y limpiar una seleccion uniforme y otra mixta con `Ninguna`.
6. Con un grupo historico de cualquiera de las cinco asociaciones, usar `Desagrupar` y confirmar que cada child restaurado conserva la asociacion.
7. Alternar los switches existentes de RSVP y Regalos, la modalidad del evento para Ceremonia/Fiesta, y `Mostrar Dress Code`.
8. Abrir preview autoritativa y publicar en un entorno de prueba; repetir la seleccion y edicion independiente en desktop y mobile.

Resultado esperado:

- las opciones administrativas no aparecen en borradores normales, usuarios finales, preview ni HTML publico
- `rsvp.enabled`, `gifts.enabled`, `eventDetails.mode` y `eventDetails.dressCode.enabled` controlan CTA, secciones, grupos y roots standalone; no hay switches adicionales
- una seccion asociada inactiva se omite completa, incluidas decoraciones y objetos compartidos internos
- RSVP, Regalos, Ceremonia, Fiesta y Dress Code se guardan en cada root seleccionado sin cambiar IDs, orden, geometria, contenido, tipografia, targets ni seleccion logica; cada elemento sigue siendo seleccionable y editable de forma independiente
- los grupos historicos no se migran automaticamente; al desagrupar uno compatible, los roots restaurados heredan la asociacion
- en una seccion compartida, los owners de la unica funcionalidad restante —grupos o roots standalone— se centran horizontalmente como conjunto y vuelven a su posicion original al reactivar las demas funciones
- los roots standalone reciben ese offset solo en render: no se agrupan, mantienen seleccion y edicion independientes, y recuperan su geometria persistida exacta al reactivar las demas funciones
- repetir activar/desactivar no acumula deriva geometrica
- preview, publish y mobile mantienen la misma decision visible

### [ ] Imagenes limpias del dashboard

1. Guardar un borrador sin seleccion activa y esperar el autosave diferido.
2. Guardar un borrador con un objeto seleccionado.
3. Guardar un borrador con una seccion seleccionada.
4. Guardar durante o inmediatamente despues de drag, resize y hover.
5. Repetir con edicion inline activa o recien cerrada.
6. Guardar una plantilla y convertir un borrador en plantilla con objeto y seccion seleccionados.
7. Repetir el recorrido en desktop y mobile cuando el flujo de guardado aplique.
8. Abrir preview, publicar en entorno de prueba y verificar share image.

Resultado esperado:

- las tarjetas del dashboard usan la imagen persistida esperada (`thumbnailUrl` para borradores, `portada` para plantillas)
- no aparecen Transformer, selection bounds, hover, drag overlay, guias, indicadores de resize, decoraciones inline ni borde de seccion activa en las imagenes del dashboard
- todas las ayudas visuales siguen apareciendo normalmente dentro del editor
- preview, publicacion y share image no cambian
- no hay parpadeos visibles durante la exportacion

## 7. Visita guiada del Asistente

Aplicar cuando el cambio toque `AssistantGuidedTour`, `DashboardSidebar`, geometría del Sidebar mobile, footer del Asistente, barra mobile del editor o targets `data-assistant-tour-*`.

### [ ] Preferencia autenticada, cierre de sesión y restauración

1. Con un usuario sin opt-out, abrir un borrador writable y confirmar que la visita puede iniciarse después de cargar preferencias, editor y targets hidratados.
2. Cerrar la visita con X, salir del editor y abrir otro borrador.
3. Seleccionar `No volver a mostrar`, recargar y abrir otro borrador.
4. Con el mismo usuario, abrir una sesión writable de edición de plantilla.
5. Sin salir del borrador, abrir el menú de usuario del header y confirmar que ofrece `Volver a mostrar visita guiada` después de hidratar la preferencia. Repetir en mobile desde la sección `Cuenta` de `Opciones del editor` y en el dashboard, donde la fila queda inmediatamente antes de `Papelera`.
6. Seleccionar `No volver a mostrar` y confirmar que la casilla queda marcada, aparece el mensaje verde `Marcado correctamente` después de la respuesta remota y recién entonces se cierra el overlay.
7. Usar `Volver a mostrar visita guiada` desde el menú del editor y confirmar que el tour reaparece una sola vez en esa misma edición, sin reload. Repetir después de un cierre normal con X.
8. Intentar doble click/repetición de efectos y confirmar que no hay dos overlays ni dos escrituras. Luego abrir otro borrador y una plantilla.

Resultado esperado:

- cerrar con X solo bloquea la sesión montada y no escribe el opt-out
- el opt-out autenticado sobrevive recarga, cambio de borrador y nueva sesión, y se aplica igual a plantillas
- `No volver a mostrar` mantiene visible el estado actual mientras guarda, muestra feedback verde solo cuando el callable confirma `assistantTourOptOut: true` y cierra el overlay después de ese feedback
- el tour no evalúa mientras las preferencias o los targets iniciales siguen hidratando
- el menú permite restaurar tanto fuera como dentro del editor; una restauración confirmada durante una edición writable crea una sola nueva oportunidad de inicio en esa misma edición
- restaurar escribe `assistantTourOptOut: false` por el handler existente, sin localStorage ni estado paralelo
- la acción queda bloqueada durante el guardado; la sesión activa y las siguientes aperturas de borrador o plantilla vuelven a poder mostrar el tour
- remounts y doble ejecución de efectos no duplican aperturas, listeners ni escrituras

### [ ] Mobile: tooltip dentro del viewport útil

1. Abrir un borrador writable en modo mobile con anchos aproximados de 360 px, 390 px y 430 px.
2. Iniciar la visita guiada del Asistente.
3. Verificar los tooltips de campos iniciales cerca del borde inferior del panel.
4. Avanzar a varios pasos en fase `content` y verificar el content spotlight sobre `assistant-tour-content`.
5. Avanzar hasta un tooltip de acción `Siguiente` y hasta `Vista previa`.
6. Repetir con el panel mobile en altura mínima y máxima usando el handle.
7. Repetir con el teclado virtual abierto o un `visualViewport` reducido.
8. Cambiar altura/orientación del viewport mientras el tooltip está visible.
9. Forzar o buscar un caso donde el content spotlight ocupe casi todo el panel mobile.
10. Verificar un caso donde el tooltip legible deba superponerse al spotlight y quede anclado cerca del borde superior o inferior, no sobre el centro del contenido.
11. Forzar o buscar un caso donde `Siguiente` o `Vista previa` estén en el footer y varios controles ocupen el panel; el tooltip debe ubicarse en una franja libre superior sin tapar esos controles.
12. Repetir una pasada desktop.

Resultado esperado:

- el tooltip completo queda dentro del viewport útil visible
- no queda detrás del footer del Asistente, los controles, la barra mobile ni el panel inferior cuando el target está fuera del panel
- en fase `content`, el tooltip queda visualmente por encima del content spotlight y fuera de su rectángulo cuando hay espacio válido
- si el content spotlight ocupa casi todo el panel mobile, el tooltip conserva altura legible y puede superponerse parcialmente al spotlight
- cuando debe superponerse al content spotlight, el tooltip se apoya preferentemente en el borde superior o inferior y evita cubrir el núcleo central del contenido
- en `Siguiente` y `Vista previa` mobile, `hardAvoidOverlapArea` queda en `0` siempre que exista una franja legible dentro del viewport útil
- el content spotlight sigue visible y el contenido real del Asistente sigue interactuable
- si falta espacio vertical, la caja del tooltip se limita con scroll interno en vez de desbordar
- el target real sigue visible y clickeable
- el Asistente sigue siendo la autoridad de navegación
- desktop no cambia visual ni funcionalmente

## 8. Diseñador AI (solo superadmin)

Aplicar cuando el cambio toque el tab, contrato compartido, snapshot, ejecutor,
callable, controles confiables o cualquiera de los owners compartidos con
Asistente.

Autoridades de lectura obligatoria:

- `docs/architecture/AI_ASSISTANT_SYSTEM.md` para owners y garantías técnicas;
- `docs/contracts/DESIGNER_AI_CAPABILITY_CONTRACT.md` para actions, controles y límites;
- `docs/contracts/AI_ASSISTANT_CONVERSATION_CONTRACT.md` para comportamiento de respuesta, decisiones cerradas y decisiones de estilo pendientes;
- `docs/contracts/GIFTS_SYSTEM_CONTRACT.md` cuando el flujo alcanza Regalos.

Este checklist no convierte el copy vigente en frase obligatoria. Tampoco reemplaza
una evaluación conversacional durable: hoy no existe dataset/grader/model matrix
que justifique `AI_ASSISTANT_RESPONSE_EVALUATION.md`.

### [ ] Flujo contractual ejecutable

Esta subsección prueba el flujo implementado y revalidado el 2026-08-28. No debe darse por
aprobada solo por inspección del prompt o del copy: requiere draft real,
persistencia, controles y reread.

1. Primer ingreso: probar una señal durable real, saludo amable en español,
   nombre registrado cuando esté disponible y comienzo por el primer pendiente,
   sin listado de capabilities.
2. Reingreso: desmontar/reabrir y recargar el draft; confirmar continuidad basada
   en el borrador, saludo con nombre disponible y propuesta del primer pendiente,
   sin fingir historial de chat.
3. Verificar el orden funcional `Nombres -> estructura -> datos del evento ->
   Regalos -> Dress Code -> portada si existe -> Galleries si existen -> cierre`.
   Adelantar varios datos y confirmar que no se vuelven a preguntar.
4. Confirmar que `eventDetails.mode` queda decidido antes de pedir datos de Party
   y que `single` vuelve Party no aplicable sin borrar sus valores.
5. Confirmar que RSVP no aparece como pregunta proactiva ni bloquea el cierre del
   recorrido principal, pero sigue respondiendo a pedidos explícitos.
6. En Regalos, verificar que la primera pregunta elija lista externa o datos
   bancarios antes de pedir campos. Probar negativa sin preguntas adicionales;
   lista válida/inválida sin interrogatorio bancario; uno, varios y todos los
   datos bancarios; y un mensaje que adelante modalidad + varios valores. Partir
   también de una plantilla con los cinco valores: solo los aportados por el
   usuario quedan visibles y los demás se ocultan sin bloquear. Confirmar que
   intro y texto del botón no se preguntan proactivamente y que, resuelta la
   modalidad, continúa hacia Dress Code.
7. Probar Dress Code afirmativo/negativo, con preservación del texto oculto y
   salto sólo cuando el field no existe; `applyTargets: []` sigue disponible.
8. Probar portada antes de Galleries, ausencia de portada, cero/una/múltiples
   Galleries y orden canónico entre ellas. Dentro de una Gallery, reemplazar,
   agregar, eliminar y reordenar varias fotos: ningún cambio debe avanzar. Usar
   `Terminé con esta galería`: solo esa Gallery queda terminal y se abre/propone
   la siguiente pendiente. Cerrar sin finalizar conserva cambios y deja la misma
   Gallery pendiente, incluso tras reabrir el draft.
9. Cerrar solo el recorrido principal: comunicar edición manual y botón
   `Vista previa` arriba a la derecha; nunca afirmar que la invitación está
   terminada.
10. Enviar mensajes en otro idioma y verificar que las respuestas permanecen en
    español, con voseo argentino cuidado y sin ampliar el alcance funcional de la
    personalidad aprobada.
11. Para pendientes de nombres, evento, Regalos y Dress Code, verificar que la
    pregunta solicita directamente el dato o decisión necesaria sin ofrecer por
    iniciativa propia dejarlo para después, responder solo una parte u omitirlo.
    La respuesta puede reconocer brevemente lo anterior y debe conservar una
    transición natural, no una cadena mecánica de preguntas.
12. Responder espontáneamente que un dato todavía no está definido o se completará
    después: el asistente respeta la postergación, no insiste ni repite enseguida,
    conserva la hoja pendiente y continúa con otro dato aplicable.

### [ ] Autorizacion y ciclo de sesion

1. En desktop y en 320, 390 y 430 px, abrir un borrador writable como superadmin y confirmar que aparece `Diseñador AI` junto a `Asistente`.
2. Repetir como admin comun y usuario comun, durante `loadingAdminAccess`, en template workspace, modo selector y borrador read-only: el tab no aparece.
3. Intentar llamar `designerAiChat` como admin comun y sin auth: ambos reciben el error correspondiente.
4. Con el panel abierto, cambiar o cerrar el borrador y confirmar cleanup del historial, control activo, request tardío y batch IDs. Al perder el rol, confirmar que el panel/control dejan de estar disponibles y que ningún trabajo tardío se aplica.
5. Alternar Asistente/Diseñador AI: los valores cambian inmediatamente en ambos y el historial visible de Diseñador AI sigue disponible al volver, sin un nuevo saludo automático. Superar treinta mensajes y confirmar que solo se conservan los treinta más recientes. Cambiar o cerrar el borrador y confirmar que al regresar no reaparece ese historial; no confundir esta memoria de sesión con persistencia durable.
6. Abrir una sesión nueva: el mensaje interno de inicio no aparece en el historial. Registrar la primera intervención visible y compararla con idioma, tono y tratamiento ya aprobados; el copy exacto, longitud y estructura siguen sin ser canónicos.
7. Usar un borrador con valores completos, incompletos y vacios: no vuelve terminal un dato por mera mención. Registrar por separado `ledger.completion` y `ledger.guidedFlow.completion`.
8. Responder con datos de varios bloques: todos los valores validos se aplican en un unico lote y la siguiente pregunta se limita a lo que todavia falta.
9. Completar los bloques aprobados del recorrido: exigir evidencia antes del cierre y confirmar que RSVP, historia, slots vacíos o reordenamiento reactivo no lo bloquean. Comparar el mensaje actual con la regla de edición manual + `Vista previa`, sin promoverlo a frase canónica.
10. Inspeccionar el ledger: cada hoja disponible conserva estado/procedencia y mencionar o saltear un bloque no lo completa; confirmar que el mismo ledger calcula completitud operacional total y cierre guiado sin un segundo store.
11. Partir de valores de template, placeholders y defaults: ninguno cuenta como personalizacion real sin evidencia; un dato registrado en `templateInput.changedKeys` si puede contar como dato previo.

### [ ] Allowlist, sincronizacion y persistencia

1. Enviar nombre, personas, modalidad, fecha/hora, ubicación manual y Dress Code en un mensaje; confirmar targets dinámicos y countdown. Para ubicación, confirmar además que lugar/dirección se conservan, la decisión Maps queda pendiente y el horario no vuelve a preguntarse.
2. Corregir un valor y verificar que manda el borrador actual, no una copia del chat.
3. Probar `texto_historia` con múltiples vistas, `applyTargets: []` y field ausente: los dos primeros actualizan el valor, sólo las vistas existentes se proyectan y el tercero no inventa capability; width/alineación/wrapping se conservan.
4. Probar RSVP completo: activacion, catalogo/custom, orden, label, type, required, opciones, modal, CTA y reload.
5. Probar Regalos completo: activación, lista externa, cada método bancario,
   visibilidad independiente, ocultamiento sin borrado, intro y botón ante pedido
   explícito, CTA y reload. Confirmar que los cinco métodos, intro y botón siguen
   siendo capabilities reactivas aunque no todos integren la completitud del
   recorrido guiado.
6. Reordenar fotos de una Gallery existente y verificar targeting, `cells[]`, reload y preview.
7. Enviar un lote valido+invalido: no se aplica nada. Reenviar el mismo `batchId`: no se duplica.
8. Cambiar la identidad del borrador durante una respuesta: el lote tardio se cancela.
9. Reload/preview despues de cambios mixtos; confirmar autosave, FIFO y flush critico existentes.
10. Pedir tipografia, posicion o layout: no genera acciones, no usa vocabulario interno del validador, explica que ese cambio pertenece al editor y no afirma haberlo realizado.
11. Informar ambos nombres: se guarda `Casamiento {Nombre 1} y {Nombre 2}`; corregir un nombre recalcula mientras la politica sea automatica. Escribir un nombre de evento manual y repetir la correccion: el nombre explicito se preserva, incluso despues de reload.
12. Desactivar RSVP/Regalos y decidir no configurarlos: cada hoja interna queda `preserve_while_inactive`; al activar cualquiera, sus hojas visibles se reabren.
13. Quitar todas las vistas de un field disponible y editarlo desde Designer AI: el dato cambia sin restaurar objetos; al restaurar manualmente desde sidebar se proyecta el valor actual.

### [ ] Controles locales y errores de OpenAI

1. Pedir portada: se abre el uploader actual solo si existe portada; archivo, URL y metadata no llegan a OpenAI.
2. Pedir una celda Gallery: se monta el control simplificado actual, no
   Builder/biblioteca/inserción libre ni controles de Regalos, RSVP, eventos o
   ubicación; la Gallery y el slot exactos quedan seleccionados, visibles y
   enfocados. Confirmar que cambiar el fingerprint de contenido u orden solo
   muestra que hubo cambios. Verificar que el botón de finalización tiene target
   táctil adecuado, espera persistencia, termina únicamente la Gallery actual y
   que `Volver al chat` restaura historial + composer sin reconciliar su hoja.
   En desktop y mobile, el control debe reemplazar el chat y ocupar todo el alto
   disponible entre el encabezado de Diseñador AI y el borde inferior del panel.
3. Informar lugar + dirección para evento único: se aplican como ubicación manual y aparecen acciones explícitas `Buscar en Google Maps`/`Usar estos datos`; el selector no se abre por el solo hecho de haber aportado textos.
4. Repetir con solo lugar: la conversación presenta una única elección Maps/carga manual, el botón manual dice `Ingresar dirección manual` y no `Usar estos datos`. Elegir manual registra `leave_empty` directamente, conserva el lugar, pide únicamente dirección y no aparecen `placeId`, coordenadas ni metadata Google.
5. Aceptar Maps: el control reemplaza temporalmente historial + composer, ocupa todo el alto disponible, identifica `evento`, `ceremonia` o `fiesta` y precarga lugar + dirección. Activar `Volver al chat` restaura el historial y enfoca el composer sin perder mensajes.
6. Inspeccionar el control: contiene búsqueda, resultados con scroll propio y cierre explícito; no muestra fecha, horario, Dress Code, Regalos, RSVP ni otros campos del tab Detalles del evento.
7. Forzar varias sugerencias y confirmar que ninguna se elige sola. Elegir una explícitamente y verificar fields de texto, metadata en `values.__eventDetails.locations[phase]`, parche de todos los mapas existentes de esa phase, visibilidad preservada y persistencia por el owner compartido. Sin mapas, no debe insertar uno.
8. Cancelar sin seleccionar: no reconciliar `place_selection`, conservar los textos manuales y permitir usar esos datos o volver a buscar.
9. Simular fallo del authoring owner: no insertar/actualizar metadata de Google ni mostrar confirmación. Abrir el control por sí solo tampoco completa la hoja.
10. En `ceremony_party`, completar primero Party mediante Places dejando Ceremony vacía: solo `event.party.place_selection` queda terminal, la siguiente pregunta deriva de la ubicación pendiente de Ceremony y Regalos no aparece.
11. Repetir completando Ceremony primero, luego con una phase manual y la otra mediante Places. Ninguna mutación o confirmación de una phase resuelve la otra; Regalos aparece recién cuando ambas ubicaciones aplicables están completas.
12. Cancelar el selector de cualquiera de las phases: conservar sus textos manuales, no reconciliar `place_selection`, mantener `event_data` como primer bloque y no confirmar ambas ubicaciones.
13. Repetir en `single`, Ceremony y Party; una phase ambigua debe aclararse antes de abrir/mutar y una selección nunca puede cruzar de phase.
14. Confirmar un solo control activo y cleanup al cerrar o cambiar sesion.
15. Simular secret ausente, timeout y rate limit: error seguro y cero mutación. Forzar una primera salida estructurada inválida y verificar una sola reparación; si la segunda también falla, no aplicar actions.
16. Forzar una versión de contrato anterior y otra desconocida/futura: ambas reciben el mensaje seguro de recarga con la versión del cliente, no llaman a OpenAI y no se muestran como un mensaje inválido. La versión vigente continúa por el flujo normal; versión vacía conserva el rechazo estructural.
17. Revisar logs: UID, trace/batch, latencia, resultado y request ID; nunca prompt, valores, snapshot, URL privada ni clave.
18. Después de una selección Places verificada, forzar una `resolution` redundante `resolved_from_user` sobre la misma `place_selection`: conservar `resolved_by_control`, continuar desde el primer pendiente real y no mostrar error.
19. Forzar el fallo de copy posterior a un control ya persistido: el cambio debe conservarse, el mensaje debe distinguirlo del fallo conversacional y `Continuar recorrido` debe releer el snapshot antes de reintentar.

### [ ] Guided Tour, responsive y accesibilidad

1. Abrir Diseñador AI: no aparecen overlay, anchors ni `data-assistant-tour-*` nuevos.
2. Volver a Asistente y ejecutar el tour completo: steps, substeps, footer, targets y preferencia no cambian.
3. Inspeccionar DOM con controles locales y confirmar que no hay targets duplicados.
4. Verificar historial, `aria-live`, textarea, Enter/Shift+Enter, foco, touch y composer fijo en desktop/320/390/430 px. Con el editor Gallery inline, comprobar scroll interno, ausencia de scroll horizontal, acceso al botón de finalización y retorno al chat sin perder cambios.
5. Con Places inline activo en esos anchos, confirmar ancho sin scroll horizontal, targets táctiles de al menos 44 px, resultados con scroll interno, autocomplete seleccionable y control no oculto por el composer. El historial debe conservar el contexto de la pregunta.
6. Repetir con `prefers-reduced-motion`; loaders y uso no deben depender de animaciones.
7. Confirmar que la superficie normal contiene solo conversación y composer: no hay card/título descriptivo, botón `Recorrer Todo Asistente`, action types ni avisos técnicos de aplicado/no-op.

## 9. Senales de alerta

Bloquear validacion si aparece cualquiera de estas:

- preview abre con estado previo despues de una edicion reciente
- una mutacion directa de seccion se pierde tras preview, publish o reload
- multiseleccion y drag grupal dejan objetos atras o rompen la seleccion
- select-and-drag deja pending drag selection colgada o duplica overlays de seleccion
- inline edit requiere click extra para empezar a escribir
- el overlay inline queda montado o desalineado al cerrar
- transformer, bounds indicator o line controls quedan desfasados tras drag, settle o scroll
- publish usa un estado distinto del confirmado por flush
- borrar una vista dinámica elimina o revierte el valor estructurado del sidebar
- cancelar el diálogo de quitar cambia selección/history, o confirmar limpia el canvas antes de persistir
- editar un field sin vista inserta un objeto, o preview/publish serializa `detachedVisuals`/Places como fallback visual
- `pantalla` y `yNorm` cambian la posicion vertical inesperadamente al recargar o previsualizar
- en mobile, un tooltip de la visita guiada queda detras del footer del Asistente, la barra inferior o fuera del viewport visible
