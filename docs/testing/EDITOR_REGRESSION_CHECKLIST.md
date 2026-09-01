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

## 2. Texto inline

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

Resultado esperado:

- `Un solo evento` mantiene Ceremonia activa y Fiesta inactiva
- `Ceremonia y fiesta` mantiene ambas funcionalidades activas
- los datos de Fiesta se conservan aunque el bloque no se muestre
- `eventDetails.dressCode.value` se conserva aunque Dress Code este desactivado
- los campos dinamicos `event_ceremony_*` y `event_party_*` sincronizan tab, canvas, preview y HTML publico
- ubicación manual y ubicación Google comparten los mismos fields de lugar/dirección; solo la segunda conserva metadata en el `mapa-google` de su phase
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
   salto cuando el binding no existe.
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
3. Probar `texto_historia` con/sin binding; solo el primero cambia y conserva width/alineacion/wrapping.
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
7. Forzar varias sugerencias y confirmar que ninguna se elige sola. Elegir una explícitamente y verificar fields de texto, `mapa-google` de la phase exacta, mapa oculto y persistencia por el owner compartido.
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
- `pantalla` y `yNorm` cambian la posicion vertical inesperadamente al recargar o previsualizar
- en mobile, un tooltip de la visita guiada queda detras del footer del Asistente, la barra inferior o fuera del viewport visible
