# Lint de Functions e integración — FASE 5B

Status: Operational Diagnostic Evidence.

Fecha: 2026-09-12. Alcance autorizado: lint de Functions, tooling local/CI,
pruebas pertinentes y documentación. No cambia permisos, Rules, handlers habilitados,
contratos normativos, migradores, runtime productivo ni decisiones Q1.
El [runbook](../operations/DEVELOPMENT_WORKFLOW.md#functions-lint-5b) conserva
los comandos y efectos vigentes. Este informe preserva las mediciones de 5B;
no reemplaza el [informe histórico 5A](LOCAL_VERIFICATION_5A.md) ni su evidencia.

## Preparación y líneas base medidas

Estado inicial: 103 archivos modificados/sin seguimiento, respaldados con SHA-256
en `.local-isolation/phase5b/before-hashes.json` y `before/`. Los cambios de fases
anteriores se comparan contra esa foto, no contra una base Git supuestamente limpia.

Preparación pública 5A ejecutada desde cero en
`.local-isolation/prepared-gVjS3B/workspace`, reporte
`.local-isolation/reports/run-FphM13/result.json`, salida 0. Los tres `npm ci`
usan lockfiles sin modificaciones, configuración personal vacía y cachés nuevas.
Se completan descargas explícitas de herramientas antes de cualquier suite.

Versiones efectivas: Node **20.19.5**, npm **10.8.2**, Java Temurin **21.0.8+9**,
Firebase CLI **14.4.0**, Firestore **1.19.8**, Storage Rules runtime **1.1.3**,
Puppeteer **24.14.0**, Chrome **138.0.7204.157**; ESLint **8.57.1**,
`@typescript-eslint/parser` / plugin **6.21.0**, TypeScript **5.3.3**.
Las herramientas portables usadas localmente son las verificadas en 5A; CI usa
las versiones declaradas por el reusable. Windows/Node 20 fueron ejecutados;
Linux/GitHub y Node 22 no se ejecutaron en esta fase. No hay dependencias nuevas ni cambios
de lockfile o de Node productivo. Persiste el aviso de instalación preexistente
`openai@7.5.0` / Node >=22; IA sigue deshabilitada en el recorrido demo y no se
certifica su compatibilidad productiva.

El lint inicial se ejecutó en `session-kk1nPI/workspace/functions` dentro de esa
copia, con la configuración y el script originales:

```sh
npm run lint -- --format json --output-file <reporte>
```

Sin fix ni caché; **salida real 1**, 2026-09-12T03:21:48.975Z. La sesión conserva
las fuentes y su manifest. `.local-isolation/phase5b/baseline.json` registra
directorio/comando/versiones, cada archivo analizado y sus mensajes; `baseline.log`
y `baseline-raw.json` conservan la salida original.

| Medición | Archivos | Errores | Advertencias |
| --- | ---: | ---: | ---: |
| Histórica, 2026-09-10; no es una ejecución 5B | 117 | 52 | 228 |
| Comando original, nueva ejecución 5B | 118 | 57 | 229 |
| Configuración/cobertura ampliada, antes de reparar código | 192 | 83 | 235 |
| Lint reparado | 192 | 0 | 233 |

La nueva base original tiene 3 errores de parser/proyecto, 37 `no-var-requires`,
6 `no-constant-condition`, 8 `no-useless-escape`, 2 `prefer-const` y 1
`no-irregular-whitespace`. Advertencias: 199 `no-explicit-any` y 30
`@typescript-eslint/no-unused-vars`. No se atribuyen las diferencias con la
medición histórica a esta fase.

La cobertura ampliada elimina los tres falsos errores de pertenencia a tsconfig
y detecta JavaScript antes omitido: 28 `no-undef`, 1 `no-regex-spaces` y 6 warnings
`no-unused-vars`. Los entornos de navegador corrigen 24 de esos `no-undef` sin
suprimir la regla. Los otros cuatro pertenecían al fragmento obsoleto `functions/index.js`:
mezclaba módulos y usaba `plantillaId`/`slug` fuera del handler. Se retiró por
decisión explícita del usuario; `functions/package.json` sigue usando `lib/index.js`.
Se retiran también sus dos warnings. El ejecutor y su test se incorporan al
inventario, por lo que el total final de archivos coincide con esa medición
intermedia aunque no sea el mismo conjunto.

Resultado final de warnings: **199 + 30 + 4 = 233**. El aumento de cuatro frente
a la nueva base original corresponde a JavaScript recién cubierto: un argumento
sin uso en `publicationPublishExecution.test.mjs`, un helper en
`designerAiCapabilityContract.cjs` y dos variables en `functionalAssociations.cjs`.
No se introducen warnings de TypeScript ni se convierte ningún error en warning.
No es «lint sin observaciones» ni eliminación de la deuda de tipado.

## Cobertura y excepciones justificadas

192 archivos: **113 `.ts`, 2 `.tsx`, 4 `.js`, 25 `.cjs`, 48 `.mjs`**. Se analizan
aplicación, archivos legados mantenidos de `src` (incluido `backupindex.ts`),
scripts operativos sin ejecutarlos, tests, helpers y `.eslintrc.js`. No se excluyen
archivos difíciles de analizar. El inventario descubre archivos/directorios nuevos.
TS de producción usa su proyecto `src`; TS externo usa parser sin proyecto.
JavaScript de Functions respeta CommonJS; MJS y fuentes canónicas ESM usan módulos.

Exclusiones: dependencias/metadatos/sesiones y `functions/lib`, generado por
`tsc`/sync. Se verificó individualmente el mapa de **24 destinos** de
`functions/shared`: cada exclusión corresponde a una fuente canónica analizada
por este mismo lint. Incluye los wrappers `eventDetailsConfig.js` y
`eventDetailsMigration.js`; no se asume que todo el directorio sea generado.
`lint-evidence.json.generated` enumera destinos, fuentes y generador.
Un archivo compartido no mapeado y un `src/lib` nuevo se prueban como mantenidos.
No se afirma lint de todo `shared/` ni de fuentes frontend fuera de ese mapa.

`syncTemplateContract.cjs` exporta su mapa sin ejecutar copias al importarlo;
su invocación de build sigue copiando los mismos artefactos. La preparación y
las sesiones reutilizan `lintScope.functionsSources` para llevar toda fuente
mantenida de Functions, evitando la selección cerrada de tests de 5A.

La excepción de `no-var-requires` se limita a rutas exactas de contratos CJS
sin declaraciones `.d.cts`, derivadas del mapa, y conserva severidad error.
`interop-probe.json` demuestra TS7016 al intentar el import TypeScript nativo
con el compilador fijado: agregar declaraciones `any` o ampliar el tsconfig
productivo no sería una reparación de tipos. Se mantienen seis excepciones por
línea para cargas síncronas diferidas de JSDOM (3), Puppeteer/Chromium (2) y
validación Admin desde el intérprete IA (1), con motivo local explícito.
Se eliminan tres supresiones antiguas innecesarias; una supresión sin uso ahora
es error. Los probes comprueban que un require nuevo de módulo nativo o CJS
no mapeado sigue fallando.

## Cambios y preservación de comportamiento

- Seis `while (true)` pasan a `for (;;)`, conservando cuerpos, cursores, breaks,
  validaciones y efectos; dos bindings nunca reasignados pasan a `const`.
- Se elimina un BOM incrustado y ocho escapes inútiles. La regex del test de
  render expresa dos espacios con `{2}` y mantiene el mismo patrón.
- Se declaran los entornos reales de navegador en el test Chromium y en la
  autoridad `shared/firebaseEnvironment.cjs`; sus dos copias se sincronizan
  únicamente con ese comentario, sin cambios de lógica.
- Se conservan todas las cargas diferidas y los exports CommonJS. No se agregan
  `any`, casts ni supresiones generales para obtener verde.

`runtime-equivalence.json` compara los valores de literales de los cuatro
generadores afectados y confirma igualdad. Ejecuta el generador de motion de
ambas fuentes mediante el mismo TypeScript: HTML **idéntico byte a byte**,
35516 bytes, SHA-256
`e0fe9c5daa6debfbb7c395d0b3d716914b14421233cc01b9ccb133c9c48a7b42`.
No afirma ejecutar todos los handlers de analytics/pagos/catalog.

La comprobación focalizada conservó dos fallas del fixture nuevo: `run-YukpP1`
(directorio temporal inexistente) y `run-RtiDB8` (faltaba el package.json
CommonJS del fixture). Ambos terminaron 1, detuvieron procesos propios y dejaron
las regresiones posteriores sin ejecutar. Se reparó la construcción del fixture.

`run-RBddEF` pasó compilación, tooling **7/7** y regresiones focalizadas **42/42**
(divisores, SVG, configuración de triggers, limpieza legada y geometría/assets).
Compatibilidad pasó **74/75**: el test de activación agrupada comprobaba estado
tras sólo 80 ms, mientras el runtime atraviesa varios animation frames.
El HTML idéntico descarta un cambio de ese runtime por el arreglo de escapes.
Se cambia exclusivamente la espera del test a observar la clase esperada con
MutationObserver y máximo 2 s; conserva todas las aserciones y cierra JSDOM
también ante falla. No hay retry automático de suites.

## Recorrido integrado y control negativo

La etapa propia `lint` precede tooling, configuración, sync/compile y emuladores.
Reutiliza `functions/scripts/lint.cjs`, el mismo script de `npm run lint`.
Registra código, cantidad de archivos, errores/warnings, `lint.log` y
`lint-evidence.json`; la salida visible incluye warnings completos.
El reporte contiene SHA-256 de cada fuente y configuración, diagnósticos sin
copiar el texto completo de los archivos, y el mapa de exclusiones.
Reporte ausente, alcance vacío o resultado inconsistente nunca producen éxito.

El harness negativo 5A conserva sus controles de Rules, interrupción, destino
inválido y CLI ausente. Añade un `.ts` nuevo sólo en la copia, con `debugger`
(regla activa en error), verifica `tsc --noEmit` y exige error integrado antes de
tooling/compilación/emuladores, diagnóstico del archivo y dependencia simulada
no alcanzada. No altera Rules o fuentes del árbol principal.

Preparación final limpia: `.local-isolation/prepared-eSAepI/workspace`,
`run-a7Yfgn`, salida 0, 2026-09-12T03:48:53.201Z. Durante esa preparación se
incorporó la corrección acotada del test de motion; posteriormente se actualizaron
los tres scripts de lint mediante copia exacta para corregir el modo CommonJS
de fuentes canónicas externas al directorio de configuración. Se preservan
`final-preparation-update.json` y `cjs-preparation-update.json` con hashes y motivo.
Una preparación nueva desde el repositorio final ya incluye todos esos archivos.
No se reinstalaron ni modificaron las dependencias del árbol principal.

El primer integral `run-k8JhS1` / `session-oP2eBU` terminó 0 a
2026-09-12T03:56:49.814Z, con 1474/1474 y limpieza. La revisión posterior comprobó
que los CJS canónicos heredaban el parser ESM al estar fuera de `functions/`.
Se corrige reutilizando la misma configuración de reglas con modo script para
esas fuentes; un probe de sintaxis CJS válida distingue error de regla `no-with`
de un error de parser ESM. No se repiten ni duplican reglas, suites o aislamiento.
Se ejecutó otro integral completo desde fuentes actualizadas; el anterior permanece.

**Integral final: `run-zOI5Ou` / `session-8Bm9o6`, salida real npm 0**,
2026-09-12T04:06:50.6526386Z. Reporte original:
`.local-isolation/prepared-eSAepI/workspace/.local-isolation/reports/run-zOI5Ou/`.
`verify-command.json` registra comando/directorio/timestamps/código; `verify-local.log`
conserva la salida completa, incluidas advertencias.

| Etapa | Resultado final |
| --- | --- |
| Lint | 192 archivos, 0 errores, 233 warnings, salida 0 |
| Tooling/cobertura/grafo estático | 7/7 |
| Configuración/inicialización | 12/12 |
| Sync y compilación Functions | Salida 0 en ambas |
| Backend | 7/7 |
| Compatibilidad productiva, transporte externo bloqueado | 75/75 |
| Rules/countdown | 1370/1370 |
| Integración / navegador / offline | 1/1 cada una; seed salida 0 |
| Limpieza | Procesos propios cerrados y ocho puertos libres |

Total **1474/1474**, sin tests omitidos/cancelados. Rules mantiene acceptance
**1054/1054**, characterization **273/273**, proposal **2/12 coincidencias**
y **10 diferencias Q1**, sin errores de infraestructura. Los 31 checks countdown
conservan la clasificación previa de comportamiento/estáticos/mixtos.
El lint es análisis estático y no se suma como 192 pruebas de comportamiento.

**Harness negativo: salida npm 0**, 2026-09-12T04:16:54.9816596Z, copia exterior
`session-hsEl9w`. Cada escenario invoca el mismo launcher integrado y comprueba
su código real contra el reporte, ausencia de la etapa dependiente simulada y
los ocho puertos libres.

| Escenario | Reporte | Código integrado | Evidencia |
| --- | --- | ---: | --- |
| Infracción en TypeScript nuevo | `run-PpNVqq` | 1 | `tsc --noEmit` 0; lint analiza 193 archivos, 1 error `no-debugger` en línea 2, 233 warnings; todas las etapas posteriores sin ejecutar |
| Acceso cruzado deliberado | `run-3r8uvS` | 1 | 1339 casos Rules ejecutados, 5 fallas acceptance, ninguna de infraestructura; integración sin ejecutar |
| Interrupción durante compilación | `run-oeBNuA` | 130 | Handler real de interrupción mediante evento SIGINT del driver; emuladores sin ejecutar, limpieza confirmada |
| Destino demo inválido | `run-heTo8l` | 2 | Rechazo antes de copy, sin servicios ni fallback remoto |
| CLI local ausente | `run-JtdYQh` | 2 | Retirado sólo el enlace de la copia; rechazo antes de copy, sin instalación/búsqueda global/fallback |

El acceso cruzado hace fallar `profile-cross-get`, `profile-unfiltered-list`,
`4b2a-profile-admin-foreign-get`, `4b2a-profile-superclaim-foreign-get` y
`4b2a-profile-role-foreign-get`; characterization conserva 273 coincidencias y
Q1 sus 10 diferencias. No se cambian expectativas para obtener ese resultado.
La prueba de interrupción no demuestra entrega de señales POSIX ni cancelación
remota de GitHub. La consulta CIM posterior encontró **0 procesos Node/Java/Chrome**
con referencias a las dos copias 5B; una comprobación independiente confirmó
los ocho puertos libres (`final-process-check.json`, `final-ports.json`).

Evidencia seleccionada en `.local-isolation/phase5b/evidence/`: `normal`,
`first-integral`, los tres intentos focalizados conservados y los cinco escenarios
negativos. Sólo se copian `result.json`, los artefactos sintéticos de `Evidence`
y logs explícitos de etapas; no workspaces, perfiles, credenciales ni bases.
Resumen en `.local-isolation/phase5b/negative-controls.json`; typecheck/sync
del probe en `lint-probe-typecheck.log` y `lint-probe-sync.log`. Los originales
permanecen en sus sesiones detenidas.

Reproducción: desde la raíz final, con Node/Java fijados, `npm run local:prepare`;
desde el workspace que imprime, `npm run verify:local` y, una vez terminado,
`npm run test:local:negative`. Para lint individual: `npm --prefix functions run lint`
desde ese workspace. Cada repetición crea evidencia nueva y conserva los fallos.

## CI y estados residuales

Se preservan las dependencias explícitas de Hosting:

```text
verification (local-verification.yml / verify:local) -> build_and_preview
verification (local-verification.yml / verify:local) -> build_and_deploy
```

El reusable no duplica lint en YAML: prepara las herramientas y consume el
comando canónico. Sólo amplía la selección de artefactos con `lint.log` y
`lint-evidence.json`. Mantiene verificación sin secretos, permisos mínimos,
PRs de forks y la restricción actual de preview a PRs del mismo repositorio.

Validación local: parsing/grafo/permisos mediante el tooling integrado y
**actionlint 1.7.7, salida 0** en los tres workflows (`ci-static.json`,
`actionlint.log`); shellcheck/pyflakes no ejecutados. Sólo se modificó la selección
de artefactos del reusable; las dependencias y destinos Hosting permanecen.

**CI preparada, pendiente de validación remota.** El grafo y los controles
locales no prueban bloqueo efectivo en GitHub; branch protection/required checks
no consultados ni modificados. No se ejecutaron workflows remotos, Hosting,
deploys, commits, pushes o migraciones. F13 permanece abierto y parcialmente
mitigado; faltan otras condiciones de calidad y evidencia remota. F10/F11/F12,
F15/watch y Q1-A/B/C conservan sus estados. Los probes Q1 siguen separados de
acceptance/characterization; un verde puede conservar permisos riesgosos pendientes.

## Archivos y evidencia de preservación

Las rutas abreviadas de código de la tabla son relativas a `functions/src/`.

| Archivos afectados | Motivo |
| --- | --- |
| `functions/.eslintrc.js`, `functions/package.json`, `functions/scripts/lint.cjs`, `lintScope.cjs`, `lint.test.cjs` | Configuración compatible, entrada única, descubrimiento de fuentes/evidencia y pruebas reales de cobertura/parser |
| `functions/scripts/syncTemplateContract.cjs` | Expone el mapa existente sin copiar durante lint; CLI build conserva la sincronización |
| `functions/index.js` | Retiro del fragmento obsoleto autorizado expresamente por el usuario |
| `analytics/service.ts`, `iconCatalog/triggers.ts`, `payments/publicationPayments.ts`, `decorCatalog/repository.ts`, `utils/sectionBackground.ts` | Cambios mecánicos de bucles/bindings/BOM; sin cambios de validaciones o efectos |
| `utils/generarHTMLDesdeSecciones.ts`, `generarMotionEffectsRuntime.ts`, `mobileSmartLayout/scriptTemplate.ts`, `stacking.ts` | Escapes inútiles; valores de literales y runtime motion equivalentes |
| `countdownPresets/service.ts`, `frameAssetValidation.ts`, `countdownObservability/telemetry.ts`, `designerAi/service.ts`, `src/index.ts`, `payments/publishedShareImageRenderer.ts` | Excepciones locales justificadas de carga diferida y retiro de supresiones innecesarias |
| `functions/invitationRuntimeReadiness.test.mjs`, `renderContractCompatibility.test.mjs`, `motionEffectsRenderCompatibility.test.mjs` | Entorno browser, regex equivalente y espera observable/limpieza del test de activación |
| `shared/firebaseEnvironment.cjs` y sus dos copias mapeadas | Sólo declaración de entorno browser para lint; copias idénticas a su autoridad |
| `scripts/local/session.cjs`, `runLocal.cjs`, `evidence.cjs`, `ciChecks.cjs`, `tooling.test.mjs`, `verifyNegative.cjs` | Copia completa, etapa obligatoria, diagnóstico, reportes y negativos reutilizando el aislamiento |
| `.github/workflows/local-verification.yml` | Conserva explícitamente log y reporte de lint |
| Runbook, índice, F13 y este informe | Comandos/cobertura/diagnóstico, evidencia y estados locales/remotos separados |

`preservation.json` confirma **76/103 archivos iniciales idénticos** y los otros
27 con cambios de 5B dentro del alcance, sin cambios inesperados. La lista completa
de 39 archivos afectados incluye además archivos antes limpios y cuatro nuevos.
`final-source-check.json` compara **33 fuentes/configuraciones de implementación**
con el manifest de la sesión final, sin faltantes ni diferencias; excluye documentación,
el fragmento retirado y la copia compilada, identificados aparte.
Los tres lockfiles, tsconfig productivo, Rules, casos Q1 y el informe histórico
5A permanecen intactos. `git diff --check` pasó y `doc-links.json` no encontró
referencias locales rotas. No se ejecutó sync global ni compilación en el árbol
principal; sólo se actualizaron las dos copias del comentario canónico señalado.
