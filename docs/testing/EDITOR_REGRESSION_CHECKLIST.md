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
3. Editar inline un texto ya seleccionado.

Resultado esperado:

- un objeto comun muestra transformer
- una linea muestra bounds indicator y `LineControls`, no el transformer generico
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

### [ ] Re-seleccion despues del drag

1. Mover un objeto o grupo.
2. Apenas soltar, clickear el stage vacio.
3. Volver a seleccionar el mismo objeto.

Resultado esperado:

- la deseleccion funciona de inmediato
- el objeto puede volver a seleccionarse sin bloqueo temporal
- no reaparece una seleccion vieja

### [ ] Scroll tactil vs marquee

1. En mobile o emulacion tactil, hacer scroll vertical sobre el canvas sin intentar seleccionar.
2. Repetir iniciando un marquee real desde zona vacia.

Resultado esperado:

- el scroll normal no arma marquee por error
- el marquee real sigue funcionando despues del scroll
- el rectangulo de seleccion no deriva respecto al puntero

### [ ] Scroll tactil sobre objetos vs drag

1. En mobile o emulacion tactil, iniciar scroll vertical apoyando el dedo sobre texto, imagen, galeria y grupo.
2. Repetir con un toque breve sobre un objeto.
3. Repetir con un drag deliberado horizontal, vertical y diagonal.
4. Interrumpir un gesto candidato con `touchcancel` o `pointercancel`.

Resultado esperado:

- el scroll vertical sobre objetos no selecciona ni mueve el objeto
- una vez iniciado el scroll, el gesto no se convierte luego en drag
- el toque breve sigue seleccionando
- el drag deliberado sigue entrando al flujo normal de predrag, drag overlay y settle
- no quedan estados residuales de predrag, drag, hover ni overlay

## 2. Texto inline

### [ ] Entrada a inline edit sin click extra

1. Seleccionar un texto.
2. Ejecutar el gesto normal para entrar a inline edit.
3. Escribir inmediatamente.

Resultado esperado:

- se abre el overlay DOM sobre el texto correcto
- aparece caret activo dentro del editor inline
- se puede escribir sin requerir un click adicional

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

1. Editar un texto multilinea.
2. Agregar y quitar saltos con `Enter`.
3. Mover el caret con teclado.
4. Confirmar la edicion.

Resultado esperado:

- los saltos se preservan
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
6. Editar el mismo texto directamente desde el canvas.
7. Abrir un borrador o plantilla sin ningun texto vinculado a `Texto historia`.
8. Con el transformer, cambiar el ancho de la caja del texto marcado y volver a editar desde `Nuestra historia`.
9. Abrir el modo asistente en un borrador con `Texto historia` vinculado.
10. Abrir el modo asistente en un borrador sin `Texto historia` vinculado.
11. Repetir la revision del engranaje con un usuario sin permiso admin/superadmin sobre un borrador que hereda el campo.
12. En el asistente o Tab Evento, enfocar nombre, fecha, hora, lugar y direccion con textos dinamicos vinculados en diferentes secciones.
13. En el Tab Texto, enfocar y editar `Nuestra historia` con su texto vinculado fuera del viewport actual.

Resultado esperado:

- solo admin/superadmin puede asignar o reasignar `Texto historia` desde el engranaje
- la opcion no aparece como `Textto historia`
- el Tab Texto muestra `Nuestra historia` y el campo editable solo cuando existe un texto vinculado
- editar desde el sidebar actualiza el texto del canvas
- el texto editado desde el sidebar conserva el ancho y la alineacion de la caja; si el contenido es largo, envuelve dentro de esa caja
- el transformer del canvas sigue pudiendo cambiar el ancho de la caja del texto marcado
- editar desde el canvas actualiza el campo del sidebar
- en modo asistente, el paso `Texto` aparece despues de `Evento` solo si existe `Texto historia`
- el Tab Texto en modo asistente muestra solo `Nuestra historia` y su caja de texto
- un usuario sin permiso no puede reasignar el campo desde el engranaje y el vinculo heredado no se elimina
- al enfocar campos dinamicos del sidebar, el canvas hace scroll suave hasta el primer objeto vinculado sin cambiar seleccion, hover, transformer ni modo inline
- al enfocar campos editables del sidebar, su contenido queda seleccionado y escribir reemplaza el valor existente

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

Resultado esperado:

- preview muestra el texto ya confirmado
- no reaparece el texto anterior por debounce pendiente

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

## 5. Transformaciones e imagenes

