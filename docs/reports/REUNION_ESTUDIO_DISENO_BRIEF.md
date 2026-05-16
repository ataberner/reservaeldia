# Brief Para Reunion Con Estudio De Diseno

Fecha: 2026-04-16

Objetivo de este brief:

- ayudarte a explicar el producto sin meterte en detalles de programacion
- darte respuestas concretas a las preguntas tecnicas mas probables
- marcar que deberian entregarte en Figma para que despues implementarlo sea viable

## 1. Resumen Ejecutivo

Si te preguntan "como esta hecho hoy", puedes decir esto:

> La app esta hecha en Next.js y React. El landing mezcla Bootstrap con CSS propio. El dashboard nuevo esta hecho principalmente con Tailwind y componentes custom. La autenticacion, base de datos y archivos viven en Firebase. El editor de invitaciones es un sistema aparte, mas complejo, hecho con canvas.

Si te preguntan "que queremos que nos disenen", puedes decir esto:

> Necesito el rediseno del landing principal, el modal de login y la experiencia del dashboard donde el usuario elige una plantilla. El entregable es Figma, pero necesito que contemple desktop, mobile y estados reales de uso.

## 2. La Respuesta Sobre Bootstrap Y Tailwind

Tu respuesta puede ser esta:

> Bootstrap si esta implementado, pero sobre todo en el landing y via CDN. No usamos React-Bootstrap como libreria de componentes. El dashboard nuevo esta construido mayormente con Tailwind y estilos propios. O sea: conviene pensar el diseno como un sistema visual propio, no como "un tema de Bootstrap".

Por que esta respuesta es correcta:

- Bootstrap se carga globalmente desde `src/pages/_document.js`.
- El landing usa clases tipo `navbar`, `container`, `row`, `col-*`, `btn`.
- El dashboard moderno usa sobre todo clases Tailwind directamente en JSX.
- No hay dependencia `bootstrap` ni `react-bootstrap` en `package.json`.

Traduccion no tecnica:

- Bootstrap = una caja de herramientas visual antigua/tradicional que ya esta enchufada.
- Tailwind = una forma mas moderna de construir interfaces usando clases cortas.
- Hoy conviven las dos cosas, pero no como un sistema unificado.

## 3. Lo Mas Importante Que Tienes Que Saber

### 3.1 No hay un sistema de diseno unificado todavia

Esto es importante decirlo porque te posiciona bien frente al estudio.

Hoy el producto tiene mezcla de:

- Bootstrap en el landing
- Tailwind en el dashboard nuevo
- CSS global largo y bastante manual
- tipografias mezcladas: Roboto, Montserrat, Poppins, Raleway, Playfair, etc.

En palabras simples:

> Hoy la app funciona, pero visualmente no esta unificada. Justamente por eso quiero que ustedes me ayuden a ordenar el sistema visual.

### 3.2 El dashboard que van a disenar no es solo una grilla de plantillas

El "selector de plantillas" real hoy incluye:

- hero superior del dashboard
- rail de borradores del usuario
- rail de invitaciones publicadas
- railes o colecciones editoriales de plantillas
- cards de plantilla
- modal de preview de plantilla
- formulario dinamico para personalizar datos antes de entrar al editor

Esto es clave:

> Si solo disenan una grilla de cards, el entregable queda corto. El flujo real incluye preview, personalizacion y estados de contenido del usuario.

### 3.3 El editor es otro sistema

No esta en el alcance que mencionaste, pero es importante aclararlo si ellos quieren abrir demasiado el scope.

Puedes decir:

> El editor de invitaciones existe y es un sistema aparte, mas tecnico y mas complejo. En esta etapa no necesito que lo redisenen completo, salvo que lo acordemos aparte.

## 4. Como Esta Armado El Producto Hoy

### 4.1 Frontend

- Framework principal: Next.js + React
- Routing principal: `src/pages/index.js` y `src/pages/dashboard.js`
- Landing: mezcla Bootstrap + CSS propio
- Dashboard nuevo: mayormente Tailwind + componentes custom
- Modales de auth: CSS custom, no dependen de Bootstrap como sistema visual principal

### 4.2 Backend y servicios

- Auth: Firebase Auth
- Base de datos: Firestore
- Archivos e imagenes: Firebase Storage
- Backend: Cloud Functions

Traduccion no tecnica:

- Firebase Auth = login y usuarios
- Firestore = donde se guardan borradores, plantillas, configuraciones y publicaciones
- Storage = donde se guardan imagenes y HTML publicados
- Cloud Functions = codigo del servidor para procesos especiales

### 4.3 Editor

El editor esta hecho con Konva.

Traduccion no tecnica:

- Konva = una tecnologia para editar elementos visuales en un canvas, como si fuera una mini herramienta de diseno dentro de la app

Esto explica por que el editor tiene otra complejidad distinta del landing o del dashboard.

## 5. Alcance Real De Cada Pantalla

