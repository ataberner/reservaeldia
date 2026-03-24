# Editor Regression Checklist

## Cómo usar este checklist

Este checklist es obligatorio antes de dar por valido cualquier cambio que toque el editor visual, su runtime de interaccion o su persistencia.

Aplicarlo siempre cuando el cambio afecte alguna de estas areas:

- seleccion, transformer, drag, resize o rotacion
- texto inline y overlay DOM
- imagenes normales o fondos de seccion
- secciones, orden, altura o modo pantalla
- autosave, recarga de borradores o normalizacion de datos
- atajos de teclado, copy/paste, undo/redo o multiseleccion

Preparar un borrador de prueba con este contenido minimo:

- 3 secciones como minimo
- 1 seccion en modo fijo
- 1 seccion en modo pantalla
- 1 seccion con imagen de fondo
- 2 textos, uno simple y uno multilinea
- 1 forma comun y 1 linea
- 1 imagen comun
- 2 o mas objetos cercanos para probar multiseleccion y drag grupal
- Si el cambio toca CTAs o countdowns, incluir tambien esos objetos

Modo de uso recomendado:

1. Ejecutar toda la checklist en desktop.
2. Si el cambio toca gestos touch, overlays flotantes, scroll o comportamiento mobile, repetir las categorias afectadas en mobile o con puntero tactil.
3. Marcar cada caso como `OK`, `FAIL` o `N/A`.
4. Cualquier `FAIL` bloquea la validacion hasta corregir y re-ejecutar la categoria afectada mas `Persistencia`.

---

## Selección

### [ ] Selección simple de objeto

**Pasos**

1. Abrir un borrador con varios objetos visibles en una misma seccion.
2. Hacer click en un objeto cualquiera.
3. Hacer click en otro objeto distinto de la misma seccion.

**Resultado esperado**

- Solo queda seleccionado el ultimo objeto clickeado.
- El transformer queda anclado al nodo correcto.
- La seleccion cambia sin dejar handles o overlays del objeto anterior.

**No debe romperse**

- No debe abrirse edicion inline por un click simple.
- No debe quedar seleccion fantasma del objeto anterior.
- No debe activarse una marquee de seleccion accidental.

### [ ] Deselección desde canvas vacio y selección de sección

**Pasos**

1. Seleccionar un objeto.
2. Hacer click en un area vacia del stage.
3. Hacer click en el fondo de una seccion sin tocar un objeto.

**Resultado esperado**

- El click en stage vacio limpia la seleccion de objetos.
- El click en el fondo de la seccion deja la seccion activa.
- No quedan menus flotantes u overlays de objeto visibles despues de deseleccionar.

**No debe romperse**

- No debe permanecer el transformer visible sin objeto seleccionado.
- No debe entrar el editor en modo mover fondo si no se pidio.
- No debe mantenerse una seccion incorrecta como activa.

### [ ] Marquee de selección incluyendo lineas

**Pasos**

1. Asegurarse de tener al menos dos objetos normales y una linea dentro del area visible.
2. Iniciar una seleccion por arrastre desde una zona vacia del canvas.
3. Encerrar con la marquee los objetos y la linea.
4. Soltar el mouse.

**Resultado esperado**

- Todos los elementos dentro del area quedan seleccionados.
- La linea entra en la seleccion si su geometria intersecta el area.
- La seleccion final coincide con la previsualizacion de la marquee.

**No debe romperse**

- No debe ignorarse la linea mientras otros objetos si entran.
- No debe arrancar la marquee al tocar un handle del transformer.
- No debe quedar la marquee visible despues de soltar.

---

## Drag & movimiento

### [ ] Drag individual dentro de la misma seccion

**Pasos**

1. Seleccionar un objeto comun.
2. Arrastrarlo a otra posicion dentro de su misma seccion.
3. Soltarlo y hacer un click fuera del objeto.

**Resultado esperado**

- El objeto sigue al puntero de forma estable.
- La posicion final queda exactamente donde se solto.
- El objeto sigue seleccionable despues del movimiento.

**No debe romperse**

- No debe duplicarse el objeto.
- No debe perderse la seleccion al finalizar el drag.
- No debe aparecer un salto de posicion al soltar.

### [ ] Drag grupal con multiseleccion

**Pasos**

