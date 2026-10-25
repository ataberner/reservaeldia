# Autorización de borradores y privacidad de proveedores

Fecha: 2026-10-23. Base inspeccionada: `5ff9bb85`; árbol inicialmente limpio
en la primera implementación. Al retomar se preservaron las correcciones de
seguridad y los cambios concurrentes de publicidad. Durante la ventana apareció
el commit externo `2c4fe15a`; no se cambió el candidato inmutable ni se hicieron
commits, push o modificaciones del índice por esta operación.
Alcance inicial: preparar la revisión de un despliegue, sin ejecutarlo. La
validación inicial quedó completa; la ampliación de runtime/build/editor y sus
resultados se documentan más abajo. Las etapas anteriores a la autorización
remota sólo realizaron lecturas. La ejecución autorizada posterior está
**completa para Rules/Functions y retiro de tokens de los doce objetos, con una limitación
histórica aceptada del primer objeto** y se registra al final
con su hora de corte; no interpretar las
declaraciones históricas de cero modificaciones como estado actual.
No se implementó panel/alta/beta de proveedores.

**Actualización local posterior:** se implementaron la autorización común de
archivos y el artefacto Storage acotado, con una dependencia Firestore acotada
para proteger la autoridad de catálogos. La sección final de esta revisión
registra la validación y pendientes vigentes; los diagnósticos remotos anteriores
conservan su fecha y no se repitieron. En esa etapa local no se hizo ninguna
modificación remota.

**Estado operativo, corte 24/10/2026 11:36 ART (14:36 UTC): cierre acotado de
tokens completado con limitación histórica aceptada.** Los doce objetos tienen
token ausente y caché `private,no-store`: los once pendientes se modificaron y
verificaron con V2; el primero sólo se leyó y su conservación histórica de
ACL/metadata permanece **no verificable**, nunca aprobada retrospectivamente.
La evidencia previa de Rules/Functions conserva su corte 03:38:47 UTC y las
109 ACTIVE en Node 22; no se redesplegaron ni se repitió ese inventario.
Los tres servicios de borradores siguen sin nuevas restricciones. A/B continúa
pendiente por decisión del usuario. Ver el cierre de tokens al final; los
estados anteriores conservan su fecha y sus resultados originales.

En la revisión final aparecieron cambios concurrentes ajenos a esta tarea en
`src/pages/_app.js`, `src/components/analytics/`, `src/domain/analytics/openAiAds.js`
y `public/openai-ads/`, además de su documentación. Se preservaron y no forman
parte de estas correcciones. Las primeras corridas no los incluyeron; las copias
retomadas sí incluyen el frontend vigente. Esto no certifica la integración
publicitaria ni sus efectos remotos.

**Nota histórica, retiro local de Ads del 2026-10-23:** las referencias a Ads
y a esas rutas en este documento describen el estado anterior y los snapshots
validados en cada etapa. La integración y su consentimiento exclusivo fueron
retirados posteriormente del árbol local por pedido del usuario; ver el
[registro del retiro](../operations/OPENAI_ADS_MEASUREMENT.md). Esta nota no
altera la evidencia previa, los hashes ni los resultados de esas verificaciones,
y no acredita un despliegue del retiro.

## Hallazgos confirmados y solución

- Ambas copias usaban `set` Admin sobre un slug recibido. Ahora usan creación
  Firestore con precondición de inexistencia. Un reintento conserva el documento
  sólo si coincide dueño, plantilla y modalidad y no está en papelera.
- La copia HTML también podía reemplazar el objeto antes de establecer dueño.
  Ahora reserva el documento, fija fuente/generación/hash y crea bytes con
  `ifGenerationMatch: 0`. No elimina ni adopta objetos ajenos/huérfanos.
  Si otra solicitud completa documento y objeto entre las dos lecturas,
  vuelve a comprobar la reserva para resolver el reintento del mismo dueño.
- `verInvitacion` entregaba un borrador por slug sin autenticación. Ahora exige
  Bearer del dueño, comprueba revocación, papelera y vínculo documento/objeto.
  Responde con `private, no-store`. El lector público publicado se conserva.
- Proveedores publicables exponían el documento completo y sus imágenes.
  Su lectura queda administrativa. Sus fallbacks ya estaban excluidos; se
  agregaron casos de prefijos y descendientes para prevenir reaperturas.
- Storage sí concedía acceso autenticado a `borradores/**` mediante fallback.
  El namespace queda exclusivamente backend. `draftCreation` también se reserva
  al backend en Firestore: el cliente no puede crearlo, agregarlo, alterarlo ni
  borrarlo, evitando vincular un documento propio falso a bytes huérfanos.
- El CLI manual `generarPreview.cjs`, sin caller en package/src, navegaba sin
  autenticación y publicaba capturas con token, sin comprobar HTTP status. Se
  retiró con salida inmediata, sin importar SDKs ni resolver credenciales.

Las autoridades de privilegios existentes se mantienen. Los roles de
`usuarios/{uid}` no se utilizan para autorizar estos accesos. No se resuelve Q1
ni se revisan globalmente los fallbacks ajenos al alcance. Las landings siguen
requiriendo superadmin.

## Archivos y motivo

| Archivos | Motivo |
| --- | --- |
| `functions/src/index.ts` | Guardas de las dos copias y de la lectura HTML privada; sin cambiar exports/options de despliegue. |
| `functions/src/drafts/templateDraftCreation.ts` | Validación de IDs, precondición Firestore e identidad de reintento. |
| `functions/src/drafts/legacyHtmlDraft.ts` | Reserva/recuperación HTML, precondición Storage y comprobación de procedencia/bytes. |
| `functions/src/drafts/draftState.ts`, `draftTrashLifecycle.ts` | Extraer cálculo puro conservando semántica y reexports; evitar inicializar Admin al importar el helper de creación. |
| `firestore.rules`, `storage.rules` | Privacidad de proveedores, procedencia inmutable y aislamiento de bytes privados. |
| `scripts/local/draftAuthorization.test.mjs` | 14 tests de handlers reales, Auth, concurrencia, colisiones, recuperación y HTTP privado/público; incluye intercalado determinista del helper con otra creación HTTPS real. |
| `scripts/local/authFlows.test.mjs` | Registro, perfil, verificación, login y recuperación con SDK real y OOB local. |
| `scripts/local/rulesCases.mjs`, `rules.test.mjs` | Casos SDK de proveedores/artefactos/marcador; autoasignación de campos en perfil mediante cliente antes del sondeo de permisos. |
| `scripts/local/functionsEntry.cjs`, `runLocal.cjs` | Habilitación local acotada de copias/lecturas; archivos de integración y Rules secuenciales para limitar memoria. Las carreras explícitas dentro de cada test siguen paralelas. Firmante público sintético, visitas y render moderno bloqueados. |
| `src/domain/templates/service.creation.test.mjs`, `src/domain/invitations/readResolution.test.mjs` | Reintentos del consumidor sin otra creación, errores de permisos y resolución A/B. |
| `functions/providersStage1.test.mjs` | Actualizar invariantes de privacidad; no sustituye pruebas Rules SDK. |
| `scripts/generarPreview.cjs`, `generarPreview.test.mjs` | Retirar el CLI inseguro y verificar salida sin imports/efectos. |
| `docs/architecture/PROVIDER_DATA_MODEL.md`, `docs/contracts/SECURITY_CONTRACT.md`, `docs/operations/DEVELOPMENT_WORKFLOW.md` | Actualizar contrato de privacidad, reintentos, límites y superficies locales permitidas. |
| Este informe | Evidencia, límites y continuación reproducible. |

## Verificación inicial ejecutada (Node 22.13.1)

| Control | Resultado observado |
| --- | --- |
| Compilación final y contratos de entrada/build | PASS en la copia final; también pasó el typecheck previo con `tsc --noEmit`. |
| Lint final dentro de `verify:local` | 298 archivos, 0 errores, 233 advertencias. Se corrigió el error inicial `no-control-regex` de la validación nueva, conservando el rechazo de caracteres de control. |
| Regresiones frontend/CLI enumeradas abajo | 108/108 PASS; incluye landings superadmin. |
| `node --test functions/providersStage1.test.mjs` | 24/24 PASS; normalización e invariantes estáticos. No ejecuta Rules. |
| Ownership/package/configuración y discovery de tres codebases | 41/41 y los tres discovery PASS sobre el código final: default 103 endpoints, payments 3, email 3. Sin operaciones remotas. |
| Controles del lanzador, contratos y compatibilidad | Tooling 13/13; contratos 29/29; configuración 12/12; backend 7/7; compatibilidad 208/208. Cuatro emuladores demo iniciados. |
| Integración Auth + Admin/HTTP + SDK cliente | 18/18 PASS: 14 pruebas de autorización de borradores, registro/perfil/recuperación (padre y dos subtests) y la integración general existente. |
| Copias Admin/HTTP | PASS: A/B, colisiones, carreras reales entre callables, reintentos sin reset, reserva incompleta, huérfanos, papelera, marker/bytes alterados, tokens revocados/deshabilitados, lectura privada y entrega pública. El test adicional fuerza el intercalado entre lecturas con un helper real y otro creador HTTPS real. |
| Rules mediante SDK cliente | 2039/2039 ejecutados: 1760 requisitos aceptados y 267 caracterizaciones sin desvíos; 225/225 A3 y 137/137 D1. Sin errores de infraestructura. Los 12 casos de propuesta Q1 siguen sin aceptación: 10 difieren de la propuesta y 2 coinciden. No se presentan como requisitos resueltos. La etapa completa Rules/countdown/bienvenida pasó 2075/2075 tests. |
| Navegador integrado y offline posterior | Smoke 1/1 en 1280×800 y 390×844: Next 200, 14 bloqueos CSP confirmados y cero errores de inicialización Firebase. Offline 1/1; cierre confirmado y ocho puertos libres. |
| Identidad del código probado | SHA-256 de los 16 archivos de implementación/pruebas afectados incluidos en la copia coinciden con el árbol final. |
| `git diff --check` | PASS. |

Comando frontend/CLI ejecutado:

```powershell
node --test --test-concurrency=1 --test-reporter=tap src/hooks/useDashboardAuthGate.test.mjs src/lib/auth/landingAuthSession.test.mjs src/lib/auth/dashboardAuthRecovery.test.mjs src/domain/invitations/readResolution.test.mjs src/domain/dashboard/editorSession.test.mjs src/hooks/useDashboardTemplateModal.test.mjs src/hooks/useDashboardTemplateModal.controller.test.mjs src/domain/templates/service.creation.test.mjs src/pages/profesionales.test.mjs src/pages/lugares.test.mjs src/hooks/dashboardStartupReaders.test.mjs scripts/generarPreview.test.mjs
```

Corrida final reproducible desde la raíz:

```powershell
node scripts/local/runLocal.cjs verify
```

Evidencia final: `.local-isolation/reports/run-QQhsVO/result.json`, estado
`passed`, código 0, todas las etapas completas, sin tests omitidos/cancelados.
La copia es `.local-isolation/session-s5s8HU`; conserva manifiestos de fuentes,
hashes de Rules y evidencia de reglas, navegador, integración, lint y limpieza.
Duración: 17:45:39–18:02:40 UTC del 23/10/2026.

Se conservan también las corridas anteriores bajo `.local-isolation/reports/`:
`run-SUxVSY` y `run-H12uYf` (timeout JSDOM), `run-Ocr0QE` (ownership pasa, copia
falla por ENOSPC), `run-Uhdp8b` (integración interrumpida por OOM).
`run-Uhdp8b/manual-cleanup.json` registra el cierre posterior del árbol propio
PID 11336 y la liberación de los ocho puertos. Se conserva el fallo original del
launcher; no se reetiquetó como éxito. El cierre necesitó permiso de ejecución
fuera del sandbox para `taskkill` del árbol exacto creado por esta tarea.

Al retomar, `run-RQuXDF` terminó 16/17 en integración: el fixture de plantilla
no publicada usaba `borrador`, que no pertenece al contrato editorial. Se corrigió
el fixture a `en_proceso`; no se cambió el fallback legacy del normalizador
(`shared/templates/contract.js`, `normalizeTemplateEditorialState`). La corrida
final incluye esa corrección y la nueva regresión de la carrera entre lecturas.
Los timeouts de discovery no se ampliaron ni se debilitaron las assertions.

Entorno: Node 22.13.1 (Functions declara Node 20), CLI 14.4.0, Java 25.0.2,
Firestore Emulator 1.19.8, Storage Runtime 1.1.3. En el primer intento Windows
informó falta de memoria de paginación y un proceso terminó con
`Fatal process out of memory`.
Se liberaron copias temporales propias y 12 JAR duplicados de sesiones antiguas
detenidas, verificando igualdad con la caché canónica que se preservó. No se
borraron snapshots de código ajenos, reportes ni datos de usuario. Quedaban
aproximadamente 300 MB de RAM y 370 MB de disco libres. Tras liberar recursos el
usuario, la corrida completa terminó sin OOM. No se cambió la configuración del
equipo ni se serializaron las carreras de los handlers mediante inspector.

Límites: el navegador comprueba inicialización, dos viewports y aislamiento CSP;
no sustituye un E2E visual completo del editor/dashboard. La copia omite assets
reales y por eso registra algunos 404 locales. Registro/login/recuperación se
probaron con el SDK Auth real, códigos OOB del emulador y handlers reales de
perfil; las redirecciones/dashboard tienen las regresiones frontend enumeradas.
El envío real de correos está deshabilitado. El render moderno completo continúa
bloqueado en local: se probaron sus rechazos de autorización antes de renderizar.
No se ejecutaron build/export productivo, CI remota ni validaciones contra
servicios remotos.

## Compatibilidad de las correcciones iniciales

1. HTML histórico sin marcador/vínculo verificable queda cerrado: preview 404 y
   retry `failed-precondition`. Documento/bytes se conservan; reconciliar requiere
   inventario y autorización posterior. URLs privadas sin Bearer devuelven 401.
   El flujo Konva actual no utiliza ese lector legacy.
2. La reconstrucción HTML requiere que siga disponible la generación fuente
   fijada. No hay transacción distribuida entre servicios; una eliminación
   concurrente puede dejar un residuo cerrado, nunca adoptar/reemplazarlo.
3. La petición inicial de revalidar con Node 20 queda sustituida por la
   alineación a Node 22 descrita abajo, ante el retiro de Node 20. No usar
   inspector secuencial para certificar carreras entre invocaciones.
4. Revisar la compatibilidad legacy mediante inventario autorizado y acordar
   su recuperación. Revisar hashes, IAM, ACL, tokens/URLs antiguas y cachés
   remotas: Rules no revocan accesos por token/ACL ya emitidos. La primera fase
   no los inspeccionó; la observación acotada posterior figura abajo y no
   constituye revocación ni certificación completa de accesos.
5. Despliegue posterior coordinado de Rules y Functions, con canarios sintéticos
   autorizados y observación de denegaciones. Un rollback debe conservar las
   precondiciones y el cierre de lecturas; no restaurar las vulnerabilidades.

No se inicia la beta, no se publica el directorio ni se avanza al segundo paso.

## Preparación posterior del despliegue (2026-10-23)

### Runtime y alcance comprobados en el árbol local

Se revisaron `package.json` raíz, los de `functions`, `functions-payments`,
`functions-email` y `scripts/local/tools`, sus locks, `firebase.json`, las dos
configuraciones de rollback y los tres workflows. Ahora todos declaran Node 22;
`firebase.json` declara explícitamente `nodejs22` en las tres codebases. Los
locks sólo cambian `packages[''].engines.node`, sin resolución de dependencias.
No se cambió generación, región, exports, registry, options ni entrypoints.

`.node-version` fija **22.23.4** para ejecución local y los tres jobs CI. El
launcher, preparación y gate de ownership rechazan versiones mayores distintas
de 22, patches anteriores al pin y prereleases. Discovery lee el runtime de la
configuración, en lugar de seguir hardcodeando Node 20. Los snapshots de tests
históricos que describen Node 20 se conservan con su carácter histórico.