### 5.1 Landing principal

Hoy el landing tiene:

- header con logo, menu y botones de login/registro
- hero principal
- bloques de funcionalidades
- bloque de "como funciona"
- CTA final de registro
- footer
- apertura del modal de login y del modal de registro desde el mismo landing

Importante:

- usa Bootstrap para layout base en varias secciones
- pero tambien tiene mucho CSS manual heredado
- hoy visualmente se siente mas "legacy" que el dashboard nuevo

Eso significa que el estudio puede ayudarte mucho a unificar marca entre landing y dashboard.

### 5.2 Modal de login

No es un modal simple. Hoy conviven varios estados:

- login por email
- login con Google
- mostrar/ocultar contrasena
- recuperar contrasena
- error
- exito / mensaje informativo
- caso de mail no verificado
- paso adicional de completar perfil

Ademas hay comportamiento especial en mobile:

- en navegadores mobile o dentro de apps, Google puede usar redirect en vez de popup

Traduccion no tecnica:

- en computadora, Google suele abrir una ventanita
- en celular, muchas veces te manda y te trae de vuelta

Para Figma:

> No alcanza con disenar un solo estado "bonito" del login. Hay que pedir estado normal, error, loading, exito y variantes relacionadas.

### 5.3 Dashboard de selector de plantillas

Hoy el dashboard home puede mostrar:

- hero superior
- borradores del usuario
- invitaciones publicadas
- colecciones editoriales de plantillas
- vacios
- errores
- loaders

Y algo muy importante:

- las colecciones de plantillas no son fijas
- se arman segun configuracion editorial y etiquetas de las plantillas

Traduccion no tecnica:

- la app puede reorganizar que filas de plantillas mostrar sin tocar el diseno base

### 5.4 Modal de preview de plantilla

Este modal es una pieza clave del flujo y deberia entrar en el alcance visual aunque nadie lo nombre primero.

Hoy incluye:

- vista previa de la invitacion dentro de un iframe
- informacion de la plantilla
- badges o etiquetas
- boton para abrir/cerrar personalizacion
- boton principal para crear invitacion
- formulario dinamico segun la plantilla

## 6. Restricciones Reales De Diseno Que El Estudio Debe Saber

### 6.1 El selector trabaja con contenido dinamico

No todo el contenido es fijo.

Ejemplos:

- una coleccion puede existir o no
- una plantilla puede tener distintas etiquetas
- el usuario puede tener borradores o no
- el usuario puede tener publicadas o no
- una plantilla puede tener o no campos dinamicos

Esto significa que el diseno debe contemplar:

- estados vacios
- estados de carga
- estados de error
- listas cortas y largas

### 6.2 El formulario de personalizacion no siempre es igual

Las plantillas pueden definir campos dinamicos de estos tipos:

- texto corto
- texto largo
- fecha
- hora
- fecha y hora
- ubicacion
- URL
- imagen unica
- galeria de imagenes

En palabras simples:

> El modal no puede depender de un formulario fijo. Tiene que funcionar como un contenedor flexible para distintos tipos de campos.

### 6.3 Hoy el dashboard principal esta fijado a bodas

Aunque el modelo de datos soporta varios tipos de evento, el dashboard home actual usa por defecto `boda`.

Esto significa:

- el producto esta preparado para crecer
- pero el selector actual no esta planteado todavia como un marketplace abierto de multiples categorias visibles al usuario final

Si el estudio propone un mega selector por tipo de evento, eso ya es una decision de producto, no solo de UI.

### 6.4 Si proponen cambios muy estructurales, eso ya no es solo "diseno"

Ejemplos de cambios que son relativamente simples:

- nueva estetica
- nueva jerarquia visual
- nuevas tipografias
- cambios de espaciado
- cards distintas
- hero distinto
- mejor modal de auth

Ejemplos de cambios que ya implican producto + desarrollo:

- cambiar el flujo completo del selector
- agregar filtros avanzados
- agregar preview mobile/desktop con switch real
- agregar favoritos, colecciones guardadas o comparador
- transformar el dashboard en una experiencia multi-evento visible desde el home

## 7. Estados Que Deberian Entregarte En Figma

Si quieres un entregable util, yo pediria esto explicitamente.

### 7.1 Landing

- desktop
- mobile
- header cerrado y abierto
- hero
- CTA principal
- secciones interiores
- footer

### 7.2 Auth

- login default
- login loading
- login error
- login exito/info
- recuperar contrasena
- registro
- completar perfil

Aunque tu pedido inicial sea "login modal", conviene pedir toda la familia visual porque ya comparten lenguaje y flujo.

### 7.3 Dashboard home / selector

- home completo con contenido
- home sin borradores
- home sin publicadas
- home sin colecciones activas
- estado loading
- estado error
- card de plantilla
- card de borrador
- card de invitacion publicada
- rail horizontal en desktop
- adaptacion mobile

### 7.4 Modal de plantilla

