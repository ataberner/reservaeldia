# Directorio privado aprobado — verificación

Status: Testing Baseline.
Fecha: 2026-10-25. Verificación local/CI completada; backend y Hosting privados integrados y desplegados.

La autoridad funcional es
[PROVIDER_DATA_MODEL §10](../architecture/PROVIDER_DATA_MODEL.md#10-beta-privada-v1-contrato-funcional-y-evolución-compatible).
Este documento registra evidencia y reproducción, sin duplicar reglas de negocio
ni autorizar operación remota. El
[runbook privado](../operations/PROVIDER_BETA_PRIVATE_DEPLOYMENT.md) distingue la
entrega administrativa de la conexión del directorio, sus versiones desplegadas, la prueba productiva y sus
limitaciones. `panelEnabled` y `privateDirectoryEnabled` están habilitados sólo
para el superadmin existente; directorio público y onboarding permanecen cerrados.

## Base, alcance e implementación

Rama corta `feat/proveedores-directorio-privado` desde `e0fa2b76`, actualizada por
fast-forward a la base integrada `689bde9b` del PR #1 (árbol idéntico), worktree
`C:\Reservaeldia\.local-isolation\proveedores-beta-base`.
El despliegue de la primera entrega usa el árbol congelado de `C:\Reservaeldia`;
no se mezclan los nuevos cambios con ese candidato. El
[informe del hito 1](PROVIDER_BETA_MILESTONE_1.md) conserva su evidencia histórica.

Se conectan `/lugares/`, `/profesionales/` y `/proveedor/?id=...` a lecturas
aprobadas; se reemplazan ejemplos y controles simulados por filtros/paginación
reales. `providerDirectoryV1` y `providerDirectoryImageV1` son las nuevas
autoridades backend de lectura. La UI reutiliza header, login y estilos de las
landings, con componentes compartidos en `src/components/marketplace/` y adapters
en `src/domain/providers/directory*`. Administración, editor y runtime de parejas
mantienen sus caminos previos.

La prueba nueva distingue el gate privado del gate administrativo. No agrega
cuentas de proveedores, registro, inbox, pagos, importación ni acceso público.
Las fotografías del negocio son bytes autorizados por revisión aprobada; la
ausencia usa íconos neutros. El collage existente de la landing profesional es
arte decorativo del sitio y no se reutiliza como imagen de negocios.

## Evidencia ejecutada

Runtime: **Node 22.23.4**, Firebase Tools **14.4.0**. Recursos locales aislados:
`demo-reservaeldia-local`, bucket demo, configuración personal vacía y red externa
bloqueada según el harness. Los tests usan negocios/archivos/cuentas sintéticos.

| Comprobación | Resultado y alcance |
| --- | --- |
| Frontend, modelo/presentación/hooks y gates de rutas | **22/22 PASS**: `node --test src/domain/providers/directoryModel.test.mjs src/components/marketplace/providerDirectory.test.mjs src/pages/lugares.test.mjs src/pages/profesionales.test.mjs`. Offline, React/JSDOM y adapters. |
| Modelo nuevo y regresión de beta/media | **30/30 PASS**: `node --test functions/providersDirectory.test.mjs functions/providersBeta.test.mjs functions/providersBetaMedia.test.mjs` (10 directorio, 17 beta, 3 media). |
| Compilación de contratos/Functions | **PASS**: desde `functions`, `node scripts/buildContracts.cjs`; fingerprint `62bf0af673cadeae83d217dae6a7e8f8371d3940a8faca8797e4e2dfab10d8bb`, finalizado 18:23:14Z; `.local-isolation/contracts-build-BM7G5G/1-tsc.log`. |
| Lint Functions | **PASS**: desde `functions`, `node scripts/lint.cjs`; 316 archivos, 0 errores, 233 advertencias preexistentes. `.local-isolation/lint-evidence.json`. |
| Configuración/aislamiento del harness | **15/15 PASS** en `run-B7ladc`, sin skips. |
| Sync, compile y contratos construidos del harness | **PASS** en `run-B7ladc`, emuladores listos. |
| API del directorio en emuladores | **9/9 PASS**, sin skips, en `run-B7ladc`; etapa finalizada 18:33:58Z. No prueba producción. |
| Dos ajustes frontend posteriores | **1/1 PASS cada uno**, ejecuciones focales: estado de carga al recuperar filtros y carga inicial del panel después de validar acceso. No se atribuyen al run anterior de 22 tests. |
| Regresión frontend final | **27/27 PASS**, sin skips, Node 22.23.4, 19:27:41–19:28:16Z. Los cuatro archivos frontend anteriores más `src/components/admin/providers/providerAdmin.test.mjs`; incluye ambos ajustes posteriores. Evidencia en `.local-isolation/frontend-final-20261025-162740/`. |
| Navegador real desktop/móvil | **1/1 PASS**, sin skips, `run-7vKCm9`, 19:15:27–19:18:38Z, nueve capturas. Replay sobre snapshot compilado coincidente: paginación 12+1/volver, filtros, teclado, vacío/error, detalle/fotos aprobadas, pausa/contacto, gate cerrado y denegaciones común/admin claim. Teardown: ocho puertos libres; offline 1/1 PASS. |
| Ownership de Functions | **Gate integral PASS en CI `40225434395`**: tres builds, 41/41 tests y discovery real default 107/payments 3/email 3. El run completo falló después en tooling, no en ownership. Se conservan los intentos Windows: core TypeScript excedió 180000 ms; `ownership-xuWCJZ` tuvo tres builds PASS y 39/41 por dos startups de subprocess de 30 s. Repetición intacta sobre ese snapshot: 41/41 y tres discoveries PASS; quince hashes snapshot↔fuente coincidentes en `component-evidence.json`. |
| Build/export del nuevo directorio | **PASS**, `run-iuSN8W` / `session-O8E6E5`, finalizado 19:28:01Z: contratos, compilación, export, finalización y release check; ocho puertos libres al terminar. Artefacto aislado local, no destinado a despliegue. |
| Verificación integral CI | **PASS**, workflow `40226008315`, commit `f5a8b722`, finalizada 19:34:20Z: ownership, lint, tooling, contratos, configuración, backend, compatibilidad, emuladores, Rules, integración, API/browser del panel y directorio, regresión de parejas y offline. Reporte `run-5BedyO/verified.json`; sin operaciones remotas. No sustituye build ni recorrido productivo. |
| Deploy de las dos Functions nuevas | **PASS**, ACTIVE y denegaciones anónimas 7/7 a las 19:41Z; revisiones exactas en el runbook. Hosting y recorrido productivo autenticado siguen pendientes. |

Frontend comprueba render de proyección, desconocidos/precios, destinos de contacto
seguros, errores diferenciados y recuperación de filtros, cierre de datos ante
denegación/cambio de cuenta, revalidación de la aprobación antes de contacto,
petición media sin Storage path/URL token, revisión explícita y revocación de
object URLs. Los tests de rutas existentes conservan los rechazos anónimo,
usuario común, claim admin, carga/error y cambio de sesión.

API local comprueba gates independientes, permisos de identidad verificada,
perfil alterado sin privilegios, proyección sin privados, exclusión de borradores/
legacy sin aprobación/restricciones, filtros de contenido aprobado, paginación y
fotos únicamente de la revisión aprobada. Los casos de alcance/capacidad y límite
se apoyan en fixtures reales del emulador; no prometen escala ilimitada.

## Archivos de evidencia y límites del snapshot

Reporte: `.local-isolation/reports/run-B7ladc/`; sesión:
`.local-isolation/session-9HrjTM/`. `result.json` registra estados por etapa;
`provider-directory-api.log` y `provider-directory-api-evidence.json` contienen
la evidencia acotada. La colección final de archivos ocurre al terminar el run;
no inferir ausencia de prueba sólo por una copia todavía pendiente.

El snapshot original tiene su `source-manifest.json`. Los ajustes finales se
registran por separado en `directory-final-source-overlay.json`: siete fuentes
UI finales y tres fixtures/tests locales copiados antes de la API/Next según
corresponde. `directory-frontend-overlay.json` conserva el ajuste anterior.
No atribuir el contenido final al hash del snapshot inicial sin esas salvedades.

El recorrido final está en `.local-isolation/reports/run-7vKCm9/`, sesión
`session-GBHZ07`, con `replay-source-manifest.json`, `provider-directory-browser-evidence.json` y
`provider-directory-screenshots/`. Las capturas de detalle desktop/móvil y
tarjeta profesional móvil fueron revisadas visualmente: contenido y acciones
legibles, fallback neutro y sin desbordamiento horizontal. Las vistas scrolleadas
no acreditan por sí solas el header móvil. Son imágenes reales del entorno local
con recursos sintéticos; no fotografías de negocios ni pruebas de producción.

Se conservan los intentos anteriores: `run-B7ladc` agotó navegación durante la
compilación inicial; `run-8e1hf4` falló su helper de hit-test durante scroll suave;
`run-fSciWA` agotó discovery antes de UI. Se corrigió sólo el helper para scroll
instantáneo y espera de hit-test. El replay recuperó infraestructura dentro de
los mismos límites; no se relajaron assertions ni timeouts de negocio.

`run-iuSN8W/directory-export-inspection.json` registra las cuatro rutas privadas
exportadas con `pageProps:{}` y estado inicial de validación de acceso. La búsqueda
acotada de ocho marcadores sintéticos en 91 archivos de texto no encontró datos de
prueba. Las 1193 fuentes de aplicación coinciden con el candidato; el único cambio
posterior de la copia verificada es la lista de artefactos CI. Esta inspección no
afirma paridad de todos los assets productivos ni reemplaza la verificación live.

La limpieza local previa está en
`.local-isolation/reports/provider-directory-cache-cleanup.json`; se recuperaron
116527727 bytes de cachés descartables propias, conservando fuentes, exports
previos y evidencia. No incorporar perfiles, cookies, logs privados, secretos ni
credenciales reales a Git. Las credenciales mostradas por el seed pertenecen
exclusivamente a Auth emulado.

## Reproducir localmente

Seguir primero [DEVELOPMENT_WORKFLOW](../operations/DEVELOPMENT_WORKFLOW.md) y
confirmar runtime, puertos/destinos y efectos del launcher. Desde este worktree:

```powershell
$env:Path = 'C:\Reservaeldia\.local-isolation\tool-cache\node-v22.23.4-win-x64;' + $env:Path
node --version
node scripts/local/runLocal.cjs provider-directory-dev
```

Abrir `http://localhost:3100/?auth=login`, ingresar con la cuenta demo que imprime
el seed (`local-provider-admin@example.test`) y conservar el destino habitual
`/dashboard/`. Abrir después `/lugares/` y `/profesionales/`. El seed crea sólo
datos sintéticos locales, incluido un lugar con imagen y un profesional.

Recorrido propuesto: filtrar nombre/categoría/localidad y capacidad confirmada;
abrir ficha aprobada; comprobar imagen privada y fallback sin foto; editar un
borrador y conservar la versión aprobada; pausar la ficha y comprobar que listado,
detalle y contacto dejan de estar disponibles; cambiar de cuenta y comprobar
cierre. No abrir destinos externos de WhatsApp/correo en las pruebas.

```powershell
node scripts/local/runLocal.cjs provider-directory
node scripts/local/runLocal.cjs build
```

`provider-directory` ejecuta configuración, API y navegador de esta entrega,
sin repetir la suite general de parejas/API administrativa. `build` valida el
artefacto estático aislado; no despliega. El launcher detiene sus procesos y
registra limpieza/puertos. No usar CLI de enriquecimiento o seeds remotos para
esta reproducción.

## Pendientes verificables y capturas

El workflow `providers-private-candidate.yml` verifica exclusivamente pushes de
`feat/proveedores-directorio-privado` llamando al harness existente. No contiene
deploy, secretos ni cambios a las automatizaciones compartidas. Permite resolver
los límites de arranque observados en Windows sin usar el PR/Hosting preview como
mecanismo de validación ni relajar el gate obligatorio. El candidato corregido
pasó integralmente en `40226008315`, antes de abrir el PR de esta entrega.

- CI candidato `40225434395` pasó ownership y lint, pero falló dos tests de tooling
  por agregar un glob PNG al artefacto: el contrato exige nombres explícitos
  JSON/log. Se retiró el glob, conservando el manifiesto de capturas y los PNG
  locales; no se relajó el control. Los dos tests focales y la reejecución integral
  `40226008315` pasaron. Se conserva también la evidencia del fallo inicial.
- Registrar resultados finales, fallas e intentos sin reemplazar snapshots ni
  relajar assertions para presentar un PASS.
- Las nueve capturas sintéticas revisadas permanecen como evidencia local; no se
  incorporan perfiles, archivos privados ni imágenes sin revisar al artefacto CI.
- PR #2 integrado como `da0831b8`; checks de rama `40227333196`, PR `40227348740`
  y main `40228220351` PASS. El último incluye build/deploy live y
  `verify:hosting:production`. Recursos y recorrido productivo en el runbook;
  la evidencia remota no sustituye ni amplía el alcance de los tests locales.
- Producción: sesión habitual superadmin, cierre previo del gate, ambos listados/detalles,
  filtros de categoría/cobertura con vacío, versión aprobada conservada al editar,
  pausa sin tarjeta/detalle/contacto y reactivación con historial: PASS acotado.
  El dashboard y un borrador de invitación abrieron después del Hosting final;
  no se editaron ni publicaron invitaciones. Las fotos positivas y el rechazo de
  una cuenta común siguen pendientes por las limitaciones acordadas con el usuario.

El límite beta de consulta es explícito: hasta 5000 candidatos examinados, con
un documento adicional de detección por lote; al excederlo se devuelve error,
no resultados parciales ni totales inventados. Es un límite conocido del nuevo
flujo, no una prueba de escalabilidad. Se conservan además los límites históricos
del hito 1 (Q1, A/B de responsables futuros, importación, correo, pagos y auditoría
completa de accesibilidad); no son tests aprobados ni bloqueos automáticos de este
desarrollo.

## Rediseño de búsqueda de lugares — 2026-10-30

**Estado:** implementación y verificación local en
`codex/lugares-busqueda-mapa`, desde `origin/main` (`7fc2d2e8`). Esta sección no
acredita integración ni despliegue del rediseño. El alcance funcional y los
límites de la búsqueda corresponden a
[PROVIDER_DATA_MODEL §10.4.1](../architecture/PROVIDER_DATA_MODEL.md#1041-directorio-privado-de-versiones-aprobadas);
el mapa visual y sus owners se describen en
[LANDING_DASHBOARD_STYLING_MAP](../architecture/LANDING_DASHBOARD_STYLING_MAP.md).

El recorrido comienza con tipo de lugar, cantidad de invitados y zona/provincia
argentina. Los resultados se solicitan después de enviar el formulario; el
catálogo y el control de acceso se consultan antes. La nueva composición mantiene
`MarketplaceHeader` y `AppHeader`, y conserva los guards de las rutas, las
Functions de autorización y las lecturas de fotos aprobadas. No se modificó la
configuración de beta ni se utilizaron proveedores reales para probar el diseño.

### Evidencia focalizada

Runtime local: **Node 22.23.4**. Pruebas frontend offline con React/JSDOM y
colaboradores sintéticos; no corresponden a sesiones autenticadas productivas.

| Comprobación | Resultado y alcance |
| --- | --- |
| Modelo/presentación/hooks, gates de lugares/profesionales y nueva landing | **29/29 PASS**: `src/domain/providers/directoryModel.test.mjs`, `src/components/marketplace/providerDirectory.test.mjs`, `src/pages/lugares.test.mjs`, `src/pages/profesionales.test.mjs`, `src/components/venues/VenuesLanding.test.mjs`. Incluye carga diferida, invitados y región, filtros aplicados, reinicio de cursor, descarte de respuesta antigua, vacío/error/reintento, selección de mapa y ausencia de consultas/datos cuando el gate cierra. |
| Búsqueda backend de directorio | **17/17 PASS**: `functions/providersDirectory.test.mjs`. Incluye catálogo argentino, zonas GBA, país contradictorio, capacidad desconocida y mínimo confirmado, contenido aprobado y compatibilidad de cursores; detalles y límites en el contrato canónico. |
| Compilación de Functions | **PASS**: `functions/scripts/buildContracts.cjs`, con 82 copias verificadas. Lint focalizado de las seis fuentes backend afectadas: **PASS**. |
| Mapa: proyección, interacción y selección | **9/9 PASS**: `src/components/venues/venueMapModel.test.mjs`. Sin red: proyección Mercator, límites, tiles sólo del viewport, coordenadas aprobadas, agrupación por proximidad/zoom sin perder fichas ni inventar posiciones, zoom/teclado, selección externa, limpieza al cambiar de página y reintento. Un caso nuevo reprodujo el cierre indebido de la selección al medir/mostrar el mapa; se corrigió la coordinación con resize. La revisión móvil detectó intercepción entre pines próximos; el agrupamiento y las etiquetas sin área clickeable adicional corrigen ese caso. |
| Ownership de Functions | **PASS**: tres builds, **41/41** tests de ownership/paquetes/configuración y discovery CLI real (`default` 108 / `payments` 3 / `email` 3) del snapshot local; no es inventario remoto. Node 22.23.4 y CLI fijada 14.4.0. Evidencia `.local-isolation/ownership-evidence/run-eCXcNR/result.json`. |
| Recorrido CI de directorio | Fuente de `scripts/local/providerDirectory.browser.test.mjs` adaptada al formulario inicial y las etiquetas nuevas; sintaxis **PASS**. No se ejecutó nuevamente el escenario con emuladores en esta verificación focalizada. Conserva las comprobaciones de login, permisos, revisión aprobada, fotos, pausa y contacto; agrega navegación lista/mapa móvil y una ficha de capacidad desconocida excluida al indicar invitados. |

Comando frontend reproducible, desde el worktree con las dependencias existentes:

```powershell
& 'C:\Reservaeldia\.local-isolation\tool-cache\node-v22.23.4-win-x64\node.exe' --test `
  src/domain/providers/directoryModel.test.mjs `
  src/components/marketplace/providerDirectory.test.mjs `
  src/pages/lugares.test.mjs src/pages/profesionales.test.mjs `
  src/components/venues/VenuesLanding.test.mjs
```

### Fixture visual y límites de esta evidencia

La vista local está en `.local-isolation/venue-search-design/`, excluida de Git.
`server.cjs` compila la ruta, header, componentes, hook y estilos actuales, con
Firebase/Auth/directorio reemplazados por adapters sintéticos. Se reutilizan
Bootstrap y fuentes cacheados; el servidor escucha sólo en loopback. Incluye 20
fichas de prueba neutrales, 15 compatibles con 150 invitados (páginas 12 + 3),
variantes sin coordenadas y el catálogo de 28 regiones generado desde la fuente
backend. No inventa fotografías para las fichas. El hero usa arte editorial
ilustrativo del sitio, rotulado como tal.

El fixture no usa credenciales ni servicios Firebase. Su CSP permite únicamente
los tiles públicos de OpenStreetMap como imágenes externas para la revisión
manual del mapa; los datos de fichas, marcadores y selección permanecen locales.
Los tests automáticos del modelo y componente de mapa son offline y no descargan
tiles. La simulación de búsqueda del fixture acredita presentación e interacción,
no sustituye el comportamiento de la Function real ni una comprobación productiva.
`build-manifest.json` identifica las fuentes y hashes del bundle observado.

Recorrido manual en Chrome sobre ese fixture: portada sin fichas antes de
buscar; búsqueda de 150 invitados en toda Argentina; páginas de 12 y 3 fichas,
avance y regreso; búsqueda sin coincidencias en CABA; selección de una ficha
en el mapa y apertura del grupo de nueve ubicaciones próximas con sus enlaces
de detalle. Se revisaron escritorio (1536 × 695), tablet (1024 × 768) y móvil
(390 × 844 y 320 × 740), sin desborde horizontal. En móvil se comprobó el cambio
Lista/Mapa y la selección del grupo. El header conserva sus fuentes y componentes
sin cambios. Los enlaces de detalle se comprobaron en el DOM; el fixture no
sirve la pantalla real de detalle ni acredita ese recorrido productivo.

Capturas locales reales de la interfaz con datos sintéticos, dentro de
`.local-isolation/venue-search-design/`: `hero-desktop.jpg`,
`results-desktop.jpg`, `hero-mobile.jpg`, `results-mobile.jpg` y `map-mobile.jpg`.
No contienen proveedores reales ni se incorporan a Git. La vista local para
revisión escucha en `http://127.0.0.1:64337/lugares/` mientras el proceso de
preview permanezca activo.

El gate completo de CI y el recorrido con emuladores conservan sus
obligaciones antes de integrar/publicar; no se declaran aprobados por estos tests
focalizados. El gate de ownership sí fue ejecutado y pasó como se detalla arriba; su snapshot se conservó porque una fuente de test frontend cambió durante la ejecución, sin alterar el backend congelado verificado. La falta de una cuenta común productiva y la carga de fotos
productiva diferida siguen siendo las limitaciones ya acordadas con el usuario,
sin convertirse en bloqueos ni pruebas aprobadas de este rediseño.

**Precaución de integración comprobada:** el workflow de `main` publica Hosting.
La composición acotada vigente cubre únicamente el panel administrativo; cambios
de `/lugares/` caerían en el flujo de exportación completo. Antes de integrar se
debe preparar una publicación que preserve los cambios ajenos ya desplegados y
que aplique primero la Function de búsqueda compatible. No se deben publicar
Rules ni Functions ajenas a esta entrega para resolver esa diferencia.
