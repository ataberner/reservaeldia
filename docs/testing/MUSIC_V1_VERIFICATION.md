# Verificación de Música V1

Status: Testing Baseline.
Fecha: 2026-10-05. Entorno: Windows, Node 22.13.1, Chromium fijado 138.0.7204.157; servicios demo/locales.
Alcance: implementación para revisión; sin merge, push, migración ni deploy.

## Aislamiento y arquitectura

Worktree `C:\Reservaeldia-music`, rama `feature/music`, base `cde1bc82f13a066006fe62c99fc3011e2132bccc`.
La comprobación final de `C:\Reservaeldia` lo encontró en main, limpio y todavía en ese commit.

| Frontera auditada | Resultado/owner |
| --- | --- |
| Sidebar / Regalos / switch | Registro DashboardSidebar, montaje MiniToolbar y estilos activation de Regalos reutilizados. |
| Estado y persistencia | CanvasEditor → bridge/snapshot → useBorradorSync → editorSessionPersistence/FIFO. Music global opcional, sin canvas section ni URL. |
| Roles y disponibilidad | canManageSite/requireAdmin existentes; rollout separado. Cambios de draft con Música via callable atómica owner-checked. Q1 global no se redefine. |
| HTML | generarHTMLDesdeObjetos mantiene objetos; generarHTMLDesdeSecciones integra gate/runtime una vez. Prepared render compartido preview/publicación. |
| Preview | ModalVistaPrevia y buildPreviewFrameSrcDoc: desktop, mobile mockup, mobile-focused; iframe cleanup, gate nuevo en reapertura, audio sidebar detenido. |
| Motion / IO / timelines | Readiness existente espera loader y entry; reveal/zoom/draw/group/gallery/pulse/RSVP/hover/parallax diferidos. Countdown entrada/frame/tick también espera. |
| Smart Layout / scriptTemplate | DOMContentLoaded/load/fonts/reintentos siguen preparando geometría. No nueva autoridad de reflow ni reinstanciación del DOM. |
| Publicación e imagen social | Identidad root conservada; HTML resuelve recurso de catálogo; capture de share entra sin audio mediante el mismo lifecycle. |
| Assets / Rules | Catálogo estático de assets públicos Hosting; no permisos nuevos de Storage ni upload privado V1. Firestore bloquea cambios efectivos de Música por SDK. |
| Templates | Whitelists frontend/shared/backend actualizadas; usuarios comunes no heredan música activa al copiar una plantilla. |

## Evidencia ejecutada

Los números son por grupo/comando, con solapamientos; no deben sumarse como un total único.

| Verificación | Resultado |
| --- | --- |
| Build Functions final (`node functions/scripts/buildContracts.cjs`) | PASS; 68 copias verificadas. |
| Música/templates final (`musicSecurity`, `musicRenderIntegration`, `invitationMusicRuntime`, `shared/musicConfig`, `shared/templates/contract`) | 49/49 PASS, cero skips. |
| Runtime/render/publicación/motion | 117/117 PASS; la suite P0 final individual tiene 23 casos. |
| Editor, persistencia FIFO, snapshots, transporte, previews y autoría | 93 casos distintos PASS. |
| Regresiones parity/mobile/lifecycle/publish validation | 94 PASS, 5 capturas optativas omitidas por flags, cero fallas. |
| Aislamiento/configuración local | 12/12 PASS. |
| Next build/export con cleanEnvironment y networkGuard | PASS; 14 páginas. Aviso de caniuse-lite desactualizado. |
| Lint canónico Functions | 273 archivos, cero errores, 234 warnings; no se hizo un refactor general para eliminarlos. |
| Ownership Functions | Tres builds; 41 tests PASS; discovery CLI real de 102 default, 3 payments y 3 email, sin red remota. |
| Firestore/Storage Rules + callable real + countdown | 1487 assertions PASS, cero fallas/skips. Ver limitación del runner abajo. |
| Chromium con MP3 real local | Cinco superficies + dos iframes escalados; gate/P0/DOM/scroll, play-pause-resume, exclusión, cleanup y reapertura PASS. |
| Panel React con CSS compilado | 376px y 320px, ON/OFF: cuatro capturas sin overflow, controles ≥44px. |
| Revisión final | Sin hallazgos accionables P0/P1; diff whitespace y enlaces documentales comprobados. |

La primera ejecución de ownership detectó un hash incorrecto en la fila nueva del registro: `entryPoint` forma parte del manifest. Se inspeccionó la metadata y se corrigió exclusivamente esa fila; las ejecuciones posteriores verifican el endpoint exacto, sin modificar sus opciones ni debilitar el gate.