1. Seleccionar dos o mas objetos de la misma seccion con marquee.
2. Arrastrar el grupo a otra posicion.
3. Soltar y volver a mover uno de los objetos seleccionados.

**Resultado esperado**

- Todos los objetos seleccionados se mueven juntos.
- Las distancias relativas entre los objetos se conservan.
- La seleccion grupal permanece coherente al terminar el drag.

**No debe romperse**

- No debe quedarse ningun objeto atras.
- No debe moverse un objeto no seleccionado.
- No debe quedar una parte del grupo con handles distintos o estado visual desfasado.

### [ ] Estado despues del drag

**Pasos**

1. Mover un objeto o grupo.
2. Apenas soltar, hacer click en un area vacia del canvas.
3. Volver a seleccionar el mismo objeto.

**Resultado esperado**

- La deseleccion funciona de forma limpia despues del drag.
- El objeto puede volver a seleccionarse de inmediato.
- No hay bloqueo temporal visible en la UI.

**No debe romperse**

- No debe reactivarse una seleccion vieja.
- No debe iniciarse una marquee no deseada justo despues del drag.
- No deben quedar cursores, hover o menus trabados.

---

## Transformaciones (resize / rotación)

### [ ] Resize de objeto con transformer

**Pasos**

1. Seleccionar una forma o una imagen.
2. Arrastrar un handle del transformer para cambiar ancho y alto.
3. Soltar y volver a seleccionar el objeto.

**Resultado esperado**

- El resize responde sin parpadeos ni saltos bruscos.
- El bounding box final coincide con el tamano visible.
- El objeto conserva seleccion y handles correctos despues del resize.

**No debe romperse**

- No debe comenzar una marquee mientras se usa un handle.
- No debe moverse el objeto de forma inesperada al terminar.
- No debe quedar el transformer unido a otro nodo.

### [ ] Rotación de objeto

**Pasos**

1. Seleccionar un objeto que soporte rotacion.
2. Rotarlo usando el control del transformer.
3. Deseleccionarlo y volver a seleccionarlo.

**Resultado esperado**

- La rotacion se aplica de manera continua y estable.
- El angulo final se conserva al re-seleccionar.
- El objeto sigue siendo draggable y editable despues de rotarlo.

**No debe romperse**

- No debe resetearse la rotacion al perder foco.
- No debe deformarse el objeto al rotar.
- No debe abrirse edicion inline por error durante la rotacion.

### [ ] Transformacion seguida de persistencia

**Pasos**

1. Hacer un resize o una rotacion.
2. Esperar al menos 2 segundos sin tocar nada.
3. Recargar el borrador.

**Resultado esperado**

- La geometria final se conserva despues de recargar.
- No aparece una version anterior del objeto.
- La seleccion no deja residuos visuales al volver a cargar.

**No debe romperse**

- No debe perderse el ultimo cambio por autosave.
- No debe reaparecer un scale inconsistente.
- No debe cambiar la seccion del objeto.

---

## Edición de texto

### [ ] Entrada a edición inline

**Pasos**

1. Seleccionar un objeto de texto.
2. Hacer doble click sobre el texto para entrar en edicion inline.
3. Escribir contenido nuevo.

**Resultado esperado**

- Se abre el editor inline sobre el texto correcto.
- El caret aparece dentro del overlay DOM.
- Los cambios se reflejan visualmente mientras se escribe.

**No debe romperse**

- No debe quedar visible el transformer como si siguiera en modo seleccion.
- No debe empezar un drag del objeto al intentar editar.
- No debe abrirse la edicion sobre otro texto distinto.

### [ ] Commit por click afuera, Escape y Tab

**Pasos**

1. Entrar en edicion inline de un texto.
2. Cambiar el contenido y hacer click fuera del texto.
3. Repetir la prueba y confirmar con `Escape`.
4. Repetir la prueba y confirmar con `Tab`.

**Resultado esperado**

- En los tres casos la edicion se cierra limpiamente.
- El texto final queda guardado en canvas.
- El editor vuelve a estado normal sin overlays colgados.

**No debe romperse**

- No debe perderse el cambio al cerrar la edicion.
- No debe quedar el foco atrapado en el contenteditable.
- No debe dispararse una accion de teclado global mientras se esta escribiendo.

### [ ] Texto multilinea y saltos de linea

**Pasos**

