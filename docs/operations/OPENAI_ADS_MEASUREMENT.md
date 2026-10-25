# Retiro de la medición de OpenAI Ads

Status: Historical / Deprecated.
Fecha del retiro local: 2026-10-23.
Decisión: aceptada por pedido del usuario; eliminar el píxel y su consentimiento
específico. Este registro reemplaza la guía de instalación anterior.

Se retiraron de la aplicación local el montaje en `src/pages/_app.js`, el
componente `OpenAiAdsConsent` y sus estilos, el runtime `openAiAds`, sus pruebas,
el frame de `public/openai-ads/` y el script de comprobación específico. El modal
«Medición de anuncios de OpenAI» y «Preferencias de publicidad» pertenecían
exclusivamente a esta integración y se retiraron junto con ella.

Archivos eliminados:

- `src/components/analytics/OpenAiAdsConsent.jsx`
- `src/components/analytics/OpenAiAdsConsent.module.css`
- `src/domain/analytics/openAiAds.js`
- `src/domain/analytics/openAiAds.test.mjs`
- `public/openai-ads/frame.html`
- `public/openai-ads/frame.js`
- `scripts/checkOpenAiAdsBrowser.cjs`

Se actualizaron también este registro, el índice documental, los inventarios
SEO/AEO y una nota histórica en `docs/testing/DRAFT_PROVIDER_AUTHORIZATION.md`.
Los archivos Ads eran incorporaciones locales sin commit: al retirarlos,
`_app.js` y los inventarios SEO/AEO volvieron a coincidir con HEAD. Los cambios
preexistentes ajenos a Ads se conservaron.

El código retirado era responsable de cargar el SDK, inicializar el píxel,
enviar visitas, administrar consentimiento y atribución, y consumir las variables
`NEXT_PUBLIC_OPENAI_ADS_ENABLED` y `NEXT_PUBLIC_OPENAI_ADS_DEBUG`. Esas variables
ya no tienen consumidor en la aplicación. Los identificadores `oaiq`,
`bzrcdn.openai.com`, `bzr.openai.com`, `pixelId`, `__oppref` y `__obref` se
registran aquí como términos de auditoría del retiro.

La inspección local no identificó envíos de conversiones de OpenAI Ads desde
el backend ni una instalación mediante Google Tag Manager en el código fuente.
Google Analytics, Firebase, las funciones de inteligencia artificial de OpenAI,
las invitaciones y las compras quedan fuera del cambio. No se modificaron
campañas publicitarias ni mecanismos de consentimiento de otras herramientas.

La etapa del 2026-10-23 fue exclusivamente local, sin despliegue. El despliegue
posteriormente autorizado por el usuario se registra al final. No se inspeccionó
la configuración administrativa externa de gestores de etiquetas u otras
integraciones; la comprobación de entrega publicada no certifica esas cuentas.

Los outputs anteriores `.next/` y `out/` todavía contenían la integración.
Además, la release `5eBLVIiyGwHSbNB4qUHN0` del historial estático podía volver a
copiar sus bundles mediante `retainNextStaticAssets.cjs`. Se apartaron esos dos
outputs completos y únicamente esa release a
`.local-isolation/ads-removal-obsolete-20261023/`, conservando todos sus archivos
y una copia del manifest anterior. Se retiró sólo ese ID del manifest local;
las otras dos releases y el mecanismo general de retención se conservaron.
En esa etapa la raíz quedó sin export listo para Hosting: no usar el archivo
histórico como artefacto del retiro. Las copias de evidencia en `.local-isolation/` no se sirven
ni se incorporan al build. No se eliminaron snapshots de trabajos anteriores.

Las referencias a Ads en evidencias anteriores describen sus respectivos
snapshots. El registro de consentimiento que ya estuviera en un navegador queda
inerte; el código actual no lo lee ni renueva las cookies anteriores. No se
agregó una migración de almacenamiento ni se modificaron navegadores reales.

Verificación local del retiro:

- Búsqueda de los identificadores anteriores, del Pixel ID retirado y del nombre
  de la integración: sin coincidencias en código, assets públicos, scripts,
  configuración inspeccionada ni releases retenidas. Las referencias de este
  registro y de evidencia histórica no son instalaciones del píxel.
- `node --test src/domain/payments/publicationCheckoutState.test.mjs
  src/domain/seo/landingMetadata.test.mjs src/domain/seo/faqMetadata.test.mjs
  src/components/landing/LandingHero.responsive.test.mjs
  src/components/landing/LandingTemplateShowcase.loading.test.mjs
  src/domain/invitations/readResolution.test.mjs
  src/domain/templates/pendingLandingTemplateSelection.test.mjs`, con Node
  22.23.4: **38/39 aprobadas**. Falla la expectativa de breakpoint tablet
  621–1024 de `LandingHero.responsive.test.mjs:32`. El test y todos los archivos
  que lee coinciden con HEAD; no dependen de Ads ni se modificaron en este retiro.
  Evidencia: `.local-isolation/ads-removal-tests.tap`.
- `npm.cmd --prefix functions run lint -- --report
  C:\Reservaeldia\.local-isolation\ads-removal-lint-evidence.json`, con Node
  22.13.1: **307 archivos, 0 errores y 233 advertencias**, sin auto-fix. No hay
  script de lint frontend configurado. Evidencia en la ruta del comando.
- `git diff --check` sobre los archivos alcanzados: sin errores.
- `node .local-isolation/ads-removal-verification/checkRemoval.cjs`, con Node
  22.23.4 y Chromium 138: **20/20 escenarios aprobados**, 0 errores JS,
  0 solicitudes Ads y 0 solicitudes externas entregadas. Se ejecutaron `_app`
  y CSS reales con página, router, Head, countdown, aviso local y renderer de GA
  simulados. Escritorio 1365×900 y móvil 390×844, preferencia ausente o antigua
  `granted`, `/`, FAQ, dashboard, navegación y recarga. Sin `oaiq`, iframe,
  modal, botón ni nuevas cookies Ads; interacción y montaje GA conservados.
  Capturas de escritorio/móvil revisadas. Evidencia:
  `.local-isolation/ads-removal-verification/evidence.json`. El primer arranque
  del navegador agotó el tiempo en sandbox; el reintento con permiso del entorno
  pasó sin cambiar aserciones. No es un E2E de Firebase, invitaciones o compras
  ni una prueba del servicio externo de Google Analytics.
- `& '.local-isolation/tool-cache/node-v22.23.4-win-x64/node.exe'
  scripts/local/runLocal.cjs build`: **aprobado**, incluyendo compilación
  TypeScript de Functions, coherencia de copias compartidas, Next optimizado,
  export de 16 páginas y verificación local de assets (44 referencias HTML,
  68 archivos estáticos). Sin credenciales y con red no-loopback bloqueada.
  El intento inicial con Node 22.13.1 fue rechazado por el prerrequisito de
  versión; se usó después el Node 22.23.4 ya disponible, sin cambiar el gate.
  Next informó ausencia de caché y datos Browserslist antiguos, sin fallar.
  Resultado y logs: `.local-isolation/reports/run-DBXSpl/`.
  La búsqueda final de todos los identificadores Ads en el nuevo `out/` y
  `.next/` de `.local-isolation/session-Gkg6y7/workspace/` no encontró
  coincidencias. La sesión terminó y confirmó limpieza de sus procesos.
  Este build aislado es evidencia de compilación, **no un artefacto de deploy**:
  el launcher no copia todos los assets públicos ni valida servicios remotos.

No se ejecutaron la suite integral de emuladores/Rules ni E2E reales de cuentas,
edición o pagos; ninguna de esas superficies fue modificada por este retiro.

## Despliegue autorizado — 2026-10-24

El usuario pidió publicar el retiro porque todavía veía el cartel. Antes del
deploy, las lecturas públicas confirmaron que `/`, FAQ y dashboard servían
`5eBLVIiyGwHSbNB4qUHN0`, con Ads en el bundle `_app`, y ambos archivos del frame
respondían 200. No se ejecutó el SDK ni se enviaron conversiones en esa lectura.