El runner de Rules devolvió código 3 por una confirmación de `taskkill` en Windows, después de aprobar sus 1487 assertions. La verificación posterior confirmó el PID propio terminado y todos los puertos libres. Se preservó el reporte original: `.local-isolation/reports/run-SQlW8O/result.json` y `cleanup-verification.json`. No se presenta el wrapper completo como exit 0.

## Reproducir

En el worktree, con dependencias/herramientas preparadas según [Development Workflow](../operations/DEVELOPMENT_WORKFLOW.md):

```powershell
node functions/scripts/buildContracts.cjs
node --test functions/musicSecurity.test.mjs functions/musicRenderIntegration.test.mjs functions/invitationMusicRuntime.test.mjs shared/musicConfig.test.mjs shared/templates/contract.test.mjs
node --require ./scripts/local/networkGuard.cjs scripts/checkMusicBrowser.mjs
npm --prefix functions run verify:ownership
npm run test:local:rules
```

En PowerShell, si se redirige stderr de Node, capturar explícitamente `$LASTEXITCODE`: los warnings nativos pueden hacer que el wrapper informe error aunque Node termine correctamente.

El script Chromium sirve únicamente el MP3 del repositorio por loopback, bloquea requests externas y usa un perfil sintético. Escribe JSON y PNGs en `.local-isolation/music-browser-*`. La última captura aprobada durante esta tarea está en `music-browser-1791240080157`. El fallo inicial del test de click sobre iframes escalados se corrigió en el cálculo de coordenadas del driver; el producto no necesitó cambiar por ese fallo.

Logs adicionales: `music-final-build.log`, `music-final-tests.log`, `music-parity-tests.log`, `music-functions-lint.log`, `music-ownership-confirmed.log`, `music-frontend-build/verification.log`, `music-panel-visual-report.json`, todos bajo `.local-isolation/`.

## Límites de la evidencia

No se verificaron dispositivos físicos ni Safari/iOS; Chromium con viewport mobile no prueba esas implementaciones. No se ejecutó el gate integrado completo `verify:local`; sí sus verificaciones relevantes de ownership, Rules, configuración y lint, además de las suites funcionales listadas. Cinco capturas optativas legacy permanecieron omitidas; la nueva prueba Chromium cubre Música y mockups reales, no reemplaza toda su matriz legacy.

No se inspeccionaron claims, Rules, recursos ni invitaciones de producción. La decisión de entrada es por documento, sin persistencia permanente. La canción incluida es el asset preexistente de prueba; carga/activación y límites sobre HTML ya publicado se documentan en [MUSIC_CATALOG](../operations/MUSIC_CATALOG.md).

## Seguimiento: guardado y precarga bajo el corazón — 2026-10-05

Alcance: corrección local sobre `769b8b68`, sin deploy ni republicación. La eliminación preexistente de `public/assets/musica.mp3` se conserva fuera del diff de esta tarea; el probe usa el MP3 activo de Transporte.

HECHO: el texto reportado proviene del timeout de 6 segundos del flush crítico, antes de generar HTML o solicitar audio de la invitación. Seleccionar Música usa `saveDraftWithMusicV1` dentro del FIFO; el límite anterior era inferior al deadline predeterminado del transporte callable (70 segundos). No se reprodujo ni se atribuyó a una causa de red concreta la demora de producción.

Cambios: el flush espera confirmación hasta 90 segundos, sin demora mínima ni éxito artificial; audio activo se precarga una sola vez en paralelo con imágenes/fuentes y comparte readiness con el corazón; espera `canplay` sin descargar necesariamente todo el MP3. El audio no reproduce sin gesto. Error/precarga ignorada liberan la espera opcional, con máximo de 8 segundos. Captura social cancela la precarga tras DOMContentLoaded, antes de esperar `load`.

