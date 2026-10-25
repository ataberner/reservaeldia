# Beta privada de proveedores — hito 1

Status: Testing Baseline.
Fecha: 2026-10-25. Alcance: etapas 1–3 locales; sin efectos remotos.

Contrato: [Provider Data Model §10](../architecture/PROVIDER_DATA_MODEL.md#10-beta-privada-v1-contrato-funcional-y-evolución-compatible).
Este informe registra evidencia, no redefine comportamiento.

Este baseline conserva el alcance local original. La integración y los despliegues
posteriores autorizados (PR #1 y #2), sus pruebas productivas y límites se registran
en el [runbook privado](../operations/PROVIDER_BETA_PRIVATE_DEPLOYMENT.md).
La [conexión privada del directorio](PROVIDER_PRIVATE_DIRECTORY.md) se adelantó
respecto del orden original; las afirmaciones de ausencia de efectos remotos al
final de este informe describen exclusivamente la ejecución inicial del hito 1.

## Base y dependencias

Worktree aislado `.local-isolation/proveedores-beta-base`, rama
`feat/proveedores-beta-base`, base `d3ba5c22`. El árbol principal estaba limpio.
`git merge-base --is-ancestor 2c4fe15a d3ba5c22` devolvió 0: la base contiene las
correcciones aprobadas y Node 22; el commit posterior registra el cierre de
tokens. No se copiaron cambios ajenos ni configuración personal al sandbox.
No se afirma que Git pruebe por sí mismo el estado remoto.

Los antecedentes [DRAFT_PROVIDER_AUTHORIZATION.md](DRAFT_PROVIDER_AUTHORIZATION.md)
y su runbook conservan sus límites: primer objeto históricamente no verificable,
A/B remotos diferidos y ausencia de certificación exhaustiva de drenaje/CI.
No se repitieron despliegues ni la remediación de tokens.

Se reutilizaron Auth/login y `usuarios`, `requireSuperAdmin`, el documento
canónico `proveedores`, su mapper/IDs/catálogo de 24 categorías y las validaciones
compatibles de imágenes. La diferencia implementada sobre esa base es el flujo
administrativo de edición/revisión/aprobación, autorización backend de beta y
entrega privada de media. No hay segundo registro de negocios, nuevo login ni
reescritura del pipeline de importación.

## Implementado

`/admin/proveedores/` usa la autorización superadmin existente y el control
backend `app_config/proveedoresBeta.panelEnabled`, cerrado por defecto. Incluye
listado paginado/búsqueda/filtros, ficha V1 por secciones, borradores incompletos,
fotos privadas, revisión y preview, aprobación, correcciones, pausa, reactivación,
archivo e historial. Logo y portada pueden ser independientes de la galería.
Guardar no reemplaza el contenido aprobado; aprobar no habilita entrega pública.

El modelo se conserva en `proveedores`; schema 2 sigue legible y se adopta schema 3
al modificar explícitamente. La primera mutación legacy compara además la versión
de Firestore. El pipeline de enriquecimiento no puede sobrescribir fichas adoptadas
por beta. La incorporación UI del importador corresponde a etapa 4.

Archivos principales para revisión:

- Contratos: `PROVIDER_DATA_MODEL.md`, `DATA_MODEL.md`, `SECURITY_CONTRACT.md`;
  índice, mapa e inventario CSS actualizados selectivamente.
- Backend: `functions/src/providers/betaModel.ts`, `betaService.ts`, `betaMedia.ts`,
  tipos/validación compatibles, exports y `functions/functionOwnership.json`.
- UI: `src/pages/admin/proveedores.jsx`, `src/components/admin/providers/`,
  `src/domain/providers/` y entrada acotada en `SiteManagementBoard.jsx`.
- Acceso/operación: Rules canónicas, `scripts/providers/enrichProviders.cjs`,
  harness `scripts/local/`, guard compartido y sus dos copias sincronizadas.
- Aplicación posterior: `deployment/provider-beta/` y runbook privado enlazado.

Commits funcionales locales: `dfad9974` (contrato), `7c45086e` (backend/permisos),
`6096df5f` (administración), `a6e17a42` (pruebas/capturas/artefactos). El cierre
documental posterior no modifica comportamiento. Inventario reproducible completo:
`git diff --name-only d3ba5c22..e0fa2b76`; commits: `git log --oneline d3ba5c22..e0fa2b76`.

## Verificación ejecutada

Runtime de cierre: **Node 22.23.4**. Los intentos exploratorios bajo 22.13.1 no se
usan para declarar cumplimiento del runtime. Emuladores usan exclusivamente
`demo-reservaeldia-local`, bucket demo, HOME vacío y red externa bloqueada.
El seed local habilita sólo panel administrativo sintético; no onboarding/directorio.

| Comprobación | Resultado y alcance |
| --- | --- |
| Modelo, media, contrato anterior y guard de enriquecimiento | 78/78 PASS: `node --test functions/providersBeta.test.mjs functions/providersBetaMedia.test.mjs functions/providersStage1.test.mjs scripts/providersEnrichment.test.mjs`. |
| Compatibilidad de importer, CSV y catálogo | 38/38 PASS: `node --test scripts/providersStage1.test.mjs scripts/providersCsv.test.mjs scripts/providersCategorySeed.test.mjs`. Fixtures/dry-run locales, sin Firebase remoto. |
| Estado/formulario, render administrativo y navegación existente | 13/13 PASS: `node --test src/domain/providers/adminForm.test.mjs src/components/admin/providers/providerAdmin.test.mjs src/components/appHeader/AppHeaderAdminNavigation.test.mjs`. Incluye logo independiente y referencias de fotos conservadas. |
| Artefacto acotado Rules | 3/3 PASS: `node --test scripts/local/providerBetaReleaseArtifact.test.cjs`. Hashes y bytes fuera de proveedores preservados; base desconocida/repetida rechazada. |
| Ownership de Functions | PASS: `npm.cmd --prefix functions run verify:ownership`; tres builds, 41/41 tests y discovery CLI local real: default 105, payments 3, email 3; sin duplicados/desconocidos. |
| Lint Functions | PASS: `npm.cmd --prefix functions run lint`; 312 archivos, 0 errores, 233 advertencias existentes; los tres módulos beta sin advertencias. |
| Configuración/aislamiento | 14/14 PASS después del ajuste exacto del RPC local de carga de Rules; contratos fuente y copias sincronizados. |
| Auth y borradores de parejas en emuladores | 19/19 PASS en `run-AdhVCZ`, sin skips. No modifica el flujo productivo de login/editor. |
| API beta y Rules canónicas en emuladores | 10/10 PASS en `run-AdhVCZ`, sin skips. |
| Candidato exacto Rules de despliegue en emuladores | 1/1 PASS suplementario; hashes del manifiesto comprobados, cuatro identidades denegadas y lectura de borrador propio de pareja conservada. Rules canónicas restauradas al finalizar. |
| Navegador real de proveedores | 1/1 PASS en `run-rRmBTi`: alta/edición/revisión/aprobación, fotos privadas y roles independientes, correcciones/pausa/reactivación/archivo, historial, denegaciones, login habitual y apertura de invitación de pareja. Capturas desktop 1440×1000 y mobile 390×844. |
| Editor de pareja listo (suplemento visual) | 1/1 PASS: login habitual, texto sintético hidratado por bridge de sólo lectura, fin del overlay de inicio y cierre del asistente mediante su control real; Chrome móvil con touch 390×844. |
| Build/export final | PASS con Node 22.23.4: `node scripts/local/runLocal.cjs build`, `run-mZWHdd`, exit 0. Compilación de Functions, Next de producción, export, finalización y release check completados; cleanup correcto y ocho puertos libres. Sólo compile/export con red externa bloqueada, sin validación remota. |

La suite API comprueba denegación anónima/común/claim admin/perfil adulterado,
gate cerrado incluso para superadmin, SDK denegado a fichas/subcolecciones/config/
archivos, DTO/preview sin información interna, validación de borradores y
publicación, revisión concreta, conservación de aprobación, concurrencia, filtros,
historial paginado, pausa/archivo, schema 2 real del mapper y primera escritura
legacy concurrente. Fotos: validación de bytes, carga/lectura autenticada, ausencia
de download tokens, referencias del negocio y conservación de imágenes aprobadas.

Evidencia local ignorada por Git: `.local-isolation/reports/run-AdhVCZ/`
(`integration.log`, `providers-api.log`, `providers-artifact-evidence.json`).
El suplemento Rules registra sus entradas/hashes en
`providers-artifact-guard-overlay.json`; no se atribuye al snapshot original sin
esa salvedad. Ownership conserva su copia en
`.local-isolation/ownership-MNEDNn/workspace`; lint registra runtime y resultados
en `.local-isolation/lint-evidence.json`. No se incorporan perfiles, logs sensibles,
cachés ni configuraciones personales al PR.

Intentos fallidos registrados: un primer navegador no inició Chrome dentro del
sandbox Windows; se comprobó el mismo ejecutable local con permisos de proceso.
En `run-AdhVCZ`, el helper de teclado usaba una combinación no admitida por
Puppeteer; se corrigió a eventos de tecla separados sin relajar criterios. El
primer gate ownership detectó una inserción fuera del orden del registro; se
corrigió el registro y se repitió el gate completo (41/41). La primera carga
suplementaria de Rules fue bloqueada antes de conectar por interpretar el sufijo
RPC como parte del ID de proyecto: se agregó sólo la excepción exacta de ruta,
puerto y proyecto demo con casos negativos. Ninguno de esos intentos es PASS.
En el recorrido UI se corrigieron también helpers de resize que provocaban una
recarga, clicks ocluidos por la barra sticky y esperas de respuestas asíncronas.
Los intentos se conservan bajo `run-rRmBTi/browser-attempt-*`; el test final centra
controles, comprueba hit-test y espera la versión concreta. No se relajaron
aserciones ni se modificó el editor para lograr el resultado.
El primer build/export (`run-VoMzYs`) se interrumpió por `ENOSPC`, sin completar
export. Se eliminaron sólo cachés verificadas de las sesiones descartables de
esta tarea, conservando código, dependencias y evidencia; los paths y el espacio
recuperado se registran en `cache-cleanup.json`. Ese intento no es un build PASS.

## Probar localmente

Desde este worktree, con los prerrequisitos de
[DEVELOPMENT_WORKFLOW](../operations/DEVELOPMENT_WORKFLOW.md) y Node 22.23.4:

```powershell
Set-Location 'C:\Reservaeldia\.local-isolation\proveedores-beta-base'
$env:Path = 'C:\Reservaeldia\.local-isolation\tool-cache\node-v22.23.4-win-x64;' + $env:Path
node --version
node scripts/local/runLocal.cjs providers-dev
```

La ruta de Node anterior es el runtime ya preparado en esta máquina. En otro
entorno, seleccionar el runtime de `.node-version` mediante la preparación
documentada; no reutilizar el Node 22.13.1 global detectado al inicio.

Abrir `http://localhost:3100/?auth=login`. Cuenta superadmin exclusivamente
sintética: `local-provider-admin@example.test`, clave `Local-provider-only-1!`.
Después del login habitual en dashboard, abrir `/admin/proveedores/` o entrar
desde Gestión del sitio. El seed genera cuentas/catálogo demo; las fichas se
crean desde la UI. No usar credenciales reales. Ctrl+C detiene los procesos
propios; el launcher confirma la limpieza y puertos liberados.

Recorrido: crear una ficha incompleta y guardar; completar nombre, categoría,
descripciones, localidad/provincia y contacto (más cobertura para profesional);
cargar logo/portada/galería; guardar, enviar y abrir la revisión; aprobar;
cambiar el borrador y comprobar la versión aprobada previa; pausar y archivar,
consultando el historial. Dos pestañas sobre la misma revisión permiten comprobar
el conflicto de guardado sin pisar contenido.

```powershell
node scripts/local/runLocal.cjs providers
node scripts/local/runLocal.cjs build
```

`providers` repite el recorrido automatizado demo; `build` valida export estático
aislado sin deploy. No usar `providers:enrich:dry` como prueba local: lee servicios
remotos y no pertenece a esta receta. El PR preparado está en
[PROVIDER_BETA_PR.md](../operations/PROVIDER_BETA_PR.md).

## Capturas del resultado real

Chrome local sobre emuladores; cuentas y negocio sintéticos, sin datos reales.
Los bloques de color son archivos de prueba para las fotos, no fotografías
inventadas de un negocio. Se inspeccionaron las capturas, además de las aserciones
automatizadas. El aviso azul inferior identifica el entorno demo.

- [Listado administrativo, escritorio](assets/provider-beta/01-list-desktop.png).
- [Ficha guardada, móvil](assets/provider-beta/03-form-mobile.png).
- [Revisión privada sin fotografías](assets/provider-beta/04-preview-desktop.png).
- [Revisión con portada, logo y galería privados](assets/provider-beta/11-photos-preview-desktop.png).
- [Invitación de casamiento abierta en el editor existente, móvil](assets/provider-beta/09-couple-editor-mobile.png).

Las once capturas completas y el JSON de checks quedan en
`.local-isolation/reports/run-rRmBTi/`; las seleccionadas arriba se conservan en
Git para revisión. `providers-browser-result.json` registra exit 0 y
`browser-final-test-overlay.json` registra la fuente de helpers probada sobre la
copia aislada. Los resultados de API/auth anteriores no se repitieron para
corregir helpers visuales.
`providers-couple-ready-{evidence,result}.json` registra por separado el suplemento
final del editor listo y el hash del helper incorporado al test principal. No se
presenta ese suplemento como una nueva ejecución de toda la suite administrativa.
El `result.json` de la sesión `dev` registra exit 3 por su detención manual después
de las pruebas; `controlled-dev-stop.json` documenta el cierre propio y los ocho
puertos libres. Los PASS de navegador y suplemento constan en sus `result.json`
separados. El build final tiene su propio resultado PASS en `run-mZWHdd`, junto a
`build-evidence.json` y `build-release-check.log`.
`provider-export-inspection.json` confirma la ruta administrativa exportada con
“Validando permisos”, `pageProps` vacío y sin datos de fichas. El escaneo de 87
archivos de texto no encontró ninguno de los siete marcadores sintéticos buscados;
esta comprobación acotada no se presenta como una auditoría general de secretos.
El build conserva avisos de caché ausente y `caniuse-lite` desactualizado; no se
actualizaron dependencias. Después se retiró únicamente su caché webpack propia,
con el proceso detenido: `webpack-cache-cleanup.json` registra el espacio
recuperado y el hash del HTML sin cambios; export, manifiestos y evidencia siguen
disponibles. La limpieza anterior de copias propias del emulador también consta
en `run-VoMzYs/emulator-cache-cleanup.json`.

## Límites

En la ejecución local inicial no se probaron producción, cuentas reales, correos
reales, pagos, importación remota ni apertura pública. Las etapas posteriores
seguían pendientes; la continuación autorizada adelantó el directorio privado,
según su informe enlazado al inicio. En este baseline no se ejecutó la suite global
`verify:local` ni se afirma auditoría
general; se ejecutan los gates y casos alcanzados por este cambio. Las advertencias
de lint históricas no equivalen a errores nuevos ni a una certificación del resto
del repositorio. Una prueba de foco por teclado no es una auditoría completa de
accesibilidad, y el navegador local no certifica todos los dispositivos móviles.

El baseline inicial del listado administraba registros legacy con un escaneo
acotado que podía mostrar una página sin coincidencias y ofrecer Siguiente.
Ese defecto y su corrección se registran en
[Búsqueda administrativa](PROVIDER_ADMIN_SEARCH.md), con pruebas y estado de despliegue
separados. No se promete búsqueda indexada a gran escala.
Los bytes privados no referenciados aún no se purgan
automáticamente. No hay nuevo mecanismo de invitaciones, asignación de responsables
o publicación pública en este hito.

La ejecución inicial dejó una propuesta privada sin push, PR, merge ni deploy.
El [runbook de continuación](../operations/PROVIDER_BETA_PRIVATE_DEPLOYMENT.md)
registra la autorización posterior, comparación de Rules, integración y
despliegues efectivamente realizados, con evidencia y límites separados.
