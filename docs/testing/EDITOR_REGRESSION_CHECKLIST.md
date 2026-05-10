# Editor Regression Checklist

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

Resultado esperado:

- el fondo queda ligado a su seccion correcta
- salir del modo devuelve el editor a interaccion normal
- la transformacion persiste

## 6. Publish-adjacent checks

### [ ] Galerias: sidebar, presets y visor global

1. En una sesion normal, seleccionar una galeria existente.
2. Verificar que el panel muestra fotos de la galeria seleccionada separadas de imagenes disponibles.
3. Agregar, reemplazar, quitar y reordenar una foto.
4. Cambiar entre layouts permitidos.
5. Abrir preview y hacer click en una foto de cualquiera de dos galerias.

Resultado esperado:

- usuarios normales no ven el Gallery Builder ni herramientas de estructura
- las operaciones afectan solo la galeria seleccionada
- quitar una foto no elimina el asset subido
- cambiar layout preserva todas las fotos, aunque algunas queden ocultas
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
3. Repetir en una sesion normal o read-only.

Resultado esperado:

- el Builder solo aparece con `canManageSite`, sesion de plantilla y editor escribible
- el Builder configura presets permitidos/default/current sin editar blueprints libres
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

## 7. Senales de alerta

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