| Verificación local | Resultado |
| --- | --- |
| Build Functions (`node --require ./scripts/local/networkGuard.cjs functions/scripts/buildContracts.cjs`) | PASS; 68 copias verificadas. |
| Flush/cola/scheduling/transporte Música y editor | 30/30 PASS; incluye confirmación a 8 segundos, deadline agotado sin snapshot y preservación de errores. |
| Música/runtime/motion/frames/pipeline | 82/82 PASS; incluye audio lento, metadata insuficiente, error, timeout opcional, dispose y paridad preview/publish. La suite final de Música agrega la excepción de `load()` y pasa 30/30 (solapados con el grupo anterior). |
| Publicación/captura social (`functions/publicationPublishExecution.test.mjs`) | 43/43 PASS; cancelación de audio antes de esperar el documento y HTML con precarga del catálogo activo. La fixture anterior usaba el ID retirado `platform-demo`; se corrigió al catálogo vigente. |
| Render/paridad/mobile y readiness | La corrida conjunta dio 113 PASS, 3 fallos y 3 skips. Dos fallos de publicación quedaron corregidos en la suite anterior (fixture retirada y contador de evaluaciones por cancelación anticipada). El fallo temporal de readiness pasó al repetir `functions/invitationRuntimeReadiness.test.mjs` solo, sin modificarlo. Los 3 skips de capturas optativas siguen sin ejecutarse. |
| Lint Functions | 273 archivos, cero errores, 234 warnings. |
| Ownership Functions | PASS en rerun aislado: tres builds, 41/41 tests y discovery CLI real de 102 default, 3 payments, 3 email, sin operaciones remotas. El primer intento tuvo 40 PASS y un timeout de 30 s al cargar JSDOM en un proceso nuevo; no se alteró su test ni deadline. CLI fijada 14.4.0 reutilizada con `--cli` desde `prepared-hlifiv`, ya que faltaba en la ruta local habitual. |
| `node --require ./scripts/local/networkGuard.cjs scripts/checkMusicBrowser.mjs` | PASS: cinco superficies, dos iframes escalados, reproducción MP3 real, exclusión, silencio, pausa/reanudación, dispose y reapertura. Captura `music-browser-1791252966334/paired-iframe-gates.png` inspeccionada. |
| `node --require ./scripts/local/networkGuard.cjs scripts/checkMusicLoadingBrowser.mjs` | PASS: seis corridas con caché deshabilitada, MP3 local y requests externas bloqueadas. |

Medición antes/después en Chromium 138.0.7204.157, tres repeticiones por superficie, imagen con demora de 1000 ms y MP3 con demora de 700 ms. Son medianas locales, no latencias de producción ni garantías para Safari/iOS:

| Superficie | Corazón antes → después | Gesto → audio antes → después | Inicio → audio antes → después |
| --- | --- | --- | --- |
| Publicada desktop | 1496 → 1581 ms | 807 → 4 ms | 2350 → 1611 ms |
| Preview mobile | 1415 → 1402 ms | 807 → 5 ms | 2269 → 1463 ms |

La primera corrida desktop tiene mayor variabilidad (corazón: 2409 ms antes, 3834 ms después); la mejora atribuible al cambio es iniciar descarga en paralelo y reutilizar audio listo desde el gesto. Una ejecución inicial del probe agotó la espera del loader durante otros checks; el rerun secuencial pasó. Se preservan los seis valores de cada versión en `.local-isolation/music-loading-{baseline,after}/results.json`; `--baseline` sólo corresponde al runtime anterior sin precarga.

Logs: `.local-isolation/music-loading-{editor-tests,runtime-tests,final-runtime-tests,publish-tests,parity-tests,readiness-retry,final-build,lint,ownership,ownership-retry}.log`. El lint focalizado final del runtime Música y los dos tests modificados también pasó (cero errores, una advertencia preexistente). No se ejecutaron el gate integrado completo, Rules ni un build Next: no se cambiaron permisos, schemas ni componentes React. No se verificaron dispositivos físicos ni producción. El HTML ya publicado conserva su runtime anterior hasta una republicación autorizada.

Solapamiento observado al cierre: otro trabajo modificó `generarInvitationLoaderRuntime.ts` y las esperas/fallos visuales de `generarMotionEffectsRuntime.ts` después de las verificaciones anteriores. Se preservan esos cambios. Esta tarea sólo agrega al segundo la promesa de precarga y su resultado `music` en readiness; no es autora del retiro de los fallos visuales ni del nuevo timeout del loader. La matriz anterior describe la revisión de Música previa a ese solapamiento.

Verificación acotada del conjunto posterior: build y 68 copias PASS (`music-loading-combined-build.log`), Música 30/30 PASS (`music-loading-combined-runtime-tests.log`) y Chromium PASS nuevamente en las cinco superficies/iframes (`music-browser-1791253762694`). La revisión general de las modificaciones simultáneas de readiness, sus tests y documentación pertenece al otro trabajo. El diff exclusivo de esta tarea, incluidos sus dos hunks compartidos, queda en `.local-isolation/music-loading-task.patch` para facilitar revisión sin incluir esos cambios ajenos.

## Despliegue del acceso individual — 2026-10-06

Despliegue autorizado explícitamente para habilitar Música a `jpeses@gmail.com` según el [contrato de permisos](../contracts/MUSIC_SYSTEM_CONTRACT.md). La consulta acotada de Firebase Auth confirmó cuenta existente, habilitada y correo verificado; no se cambiaron claims ni datos del usuario.

Se preparó una copia independiente de la fuente correspondiente al build activo `XKh5Xm63lpR5sKP9o5FD2`, incorporando únicamente los cambios de esta tarea. Se preservaron los cambios ya publicados y la retención de assets. No se incluyeron otras modificaciones pendientes del árbol principal.

