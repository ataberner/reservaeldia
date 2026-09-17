# Verificación integrada local y preparación de CI — FASE 5A

Status: Operational Diagnostic Evidence.

Alcance: implementación y evidencia de 5A, 2026-09-11. Complementa el
[runbook canónico](../operations/DEVELOPMENT_WORKFLOW.md#verification-5a);
no define permisos, no acepta Q1 ni reemplaza las líneas base de 4A/4B1/4B2A/4B2B.
Actualizar este registro cuando se repita/cambie el control; conservar los
intentos fallidos y distinguir verificación local, análisis de CI y ejecución remota.

## Implementación y preparación comprobadas

`verify:local` añade el modo `verify` al lanzador existente. Reutiliza una sola
sesión, sincronización/compilación y arranque demo; ejecuta Rules antes de
integración. No cambia Rules, permisos, handlers ni expectativas normativas.
Los controles de configuración de `test:local:unit` se ejecutan una sola vez.
El [runbook](../operations/DEVELOPMENT_WORKFLOW.md#verification-5a) enumera cada
etapa, efectos, códigos, tiempos máximos, evidencias y exclusiones.

Preparación comprobada desde cero en
`.local-isolation/prepared-6h7ioD/workspace`, con los tres `npm ci` y sin cachés
previas, perfiles ni credenciales. Reporte:
`.local-isolation/reports/run-U36EYz/result.json`, salida 0,
2026-09-11T20:36:39.167Z. Se conservaron logs separados de instalaciones y descargas.
Las actualizaciones posteriores de scripts se copiaron con el mismo
`copyWorkspace` antes de crear cada nueva sesión de verificación; no se copiaron
compilados ni cachés Next. Las dependencias instaladas quedaron en esa copia.

| Herramienta | Identidad comprobada |
| --- | --- |
| Sistema de ejecución local | Windows; Linux/runner GitHub no ejecutados |
| Node / npm | 20.19.5 / 10.8.2, distribución oficial portable; ZIP verificado con SHA-256 oficial |
| Java | Temurin 21.0.8+9; ZIP verificado con SHA-256 oficial |
| CLI | firebase-tools 14.4.0 local, lockfile propio y transitivas compatibles fijadas |
| Emuladores | Firestore 1.19.8, Storage Rules runtime 1.1.3; Auth/Functions de la CLI |
| Navegador | Chrome 138.0.7204.157, Puppeteer 24.14.0 del lockfile raíz |
| Paquetes | Lockfiles raíz y Functions preservados; tercer lockfile en scripts/local/tools |

La primera resolución pública del lockfile fue impedida por la restricción de
red del entorno (`EACCES`); quedó en
`.local-isolation/phase5a/lock-tools/install.log`. La preparación pública se
repitió explícitamente con permiso de red; no hubo retry automático de tests.
Al resolver CLI 14.4.0 se detectaron transitivas recientes que exigen Node 22;
los overrides de herramientas conservan versiones compatibles sin cambiar el
runtime ni dependencias de producción. La instalación de Functions conserva un
aviso preexistente: OpenAI 7.5.0 exige Node >=22. El handler IA permanece
deshabilitado; no se afirma compatibilidad productiva completa de ese paquete.

## Ejecuciones locales

Primer intento integral: `run-O5U5FO`, sesión `session-fl7Ok9` dentro de la copia
preparada. Falló con **código del launcher 3**, infraestructura, a
2026-09-11T20:46:01.592Z. Pasaron tooling 5, configuración 12, backend 7,
compatibilidad 75, Rules/countdown 1370 e integración 1. El test de navegador
agotó 150 s y su supervisor 180 s durante el arranque/compilación en frío; Next
registró startup 27 s, compilación 76 s y respuestas 200. La evidencia no prueba
que las aserciones de navegador terminaran. Offline quedó sin ejecutar.
La limpieza confirmó todos los procesos propios cerrados y los ocho puertos
libres. Se conservaron `browser.log`, `next.log`, Rules y `result.json`.

Cambio del tooling motivado por esa evidencia: plazo del test de navegador
300 s, supervisor 360 s; misma prueba y aserciones, sin retries. Se inició una
sesión nueva completa.

Segundo intento: `run-gC1OJp`, `session-xXp3f6`, código 3 a
2026-09-11T20:50:05.856Z. Los 31 checks countdown pasaron, pero el hook de Rules
agotó un sondeo de wrapper deshabilitado (`TimeoutError`, código 23). El reporte
declara **0/1339 casos ejecutados**, no 1339 denegaciones; las fallas TAP son
`hookFailed`. Integración quedó sin ejecutar y la limpieza confirmó ocho puertos
libres. Se amplió ese sondeo de 10 a 30 s y se añadió el nombre del paso/endpoint
al diagnóstico existente, sin cambiar aserciones ni repetir solicitudes. Los
resultados posteriores se registran por separado.

Recorrido completo final: **`run-XP3c8h`**, **`session-33U3r0`**, salida **0**,
2026-09-11T20:57:11.545Z. Evidencia bajo
`.local-isolation/prepared-6h7ioD/workspace/.local-isolation/reports/run-XP3c8h/`.

| Etapa ejecutada | Resultado |
| --- | --- |
| Tooling y grafo CI | 5/5 |
| Configuración/inicialización | 12/12 |
| Sincronización y TypeScript Functions | Ambas salidas 0, compilados temporales de fuentes actuales |
| Backend/configuración/render | 7/7 |
| Compatibilidad productiva con transporte bloqueado | 75/75 |
| Rules y countdown | 1370/1370 |
| Integración SDK/callable + seed | 1/1 y seed salida 0 |
| Navegador desktop/mobile, recarga y CSP | 1/1 |
| Emuladores ausentes sin fallback | 1/1 |
| Limpieza final | Procesos propios cerrados y ocho puertos libres |

Total: **1472 pruebas, 1472 aprobadas, 0 fallidas, 0 omitidas/canceladas**.
Rules conserva 1339 casos: acceptance **1054/1054**, characterization **273/273**,
proposal **2/12 coincidencias**, con **10 diferencias Q1 pendientes**, cero
errores de infraestructura. Los otros 31 son los checks countdown existentes,
con sus categorías de comportamiento/estáticos/mixtos. Las caracterizaciones
verdes no convierten permisos residuales en política aprobada.

`source-manifest.json` registra SHA-256 de las fuentes copiadas y lockfiles;
`rules-source.json` liga los hashes de Rules a la configuración y readiness de
esa sesión. Los reportes conservan timestamps, versiones, etapas, TAP y limpieza.
Se comprobó adicionalmente la salida real **2** de `npm run verify:local` ante
`GCLOUD_PROJECT=demo-invalid-5a`, antes de crear sesión; evidencia
`.local-isolation/phase5a/invalid-npm.json` / `invalid-npm.log`. No afectó la
verificación activa ni realizó fallback.

La consulta de procesos del sistema confirmó cero procesos asociados a ambas
sesiones fallidas previas (`failed-session-process-check.json` en el directorio
de evidencia 5A). El primer intento de esa consulta fue denegado por el sandbox;
se repitió sólo la lectura con el permiso necesario, sin detener procesos ajenos.

### Control negativo ejecutado

`npm run test:local:negative` terminó con salida **0** después de exigir las
fallas esperadas del mismo ejecutor integrado. Copia exterior `session-6K1S1V`;
reporte original `negative-controls.json` dentro de esa sesión. Cada escenario
comprobó el código real del proceso contra `result.json`, la ausencia del archivo
de etapa dependiente simulada y los ocho puertos libres.

| Escenario | Reporte | Código integrado | Observación |
| --- | --- | ---: | --- |
| Lectura cruzada deliberada de perfiles | run-NLiVbe | 1 | 1339 casos ejecutados; 5 fallas acceptance, 0 infraestructura; integración no ejecutada; limpieza pasó |
| Interrupción durante compilación | run-brsBEQ | 130 | Evento SIGINT emitido por el driver local al observar la etapa compile; ejecuta el handler real y detiene el compilador; emuladores no ejecutados |
| Proyecto demo incompatible | run-KlEoox | 2 | Prerrequisito rechazado antes de copy; sin servicios/fallback |
| CLI local ausente | run-BzZjHu | 2 | Retirado sólo el enlace de dependencias de la copia; sin búsqueda global, descarga ni servicios |

La alteración cambió exclusivamente en la copia la lectura de `usuarios/{uid}`
de owner a autenticado. Fallaron `profile-cross-get`, `profile-unfiltered-list`,
`4b2a-profile-admin-foreign-get`, `4b2a-profile-superclaim-foreign-get` y
`4b2a-profile-role-foreign-get`: esperado deny, observado allow. Las 273
caracterizaciones y los 31 checks countdown pasaron; Q1 conservó sus 10
diferencias. No se alteró ninguna expectativa para producir ese resultado.
La mutación permanece únicamente en la sesión interna detenida como evidencia.

Fin del control de regresión: 2026-09-11T21:01:44.254Z; último prerrequisito:
21:02:22.810Z. La consulta final del sistema a 21:03:13Z encontró **0 procesos**
asociados a `prepared-6h7ioD` (`final-process-check.json`). La interrupción comprueba
la ruta del handler y la limpieza en Windows mediante emisión controlada del
evento; no pretende probar entrega de señales POSIX ni cancelación de GitHub.

Selección local consolidada, sin perfiles ni bases:
`.local-isolation/phase5a/evidence/{normal,cold-browser-failure,cold-wrapper-failure,cross-owner-regression,interrupted-compilation,invalid-destination,missing-cli}/`.
Cada directorio conserva `result.json`, logs de etapas y los reportes sintéticos
disponibles. Resumen negativo adicional en
`.local-isolation/phase5a/negative-controls.json`. Los originales también se
conservan; no se borraron sesiones ni se publicaron artefactos durante esta tarea.

## CI preparada y validación estática

Los workflows `firebase-hosting-pull-request.yml` y `firebase-hosting-merge.yml`
declaran, respectivamente:

```text
verification (local-verification.yml) -> build_and_preview
verification (local-verification.yml) -> build_and_deploy
```

El reusable prepara herramientas públicas y una copia descartable, luego ejecuta
el mismo `verify:local`. Verificación usa `contents: read`, sin secrets ni
credenciales persistidas por checkout. Los permisos de escritura de Hosting
quedan en sus jobs dependientes. El PR mantiene la condición de repositorio
propio para preview, mientras el gate también alcanza forks. No hay filtros de
rutas, `pull_request_target` ni `continue-on-error`. No se cambiaron destinos.

Comprobado localmente: parsing YAML y aserciones de estructura/grafo/permisos
dentro de `tooling.test.mjs`, con negativos de dependencia ausente/cíclica,
secretos heredados y etapa omitida. Validación adicional con **actionlint 1.7.7**,
binario oficial verificado por SHA-256, salida 0 para los tres workflows;
shellcheck/pyflakes no ejecutados. Evidencia:
`.local-isolation/phase5a/ci-static.json` y `actionlint.log`.

Esto comprueba configuración estática y simulación local de dependencia; no
comprueba bloqueo efectivo de GitHub. **CI preparada, pendiente de validación
remota**. Branch protection y required checks no fueron consultados ni modificados.
No se ejecutaron workflows remotos, Hosting, deploys, commits o pushes.

## Estados y límites

F13 permanece **abierto, parcialmente mitigado**: se incorpora cobertura focalizada
y propagación de fallas; no se repara lint ni se certifica calidad completa.
La línea base de lint del 2026-09-10 se preserva, sin nueva ejecución global.
El gate no incluye build/export productivo Next, todos los tests del repositorio,
handlers bloqueados, migradores, watch ni configuración/despliegue remotos.

F10/F11 siguen abiertos; F12 conserva su alcance parcial de 4A y F15 sigue abierto.
Q1-A/B/C siguen pendientes. Acceptance evalúa las obligaciones ya aceptadas;
characterization puede mantener permisos riesgosos; proposal sólo registra
diferencias. Un verde no aprueba todos los accesos permitidos ni implementa Q1.

## Archivos de esta fase y preservación

| Archivos | Motivo de 5A |
| --- | --- |
| `package.json` | Entradas `local:prepare`, `verify:local`, `test:local:negative`; conserva scripts preexistentes |
| `scripts/local/runLocal.cjs`, `session.cjs` | Integra ejecutores existentes, valida herramientas exactas, comparte copia de fuentes, registra evidencia y controla detención |
| `scripts/local/processes.cjs`, `evidence.cjs` | Dueño común de procesos/plazos y resultados/selección de evidencia; sin implementación paralela de tests o aislamiento |
| `scripts/local/prepareLocal.cjs`, `tools/package.json`, `tools/package-lock.json` | Instalación pública explícita en copia descartable y fijación de CLI/transitivas/parser YAML |
| `scripts/local/ciChecks.cjs`, `tooling.test.mjs` | Validación estática de CI/grafo/permisos y negativos de propagación, timeout, limpieza y evidencia incompleta |
| `scripts/local/verifyNegative.cjs` | Demostración opt-in usando el mismo launcher, una regresión de Rules en copia y controles de interrupción/prerrequisitos |
| `scripts/local/browser.test.mjs`, `rules.test.mjs` | Plazos de arranque en frío y diagnóstico de preflight, respaldados por los intentos registrados; expectativas normativas intactas |
| `.github/workflows/local-verification.yml` | Workflow reutilizable sin secretos, herramientas explícitas y upload seleccionado |
| `.github/workflows/firebase-hosting-merge.yml`, `firebase-hosting-pull-request.yml` | Dependencia obligatoria antes de Hosting y permisos de escritura restringidos a sus jobs |
| `DEVELOPMENT_WORKFLOW.md`, `DOCUMENTATION_INDEX.md`, `SYSTEM_FRAGILITY_MAP.md`, este informe | Preparación/comando/diagnóstico, navegación, estado parcial de F13 y evidencia local/remota separadas |

El estado inicial incluyó 91 archivos modificados o sin seguimiento, preservados
por copia y SHA-256 en `.local-isolation/phase5a/before*`. Las modificaciones 5A
en archivos preexistentes se comparan contra esa foto, no contra una supuesta
base Git limpia. No se modificaron Rules, el inventario de casos, archivos de
aplicación/Functions, sus compilados/copias compartidas, lockfiles raíz/Functions,
configuración productiva, migradores ni las líneas base históricas.
`preservation.json` confirma **83/91 archivos iniciales idénticos** y exactamente
ocho archivos preexistentes modificados por 5A dentro del alcance, sin cambios
inesperados. Los dos workflows existentes se compararon además con sus copias
iniciales. `git diff --check` y la comprobación de enlaces locales de las cuatro
autoridades documentales terminaron sin hallazgos.