### [ ] Resize y rotacion

1. Hacer resize de una imagen o forma.
2. Rotar un objeto compatible.
3. Recargar el borrador.

Resultado esperado:

- la geometria final persiste
- no reaparece escala intermedia

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
5. Abrir el Tab Fotos en un borrador cuya primera seccion tenga fondo de imagen.
6. Confirmar que aparece `Cambiar imagen de portada` antes de `Galeria`.
7. Reemplazar la portada desde la tarjeta subiendo una imagen nueva.
8. Reemplazar la portada desde una miniatura ya subida usando `Usar como portada`.
9. Repetir el reemplazo de portada con una imagen pesada desde el dispositivo.
10. Cambiar el fondo de la primera seccion a color y volver al Tab Fotos.

Resultado esperado:

- el fondo queda ligado a su seccion correcta
- salir del modo devuelve el editor a interaccion normal
- la transformacion persiste
- el Tab Fotos muestra la vista previa solo si la primera seccion tiene `fondoTipo: "imagen"` y `fondoImagen`
- reemplazar la portada cambia el fondo real de la primera seccion, no crea un objeto `imagen`
- durante la subida desde el dispositivo, la tarjeta conserva la portada anterior y muestra `Subiendo imagen...`
- el control de portada queda temporalmente deshabilitado y se reactiva al terminar o fallar
- si falla la subida o el reemplazo, la portada anterior se conserva y no queda loader permanente
- offsets, escala y configuracion responsive del fondo se conservan al cambiar la fuente
- la seccion `Cambiar imagen de portada` desaparece si la primera seccion deja de tener fondo de imagen

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

Resultado esperado:

- `Un solo evento` mantiene Ceremonia activa y Fiesta inactiva
- `Ceremonia y fiesta` mantiene ambas funcionalidades activas
- los datos de Fiesta se conservan aunque el bloque no se muestre
- `eventDetails.dressCode.value` se conserva aunque Dress Code este desactivado
- los campos dinamicos `event_ceremony_*` y `event_party_*` sincronizan tab, canvas, preview y HTML publico
- el campo dinamico `event_dress_code` sincroniza tab, canvas, preview y HTML publico
- los campos legacy `event_date`, `event_start_time`, `event_end_time`, `event_venue_name` y `event_venue_address` aparecen migrados a Ceremonia al cargar

### [ ] Asociaciones funcionales RSVP / Regalos / Ceremonia / Fiesta / Dress Code

1. En edicion de plantilla como admin/superadmin, asociar una seccion completa a RSVP y otra a Regalos desde el menu de seccion.
2. Asociar secciones completas a Ceremonia, Fiesta y Dress Code desde el mismo menu.
3. En una seccion compartida, agrupar columnas RSVP, Regalos, Ceremonia, Fiesta y Dress Code desde multiseleccion, y asignar cada grupo desde el engranaje.
4. Alternar los switches existentes de RSVP y Regalos, la modalidad del evento para Ceremonia/Fiesta, y `Mostrar Dress Code`.
5. Abrir preview autoritativa y publicar en un entorno de prueba.

Resultado esperado:

- las opciones administrativas no aparecen en borradores normales, usuarios finales, preview ni HTML publico
- `rsvp.enabled`, `gifts.enabled`, `eventDetails.mode` y `eventDetails.dressCode.enabled` controlan CTA, secciones y grupos; no hay switches adicionales
- una seccion asociada inactiva se omite completa, incluidas decoraciones y objetos compartidos internos
- en una seccion compartida, los grupos de la unica funcionalidad restante se centran horizontalmente como conjunto y vuelven a su posicion original al reactivar las demas funciones
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

## 8. Senales de alerta

Bloquear validacion si aparece cualquiera de estas:

- preview abre con estado previo despues de una edicion reciente
- una mutacion directa de seccion se pierde tras preview, publish o reload
- multiseleccion y drag grupal dejan objetos atras o rompen la seleccion
- select-and-drag deja pending drag selection colgada o duplica overlays de seleccion
- inline edit requiere click extra para empezar a escribir
- el overlay inline queda montado o desalineado al cerrar
- transformer, bounds indicator o line controls quedan desfasados tras drag, settle o scroll
- publish usa un estado distinto del confirmado por flush
- `pantalla` y `yNorm` cambian la posicion vertical inesperadamente al recargar o previsualizar
- en mobile, un tooltip de la visita guiada queda detras del footer del Asistente, la barra inferior o fuera del viewport visible
