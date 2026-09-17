# Desarrollo y verificaciones locales

Status: Operational Diagnostic Evidence.

Autoridad operativa para el recorrido aislado de FASE 4A y su verificación
integrada de FASE 5A. No define permisos,
roles ni garantías de Rules; F10/F11 y Q1 conservan sus responsables.

## Línea base revalidada — 2026-09-11

Inspección del árbol de trabajo antes de iniciar procesos. Había cambios sin
commit en documentación, render, contratos compartidos y tests; las compilaciones
de esta tarea deben incluirlos en una copia temporal, sin sobrescribir sus copias.

| Comando / modo anterior | Servicios y destino | Endpoints / configuración | Escrituras locales / dependencia remota / falla |
| --- | --- | --- | --- |
| `dev`, `dev:reset` | Auth, Firestore, Functions, Storage: `reservaeldia-7a440`; bucket `reservaeldia-7a440.firebasestorage.app` | modo `prod` impuesto; configuración cliente en `src/firebase.js`; Next carga `.env.local` | Next genera caché; reset elimina cachés existentes; usa servicios reales aunque falten flags |
| `dev:functions`; Functions `serve`, `shell`, `start`, `dev` | Functions local; otras dependencias pueden ser reales | CLI usa proyecto activo; Admin usa ADC y bucket productivo; carga dotenv, `.secret.local`, `.runtimeconfig.json` | build sobrescribe `functions/shared` y `functions/lib`; no demuestra aislamiento de dependencias |
| `dev:emulators`, `emulators` | Auth, Firestore, Functions; Storage omitido | proyecto CLI no explícito; frontend sólo conecta tres servicios y sólo en navegador localhost | build/cachés/logs; modo inválido o host distinto cae a producción |
| HTML y assets | RSVP fijo en Cloud Functions productivo; Sheets opcional; URLs de Storage/Hosting y mapas remotos | generador RSVP, responsables de assets/publicación; URLs persistidas y fallbacks de frontend | un HTML generado localmente puede acceder o enviar información al exterior |
| Proveedores y scripts administrativos | variable según script; test previo usa otro proyecto demo | no forman parte del recorrido general autorizado | no ejecutados; F14 conserva su alcance |

Fuentes sensibles detectadas **por nombre, sin registrar valores**: archivo de
cuenta de servicio en raíz, `.env.local`, dotenv específicos de Functions,
`.secret.local`, `.runtimeconfig.json` y directorios personales potenciales de
Firebase CLI/ADC. El recorrido nuevo no debe copiarlos ni heredarlos.

## Recorrido implementado

`npm run dev` inicia una sesión nueva en `.local-isolation/session-*/workspace`.
La identidad canónica es `demo-reservaeldia-local`, sin proyecto remoto ni login.
No modifica `.firebaserc` ni el proyecto productivo predeterminado.

El lanzador copia las fuentes actuales (incluidos cambios sin commit), Rules y
configuración de compilación mediante una lista explícita. No copia `.env*`,
`.secret*`, `.runtimeconfig.json`, la cuenta de servicio, backups, `functions/lib`,
artefactos publicados ni perfiles personales. Reutiliza `node_modules` instalados
mediante enlaces; la sincronización de contratos y TypeScript escriben sólo en la
copia. No instala dependencias ni descarga herramientas automáticamente.

De `public/` sólo copia branding e iconos de interfaz enumerados en el lanzador;
excluye las invitaciones HTML heredadas y las bibliotecas de fotografías. Pueden
faltar imágenes de marketing: no se usan como fixtures del entorno local.

El proceso recibe una lista permitida de variables del sistema y configuración
demo generada; no hereda tokens, claves, proxies, `NODE_OPTIONS` ni configuración
de proveedores. HOME, USERPROFILE, APPDATA, XDG y Cloud SDK apuntan a directorios
vacíos propios de la sesión. Firebase CLI recibe siempre `--project` y `--config`.
Su descubrimiento de Functions filtra variables; `functionsEntry.cjs` restaura
exclusivamente `sessionEnvironment.json`, generado sin credenciales, antes de
importar la aplicación. No se leen secretos remotos para los endpoints locales.

Los seis callables permitidos delegan a sus handlers existentes. La entrada local
no se usa en producción: el paquete productivo conserva `lib/index.js`. Los demás
endpoints HTTP/callable existentes responden `LOCAL_FLOW_DISABLED` antes del
handler. No se registran triggers ni schedulers. No se crean endpoints de prueba.

## Requisitos y preparación