La elección se apoya en el [calendario oficial de Google](https://docs.cloud.google.com/functions/docs/runtime-support):
Node 20 se deprecó el 30/04/2026 y se retira el 30/10/2026; Node 22 admite ambas
generaciones, con deprecación 30/04/2027 y retiro 31/10/2027. Se usa la
[revisión de seguridad 22.23.4, publicada el 21/10/2026](https://nodejs.org/en/blog/release/v22.23.4).
[Firebase da precedencia al runtime de firebase.json](https://firebase.google.com/docs/functions/manage-functions#set_nodejs_version)
sobre engines. El pin fija las herramientas locales/CI, **no el patch administrado
por Google ni el runtime realmente desplegado**. Además, el `openai@7.5.0` ya
instalado declara Node >=22; no se actualizó ese paquete.

La lista exacta está en [DRAFT_PROVIDER_RUNTIME_TARGETS.json](DRAFT_PROVIDER_RUNTIME_TARGETS.json):
**109 Functions: 103 default, 3 payments y 3 email**, todas `us-central1` en el
registro local. Tres corrigen seguridad (`copiarPlantilla`, `copiarPlantillaHTML`,
`verInvitacion`); las otras 106 también requieren actualizar runtime para completar
la alineación. Cambiar engines/configuración no las actualiza remotamente.

Se descargó el binario oficial portable a `.local-isolation/tool-cache`, sin
alterar la instalación global de Node. SHA-256 del ZIP Windows x64 contrastado
contra `SHASUMS256.txt` oficial:
`cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20`.

Archivos adicionales de esta preparación:

| Archivos/módulos | Motivo |
| --- | --- |
| `.node-version`; cinco `package.json` y sus locks; `firebase.json` y configuraciones de rollback | Alinear pin local, engines y runtime de las tres codebases, sin actualizar dependencias. |
| Tres `.github/workflows/*.yml`; `scripts/local/ciChecks.cjs`, `environment.test.mjs`, `tooling.test.mjs` | Usar el mismo pin en CI y comprobar estructura/orden del setup. No se ejecutó ningún workflow remoto. |
| `scripts/local/session.cjs`, `prepareLocal.cjs`, `verifyFunctionsOwnership.cjs`; discovery/tests de packages payments/email | Guard de runtime, copia del pin y lectura de runtime configurado durante discovery. |
| `package.json` (`export`, `verify:release:local`); `staticBuild.cjs`, `serveExport.cjs`, `staticBuild.test.cjs`, `runLocal.cjs` | Export de Next compatible y dos recorridos aislados, con validación de assets/servidor y guardas existentes. |
| `editorFlow.browser.test.mjs`, `editorFlowFixtures.mjs`, `browser.test.mjs`, `evidence.cjs` | Recorrido real con datos sintéticos, IP loopback comprobada y evidencia limitada a JSON/PNG aprobados. |
| `functionsEntry.cjs`, `rules.test.mjs` | Permitir sólo el lector `getAdminAccess` en el arnés; comprobar autenticación/claims y mantener deshabilitados mutadores. No cambia el entrypoint productivo. |
| `inventoryLegacyDrafts.mjs`, `draftInventoryModel.mjs`, `draftInventoryModel.test.mjs` | Inventario REST de sólo lectura, clasificación conservadora y pruebas offline. |
| `LEGACY_DRAFT_READ_ONLY_INVENTORY.md`, `DRAFT_PROVIDER_AUTHORIZATION_DEPLOYMENT.md`, `DRAFT_PROVIDER_RUNTIME_TARGETS.json`, índice y workflow documental | Procedimiento reproducible, alcance exacto, secuencia/recuperación y límites de evidencia. |

No se modificaron landings, editor ni diseño en esta ampliación. Las correcciones
de seguridad anteriores y los cambios ajenos de publicidad se preservaron.

### Inventario remoto de sólo lectura: ejecutado y parcial

Ejecución observada a las **18:50:50 UTC del 23/10/2026**, con el runner
`scripts/inventoryLegacyDrafts.mjs`, ADC existente y token efímero sólo en memoria.
No se guardaron ni imprimieron credenciales. El runner sólo permite GET y POST
`documents:runQuery`, con destino exacto, proyección de campos, redirects
rechazados y límites duros. No invoca handlers de aplicación: incluso un GET a
una Function podría tener efectos que este inventario no necesita.

Límites: 200 documentos entre consulta/joins/plantillas, 200 objetos por prefijo,
200 requests, 10 MiB totales, 2 MiB por HTML y 180 segundos. Se activaron
`--inspect-acl --verify-hashes`. No se descargó ningún HTML ni foto: no había
objetos HTML para verificar. Fuente y ejecución quedan ligadas por hashes en
`.local-isolation/inventory-nmiugX/execution.json`; reporte saneado en
`.local-isolation/inventory-nmiugX/inventory.json`.
El registro fija los hashes del runner y del modelo de clasificación, no un
snapshot completo de dependencias transitivas. En esta muestra no se ejecutaron
lecturas de plantillas ni verificaciones de bytes/hash.
Se preservan en el mismo directorio `inventoryLegacyDrafts.executed.mjs` y
`draftInventoryModel.executed.mjs`; el segundo se reconstruyó desde el patch
posterior y sólo se guardó tras comprobar igualdad exacta con el SHA registrado.
Son copias de evidencia, no entrypoints para ejecutar desde esa ubicación.

| Observación real | Resultado y límite |
| --- | --- |
| Firestore `borradores` con proyección | 200 documentos: 197 con editor Konva, 3 en papelera. La consulta alcanzó su límite; no representa la colección completa. |
| Storage `borradores/` | 0 objetos; listado del prefijo completo al momento de la lectura. No demuestra inexistencia en otros prefijos, generaciones o un estado anterior. |
| Storage `proveedores/` | 200 objetos; listado parcial por límite. ACL de esos 200 observadas. |
| Tokens/caché | 1 de esos objetos de proveedor tiene metadata de token de descarga; los 200 tienen directiva de caché pública. No se solicitó ninguna URL/token ni se comprobó descarga pública efectiva. |
| ACL de los objetos observados | No se observaron grants `allUsers` ni `allAuthenticatedUsers` en esos 200. Otros principals y permisos efectivos no quedan certificados. |
| Configuración directa del bucket | Uniform Bucket-Level Access desactivado; Public Access Prevention no aparece `enforced`. IAM directo consultado sin binding de principals públicos; IAM heredado y default ACL quedan fuera. |
| Uso/resultado | 19 peticiones, 347173 bytes, 0 hashes, 0 errores de API; salida lógica **2, inventario incompleto por alcance**. No hubo escrituras. |

No se identificaron HTML compatibles ni recuperables en la muestra; tampoco hay
un HTML observado cuya lectura previa pueda afirmarse que se pierde. Los tres
documentos en papelera ya deben permanecer bloqueados. Esto **no equivale a
resolver el inventario histórico completo**. El script distingue: `compatible`
sólo tras metadata + SHA de bytes; `recovery_verifiable` sólo con reserva válida,
fuente/generación/hash y plantilla disponible; `block` para vínculos ausentes,
incompatibles o papelera; `pending_hash`/`unresolved` cuando falta evidencia.
Ausencia de editor explícito con marker válido se deja sin resolver, ya que el
lector conserva un fallback legacy y la proyección no lee contenido personal.
Ninguna categoría permite reconstruir propiedad por suposición; la coincidencia
de metadata/hash tampoco acredita autoría histórica de campos antes modificables.

La presencia de un token es una vía potencial que Rules no revoca. Su alcance
real, otros tokens fuera de la muestra, URLs firmadas emitidas, IAM heredado,
default ACL y copias/cachés distribuidas siguen pendientes. No se revocó token,
ACL ni permiso alguno. El procedimiento para repetir/extender explícitamente
la lectura está en [LEGACY_DRAFT_READ_ONLY_INVENTORY.md](../operations/LEGACY_DRAFT_READ_ONLY_INVENTORY.md).

Consumidores comprobados por inspección: el dashboard actual crea mediante
`src/domain/templates/service.js` y abre/guarda documentos Konva a través de los
readers/hooks del editor; no consume `copiarPlantillaHTML` ni `verInvitacion`.
La copia legacy devuelve una URL que en el candidato local exige Bearer; no se
verificó ese comportamiento desplegado. Una navegación directa sin cabecera no
es un acceso autorizado en este candidato. El CLI `generarPreview.cjs`
está retirado. En proveedores, administración usa los servicios/herramientas
existentes y las landings siguen superadmin; enlaces a archivos/token previamente
emitidos son un canal distinto de las lecturas SDK. Estos hechos del código no
constituyen una medición de tráfico real ni descartan consumidores externos.

### Verificación adicional y artefactos

Los nuevos comandos son `node scripts/local/runLocal.cjs build` y
`npm run verify:release:local`, documentados en
[DEVELOPMENT_WORKFLOW.md](../operations/DEVELOPMENT_WORKFLOW.md). Ambos usan copia
sin credenciales y bloqueo de red. El primero comprueba compilación/export con
configuración pública productiva sin conectarse a servicios reales; el segundo
sirve otro export optimizado conectado sólo a emuladores y recorre la UI.

`scripts/local/staticBuild.cjs` conserva el guard de red y limita únicamente los
workers de Next; `serveExport.cjs` sirve GET/HEAD dentro de `out` con CSP local y
sin escapes por paths/enlaces. La verificación de release comprueba coherencia
de buildId/referencias, no una firma criptográfica de todos los chunks. Next
15.3.2 ya exporta con `next build`; se corrigió `npm run export` para invocar el
build existente, según [la documentación de Next 15](https://nextjs.org/docs/15/pages/guides/static-exports).

`editorFlow.browser.test.mjs` y `editorFlowFixtures.mjs` usan cuentas/plantillas
sintéticas, login de la UI, creación real, doble click/teclado en Konva, autosave
real corroborado en Firestore y reapertura. No se simula Auth ni se modifica
estado del editor por bridges; sólo se observa geometría/texto. Mobile prueba
login y reapertura; no prueba edición táctil completa. Las vistas HTML van al
lector Functions, sin certificar rewrites ni caché de Hosting. Publicación,
pagos, render externo y correos reales continúan deshabilitados.

Evidencia adicional con **Node 22.23.4** (las corridas fallidas se conservan):

En los comandos de esta tabla, `node` fue el binario portable verificado:
`& '.local-isolation/tool-cache/node-v22.23.4-win-x64/node.exe'` en PowerShell.
No se reemplazó la instalación global 22.13.1. Por ejemplo, la última corrida fue
`& '.local-isolation/tool-cache/node-v22.23.4-win-x64/node.exe' scripts/local/runLocal.cjs release`.

| Comando/recorrido | Resultado ejecutado | Evidencia local |
| --- | --- | --- |
| `node scripts/local/runLocal.cjs verify` | Ownership 41/41 y builds/discovery de las tres codebases; tooling 17/17; contratos/watch 29/29; configuración 14/14; backend 7/7; compatibilidad 208/208. Lint: 298 archivos, 0 errores, 233 warnings. Compilación y sincronización pasaron. El recorrido completo terminó con código 3 por el preflight obsoleto de Rules explicado abajo. | `.local-isolation/reports/run-L7xaCe/result.json` |
| Regresiones frontend/CLI y `functions/providersStage1.test.mjs`, con entorno limpio y guard de red | 108/108 y 24/24, sin skips. Se usó el código compilado de la copia anterior tras comparar fuentes y Rules. El test del CLI retirado ejecuta un hijo con imports prohibidos; no hereda el guard del padre. | `.local-isolation/extra-unit-SMC4QV/result.json` y sus dos logs TAP |
| `node scripts/local/runLocal.cjs build` | PASS: TypeScript, contratos, build/export optimizado de Next 15.3.2, captura/finalización y coherencia de assets. Configuración pública productiva, sin credenciales ni servicios remotos. 16 páginas generadas, 44 referencias a assets y 68 archivos estáticos. | `.local-isolation/reports/run-gFDD5m/result.json`, `build-evidence.json`, `build-export.log` |
| Primera corrida `node scripts/local/runLocal.cjs release` | Build/export demo, integración 18/18 y smoke inicial pasaron. El recorrido del editor falló al iniciar sesión por resolución DNS de loopback en Chromium; no se presenta como recorrido funcional aprobado. | `.local-isolation/reports/run-VSeWyQ/result.json`, `editor-flow-evidence.json` y capturas de fallo |
| Segunda corrida `release` | Build/export, integración 18/18 y smoke corregido 1/1 pasaron. Login UI y creación real pasaron; edición se detuvo por oclusión del panel y eventos de clic incorrectos en el arnés. Cero errores de página; cierre de fixtures/navegador/servicios aprobado. | `.local-isolation/reports/run-8qLZqy/result.json`, `editor-flow-evidence.json` y cuatro capturas sintéticas |
| Tercera corrida `release` | Build/export, integración 18/18 y smoke 1/1 pasaron. El recorrido visual completó tres checks: login/dashboard, creación propia y edición con puntero/teclado persistida por autosave. Falló por timeout al esperar el canvas en la primera reapertura desde el dashboard; no alcanzó las comprobaciones posteriores. Cinco capturas sintéticas, cero errores de página y limpieza de fixtures/navegador/servicios aprobada; ocho puertos libres. La etapa offline no se ejecutó. | `.local-isolation/reports/run-72wKs9/result.json`, `editor-flow-evidence.json`, `editor-flow.log` y `editor-flow-screenshots/` |
| Cuarta corrida `release` | PASS completo, incluido offline y limpieza: build/export, integración 18/18, smoke 1/1 y recorrido visual 1/1 con ocho checks y 15 capturas. La revisión de la captura de B mostró que aún había un loader; se reforzó después la espera de dashboard listo antes de las aserciones negativas y se mejoró el encuadre de las tarjetas. Esta corrida conserva su resultado, pero no prueba ese refuerzo posterior. | `.local-isolation/reports/run-jqI4Rl/result.json`, `editor-flow-evidence.json` y `editor-flow-screenshots/` |
| Corrida final `release`, con dashboard cargado antes de comprobar B | **PASS**, código 0: configuración 14/14, backend 7/7, compatibilidad 208/208, compilación/contratos, cuatro etapas build/export, integración 18/18, smoke 1/1, editor 1/1 y offline 1/1. Ocho checks visuales, 15 capturas, cero errores de página y una única creación moderna. Limpieza aprobada y ocho puertos libres; sin skips/cancelaciones. | `.local-isolation/reports/run-5WOXBV/result.json`, `editor-flow-evidence.json`, `source-revalidation.json` y `editor-flow-screenshots/` |
| `node scripts/local/runLocal.cjs rules`, tras ajustes de preflight y readiness | **2075/2075 PASS**, sin skips/cancelaciones. Los 2039 casos Rules incluyen 1760 requisitos aceptados y 267 caracterizaciones sin desvíos; cero errores de infraestructura. Q1: 12 propuestas no aceptadas, 10 diferencias y 2 coincidencias, separadas. También pasaron las carreras Admin y el lector de claims frente al perfil autodeclarado. Limpieza aprobada y ocho puertos libres. | `.local-isolation/reports/run-cojn7u/result.json`, `rules-evidence.json` y `rules-countdown.log` |
| Tests del inventario | 23/23 offline tras el ajuste conservador de paths históricos; no repite lectura remota. | `node --test scripts/draftInventoryModel.test.mjs` |

La corrida `verify` detectó que su preflight aún esperaba `getAdminAccess`
deshabilitada (400); el lector local habilitado para el dashboard devuelve 401
a anónimos. Ese fallo de hook impidió ejecutar 2043 casos dependientes: **no son
2043 denegaciones de seguridad comprobadas**. Se corrigió la expectativa y se
añadió comprobación del lector con perfil autodeclarado, claims verificados y
retirada del claim; los mutadores continúan deshabilitados. La copia conserva
la falla original. La reejecución separada `run-cojn7u` pasó completa.

En Chromium, `MAP * ~NOTFOUND, EXCLUDE localhost` también impedía resolver
`127.0.0.1`. Un probe local controlado confirmó `ERR_NAME_NOT_RESOLVED` antes y
200 después de excluir explícitamente ambas direcciones de loopback. Se
corrigieron los dos tests de navegador y el smoke ahora exige HTTP 200 por IP
literal. CSP, allowlist de destinos y bloqueo de red externa se mantienen.
No se relajaron asserts de autorización ni se serializaron las carreras.

La reejecución `rules` en `.local-isolation/reports/run-pBfb8X` terminó con código
3 antes de las pruebas: readiness excedió 240 segundos. Compilación/contratos y
limpieza pasaron; los ocho puertos quedaron libres. El primer encabezado CLI
apareció a +177,75 s y discovery comenzó a +222,88 s. El corte ocurrió cuando
discovery llevaba 18,54 s de sus 60 s permitidos. Los timestamps se generan al
invocar el logger de CLI, antes del transporte; no son tiempos inferidos del
flush. La causa exacta de esa lentitud no quedó demostrada.

Se ajustó sólo readiness total a **300 s**: 222,88 s observados, discovery 60 s,
probe 10 s y polling suman unos 294 s. Se conservan discovery/probe, cuatro
emuladores, autenticación 401, destinos, guardas, ausencia de retry de suites y
concurrencia real. Sigue siendo una espera acotada y exige una nueva ejecución;
no transforma la corrida interrumpida en válida.

La segunda corrida visual confirmó login/dashboard y creación propia. La captura
mostró que el puntero dejaba abierto un panel por hover, que tapaba el texto. El
test ahora lo cierra con un clic real en el nombre de documento del header y
exige `elementFromPoint` sobre el canvas antes de editar. Además, Puppeteer
24.14.0 requiere `count: 2` para emitir dos pares down/up; `clickCount: 2` sólo
marcaba un único clic y no activaba el doble clic interno de Konva. Se corrigió
el test, conservando teclado, autosave y comprobaciones de persistencia reales.
No se cambió el producto ni se usaron bridges para mutar el editor.

En `run-72wKs9`, la edición y el autosave ya quedaron comprobados, pero la
primera reapertura agotó 60 s esperando el canvas. El código muestra que las
tarjetas pueden montarse antes de que el loader libere `inert`: que el clic se
haya perdido en esa transición es una **inferencia**, no una causa demostrada
por aquella corrida, que no registraba el destino del clic ni el evento.
El ajuste posterior de `clickCardAction` espera que el botón esté conectado,
habilitado, visible, sin ancestros `inert`/`aria-hidden`, sin loader y con
geometría estable; además comprueba que `elementFromPoint` alcance el control
antes del clic físico. Para reabrir, observa pasivamente el evento real
`abrir-borrador`, exige su slug esperado y verifica ese slug en la URL antes de
esperar el editor. El listener se retira al terminar; no despacha eventos ni
modifica estado o persistencia de la aplicación. Se agregaron observaciones
acotadas del control para distinguir la próxima falla, sin cambiar el producto
ni presentar esta corrección del arnés como una reapertura ya aprobada.

Los cambios posteriores al gate general se limitan al arnés:
`browser.test.mjs`, `editorFlow.browser.test.mjs`, `rules.test.mjs` y el presupuesto
de readiness en `runLocal.cjs`. El código de aplicación, Rules y configuración de
runtime mantienen sus hashes. Se contrastan los manifiestos de cada reejecución;
la clasificación offline del inventario tiene evidencia separada.

El ajuste final del inventario distingue un marker inválido de un path histórico
aceptado por el lector pero fuera de la política segura del collector: este último
queda `unresolved`, sin consultas automáticas. Los hashes de la ejecución remota
anterior se conservan; el cambio posterior del modelo no altera esa muestra de
197 Konva, 3 papelera y ningún HTML observado.

Advertencias ajenas a este alcance: 233 warnings de lint, base Browserslist de
17 meses, ausencia de caché de build y aviso `sun.misc.Unsafe` del runtime Storage
con Java 25. No se actualizaron dependencias para silenciarlas. Esta evidencia es
de Windows/Java 25; CI usa Ubuntu/Java 21 y no se ejecutó remotamente. El nuevo
recorrido `release` es un comando local explícito, no un gate agregado a los
workflows: éstos mantienen `verify` y sólo alinean su Node. Discovery de las 109
Functions acredita carga/manifiestos, no todos sus caminos de render, dependencias
nativas, comunicaciones o pagos; éstos requieren validación específica en el
entorno de despliegue autorizado. Q1 conserva sus resultados separados.

**Cierre local:** `run-5WOXBV` completó el recorrido entre **20:29:55 y
20:41:15 UTC del 23/10/2026**. Se observaron login real, creación desde plantilla,
edición por puntero/teclado y autosave confirmado en Firestore; reapertura desde
tarjeta y recarga completa; login/reapertura en móvil; ausencia del borrador de A
en B con el dashboard ya cargado. El lector HTML devolvió 200 al dueño, 401 al
anónimo y 403 a B, con `private, no-store`; la publicación sintética fue pública
en ambos viewports y devolvió 404 al pausarla. Son pruebas locales con fixtures,
no observaciones del servicio desplegado.

Se inspeccionaron las capturas finales de tarjetas (02/07), editor reabierto
(05/08), cuenta ajena tras cargar (09), HTML privado (10), público móvil (14)
y publicación pausada (15). Las capturas de login y denegaciones HTTP también
se inspeccionaron en `run-jqI4Rl`. Fuentes/iconos remotos bloqueados, thumbnails
con el recorte actual y el aviso demo no constituyen un defecto de autorización
ni una certificación de paridad visual de assets productivos. No se cambió diseño.

La evidencia del gate se completa **combinando corridas**, sin declarar que el
`verify` general fallido pasó. Comparación SHA-256 contra el árbol final, registrada
a las 20:41:53 UTC en `run-5WOXBV/source-revalidation.json`: **1385/1385 fuentes
coinciden con la release final**. Del gate general coinciden 1381/1385: las cuatro
diferencias son exactamente los tests de navegador/Rules y readiness descritos;
se ejercitaron de nuevo en `rules` y `release`. De `run-cojn7u` coinciden 1384/1385,
con única diferencia en el test visual posterior. El build de configuración
productiva conserva idéntico código de aplicación, Rules y configuración de
runtime. Los manifiestos cubren los inputs copiados, no toda la documentación ni
dependencias transitivas del toolchain. `git diff --check`: PASS.

Los límites restantes son explícitos: CI remota no ejecutada; registro y
recuperación comprobados mediante SDK/OOB del emulador, no con correos reales;
mobile cubre reapertura, no toda la edición táctil; render/publicación/pagos
externos y rewrites/cachés de Hosting no certificados. Las cifras de la sección
inicial conservan su fecha/runtime y no sustituyen esta revalidación.

### Estado al terminar la validación local (20:41 UTC; actualizado abajo)

El plan concreto está en
[DRAFT_PROVIDER_AUTHORIZATION_DEPLOYMENT.md](../operations/DRAFT_PROVIDER_AUTHORIZATION_DEPLOYMENT.md):
contención verificada de los tres endpoints y solicitudes viejas; Storage Rules;
Firestore Rules; lector privado; ambos creadores; canarios y drenaje; después,
los 106 targets restantes de runtime en lotes explícitos. No incluye Hosting,
índices, beta ni cambios de diseño. `deployFunctionsBatched.cjs` no sirve para
este plan porque sólo descubre default y elimina predeploy.

**No hay transición atómica entre Rules y Functions.** Sin contención servidor,
los writers Admin anteriores pueden sobrescribir aunque las reglas ya sean
nuevas, y el lector anterior conserva su exposición hasta actualizarse. No se
aplicó ni probó contención, IAM de endpoints, versiones/tráfico desplegados ni
canarios remotos. Son prerrequisitos de ejecución. La recuperación conserva las
reglas, marker y precondiciones: revisión correctiva segura o mantener el
endpoint cerrado, nunca restaurar las versiones vulnerables ni adoptar objetos.

**Listo para revisión técnica del candidato y del plan; no listo para ejecutar
el despliegue.** La validación local solicitada quedó completada con los límites
anteriores. Bloqueos concretos de ejecución: resolver la vía potencial por token
detectada y la cobertura pendiente del inventario histórico; contrastar
targets/runtime/reglas/IAM remotos; definir, autorizar y verificar contención,
drenaje y canarios; aceptar el impacto legacy con recuperación verificable.
Q1 sigue siendo propuesta no aceptada; no se mezclan sus 12 casos con fallas de
esta implementación. No se ejecutó despliegue ni se avanzó a la beta.

## Cierre remoto de sólo lectura — 23/10/2026

Esta sección actualiza los pendientes anteriores; no reetiqueta las corridas
históricas ni certifica ejecución productiva de los handlers. Se releyeron Git,
AGENTS y las autoridades aplicables. HEAD sigue en `5ff9bb85`; se preservaron
seguridad, runtime, publicidad y el cambio ajeno de `.firebase/hosting.b3V0.cache`.
No se hicieron commits, push, dispatch,
deploy, escrituras de datos, cambios IAM/ACL/Rules ni revocaciones. Los access
tokens necesarios para las lecturas se resolvieron desde ADC existente sólo en
memoria; no son los tokens de descarga inventariados.

A las **21:42:54 UTC**, los **1385/1385** inputs del manifiesto de
`run-5WOXBV` seguían idénticos: evidencia en
`.local-isolation/remote-authorization-20261023/source-revalidation.json`.
No se repitieron suites locales aprobadas. Los nuevos programas de auditoría se
probaron por separado; no forman parte del código desplegable.

### Estado remoto observado: Functions, Rules y permisos

`scripts/auditRemoteAuthorization.mjs` usa allowlist de APIs de control, proyecto
fijo, proyecciones sin variables de entorno/Secrets, presupuestos y checkpoints.
Sólo GET y POST `getIamPolicy` de Resource Manager (operación de lectura); no
invoca Functions. La ejecución inicial terminó **21:34:43 UTC**, con 17 requests
y 114223 bytes. Una lectura adicional del ruleset inmutable de Storage agregó
2620 bytes para revisar su semántica; los listados anteriores se reutilizaron.
El reporte conserva cada corrida y fechas de pasos nuevos. Es una secuencia de
lecturas, no un snapshot transaccional.

Comando ejecutado con Node portable 22.23.4:

```powershell
node scripts/auditRemoteAuthorization.mjs --execute-read-only .local-isolation/remote-authorization-20261023
```

| Recurso observado | Evidencia | Implicación |
| --- | --- | --- |
| Functions v1/v2, todas las regiones | **109/109**, sin faltantes/extras; `us-central1`; **109 nodejs20**; 108 GEN_2 y `email/onUserCreatedWelcomeEmail` GEN_1 | El cambio de runtime aún no se desplegó. No hay migración de generación prevista. |
| Codebases | 103 default, 3 payments, 3 email, sin diferencias contra el registro | La CLI 14.4.0 omite la etiqueta para default. Se corrigió esa interpretación del auditor, conservando el reporte inicial; 103 etiquetas ausentes no son deriva. |
| Los tres endpoints corregidos | ACTIVE, ingress público, timeout 60 s; servicios `copiarplantilla`, `copiarplantillahtml`, `verinvitacion`, 100% de tráfico a última revisión Ready | Hay que contener los servicios reales antes de mezclar Rules nuevas con escritores/lector viejos. ACTIVE no prueba drenaje. |
| IAM de esos tres servicios Cloud Run | Cada uno tiene `roles/run.invoker` para `allUsers`, sin condición; IAM de la Function por sí solo no muestra ese grant | La contención propuesta retira sólo ese miembro, con etag fresco, conservando otros bindings. No se aplicó. |
| IAM del proyecto y ascendencia | Sin miembros `allUsers`/`allAuthenticatedUsers`; proyecto sin parent informado; un principal no público con run.invoker. Se observaron también storage.admin y serviceAccountTokenCreator | No se observaron grants públicos heredados del proyecto. No se evaluaron deny/PAB, todos los permisos efectivos de cada identidad ni capacidad efectiva de firma. |
| Firestore Rules | Release `cloud.firestore`, 21/10/2026 15:01:28 UTC; ruleset `8fa0e2b6-8c36-4d10-9e83-87ebfb2c6e65`; idéntico a HEAD normalizando saltos de línea | Aún permite lectura pública de proveedores según sus flags y carece de reserva backend de `draftCreation`. El candidato contiene el delta esperado. |
| Storage Rules | Release del bucket esperado, **27/07/2026 15:25:45 UTC**; ruleset `cd354678-8198-4a0a-b651-0f8f8868e305`; **difiere de HEAD y candidato** | No desplegar el archivo local completo suponiendo que sólo cambia este alcance. Ver deriva abajo. |

Hashes SHA-256 de Rules remotas, sin normalizar:
Firestore `c72b8ac81af2e335c8441eda7907907be94ec414fabb63cf2fdd0e76b0f7d5da`;
Storage `bb8224303fd2ee57a00bceee1bde95d5c545b1785ada22b6d79b9af2930c492a`.
Evidencia saneada: `control-plane.json`, `control-plane.initial.json` en el
directorio anterior. La revisión de Rules elimina comentarios y literales
desconocidos; no hubo literales desconocidos en el archivo de Storage observado.

**Deriva comprobada de Storage:** el ruleset remoto sólo separa iconos,
iconos_archived, decoraciones y proveedores. Su fallback permite lectura y
escritura autenticada para cualquier otro topLevel. No tiene las restricciones
de HEAD para imágenes/thumbnails por UID, `publicadas` ni countdown. Los permisos
de iconos/decoraciones también pueden acumularse con ese fallback, un límite ya
caracterizado fuera de esta corrección. El archivo local aplicaría además las
protecciones anteriores A3/A4. Son mejoras de seguridad existentes en el repo,
pero no un delta remoto limitado a borradores/proveedores. Se preservaron; el
plan bloquea el comando Storage hasta preparar y verificar un artefacto acotado
con el delta concreto contra el release observado, sin reescribir las Rules
canónicas ni incluir cambios generales ajenos. Esto no invalida las pruebas del
archivo local; limita qué artefacto y alcance certifican.

### Nuevo defecto confirmado por inspección: autorización de assets del render

La corrección del lector HTML legacy no cierra todos los resolvedores de archivos.
`firestore.rules:245` permite al dueño editar objetos/secciones de su borrador.
`prepareDraftPreviewRender` (`functions/src/index.ts:1620`) autoriza ese documento
mediante `ensureDraftPreviewRead` (`payments/publicationPaymentReads.ts:111`),
pero `publicationPayments.ts:1746` pasa sus datos a `render/prepareRenderPayload.ts:319`
sin identidad/autorización por asset. `utils/publishAssetNormalization.ts:170`
acepta paths del bucket, reutiliza tokens y puede llamar a `getSignedUrl(read)`
por un año sin comprobar propiedad o namespace. `storageAssetValue.ts` normaliza
paths/URLs, no permisos. El fallback de resolución tampoco rechaza assets privados.

`publicationPayments.ts:1771,1791` devuelve `previewPayload` con
`includeDebugPayload:true` incluso si la validación editorial bloquea publicar;
cuando es válido, el HTML también contiene URLs. Por eso no bastan deshabilitar
debug, revocar el token hallado, cambiar Rules o endurecer sólo `verInvitacion`.
**Comprobado:** falta una autorización en código para el archivo referenciado.
**No comprobado:** ejecución de esa vía en producción, versión exacta del helper
remoto, capacidad efectiva de firma/lectura ni acceso a un objeto privado real.
No se invocó ese endpoint, no se generaron URLs y no se descargó contenido para
probar el defecto. No depende de Q1 ni de un perfil autodeclarado administrador.

Callers productivos locales del helper compartido (no equivalen a ocho vías de
entrega pública idénticas):

| Codebase | Exports que alcanzan el resolvedor |
| --- | --- |
| default | `prepareDraftPreviewRender`, `validateDraftForPublication`, `publicarInvitacion`, `retryPaidPublicationWithNewSlug`, `adminGetTemplateEditorDocumentV1` |
| payments | `createPublicationCheckoutSession`, `createPublicationPayment`, `mercadoPagoWebhook` |

El preview es la vía directa para un dueño común; validación/checkout no devuelven
por sí mismos la URL; publicación exige estado aprobado y el preview editorial
exige admin. La corrección central futura debe conservar esas diferencias y
autorizar **antes** de fast paths, metadata, firma y fallback; probar assets
propios, catálogos permitidos y rechazo de paths privados/ajenos en sus distintas
representaciones. No se implementó ese cambio en una tarea de diagnóstico remoto.

Las **109 identidades** están confirmadas. En el candidato existente hay
**3 cambios de seguridad y 106 de runtime**. Los ocho callers anteriores están
entre esos 106: actualizar sólo su runtime no corrige el defecto. Si la corrección
se hace en el helper compartido, deben revisarse/deplegarse esos ocho también
por seguridad (11 seguridad + 98 sólo runtime), conservando ownership y generación;
es una ampliación pendiente de implementación y validación, no un resultado de
este candidato ni autorización para operar pagos.

### Evidencia de CI: base aprobada; candidato sin ejecución remota

La inspección por GET de GitHub (21:32–21:33 UTC) encontró el
[run 39966214974](https://github.com/ataberner/reservaeldia/actions/runs/39966214974)
del SHA base `5ff9bb85217c413479431dc8bc301c53e35c9b5b`: verification aprobó
14:02:20–14:08:33 UTC y Hosting aprobó 14:08:36–14:10:44 UTC. No se inició ese run
durante esta tarea. Su gate de verificación usa Node 20.19.5 y no incluye el árbol local corregido.
Se inspeccionaron los 25 runs más recientes y los checks del HEAD; no se
descargaron logs/artefactos históricos ni se los presentó como prueba nueva.

`local-verification.yml` sólo tiene `workflow_call`. Sus callers actuales son
push a main (Hosting live) y PR interno (Hosting preview). Ninguno ofrece una
validación nueva del candidato sin publicar fuentes y sin efectos posteriores.
No se ejecutó ni reintentó un workflow. `needs: verification` es el gate observado
de Hosting; no se comprobó una exigencia de CI remota para el deploy selectivo de
Functions/Rules. La API pública de rama mostró protected=false; no es una auditoría
completa de políticas ni prueba de permiso para escribir.

Queda preparado en el runbook un wrapper futuro, limitado a una rama nueva sin
PR/main, sin Secrets ni job de Hosting, que llama al reusable del mismo SHA.
Requiere autorización para publicar ese candidato; no hay dispatch aislado
existente. CI remota pendiente es evidencia informativa de Ubuntu/Java 21 y del
wiring actualizado, **no un bloqueo artificial que sustituya los defectos reales**.
Además, `verify` no incluye `release`; no acreditar build/editor remotos a partir
de un éxito de `verify`. Metadatos saneados: `.local-isolation/ci-readonly-O4AupV/`.

### Inventario paginado de documentos y archivos

La muestra anterior no conservó cursores, nombres ni clave de seudonimización.
Fue necesario volver a leer las páginas iniciales una vez para establecer una
continuación verificable; no se saltaron 200 resultados suponiendo orden estable.
Desde ese punto se guardó un cursor después de cada página y se reanudó desde él.
Los nombres/cursores/checksums quedan cifrados con DPAPI en
`.local-isolation/inventory-continuation-l6bZUe/checkpoint.dpapi`; los tokens no
se guardan. `summary.json` contiene sólo agregados y alias. El
[procedimiento reproducible](../operations/RESUMABLE_METADATA_INVENTORY.md)
documenta proyecciones, allowlists, presupuestos, puntos de continuación y límites.

La primera etapa cubrió todas las páginas permitidas entre **21:43:22 y
21:57:08 UTC**: seis lotes, **340 requests y 8755936 bytes**, sin errores.
No descargó HTML, fotos ni otros cuerpos privados. No es un snapshot atómico
entre Firestore y Storage.

| Alcance observado | Cantidad y resultado | Clasificación e impacto |
| --- | --- | --- |
| Documentos actuales `borradores` | **224**: 221 del editor moderno, 3 en papelera | 221 fuera del recorrido HTML legacy; los 3 en papelera permanecen bloqueados por su estado. Esto no acredita identidad/propiedad de los documentos. |
| Objetos bajo `borradores/` | **0** live, 0 no actuales, 0 recuperables por soft delete | No se identificó HTML histórico actual ni retenido en ese prefijo que pierda acceso por el vínculo obligatorio. No demuestra ausencia de contenido eliminado definitivamente o en otro namespace. |
| Vínculos HTML a recuperar | **0** casos HTML compatibles, 0 pendientes de recuperación verificable, 0 objetos sin documento observados | No se reconstruyó ningún vínculo ni se adoptó contenido. La regla sigue siendo bloquear todo caso futuro sin evidencia suficiente. |
| Objetos bajo `proveedores/` | **8154**, todos live; 0 generaciones no actuales y 0 soft deleted | Cobertura completa de páginas de esos recorridos. Los archivos deben permanecer privados según el alcance pedido. |
| Metadata de descarga | **12 objetos** con token; 12 entradas de token distintas por comparación HMAC | Capacidad potencial alternativa a Rules. No se descargó contenido ni se probó la accesibilidad HTTP. Remediación condicionada propuesta, no ejecutada. |
| ACL de objetos inventariados y default ACL | Observables, sin `allUsers` ni `allAuthenticatedUsers` | No se observó concesión pública por esas ACL. No equivale a una auditoría de toda identidad autorizada. |
| Configuración del bucket | UBLA desactivado; PAP no enforced; versioning desactivado; soft delete 604800 s; **8154** objetos con directiva pública de caché | Estas configuraciones no prueban lectura pública por sí solas. La caché sí limita lo que puede prometerse sobre copias previamente distribuidas. No se propone cambiar IAM/ACL/UBLA/PAP globales. |

El IAM directo del bucket reutilizado corresponde a la lectura previa de las
18:50 UTC, sin grants públicos observados; se conserva esa fecha y no se presenta
como una relectura. La auditoría separada del proyecto agregó IAM y ascendencia
a las 21:34 UTC. No se evaluaron todos los permisos efectivos, deny/PAB ni
historia/PITR de Firestore. La enumeración no cubre objetos eliminados fuera de
la retención, prefijos ajenos, URLs firmadas emitidas, cachés ni copias externas.

Limitación concreta de saneamiento: la versión ejecutada convierte cualquier
`userId` string a HMAC antes de clasificarlo; no conserva si era vacío/blanco.
Por eso **no acredita validez de identidad ni propiedad**. Los 221 documentos
del editor moderno, los 3 estados de papelera y la ausencia de objetos HTML son
observaciones separadas. No se repitieron lecturas para fabricar esa evidencia.

La segunda etapa completó todas las páginas de **3194 documentos de proveedores**,
todos `estado=importado`, `activo=true`, `visible=false` y ninguno elegible según
el predicado público de Rules anterior. Proyectó estado/flags y referencias de
portada/galería: **8152 referencias `storagePath` y ninguna URL con token**.
No se pidieron contactos. La proyección de un array de galería recibe mapas;
el runner descartó en memoria campos distintos de `storagePath`/`url` y no
persistió URLs completas. Las referencias fuera de esa proyección no se revisaron.

Se capturaron checksums/metageneración de los doce objetos señalados mediante
GET de metadata de su generación exacta: **12/12 disponibles y sin cambios de
metageneración respecto del listado**, todos en metageneración 2. Esto no es una
segunda enumeración general ni una descarga. Los objetos de nombre exacto
`borradores` y `proveedores` —sin barra— respondieron 404; no se observaron sus
generaciones históricas. No confundir estos dos probes con los prefijos completos.

La sesión terminó **22:13:38 UTC** y acumuló **674 requests y 23388060 bytes**
entre ambas etapas; la ventana de 30 minutos y 16,719 segundos incluye pausas.
Un lote de proveedores alcanzó el límite local de 180 segundos después de
3110 documentos; se reanudó con el cursor guardado y lotes menores, sin ampliar
presupuestos ni repetir páginas. `errorsObserved.deadline=1` conserva ese corte;
`unresolvedError=null` y ambos recorridos están completos. La evidencia es
`summary.json`, `provider-summary.json`, checkpoint y manifiestos de fuentes
por revisión dentro del directorio de sesión; los agregados no certifican
integridad de bytes ni un snapshot entre servicios.

El cruce **local, sin red**, guardado en `safe-correlation.json`, comparó los
paths exactos: **8152 paths distintos** en **1686 proveedores**, todos con objeto
live existente; **0 referencias sin objeto**, **8152 objetos vinculados** y
**2 objetos sin referencia en esa proyección**. No se dedujo igualdad por
coincidencia de conteos. Los dos sin referencia son los aliases
`8270c69467f6f79c9a2e4b25` y `362be99038d54d0f151a035f`, ambos con token.
La referencia exacta acredita un vínculo técnico, no titularidad ni uso efectivo.
Ese reporte conserva hashes del checkpoint, resúmenes y manifiesto de fuentes.

### Diagnóstico de los tokens y consumidores

El token aislado de la muestra original no puede emparejarse individualmente
con un alias actual: aquella ejecución descartó el nombre y la clave HMAC.
El inventario completo identifica doce objetos actuales en el namespace privado;
no se afirma por suposición cuál es el objeto de la muestra inicial. La propuesta
cubre esos doce recursos verificables, con generación/metageneración/checksums
y nombres exactos sólo en el checkpoint privado.

**Comprobación estática:** las doce rutas, buscadas localmente en **1298 archivos
tracked** de `src`, `functions/src`, `shared`, `scripts` y `docs`, no tuvieron
coincidencias literales, URL-encoded ni variantes JSON/slash-escaped. No se
hicieron requests en esa búsqueda. No demuestra ausencia de referencias
dinámicas, persistidas, externas o históricas.

Las landings actuales mantienen fixtures `EXAMPLE_*` y assets locales y siguen
restringidas a superadmin; no se encontró consumidor cliente del directorio
Firestore en `src`. El enriquecedor `scripts/providers/enrichProviders.cjs:717`
crea archivos con precondición de generación cero, metadata técnica y caché
pública; no agrega token, `makePublic` ni URL firmada. En `:825` persiste
`storagePath` y `url:null`. Esto describe el código, no atribuye el origen de
los doce tokens ni demuestra que nunca existieron otros productores.

El resolvedor compartido del render descrito arriba sí interpreta paths y URLs
de Storage de forma dinámica; por eso la ausencia de una referencia literal
no cierra esa frontera. No se invocó ese recorrido contra archivos reales.
El inventario de referencias documentales de proveedores se informa por separado
de esta inspección estática y no equivale a uso observado en logs.

**Referencias documentales comprobadas:** diez de los doce archivos con token
están referenciados por `storagePath` en portada/galería de **tres** proveedores
importados, ninguno elegible para publicar. No se encontró una URL con token
en esa proyección. Los otros dos archivos tienen metadata verificable pero no
referencia en esos campos; no se presume dueño ni se los elimina. El estado
privado requerido alcanza los doce, independientemente de que exista vínculo
documental. Ni las referencias ni la metadata acreditan que alguien usó una URL.

**Decisión:** retirar de forma condicionada la metadata de token de los doce
objetos privados, conservando contenido y demás metadata, es una propuesta
justificada sin recuperar sus bytes. No se comprobó descarga, no se consultó
telemetría de uso y no se conocen todas las referencias externas. Un GET de
contenido privado no es necesario para decidir que esa capacidad no corresponde
al estado privado requerido. La comprobación de accesibilidad efectiva queda
pendiente; no se transforma metadata encontrada en una descarga demostrada.

El runbook enumera aliases/generaciones y el PATCH exacto propuesto, sus dos
precondiciones, controles de integridad y detención ante carreras. La ausencia
posterior de metadata no certificará por sí sola una denegación HTTP; tampoco
retirará URLs firmadas o copias distribuidas. La recuperación nunca restaura
tokens ni permisos vulnerables.

### Archivos y verificaciones de esta continuación

No se cambió código de aplicación, Rules, packages, CI ni configuración de
despliegue en esta continuación remota. Se conservaron correcciones anteriores,
runtime y cambios ajenos. Los únicos cambios de código fueron herramientas
locales de lectura y sus pruebas:

| Archivos | Motivo |
| --- | --- |
| `scripts/auditRemoteAuthorization.mjs`, `.test.mjs` | Lecturas acotadas de Functions, Rules e IAM, redacción de datos sensibles y checkpoints. |
| `scripts/inventoryContinuation.mjs`, `.test.mjs` | Enumeración paginada de documentos/versiones/soft delete, límites y continuación cifrada. |
| `scripts/providerMetadataContinuation.mjs`, `.test.mjs` | Proyección de referencias de proveedores, metadata de doce objetos y probes raíz fijos. |
| `scripts/inventoryLegacyDrafts.mjs` | Inyección interna del guard del transporte para esas lecturas fijas; conserva el guard predeterminado y no agrega un flag para requests arbitrarios. |
| Este informe y `docs/operations/DRAFT_PROVIDER_AUTHORIZATION_DEPLOYMENT.md` | Evidencia actual, bloqueos, tabla de acciones y propuesta remota única condicionada. |
| `docs/operations/RESUMABLE_METADATA_INVENTORY.md`, `LEGACY_DRAFT_READ_ONLY_INVENTORY.md`, `docs/DOCUMENTATION_INDEX.md` | Procedimiento de continuación, límites y enlaces de navegación. Se conservan entradas ajenas. |

Verificaciones ejecutadas con Node **22.23.4**; son pruebas de las herramientas
nuevas, no otra ejecución de las suites ya aprobadas de aplicación:

| Comando / comprobación | Resultado |
| --- | --- |
| `node --test scripts/auditRemoteAuthorization.test.mjs` | **5/5 PASS**, allowlist, redacción, rechazo antes de credenciales y codebase default. |
| `node --test scripts/inventoryContinuation.test.mjs` | **12/12 PASS**, continuación, rollback de página, DPAPI y presupuestos. |
| `node --test --test-name-pattern='summary reports effective pagination budgets' scripts/inventoryContinuation.test.mjs` | **1/1 PASS** tras ajustar etiquetas del reporte; no se amplió el presupuesto. |
| `node --test scripts/providerMetadataContinuation.test.mjs` | **7/7 PASS**, proyección, guards y saneamiento. |
| `node --test --test-name-pattern='namespace root probes' scripts/providerMetadataContinuation.test.mjs` | **1/1 PASS** al agregar los dos probes de metadata. |
| Rehash del manifiesto local aprobado | **1385/1385 sin cambios**, evidencia de las 21:42:54 UTC. |
| `git diff --check` | **PASS**; sólo avisos de conversión LF/CRLF en archivos preexistentes, sin normalizarlos. |

Los tests se ejecutaron por incrementos al cambiar los nuevos lectores; no se
presentan como un rerun global final. DPAPI no estaba disponible dentro del
sandbox: la prueba sintética correspondiente pasó usando el mismo perfil de
Windows fuera de él. Un preflight rechazó `DEBUG` heredado antes de leer datos;
se retiró sólo del entorno del proceso hijo. No se sustituyó cifrado por texto
plano. `completion-evidence.json` conserva comandos, referencias a resultados
TAP y hashes; no hay un archivo TAP guardado ni se afirma que lo haya.

Las invocaciones de inventario usaron los entrypoints `main` de ambos lectores,
`--execute-read-only`, proyecto/bucket fijos, `--session` apuntando al directorio
anterior y `--max-pages` acotado por lote; tras el deadline se usaron 40 páginas.
ADC se resolvió en memoria con scopes de lectura, pasando el token sólo al
entorno argumento del hijo. No se puso en argv, archivos, logs ni entorno global.
El checkpoint completado permite comprobar que no quedan páginas pendientes;
una futura captura del estado debe usar una sesión nueva, no reinterpretar la
fecha del checkpoint anterior.

Las pruebas previas de concurrencia real, Rules cliente, Admin SDK, build/editor
y Q1 conservan sus resultados y límites históricos. El defecto nuevo del
resolvedor **no invalida los resultados de esos casos**, pero demuestra que
no cubren toda la autorización de assets y limita la decisión de despliegue.
Q1 sigue no aceptado; no se mezclan sus diferencias ni advertencias ajenas con
los bloqueos descubiertos aquí.

### Decisión de la revisión remota y pendientes entonces identificados

La tabla siguiente conserva el estado de esa revisión. Para el estado local
posterior y la decisión vigente, consultar la última sección de este informe.

La [propuesta única de despliegue](../operations/DRAFT_PROVIDER_AUTHORIZATION_DEPLOYMENT.md#propuesta-única-de-esta-revisión-y-condiciones-de-aprobación)
contiene la matriz completa pendiente/evidencia/bloqueo/acción, los doce recursos
seudonimizados y sus precondiciones, el orden de los tramos, canarios y recuperación.

| Pendiente | Evidencia | ¿Bloquea y cuándo? | Acción exacta |
| --- | --- | --- | --- |
| Autorización por archivo del render | Cadena de preview comprobada en código; ocho exports alcanzan el resolvedor | **Sí, antes de autorizar el candidato.** Puede generar/reutilizar accesos fuera de Rules | Corregir política común con contexto confiable; cubrir paths/URLs/fast paths/fallbacks y casos legítimos. Validar los ocho callers y actualizar partición 3+106 a la que resulte de la corrección, previsiblemente 11+98. |
| Storage remoto anterior a HEAD | Hash/release y comparación semántica comprobados | **Sí, antes de autorizar.** El archivo completo agrega cambios remotos fuera del alcance | Preparar artefacto separado desde Rules observadas con sólo cierre de borradores/lectura de proveedores; verificar SDK, fijar hashes/config y preservar Rules canónicas. |
| Doce tokens | Metadata comprobada; diez referencias documentales y dos sin referencia en proyección | **Modificación incluida en la futura aprobación**, no obligación de revocar durante esta tarea | Aplicar PATCH condicionado por recurso conforme al runbook; verificar metadata/integridad, sin restaurar tokens ante fallos. No prometer HTTP o eliminación de copias sin prueba. |
| CI del candidato | Sólo el SHA base tiene run observado; callers actuales despliegan Hosting | **Informativo**, no gate obligatorio remoto demostrado | Si se requiere, autorizar push aislado del candidato y wrapper sin Hosting/Secrets; no main, PR ni rerun del workflow histórico. |
| Identidades/recursos de canario y operador | Sin selección remota ni creación en esta tarea | **Antes de iniciar la ventana**, preparación operativa | Manifiesto privado de identidades ya autorizadas y fixtures sintéticos, efectos/limpieza exactos y comprobación de colisiones por lectura. |
| Contención, propagación, drenaje y canarios | Control-plane actual observado; ninguna modificación ejecutada | **Durante y después del despliegue autorizado** | Verificar cada transición y ambas capas; detener y conservar protecciones ante cualquier fallo. No usar rollback vulnerable. |

El inventario acotado quedó completo con los límites explícitos anteriores. Las
109 identidades, Node 20 efectivo, releases y permisos relevantes ya no son
suposiciones; requieren refresco antes de operar. No se comprobó explotación,
descarga privada ni funcionamiento del candidato en producción.

**Conclusión histórica de la revisión remota:** faltaban la corrección y validación de
autorización de assets del render, y el artefacto Storage acotado con sus pruebas.
La definición del operador y los canarios queda como preparación previa a la
ventana; su ejecución y la retirada de tokens requieren aprobación posterior.
No se ejecutó ninguna modificación remota.

## Implementación local posterior: archivos del render y artefactos acotados

Esta sección sustituye los bloqueos técnicos de la revisión anterior. Se
releyeron las instrucciones y el estado de Git; se conservaron Node 22.23.4,
los cierres anteriores, ambas Rules canónicas y los cambios ajenos de Ads.
No se repitió el inventario ni se consultó o modificó producción. No se
publicaron ramas, dispararon workflows, invocaron pagos ni comunicaciones.

| Archivos/módulos de esta ampliación | Motivo |
| --- | --- |
| `functions/src/render/renderAssetReference.ts`, `renderAssetAuthorization.ts`, `renderAssetCatalogAccess.ts` | Parser único, contexto obligatorio y permisos propios/compartidos verificables. |
| `functions/src/utils/publishAssetNormalization.ts`, `functions/src/render/prepareRenderPayload.ts` | Control antes de caché/token/firma/fallback; incluir regalos y snapshots SVG válidos. |
| `functions/src/payments/publicationPayments.ts`, `functions/src/templates/editorialService.ts`, `templateEditorPreview.ts` | Propagar contexto desde las relaciones verificadas en los ocho consumidores y comprobar vínculo sesión/borrador. |
| Tests `renderAsset*`, `renderGiftAssetAuthorization`, `iconSnapshotAssetAuthorization` y suites de publicación/plantillas/música; `functions/testUtils/authorizedRenderFixture.mjs` | Negativos de permisos y compatibilidad; fixtures propios sintéticos sin alterar los fixtures legacy compartidos. |
| `shared/previewPublishParity*`, `scripts/local/draftAuthorization.test.mjs`, `productionCompatibility.cjs` | Contexto en paridad, integración real de handlers contra emuladores y ejecución serial de archivos conservando carreras internas. |
| `deployment/storage-draft-provider/`, `deployment/render-asset-firestore/`, `scripts/local/*Release*` y `runStorageRelease.cjs` | Artefactos exactos, guards de derivación/deriva/configuración, matrices SDK y empaquetado reproducible. |
| Contratos de seguridad/render, índice documental, estos informes y `DRAFT_PROVIDER_RUNTIME_TARGETS.json` | Política, evidencia, dependencia Firestore, 11+98 targets y transición segura documentados. |

### Política implementada y consumidores

`functions/src/render/renderAssetReference.ts` interpreta una sola identidad de
objeto para paths, `gs://`, URL Firebase, URL GCS por path/host y APIs JSON.
Contempla query/token/generation, codificación repetida, hostname normalizado,
alias de bucket del mismo proyecto y formas de emulador; rechaza buckets ajenos,
traversal y formas ambiguas. Las URLs externas legítimas conservan su tratamiento.
El parser se usa tanto para autorizar como para resolver: una representación
alternativa no abre un camino de firma distinto.

`renderAssetAuthorization.ts` exige contexto válido, lo copia y congela por
render. Autoriza imágenes/thumbnails del dueño verificado y delega únicamente
namespaces compartidos permitidos a `renderAssetCatalogAccess.ts`. Este último
lee registros protegidos de plantillas/catálogos/versiones, compara referencias
exactas y aplica sus estados; no consulta datos privados del perfil ni concede
una excepción administrativa general. La política exacta está en
[SECURITY_CONTRACT.md](../contracts/SECURITY_CONTRACT.md#autorización-de-archivos-del-render--candidato-local-de-octubre).

`publishAssetNormalization.ts` controla referencia directa y descriptor antes
de cachés de resolución, token previo, metadata y firma; también vuelve a
comprobar el path del resolvedor. Reconstruye URLs autorizadas con path/bucket
canónicos y no conserva parámetros que seleccionen otra generación. Ante fallo
de Storage devuelve recurso sin resolver, nunca la URL/token original como
fallback. La caché de permisos no cruza renders ni dueños.

`prepareRenderPayload.ts` incluye imágenes/enlaces de regalos, que llegaban al
modal HTML fuera de objetos/secciones. Conserva la normalización contractual de
dominios externos sin esquema. Los SVG ya insertados usan su snapshot canónico
inspeccionado por el backend, con bytes/hash/geometría concordantes, para producir
data URI inline sin depender de que el catálogo continúe activo. La procedencia
permitida se limita a `iconos/**`; una referencia privada ajena o snapshot
falsificado sigue rechazándose. No se modifica el borrador almacenado.

| Consumidor exportado | Contexto verificado antes del render |
| --- | --- |
| `prepareDraftPreviewRender` | Auth y `ensureDraftPreviewRead`; usa `draftData.userId`, incluso en soporte administrativo, sin adoptar el UID propuesto por el cliente. |
| `validateDraftForPublication` | Auth y `ensureDraftOwnership`; dueño y slug del borrador leído. |
| `publicarInvitacion` | Relación de sesión aprobada, UID y borrador; `publishDraftToPublic` relee propiedad. |
| `retryPaidPublicationWithNewSlug` | Sesión autorizada y propiedad del borrador antes de regenerar assets. |
| `adminGetTemplateEditorDocumentV1` | Guard administrativo existente y plantilla cargada/no eliminada; contexto plantilla con UID real. |
| `createPublicationCheckoutSession` | Auth y propiedad antes de preparar/validar; datos del cliente no otorgan alcance. |
| `createPublicationPayment` | Sesión persistida del usuario y borrador; el flujo de finalización usa el mismo resolvedor. |
| `mercadoPagoWebhook` | Verificación existente del evento/pago, sesión persistida y relectura de propiedad; metadata externa no aporta el dueño del asset. |

Se agrega además una comprobación explícita de `session.data.draftSlug` contra
el borrador solicitado en `publishWithApprovedPaymentSession`: ser dueño de dos
borradores no habilita intercambiar la sesión aprobada. Los tests ejecutan los
coordinadores compilados con pagos/Firestore/renderer simulados para observar
el contexto y rechazos; no representan llamadas reales a Mercado Pago.

`DRAFT_PROVIDER_RUNTIME_TARGETS.json` conserva las 109 identidades del registro
y añade trazas de dependencias/imports: **11 seguridad (8 default + 3 payments)**
y **98 restantes (95 default + 3 email)**. Los tres cierres iniciales más estos
ocho consumidores no crean endpoints ni cambian generación, región o ownership.
«Sólo runtime» identifica el resto de exports sin el recorrido funcional corregido;
sus paquetes también incluyen módulos compartidos, no un paquete de bytes idénticos.

### Artefactos exactos y dependencia de catálogos

| Artefacto | Base | Candidato SHA256 | Configuración |
| --- | --- | --- | --- |
| Storage | Ruleset remoto observado `cd354678-8198-4a0a-b651-0f8f8868e305`, recuperado de Git con bytes/hash exactos | `40ed3e455aa8ee2510744a25ca968e912f0fb3fe43c28c34f99bf0d590daca80` | `deployment/storage-draft-provider/firebase.json` |
| Firestore | Canónico local con correcciones previas, `700e0117fab33ccac394311907976fca5f0334b0b05d92adf709de7f0c12d1f0`; no se presenta como remoto | `7c6ad315deaa372f6c5d416e89593024480858a32ab1e46e9705411d44eb386c` | `deployment/render-asset-firestore/firebase.json` |

Los manifiestos contienen hashes completos de base/config/candidato, tamaño y
procedencia. El [README Storage](../../deployment/storage-draft-provider/README.md)
describe el delta de proveedores/borradores y los permisos amplios remotos que
se conservan fuera del alcance. Sus 312 casos por versión cambian únicamente
60 resultados previstos: 48 accesos autenticados a borradores y 12 lecturas/listas
de proveedor público por no administradores pasan a denegación. Los 128 casos
fuera del delta conservan resultados; también las escrituras/validaciones de fotos.

Dependencia comprobada del nuevo control: el fallback Firestore dejaba escribir
`iconos`/`decoraciones` a usuarios ordinarios, aunque los matches explícitos
parecieran administrativos. Por eso se agrega el
[artefacto Firestore separado](../../deployment/render-asset-firestore/README.md):
divide read/write, conserva **exactamente** el predicado anterior de lectura
(necesario para el editor de decoraciones) y excluye sólo esos dos prefijos de
escritura fallback. Se preservan claims y gestión administrativa raíz. No se
modifican las Rules canónicas ni el delta Storage. Desplegar posteriormente el
Firestore canónico sin este cierre reabriría la dependencia.

El guard Storage exige evidencia fresca, origen operativo confiable y coincidencia
de release/ruleset/hash/bucket; rechaza la captura vieja por antigüedad. No realiza
red ni despliegue, no autentica un JSON por sí mismo y no es una precondición
atómica de la API. El guard Firestore comprueba derivación exacta desde la base
local; la base remota histórica debe contrastarse en la ventana, sin fingir una
lectura nueva. Ante deriva se detiene el despliegue, no se adapta el candidato
automáticamente. Nunca restaurar las bases vulnerables como rollback.

### Validación de esta ampliación

Los resultados y las limitaciones se detallan abajo. Los tests de
concurrencia reales de creación conservan `Promise.all`/`Promise.allSettled`; no
se serializan las solicitudes para evitar colisiones. La ejecución secuencial
de archivos de prueba sólo limita memoria. No se alteraron expectativas Q1,
fixtures legacy compartidos ni resultados visuales para aprobar una regresión.

Resultados de artefactos (Node 22.23.4; sin consultas remotas):

| Comando/control | Resultado y evidencia |
| --- | --- |
| `node scripts/local/runStorageRelease.cjs` | Base **312/312** en `storage-release-GcuXfr`; candidato **312/312** en `storage-release-UPQoR2`. Archivos exactos, TAP y `rules-results.json` conservados bajo `.local-isolation/`. |
| `node scripts/local/runStorageRelease.cjs --firestore-assets` | **160/160** en `storage-release-kG9MHM`; candidato SHA `7c6ad315…eb386c`, TAP SHA `e64b5f80b5eac5601f5e6ad0578f3422fdd919768f62f23353a3a508cfd836bc`. |
| Guards y selector del runner | **35/35**: Storage 14, Firestore 18 y selector 3; prueban deriva/base/config extra, EOL canónico permitido y restantes cambios rechazados. |
| Empaquetado Git | **24/24** comparaciones de filtros con `core.autocrlf=true/false/input`. Atributos `-text` sólo en archivos exactos de cada artefacto; canónicos sin atributos nuevos. |

El empaquetado posterior agregó `deployment/render-asset-firestore/base.rules`
con los bytes exactos de la base y preservó **sin cambios** los candidatos/configs
probados por SDK. El guard compara el canónico con ese snapshot normalizando
sólo CRLF→LF; no tolera otras diferencias. Nuevo SHA del manifiesto Firestore:
`5036193bf25384fad9840906639f0b67a01030009b58e3164ceea3ecd96cdd63`.
No se repitieron las matrices SDK por un cambio que no altera sus reglas.

Los arranques fallidos iniciales del harness Storage quedaron conservados:
credencial estructural incompatible con Admin 13 y, luego, detección de metadata
GCP bloqueada. Se corrigió exclusivamente el bootstrap demo usando el tipo ADC
esperado con `getAccessToken` bloqueado, HOME vacío y detección de metadata
deshabilitada en ese harness. Las corridas finales tuvieron cero intentos
externos en las suites y limpieza completa. No se relajó la guarda de red.

También se conservaron los intentos del render: `run-0Daiwf` obtuvo 435/436; el
fixture de regalos omitía su CTA, por lo que el modal no debía renderizarse.
Se agregó el botón contractual, conservando la aserción sobre el HTML.
`run-7dLDMa` no llegó a ejecutar pruebas por ENOSPC al copiar un JAR.
`run-LUl1i5` aprobó 436/436 y 18/19 de integración; al nuevo fixture de fondos
le faltaba `fondoTipo: "imagen"`. Se completó ese estado sin quitar la
comprobación de las URLs propias/compartidas. Su limpieza inicial fue rechazada
por Windows; se cerró exclusivamente el árbol de emuladores registrado en esa
sesión y se comprobó la liberación de puertos en el siguiente arranque.
Para continuar se eliminaron sólo copias idénticas de JARs de sesiones detenidas,
tras comparar hashes con la caché original conservada; fuentes/resultados/logs
permanecen disponibles. Ninguna de esas corridas fallidas se presenta como PASS.

La ejecución aislada completa posterior, `node scripts/local/runLocal.cjs test`,
aprobó en `.local-isolation/reports/run-oGguWE/` (23:09:05–23:16:24 UTC):

| Control | Resultado |
| --- | --- |
| Contratos de entrada, sync, compilación y contratos compilados | PASS en copia aislada. |
| Configuración / backend | **14/14** y **7/7**. |
| Compatibilidad del render, pagos simulados, plantillas y paridad | **436/436**, sin skips. |
| Integración Auth + Firestore + Storage + Functions | **19/19**, incluidas carreras reales de creación, HTML privado/público y nuevos handlers reales de preview/validación contra archivos propios, compartidos, ajenos y de proveedores. |
| Navegador / offline | **1/1** y **1/1**; smoke desktop/mobile, 12 bloqueos CSP y cero errores de inicialización Firebase. No equivale a repetir el recorrido visual completo del editor. |
| Limpieza | PASS: procesos propios cerrados y ocho puertos libres. |

Después, lint detectó tres usos de rangos de control prohibidos por
`no-control-regex`. Se sustituyeron por una comprobación explícita equivalente
de códigos C0/DEL, sin supresiones de lint ni cambio de permisos. Se agregó un
test que cubre los 33 caracteres, paths crudos/codificados y contexto. Sobre
la copia nueva `ownership-mDovnU/workspace`, las tres codebases compilaron;
lint aprobó **307 archivos, 0 errores y 233 advertencias**, y la compatibilidad
final aprobó **437/437**. No se volvieron a iniciar emuladores por esa sustitución
equivalente: su evidencia corresponde explícitamente a la corrida anterior.
Los resultados finales están en `.local-isolation/render-asset-final-checks/`
y el TAP combinado en `.local-isolation/render-asset-final-checks.log`.

Dos arranques completos del gate ownership (`ownership-2HnyRy` y
`ownership-mDovnU`) tuvieron **40/41**, por timeout de 30 s en el primer proceso
de `discoveryInitialization.test.mjs`. Se conservaron ambos fallos. La repetición
de los mismos 41 tests sobre la segunda copia ya compilada pasó **41/41**, sin
modificar código, assertions, timeout ni concurrencia. El primer caso tardó
2,273 s en esa repetición. La inspección del compilado no encontró carga eager
nueva de JSDOM; no se demostró la causa de las demoras iniciales y no se promete
estabilidad de arranque en frío por una corrida posterior aprobada.

Las pruebas de coordinadores observan los ocho contextos y finalizaciones con
dependencias simuladas. Sólo preview/validación y los recorridos de borradores
se ejercitan como handlers reales contra emuladores; no se invocan pagos reales
ni se habilita su wrapper HTTP local. Las nuevas pruebas SDK de artefactos
comprueban otra capa y no se sustituyen por los mocks de los coordinadores.

Se conserva la evidencia previa de registro/login/recuperación/dashboard,
guardado/reapertura y build/export. No se repitieron el build productivo, el
recorrido visual completo ni la matriz Rules canónica de 2075 casos por rutina.
La prueba móvil geométrica ajustó sólo contexto/fixtures de autorización; se
comprobó su sintaxis, pero no se ejecutaron sus casos de navegador condicionados.
**Q1 continúa no aceptado** y separado; advertencias previas de lint, Java,
Browserslist y recursos ausentes del entorno aislado no se ocultan ni se corrigen
fuera del alcance. CI remoto, producción y estabilidad en otra plataforma no
quedan acreditados por estas corridas Windows/Node 22.23.4.

### Cierre del candidato final y pendientes operativos

La última revisión detectó aliases oficiales de Storage que aún se clasificaban
como externos. El parser ahora incluye mTLS, hosts `storage-download` y el
redirect autenticado `*-apidata.googleusercontent.com` sólo para su recorrido
Storage; rechaza formas ambiguas y conserva otros enlaces externos. Se contrastó
con [endpoints oficiales de Storage](https://docs.cloud.google.com/storage/docs/request-endpoints),
[endpoints mTLS](https://docs.cloud.google.com/docs/security/compliance/restrict-endpoint-usage)
y el [host de descarga usado por Google Buildpacks](https://docs.cloud.google.com/docs/buildpacks/java).
No se solicitó contenido privado ni se comprobó accesibilidad remota por esos aliases.
Se agregaron diez pruebas y se reforzaron las diecinueve representaciones previas
para probar también **sin descriptor**: un descriptor privado no debe ocultar
una clasificación errónea de la URL. Los casos nuevos incluyen B/proveedor,
token anterior, descriptor propio que no habilita la URL ajena, bucket ajeno,
identidad propia canónica y recursos externos conservados.

**Resultado final: los dos bloqueos locales están resueltos y validados.**
Sobre `ownership-FlNWPA/workspace`, después de este último cambio:

| Control final | Resultado / evidencia reproducible |
| --- | --- |
| `node scripts/local/verifyFunctionsOwnership.cjs` | PASS completo: tres builds, **41/41**, discovery CLI real **103 default + 3 payments + 3 email**, unión 109 intacta. `.local-isolation/render-asset-ownership-aliases.log`. |
| `node scripts/lint.cjs --report <evidencia>` desde Functions de la copia | **307 archivos, 0 errores, 233 advertencias**, sin fix/cache/supresiones. |
| `node scripts/local/productionCompatibility.cjs` desde esa copia | **447/447**, cero skips/fallos. Incluye aliases finales, ocho coordinadores, pagos simulados, catálogos, SVG, regalos y paridad. |
| Correspondencia de fuentes | Hash por archivo de backend, shared, tests y configuración; coincidencia entre árbol y copia antes/después. `.local-isolation/render-asset-final-aliases/source-manifest.json`. |
| Revisión final | `git diff --check` PASS. Anclajes estáticos **32/32**, dos llamadas y siete imports; partición **11+98** consistente. Rules canónicas y bytes de ambos candidatos sin cambios. |

La ejecución final usó Node 22.23.4, HOME vacío, entorno por allowlist y bloqueo
de red externa. Comandos/fechas/limpieza constan en
`.local-isolation/render-asset-final-aliases/results.json`; el lanzador exacto
local está en `.local-isolation/render-asset-finish.cjs`. No se atribuye a esta
última corrida un nuevo recorrido de emuladores: conserva `run-oGguWE` para
integración real y las sesiones de artefactos para Rules. Los aliases son un
cambio acotado del parser, cubierto por nuevos negativos, recompilación y la
suite final completa de compatibilidad. No cambiaron handlers, Rules ni el
algoritmo de concurrencia después de sus pruebas reales.

| Evidencia final | SHA256 |
| --- | --- |
| Log ownership completo | `4500a3a385300c545787afe7352d52b7499b73a3ac1c86163f3ecac0fe3caaf6` |
| Log combinado lint/compatibilidad final | `8c084f8a1779db6b1ec75e9d221d627b1bc938909942700d112ff3cfeb95220c` |
| Manifiesto de fuentes final | `403422e107975b0c1d5f6c5b7e476867eb48564c936a88ccbd0c52c97020a9fb` |
| Resultado de emuladores/navegador `run-oGguWE` | `ef266eb28b5161b665591e33755ddda5e3c53b7e55f49907b68a30477e62c77e` |

La propuesta revisable queda en el [runbook actualizado](../operations/DRAFT_PROVIDER_AUTHORIZATION_DEPLOYMENT.md).
No quedan cambios de implementación local pendientes de estos dos bloqueos.
Antes de autorizar/iniciar la operación siguen requisitos concretos:

| Pendiente | Estado / acción |
| --- | --- |
| Transición de los ocho consumidores | Decisión previa: aceptar expresamente la exposición parcial hasta rollout/drenaje o preparar contención adicional verificada. Las Rules y tres handlers iniciales solos no cierran el render. |
| Candidato y operador/canarios | Fijar selección inmutable excluyendo Ads ajeno, operador autorizado y manifiesto privado de A/B/fixtures/efectos/limpieza; aprobación explícita del alcance remoto. |
| Base/destino en la ventana | Lecturas frescas y guards; detener ante deriva de Rules, identidades, generación o permisos. La captura histórica no se renovó. |
| Doce tokens, propagación y canarios | Operaciones/comprobaciones posteriores a autorización: aplicar el cambio condicionado ya propuesto, verificar revisiones y drenaje, A→B denegado/A→A permitido y público legítimo. Nunca restaurar tokens o permisos vulnerables. |
| CI remoto y otros límites | Evidencia pendiente, no gate remoto obligatorio demostrado; procedimiento sin Hosting en runbook. Q1 no aceptado, prueba móvil geométrica condicionada no ejecutada y advertencias ajenas permanecen separados. |

El candidato está preparado para revisión operativa; esta entrega **no autoriza
ni ejecuta despliegue** y no certifica comportamientos de producción. Se
preservaron Node 22, los cierres anteriores, datos y cambios ajenos.

## Ejecución autorizada: detenida durante la preparación

Registro histórico de la primera preparación, reemplazado como estado operativo
por la reanudación documentada al final. Se conservan sus resultados originales.

Fecha local: 23/10/2026; lecturas del 24/10/2026 00:32–00:38 UTC.
El usuario autorizó expresamente los dos artefactos, las 11 Functions de
seguridad y 98 restantes, los doce cambios condicionados de metadata y la
contención/reapertura de los tres servicios. Aceptó la transición progresiva de
los ocho consumidores, manteniendo pagos/webhooks habilitados y sin alterar su
IAM. Esa decisión pendiente queda resuelta. No se requiere repetir esa aprobación.

El mismo pedido condiciona la operación a identificar las cuentas preexistentes
A/B y ordena detenerse si falta una identidad necesaria. La revisión local no
encontró un manifiesto remoto ni sesiones A/B utilizables; los fixtures encontrados
son usuarios aleatorios de emuladores, creados y eliminados por sus pruebas.
No se adoptaron usuarios de producción por su nombre/email, no se enumeró Auth
para adivinar identidades y no se crearon usuarios ni modificaron claims.
Se solicitó al usuario la ubicación de las identidades y su mecanismo de sesión,
sin pedir contraseñas ni tokens en el chat. **Ése fue el bloqueo de esta captura.**

### Candidato fijado, sin publicidad ni evidencia privada

- ID: `provider-auth-5ff9bb85217c-44d15fc46b29f1d2`.
- Base: `5ff9bb85217c413479431dc8bc301c53e35c9b5b`.
- Archivo: `.local-isolation/provider-auth-release-2026-10-24T00-38-30-741Z-SFCXaw/candidate.tar.gz`.
- SHA256: `527275585c92ea395e845890941da357a4b1343b1bc547b26960dfe2d03627a7`.
- Manifiesto: `source/candidate-manifest.json`, SHA256
  `72cf449d9750379989a13d77878b4b66c18fd96acc299b96c56b49b50e4b73fe`.

Es un snapshot mínimo de backend/Rules de 389 archivos, no una copia completa
del frontend ni una carpeta directamente lista para deploy. Conserva **349/349**
entradas del manifiesto validado y otras **18/18** fuentes/dependencias comparadas
con la copia aprobada —incluidos diez TSX de Email omitidos por el primer
manifiesto—. Inventario del tar y hashes comprobados, índice Git principal intacto.
Quedaron fuera Ads, frontend/public, evidencia privada, credenciales, dotenv,
compilados y dependencias instaladas. Las configs originales se conservan por
hash; su presencia no habilita Hosting, índices ni Rules canónicas.
No se repitieron suites aprobadas ni builds: las fuentes de ejecución seleccionadas
coinciden. `packaging-result.json` y `build-candidate.cjs` registran el proceso.

**Preparación pendiente en esta captura histórica:** materializar una carpeta operativa separada
con dependencias fijadas, build del mismo candidato y un overlay privado de
configuración por codebase, comprobando valores contra los efectivos remotos
sólo en memoria. No desplegar el snapshot limpio: CLI 14.4.0 resuelve/escribe
defaults de parámetros en `lib/deploy/functions/build.js:58` y condiciona la
conservación del entorno previo a `usedDotenv` en `prepare.js:190`. Email podría
recibir `EMAIL_MODE=disabled`/activación vacía; tampoco se debe perder configuración
administrativa existente. No se ejecutó esa resolución ni se cambiaron valores.
No es autorización para introducir configuración nueva.

### Lecturas y controles ejecutados

Evidencia privada/saneada fuera de Git:
`.local-isolation/predeployment-authorization-2026-10-24T00-32-02-284Z/`.
Contiene `control-plane.json`, `guards.json`, `operator.json`, `objects-live.json`
y `execution-status.json`, que vincula los hashes de los anteriores.

| Comprobación | Resultado |
| --- | --- |
| Operador | Identidad del ADC existente comprobada mediante token-info, sin persistir token/email. Binding no condicionado `roles/owner` del proyecto observado. Transporte IAM del canario todavía no probado. |
| Control-plane | Lector acotado: **18 requests**, 109/109 Functions, sin faltantes/extra/deriva de codebase; 103 default + 3 payments + 3 email. |
| Runtime efectivo | **109 `nodejs20`**, 108 GEN2 y 1 GEN1. Ninguna Function actualizada a Node 22 en esta ejecución. |
| Deriva observada | Cero diferencias de descriptors proyectados de Functions ni IAM/parent comparados con la captura previa. Esto no sustituye la comparación pendiente de valores de configuración. |
| Storage | Guard completo PASS con evidencia fresca: base `cd354678-8198-4a0a-b651-0f8f8868e305`, SHA `bb822430…c492a`, artefacto/config exactos. |
| Firestore | Guard local PASS y comprobación adicional de base remota aprobada PASS: ruleset `8fa0e2b6-8c36-4d10-9e83-87ebfb2c6e65`, 14283 bytes, SHA `c72b8ac81af2e335c8441eda7907907be94ec414fabb63cf2fdd0e76b0f7d5da`. El guard local solo no certifica esa comparación remota. |
| Doce objetos | Checkpoint DPAPI con SHA aprobado; **12 GET live**, sin seleccionar generación histórica ni descargar contenido. Generación, metageneración, tamaño, CRC32C y MD5 coincidentes; token presente y sin ACL pública observada. **Cero PATCH**. |
| Canarios/contención/despliegue | No ejecutados: bloqueo A/B previo a toda mutación. No hubo pagos, webhooks de prueba, comunicaciones ni workflows. |

La lectura de los doce objetos usó el script local
`.local-isolation/predeployment-metadata-readonly.mjs`: sólo GET de la lista
exacta aprobada, metadatos sensibles exclusivamente en memoria y resultado por
alias. No se reanudó el inventario general ni se alteró el checkpoint. La
ausencia de deriva es una observación fechada, no una garantía futura: repetir
los GET/precondiciones y los guards frescos inmediatamente antes de operar.

### Resultado por alias de los doce objetos

Todos conservan metageneración `2`; la generación coincide con la tabla aprobada
del runbook. No se revocó ningún token ni se modificaron bytes, caché, ACL o
custom metadata. Estos resultados acreditan precondiciones, no descarga HTTP.

| Alias | Preflight live | Modificación |
| --- | --- | --- |
| `7c5d792e9f03bcb9ec5a572c` | Coincide; token presente | No ejecutada |
| `5002d6b48847ecef164ad716` | Coincide; token presente | No ejecutada |
| `2fe40ffa32dc2a19f5121da3` | Coincide; token presente | No ejecutada |
| `e65c6d92ff982f4d2ff121fd` | Coincide; token presente | No ejecutada |
| `9f2619d12a4f7b437c9cf334` | Coincide; token presente | No ejecutada |
| `45a716642cb2bb9645d6883a` | Coincide; token presente | No ejecutada |
| `c5f924f88e91027cd2945951` | Coincide; token presente | No ejecutada |
| `af53ad9a3df2810228ac9a51` | Coincide; token presente | No ejecutada |
| `8270c69467f6f79c9a2e4b25` | Coincide; token presente | No ejecutada |
| `362be99038d54d0f151a035f` | Coincide; token presente | No ejecutada |
| `4a6cfac60426a3c25ef7963c` | Coincide; token presente | No ejecutada |
| `6364719b4a87dde298acc197` | Coincide; token presente | No ejecutada |

**Estado al terminar esta preparación histórica: detenido antes de modificar producción.** Rules pendientes;
0/11 Functions de seguridad y 0/98 de runtime actualizadas; 0/12 objetos
modificados. `copiarPlantilla`, `copiarPlantillaHTML` y `verInvitacion` no fueron
contenidos, por lo que no hay reapertura o recuperación que ejecutar. Sus
bindings permanecen sin cambios. Las vulnerabilidades remotas anteriores no
se presentan como corregidas por el candidato local.

El requisito de reanudación registrado entonces era identificar A/B y obtener sus
sesiones por un mecanismo seguro, fijar el manifiesto sintético y comprobar
colisiones, preparar/verificar el overlay operativo y renovar el preflight.
No cambiar permisos ni crear Auth users para suplir identidades faltantes.

## Ejecución autorizada en curso — corte 24/10/2026 01:49:57 UTC

Esta es una **foto intermedia**, no el resultado final de la ventana. Corresponde
al 23/10/2026 22:49:57 en Argentina. El usuario confirmó expresamente «Sí,
continuar y dejar A/B pendiente». La ausencia de esas sesiones deja de bloquear
esta ejecución: se omiten canarios autenticados y recursos sintéticos remotos,
sin crear usuarios ni cambiar claims. El aislamiento y los flujos propios
conservan la evidencia local aprobada; no se presentan como revalidados con
cuentas reales en producción. Se mantienen las comprobaciones operativas de
destino, configuración, IAM, revisiones/tráfico, drenaje y metadata condicionada.

El candidato inmutable conserva ID y hashes registrados arriba. La carpeta
operativa separada es
`.local-isolation/provider-auth-operational-ufsdE0/workspace`. El runner comprueba
los 389 archivos seleccionados contra el manifiesto antes de cada operación;
conserva los predeploy originales y no incluye los cambios ajenos de publicidad.
La comparación privada del entorno encontró coincidencia en default y payments;
Email requiere un overlay por endpoint para preservar sus valores efectivos.
No se publican esos valores ni se unifica su activación.

| Recurso | Estado comprobado al corte | Evidencia local saneada |
| --- | --- | --- |
| Tres servicios de borradores | `allUsers` retirado de `roles/run.invoker` con precondiciones y copias DPAPI; no reabiertos | Carpeta `provider-release-20261024T0112Z`, snapshots cifrados por servicio; observaciones anónimas por alias de URL |
| Storage Rules | Artefacto acotado efectivo; SHA256 `40ed3e455aa8ee2510744a25ca968e912f0fb3fe43c28c34f99bf0d590daca80` | `rules-both-1792805613024.json`; ruleset `fa06a161-b080-412b-99dc-50a4a0841268` |
| Firestore Rules | Artefacto acotado efectivo; SHA256 `7c6ad315deaa372f6c5d416e89593024480858a32ab1e46e9705411d44eb386c` | Mismo readback; ruleset `54aa5487-fcd8-481e-a4dd-fe9a4fda1578` |
| `verInvitacion` | GEN2 conservada, `nodejs22`, ACTIVE, revisión `verinvitacion-00530-cob` Ready con 100% del tráfico; IAM contenido | `function-readback-1792806433618.json`; operación `provider-release-operation-5g5FHv`, CLI exit 0 |
| `copiarPlantilla` | GEN2 conservada, `nodejs22`, ACTIVE, revisión `copiarplantilla-00545-til` Ready con 100% del tráfico; IAM contenido | `function-readback-1792806594200.json`; operación `provider-release-operation-Z5quTs`, CLI exit 0 |
| Resto de seguridad y runtime | 9/11 de seguridad y los 98 restantes todavía sin cierre en esta foto | Secuencia en curso; no se extrapola el éxito de dos targets a los 109 |
| Doce objetos | Modificación condicionada todavía pendiente en esta foto | Manifiesto privado previo conservado; no atribuirle un resultado posterior inexistente |

Todos los archivos de evidencia de la tabla están bajo
`.local-isolation/provider-release-20261024T0112Z/`, salvo las dos carpetas de
operación nombradas, que son hermanas bajo `.local-isolation`. Los campos
`mutations: 0` de los lectores describen **ese comando de lectura**, no la ventana
completa, que ya modificó IAM, Rules y Functions.

La comprobación inicial de contención conservó una anomalía: una respuesta 500
en un alias de `copiarPlantilla` no se contó como denegación IAM. El recheck
`copiar-anonymous-routing.json` registró 403 para GET y POST a las 01:25:26 UTC.
Las respuestas de contención no prueban el rechazo de autenticación dentro del
handler. Ese control anónimo corresponde a la reapertura, todavía pendiente.
Tampoco Ready/100% ni el timeout configurado prueban drenaje; la observación de
solicitudes y revisiones anteriores sigue separada.

### Ajustes del ejecutor durante esta ventana

Se ajustaron los helpers privados de operación, no el código del candidato ni
las dependencias instaladas:

- El selector efectivo de la CLI 14.4 para la configuración Firestore en array
  es `firestore:(default),firestore:rules`, manteniendo el config acotado. La
  CLI usa el alias de release `cloud.firestore/(default)`; se comprobó por GET
  que corresponde al release existente `cloud.firestore`, y el guard admite
  exclusivamente ese alias y el ruleset de bytes aprobados. El readback efectivo
  confirma el destino y hash, más allá del código de salida del comando.
- La CLI recibe el preload explícito. `NODE_OPTIONS` de sus hijos conserva el
  guard de red de build/discovery restringido a loopback, sin heredar permiso
  de operación remota. `FUNCTIONS_DISCOVERY_TIMEOUT=30` mantiene el límite del
  gate local existente; no se alteraron expectativas de pruebas.
- El bootstrap de identidades Pub/Sub/Eventarc se sustituye únicamente para
  actualizar Functions existentes por GET de API habilitada y lectura de los
  bindings de service agents ya presentes. Los GET de cuentas administradas
  por Google devolvieron 403: no se infiere inexistencia ni se crean identidades.
  Ambos exports usados por la CLI quedan cubiertos, incluido
  `generateServiceIdentity`, que es el caller efectivo de `prepare.js` 14.4.
  El guard sigue rechazando bootstrap, habilitación de APIs y escrituras IAM.
  Las comprobaciones de permisos del servidor siguen aplicándose.
- Para los dos endpoints de prueba Email, todavía pendientes en esta foto,
  se preparó omitir sólo la escritura IAM redundante cuando el target exacto
  seleccionado solicita `private` y un GET IAM v3 no contiene ningún binding
  `roles/run.invoker`. No permite eliminar bindings existentes ni invocar envíos.

Los intentos previos fallidos y sus logs se conservan en
`.local-isolation/provider-release-operation-*/`; no se reetiquetan como éxitos.
La finalización requiere continuar los targets pendientes, comprobar estado
efectivo y drenaje, aplicar los doce cambios condicionados, reabrir los tres
servicios con rechazo anónimo esperado y registrar el inventario final de
runtime. No se desplegó Hosting ni se habilitó el directorio/beta; no se realizaron
pagos o comunicaciones como pruebas. **Estado al corte: en curso, parcial.**

**Actualización del registro, 24/10/2026 01:55:11 UTC:** el primer intento de
`copiarPlantillaHTML` se detuvo **antes del PATCH** por una comparación literal
del entorno demasiado estricta. La única diferencia fue que CLI 14.4 omitió
`FUNCTION_SIGNATURE_TYPE=http`; HTTP es el
[valor por defecto documentado de Functions Framework](https://github.com/GoogleCloudPlatform/functions-framework-nodejs#configure-the-functions-framework).
El comparador efectivo admite exclusivamente `http` explícito a ausencia para
un endpoint HTTP sin event trigger. No incorpora una excepción general para
variables de plataforma ni permite cambios de configuración de negocio.

`revision-config-1792806907271.json`, en la misma carpeta de evidencia, conserva
seis GET de las revisiones anterior/nueva de `verInvitacion` y `copiarPlantilla`:
ambas comparaciones PASS, entorno efectivo equivalente, bindings/versiones
referenciadas de Secrets, volúmenes y cuenta de servicio conservados. No se
leyeron valores de Secrets; conservar una referencia `latest` no prueba la
inmutabilidad de su contenido. Esta comprobación acredita configuración,
no ejecución funcional ni drenaje. La secuencia de `copiarPlantillaHTML` y los
ocho consumidores continúa; no se añaden éxitos a la tabla intermedia hasta
obtener sus lecturas posteriores.

## Cierre parcial de la ventana — 24/10/2026 02:36:51 UTC

**HECHO:** la secuencia se detuvo al fallar una comprobación posterior de
metadata. Se completó únicamente la recuperación segura de disponibilidad de
los tres servicios de borradores. No se restauraron tokens, Rules vulnerables
ni handlers anteriores. La dispensa de canarios A/B autorizada por el usuario
no se interpretó como dispensa de integridad de objetos.

### Recursos efectivos

El candidato continuó siendo `provider-auth-5ff9bb85217c-44d15fc46b29f1d2`,
archivo SHA256 `527275585c92ea395e845890941da357a4b1343b1bc547b26960dfe2d03627a7`.
El ejecutor verificó los 389 archivos seleccionados antes de cada operación.
No se incluyeron publicidad, evidencia privada ni Hosting. Se conservaron los
predeploy/build originales; no se repitieron suites locales ya aprobadas.

| Recurso | Resultado observado |
| --- | --- |
| Storage acotado | Ruleset `fa06a161-b080-412b-99dc-50a4a0841268`, SHA256 `40ed3e455aa8ee2510744a25ca968e912f0fb3fe43c28c34f99bf0d590daca80`; readback coincidente, último a las 02:35 UTC. |
| Firestore acotado | Ruleset `54aa5487-fcd8-481e-a4dd-fe9a4fda1578`, SHA256 `7c6ad315deaa372f6c5d416e89593024480858a32ab1e46e9705411d44eb386c`; readback coincidente, último a las 02:35 UTC. |
| Functions de seguridad | 11/11 actualizadas, Node 22, ACTIVE, revisión Ready nueva con 100% de tráfico; generación, codebase y configuración efectiva conservadas. |
| Functions sólo runtime | 0/98 actualizadas. Inventario final de 109 completo, 11 Node 22 / 98 Node 20, sin identidades extra o faltantes ni cambios de generación/codebase/entrypoint. |
| Contención de borradores | Finalizada mediante reapertura condicionada de los tres servicios; políticas originales restauradas exactamente salvo el ETag emitido por IAM. |
| Doce objetos | Un PATCH aplicado; once no intentados. Conservación completa de metadata/ACL del primero sin poder certificarse; detalles abajo. |

| Function | Revisión nueva Ready observada | Actualización UTC |
| --- | --- | --- |
| `verInvitacion` | `verinvitacion-00530-cob` | 01:46:32 |
| `copiarPlantilla` | `copiarplantilla-00545-til` | 01:49:43 |
| `copiarPlantillaHTML` | `copiarplantillahtml-00497-his` | 02:00:31 |
| `prepareDraftPreviewRender` | `preparedraftpreviewrender-00125-riy` | 02:03:17 |
| `validateDraftForPublication` | `validatedraftforpublication-00125-qat` | 02:05:34 |
| `publicarInvitacion` | `publicarinvitacion-00539-loc` | 02:08:12 |
| `retryPaidPublicationWithNewSlug` | `retrypaidpublicationwithnewslug-00270-tug` | 02:10:18 |
| `mercadoPagoWebhook` | `mercadopagowebhook-00297-wel` | 02:12:18 |
| `createPublicationPayment` | `createpublicationpayment-00287-nax` | 02:14:23 |
| `createPublicationCheckoutSession` | `createpublicationcheckoutsession-00267-reh` | 02:16:42 |
| `adminGetTemplateEditorDocumentV1` | `admingettemplateeditordocumentv1-00206-quy` | 02:19:50 |

`revision-config-1792806907271.json` y `revision-config-1792808706937.json`
comparan las once revisiones anteriores/nuevas: entorno efectivo, referencias
y versiones de Secrets, volúmenes y cuentas de servicio conservados. No se
leyeron valores de Secrets ni se alteraron activaciones de Email. La adaptación
puntual de CLI conserva la cuenta de servicio ya observada si CLI propone
`serviceAccountEmail: null`; no permite reemplazarla por un valor por defecto.
La excepción HTTP explícito/ausente continúa limitada al valor efectivo por
defecto documentado, sin excepciones para configuración de negocio.

### Incidente del primer objeto y resultado por alias

El ejecutor privado `provider-release-metadata.mjs`, SHA256
`f77e9ba7508c855a6b91f85025f0ac63a42bc4f9d56d8853db29c6a16226b14a`,
aplicó un solo PATCH a las 02:20:13 UTC con `ifGenerationMatch` y
`ifMetagenerationMatch`. Su cuerpo retiró exclusivamente
`metadata.firebaseStorageDownloadTokens` y fijó `cacheControl: private,no-store`.
No envió campos ACL ni modificó contenido.

La respuesta y el GET de conciliación coinciden: misma generación, tamaño,
CRC32C y MD5, metageneration 2→3, token ausente y Cache-Control esperado.
**Fallaron** `unchangedAcl` y `unchangedProtectedMetadata`. El comparador
incluye toda la representación ACL, incluidos sus ETag, también dentro de
metadata protegida: las dos fallas no prueban dos cambios independientes.
La lectura posterior encontró cuatro entradas sin permisos públicos; todos sus
ETag coinciden con el nuevo ETag del objeto. Una simulación local demuestra
que cambiar sólo esos ETag produce ambas fallas; **no demuestra** que ése haya
sido el único cambio real.

El helper no persistió el detalle de la ACL previa ni un resumen suficiente
para repetir la comparación: es una limitación del ejecutor de esta operación.
No se puede reconstruir ese estado a partir de la ACL actual o sus valores por
defecto. La consulta puntual del audit log —un objeto, método update, ventana
de siete segundos, una página— terminó sin entradas; no proporcionó baseline.
No se descargó contenido privado y no se repitió el PATCH.

| Alias privado | Resultado al cierre |
| --- | --- |
| `7c5d792e9f03bcb9ec5a572c` | Token retirado, bytes verificados, sin ACL pública observada; conservación completa de ACL/metadata pendiente de conciliación. |
| `5002d6b48847ecef164ad716` | No intentado; token no retirado por esta operación. |
| `2fe40ffa32dc2a19f5121da3` | No intentado; token no retirado por esta operación. |
| `e65c6d92ff982f4d2ff121fd` | No intentado; token no retirado por esta operación. |
| `9f2619d12a4f7b437c9cf334` | No intentado; token no retirado por esta operación. |
| `45a716642cb2bb9645d6883a` | No intentado; token no retirado por esta operación. |
| `c5f924f88e91027cd2945951` | No intentado; token no retirado por esta operación. |
| `af53ad9a3df2810228ac9a51` | No intentado; token no retirado por esta operación. |
| `8270c69467f6f79c9a2e4b25` | No intentado; token no retirado por esta operación. |
| `362be99038d54d0f151a035f` | No intentado; token no retirado por esta operación. |
| `4a6cfac60426a3c25ef7963c` | No intentado; token no retirado por esta operación. |
| `6364719b4a87dde298acc197` | No intentado; token no retirado por esta operación. |

La evidencia está en `metadata-mutation-results.json`,
`first-object-reconcile-*.json` y
`object-audit-reconciliation-2026-10-24T02-36-47-905Z.json`.
Los fallos diagnósticos HTTP 400 anteriores se produjeron con proyecciones
de subcampos de `Any`/map; corregidas las proyecciones, los lectores completaron
sus consultas. Un 429 intermedio se conservó como error y se repitió una sola
vez después. Ninguno de esos lectores modificó objetos o descargó contenido.

### Reapertura segura y límites de observación

La recuperación de disponibilidad no continuó el lote de metadata ni desplegó
los 98 targets restantes. Se basó en las nuevas Rules, los tres handlers seguros,
sus configuraciones efectivas, políticas contenidas coincidentes y rutas de
tráfico exclusivamente hacia revisiones nuevas, junto con evidencia histórica
de retiro de actividad:

- `verInvitacion`: instancias activas e inactivas explícitamente en cero en
  muestras 01:25–01:31 UTC posteriores a la contención.
- `copiarPlantillaHTML`: ambas clases explícitamente en cero 01:26–01:32 UTC.
- `copiarPlantilla`: actividad en cero desde 01:26; instancias inactivas todavía
  presentes en la primera ventana. Una segunda ventana observó ambas clases
  en cero 01:44–01:45 y 01:51–01:56 UTC. No se interpretó ausencia de series
  como cero ni se usó sólo el timeout de 60 segundos.

La lectura fresca de los tres servicios a las 02:34 UTC confirmó Ready,
100% de tráfico nuevo, IAM contenido y sin bypass de invocación. La reapertura
verificó ETag, política completa, bindings ajenos y proyecto/ancestría antes de
cada cambio. Resultado:

| Servicio | Reapertura UTC | Comprobación inmediata |
| --- | --- | --- |
| `verInvitacion` | 02:35:40 | 3/3 URLs observadas: 401, sin solicitar slug ni contenido. |
| `copiarPlantilla` | 02:36:06 | 3/3: 401 `UNAUTHENTICATED`, cuerpo callable vacío. |
| `copiarPlantillaHTML` | 02:36:36 | 3/3: 401 `UNAUTHENTICATED`, cuerpo callable vacío. |

**No queda ningún servicio temporalmente contenido.** Se conservan snapshots
IAM cifrados y evidencia `anonymous-reopened-*.json`. Las respuestas prueban
rechazo anónimo del código nuevo; no sustituyen un recorrido autenticado.

Para los once targets, `security-after.json` documenta nuevo tráfico al 100%
y cero tráfico asignado a revisiones anteriores. Las métricas de 02:05–02:25
observaron ceros finales para algunas revisiones y ausencia de series para
otras; no se certifica por eso drenaje exhaustivo de los ocho consumidores.
La consulta de logs 02:00–02:30 observó tres solicitudes antiguas completadas
con 400 en publicación, retry y pago, con latencias inferiores a cuatro segundos;
no se invocaron esos handlers como prueba ni se infiere el origen de esos logs. Cero logs para los demás
no se equipara a cero solicitudes. Pagos/webhooks permanecen habilitados.

### Comandos y evidencia de cierre

Todos los helpers siguientes viven bajo `.local-isolation/`, usan el Node
22.23.4 fijado localmente y conservaron sus outputs bajo
`.local-isolation/provider-release-20261024T0112Z/`. No contienen credenciales
en argumentos ni se publican logs privados:

- `provider-release-cli.cjs storage`, `firestore` y `functions <selector exacto>`:
  operaciones autorizadas registradas individualmente; builds/predeploy conservados.
- `provider-release-rules-readback.mjs both`: hashes efectivos de ambos artefactos PASS.
- `provider-release-function-readback.mjs <targets>` y
  `provider-release-revision-config.mjs --execute-read-only <targets>`:
  once revisiones y configuración PASS; la evidencia de los tres borradores
  anterior a la reapertura muestra IAM contenido, no su estado final.
- `provider-release-draft-drain-readonly.mjs --execute-read-only --start ... --end ... --out ...`:
  ventanas históricas exactas 01:15–01:35 y 01:43–02:03, seis GET cada una.
- `provider-release-iam.mjs reopen <servicio> --preflight .../before/control-plane.json --state-dir ... --execute --restore-removed-public-binding`:
  aplicado individualmente a los tres servicios y seguido por
  `provider-release-anonymous.mjs reopened <Function>`: 9/9 PASS.
- `provider-release-runtime-inventory.mjs --execute-read-only`:
  tres GET paginados, 109 identidades, 108 GEN2/1 GEN1, default 103/payments 3/email 3;
  `runtime-inventory-1792809274681.json` confirma 11 Node 22 / 98 Node 20.

**Pendiente bloqueante:** conciliar el límite de evidencia del primer objeto
y corregir/revisar el verificador antes de reanudar los once restantes. Separar
igualdad de permisos y campos estables de ETag volátiles; retener una baseline
previa cifrada y evidencia suficiente. Ese ajuste prospectivo no certifica
retroactivamente la ACL del primer objeto. No reintentar ese PATCH ni restaurar
su token; no considerar el lote completo. La secuencia de 98 runtimes queda
retenida por la parada operativa, sin un defecto nuevo observado en esas Functions.

**Pendientes no ejecutados:** canarios autenticados A/B y recorridos propios en
producción, CI remota del candidato, drenaje exhaustivo de consumidores y
actualización de las 98 Functions. Las suites locales previas, Q1 no aceptados
y advertencias ajenas mantienen su alcance original. No hubo nuevos usuarios,
claims, documentos sintéticos, cobros, comunicaciones de prueba, Hosting,
directorio público, beta ni push. El plan operativo conserva la recuperación
segura y los requisitos para retomar sin redesplegar las once Functions exitosas.

## Continuación completada de Functions — 24/10/2026 03:38:47 UTC

El pedido posterior «hace deploy de las cosas que falten deployar» reanudó los
98 runtimes pendientes, independientemente del incidente de metadata. Se
conservó el candidato `provider-auth-5ff9bb85217c-44d15fc46b29f1d2`, Node local
22.23.4 y CLI 14.4.0. Antes de cada operación se verificaron los 389 archivos
seleccionados; publicidad y evidencia privada no se incorporaron al candidato.
No se repitieron las suites del producto aprobadas. Los predeploy/build
obligatorios permanecieron activos y aprobaron en los trece lotes completados.

**Resultado comprobado:** 98/98 nombres únicos del inventario runtimeOnly,
95 default y tres Email, con CLI exitoso y lectura posterior independiente.
Se compararon identidad, configuración efectiva y política IAM con la lectura
inmediatamente anterior al PATCH. En las 97 GEN2 se comprobaron revisión Ready,
tráfico íntegro hacia la revisión nueva y control IAM de invocación habilitado.
La GEN1 `onUserCreatedWelcomeEmail` conservó generación, trigger, configuración
e IAM y quedó ACTIVE. Los tres overlays Email preservaron sus tres valores
efectivos; no se accedió al contenido de Secret Manager ni se invocaron handlers.

| Lote | Cantidad | Operación privada, prefijo `provider-release-operation-` | Lectura posterior UTC |
| --- | ---: | --- | --- |
| default 1 | 10 | `CoHlaN` | 02:56:31 |
| default 2 | 10 | `LMSmnV` | 02:59:52 |
| default 3 | 10 | `errKup` | 03:03:38 |
| default 4 | 10 | `mdh0CJ` | 03:07:07 |
| default 5 | 10 | `2Y2tds` | 03:10:05 |
| default 6 | 10 | `38vHmL` | 03:13:39 |
| default 7 | 10 | `DZotny` | 03:17:18 |
| default 8 | 10 | `T7QKXQ` | 03:20:55 |
| default 9 | 7 | `Laebzo` | 03:24:01 |
| ocho funciones programadas default | 8 | `hm332j` | 03:27:54 |
| `onUserCreatedWelcomeEmail` | 1 | `HC1W7Z` | 03:34:32 |
| `testTransactionalEmail` | 1 | `qGceGj` | 03:36:28 |
| `testWelcomeEmail` | 1 | `bQXiRG` | 03:38:30 |

El inventario fresco `runtime-inventory-1792813119410.json`, obtenido con tres
GET paginados, confirma **109/109 Node 22 y ACTIVE**: 108 GEN2/una GEN1,
default 103/payments tres/email tres, sin diferencias de identidad, entrypoint,
generación o codebase. Incluye las once de seguridad, sin redesplegarlas.
La agregación local posterior exige cobertura exacta y ausencia de cambios de
`updateTime` entre readback e inventario de las 98. Evidencia en
`.local-isolation/provider-release-20261024T0112Z/`:

- `runtime-default-continuation-1792810607345.json`: 95 default verificados.
- `runtime-email-continuation-1792812485370.json`: tres Email verificados;
  conserva el intento bloqueado anterior y la continuación.
- `runtime-final-evidence-1792813127423.json`: 13 operaciones, 98 resultados,
  revisiones y referencias con hashes a capturas, lecturas e inventario final.
  SHA-256: `af6455fe91e19b993b8311fdb82111ff8cd2096f726fd290606e0f779d02f77d`.

La revisión independiente de los registros de esas trece operaciones confirmó
98 PATCH Functions únicos y ninguna mutación fuera del alcance registrado.
Los dos intentos bloqueados tuvieron cero PATCH Functions transmitidos. El
`git diff --check` del cierre aprobó; sólo informó avisos de conversión LF/CRLF.
La caché de Hosting preexistente se preservó y no se incluyó en el despliegue.

**Dos interrupciones locales resueltas sin ampliar el cambio remoto.** El primer
intento default (`snyDir`) bloqueó diez PATCH antes de transmisión porque el SDK
expresaba opciones no declaradas como `null`. Se conservó explícitamente el
valor efectivo de esos campos cuando el updateMask pedía reset; un valor
concreto diferente sigue bloqueado. La comparación estricta posterior no se
eliminó. El primer Email (`XL3UoP`) bloqueó su PATCH por la representación
numérica del mismo proyecto en las referencias de secretos GEN1. Cinco GET
acotados confirmaron nombres/versiones equivalentes y ninguna modificación de
esa Function. El helper local preserva exclusivamente esa representación en
`onUserCreatedWelcomeEmail`, con los dos pares key/secret esperados y todos los
demás campos idénticos. Sus **12 casos locales aprobaron**, incluidos cambio
de versión, proyecto, nombre, alta/baja y destino ajeno. El reintento reutilizó
el overlay preparado; no rotó secretos. No se cambió el código del candidato
ni el comparador de capturas usado por los 95 resultados anteriores.

Comandos ejecutados, con el Node fijado y helpers dentro de `.local-isolation/`
(registro de ejecución; no volver a desplegar estos lotes):

- `provider-runtime-default-batches.cjs --execute <operación-CoHlaN>`.
- `provider-runtime-email-batches.cjs --execute`, detenido antes del primer PATCH;
  `provider-runtime-email-resume.cjs --execute`, tres actualizaciones verificadas.
- `provider-email-secret-project.test.cjs`: 12/12, sin red.
- `provider-release-runtime-inventory.mjs --execute-read-only`: 109/109.
- `provider-runtime-final-evidence.cjs --write-local-evidence`: PASS, sin red.

**Límite y pendientes:** lo verificado aquí es despliegue, runtime, configuración,
IAM, readiness y tráfico; no certifica los recorridos autenticados A/B, CI remota,
ejecución de cada job ni drenaje exhaustivo de solicitudes antiguas. No se
invocaron pagos, webhooks ni correos como prueba. No hubo nuevos cambios de IAM,
Rules, datos de aplicación, tokens o ACL en esta continuación, ni Hosting,
directorio, beta, usuarios Auth, claims o push. Los tres servicios de borradores
siguen reabiertos. La tabla anterior de los doce alias conserva su resultado:
primer token retirado y ACL histórica inconclusa; once objetos sin modificar.
La remediación de esos once sigue bloqueada por la conciliación y el verificador
documentados; ya no quedan Functions pendientes de despliegue en este alcance.

## Cierre acotado de tokens — 24/10/2026 11:36 ART (14:36 UTC)

**DECISIÓN aceptada:** el usuario autorizó completar exclusivamente los once
objetos pendientes después de corregir y probar el verificador, y aceptó dejar
como «no verificable» la conservación histórica del primer objeto cuando la
evidencia no permitiera reconstruirla. No autorizó marcar esa conservación como
aprobada, modificar permisos ni repetir el PATCH del primero. Esa decisión
resuelve la condición operativa anterior; no repara ni reemplaza los resultados
`false` de la primera ejecución. A/B sigue diferido.

**HECHO sobre el primero:** el checkpoint sólo retenía exposición y alias, el
mutador anterior guardó el objeto previo en memoria y los resultados en
booleanos; la consulta de auditoría ya documentada no aportó una baseline.
La revisión local de esos artefactos no permite reconstruir las ACL/metadata
anteriores. No se repitió la investigación remota. V2 realizó un único GET de
metadata del primero: misma generación, tamaño, CRC32C y MD5 del manifiesto,
metageneración 3, token ausente, caché privada y ninguna ACL pública observada.
Esto acredita su estado observado; **no acredita conservación histórica**.

El nuevo verificador puro es
[`scripts/providerAssetMetadataVerification.mjs`](../../scripts/providerAssetMetadataVerification.mjs).
Compara todos los campos estables y todas las propiedades ACL, normalizando
orden de claves/entradas. Excluye sólo los cambios autorizados de token/caché
y los campos de versionado `metageneration`, `updated`, `etag` y `acl[].etag`.
Conserva las comprobaciones de generación, owner, identidad, roles, domain,
projectTeam, cifrado, retenciones, holds y propiedades desconocidas. El mapa de
custom metadata vacío/ausente se normaliza después de quitar sólo el token.
Exige metageneración exactamente +1, token ausente, caché exacta, checksums
intactos y correspondencia completa entre PATCH y GET, incluidos sus ETags.
El ETag ACL se registra aparte como identificador opaco; no se presume igual
al ETag del objeto. Fuentes oficiales de la API JSON usada:
[ObjectAccessControls](https://docs.cloud.google.com/storage/docs/json_api/v1/objectAccessControls),
[Objects](https://docs.cloud.google.com/storage/docs/json_api/v1/objects) y
[PATCH/precondiciones](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/patch).

**Validación ejecutada, Node 22.23.4: 76/76 pruebas enfocadas.**

- `node --test scripts/providerAssetMetadataVerification.test.mjs`: **56/56**.
  Admite versionado esperado y distinto orden; rechaza cambios reales de ACL,
  altas/bajas, metadata protegida, valores desconocidos, generación, token,
  caché o respuesta posterior. No serializa tokens, ni siquiera si aparecen
  duplicados en otro campo o dentro de una URL.
- `node --test .local-isolation/provider-release-metadata-v2.test.mjs`:
  **20/20**. Snapshot persistido antes de PATCH; exclusión del primer alias y
  destinos ajenos; fallo de persistencia o precondiciones impide escritura;
  412, timeout y diferencia posterior hacen sólo una reconciliación GET y
  detienen el lote sin reintento. Sin red ni servicios externos en estas pruebas.
- No se repitieron suites generales, emuladores, builds, inventarios de
  Functions ni canarios de producto: no cambió código de aplicación.

**Ejecución real:** `.local-isolation/provider-release-metadata-v2.mjs --execute
--state-dir .local-isolation/provider-metadata-close-20261024-v2`, con el Node
fijado, entre 14:35:21 y 14:36:00 UTC. Exactamente **11 PATCH y 25 GET** de
metadata: tres operaciones por pendiente, un GET del primero y dos del bucket.
Se validó el hash del checkpoint original y el destino; cada PATCH mantuvo
`ifGenerationMatch` original y `ifMetagenerationMatch=2`, seleccionando live
sin `generation`. Cuerpo limitado a eliminar `firebaseStorageDownloadTokens`
y fijar `cacheControl=private,no-store`; sin campos ACL ni cambios IAM.

Antes de cada PATCH se guardó la metadata completa sin token, cifrada con DPAPI
CurrentUser, escritura exclusiva, flush y descifrado de comprobación. Se
conservaron también respuesta PATCH y GET posterior: **34 snapshots cifrados**
(tres por pendiente y uno de lectura del primero), con hashes vinculados al
registro. No se guardaron tokens ni hashes de tokens. Los once tuvieron
metageneración 2 → 3, ETags ACL cambiados y permisos/metadata estable idénticos;
ningún resultado requirió reconciliación. La configuración de acceso uniforme
del bucket consultada antes/después permaneció igual; no se repitió una auditoría
general de IAM heredado.

| Alias | Resultado actual | Permisos y metadata estable | PATCH en este cierre |
| --- | --- | --- | ---: |
| `7c5d792e9f03bcb9ec5a572c` | Token ausente, caché privada; integridad por metadata confirmada | Conservación histórica **no verificable**, limitación aceptada | 0 |
| `5002d6b48847ecef164ad716` | Token retirado, caché privada | Conservación verificada V2 | 1 |
| `2fe40ffa32dc2a19f5121da3` | Token retirado, caché privada | Conservación verificada V2 | 1 |
| `e65c6d92ff982f4d2ff121fd` | Token retirado, caché privada | Conservación verificada V2 | 1 |
| `9f2619d12a4f7b437c9cf334` | Token retirado, caché privada | Conservación verificada V2 | 1 |
| `45a716642cb2bb9645d6883a` | Token retirado, caché privada | Conservación verificada V2 | 1 |
| `c5f924f88e91027cd2945951` | Token retirado, caché privada | Conservación verificada V2 | 1 |
| `af53ad9a3df2810228ac9a51` | Token retirado, caché privada | Conservación verificada V2 | 1 |
| `8270c69467f6f79c9a2e4b25` | Token retirado, caché privada | Conservación verificada V2 | 1 |
| `362be99038d54d0f151a035f` | Token retirado, caché privada | Conservación verificada V2 | 1 |
| `4a6cfac60426a3c25ef7963c` | Token retirado, caché privada | Conservación verificada V2 | 1 |
| `6364719b4a87dde298acc197` | Token retirado, caché privada | Conservación verificada V2 | 1 |

Registro saneado:
`.local-isolation/provider-metadata-close-20261024-v2/metadata-v2-results.json`,
SHA-256 `3577da12d33ca5a235be0d44a7d1e58332d63c7d18759bf0bea38755428f5b4d`.
Mutador V2: `5ade62b7e5f14538fba4fb8c8c8c39c7da49e6e7bebe9f2ce23d557875b4da92`;
verificador: `e2bdee9d60da7e3bafc07182ea37f4330a940e40924db6b811a45ffcbda0f7db`.
El mutador anterior y sus resultados originales se preservan como evidencia,
no como procedimiento para volver a ejecutar los doce PATCH.
La revisión independiente local confirmó los once alias y generaciones,
34/34 hashes de snapshots, hashes del código/checkpoint y todos los controles
de precondiciones y lectura posterior, sin nuevas consultas remotas.

**Límites restantes:** A/B autenticados sigue pendiente; no se descargó contenido
privado ni se probó HTTP con las URLs antiguas. Token ausente no prueba borrar
copias distribuidas ni revocar URLs firmadas. La conservación histórica del
primero sigue no verificable. CI remota y drenaje exhaustivo conservan sus
límites anteriores. No hubo despliegues, nuevas restricciones de servicios,
modificaciones de permisos, Hosting, pagos, comunicaciones, Auth/claims ni
archivos de aplicación ajenos; se preservó el trabajo concurrente de publicidad
y dashboard.

**Siguiente paso propuesto, no ejecutado:** preparar el alcance mínimo de una
beta cerrada con alta por invitación, la autenticación existente, un negocio
con propietario verificado y un panel que gestione sólo su ficha privada.
Mantener la entrega pública y colaboradores múltiples para etapas posteriores;
no abrir accesos a proveedores ni publicar el directorio como efecto de este cierre.