1. Entrar en edicion de un texto multilinea.
2. Agregar y quitar saltos de linea con `Enter`.
3. Mover el caret con flechas, `Home` y `End`.
4. Cerrar la edicion.

**Resultado esperado**

- Los saltos de linea se conservan al cerrar.
- El caret y la seleccion visual siguen la posicion real del texto.
- El render final en canvas coincide con lo editado.

**No debe romperse**

- No debe comerse lineas finales o duplicarlas.
- No debe desalinearse el overlay respecto del canvas al escribir.
- No debe saltar el texto a otra posicion al confirmar.

### [ ] Texto vacio elimina el objeto

**Pasos**

1. Entrar en edicion de un texto comun.
2. Borrar todo el contenido.
3. Cerrar la edicion.

**Resultado esperado**

- Si el objeto es de tipo texto, el elemento se elimina.
- La seleccion queda limpia.
- No quedan handles, hover ni paneles del elemento eliminado.

**No debe romperse**

- No debe quedar un texto vacio invisible pero seleccionable.
- No debe romperse el autosave despues de la eliminacion.
- No debe borrarse un objeto incorrecto.

---

## Imágenes

### [ ] Imagen comun: seleccion, drag y resize

**Pasos**

1. Seleccionar una imagen comun del canvas.
2. Moverla.
3. Redimensionarla con el transformer.
4. Deseleccionarla y volver a seleccionarla.

**Resultado esperado**

- La imagen responde igual que otros objetos seleccionables.
- El drag y el resize se mantienen estables.
- La geometria final persiste visualmente al re-seleccionar.

**No debe romperse**

- No debe perderse la imagen despues de una transformacion.
- No debe quedar una caja de seleccion desfasada.
- No debe mezclarse con la logica del fondo de seccion.

### [ ] Fondo base de sección: entrar y salir de modo mover fondo

**Pasos**

1. Ir a una seccion que tenga imagen de fondo base.
2. Entrar al modo de edicion del fondo con el gesto normal del editor.
3. Mover la imagen de fondo.
4. Salir del modo moviendo el foco a stage vacio o a otra seccion.

**Resultado esperado**

- El fondo entra en modo edicion solo cuando corresponde.
- Mientras esta en edicion, la imagen se puede mover sin romper la seccion.
- Al salir, el editor vuelve al modo normal de seleccion.

**No debe romperse**

- No debe quedar el editor atrapado en modo mover fondo.
- No deben bloquearse los clicks normales del canvas al salir.
- No debe desaparecer la imagen de fondo despues del movimiento.

### [ ] Fondo base de sección: clipping y transformación

**Pasos**

1. Con el fondo base en modo edicion, arrastrar la imagen hacia los bordes.
2. Si el cambio toca transformaciones de fondo, probar tambien resize.
3. Guardar el estado y recargar el borrador.

**Resultado esperado**

- Fuera del modo edicion, el fondo queda contenido dentro de la seccion.
- La transformacion aplicada se conserva tras recargar.
- La seccion sigue siendo clickeable y seleccionable.

**No debe romperse**

- No debe verse el fondo invadiendo otras secciones en modo normal.
- No debe quedar un nodo invisible tapando el stage.
- No debe perderse la relacion entre fondo y seccion correcta.

---

## Secciones

### [ ] Activación de sección y overlay de acciones

**Pasos**

1. Hacer click en el fondo de una seccion.
2. Verificar la apertura del overlay o panel de acciones de seccion.
3. Cambiar a otra seccion.

**Resultado esperado**

- Solo una seccion queda activa a la vez.
- El overlay de acciones acompana a la seccion correcta.
- El cambio de seccion activa limpia el estado visual de la anterior.

**No debe romperse**

- No debe mostrarse el overlay en una seccion equivocada.
- No debe quedar una accion de seccion bloqueando objetos.
- No debe perderse la posibilidad de seleccionar objetos dentro de la seccion activa.

### [ ] Crear nueva seccion

**Pasos**

1. Desde el flujo normal del editor, crear una nueva seccion.
2. Verificar que aparece en el canvas.
3. Recargar el borrador.

**Resultado esperado**

- La nueva seccion se crea con orden valido.
- La seccion queda disponible para seleccion y edicion.
- Tras recargar, la seccion sigue presente.

**No debe romperse**

- No debe duplicarse la seccion al guardar.
- No debe aparecer sin altura o fuera de orden.
- No deben perderse objetos ya existentes.