La preparación vigente y reproducible es [FASE 5A](#verification-5a). Instala
herramientas públicas en una copia descartable mediante tres lockfiles; el
lanzador ya no busca CLI global, JAR ni Chrome en perfiles personales.

### Herramientas de la línea base 4A (histórico)

Herramientas reutilizadas en esta máquina: Node **22.13.1**, Firebase CLI **14.4.0**,
Java Temurin **25.0.2**, Firebase cliente **11.7.3**, Admin **13.4.0**, Next **15.3.2**,
Firestore emulator **1.19.8**, Storage Rules runtime **1.1.3** y Chrome para pruebas
**138.0.7204.157** administrado por Puppeteer. Los paquetes declaran Node 20;
el lanzador acepta 20/22, pero **Node 20 no se verificó en esta máquina**. Java 25
emite avisos de APIs obsoletas del JAR; no equivalen a una prueba fallida de Rules.

La preparación 4A reutilizaba dependencias instaladas, CLI local/global y JAR
personales. Esa búsqueda fue reemplazada en 5A. Se conserva arriba la identidad
de sus ejecuciones históricas, no una instrucción de instalación actual.

La CLI intenta obtener MOTD/configuración y detectar metadata; el bloqueo de red
de Node impide esas solicitudes antes de conectar. Sus avisos son esperables.
La configuración demo está respaldada por la documentación de
[Storage emulator](https://firebase.google.com/docs/emulator-suite/connect_storage)
y el alcance de credenciales/secretos de
[Functions emulator](https://firebase.google.com/docs/emulator-suite/connect_functions).

## Comandos

Desde `C:\Reservaeldia`:

```powershell
npm run local:check
npm run test:local:unit
npm run test:local
npm run dev
```

`npm run dev` abre Next en `http://localhost:3100` después de comprobar los cuatro
emuladores y un callable existente. Crea una identidad sintética ordinaria:
`local-developer@example.test`, contraseña **`Local-only-4A!`**, sin claims
administrativos, un perfil y el borrador vacío `borradores/local-demo`.
Estos valores sólo sirven en la sesión demo recién creada.

`npm run emulators` inicia los cuatro servicios sin Next ni fixtures iniciales;
sirve como base para futuras pruebas de Rules. `dev:emulators`, `dev:functions`
y `dev:reset` son alias del recorrido completo. En Functions, `serve`, `shell`,
`start` y `dev` redirigen al recorrido de cuatro emuladores; ya no ofrecen una
sesión parcial o una shell respaldada por servicios reales.

No se conserva un comando de desarrollo remoto. `next dev` directo o
`scripts/runNextDev.cjs` fuera de la sesión se detienen con diagnóstico.
La configuración productiva de compilación conserva los valores existentes;
su verificación usa resolvers/SDKs falsos o transportes bloqueados, sin servicios
productivos. Los comandos de deploy y administración no pertenecen al recorrido.

## Matriz de destinos

La fuente ejecutable es `shared/firebaseEnvironment.cjs`; sus copias de Functions
las mantiene `functions/scripts/syncTemplateContract.cjs`.

| Modo / proceso | Servicios | Proyecto / bucket | Endpoints / origen de configuración | Salida y dependencias |
| --- | --- | --- | --- | --- |
| `dev` y alias | Auth, Firestore, Functions, Storage + Next | `demo-reservaeldia-local` / `demo-reservaeldia-local.appspot.com` | Contrato compartido → entorno limpio → `firebase.local.json`; Next `127.0.0.1:3100` | Copia, compilados, cachés, logs y fixtures propios; sin datos ni efectos externos habilitados |
| `emulators` y alias de Functions | Los cuatro servicios | Mismo demo/bucket | Auth `127.0.0.1:19099`; Firestore `127.0.0.1:18080`; Functions `127.0.0.1:15001`; Storage `127.0.0.1:19199` | Sin Next ni seed; memoria efímera y blobs en la sesión |
| `test:local` | Los cuatro servicios, cliente real, Admin, Next y Chrome temporal | Mismo demo/bucket | API Functions bajo `/demo-reservaeldia-local/us-central1/`; conexiones SDK previas al primer acceso | Sólo identidades aleatorias `@example.test`, documentos y bytes sintéticos; evidencia JSON |
| Backend local | Admin Auth/Firestore/Storage | Mismo demo/bucket, validado antes de crear/reutilizar app | Variables de emulación completas; `FIREBASE_CONFIG` compatible; sin obtención de tokens ADC | SDK Admin usa transporte de emuladores; no demuestra autorización de Rules |
| HTML local | Generador compartido, RSVP y assets | Demo; RSVP actualmente deshabilitado en servidor | `http://127.0.0.1:15001/demo-reservaeldia-local/us-central1/publicRsvpSubmit`; Sheets rechazado; CSP local en HTML | RSVP responde 412; assets remotos incrustados bloqueados antes de cargar |
| Producción (no ejecutada) | Auth, Firestore, Functions, Storage | `reservaeldia-7a440` / `reservaeldia-7a440.firebasestorage.app` | Firebase normal; Functions `https://us-central1-reservaeldia-7a440.cloudfunctions.net`; web `https://reservaeldia.com.ar`; authDomain configurable | Configuración preservada por pruebas sin transporte real |
| Modo/configuración inválida | Ninguno utilizable | No hay destino alternativo | Se rechazan modos desconocidos, mezcla de emuladores, proyecto/bucket ajenos, endpoints ausentes y overrides incompatibles | Error claro; no fallback |

Puertos auxiliares propios: hub **14400**, logging **14500**, websocket Firestore
**19150**. La UI de emuladores está deshabilitada. Discovery/IPC de Functions y
workers de Next usan puertos/pipes locales efímeros. Los puertos dedicados evitan
los 9099/3000 encontrados ocupados durante la línea base; no se tocaron esos procesos.

## Disponibilidad y límites

Disponibles: SDKs de Auth/Firestore/Storage y callables existentes
`upsertUserProfile`, `getMyProfileStatus`, `getMyUiPreferences`,
`updateMyUiPreferences`, `getPricingConfigV1`, `getDashboardHomeConfigV1`.
Los últimos leen configuración local y pueden devolver el diagnóstico de
configuración ausente en una sesión vacía. No se asignan roles administrativos.

Bloqueados: pagos/checkout/publicación, IA, correo SES, RSVP/Sheets, previews de
backend, administración y los restantes endpoints no incluidos explícitamente.
Triggers y schedulers no se registran. El guard de proveedores también impide
construir clientes SES, Mercado Pago y OpenAI en modo local.

Node limita sockets a loopback antes de DNS/conexión; fetch además valida identidad
en rutas y rechaza redirecciones. Next aplica CSP a solicitudes, scripts, frames,
imágenes, fuentes y formularios; el generador aplica la misma CSP al HTML local.
El aviso local bloquea enlaces/calls a `window.open` externos. Recursos públicos
como Google Fonts, Bootstrap CDN, mapas, analytics y SDK de pagos quedan bloqueados;
pueden faltar tipografías/estilos o funciones dependientes de ellos.

Esto **no es un firewall del sistema operativo ni aislamiento total de red**.
No certifica tráfico interno de Java/Chrome, extensiones personales o programas
arbitrarios que el usuario ejecute por fuera del lanzador. Las pruebas de navegador
usan un perfil nuevo y resolución de dominios externos deshabilitada como segunda
barrera. No hay importación de assets ni información productiva.

El desarrollo usa una **copia al iniciar**, no un watch del repositorio: reiniciar
para incorporar cambios en fuentes, contratos o Rules. El entorno limpio fija
`FUNCTIONS_DISCOVERY_TIMEOUT=60` segundos: 4B2A reprodujo un timeout de arranque
con el default de 10 segundos de Firebase CLI 14.4.0. Es una espera local acotada;
se conserva el plazo global de readiness, su probe al callable y todos los
controles de destinos/efectos. Un timeout sigue siendo infraestructura, no un
permiso denegado. La [evidencia 4B2A](../testing/SECURITY_RULES_4B2A.md) registra
el intento y su repetición.

La copia debe recrearse después de cada edición. Editar la copia sirve para
una prueba efímera; conservar los cambios deseados en el repositorio. F15 no queda
resuelto por esta copia inicial. Los scripts especializados de proveedores,
migradores y operación conservan sus revisiones específicas; no están certificados
por `test:local`.

## Detención, archivos y limpieza

Ctrl+C detiene exclusivamente los procesos creados por la sesión. En Windows el
lanzador cierra sus árboles mediante PID. Si el entorno de ejecución impide
terminar procesos, no se debe marcar la sesión como detenida ni limpiar sus archivos;
habilitar el permiso de terminación de esos procesos propios y repetir la detención.
No buscar y matar procesos por puerto, nombre o proyecto compartido.

Se conservan `session.json`, `workspace/` (incluidos `functions/lib`, copias de
contratos y `.next-dev-3100`), `home/`, `tmp/`, caché de JAR y el perfil temporal de
Chrome. Las pruebas escriben `integration-evidence.json`, `browser-evidence.json`,
`offline-evidence.json` y, sólo si termina toda la suite, `verified.json`.
No se exporta la base de emuladores. La integración elimina únicamente sus
documentos, archivos y usuario; los datos restantes desaparecen al detener la sesión.

Para borrar una sesión propia ya detenida:

```powershell
node scripts/local/runLocal.cjs clean C:\Reservaeldia\.local-isolation\session-NOMBRE
```

La limpieza exige ruta absoluta dentro del directorio creado, nombre de sesión,
marca de propiedad/proyecto y estado detenido. No sigue enlaces a `node_modules`
ni elimina cachés, perfiles o directorios ajenos. `dev:reset` crea una sesión nueva;
no limpia sesiones anteriores ni cachés existentes del usuario.

## Evidencia 4A — 2026-09-11

Ejecución integral: `node scripts/local/runLocal.cjs test` (implementación exacta de
`npm run test:local`), salida **0**, sesión **`session-cON7EQ`**, terminada a
**2026-09-11 05:37:08 UTC**. Incluyó **96 tests, 96 aprobados, 0 fallidos,
0 omitidos** y compilación TypeScript de las fuentes actuales:

| Verificación ejecutada | Resultado observado |
| --- | --- |
| Configuración cliente/lanzador e inicialización | 11 tests: cuatro conexiones, inicialización repetida, config productiva con SDK falso, selección inválida, endpoints incompatibles, entorno limpio, bloqueo previo con transporte centinela y limpieza que no sigue junctions |
| Admin, efectos y HTML generado | 7 tests: exclusión de archivos personales/invitaciones heredadas, identidad demo, rechazo de ADC/config incompatible, proveedores bloqueados, handlers locales y ejecución del RSVP contra fetch falso; endpoint remoto/ausente produce cero despachos |
| Regresiones existentes con transporte externo bloqueado | 75 tests de `renderContractCompatibility`, `motionEffectsRenderCompatibility`, `templateStorageAssets` y `designerAiService`; usan los compilados temporales actuales, incluidos cambios preexistentes |
| Integración SDK cliente + Admin + Functions | 1 escenario: Auth sintético, documento en `borradores`, bytes en Storage con lectura/borrado y comprobación por Admin; `updateMyUiPreferences` escribe estado que lee el cliente; `getMyProfileStatus` observa la misma identidad; pagos/IA/preview/RSVP rechazados antes de sus efectos |
| Fixtures de desarrollo | Seed ejecutado: identidad ordinaria `local-developer`, perfil y borrador sintéticos en el demo; sin claims administrativos |
| Navegador desktop/mobile y recarga | 1 escenario, HTTP 200 en Next; 1280×800 y 390×844; 10 solicitudes bloqueadas por CSP, incluidos endpoint/bucket productivos; 0 errores de inicialización Firebase detectados; recursos de marketing ausentes producen 404 locales esperados |
| Emuladores ausentes | 1 escenario después de detener los procesos propios: sólo intentos a 127.0.0.1 en los cuatro puertos; errores `auth/network-request-failed`, Firestore `unavailable`, `storage/retry-limit-exceeded`, `functions/internal`; ninguna reconexión productiva |

Archivos de evidencia local conservados bajo `.local-isolation/` (ignorados por
Git): `verified-test.log`, `session-cON7EQ/verified.json`,
`session-cON7EQ/integration-evidence.json`, `session-cON7EQ/browser-evidence.json`
y `session-cON7EQ/offline-evidence.json`. Se pueden regenerar con la suite.
`preservation-evidence.json` confirma por SHA-256 los **36 archivos preexistentes
fuera de las cuatro autoridades documentales actualizadas**. Las ediciones en
README, índice, mapa arquitectónico y F12 son selectivas; no reemplazan las fases
documentales anteriores. `git diff --check` con la configuración del repositorio
terminó en 0, sin hallazgos; Git informó normalización LF/CRLF. Las tres copias del
nuevo contrato Firebase tienen el mismo SHA-256.

Verificación final adicional de limpieza: **12/12** tests unitarios aprobados en
`unit-tests.log`. Tras observar un permiso denegado al borrar archivos temporales
de Java, `removeSession` conserva su marca de propiedad hasta completar el borrado;
una prueba con falla simulada verifica que se puede reintentar con seguridad. Se
eliminaron las siete sesiones previas propias con sus rutas y detención comprobadas;
se conserva `session-cON7EQ`. No se repitió la integración completa por este ajuste
limitado a limpieza; la siguiente ejecución integral incluirá el nuevo test.

Fallos encontrados y corregidos durante el recorrido: puertos habituales ocupados
(se adoptaron puertos dedicados), quoting de `NODE_OPTIONS` en Windows, variables
omitidas por discovery de Firebase CLI, incompatibilidad de credencial genérica
con Admin 13 y pérdida de `FieldValue` por el proxy del emulador. Se usan imports
modulares de Firestore en los responsables alcanzados; no se relajaron Rules.
El sandbox inicial impidió cerrar procesos propios; se verificó la terminación
con el permiso correspondiente y las ejecuciones completas cerraron sus procesos.

Omitidos deliberadamente: Node 20, build/export productivo completo de Next,
lint global/CI (F13), migradores/operación remota (F14), watch general (F15),
flujos deshabilitados y pruebas de autorización efectiva de Rules. No hubo deploy,
cambios remotos ni commits. F12 permanece **parcialmente resuelto**: el recorrido
documentado se verificó; no se certifican todas las rutas del repositorio ni
paridad funcional de los handlers deshabilitados.

La evidencia anterior corresponde sólo a **4A**. La suite dedicada de
[4B1](#rules-4b1) agrega pruebas efectivas de Rules; F10/F11 y Q1 siguen abiertos.
Un éxito de Admin no valida Rules; tampoco un caso permitido de cliente demuestra
denegación a otro usuario.

<a id="rules-4b1"></a>

## Suite de autorización — FASES 4B1, 4B2A y 4B2B

Desde la raíz, con los requisitos y revisión de destinos anteriores:

```powershell
npm run local:check
npm run test:local:unit
npm run test:local:rules
```

El último comando ejecuta `node scripts/local/runLocal.cjs rules`. Usa el mismo
proyecto/bucket/puertos de 4A, copia temporal de fuentes actuales y los cuatro
emuladores; compila Functions en la copia, sin Next, seed de desarrollo, CI ni
proveedores. No se descarga ni agrega ninguna dependencia. Es necesario iniciar
una sesión nueva después de editar tests, contratos o Rules.

Desde 4B2B también ejecuta los checks countdown existentes enumerados en
[countdownChecks.cjs](../../scripts/local/countdownChecks.cjs): 21 tests de
comportamiento puro (políticas/catálogo/lifecycle/frames) y 10 de inspección de
texto fuente del servicio. La misma lista gobierna su copia temporal y ejecución;
los módulos backend se compilan desde fuentes actuales. Se ejecutan junto con
Rules aunque haya asserts fallidos. Los checks estáticos no invocan handlers;
las políticas puras no certifican transacciones, Storage o callables completos.

`session.cjs` compara bytes de las Rules copiadas con el árbol de trabajo y guarda
SHA-256 en `rules-source.json`. La suite comprueba ese manifest, la configuración
que carga la CLI y los hashes antes y después. Comprueba proyecto/bucket,
destinos de SDK y disponibilidad del hub; los wrappers `getAdminAccess`,
`setAdminClaim` y `publicRsvpSubmit` deben seguir bloqueados. Los dos primeros
responden HTTP 400 con `FAILED_PRECONDITION`; el wrapper HTTP de RSVP responde
412. Todos deben incluir `LOCAL_FLOW_DISABLED`. No se invocan handlers de negocio
ni se registran triggers/schedulers nuevos. Desde 4B2B también se comprueba el
wrapper bloqueado de `listCountdownPresetsPublic`, `saveCountdownPresetDraft`,
`publishCountdownPresetDraft` y `listCountdownPresetVersionsAdmin`, con el mismo
400/FAILED_PRECONDITION. Esto confirma el bloqueo, no la conducta del handler.

Se reutiliza Firebase SDK cliente instalado y su opción oficial `mockUserToken`.
Hay contextos N, A, B y variantes administrativas sintéticas; no se crean ni
consultan usuarios Auth reales, ni se asignan/revocan claims. Admin prepara y
elimina sólo fixtures sintéticas: paths del UUID y objetos en prefijos exactos
necesarios para probar sus límites, en emuladores exclusivos de esta sesión.
No ejecutar contra una sesión compartida. Las operaciones evaluadas
usan clientes conectados al emulador con Rules, sin tokens de descarga ni bypass
Admin. La caracterización de `requireAdmin`/`requireSuperAdmin` ejecuta sólo esos
helpers puros del compilado temporal, y se etiqueta aparte de Rules.

La fuente de casos es [rulesCases.mjs](../../scripts/local/rulesCases.mjs);
[rules.test.mjs](../../scripts/local/rules.test.mjs) es el ejecutor:

- `acceptance`: obligaciones A1–A4 de la [matriz](../contracts/SECURITY_CONTRACT.md#accepted-obligations).
  Asserts de allow/deny normativos; las vulnerabilidades hacen fallar la suite.
- `characterization`: comportamiento actual, incluidos grants peligrosos y
  variantes administrativas divergentes. Verde significa observación reproducida,
  no seguridad ni política aceptada.
- `proposal`: probes de representación Q1; registran diferencia frente al permiso
  propuesto sin convertirlo en assert normativo. Un probe ejecutado no prueba
  todavía capacidades completas, transición o revocación.

El resultado general **debe ser no cero** mientras haya fallas de aceptación.
No forma parte de `test:local`, `test:local:unit` ni `dev`; desde 5A integra
`verify:local` y el control previo de los workflows de Hosting. No agregar `|| true`
para presentar esta línea base como verde. Errores de arranque, hook, transporte,
timeout, objeto ausente y limpieza no cuentan como `deny`. Sólo se aceptan como
denegación `permission-denied` y `storage/unauthorized` del SDK evaluado.

Se escribe `rules-evidence.json` en la sesión, también cuando hay asserts
fallidos; incluye versión/hashes, casos previstos/ejecutados, identidades
sintéticas, esperado/autoridad, observado/clasificación y errores de infraestructura.
Si el arranque falla antes de iniciar el runner, usar log y marcador de sesión:
la ausencia del reporte no significa aprobación. Se conserva la línea base
revisable en [SECURITY_RULES_BASELINE_4B1.md](../testing/SECURITY_RULES_BASELINE_4B1.md).

El lanzador devuelve el código fallido y detiene sus procesos en `finally`.
La limpieza usa paths exactos de fixtures, sin vaciar bases/buckets ni importar
exports. Antes de borrar una sesión detenida, conservar evidencia necesaria y
usar el comando `clean` documentado arriba. Si el sandbox impide cerrar un hijo,
verificar PID, padre y ruta de la sesión antes de detenerlo con el permiso
necesario; no matar por nombre/puerto ni marcar limpia una sesión con hijos vivos.

Los límites de red y funcionalidades de F12 no cambian. La suite no verifica
producción, Rules desplegadas, usuarios/claims existentes, IAM/GCS público,
URLs firmadas/por token, entrega HTTP de publicación, pagos, IA, correo,
proveedores operativos ni handlers bloqueados. Es evidencia local de autorización
de los casos corregidos de 4B2, no una habilitación de esos flujos. Comparación
actual: [SECURITY_RULES_4B2B.md](../testing/SECURITY_RULES_4B2B.md); se preservan
las líneas base históricas 4B1 y 4B2A.

<a id="verification-5a"></a>

## Verificación integrada — FASES 5A, 5B y 5C

Preparar **Node 20.19.5 (npm 10.8.2)** y **Java Temurin 21.0.8+9** en PATH.
Ambos paquetes productivos siguen declarando Node 20. El lanzador admite también
Node 22, pero cada ejecución registra la versión usada. Las fuentes oficiales
son [Node](https://nodejs.org/download/release/v20.19.5/) y
[Temurin](https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.8%2B9).
No usar perfiles Firebase/Google ni secretos. La preparación se ejecuta desde
la raíz que contiene los cambios a verificar:

```sh
npm run local:prepare
```

Este comando **sí accede a Internet público**. Usa `copyWorkspace` del mismo
responsable de sesiones y crea `.local-isolation/prepared-*/workspace`, con
fuentes actuales, cambios sin commit y una lista explícita de archivos. No toca
los `node_modules`, compilados o lockfiles del árbol original. En esa copia:

1. Ejecuta `npm ci --no-audit --no-fund` en raíz, `functions/` y
   `scripts/local/tools/`, cada uno con su lockfile. Usa configuración npm vacía
   y caché propia; desactiva el download implícito de Puppeteer durante instalación.
2. Ejecuta la CLI fijada **14.4.0** mediante Node para descargar exclusivamente
   Firestore **1.19.8** y Storage Rules runtime **1.1.3**. Auth/Functions pertenecen
   a esa CLI. No inicia servicios, importa bases ni hace login.
3. Descarga Chrome **138.0.7204.157**, resuelto por Puppeteer **24.14.0** del lockfile
   raíz, en la caché propia. No reutiliza navegador/perfil personal.

El paquete de herramientas separado evita agregar la CLI al bundle/producto.
Fija también `yaml` para analizar sintaxis y dependencias de CI. Sus overrides
de cloud-sql-connector, sqladmin, universal-analytics y re2 conservan transitivas
compatibles con Node 20; sin ellos la resolución actual de CLI 14.4.0 trae
dependencias que requieren Node 22. Revisarlos junto con el lockfile al actualizar
la CLI. No son cambios de dependencias productivas.

La instalación limpia en Node 20.19.5 registra un `EBADENGINE` preexistente:
`openai@7.5.0` de Functions declara Node >=22. No se modifica ese paquete ni el
runtime productivo. El recorrido aislado mantiene IA deshabilitada y no demuestra
compatibilidad productiva completa de esa dependencia.

Al terminar imprime la ruta exacta y el comando. Desde esa copia preparada:

```sh
npm run verify:local
```

También se puede usar el comando impreso `npm --prefix "RUTA/workspace" run
verify:local`. Una preparación es una **foto de las fuentes**, no un watch:
volver a preparar después de cambios en el árbol original. La verificación crea
otra sesión nueva desde el árbol donde se invoca. No descarga ni instala nada:
comprueba CLI local exacta, JAR esperados (tamaño y checksum de la metadata de la
CLI), Chrome existente, paquetes, destinos y puertos antes de iniciar servicios.

| Etapa | Cobertura y naturaleza |
| --- | --- |
| prerequisites / copy | Requisitos/destinos de `local:check`, puertos libres; copia vigente, SHA-256 de fuentes, lockfiles y Rules |
| contracts-input | Check sin escrituras de fuentes y copias de entrada, antes de que lint/sync puedan ocultar una divergencia; no exige `functions/lib` |
| lint | Script `lint` de Functions, antes de tests/compilación/emuladores: análisis estático completo del alcance [5B](#functions-lint-5b), errores obligatorios y advertencias visibles |
| tooling | Comportamiento del coordinador (falla, timeout, evidencia, limpieza propia, TAP/lint incompletos), cobertura dinámica de lint y verificación **estática** de YAML/grafo/permisos de CI |
| contracts-tests | Pruebas de sincronización/watch en otra copia descartable: mapa completo, cambios reales, reemplazos, ráfagas, fallas, consumo nuevo/cacheado y detención durante compilación |
| configuration | Los tests de `test:local:unit`, una sola vez: destinos, cuatro conexiones, inicialización repetida, entorno limpio, red antes del transporte y limpieza |
| sync / compile | Sincronización de contratos y TypeScript de Functions dentro de la sesión; no consume `functions/lib` del árbol original |
| contracts-built | Check sin escrituras de todos los destinos después de generarlos y antes de consumidores; `sync.log` registra destinos originalmente ausentes/distintos |
| backend / compatibility | Tests 4A de Admin/proveedores/render y las cuatro regresiones productivas existentes con transporte externo bloqueado |
| emulators | Cuatro servicios demo y probe del callable; configuración generada y hashes de Rules ligados al readiness |
| rules-countdown | Ejecutor existente de `test:local:rules`: acceptance, characterization, proposal; countdown mantiene listas separadas de behavior/static/mixed en `countdownChecks.cjs` |
| integration / seed / browser | SDK cliente + Admin corroborador + callables habilitados; fixtures sintéticos; Next, desktop/mobile, recarga y CSP |
| stop-services / offline | Detiene procesos propios, comprueba puertos libres y prueba ausencia de emuladores sin fallback remoto |

Se reutilizan los tests y el aislamiento de 4A/4B2. El modo integrado compila y
arranca los emuladores una vez; Rules termina antes de comenzar integración.
Los comandos individuales siguen disponibles. No ejecutar dos sesiones a la vez:
comparten los puertos documentados y rechazan procesos ajenos.

`acceptance` sigue evaluando obligaciones aceptadas; `characterization` puede
conservar permisos riesgosos pendientes. Un verde **no demuestra que todo acceso
permitido sea correcto**. `proposal` registra diferencias Q1 y fallas de
infraestructura, sin convertir diferencias de política pendiente en aceptación
fallida ni en implementación de Q1. Los checks estáticos tampoco reemplazan los
de comportamiento.

### Resultado, evidencia y diagnóstico

Se escribe progresivamente `.local-isolation/reports/run-*/result.json` incluso
ante prerrequisitos fallidos: etapas ejecutadas/no ejecutadas, resultado, tiempos,
versiones, sesión, código de salida y limpieza. Logs por etapa guardan TAP o
diagnóstico. Un éxito sin TAP, sin casos Rules, con skips/cancelaciones o sin los
reportes de integración no se acepta.

| Código | Significado |
| --- | --- |
| 0 | Todas las etapas previstas terminaron correctamente y se confirmó limpieza |
| 1 | Copias inconsistentes, lint, tests/aserciones o compilación fallidos; revisar etapa, diagnóstico/TAP y casos Rules |
| 2 | Prerrequisito/destino inválido; no se inicia una sesión de servicios |
| 3 | Infraestructura, evidencia ausente/incompleta, timeout o limpieza no confirmada |
| 130 | Interrupción; consultar también el resultado de limpieza |

Los procesos acotados tienen máximos de 3 minutos por etapa, 4 minutos de
readiness, 5 minutos para el supervisor de pruebas sync/watch (4 dentro del test),
10 minutos para Rules/countdown y 25 minutos globales de verificación.
Navegador permite 5 minutos dentro del test y 6 en su supervisor para el arranque
y compilación en frío de Next; el primer intento 5A agotó el límite histórico
de 150 segundos y quedó conservado como falla de infraestructura.
Los sondeos Rules a wrappers deshabilitados esperan hasta 30 segundos cada uno;
una instalación limpia agotó el plazo previo de 10 s antes de ejecutar casos.
El reporte identifica el paso/endpoint; no se repite la solicitud automáticamente.
La preparación limita cada instalación/download a 10 minutos. No hay retries
automáticos de suites; los sondeos acotados de readiness no son una repetición
de tests. Una repetición manual crea evidencia nueva y no borra el intento previo.

Antes de la limpieza se copian sólo reportes sintéticos seleccionados al directorio
de evidencia: `source-manifest.json`, `lint-evidence.json`, `contracts-evidence.json`, `rules-source.json`, `rules-evidence.json`,
integración/navegador/offline, `verified.json` y `session.json`. Se conservan logs
de etapas y de emuladores/Next. Los datos de emuladores no se exportan. El launcher
detiene sus árboles por PID en Windows y grupos propios en POSIX, con escalamiento
acotado; no mata por nombre/puerto. Una limpieza fallida impide resultado verde.
Los archivos de sesión quedan disponibles y `clean` sigue siendo una operación
explícita sobre una sesión propia ya detenida. Guardar los reportes antes de
eliminar una copia preparada completa.

Un fallo de aceptación se busca por `group`, `id`, `expected`, `observed` y
`matchesExpected` en Rules; una falla de infraestructura no cuenta como deny.
Para CLI/JAR/Chrome ausentes repetir **preparación**, no habilitar descargas en el
launcher ni introducir credenciales. Para puerto ocupado identificar su dueño;
el launcher no lo reutiliza. Nunca usar `|| true` para continuar con Hosting.

### Demostración negativa y CI

Desde la copia preparada, sin otra sesión activa:

```sh
npm run test:local:negative
```

El harness usa `createSession` existente para crear otra copia aislada. Primero
altera una copia compartida y exige salida 1 en `contracts-input`, bytes alterados
intactos, etapas siguientes omitidas y limpieza. `npm run test:local:negative --
--contracts-only` ejecuta sólo ese control 5C, sin repetir los otros escenarios.
Su resumen queda en `.local-isolation/session-*/negative-controls.json` dentro
de la preparación; incluye la ruta del reporte integrado fallido.
Después
crea un TypeScript nuevo con `debugger`, comprueba que compila con `tsc --noEmit`
y exige que el comando integrado falle en lint con `no-debugger`, salida 1,
sin alcanzar tooling, compilación ni emuladores. Conserva el diagnóstico del
archivo nuevo, el typecheck y la dependencia simulada no ejecutada. Sólo allí
altera después la lectura de perfiles para concederla a otro autenticado, invoca el mismo
comando integrado y exige que falle `acceptance: profile-cross-get`. Comprueba
salida 1, evidencia, etapa de integración no ejecutada, dependencia simulada no
alcanzada, puertos libres y Rules originales idénticas. Restablece las Rules de
esa copia y verifica destino inválido y CLI ausente (retira sólo su enlace local,
sin tocar dependencias compartidas), ambos con salida 2. Verifica
también una interrupción durante compilación, salida 130, sin arrancar emuladores.
Conserva
`negative-controls.json` y los reportes completos. El harness devuelve 0 sólo si
esas fallas esperadas y la limpieza quedan demostradas.

Los workflows Hosting llaman al workflow reutilizable `local-verification.yml`.
La verificación usa Ubuntu 22.04, Node/Java fijados, librerías públicas del sistema
para Chrome, la misma preparación y `verify:local`. No requiere secretos,
perfiles ni cachés anteriores. El checkout no conserva credenciales. Cada job de
Hosting declara `needs: verification`; preview conserva su condición de PR del
mismo repositorio. PRs de forks ejecutan la verificación sin recibir los secretos
de Hosting. No hay filtros por archivos ni `pull_request_target`.

El upload con `always()` retiene 14 días una lista explícita de reportes/logs
sintéticos de éxito o falla. No publica workspace, perfiles, cachés, archivos de
entorno ni bases. El análisis local de YAML y del grafo detecta dependencias
ausentes/cíclicas, secretos/permisos o saltos de controles; **no ejecuta GitHub**.
Estado de ejecución y límites: [evidencia histórica 5A](../testing/LOCAL_VERIFICATION_5A.md)
y [lint e integración 5B](../testing/FUNCTIONS_LINT_5B.md); [5C](../testing/SHARED_CONTRACTS_5C.md)
registra sincronización/watch y su incorporación local.
Sin ejecución remota: **CI preparada, pendiente de validación remota**; branch
protection/required checks no verificados ni modificados.

Fuera de este comando: lint del frontend, build/export productivo Next, todas las
pruebas de dominio del repositorio, handlers deshabilitados, recarga automática
de módulos Functions y sincronización general entre árboles,
migraciones, Rules desplegadas, configuración remota y aceptación Q1. No es
«calidad completa». F13 sigue abierto con mitigación parcial; F10/F11 y Q1
mantienen sus estados. F12 conserva la frontera documentada de 4A.

<a id="functions-lint-5b"></a>

### Lint de Functions — FASE 5B

Después de la preparación anterior, desde su `workspace`:

```sh
npm --prefix functions run lint
```

Usa ESLint **8.57.1**, parser/plugin TypeScript **6.21.0** y TypeScript **5.3.3**
del lockfile de Functions. No requiere Java, emuladores, navegador, perfiles ni
credenciales para el lint individual. La preparación común instala también las
herramientas del recorrido completo. No usa instalaciones globales, fix ni caché.

`functions/scripts/lintScope.cjs` descubre `.ts`, `.tsx`, `.js`, `.cjs` y `.mjs`
mantenidos dentro de Functions, incluidos scripts, tests, `.eslintrc.js`, archivos
legados de `src` y archivos nuevos. Sólo `functions/src` usa el proyecto TypeScript
productivo; TypeScript fuera de `src` usa el parser sin `project`. El tsconfig
productivo no se amplía. JavaScript/CommonJS y ESM usan sus modos de parser;
los callbacks de navegador declaran ese entorno. JSON/configuración de paquetes
no se presentan como JavaScript analizado.

Se excluyen dependencias, metadatos Git, sesiones descartables y el compilado
`functions/lib`, generado por `tsc` y sync. De `functions/shared` se excluyen
**únicamente los destinos exactos** de `syncTemplateContract.cjs`; el mismo lint
analiza cada fuente canónica correspondiente en `shared/`. El reporte enumera
cada relación fuente/copia. Un archivo nuevo no mapeado en `functions/shared`
sí se analiza; también se prueba un directorio mantenido `src/lib`. No se afirma
cobertura de todo el frontend ni de todo `shared/` fuera de esas autoridades.
La copia preparada reutiliza este inventario para llevar todas las fuentes de
Functions y su configuración, no una lista cerrada de tests.

La regla `no-var-requires` continúa en severidad error. Su excepción de
interoperabilidad permite sólo rutas exactas de contratos CJS del mapa de sync,
sin declaraciones `.d.cts`: un import TypeScript nativo exige esas declaraciones
(TS7016 comprobado). No se agregan declaraciones `any` ni se altera el proyecto
productivo. Se conservan seis excepciones por línea, con motivo, para cargas
síncronas diferidas de JSDOM, navegador y validación de efectos Admin. Se eliminan
tres supresiones previas que ya no corresponden; las supresiones sin uso son error.
Las pruebas exigen error para requires nuevos de módulos nativos o CJS no mapeados.

La ejecución local 5B registra **192 archivos, cero errores y 233 advertencias**:
199 `no-explicit-any`, 30 `@typescript-eslint/no-unused-vars` y 4 `no-unused-vars`
en JavaScript. Las advertencias se imprimen completas; no hay `--quiet`, rebaja
de errores ni presupuesto creciente. El detalle y la comparación de líneas base
se conservan en [la evidencia 5B](../testing/FUNCTIONS_LINT_5B.md).

El lint individual escribe `.local-isolation/lint-evidence.json` en la raíz de
la copia; `-- --report RUTA` permite elegir otro archivo. Incluye versiones,
archivos y configuración con SHA-256, diagnósticos por archivo/regla, totales y
código de salida: 0 sin errores, 1 con errores, 2 si falla configuración/ejecutor.
En `verify:local`, la etapa `lint` guarda `lint.log` y `lint-evidence.json` junto
al resto de la evidencia; imprime también todas las advertencias. Un error de
lint devuelve 1 y deja las etapas siguientes sin ejecutar. Fallas de ejecución,
timeout o reporte incompleto son infraestructura (3); dependencias ausentes se
rechazan antes como prerrequisito (2). CI conserva ambos archivos explícitamente
y sigue invocando sólo `verify:local`, sin reglas o comandos de lint duplicados en YAML.

<a id="shared-contracts-5c"></a>

### Contratos compartidos y watch — FASE 5C

El mapa ejecutable `functions/scripts/syncTemplateContract.cjs` es la única
autoridad de fuentes, destinos y fase del destino. Sus entradas se pueden
consultar sin generar copias; lint reutiliza ese mapa. No tratar todo
`functions/shared` como generado: un archivo nuevo no mapeado sigue siendo fuente
mantenida y entra al lint. No editar destinos para que diverjan de su autoridad.

Desde la raíz del árbol que se quiere comprobar o compilar, con los paquetes
instalados mediante la preparación reproducible anterior:

| Comando | Lee / observa | Escribe y resultado |
| --- | --- | --- |
| `npm --prefix functions run contracts:check` | Fuentes canónicas mapeadas y destinos clasificados como entrada (`functions/shared`) de este árbol | **Nada**. JSON en stdout, salida 1 si una fuente/copia falta, no es legible o difiere. Permite que `lib` no exista |
| `npm --prefix functions run contracts:check:built` | Las mismas fuentes y todos los destinos mapeados | **Nada**. Exige también salidas `functions/lib/shared`; ejecutar después de generar |
| `npm --prefix functions run contracts:sync` | Sólo fuentes del mapa de este árbol | Copias exactas en ambos destinos; no compila. Informa estado anterior, rutas y hashes de cada copia corregida; no reescribe bytes iguales ni elimina archivos no mapeados |
| `npm --prefix functions run build` | Fuentes canónicas, proyecto TypeScript de este árbol | Sync → compilador local instalado → check de todos los destinos. No anuncia listo si cambiaron entradas durante el build |
| `npm --prefix functions run build:watch` | Fuentes **canónicas** del mapa, `functions/src/**` y `functions/tsconfig.json` relativos a la ubicación del script | Sync inicial; ante cambios, sync → compilación → check secuenciales. Escribe en el mismo árbol; no observa sus destinos |
| `npm --prefix functions run test:contracts` | Fuentes de este árbol para crear otra copia descartable con el mecanismo 5A | Probes y compilados sólo en esa copia; reporte sintético `.local-isolation/contracts-evidence.json` y TAP. Sin servicios Firebase ni descargas |

En caso de fallo, los checks agregan un diagnóstico legible en **stderr**:
identifican fuente y copia, distinguen diferencias, faltantes y errores de lectura,
y muestran `npm --prefix functions run contracts:sync` para actualizar las copias
desde la raíz del árbol comprobado, seguido del comando para repetir el check.
Una diferencia de bytes no demuestra si cambió la fuente o se editó la copia.
Las fuentes ausentes o ilegibles deben resolverse antes de sincronizar. El JSON
de stdout y los códigos de salida (0/1) se conservan; el chequeo no escribe.
Los consumidores deben capturar stdout separado de stderr para parsear el JSON.
El launcher conserva `contracts-input.log` / `contracts-built.log` como JSON;
guarda el diagnóstico en el archivo correspondiente con sufijo `.stderr` y lo
muestra en la consola.

Los checks indican ruta de fuente/destino, fase, estado, tamaños, SHA-256 y primer
byte distinto, sin imprimir cuerpos. `contracts-input` se ejecuta antes de sync
en cada sesión del launcher. Una divergencia de entrada detiene la verificación:
corregir la autoridad si corresponde y ejecutar **explícitamente** sync, revisar
su informe y volver a preparar. El check posterior sólo acredita el estado
posterior: no demuestra que la entrada original ya estuviera actualizada.

El watch usa sondeo de contenido cada 150 ms y agrupa cambios durante 200 ms;
soporta reemplazos/renames y directorios nuevos sin depender de eventos del SO.
Si llegan cambios durante compilación, queda `pending` hasta una pasada sobre
la última versión. Los estados JSON `observing`, `pending`, `syncing`,
`compiling`, `ready`, `error` y `stopped` son visibles. `ready` acredita copias y
compilación estables, **no recarga de módulos**. Cada compilación tiene máximo
de 3 minutos; el watch permanece activo hasta Ctrl+C/SIGTERM. Usa el supervisor
de procesos existente y conserva diagnósticos en
`.local-isolation/contracts-build-*/` (sync/check JSON y log TypeScript por ciclo).

Una fuente eliminada/renombrada fuera del mapa produce error; restaurarla
provoca una recuperación explícita. No se borran destinos antiguos ni archivos
no mapeados. Ante falla al escribir un destino, repararlo y modificar/guardar
una entrada con bytes distintos, o reiniciar watch; los destinos no se observan
y no hay reintentos silenciosos. Cambios al mapa, scripts de build/watch,
dependencias o configuración fuera del tsconfig observado requieren reinicio.
Se conserva el comportamiento de `tsc` respecto de salidas huérfanas: esto no es
un limpiador general de `lib`.

**Límites entre árboles y consumidores:** `local:prepare` toma una foto del
repositorio original; `verify:local` y `dev` toman otra foto del árbol desde donde
se invocan. Ejecutar watch dentro de una preparación/sesión sólo observa y escribe
allí. Ninguno transporta cambios posteriores del original, ni Rules, secretos o
configuración personal hacia otra copia. Rehacer la preparación tras editar el
original y reiniciar `dev` para que cree una sesión con esas fuentes.

Un consumidor ya iniciado puede conservar el contrato en caché aunque ambos
destinos coincidan. Esperar `ready` y reiniciar el consumidor para cargar los
nuevos bytes. 5C comprueba HTML nuevo desde un proceso nuevo y conservación del
HTML anterior en un consumidor CommonJS ya cargado; no implementa ni demuestra
hot reload de Firebase Functions. La [evidencia 5C](../testing/SHARED_CONTRACTS_5C.md)
delimita F15 y la plataforma probada; no amplía handlers ni aislamiento.

## Archivos responsables de 4A y antecedentes

| Archivos | Motivo |
| --- | --- |
| `shared/firebaseEnvironment.cjs`, sus copias `functions/shared/` y `functions/lib/shared/`, `functions/scripts/syncTemplateContract.cjs` | Único contrato de destinos y su sincronización normal |
| `src/firebase.js`, `src/config/initializeFirebaseServices.js`, `src/firebaseInitializationContract.test.mjs` | Inicialización de los cuatro SDK, validación previa y reutilización segura |
| `functions/src/firebaseAdmin.ts` y consumidores `index.ts`, `analytics/service.ts`, `payments/publicationPayments.ts`, `countdownPresets/service.ts`, `dashboardHome/service.ts`, `siteSettings/pricing.ts`, `iconCatalog/repository.ts`, `decorCatalog/repository.ts`, `templates/editorialService.ts`, `templates/storageAssets.ts` | Centralizar la inicialización Admin existente sin cambiar propiedad de datos; acceso modular al SDK donde el emulador perdía constantes |
| `functions/src/payments/mercadoPagoClient.ts`, `emails/sesClient.ts`, `designerAi/service.ts` | Rechazo previo a construir clientes de efectos externos en local |
| `functions/src/utils/generarHTMLDesdeSecciones.ts`, `generarModalRSVP.ts` | CSP del HTML local y destino RSVP sin fallback productivo |
| `scripts/local/runLocal.cjs`, `session.cjs`, `networkGuard.cjs`, `functionsEntry.cjs`, `seedLocal.cjs`, `productionCompatibility.cjs` | Preparación, selección explícita, entorno limpio, transporte, handlers permitidos, fixtures y regresiones aisladas |
| `scripts/local/environment.test.mjs`, `backend.test.cjs`, `integration.test.mjs`, `browser.test.mjs`, `offline.test.mjs` | Evidencia de comportamiento y negativos, sin endpoints de prueba nuevos |
| Ambos `package.json`, `scripts/runNextDev.cjs`, `next.config.mjs`, `.gitignore` | Rutas habituales/alternativas seguras, binding local, CSP y artefactos temporales |
| `src/components/LocalEnvironmentNotice.jsx`, `src/pages/_app.js` | Señal visible del entorno y bloqueo de navegación externa |
| README, índice, Architecture Overview, F12 y este runbook | Navegación, responsables, evidencia y pendientes; no cambian Q1 ni otros hallazgos |

Durante 4A no se agregaron dependencias ni se modificaron lockfiles, `firebase.json`,
`.firebaserc`, `firestore.rules` o `storage.rules`.
4B2A modifica Rules y extiende la suite existente; consultar su
[comparación y límites](../testing/SECURITY_RULES_4B2A.md). Los comandos y
destinos de esta guía siguen siendo los mismos. 4B2B modifica únicamente Rules
de countdown y amplía esa suite con sus regresiones y checks existentes; no
agrega dependencias, destinos, modos ni handlers habilitados.