| Comprobación | Resultado |
| --- | --- |
| Pruebas focalizadas en la copia de release | 34/34 PASS: permisos, panel/bridge, persistencia, preview y HTML publicado. |
| Builds y contratos | Functions y Next/export PASS; 70 copias verificadas; verificación local de assets PASS. |
| Backend productivo | Sólo `saveDraftWithMusicV1` actualizada en default/us-central1; ACTIVE, revisión `savedraftwithmusicv1-00003-qiv`; opciones y entorno preservados. |
| Hosting productivo | Build `fGEE0idle-MTjFMTaZ60g`; 124 assets estáticos comprobados y hash del bundle con acceso piloto coincidente. |
| Smoke del endpoint | HTTP 401 / UNAUTHENTICATED sin credenciales; ninguna escritura de borrador. |

El primer intento de deploy terminó antes de actualizar la función por el límite local de discovery de 10 segundos. El reintento usó `FUNCTIONS_DISCOVERY_TIMEOUT=60` para el CLI, conservando el timeout del servicio. Una corrida inicial de pruebas había usado React en modo production; se corrigió únicamente el entorno del runner a test antes de obtener el resultado anterior. Next se compiló sin caché en la copia aislada para limitar el uso de disco.

Evidencia: `.local-isolation/music-access-release-20261006/` conserva `source-manifest.json`, `build-result.json`, `release-result.json`, `tests.log`, `function-before.json`, `function-after.json`, `account-check.json`, `smoke-result.json` y logs de deploy. No se inició sesión como el usuario, no se modificaron borradores reales ni se republicaron invitaciones; la selección y publicación del usuario se mantienen como acciones posteriores del flujo normal.
## Despliegue de la corrección — 2026-10-06

Autorización: pedido explícito «hace deploy». Release construido desde `main`, commit `4833b92e`, en el checkout `C:\Reservaeldia\.local-isolation\music-catalog-release`. Se integró exclusivamente el diff de Música anterior; quedaron fuera los cambios simultáneos del loader/readiness y la eliminación local del MP3 legacy. La caché de Hosting preexistente no se incluyó en el commit. No hubo push a GitHub ni republicación de invitaciones existentes.

- Frontend: build/export y retención de assets aprobados. Hosting publicado en `reservaeldia-7a440`; build `uot5sgXvzrf6cVT8vhAQt`. `verifyNextStaticRelease.cjs --origin https://reservaeldia.com.ar` confirmó el build remoto y sus 136 archivos estáticos, incluyendo políticas de caché.
- Backend: actualizadas únicamente `adminGetTemplateEditorDocumentV1`, `prepareDraftPreviewRender`, `preparePublicTemplatePreview`, `publicarInvitacion`, `retryPaidPublicationWithNewSlug`, `payments:createPublicationPayment` y `payments:mercadoPagoWebhook`. Firebase confirmó éxito para las siete; inventario posterior: 108 Functions, siete actualizadas ACTIVE y 101 con hash intacto. Entorno, bindings, capacidad y demás opciones comparadas permanecieron iguales, sin mostrar valores de configuración.
- Verificación del checkout de release: 84/84 tests de flush, Música, render y publicación, cero fallos/skips; builds core y Payments aprobados. Checks de ownership/configuración de predeploy aprobados. No se cambiaron Rules, Secrets, IAM, Email ni el flujo de pagos.
- Assets públicos: `musica.mp3`, `music/perfect.mp3` y `music/transporte.mp3` devuelven HTTP 200 y SHA-256 idéntico al release. El chequeo inicial de tamaño HTTP HEAD se sustituyó por hash del contenido porque Hosting entrega Brotli y el tamaño comprimido es distinto.
- El primer intento de Functions agotó el análisis local de la CLI a los 10 segundos antes de actualizar servicios. El rerun con `FUNCTIONS_DISCOVERY_TIMEOUT=60` terminó correctamente; no se cambiaron deadlines de las Functions. CLI fijada 14.4.0, sesión existente de Firebase y proyecto explícito.

Evidencia ignorada, sin incorporar inventarios con configuración al repositorio: `.local-isolation/music-loading-deploy-evidence.json`, `music-loading-deploy-preflight.json`, `music-loading-hosting-verify.log`, `music-loading-assets-verify.json`, `music-loading-release-tests.log` y logs de build/deploy asociados, bajo `C:\Reservaeldia`.

Límites: la verificación remota comprueba entrega, versión y estado; no se operaron borradores, pagos ni publicaciones reales para un smoke funcional. El HTML existente requiere republicación para adquirir este runtime. La CLI advirtió deprecación de Node.js 20 y decommission el 2026-10-30; su actualización y la del SDK son trabajo separado, sin cambio de runtime en este release.