### [ ] Reordenar secciones

**Pasos**

1. Seleccionar una seccion intermedia.
2. Subirla y bajarla usando las acciones del editor.
3. Recargar el borrador.

**Resultado esperado**

- El orden visual cambia en el canvas.
- El orden persiste despues de recargar.
- Los objetos siguen perteneciendo a su seccion correcta.

**No debe romperse**

- No deben mezclarse contenidos entre secciones.
- No debe quedar el overlay de acciones desfasado respecto del nuevo orden.
- No debe perderse la seccion activa sin motivo.

### [ ] Toggle de modo pantalla y resize de altura

**Pasos**

1. Tomar una seccion en modo fijo y activar modo pantalla.
2. Volver a modo fijo.
3. Cambiar la altura de la seccion usando el handle de resize.
4. Repetir soltando el puntero fuera del canvas o cerrando con `Escape`.

**Resultado esperado**

- El cambio entre `pantalla` y `fijo` aplica la altura correcta.
- La altura manual queda reflejada en canvas.
- El resize termina limpiamente incluso si el puntero sale del canvas.

**No debe romperse**

- No debe quedar el cursor clavado en `ns-resize`.
- No debe perderse la altura anterior al volver de `pantalla` a `fijo`.
- No debe romperse el autosave de secciones.

### [ ] Eliminar seccion

**Pasos**

1. Seleccionar una seccion que tenga objetos.
2. Eliminarla desde el flujo normal del editor.
3. Recargar el borrador.

**Resultado esperado**

- La seccion desaparece del canvas.
- Los objetos de esa seccion tambien desaparecen.
- Tras recargar, la seccion no vuelve a aparecer.

**No debe romperse**

- No deben borrarse objetos de otras secciones.
- No debe quedar la seccion eliminada como activa.
- No debe quedar espacio o overlay huerfano en el canvas.

---

## Persistencia (guardado / reload)

### [ ] Autosave de cambios en objetos

**Pasos**

1. Mover un objeto.
2. Editar un texto.
3. Esperar al menos 2 segundos sin interactuar.
4. Recargar el borrador.

**Resultado esperado**

- Los ultimos cambios quedan presentes despues de recargar.
- No reaparece un estado anterior.
- Objetos, textos y posiciones siguen consistentes.

**No debe romperse**

- No debe perderse solo una parte del cambio.
- No deben aparecer duplicados despues del reload.
- No debe cambiar la seccion del objeto guardado.

### [ ] Persistencia de cambios de seccion

**Pasos**

1. Cambiar color de fondo de una seccion.
2. Cambiar su altura o su modo `pantalla/fijo`.
3. Reordenar la seccion.
4. Recargar el borrador.

**Resultado esperado**

- Color, altura, modo y orden persisten correctamente.
- La seccion sigue siendo editable despues del reload.
- Los objetos de la seccion mantienen su posicion esperada.

**No debe romperse**

- No deben perderse cambios directos de seccion por tener autosave activo.
- No debe restaurarse un orden viejo.
- No debe quedar una seccion con datos parciales.

### [ ] Reload integral del borrador

**Pasos**

1. Hacer una mezcla de cambios: mover objeto, editar texto y tocar una seccion.
2. Esperar el guardado.
3. Cerrar y volver a abrir el borrador o recargar la pagina.

**Resultado esperado**

- El editor hidrata el ultimo estado valido.
- No cambian posiciones ni tamanos de forma inesperada.
- El borrador queda operativo para seguir editando.

**No debe romperse**

- No deben verse saltos de layout al cargar.
- No deben faltar imagenes por URLs desactualizadas.
- No deben perderse cambios hechos en secciones `pantalla`.

---

## Interacciones especiales

### [ ] Undo / redo

**Pasos**

1. Mover un objeto.
2. Editar un texto.
3. Hacer un cambio de seccion.
4. Ejecutar `Ctrl/Cmd + Z`.
5. Ejecutar `Ctrl/Cmd + Y` y tambien `Ctrl/Cmd + Shift + Z`.

**Resultado esperado**

- Undo y redo restauran estados validos del canvas.
- Objetos y secciones vuelven al estado esperado.
- No quedan selecciones o paneles desfasados despues de rehacer.

**No debe romperse**

- No debe quedar el historial inutil despues de un resize o drag.
- No debe reaparecer seleccion sobre nodos ya eliminados.
- No debe romperse el autosave despues de rehacer.

