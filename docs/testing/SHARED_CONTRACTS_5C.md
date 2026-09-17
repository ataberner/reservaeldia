# Sincronización de contratos y watch — FASE 5C

Status: Operational Diagnostic Evidence.

Fecha: 2026-09-12. Alcance: mecanismo local de copias, watch, checks, pruebas,
integración y documentación. No cambia contratos de negocio, permisos, Rules,
handlers habilitados, migradores o decisiones Q1. Los informes
[5A](LOCAL_VERIFICATION_5A.md) y [5B](FUNCTIONS_LINT_5B.md) conservan sus líneas
base históricas. El [runbook vigente](../operations/DEVELOPMENT_WORKFLOW.md#shared-contracts-5c)
es la entrada para comandos, efectos, árboles y reinicios.

## Implementación y alcance de la autoridad

`functions/scripts/syncTemplateContract.cjs` sigue siendo la única autoridad:
24 fuentes, 48 destinos. Exporta el mapa y las operaciones sin escribir al ser
importado. Lint conserva sus exclusiones exactas y analiza las fuentes canónicas;
no se excluye todo `functions/shared` ni se añade una lista para watch/CI.
`targetKind` clasifica en el mismo módulo los destinos de entrada y de build.

`contracts:check` comprueba fuentes y destinos requeridos en la entrada;
`contracts:check:built` exige también salidas generadas. Ambos leen, comparan bytes
y emiten JSON; no sincronizan ni crean reportes en disco por sí mismos. Un caller
puede redirigir stdout. Faltantes, diferencias y problemas de lectura devuelven 1,
con rutas, hashes, tamaños y primer byte distinto. `contracts:sync` es una acción
separada de escritura, registra el estado previo de cada destino corregido y no
reescribe contenidos iguales. No elimina archivos no mapeados.

`buildContracts.cjs` coordina sync → TypeScript instalado → check; el watch
observa únicamente entradas del árbol donde reside. Agrupa cambios de contenido,
tolera reemplazos y conserva una nueva pasada si cambia una fuente durante la
compilación. Cada compilador tiene plazo de 180 s y usa el supervisor de procesos
5A. Los estados y errores son visibles; no se anuncia readiness sobre entradas
inestables, una fuente ausente o una copia fallida. Se conserva la evidencia
antes de detener los procesos propios.

La foto generada `.local-isolation/phase5c/contract-map.json` deriva fuentes,
destinos/fases y cambio de extensión del mapa ejecutable, junto con referencias
relativas resueltas estáticamente por artefacto. Es evidencia de inspección,
no otra autoridad ni una auditoría exhaustiva de imports dinámicos. Se revisaron
además los imports reales de render, loader, Admin y `templates/contractLoader`.
La mayoría de los requires compilados resuelve `functions/shared`; el primer
candidato del loader de plantillas compilado es `functions/lib/shared/templates/contract.mjs`.
El cambio `.js` → `.mjs` copia bytes; los wrappers ESM mapeados también se conservan.
No hay cambios a esos contratos, adaptadores ni consumidores de aplicación.

## Preparación y fuentes comprobadas

Se respaldaron los **115 archivos preexistentes modificados/sin seguimiento**,
incluida la eliminación autorizada de `functions/index.js` en 5B, en
`.local-isolation/phase5c/before/` y `before-hashes.json`. La comprobación inicial
`input-before.json` dio salida 0 para las 24 copias de entrada **antes de ejecutar
sync**; no acredita el estado previo de `functions/lib`.

Se usaron las herramientas portables con checksums verificados en 5A y una nueva
preparación pública mediante `npm run local:prepare`: **salida 0**,
reporte `.local-isolation/reports/run-CAhSDT/result.json`, finalizado
2026-09-12T16:07:27.807Z. Tres `npm ci` con lockfiles, configuración personal y
cachés nuevos, descargas explícitas de JAR/Chrome, sin secretos productivos.
Workspace: `.local-isolation/prepared-gME5wa/workspace`.

Mientras se instalaban paquetes se completaron ajustes de las comprobaciones del tooling;
antes del recorrido final se refrescaron explícitamente las fuentes mediante
`copyWorkspace` existente, conservando las dependencias instaladas. Es una copia
puntual de preparación registrada, no sincronización continua entre árboles.
`final-sources.json` compara hashes del árbol principal y preparado para los nueve
archivos de implementación/configuración 5C; la sesión registra además su manifest
completo antes de generar copias y configuración local.

Versiones: Windows, Node **20.19.5**, npm **10.8.2**, Temurin **21.0.8+9**,
TypeScript **5.3.3**, ESLint **8.57.1**, parser/plugin TS **6.21.0**,
Firebase CLI **14.4.0**, Firestore **1.19.8**, Storage Rules runtime **1.1.3**,
Puppeteer **24.14.0**, Chrome **138.0.7204.157**. Sin dependencias nuevas,
modificaciones de lockfiles o del runtime Node 20 productivo. Sigue el aviso
preexistente `openai@7.5.0` / Node >=22; IA permanece deshabilitada localmente.
No se prueba Linux, Node 22, GitHub ni compatibilidad productiva total.

## Pruebas específicas y consumo

El primer helper descartable falló antes del lint por apuntar el preload de red
a una ruta inexistente. Se conserva `focused/workspace/.local-isolation/focused-run/lint.log`;
se corrigió la ubicación del helper sin desactivar aislamiento ni cambiar el
launcher. El siguiente recorrido enfocado terminó con salida 0: lint **194 archivos,
0 errores, 233 warnings**, y **10/10** pruebas en la primera versión del test.
Después se amplió la prueba para modificar todas las fuentes durante watch y
cubrir una falla de escritura activa; el recorrido final usa esa versión.

En la versión final, `contracts-tests` ejecuta **11/11** (10 casos y su test padre),
sin skips/cancelaciones. El reporte `contracts-evidence.json` conserva:

- Entrada sin `lib`, importación del mapa sin efectos y generación inicial de
  todas las correspondencias; segunda sincronización con cero escrituras y
  timestamps intactos.
- Check CLI con copia alterada: salida 1, diagnóstico del byte distinto, bytes y
  timestamps preservados. Sync posterior informa la reparación, sin atribuir
  frescura a la entrada original alterada.
- Fuente ausente: diagnóstico y cero escrituras; destino de entrada y de build
  ausentes; destino convertido en directorio para provocar error real de copia.
- Build con TypeScript real. Watch inicial, modificación de **las 24 fuentes**
  con actualización de **48 destinos**, guardado por reemplazo y ocho cambios
  rápidos durante compilación, con convergencia al último contenido.
- Renombre/eliminación de fuente con estado de error y recuperación al restaurar;
  falla de copia durante watch, sin readiness, y recuperación explícita tras
  reparar destino y editar una entrada. Archivo no mapeado preservado.
- Archivo TypeScript nuevo que aparece en `lib`; detención durante otra compilación,
  cierre del PID propio y ausencia de ese proceso. El supervisor exterior también
  registra su limpieza.

El cambio representativo reemplaza el texto visible del loader **sólo en la
copia descartable**. `functions/lib/utils/generarInvitationLoaderRuntime.js`
devuelve HTML con «Prueba 5C: cambio activo», luego «reemplazo», la última
«ráfaga 7» y «destino recuperado» desde procesos nuevos. No es una comparación
de hashes o comentarios. Un consumidor CommonJS cargado antes conserva el HTML
original en ese mismo proceso. No se invalida su caché ni se demuestra recarga
automática de Firebase Functions; ese límite está probado y documentado.

## Recorrido integrado y controles negativos

Desde la preparación final:

```sh
npm run verify:local
npm run test:local:negative -- --contracts-only
```

El integrado añade `contracts-input` antes de lint/sync, `contracts-tests` antes
de servicios y `contracts-built` después de compilar y antes de consumidores.
Lint sigue siendo obligatorio con advertencias visibles; en 5C hay dos archivos
CJS mantenidos adicionales frente a los 192 de 5B. Se mantienen **233 warnings**:
199 `no-explicit-any`, 30 TS `no-unused-vars`, 4 JS `no-unused-vars`; diferencia
**0** en advertencias y errores. No se alteraron reglas, exclusiones ni severidades.

El control negativo 5C reutiliza el harness 5A/5B: altera una copia de entrada,
exige error del comando canónico, diagnóstico de `contracts-input`, copia intacta,
etapas dependientes no ejecutadas, dependencia simulada ausente y puertos libres.
El modo completo conserva además los controles de lint nuevo, acceso cruzado,
interrupción y prerrequisitos; `--contracts-only` no pretende volver a certificar
esas ejecuciones históricas.

Resultado del recorrido final: **salida real 0, 19 etapas aprobadas,
1485/1485 tests**, lint **194 / 0 errores / 233 warnings**, sin tests omitidos o
cancelados. Finalizó 2026-09-12T16:18:06.730Z. Reporte original:
`.local-isolation/prepared-gME5wa/workspace/.local-isolation/reports/run-L3ZMcq/result.json`;
sesión `session-YxG9el`. La evidencia se conserva también en
`.local-isolation/phase5c/evidence/normal/`.

Desglose TAP: tooling/cobertura lint **7**, contratos/watch **11**, configuración
**12**, backend **7**, compatibilidad **75**, Rules/countdown **1370**, integración
**1**, navegador **1**, offline **1**. Los checks de bytes y la compilación son
etapas separadas, no se cuentan como pruebas de comportamiento. `contracts-input`
comprueba 24 destinos sin escribir; sync genera los 24 destinos de build ausentes;
`contracts-built` confirma las 48 correspondencias antes de backend/servicios.
El check posterior no se presenta como prueba del estado anterior a generación.

El negativo aislado terminó con **salida del harness 0** y **salida real del
comando canónico 1**, etapa `contracts-input`. Reporte `run-tVxFms` dentro de
`prepared-gME5wa/workspace/.local-isolation/session-ZdPPWt/workspace/.local-isolation/reports/`.
`negative-controls.json` registra `alteredCopyPreserved: true`,
`dependentReached: false` y `portsFree: true`. Lint, tooling, watch tests, sync,
compilación, check de compilados y servicios quedan sin ejecutar; la dependencia
simulada no se crea. Copia de evidencia en `.local-isolation/phase5c/evidence/negative/`.

Después del integrado se ejecutaron una vez, sobre esa sesión compilada y con
su entorno limpio/guard de red, las regresiones existentes:

```sh
node --test --test-reporter=tap shared/invitationLoaderPresentation.test.mjs shared/templates/contract.test.mjs functions/publicationPublishValidation.test.mjs
```

**35/35 aprobadas, salida 0**, sin skips; diagnóstico en
`.local-isolation/phase5c/consumer-regressions.log` y `.json`. Las 75 regresiones
de compatibilidad del gate también consumen módulos compilados actuales; no se
repitieron. Ninguna alteración sintética se aplicó al árbol principal.

La limpieza del integrado registra 17 procesos supervisados cerrados y los ocho
puertos locales libres; el reporte watch detalla sus hijos y la prueba confirma
que el PID de compilación dejó de existir. El negativo vuelve a comprobar puertos
y cierre. La inspección final de procesos propios no encuentra remanentes.

`git diff --check` con la configuración del repositorio (`core.autocrlf=true`)
da **0**. Un diagnóstico auxiliar forzando `core.autocrlf=false` produjo diferencias
de whitespace por CRLF en archivos preexistentes; se conserva por separado en
`diff-check.log` y no se modificaron esos archivos. `diff-check-default.log`
conserva el comando solicitado. `preservation.json` confirma **104 archivos
preexistentes idénticos, 11 con cambios acotados y 3 nuevos; cero cambios inesperados**.
Los contratos canónicos/copias del principal, Rules, lockfiles e informes 5A/5B
mantienen sus bytes iniciales.

## Archivos de esta fase

| Archivos | Motivo |
| --- | --- |
| `functions/scripts/syncTemplateContract.cjs`, `functions/package.json` | Check sin escrituras, fase de destinos, sincronización con diagnóstico e idempotencia; comandos separados |
| `functions/scripts/buildContracts.cjs` (nuevo) | Coordinación de build/watch con el supervisor de procesos existente |
| `functions/scripts/contracts.test.cjs` (nuevo) | Casos de mapa/check/watch/consumo y evidencia sintética |
| `scripts/local/runLocal.cjs`, `evidence.cjs`, `verifyNegative.cjs` | Etapas y artefactos en el ejecutor existente; negativo integrado de copia alterada |
| `.github/workflows/local-verification.yml`, `scripts/local/ciChecks.cjs` | Selección explícita de nuevos reportes y validación de esa selección; mismo gate/dependencias |
| `DEVELOPMENT_WORKFLOW.md`, `ARCHITECTURE_OVERVIEW.md`, `DOCUMENTATION_INDEX.md`, `SYSTEM_FRAGILITY_MAP.md` | Comandos, autoridad, árboles, consumo, evidencia y estado parcial |
| Este informe (nuevo) | Registro acotado de la ejecución 5C, separado de las líneas base anteriores |

## CI y estado residual

El reusable sigue ejecutando exclusivamente la preparación y `verify:local`.
Se amplió sólo la selección explícita de evidencia sintética para los nuevos
checks y el watch, y su validación estática. No se duplican comandos/reglas de
lint o sincronización en YAML. Hosting preview/deploy siguen con
`needs: verification` y la restricción de preview al mismo repositorio.
`actionlint` **1.7.7** dio salida 0; el tooling integrado valida YAML, permisos,
artefactos y grafo, incluidos controles negativos estructurales.

**CI preparada, pendiente de validación remota**. No se ejecutaron workflows ni
se comprobó bloqueo efectivo de GitHub, branch protection o required checks.
F13 sigue parcial. F15 queda parcialmente mitigado: se repara y prueba la
sincronización/check/watch del árbol observado; permanecen cachés de consumidores
y límites de las copias tomadas al iniciar. F10/F11/F12, Q1, migradores y destinos
de despliegue conservan su estado. No hubo commits, pushes ni operaciones remotas.

## Revalidación del diagnóstico de checks — 2026-09-12

Alcance: cierre de la validación local de los mensajes en stderr, JSON separado,
códigos 0/1 y chequeos de solo lectura. Esta ejecución no reemplaza la línea
base integrada anterior ni verifica servicios reales o CI remoto.

Se preservó el intento anterior de contracts en
`.local-isolation/contracts-test-9jKq2e` y se respaldó su informe en
`.local-isolation/contracts-validation-20260912-223036/previous-contracts-evidence.json`.
El directorio de revalidación conserva scripts reproducibles, hashes, logs y
reportes de todos los nuevos intentos.

### Preparación y prerrequisito de YAML

Se ejecutó `npm run local:prepare` con Node **20.19.5**, npm **10.8.2** y
Temurin **21.0.8+9**, usando los runtimes portables cuyos ZIP se contrastaron
con los checksums conservados. El primer intento dentro del sandbox,
`.local-isolation/reports/run-lvr0cI`, terminó fallido: npm recibió `EACCES`
al descargar paquetes públicos y escribió `Exit handler never called` aunque
devolvió 0. Las etapas npm marcadas como aprobadas **no acreditan instalación**;
faltaban paquetes y la preparación falló después por ausencia de Firebase CLI.
Ese intento se conserva y no se utiliza como evidencia de éxito.

La nueva ejecución del mismo procedimiento fuera del sandbox terminó con
**salida 0**, reporte `.local-isolation/reports/run-HgEzaJ/result.json` y copia
`.local-isolation/prepared-hlifiv/workspace`. Instaló los tres lockfiles y
descargó los JAR y Chrome fijados, sin credenciales productivas ni perfiles
personales. `yaml` **2.8.1** proviene del paquete separado de herramientas;
no se instaló en el árbol principal ni se cambiaron dependencias/lockfiles.
Persiste el aviso documentado `openai@7.5.0` / Node >=22; no se ejecutó IA.

### Causa comprobada de la falla de detención

La prueba sintética `probe-stop.cjs` del directorio de revalidación ejecutó el
supervisor conservado antes de la separación de stderr y el actual. Dentro del
sandbox ambos fallaron con Node **22.13.1** y **20.19.5**: el `taskkill.exe`
dirigido exclusivamente al PID de su hijo devolvió **1 / Acceso denegado**.
Los hijos sintéticos de un solo proceso se cerraron después y quedó registrada
su terminación; esa limpieza auxiliar no modifica ni sustituye el assert de la
suite real. Fuera del sandbox, ambos supervisores con Node 20 devolvieron
**taskkill 0** y confirmaron el cierre de sus hijos sin esa limpieza auxiliar.

`baseline-comparison.json` confirma que `stop()` y el coordinador
`buildContracts.cjs` conservan exactamente la implementación del intento previo.
**Conclusión: limitación de permisos del sandbox, no regresión del diagnóstico.**
La suite real pasó posteriormente sin modificar asserts, tiempos ni limpieza.
No se corrigió código de aplicación/tooling en esta revalidación.

### Verificaciones ejecutadas

Desde la copia preparada, con Node 20 y el `networkGuard.cjs` existente,
sin servicios reales y con permiso para detener únicamente procesos propios:

| Verificación | Resultado |
| --- | --- |
| `contracts:check` | 0; fuentes y copias de entrada iguales |
| `contracts:check:built` antes de generar | 1 esperado; `lib/shared` ausente, JSON y diagnóstico separados; snapshots de bytes/mtime intactos |
| `node --test --test-reporter=tap scripts/local/tooling.test.mjs functions/scripts/lint.test.cjs` | **7/7**, sin skips/cancelaciones; incluye YAML/CI estático, timeout/limpieza y cobertura de lint |
| `node --test --test-reporter=tap functions/scripts/contracts.test.cjs` | **29/29**, sin skips/cancelaciones; incluye 17 casos nuevos y todos los casos de build/watch/consumo, con detención durante compilación y limpieza confirmada |
| `contracts:check:built` sobre el árbol generado por esa suite | 0 |
| ESLint con configuración de Functions sobre los cuatro archivos JS/CJS del cambio | 0, sin mensajes |
| `node scripts/local/verifyNegative.cjs --contracts-only` | 0 del harness: launcher 1 esperado, copia alterada preservada, JSON parseable, etapas dependientes no ejecutadas, proceso cerrado y puertos libres |

El ejecutor reproducible `validate-prepared.cjs` conserva los argumentos exactos
y el entorno permitido. Resultados y logs:
`.local-isolation/contracts-validation-20260912-223036/validation-LXGgvF/`.
El negativo conserva además su evidencia nativa en
`.local-isolation/prepared-hlifiv/workspace/.local-isolation/session-ws7pVC/`.
`source-preservation.json` confirma que los cuatro archivos de código y el
runbook quedaron idénticos al inicio de esta revalidación.

Queda completada la validación pendiente del cambio. No se ejecutó el recorrido
completo `verify:local`, Rules, integración de navegador ni CI remoto: no forman
parte de este cierre enfocado. Los intentos fallidos permanecen registrados.
