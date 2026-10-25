# Directorio privado aprobado — verificación

Status: Testing Baseline.
Fecha: 2026-10-25. Implementación local; comprobaciones pendientes señaladas.

La autoridad funcional es
[PROVIDER_DATA_MODEL §10](../architecture/PROVIDER_DATA_MODEL.md#10-beta-privada-v1-contrato-funcional-y-evolución-compatible).
Este documento registra evidencia y reproducción, sin duplicar reglas de negocio
ni autorizar operación remota. El
[runbook privado](../operations/PROVIDER_BETA_PRIVATE_DEPLOYMENT.md) distingue el
backend administrativo ya aplicado de la segunda entrega todavía pendiente.

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
| Navegador real desktop/móvil | **PENDIENTE** tras intentos preservados: `run-B7ladc` agotó navegación durante compilación inicial; `run-8e1hf4` llegó al listado autenticado y falló su helper de hit-test durante scroll suave; `run-fSciWA` agotó discovery antes de UI. Se corrigió sólo el helper para scroll instantáneo y espera de hit-test; el replay sobre snapshot compilado está en curso. No se cambiaron límites ni assertions de negocio. |
| Ownership de Functions | **Verificación por componentes completada**, sin atribuir PASS al script integral fallido. Primer intento: core TypeScript excedió 180000 ms. Segundo snapshot `ownership-xuWCJZ`: tres builds PASS; ejecución inicial 39/41 por dos startups de subprocess que agotaron 30 s. Repetición intacta sobre ese mismo snapshot: 41/41 PASS y CLI discovery real default 107/payments 3/email 3 PASS. Quince hashes snapshot↔fuente coinciden; `component-evidence.json` conserva todos los resultados. CI volverá a ejecutar el gate integral antes del merge. |
| Build/export del nuevo directorio | **PENDIENTE**. El build anterior del panel no verifica esta entrega. |
| Deploy y recorrido remoto de las dos Functions nuevas | **PENDIENTE**. No confundir con el panel de la entrega 1. |

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
mecanismo de validación ni relajar el gate obligatorio. El resultado CI aún no
está disponible al registrar esta sección.

- Terminar navegador real y revisar capturas de escritorio/móvil, permisos,
  búsqueda, ficha, imágenes, pausa y regresión representativa de parejas.
- Terminar ownership; ejecutar build/export y comprobar shells sin datos privados.
- Registrar resultados finales, fallas e intentos sin reemplazar snapshots ni
  relajar assertions para presentar un PASS.
- Incorporar sólo capturas sintéticas revisadas; todavía no hay capturas de esta
  entrega declaradas como evidencia final en Git.
- Completar PR/Hosting/aplicación y recorrido remoto de la segunda entrega bajo
  el runbook. Mantener público/registro cerrados.

El límite beta de consulta es explícito: hasta 5000 candidatos examinados, con
un documento adicional de detección por lote; al excederlo se devuelve error,
no resultados parciales ni totales inventados. Es un límite conocido del nuevo
flujo, no una prueba de escalabilidad. Se conservan además los límites históricos
del hito 1 (Q1, A/B de responsables futuros, importación, correo, pagos y auditoría
completa de accesibilidad); no son tests aprobados ni bloqueos automáticos de este
desarrollo.