### [ ] Copy, paste y duplicado

**Pasos**

1. Seleccionar un objeto normal y ejecutar `Ctrl/Cmd + C` y `Ctrl/Cmd + V`.
2. Repetir con `Ctrl/Cmd + D`.
3. Si el cambio toca CTAs o countdowns, probar lo mismo con esos objetos.

**Resultado esperado**

- El paste crea una copia desplazada y seleccionada.
- El duplicado crea una copia desplazada del objeto permitido.
- Countdowns y CTAs funcionales respetan las restricciones esperadas del editor.

**No debe romperse**

- No deben aparecer duplicados invalidos de countdown.
- No deben clonarse botones funcionales que el editor debe proteger.
- No debe pegarse un objeto en una posicion absurda o invisible.

### [ ] Delete, Backspace y Escape segun contexto

**Pasos**

1. Seleccionar un objeto y eliminarlo con `Delete`.
2. Repetir con `Backspace`.
3. Seleccionar un objeto y presionar `Escape`.
4. Entrar en edicion inline de texto y volver a probar `Delete`, `Backspace` y `Escape`.

**Resultado esperado**

- Fuera de edicion inline, `Delete` y `Backspace` eliminan la seleccion.
- `Escape` limpia la seleccion.
- Dentro de edicion inline, las teclas actuan sobre el texto o cierran la edicion sin disparar atajos globales indebidos.

**No debe romperse**

- No debe borrarse un objeto mientras el usuario esta escribiendo texto.
- No debe quedar hover o transformer del objeto eliminado.
- No debe cerrarse la edicion inline dejando el overlay montado.

### [ ] Cambio de alineacion con teclado

**Pasos**

1. Seleccionar un texto, un rect con texto o un CTA funcional que soporte alineacion.
2. Presionar `L` varias veces.
3. Recargar el borrador si el cambio toca persistencia.

**Resultado esperado**

- La alineacion rota por los estados esperados del editor.
- El cambio se refleja visualmente en canvas.
- Si corresponde, el valor persiste tras recargar.

**No debe romperse**

- No debe cambiar la alineacion de un objeto no seleccionado.
- No debe afectar objetos que no soportan esa accion.
- No debe dispararse mientras el foco esta dentro del editor inline.

### [ ] Gestos touch en canvas y secciones

**Pasos**

1. Ejecutar este caso solo si el cambio toca stage gestures, mobile, scroll o acciones flotantes.
2. En un dispositivo touch o emulacion tactil, tapear un area vacia del stage.
3. Tapear el fondo de una seccion.
4. Hacer un tap corto sobre un objeto y luego un drag real.

**Resultado esperado**

- El tap en stage vacio limpia seleccion.
- El tap en seccion activa la seccion correcta.
- Un drag real no se interpreta como tap.

**No debe romperse**

- No debe abrirse una accion equivocada por long press o scroll corto.
- No debe confundirse scroll vertical con seleccion.
- No debe quedar el overlay mobile de seccion en posicion incorrecta.

---

## Señales de alerta

Si aparece cualquiera de estos sintomas, no dar el cambio por valido aunque el bug parezca menor:

- El transformer queda pegado al objeto anterior o aparece sin seleccion real.
- Un handle del transformer inicia marquee, deselecciona o mueve otra cosa.
- Despues de un drag, el objeto salta, se deselecciona solo o no puede volver a seleccionarse.
- La multiseleccion mueve solo parte del grupo o deja un objeto atras.
- El overlay de texto queda desalineado respecto del canvas al hacer scroll, zoom o editar multilinea.
- El texto se guarda pero cambia su posicion horizontal de forma inesperada al cerrar la edicion.
- `Delete`, `Backspace`, `Escape` o `L` disparan atajos globales mientras se esta escribiendo.
- El fondo de una seccion queda atrapado en modo mover fondo o sigue interceptando clicks al salir.
- Un fondo o una imagen se ve fuera de su seccion en modo normal.
- Cambios de altura, orden o modo de seccion se ven bien al instante pero se pierden al recargar.
- El reload trae una version anterior del borrador o mezcla estados viejos con nuevos.
- Copy/paste o duplicado crean objetos que el editor deberia bloquear.
- Una linea deja de entrar en la marquee aunque otros objetos si entren.