Se generó un export completo del repositorio con Node 22.23.4, modo Firebase
`prod` y la configuración pública existente de GA y Maps, sin exponer sus valores.
La compilación bloqueó conexiones no-loopback. `hosting:bootstrap` conservó las
dos releases limpias existentes y no descargó el build antiguo con Ads.
Next, retención y verificación local terminaron con código 0. El artefacto final
contiene 244 archivos; 105 HTML/JS/JSON/CSS examinados sin términos del píxel,
146 assets públicos idénticos byte a byte y GA/Maps presentes.

El primer build falló por `ENOSPC`. Se liberó la copia temporal detenida
`session-Gkg6y7`, conservando su reporte `reports/run-DBXSpl`, y la caché
regenerable de webpack del build antiguo archivado. No se eliminaron sus bundles,
assets ni fuentes. El reintento completo fue satisfactorio.

Comando efectivo, con el Node portable y la CLI fijada del repositorio:

```powershell
& '.local-isolation/tool-cache/node-v22.23.4-win-x64/node.exe' scripts/local/tools/node_modules/firebase-tools/lib/bin/firebase.js deploy --only hosting --project reservaeldia-7a440 --config firebase.json --non-interactive
```

- Resultado: código 0, release de Hosting completada el **2026-10-24 a las
  10:51:08 de Argentina** (13:51:08 UTC).
- Sitio: `reservaeldia-7a440`; versión Hosting `ee917b775855460d`;
  build Next **`t3vRP7wsIF0fySpNjxKjR`**.
- Alcance: Hosting únicamente. Sin despliegue de Functions/Rules, operaciones
  de datos, campañas, compras ni comunicaciones de prueba. `firebase.json` y
  las fuentes de la aplicación no se modificaron.
- `verifyNextStaticRelease.cjs --origin https://reservaeldia.com.ar` pasó:
  buildId remoto coincidente y **82 assets estáticos** disponibles con caché
  immutable; dashboard conserva no-cache/no-store.
- Lectura posterior de landing, FAQ y dashboard: HTTP 200, build nuevo y
  HTML/bundle `_app` sin Ads. `/openai-ads/frame.html` y `frame.js`: **404**.
- Navegador real publicado: **12/12 escenarios** de escritorio/móvil, con
  preferencia ausente o antigua `granted`, en landing, FAQ y dashboard anónimo
  (redirige a `/`). BuildId correcto, aplicación hidratada y ningún cartel,
  botón, runtime, iframe ni cookie Ads nueva; 0 errores JS y 0 intentos Ads.
  El script de GA sigue presente. Se bloquearon Analytics, APIs, Firebase y
  terceros durante la comprobación: no se entregaron solicitudes externas ni
  se probaron login, compras o invitaciones. Capturas desktop/mobile revisadas.
  Se examinaron 262 respuestas HTML/JS sin Ads. Chromium no devolvió el cuerpo
  de algunos duplicados de tres bundles durante redirecciones: la corrida
  original registra ese fallo de lectura. Tres GET independientes posteriores
  dieron 200, immutable, sin Ads y hashes idénticos a sus respuestas de navegador
  exitosas. La evidencia combinada pasó sin cambiar las aserciones de producto:
  `.local-isolation/ads-removal-postdeploy/run-Haq8CR/resolved-evidence.json`.
  Se cerró Chromium y se eliminó sólo su perfil temporal.
- Evidencia reproducible del build, auditoría de artefacto y lecturas antes/después:
  `.local-isolation/ads-removal-deploy-20261024/` (`build-evidence.json`,
  `artifact-evidence.json`, `published-before.json`, `published-after.json`,
  `verify-release.log`). Los logs operativos completos permanecen locales.

Una pestaña que ya ejecutó el build anterior puede conservar el control hasta
recargar. Landing y FAQ conservan su política previa `max-age=3600`; una recarga
forzada evita reutilizar su HTML anterior. No se cambió esa política en este retiro.

Mantenimiento: actualizar este registro sólo si cambia el alcance del retiro,
se obtiene evidencia externa o se autoriza y verifica un despliegue.
