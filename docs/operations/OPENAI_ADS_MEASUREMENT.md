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

El retiro es local: no se desplegó ni se modificó configuración de producción.
La configuración externa de gestores de etiquetas u otras integraciones y el
estado efectivamente servido en producción no están verificados por esta
inspección. Su revisión no implica autorización para modificarlos.

Los outputs anteriores `.next/` y `out/` todavía contenían la integración.
Además, la release `5eBLVIiyGwHSbNB4qUHN0` del historial estático podía volver a
copiar sus bundles mediante `retainNextStaticAssets.cjs`. Se apartaron esos dos
outputs completos y únicamente esa release a
`.local-isolation/ads-removal-obsolete-20261023/`, conservando todos sus archivos
y una copia del manifest anterior. Se retiró sólo ese ID del manifest local;
las otras dos releases y el mecanismo general de retención se conservaron.
La raíz queda sin export listo para Hosting: no usar el archivo histórico como
artefacto del retiro. Las copias de evidencia en `.local-isolation/` no se sirven
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

Mantenimiento: actualizar este registro sólo si cambia el alcance del retiro,
se obtiene evidencia externa o se autoriza y verifica un despliegue.