- modal cerrado/abierto
- preview normal
- preview con formulario expandido
- formulario con campos de texto
- formulario con imagen/galeria
- loading
- error

## 8. Lo Que Te Conviene Pedirles Como Entregable

Como ellos entregan Figma, yo pediria esto:

- pantallas desktop y mobile
- componentes reutilizables
- variantes de componentes
- estados de hover, active, disabled y loading
- reglas de espaciado
- tipografias y jerarquias
- paleta de colores
- especificacion basica de iconografia

Y agregaria esta frase:

> Necesito que el Figma no sea solo visual, sino implementable. Por favor contemplen componentes, estados y responsive, no solo una captura linda de cada pantalla.

## 9. Preguntas Inteligentes Para Hacerles En La Reunion

Estas preguntas te dejan muy bien parado sin sonar tecnico.

### 9.1 Sobre alcance

- Quiero confirmar si su propuesta incluye solo las pantallas principales o tambien estados de error, vacio y loading.
- El modal de plantilla tiene preview y personalizacion. Quiero saber si lo contemplan dentro del selector de plantillas.
- Quiero saber si van a trabajar solo visualmente o tambien la experiencia completa del flujo.

### 9.2 Sobre sistema visual

- Necesito que el rediseno unifique landing, login y dashboard. Como plantearian ese sistema visual comun?
- Me interesa que definan componentes reutilizables para que despues no quede todo como piezas sueltas.

### 9.3 Sobre responsive

- Necesito desktop y mobile. Como plantean el comportamiento mobile del landing, del login y del selector de plantillas?

### 9.4 Sobre handoff

- Ademas de las pantallas, necesito componentes, variantes y estados. Eso lo incluyen en el entregable?

## 10. Respuestas Cortas Que Puedes Repetir Tal Cual

### Si te preguntan por el stack

> El frontend esta en Next.js y React. El dashboard nuevo esta mayormente en Tailwind. El landing arrastra bastante CSS propio y clases Bootstrap. El backend corre sobre Firebase.

### Si te preguntan por Bootstrap

> Bootstrap existe en el proyecto, pero no es el sistema de diseno principal del producto nuevo. Hoy convive con Tailwind y estilos custom.

### Si te preguntan si hay design system

> No uno formal y consistente. Justamente quiero aprovechar este trabajo para ordenar eso.

### Si te preguntan por el editor

> El editor existe, pero es otro sistema mas complejo. En esta reunion quiero enfocarme en landing, auth y selector/dashboard.

### Si te preguntan si el selector es fijo

> No. Tiene contenido dinamico y varias colecciones, asi que necesito un diseno flexible, no solo una grilla estatica.

## 11. Mi Recomendacion Practica

Yo iria a la reunion con esta idea central:

> No quiero solo una mejora estetica. Quiero un sistema visual coherente para las tres superficies mas visibles del producto: landing, auth y dashboard home de plantillas.

Y pondria estos limites:

- por ahora no redisenar el editor completo
- si proponen cambiar el flujo del selector, que lo separen como decision de UX/producto
- pedir states, responsive y componentes, no solo mockups

## 12. Opinion Honesta Sobre El Estado Actual

Viendo el codigo, la mayor oportunidad esta en esto:

- el landing y el dashboard no hablan exactamente el mismo lenguaje visual
- no hay un design system formal
- el dashboard moderno ya va hacia una estetica mas cuidada y actual
- el landing todavia tiene bastante herencia visual mas vieja

Dicho simple:

> El trabajo del estudio tiene mucho sentido, porque hoy ya hay una desalineacion visual real entre partes del producto.

## 13. Referencias De Codigo

Si el estudio o alguien de tu equipo te pide "donde esta eso", estas son las referencias mas utiles:

- Landing: `src/pages/index.js`
- Dashboard shell: `src/pages/dashboard.js`
- Bootstrap global: `src/pages/_document.js`
- Tailwind config: `tailwind.config.js`
- Global CSS: `styles/globals.css`
- CSS heredado y auth modal: `styles/styles.css`
- Login modal: `src/lib/components/LoginModal.js`
- Register modal: `src/lib/components/RegisterModal.js`
- Completar perfil: `src/lib/components/ProfileCompletionModal.js`
- Home del dashboard: `src/components/dashboard/home/DashboardHomeView.jsx`
- Hero compartido landing/dashboard: `src/components/landing/LandingHero.jsx`
- Rail de plantillas: `src/components/dashboard/home/DashboardTemplateRailSection.jsx`
- Card de plantilla: `src/components/templates/DashboardTemplateCard.jsx`
- Modal de preview de plantilla: `src/components/TemplatePreviewModal.jsx`
- Formulario dinamico de plantilla: `src/components/templates/TemplateEventForm.jsx`
- Modelo de secciones del dashboard: `src/domain/dashboard/homeModel.js`
- Tipos de invitacion soportados: `src/domain/invitationTypes.js`
