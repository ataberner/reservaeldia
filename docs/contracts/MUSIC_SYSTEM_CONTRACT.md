# Música de la invitación

Status: Canonical Contract.
Decisión: aceptada por el pedido de Música V1, 2026-10-05.
Alcance: configuración global, catálogo, autorización, persistencia y lifecycle de entrada.
Mantenimiento: actualizar este contrato cuando cambien sus fronteras o invariantes; el shape pertenece a DATA_MODEL.

## Autoridades

- `CanvasEditor` posee el estado; `useCanvasEditorMusicBridge` aplica intención autorizada. Música no agrega objetos ni secciones.
- `shared/musicConfig.cjs` normaliza; los wrappers ESM/TypeScript y las copias del mapa de sincronización son adapters.
- `shared/musicCatalog.cjs` posee metadata y resolución de identidad a recurso. El draft nunca autoriza una URL.
- La persistencia sigue en `editorSessionPersistence` y su coordinador FIFO. `saveDraftWithMusicV1` es su transporte atómico para patches de sesiones draft que incluyen Música; los templates mantienen su callable administrativa existente.
- `prepareRenderPayload` conserva la preparación común de preview autorizado y publicación. El generador de secciones consume la config y el recurso preparado; su fallback visual usa el mismo resolver.
- `generarInvitationMusicRuntime` posee gate y una instancia de audio por documento. El controlador del sidebar posee únicamente la escucha del catálogo.
- `generarMotionEffectsRuntime` sigue siendo autoridad de efectos/readiness; Smart Layout mantiene su autoridad geométrica.

## Disponibilidad y permisos

`MUSIC_FEATURE_AVAILABILITY.editor` es la disponibilidad V1; `canManageSite` del acceso administrativo existente y `requireAdmin` son autorización. No son la misma decisión. La disponibilidad del catálogo y la futura fuente `user` son independientes.

Sólo admin/superadmin pueden cambiar Música, incluso mediante llamadas o eventos fabricados. El transporte server exige autenticación, ownership del draft y autorización administrativa para un cambio de Música. Una configuración conservada no debe impedir que un propietario que perdió el rol edite otros campos. Firestore Rules impiden cambios efectivos de Música por SDK y permiten conservarla; ausencia, null y default OFF vacío son equivalentes permitidos. La callable valida una whitelist del patch y escribe el conjunto en una transacción, sin editar identidad, publicaciones ni permisos.

La callable pertenece a core/default, dominio editor. Esta frontera conserva la identidad administrativa existente, incluyendo superadmins configurados por UID. No adopta ni resuelve la propuesta global Q1: Rules no puede consultar esa configuración del servidor. Templates conservan sus writers administrativos; la creación pública desde una plantilla no habilita Música para un usuario común.

## Compatibilidad y catálogo

Ausencia de `music` equivale a OFF; los autosaves de drafts legacy preservan la ausencia. Backend, templates y publicaciones pueden materializar el default OFF sin migración masiva. OFF conserva selección, volumen y loop y no genera gate, reproductor ni petición MP3. Config inválida, canción ausente/inactiva o fuente no soportada no bloquean el acceso ni producen un gate huérfano.

V1 utiliza un catálogo de código de assets públicos de la plataforma. Es una excepción explícita de recursos compartidos, no una biblioteca privada del usuario. El MP3 de prueba preexistente se registra con identidad estable `platform-demo`. Gestión manual y consecuencias de desactivar: [runbook](../operations/MUSIC_CATALOG.md).

`source: "user"` queda reservado y normalizado, pero no se resuelve ni se permite seleccionar/subir en V1. La futura biblioteca pertenece a `users/{uid}/music/{musicId}` y sus blobs a `user-music/{uid}/{musicId}.mp3`. Su implementación requiere ownership server y Rules dedicadas, MIME `audio/mpeg`, extensión `.mp3`, límite de tamaño y política de entrega/revocación. No usar el fallback de Storage como permiso ni una URL suministrada por el draft. No hace falta migrar la identidad de selección de V1.

## Lifecycle P0

Una sola `.inv` real permanece montada. El gate agrega blur, overlay e inert; no clona HTML, no captura screenshot y no reconstruye el árbol.

1. El DOM, las fuentes, las imágenes críticas y Smart Layout preparan geometría.
2. El runtime de efectos emite readiness y el loader existente se retira.
3. Con gate pendiente, se difieren preparación/activación de efectos, IntersectionObserver de entradas, parallax y arranque de countdown. Las animaciones CSS dentro de la invitación quedan pausadas.
4. Ambas decisiones fijan el scroll inicial en cero y resuelven una sola vez `invitation-entry-resolved`. La autoridad existente prepara/activa efectos con su temporización normal y los countdowns toman la hora actual.
5. La decisión con música llama `play()` síncronamente desde el gesto; una excepción, rechazo o promesa pendiente jamás demora la entrada.

La experiencia no se guarda en localStorage ni en el draft. Cada documento nuevo de preview vuelve a mostrar el gate. Los iframes desktop/mobile pueden conservar decisiones independientes pero coordinan exclusión de audio entre sí. Abrir preview detiene la escucha del sidebar. Desmontar/cerrar libera los reproductores.

El reproductor usa `preload="none"`, se crea sólo tras aceptar Música, mantiene loop/volumen durante scroll y cambia entre pausa/continuación sin regenerar el HTML. “Entrar sin música” no muestra control flotante. Un fallo de reproducción permite reintentar desde un control en estado pausado. Safe areas y posición izquierda evitan ocupar el CTA flotante habitual a la derecha.

El renderer de imagen social resuelve la misma entrada sin audio antes de capturar la primera sección. No genera una segunda versión de la invitación.

## Verificación

- `shared/musicConfig.test.mjs`: defaults, preservación OFF, identidad, URLs no autoritativas y fuente futura.
- `functions/invitationMusicRuntime.test.mjs`: decisiones, fallos de audio, lifecycle, observers y paridad de HTML.
- `functions/musicSecurity.test.mjs`: preparación y autorización del transporte.
- Tests de `src/domain/music/` y de persistencia: exclusión/cleanup, capability, transporte y round trip.
- Suites existentes de render, publicación, preview, geometría mobile y runtime de efectos.
- `node scripts/checkMusicBrowser.mjs`: gate desktop/mobile, estado inicial de efectos, una única instancia DOM, scroll, silencio y reapertura.

Los resultados ejecutados y sus limitaciones se registran en la entrega; este contrato no certifica Rules desplegadas ni reproducción en dispositivos físicos.
