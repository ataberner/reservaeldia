# Countdown: protección local A4 — FASE 4B2B

Estado: implementada y verificada localmente para el alcance A4 seleccionado.
Sin despliegue; Q1 no aceptada. Selección fijada antes de editar Rules.
Autoridad: [A4 y matriz](../contracts/SECURITY_CONTRACT.md#accepted-obligations),
[DATA_MODEL](../architecture/DATA_MODEL.md#countdownpresets).
Las líneas base [4B1](SECURITY_RULES_BASELINE_4B1.md) y
[4B2A](SECURITY_RULES_4B2A.md) son históricas y se preservan.

## Selección anterior a editar

Se seleccionan los cinco A4 existentes: `countdown-private-draft`,
`countdown-immutable-A-update`, `countdown-immutable-A-delete`,
`countdown-immutable-admin-update`, `countdown-immutable-admin-delete`.
El alcance incluye los invariantes adicionales siguientes, no sólo esos IDs.
`gl` = get/list; `cud` = create/update/delete; reemplazo es una escritura.

| Recurso / operación | Autoridad aceptada; permiso observado → exigido | Consumidor legítimo y verificación | Límite pendiente |
| --- | --- | --- | --- |
| `countdownPresets/{id}` gl | A4: root posee draft administrativo, incluso `estado=published`. Auth general → negar ordinarios/N; lectura administrativa conservada según helper existente | `listCountdownPresetsAdmin` por CALL; catálogo autenticado resuelve `activeVersion` mediante CALL. Negativos root publicado/listado y positivos C de lectura administrativa | Lectura SDK administrativa conservada como observación, no aceptación de Q1 ni habilitación nueva |
| Root cud, puntero `activeVersion`, draftVersion/estado/tombstone | A4: procedimiento de concurrencia, publicación y retención. Auth general → ningún SDK cliente, incluidos claims admin | Save/publish/archive/delete/sync/duplicate por CALL y transacciones Admin. Probar create, update, replace y delete | Helpers administrativos y semántica de roles intactos |
| `versions/{version}` y descendientes cud | A4: versión creada por proceso, nunca sobrescrita. Auth general → ningún SDK cliente | Publicación `transaction.create`, historia de versiones por CALL. Probar fabricación de versión, reemplazo, u/d, descendientes y claims admin | gl autenticado existente se conserva como observación; no es el catálogo ni valida activeVersion. Política de lectura SDK cruda sigue pendiente |
| `operations/{operationId}` y otros descendientes administrativos gl/cud | A4: replay y resultados administrativos del procedimiento. Auth general → gl sólo helper admin existente; cud sólo backend | `operation.result` contiene resultado del save/duplicate; `operationId` y expectedDraftVersion protegen replay/concurrencia. Probar lecturas y falsificación/borrado, incluidos niveles anidados | No se otorgan capacidades nuevas ni se unifican predicados |
| `assets/countdown/staging/**` gl/cud | A4: borrador mutable administrativo. Auth general → gl administrativo observado; cud sólo backend, incluidos prefijos exactos | Save/duplicate suben/copían bytes por Admin; builder hidrata URL por token. Probar N/A/B, admin writes y anidados | Rules no revocan URLs por token; no cambiar esa distribución |
| `assets/countdown/{frames,thumbnails}/{preset}/draft/**` gl/cud | A4: draft administrativo. Auth general → gl administrativo observado; cud sólo backend | `isMutableDraftAssetPath` y limpieza de draft. Probar SVG/PNG, list, exactos y descendientes | Sin cambios de MIME, schema 2, retención o URLs |
| `assets/countdown/{frames,thumbnails}/{preset}/operations/**` cud | A4: artefactos inmutables del proceso. Auth general → ningún SDK cliente, create incluido | Publish copia frame/thumbnail a operación+attempt; referencias se retienen al archivar. Negativos y positivos C de lectura autenticada | gl autenticado conservado; no convertir SDK/URL en público anónimo |
| Resto de `frames/**` y `thumbnails/**` | Son contenedores de artefactos del servicio; escrituras SDK no pueden fabricar rutas fuera del procedimiento. cud → backend; get autenticado conservado fuera de draft | Referencias SVG legacy siguen compatibles; pruebas C de lectura, sin modificar datos/rutas | Listados de ancestros mixtos sólo admin para no enumerar draft; no se define nueva distribución legacy |
| `assets`, `assets/countdown`, `frames`, `thumbnails`, nivel preset: list | A4: los ancestros no deben volver a enumerar estado privado. Auth general → admin según helper existente | Probar cada nivel con objetos sintéticos en staging/draft, sin confundir prefijo vacío con permiso denegado | Objeto individual en ancestros no privados conserva permiso observado. Otros namespaces de assets y countdown siguen fuera de alcance |

No se halló acceso SDK directo a countdownPresets en consumidores actuales:
`src/domain/countdownPresets/service.js` usa nueve callables; catálogo y builder
lo consumen. `countdownAudit/runtime.js:493` es un helper genérico cuyos callers
actuales, líneas 549/553, usan **plantillas y borradores**. La referencia anterior
de la matriz era incorrecta; se corrige documentación, no ese diagnóstico.

Las mutaciones son del backend por el contrato de operación/versionado, no por
una elección de representación administrativa. Conservar una lectura que antes
concedía el fallback no aprueba la política completa. Los otros namespaces bajo
assets y los nombres countdown no modelados conservan su compatibilidad; no se
bloquea todo assets ni se concede un bypass nuevo. Q1-A/B/C permanecen pendientes.

## Evidencia y comparación

Corrida final: **session-IijmGV**, 2026-09-11T18:55:40.616Z UTC.
**5/5 A4 originales corregidos y 573/573 nuevos A4 pasan**, sin cambiar sus
expectativas de aceptación. Son 578 A4 (152 Firestore y 426 Storage).
Pasan también los **458 A1/A2** de 4B2A y los **18 A3** de proveedores.
No quedan fallas de aceptación en los casos ejecutados, sin certificar recursos
ajenos a la matriz seleccionada o canales remotos.

| Grupo | 4B1 coincide/total | 4B2A coincide/total | 4B2B coincide/total | Infraestructura final |
| --- | ---: | ---: | ---: | ---: |
| acceptance | 78/157 | 476/481 | 1054/1054 | 0 |
| characterization | 147/147 | 167/167 | 273/273 | 0 |
| proposal Q1 | 2/12 | 2/12 | 2/12 | 0 |

**1.339 casos ejecutados**, 0 omitidos/cancelados. Incluyen **1.323 operaciones
SDK sujetas a Rules: 537 Firestore y 786 Storage**. Los otros 16 ejecutan helpers
puros de autorización backend, separados de Rules (12 C y 4 Q1). Los 12 probes
Q1 se ejecutaron, pero mantienen 10 diferencias frente a la propuesta; su TAP
aprobado no significa política implementada. Admin sólo prepara/limpia fixtures.

Se preservaron los 660 IDs y categorías de 4B2A. Sólo cambian siete expectativas
de caracterización, con metadata explícita `expectationChange: phase=4B2B,
authority=A4, before=allow`. Se agregan 679 casos: 573 A4 y 106 C. No hay skips,
filtros, inversión de aceptación ni reclasificación para ocultar vulneraciones.
El apéndice compara cada ID; los nuevos figuran como no ejecutados en 4B1/4B2A,
sin inferir experimentalmente su resultado histórico.

| Cinco IDs seleccionados | 4B2A observado | 4B2B esperado/observado | Autoridad |
| --- | --- | --- | --- |
| countdown-private-draft | allow | deny/deny | A4 |
| countdown-immutable-A-update | allow | deny/deny | A4 |
| countdown-immutable-A-delete | allow | deny/deny | A4 |
| countdown-immutable-admin-update | allow | deny/deny | A4 |
| countdown-immutable-admin-delete | allow | deny/deny | A4 |

| Caracterización actualizada | Antes → después | Operación | Justificación |
| --- | --- | --- | --- |
| fallback-countdownPresets-versions | allow → deny | update | A4, procedimiento/versionado o draft privado |
| fallback-countdownPresets-operations | allow → deny | update | A4, procedimiento/versionado o draft privado |
| storage-fallback-assets-countdown-staging-ID-get | allow → deny | get | A4, procedimiento/versionado o draft privado |
| storage-fallback-assets-countdown-staging-ID-update | allow → deny | update | A4, procedimiento/versionado o draft privado |
| storage-fallback-assets-countdown-staging-ID-delete | allow → deny | delete | A4, procedimiento/versionado o draft privado |
| storage-fallback-assets-countdown-frames-ID-operations-op-update | allow → deny | update | A4, procedimiento/versionado o draft privado |
| storage-fallback-assets-countdown-frames-ID-operations-op-delete | allow → deny | delete | A4, procedimiento/versionado o draft privado |

## Comandos, intentos y destinos

Logs conservados bajo `.local-isolation/phase4b2b/`:

| Comando | Sesión / log | Salida | Resultado |
| --- | --- | ---: | --- |
| npm run local:check | local-check.log | 0 | Proyecto, bucket, puertos y prerrequisitos |
| npm run test:local:unit | unit.log | 0 | 12/12 |
| npm run test:local:rules, intento 1 | session-2oqSHD / rules-run-1.log | 1 | TAP 1366/1370; cuatro fallas C de listado administrativo, 1054 A y 31 checks countdown pasan; cero errores de infraestructura |
| npm run test:local:rules, repetición completa | session-IijmGV / rules-run-2.log | 0 | TAP 1370/1370: 1339 casos y 31 checks countdown; sin fallas ni omitidos |
| npm run test:local | session-aBb1K3 / local-test.log | 0 | 97/97: configuración 12, backend 7, compatibilidad aislada 75, integración 1, navegador 1, emuladores ausentes 1 |

La primera corrida denegaba los listados administrativos de `assets`,
`assets/countdown` y ambos niveles preset de frames/thumbnails. Eran regresiones
de autorización inesperadas, **no infraestructura**. Se corrigió el permiso
recursivo exclusivamente de **list** administrativo en assets; no concede
get/write ni cambia isAdmin. Se mantuvieron los cuatro asserts allow y se inició
una sesión nueva. La evaluación de list debe abarcar los descendientes posibles;
un match del objeto exacto no alcanza para esos prefijos. Véase la
[sintaxis oficial de Rules Storage](https://firebase.google.com/docs/storage/security/core-syntax).
No se resolvió con una excepción global de lectura ni habilitando un handler.

Ambas corridas ejecutaron los 1339 casos y los 31 checks de compatibilidad. Los
logs conservan el primer código 1. No hubo fallos de arranque/compilación/hook,
transporte o limpieza; warnings de Java/Node y metadata bloqueada no cuentan
como deny. Sólo permission-denied/storage/unauthorized certifican denegación SDK.
Los fallos ECONNREFUSED del test offline son el negativo esperado tras detener
emuladores, separados de la autorización.

Destino efectivo: **demo-reservaeldia-local**, bucket
**demo-reservaeldia-local.appspot.com**, Auth **127.0.0.1:19099**, Firestore
**127.0.0.1:18080**, Functions **127.0.0.1:15001**, Storage **127.0.0.1:19199**.
Hub 14400, logging 14500, websocket 19150; Next 3100 sólo en test:local.
Configuración personal vacía, UUIDs/identidades y objetos sintéticos. Para probar
objetos exactos como staging se usa el nombre real del prefijo dentro de esta
sesión exclusiva, sin datos importados; se limpian exclusivamente paths propios.
Fixtures Storage de Rules contienen ocho bytes sintéticos, no archivos reales;
los tests de validación generan PNG en memoria para sus comprobaciones de formato.

Node v22.13.1, Java 25.0.2, Firebase CLI 14.4.0; SDK cliente 11.7.3,
Admin 13.4.0, emulador Firestore 1.19.8 / runtime Rules Storage 1.1.3.
No se agregaron dependencias. El runtime declarado nodejs20 no equivale a haber
ejecutado Node 20: las compilaciones y pruebas locales usaron Node 22.

## Compatibilidad comprobada y límites

El comando dedicado incorpora checks existentes, desde las fuentes actuales
copiadas y compiladas por el launcher 4A. La lista compartida
[countdownChecks.cjs](../../scripts/local/countdownChecks.cjs) gobierna tanto
copia como ejecución, sin nuevo recorrido ni cambio de allowlist.

| Pruebas countdown | Casos | Tipo y evidencia exacta |
| --- | ---: | --- |
| functions/countdownPresetPhase1Policy.test.mjs | 10 | Comportamiento puro: catálogo exacto activeVersion, fail-closed cero/ausente/borrada/incoherente/corrupta, draft ignorado, planes de concurrencia/replay, tombstones y referencias |
| functions/countdownPresetPhase3Policy.test.mjs | 3 | Comportamiento puro: duplicación actual/legacy o desde versión activa; nuevo draft sin copiar lifecycle |
| shared/countdownFrameAssetContract.test.mjs | 4 | Comportamiento puro: compatibilidad SVG histórica y validaciones PNG, dimensiones/peso/corrupción |
| functions/countdownFrameAssetValidation.test.mjs | 5 | Cuatro comportamientos con PNG sintético/Sharp; uno estático sobre conservación bytes/MIME en staging/publicación |
| functions/countdownPresetPhase1Service.test.mjs | 5 | Inspección de texto: wiring de catálogo/transacciones/frameScale/esquema/retención, **no ejecución del handler** |
| functions/countdownPresetPhase3Service.test.mjs | 4 | Inspección de texto: duplicación/staging/FieldValue/historia administrativa, **no ejecución del handler** |

Total **21 de comportamiento + 10 estáticos**, todos aprobados en ambas corridas.
No hay prueba de transacciones concurrentes reales ni del ciclo completo
save→publish→archive/delete. La fuente del servicio conserva requireAuth del
catálogo y requireAdmin de administración; los tests puros comprueban la
resolución de catálogo y decisiones de lifecycle, no su transporte.

Se verificó explícitamente que los wrappers de listCountdownPresetsPublic,
saveCountdownPresetDraft, publishCountdownPresetDraft y
listCountdownPresetVersionsAdmin siguen bloqueados por 4A, junto con los probes
existentes. No se ejecutaron esos handlers, ni otros countdown handlers, triggers,
schedulers, proveedores o endpoints nuevos. No se habilitó catálogo anónimo.

La inspección de [service.js](../../src/domain/countdownPresets/service.js),
[catálogo](../../src/hooks/useCountdownPresetCatalog.js) y
[builder](../../src/hooks/useCountdownPresetBuilderState.js) no halló writes SDK
que adaptar; usa CALL para datos y URLs por token para hidratar assets. Ningún
consumidor de negocio cambió. El browser test comprueba arranque/aislamiento
desktop/mobile de la página local, **no UI del builder ni render final countdown**.

Las lecturas positivas de versiones crudas, bytes publicados y administración
SDK son caracterizaciones que detectan deny-all accidental, no permisos nuevos
aceptados. Se conservan autenticadas; nunca se convierten en catálogo o acceso
anónimo por llamarse publicadas. A1/A2 conserva sus positivos efectivos de
ownership/query/upload, y A3 su frontera y caracterizaciones de shape.

Rules no certifican IAM, tokens de descarga existentes, URLs firmadas, cachés,
distribución pública ni retención desplegada. Una URL por token puede tener un
canal de entrega distinto del SDK evaluado; la denegación SDK de draft no promete
revocar esas URLs. No se verificaron identidades/claims/configuración o datos
remotos, ni se realizaron deploys, commits, migraciones u operaciones remotas.

## Revisión local exacta y reproducción

Hashes SHA-256 comparados contra ambas copias efectivas (Rules final e integración).
El manifest rules-source se valida antes/después de las operaciones; las fuentes
de negocio y helpers administrativos conservan su hash inicial.

| Archivo consumido | SHA-256 |
| --- | --- |
| firestore.rules | e7ad46863e3eb3677f583ff1b0843a58a258df561cce1bb1f0dbca519ca6a334 |
| storage.rules | ca20bf6c8ac45bcd805286c86cc6d9e8c0efc56975547468737afb2ed711c610 |
| scripts/local/rulesCases.mjs | 51a23c6fc2ad15cd555f8bee23e1a43ec5f93c6ea2f1bcc4c6504dddc7eec550 |
| scripts/local/rules.test.mjs | eb47259d43a9c1be2fc5d919c94866b6bc3646cdee6c58173542e90cfb119f09 |
| scripts/local/runLocal.cjs | 9a61940a876dc4573a16234f77a90b4acc144c59e9f8a9a463c52acfdebbfb77 |
| scripts/local/session.cjs | c3a006bacb85cf8634ce50d2a38be024e53f3492708502ce90ae6d761cde17db |
| scripts/local/countdownChecks.cjs | 2e9d1c367ca557af1b95b5fddd69625d6f75c26b92a8b64347ca49961066e891 |
| scripts/local/functionsEntry.cjs | cbcd877ba5e5686b60c35b0cb95ef00d6fd7e433b4ed555f60df227da45fb591 |
| scripts/local/networkGuard.cjs | 48e45c189ef3d068b5ee1626d56cfb15b6968e2a2a124f444ef1ff71c3db9168 |
| shared/firebaseEnvironment.cjs | 62bfade41bda0c8c19fe13029387998d7022bc62b97e1e1fa50ab853a9bab8f3 |
| functions/src/auth/adminAuth.ts | 590d95830639f6624d6088e2a38898babfa18e96fc25dd8911ed29f6961be793 |
| functions/src/countdownPresets/service.ts | b893daac657115048e7aa9e52569fe536533edc7f28c7c32b8ae8c1dac39af5b |
| functions/src/countdownPresets/phase1Policy.ts | f63b5667683f833b58e764fcc10b9fcb705eaefa87910e70a7866954ef6898d6 |
| functions/src/countdownPresets/phase3Policy.ts | a9c1065c2b62d6f13e8a0f349706ee167e57e81380d54b176aaeb038b2ec970a |
| functions/src/countdownPresets/frameAssetValidation.ts | 058805277b4187b6507bb170da896f19b41332acb3eecbe994ac85f76f6ba809 |
| shared/countdownFrameAssetContract.cjs | 95ce86138dba15e170a6f146782c28f8500ffefc4777f68d4bb8bcbf8c7000f8 |
| src/domain/countdownPresets/service.js | e3f1ddb7383a78546e02241c5805ca7fcb26817fbf585bc5b18f095767cc9706 |
| src/domain/countdownAudit/runtime.js | 2fac8a72ea419def401b077d2d31f525f9e75f5cdd2a424d5a460e64091d397d |
| src/hooks/useCountdownPresetCatalog.js | 7e99da14504f6c8afc3181a953067ed65e953095e9a6b2d0a9c1917d54af081d |
| src/hooks/useCountdownPresetBuilderState.js | da9e229c0c0769a819402b0ac8c369c2d4b8b66537c39ab27c1d39722aa3c43c |
| functions/countdownPresetPhase1Policy.test.mjs | ae3fca62fd2a7160dda221e83148e2062a516b874f7e18e9e42a87cab80e42bf |
| functions/countdownPresetPhase3Policy.test.mjs | 3a802eb4bfab183815f20f0bfad3e56157a7db051401878d83914123478e1866 |
| shared/countdownFrameAssetContract.test.mjs | 5fed2725cb49d45e6ebbb25070641a242eeeaa74bfb91cd885a44bfa0d81320f |
| functions/countdownPresetPhase1Service.test.mjs | 4c595b2ea6497ea9d7cf2ec0adf6554e9a7cf7dff0c38b3eca2f7ae8a4ce3364 |
| functions/countdownPresetPhase3Service.test.mjs | 984b03ee08e5b7fbfa9c2c0a20c4d90c3b509031be0e799fe48a27eb4a311ee8 |
| functions/countdownFrameAssetValidation.test.mjs | 210a07f28178bc5fa1de9ce5bcba4653ce722c2859540d0c11ae0516010df713 |

Compilados temporales construidos por tsc en cada sesión, iguales entre la corrida
final de Rules y test:local (no se copiaron los lib preexistentes):

| Compilado | SHA-256 |
| --- | --- |
| functions/lib/countdownPresets/phase1Policy.js | a1db09c5e02eb80fa943b1a2449d12cf6c21e81d3a058de9e4e3f9acc2ac9c1e |
| functions/lib/countdownPresets/phase3Policy.js | 34b6dff1bffbe993587abb1b43bc11bca2183df91aeca393d408719d1b1ac163 |
| functions/lib/countdownPresets/frameAssetValidation.js | 15633020db0a768e735056497876fb6755fc24b696c2548fabb439063ccf7f60 |
| functions/lib/countdownPresets/service.js | 7ec75d62e3e08a0b53ba7a7c2e66debc0aca627ae5214852da7f768ef991a1fb |

La corrida inicial usó Firestore e7ad46863e3eb3677f583ff1b0843a58a258df561cce1bb1f0dbca519ca6a334 y Storage
df4670318beb53de22fe33bc85d596a63fbf644470acd7757a8350a7037e3fbc.
El cambio posterior fue exclusivamente el match de list; los archivos de casos
y el ejecutor conservan el mismo hash entre ambas corridas.

Reproducción desde la raíz, después de revisar los prerrequisitos del
[runbook](../operations/DEVELOPMENT_WORKFLOW.md#rules-4b1):

~~~powershell
npm run local:check
npm run test:local:unit
npm run test:local:rules
npm run test:local
~~~

Cada comando de emuladores inicia una copia nueva. No ejecutar simultáneamente:
los puertos demo son fijos. Evidencia mínima preservada en
`.local-isolation/phase4b2b/evidence/{session}/`: session.json, rules-source.json,
rules-evidence.json (ambas corridas), integration/browser/offline-evidence.json
(integración). `verification.json` y `comparison-by-id.json` contienen comandos,
resultados, fuente, identidad/path/op/autoridad/esperado/observado por ID.
El directorio de evidencia está ignorado por Git; este informe y los tests
conservan la comparación reproducible sin depender de un commit.

## Cambios y decisiones que condicionan el siguiente trabajo

Revisión final contra el snapshot inicial: **11.213 archivos preexistentes**,
10 modificados dentro del alcance y **11.203 preservados por SHA-256**, sin
faltantes ni modificaciones inesperadas; dos archivos nuevos (manifest de checks
y este informe). Las líneas base 4B1/4B2A, los helpers administrativos y las
secciones F12/Q1 permanecen intactos. Se revisó el diff propio completo frente
al snapshot, incluyendo los archivos originalmente sin seguimiento.

`git diff --check` devuelve **0**; las advertencias LF/CRLF no son errores de
whitespace. Se validaron 20 enlaces nuevos/modificados con sus anchors y los
1.339 IDs de la tabla contra los resultados. Sin coincidencias de claves privadas,
access keys o API keys reales en archivos/evidencia de esta tarea; las fixtures
son sintéticas por construcción y no se importaron datos remotos. Evidencia de
preservación: `.local-isolation/phase4b2b/final-review.json`; diff propio:
`own-diff.patch`, separado de los numerosos cambios preexistentes.

Las tres sesiones propias terminaron con marcador stopped; el launcher cerró
únicamente sus procesos. Se preservaron sus JSON/logs mínimos y se eliminaron
exclusivamente session-2oqSHD, session-IijmGV y session-aBb1K3 mediante clean,
con validación de ruta bajo `.local-isolation` y propiedad de la sesión. Los
ocho puertos del recorrido quedaron libres. No se limpiaron fases anteriores,
archivos ajenos ni sesiones de otros trabajos.

Rules: se excluyen sólo countdownPresets y los contenedores countdown descritos;
sus grants coincidentes no pueden reabrir gl privados ni cud del backend.
El match recursivo list administrativo no concede writes/get. Los fallbacks
de otros catálogos, analytics/auditoría y assets compartidos/legacy siguen
abiertos con sus consumidores y decisiones originales. No se redefine el
contenido permitido de familias countdown no modeladas.

Archivos de implementación: firestore.rules, storage.rules; rulesCases.mjs
(A4 y caracterizaciones), rules.test.mjs (probes de wrappers bloqueados),
runLocal.cjs y session.cjs más countdownChecks.cjs (copiar/ejecutar checks
existentes). Documentación: matriz canónica, F10/F11, índice, runbook y este
informe. Sin cambios de consumidores, helpers, handlers, allowlist, contratos
de dominio, retención, claims, dependencias, CI ni Prompt Builder.

**F10/F11 continúan abiertos**, mitigados localmente sólo por 4B2A/4B2B y sin
aplicación remota verificada. **F12 conserva su estado parcial y límites**.
**Q1-A/B/C siguen pendientes**, sin considerar sus probes como aceptación.
Las siguientes elecciones reutilizan la [matriz de seguridad](../contracts/SECURITY_CONTRACT.md#access-matrix)
y la entrada única [Q1](../architecture/SYSTEM_FRAGILITY_MAP.md#open-operational-decisions);
esta tabla no es otro registro de política ni una aceptación:

| Decisión existente | Elección concreta requerida | Implementación que condiciona |
| --- | --- | --- |
| Perfil propio | Especificar campos c/u editables por SDK o reservarlos a CALL; decidir si d sólo ocurre por flujo de cuenta | Reducir CRUD propio y validar shape/propiedad de campos sin romper perfil/preferencias |
| RSVP propio | Permitir gestión explícita del dueño (operaciones/campos) o reservar c/u/d al backend/HTTP | Retirar o acotar writes SDK propios de respuestas |
| Historial propio | Confirmar snapshot sólo backend o definir edición propia autorizada | Denegar/acotar c/u/d propio sin alterar retención |
| Datos crudos y no modelados | Decidir si visitas/uniqueVisitors se consultan sólo como agregados; definir lectura SDK de versiones crudas y recursos compartidos/legacy/no modelados frente a canales autorizados | Restringir gl pendientes y retirar fallbacks residuales con compatibilidad concreta |
| Q1-A | Aceptar/cambiar representación y capacidades propuestas, o elegir híbrido con semántica explícita para SDK | Helpers, guardas y UI administrativa; no se elige aquí |
| Q1-B | Designar operador/aprobador de superadmins y confirmar gestión de admins de terceros | Provisión/revocación y protección contra autoasignación |
| Q1-C | Revocación en siguiente solicitud o ventana de token; definir puente admin:true y condición de retiro | Estado de frescura, compatibilidad y transición de claims |

La validación del handler/UI completo requiere primero un alcance específico de
aislamiento de esos flujos; no se amplió 4A para simular cobertura. La aplicación
y validación remota requieren autorización y evidencia separadas, no inferencia
a partir de esta suite verde.

## Comparación completa por ID

Expected se respalda en el ID de autoridad del catálogo ejecutable y la matriz;
C1/C2 son observación y Q1 propuesta. `—` significa no ejecutado en aquella fase,
no deny. Clase `cumple` para aceptación coincidente; `pendiente` para C/Q1,
aunque coincidan. No hubo errores de infraestructura en estos casos.

| ID | Grupo / autoridad | Identidad | Recurso y operación SDK (helper explícito) | Expected | 4B1 | 4B2A | 4B2B | Clase |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| profile-owner-get | acceptance / A1 | A | firestore: `usuarios/{A}` get | allow | allow | allow | allow | cumple |
| profile-cross-get | acceptance / A1 | B | firestore: `usuarios/{A}` get | deny | allow | deny | deny | cumple |
| profile-anonymous-get | acceptance / A1 | anonymous | firestore: `usuarios/{A}` get | deny | deny | deny | deny | cumple |
| profile-cross-create | acceptance / A1 | B | firestore: `usuarios/{A}` create | deny | allow | deny | deny | cumple |
| profile-cross-update | acceptance / A1 | B | firestore: `usuarios/{A}` update | deny | allow | deny | deny | cumple |
| profile-cross-delete | acceptance / A1 | B | firestore: `usuarios/{A}` delete | deny | allow | deny | deny | cumple |
| profile-unfiltered-list | acceptance / A1 | A | firestore: `usuarios` list | deny | allow | deny | deny | cumple |
| image-owner-get | acceptance / A1 | A | firestore: `usuarios/{A}/imagenes/{ID}` get | allow | allow | allow | allow | cumple |
| image-cross-get | acceptance / A1 | B | firestore: `usuarios/{A}/imagenes/{ID}` get | deny | allow | deny | deny | cumple |
| image-anonymous-get | acceptance / A1 | anonymous | firestore: `usuarios/{A}/imagenes/{ID}` get | deny | deny | deny | deny | cumple |
| image-cross-create | acceptance / A1 | B | firestore: `usuarios/{A}/imagenes/{ID}` create | deny | allow | deny | deny | cumple |
| image-cross-update | acceptance / A1 | B | firestore: `usuarios/{A}/imagenes/{ID}` update | deny | allow | deny | deny | cumple |
| image-cross-delete | acceptance / A1 | B | firestore: `usuarios/{A}/imagenes/{ID}` delete | deny | allow | deny | deny | cumple |
| image-A-list | acceptance / A1 | A | firestore: `usuarios/{A}/imagenes` list | allow | allow | allow | allow | cumple |
| image-B-list | acceptance / A1 | B | firestore: `usuarios/{A}/imagenes` list | deny | allow | deny | deny | cumple |
| draft-owner-get | acceptance / A1 | A | firestore: `borradores/{ID}` get | allow | allow | allow | allow | cumple |
| draft-cross-get | acceptance / A1 | B | firestore: `borradores/{ID}` get | deny | deny | deny | deny | cumple |
| draft-anonymous-get | acceptance / A1 | anonymous | firestore: `borradores/{ID}` get | deny | deny | deny | deny | cumple |
| draft-cross-create | acceptance / A1 | B | firestore: `borradores/{ID}` create | deny | deny | deny | deny | cumple |
| draft-cross-update | acceptance / A1 | B | firestore: `borradores/{ID}` update | deny | deny | deny | deny | cumple |
| draft-cross-delete | acceptance / A1 | B | firestore: `borradores/{ID}` delete | deny | deny | deny | deny | cumple |
| draft-owner-list | acceptance / A1 | A | firestore: `borradores` list | allow | allow | allow | allow | cumple |
| draft-unfiltered-list | acceptance / A1 | A | firestore: `borradores` list | deny | deny | deny | deny | cumple |
| draft-foreign-filter | acceptance / A1 | A | firestore: `borradores` list | deny | deny | deny | deny | cumple |
| publication-owner-get | acceptance / A1 | A | firestore: `publicadas/{ID}` get | allow | allow | allow | allow | cumple |
| publication-cross-get | acceptance / A1 | B | firestore: `publicadas/{ID}` get | deny | allow | deny | deny | cumple |
| publication-anonymous-get | acceptance / A1 | anonymous | firestore: `publicadas/{ID}` get | deny | deny | deny | deny | cumple |
| publication-cross-create | acceptance / A1 | B | firestore: `publicadas/{ID}` create | deny | allow | deny | deny | cumple |
| publication-cross-update | acceptance / A1 | B | firestore: `publicadas/{ID}` update | deny | allow | deny | deny | cumple |
| publication-cross-delete | acceptance / A1 | B | firestore: `publicadas/{ID}` delete | deny | allow | deny | deny | cumple |
| publication-owner-list | acceptance / A1 | A | firestore: `publicadas` list | allow | allow | allow | allow | cumple |
| publication-unfiltered-list | acceptance / A1 | A | firestore: `publicadas` list | deny | allow | deny | deny | cumple |
| publication-foreign-filter | acceptance / A1 | A | firestore: `publicadas` list | deny | allow | deny | deny | cumple |
| history-owner-get | acceptance / A1 | A | firestore: `publicadas_historial/{ID}` get | allow | allow | allow | allow | cumple |
| history-cross-get | acceptance / A1 | B | firestore: `publicadas_historial/{ID}` get | deny | allow | deny | deny | cumple |
| history-anonymous-get | acceptance / A1 | anonymous | firestore: `publicadas_historial/{ID}` get | deny | deny | deny | deny | cumple |
| history-cross-create | acceptance / A1 | B | firestore: `publicadas_historial/{ID}` create | deny | allow | deny | deny | cumple |
| history-cross-update | acceptance / A1 | B | firestore: `publicadas_historial/{ID}` update | deny | allow | deny | deny | cumple |
| history-cross-delete | acceptance / A1 | B | firestore: `publicadas_historial/{ID}` delete | deny | allow | deny | deny | cumple |
| history-owner-list | acceptance / A1 | A | firestore: `publicadas_historial` list | allow | allow | allow | allow | cumple |
| history-unfiltered-list | acceptance / A1 | A | firestore: `publicadas_historial` list | deny | allow | deny | deny | cumple |
| history-foreign-filter | acceptance / A1 | A | firestore: `publicadas_historial` list | deny | allow | deny | deny | cumple |
| draft-owner-create | acceptance / A1 | A | firestore: `borradores/{ID}` create | allow | allow | allow | allow | cumple |
| image-owner-create | acceptance / A1 | A | firestore: `usuarios/{A}/imagenes/{ID}` create | allow | allow | allow | allow | cumple |
| draft-owner-update | acceptance / A1 | A | firestore: `borradores/{ID}` update | allow | allow | allow | allow | cumple |
| image-owner-update | acceptance / A1 | A | firestore: `usuarios/{A}/imagenes/{ID}` update | allow | allow | allow | allow | cumple |
| draft-owner-delete | acceptance / A1 | A | firestore: `borradores/{ID}` delete | allow | allow | allow | allow | cumple |
| image-owner-delete | acceptance / A1 | A | firestore: `usuarios/{A}/imagenes/{ID}` delete | allow | allow | allow | allow | cumple |
| draft-change-owner | acceptance / A1 | A | firestore: `borradores/{ID}` update | deny | deny | deny | deny | cumple |
| draft-remove-owner | acceptance / A1 | A | firestore: `borradores/{ID}` removeOwner | deny | deny | deny | deny | cumple |
| draft-spoof-create | acceptance / A1 | A | firestore: `borradores/{ID}` create | deny | deny | deny | deny | cumple |
| publication-change-owner | acceptance / A1 | A | firestore: `publicadas/{ID}` update | deny | allow | deny | deny | cumple |
| history-change-owner | acceptance / A1 | A | firestore: `publicadas_historial/{ID}` update | deny | allow | deny | deny | cumple |
| profile-cross-owner-field | acceptance / A1 | B | firestore: `usuarios/{A}` update | deny | allow | deny | deny | cumple |
| rsvps-cross-get | acceptance / A1 | B | firestore: `publicadas/{ID}/rsvps/event` get | deny | allow | deny | deny | cumple |
| rsvps-cross-update | acceptance / A1 | B | firestore: `publicadas/{ID}/rsvps/event` update | deny | allow | deny | deny | cumple |
| rsvps-owner-list | acceptance / A1 | A | firestore: `publicadas/{ID}/rsvps` list | allow | allow | allow | allow | cumple |
| rsvps-cross-list | acceptance / A1 | B | firestore: `publicadas/{ID}/rsvps` list | deny | allow | deny | deny | cumple |
| visits-cross-get | acceptance / A1 | B | firestore: `publicadas/{ID}/visits/event` get | deny | allow | deny | deny | cumple |
| visits-cross-update | acceptance / A1 | B | firestore: `publicadas/{ID}/visits/event` update | deny | allow | deny | deny | cumple |
| visits-owner-create | acceptance / A2 | A | firestore: `publicadas/{ID}/visits/event` create | deny | allow | deny | deny | cumple |
| visits-owner-update | acceptance / A2 | A | firestore: `publicadas/{ID}/visits/event` update | deny | allow | deny | deny | cumple |
| visits-owner-delete | acceptance / A2 | A | firestore: `publicadas/{ID}/visits/event` delete | deny | allow | deny | deny | cumple |
| uniqueVisitors-cross-get | acceptance / A1 | B | firestore: `publicadas/{ID}/uniqueVisitors/event` get | deny | allow | deny | deny | cumple |
| uniqueVisitors-cross-update | acceptance / A1 | B | firestore: `publicadas/{ID}/uniqueVisitors/event` update | deny | allow | deny | deny | cumple |
| uniqueVisitors-owner-create | acceptance / A2 | A | firestore: `publicadas/{ID}/uniqueVisitors/event` create | deny | allow | deny | deny | cumple |
| uniqueVisitors-owner-update | acceptance / A2 | A | firestore: `publicadas/{ID}/uniqueVisitors/event` update | deny | allow | deny | deny | cumple |
| uniqueVisitors-owner-delete | acceptance / A2 | A | firestore: `publicadas/{ID}/uniqueVisitors/event` delete | deny | allow | deny | deny | cumple |
| publication-owner-create | acceptance / A2 | A | firestore: `publicadas/{ID}` create | deny | allow | deny | deny | cumple |
| checkout-owner-create | acceptance / A2 | A | firestore: `publication_checkout_sessions/{ID}` create | deny | deny | deny | deny | cumple |
| publication-owner-update | acceptance / A2 | A | firestore: `publicadas/{ID}` update | deny | allow | deny | deny | cumple |
| checkout-owner-update | acceptance / A2 | A | firestore: `publication_checkout_sessions/{ID}` update | deny | deny | deny | deny | cumple |
| publication-owner-delete | acceptance / A2 | A | firestore: `publicadas/{ID}` delete | deny | allow | deny | deny | cumple |
| checkout-owner-delete | acceptance / A2 | A | firestore: `publication_checkout_sessions/{ID}` delete | deny | deny | deny | deny | cumple |
| draft-foreign-publication-link | characterization / C1 | A | firestore: `borradores/{ID}` update | allow | allow | allow | allow | pendiente |
| image-foreign-storage-reference | characterization / C1 | A | firestore: `usuarios/{A}/imagenes/{ID}` create | allow | allow | allow | allow | pendiente |
| draft-unmodeled-subcollection | characterization / C1 | A | firestore: `borradores/{ID}/private/child` get | deny | deny | deny | deny | pendiente |
| profile-self-role-field | characterization / C1 | A | firestore: `usuarios/{A}` update | allow | allow | allow | allow | pendiente |
| countdown-private-draft | acceptance / A4 | A | firestore: `countdownPresets/{ID}` get | deny | allow | allow | deny | cumple |
| countdown-immutable-A-update | acceptance / A4 | A | firestore: `countdownPresets/{ID}/versions/1` update | deny | allow | allow | deny | cumple |
| countdown-immutable-A-delete | acceptance / A4 | A | firestore: `countdownPresets/{ID}/versions/1` delete | deny | allow | allow | deny | cumple |
| countdown-immutable-admin-update | acceptance / A4 | admin | firestore: `countdownPresets/{ID}/versions/1` update | deny | allow | allow | deny | cumple |
| countdown-immutable-admin-delete | acceptance / A4 | admin | firestore: `countdownPresets/{ID}/versions/1` delete | deny | allow | allow | deny | cumple |
| analyticsEvents-overlap-read | characterization / C1 | A | firestore: `analyticsEvents/{ID}` get | allow | allow | allow | allow | pendiente |
| analyticsEvents-overlap-write | characterization / C1 | A | firestore: `analyticsEvents/{ID}` create | allow | allow | allow | allow | pendiente |
| analyticsUsers-overlap-read | characterization / C1 | A | firestore: `analyticsUsers/{ID}` get | allow | allow | allow | allow | pendiente |
| analyticsUsers-overlap-write | characterization / C1 | A | firestore: `analyticsUsers/{ID}` create | allow | allow | allow | allow | pendiente |
| analyticsInvitations-overlap-read | characterization / C1 | A | firestore: `analyticsInvitations/{ID}` get | allow | allow | allow | allow | pendiente |
| analyticsInvitations-overlap-write | characterization / C1 | A | firestore: `analyticsInvitations/{ID}` create | allow | allow | allow | allow | pendiente |
| analyticsDaily-overlap-read | characterization / C1 | A | firestore: `analyticsDaily/{ID}` get | allow | allow | allow | allow | pendiente |
| analyticsDaily-overlap-write | characterization / C1 | A | firestore: `analyticsDaily/{ID}` create | allow | allow | allow | allow | pendiente |
| analyticsWeekly-overlap-read | characterization / C1 | A | firestore: `analyticsWeekly/{ID}` get | allow | allow | allow | allow | pendiente |
| analyticsWeekly-overlap-write | characterization / C1 | A | firestore: `analyticsWeekly/{ID}` create | allow | allow | allow | allow | pendiente |
| analyticsMonthly-overlap-read | characterization / C1 | A | firestore: `analyticsMonthly/{ID}` get | allow | allow | allow | allow | pendiente |
| analyticsMonthly-overlap-write | characterization / C1 | A | firestore: `analyticsMonthly/{ID}` create | allow | allow | allow | allow | pendiente |
| analyticsTemplates-overlap-read | characterization / C1 | A | firestore: `analyticsTemplates/{ID}` get | allow | allow | allow | allow | pendiente |
| analyticsTemplates-overlap-write | characterization / C1 | A | firestore: `analyticsTemplates/{ID}` create | allow | allow | allow | allow | pendiente |
| analyticsCohorts-overlap-read | characterization / C1 | A | firestore: `analyticsCohorts/{ID}` get | allow | allow | allow | allow | pendiente |
| analyticsCohorts-overlap-write | characterization / C1 | A | firestore: `analyticsCohorts/{ID}` create | allow | allow | allow | allow | pendiente |
| analyticsJobs-overlap-read | characterization / C1 | A | firestore: `analyticsJobs/{ID}` get | allow | allow | allow | allow | pendiente |
| analyticsJobs-overlap-write | characterization / C1 | A | firestore: `analyticsJobs/{ID}` create | allow | allow | allow | allow | pendiente |
| analyticsExports-overlap-read | characterization / C1 | A | firestore: `analyticsExports/{ID}` get | allow | allow | allow | allow | pendiente |
| analyticsExports-overlap-write | characterization / C1 | A | firestore: `analyticsExports/{ID}` create | allow | allow | allow | allow | pendiente |
| iconos_audit-overlap-read | characterization / C1 | A | firestore: `iconos_audit/{ID}` get | allow | allow | allow | allow | pendiente |
| iconos_audit-overlap-write | characterization / C1 | A | firestore: `iconos_audit/{ID}` create | allow | allow | allow | allow | pendiente |
| iconos_usage_snapshots-overlap-read | characterization / C1 | A | firestore: `iconos_usage_snapshots/{ID}` get | allow | allow | allow | allow | pendiente |
| iconos_usage_snapshots-overlap-write | characterization / C1 | A | firestore: `iconos_usage_snapshots/{ID}` create | allow | allow | allow | allow | pendiente |
| decoraciones_audit-overlap-read | characterization / C1 | A | firestore: `decoraciones_audit/{ID}` get | allow | allow | allow | allow | pendiente |
| decoraciones_audit-overlap-write | characterization / C1 | A | firestore: `decoraciones_audit/{ID}` create | allow | allow | allow | allow | pendiente |
| fallback-analyticsDaily-users | characterization / C1 | A | firestore: `analyticsDaily/{ID}/users/{B}` update | allow | allow | allow | allow | pendiente |
| fallback-analyticsWeekly-templates | characterization / C1 | A | firestore: `analyticsWeekly/{ID}/templates/template` update | allow | allow | allow | allow | pendiente |
| fallback-analyticsCohorts-periods | characterization / C1 | A | firestore: `analyticsCohorts/{ID}/periods/0` update | allow | allow | allow | allow | pendiente |
| fallback-countdownPresets-versions | characterization / C1 | A | firestore: `countdownPresets/{ID}/versions/1` update | deny | allow | allow | deny | pendiente |
| fallback-countdownPresets-operations | characterization / C1 | A | firestore: `countdownPresets/{ID}/operations/operation` update | deny | allow | allow | deny | pendiente |
| fallback-clientIssues-root | characterization / C1 | A | firestore: `clientIssues/{ID}` update | allow | allow | allow | allow | pendiente |
| fallback-text_presets-root | characterization / C1 | A | firestore: `text_presets/{ID}` update | allow | allow | allow | allow | pendiente |
| fallback-plantillas_secciones-root | characterization / C1 | A | firestore: `plantillas_secciones/{ID}` update | allow | allow | allow | allow | pendiente |
| fallback-invitaciones-root | characterization / C1 | A | firestore: `invitaciones/{ID}` update | allow | allow | allow | allow | pendiente |
| fallback-unmodeled_4b1-root | characterization / C1 | A | firestore: `unmodeled_4b1/{ID}` update | allow | allow | allow | allow | pendiente |
| iconos-ordinary-read | characterization / C1 | A | firestore: `iconos/{ID}` get | allow | allow | allow | allow | pendiente |
| iconos-ordinary-create | characterization / C1 | A | firestore: `iconos/{ID}` create | allow | allow | allow | allow | pendiente |
| iconos-ordinary-update | characterization / C1 | A | firestore: `iconos/{ID}` update | allow | allow | allow | allow | pendiente |
| iconos-ordinary-delete | characterization / C1 | A | firestore: `iconos/{ID}` delete | allow | allow | allow | allow | pendiente |
| iconos_archived-ordinary-read | characterization / C1 | A | firestore: `iconos_archived/{ID}` get | allow | allow | allow | allow | pendiente |
| iconos_archived-ordinary-create | characterization / C1 | A | firestore: `iconos_archived/{ID}` create | allow | allow | allow | allow | pendiente |
| iconos_archived-ordinary-update | characterization / C1 | A | firestore: `iconos_archived/{ID}` update | allow | allow | allow | allow | pendiente |
| iconos_archived-ordinary-delete | characterization / C1 | A | firestore: `iconos_archived/{ID}` delete | allow | allow | allow | allow | pendiente |
| decoraciones-ordinary-read | characterization / C1 | A | firestore: `decoraciones/{ID}` get | allow | allow | allow | allow | pendiente |
| decoraciones-ordinary-create | characterization / C1 | A | firestore: `decoraciones/{ID}` create | allow | allow | allow | allow | pendiente |
| decoraciones-ordinary-update | characterization / C1 | A | firestore: `decoraciones/{ID}` update | allow | allow | allow | allow | pendiente |
| decoraciones-ordinary-delete | characterization / C1 | A | firestore: `decoraciones/{ID}` delete | allow | allow | allow | allow | pendiente |
| decoraciones_archived-ordinary-read | characterization / C1 | A | firestore: `decoraciones_archived/{ID}` get | allow | allow | allow | allow | pendiente |
| decoraciones_archived-ordinary-create | characterization / C1 | A | firestore: `decoraciones_archived/{ID}` create | allow | allow | allow | allow | pendiente |
| decoraciones_archived-ordinary-update | characterization / C1 | A | firestore: `decoraciones_archived/{ID}` update | allow | allow | allow | allow | pendiente |
| decoraciones_archived-ordinary-delete | characterization / C1 | A | firestore: `decoraciones_archived/{ID}` delete | allow | allow | allow | allow | pendiente |
| exclusive-site_settings-root | characterization / C1 | admin | firestore: `site_settings/{ID}` update | deny | deny | deny | deny | pendiente |
| exclusive-site_settings-history | characterization / C1 | admin | firestore: `site_settings/{ID}/history/1` update | deny | deny | deny | deny | pendiente |
| exclusive-app_config-root | characterization / C1 | admin | firestore: `app_config/{ID}` update | deny | deny | deny | deny | pendiente |
| exclusive-plantillas_tags-root | characterization / C1 | admin | firestore: `plantillas_tags/{ID}` update | deny | deny | deny | deny | pendiente |
| exclusive-public_slug_reservations-root | characterization / C1 | admin | firestore: `public_slug_reservations/{ID}` update | deny | deny | deny | deny | pendiente |
| exclusive-publication_discount_codes-root | characterization / C1 | admin | firestore: `publication_discount_codes/{ID}` update | deny | deny | deny | deny | pendiente |
| exclusive-publication_discount_code_usage-root | characterization / C1 | admin | firestore: `publication_discount_code_usage/{ID}` update | deny | deny | deny | deny | pendiente |
| template-auth-published-get | characterization / C1 | A | firestore: `plantillas/{ID}` get | allow | allow | allow | allow | pendiente |
| template-anonymous-get | characterization / C1 | anonymous | firestore: `plantillas/{ID}` get | deny | deny | deny | deny | pendiente |
| template-legacy-missing-gates | characterization / C1 | A | firestore: `plantillas/{ID}` get | allow | allow | allow | allow | pendiente |
| template-unpublished-get | characterization / C1 | A | firestore: `plantillas/{ID}` get | deny | deny | deny | deny | pendiente |
| template-admin-write | characterization / C1 | admin | firestore: `plantillas/{ID}` update | deny | deny | deny | deny | pendiente |
| catalog-public-get | characterization / C1 | anonymous | firestore: `plantillas_catalog/{ID}` get | allow | allow | allow | allow | pendiente |
| catalog-public-filtered-list | characterization / C1 | anonymous | firestore: `plantillas_catalog` list | allow | allow | allow | allow | pendiente |
| catalog-unfiltered-list | characterization / C1 | anonymous | firestore: `plantillas_catalog` list | deny | deny | deny | deny | pendiente |
| provider-proveedores-anonymous-create | acceptance / A3 | anonymous | firestore: `proveedores/{ID}` create | deny | deny | deny | deny | cumple |
| provider-proveedores-anonymous-update | acceptance / A3 | anonymous | firestore: `proveedores/{ID}` update | deny | deny | deny | deny | cumple |
| provider-proveedores-anonymous-delete | acceptance / A3 | anonymous | firestore: `proveedores/{ID}` delete | deny | deny | deny | deny | cumple |
| provider-proveedores-A-create | acceptance / A3 | A | firestore: `proveedores/{ID}` create | deny | deny | deny | deny | cumple |
| provider-proveedores-A-update | acceptance / A3 | A | firestore: `proveedores/{ID}` update | deny | deny | deny | deny | cumple |
| provider-proveedores-A-delete | acceptance / A3 | A | firestore: `proveedores/{ID}` delete | deny | deny | deny | deny | cumple |
| provider-categorias_proveedores-anonymous-create | acceptance / A3 | anonymous | firestore: `categorias_proveedores/{ID}` create | deny | deny | deny | deny | cumple |
| provider-categorias_proveedores-anonymous-update | acceptance / A3 | anonymous | firestore: `categorias_proveedores/{ID}` update | deny | deny | deny | deny | cumple |
| provider-categorias_proveedores-anonymous-delete | acceptance / A3 | anonymous | firestore: `categorias_proveedores/{ID}` delete | deny | deny | deny | deny | cumple |
| provider-categorias_proveedores-A-create | acceptance / A3 | A | firestore: `categorias_proveedores/{ID}` create | deny | deny | deny | deny | cumple |
| provider-categorias_proveedores-A-update | acceptance / A3 | A | firestore: `categorias_proveedores/{ID}` update | deny | deny | deny | deny | cumple |
| provider-categorias_proveedores-A-delete | acceptance / A3 | A | firestore: `categorias_proveedores/{ID}` delete | deny | deny | deny | deny | cumple |
| provider-public-tuple | characterization / C1 | anonymous | firestore: `proveedores/{ID}` get | allow | allow | allow | allow | pendiente |
| provider-hidden | characterization / C1 | A | firestore: `proveedores/{ID}` get | deny | deny | deny | deny | pendiente |
| provider-inactive | characterization / C1 | anonymous | firestore: `proveedores/{ID}` get | deny | deny | deny | deny | pendiente |
| provider-subcollection | characterization / C1 | A | firestore: `proveedores/{ID}/internal/1` get | deny | deny | deny | deny | pendiente |
| provider-admin-malformed | characterization / C1 | admin | firestore: `proveedores/{ID}` create | deny | deny | deny | deny | pendiente |
| provider-category-public | characterization / C1 | anonymous | firestore: `categorias_proveedores/{ID}` get | allow | allow | allow | allow | pendiente |
| storage-usuarios-A-get | acceptance / A1 | A | storage: `usuarios/{A}/imagenes/{ID}.png` get | allow | allow | allow | allow | cumple |
| storage-usuarios-A-create | acceptance / A1 | A | storage: `usuarios/{A}/imagenes/{ID}.png` create | allow | allow | allow | allow | cumple |
| storage-usuarios-A-update | acceptance / A1 | A | storage: `usuarios/{A}/imagenes/{ID}.png` update | allow | allow | allow | allow | cumple |
| storage-usuarios-A-delete | acceptance / A1 | A | storage: `usuarios/{A}/imagenes/{ID}.png` delete | allow | allow | allow | allow | cumple |
| storage-usuarios-B-get | acceptance / A1 | B | storage: `usuarios/{A}/imagenes/{ID}.png` get | deny | allow | deny | deny | cumple |
| storage-usuarios-B-create | acceptance / A1 | B | storage: `usuarios/{A}/imagenes/{ID}.png` create | deny | allow | deny | deny | cumple |
| storage-usuarios-B-update | acceptance / A1 | B | storage: `usuarios/{A}/imagenes/{ID}.png` update | deny | allow | deny | deny | cumple |
| storage-usuarios-B-delete | acceptance / A1 | B | storage: `usuarios/{A}/imagenes/{ID}.png` delete | deny | allow | deny | deny | cumple |
| storage-usuarios-anonymous-get | acceptance / A1 | anonymous | storage: `usuarios/{A}/imagenes/{ID}.png` get | deny | deny | deny | deny | cumple |
| storage-usuarios-anonymous-create | acceptance / A1 | anonymous | storage: `usuarios/{A}/imagenes/{ID}.png` create | deny | deny | deny | deny | cumple |
| storage-usuarios-anonymous-update | acceptance / A1 | anonymous | storage: `usuarios/{A}/imagenes/{ID}.png` update | deny | deny | deny | deny | cumple |
| storage-usuarios-anonymous-delete | acceptance / A1 | anonymous | storage: `usuarios/{A}/imagenes/{ID}.png` delete | deny | deny | deny | deny | cumple |
| storage-usuarios-A-list | acceptance / A1 | A | storage: `usuarios/{A}/imagenes` list | allow | allow | allow | allow | cumple |
| storage-usuarios-B-list | acceptance / A1 | B | storage: `usuarios/{A}/imagenes` list | deny | allow | deny | deny | cumple |
| storage-user-thumbnail-A-get | acceptance / A1 | A | storage: `usuarios/{A}/thumbnails/{ID}.webp` get | allow | allow | allow | allow | cumple |
| storage-user-thumbnail-A-create | acceptance / A1 | A | storage: `usuarios/{A}/thumbnails/{ID}.webp` create | allow | allow | allow | allow | cumple |
| storage-user-thumbnail-A-update | acceptance / A1 | A | storage: `usuarios/{A}/thumbnails/{ID}.webp` update | allow | allow | allow | allow | cumple |
| storage-user-thumbnail-A-delete | acceptance / A1 | A | storage: `usuarios/{A}/thumbnails/{ID}.webp` delete | allow | allow | allow | allow | cumple |
| storage-user-thumbnail-B-get | acceptance / A1 | B | storage: `usuarios/{A}/thumbnails/{ID}.webp` get | deny | allow | deny | deny | cumple |
| storage-user-thumbnail-B-create | acceptance / A1 | B | storage: `usuarios/{A}/thumbnails/{ID}.webp` create | deny | allow | deny | deny | cumple |
| storage-user-thumbnail-B-update | acceptance / A1 | B | storage: `usuarios/{A}/thumbnails/{ID}.webp` update | deny | allow | deny | deny | cumple |
| storage-user-thumbnail-B-delete | acceptance / A1 | B | storage: `usuarios/{A}/thumbnails/{ID}.webp` delete | deny | allow | deny | deny | cumple |
| storage-user-thumbnail-anonymous-get | acceptance / A1 | anonymous | storage: `usuarios/{A}/thumbnails/{ID}.webp` get | deny | deny | deny | deny | cumple |
| storage-user-thumbnail-anonymous-create | acceptance / A1 | anonymous | storage: `usuarios/{A}/thumbnails/{ID}.webp` create | deny | deny | deny | deny | cumple |
| storage-user-thumbnail-anonymous-update | acceptance / A1 | anonymous | storage: `usuarios/{A}/thumbnails/{ID}.webp` update | deny | deny | deny | deny | cumple |
| storage-user-thumbnail-anonymous-delete | acceptance / A1 | anonymous | storage: `usuarios/{A}/thumbnails/{ID}.webp` delete | deny | deny | deny | deny | cumple |
| storage-user-thumbnail-A-list | acceptance / A1 | A | storage: `usuarios/{A}/thumbnails` list | allow | allow | allow | allow | cumple |
| storage-user-thumbnail-B-list | acceptance / A1 | B | storage: `usuarios/{A}/thumbnails` list | deny | allow | deny | deny | cumple |
| storage-thumbnails_borradores-A-get | acceptance / A1 | A | storage: `thumbnails_borradores/{A}/{ID}.webp` get | allow | allow | allow | allow | cumple |
| storage-thumbnails_borradores-A-create | acceptance / A1 | A | storage: `thumbnails_borradores/{A}/{ID}.webp` create | allow | allow | allow | allow | cumple |
| storage-thumbnails_borradores-A-update | acceptance / A1 | A | storage: `thumbnails_borradores/{A}/{ID}.webp` update | allow | allow | allow | allow | cumple |
| storage-thumbnails_borradores-A-delete | acceptance / A1 | A | storage: `thumbnails_borradores/{A}/{ID}.webp` delete | allow | allow | allow | allow | cumple |
| storage-thumbnails_borradores-B-get | acceptance / A1 | B | storage: `thumbnails_borradores/{A}/{ID}.webp` get | deny | allow | deny | deny | cumple |
| storage-thumbnails_borradores-B-create | acceptance / A1 | B | storage: `thumbnails_borradores/{A}/{ID}.webp` create | deny | allow | deny | deny | cumple |
| storage-thumbnails_borradores-B-update | acceptance / A1 | B | storage: `thumbnails_borradores/{A}/{ID}.webp` update | deny | allow | deny | deny | cumple |
| storage-thumbnails_borradores-B-delete | acceptance / A1 | B | storage: `thumbnails_borradores/{A}/{ID}.webp` delete | deny | allow | deny | deny | cumple |
| storage-thumbnails_borradores-anonymous-get | acceptance / A1 | anonymous | storage: `thumbnails_borradores/{A}/{ID}.webp` get | deny | deny | deny | deny | cumple |
| storage-thumbnails_borradores-anonymous-create | acceptance / A1 | anonymous | storage: `thumbnails_borradores/{A}/{ID}.webp` create | deny | deny | deny | deny | cumple |
| storage-thumbnails_borradores-anonymous-update | acceptance / A1 | anonymous | storage: `thumbnails_borradores/{A}/{ID}.webp` update | deny | deny | deny | deny | cumple |
| storage-thumbnails_borradores-anonymous-delete | acceptance / A1 | anonymous | storage: `thumbnails_borradores/{A}/{ID}.webp` delete | deny | deny | deny | deny | cumple |
| storage-thumbnails_borradores-A-list | acceptance / A1 | A | storage: `thumbnails_borradores/{A}` list | allow | allow | allow | allow | cumple |
| storage-thumbnails_borradores-B-list | acceptance / A1 | B | storage: `thumbnails_borradores/{A}` list | deny | allow | deny | deny | cumple |
| published-index.html-A-create | acceptance / A2 | A | storage: `publicadas/{ID}/index.html` create | deny | allow | deny | deny | cumple |
| published-index.html-A-update | acceptance / A2 | A | storage: `publicadas/{ID}/index.html` update | deny | allow | deny | deny | cumple |
| published-index.html-A-delete | acceptance / A2 | A | storage: `publicadas/{ID}/index.html` delete | deny | allow | deny | deny | cumple |
| published-index.html-B-create | acceptance / A2 | B | storage: `publicadas/{ID}/index.html` create | deny | allow | deny | deny | cumple |
| published-index.html-B-update | acceptance / A2 | B | storage: `publicadas/{ID}/index.html` update | deny | allow | deny | deny | cumple |
| published-index.html-B-delete | acceptance / A2 | B | storage: `publicadas/{ID}/index.html` delete | deny | allow | deny | deny | cumple |
| published-index.html-admin-create | acceptance / A2 | admin | storage: `publicadas/{ID}/index.html` create | deny | allow | deny | deny | cumple |
| published-index.html-admin-update | acceptance / A2 | admin | storage: `publicadas/{ID}/index.html` update | deny | allow | deny | deny | cumple |
| published-index.html-admin-delete | acceptance / A2 | admin | storage: `publicadas/{ID}/index.html` delete | deny | allow | deny | deny | cumple |
| published-share.jpg-A-create | acceptance / A2 | A | storage: `publicadas/{ID}/share.jpg` create | deny | allow | deny | deny | cumple |
| published-share.jpg-A-update | acceptance / A2 | A | storage: `publicadas/{ID}/share.jpg` update | deny | allow | deny | deny | cumple |
| published-share.jpg-A-delete | acceptance / A2 | A | storage: `publicadas/{ID}/share.jpg` delete | deny | allow | deny | deny | cumple |
| published-share.jpg-B-create | acceptance / A2 | B | storage: `publicadas/{ID}/share.jpg` create | deny | allow | deny | deny | cumple |
| published-share.jpg-B-update | acceptance / A2 | B | storage: `publicadas/{ID}/share.jpg` update | deny | allow | deny | deny | cumple |
| published-share.jpg-B-delete | acceptance / A2 | B | storage: `publicadas/{ID}/share.jpg` delete | deny | allow | deny | deny | cumple |
| published-share.jpg-admin-create | acceptance / A2 | admin | storage: `publicadas/{ID}/share.jpg` create | deny | allow | deny | deny | cumple |
| published-share.jpg-admin-update | acceptance / A2 | admin | storage: `publicadas/{ID}/share.jpg` update | deny | allow | deny | deny | cumple |
| published-share.jpg-admin-delete | acceptance / A2 | admin | storage: `publicadas/{ID}/share.jpg` delete | deny | allow | deny | deny | cumple |
| published-anonymous-sdk-get | characterization / C1 | anonymous | storage: `publicadas/{ID}/index.html` get | deny | deny | deny | deny | pendiente |
| storage-fallback-iconos-get | characterization / C1 | B | storage: `iconos/{ID}.png` get | allow | allow | allow | allow | pendiente |
| storage-fallback-iconos-update | characterization / C1 | B | storage: `iconos/{ID}.png` update | allow | allow | allow | allow | pendiente |
| storage-fallback-iconos-delete | characterization / C1 | B | storage: `iconos/{ID}.png` delete | allow | allow | allow | allow | pendiente |
| storage-fallback-iconos_archived-get | characterization / C1 | B | storage: `iconos_archived/{ID}.png` get | allow | allow | allow | allow | pendiente |
| storage-fallback-iconos_archived-update | characterization / C1 | B | storage: `iconos_archived/{ID}.png` update | allow | allow | allow | allow | pendiente |
| storage-fallback-iconos_archived-delete | characterization / C1 | B | storage: `iconos_archived/{ID}.png` delete | allow | allow | allow | allow | pendiente |
| storage-fallback-decoraciones-originals-get | characterization / C1 | B | storage: `decoraciones/originals/{ID}.png` get | allow | allow | allow | allow | pendiente |
| storage-fallback-decoraciones-originals-update | characterization / C1 | B | storage: `decoraciones/originals/{ID}.png` update | allow | allow | allow | allow | pendiente |
| storage-fallback-decoraciones-originals-delete | characterization / C1 | B | storage: `decoraciones/originals/{ID}.png` delete | allow | allow | allow | allow | pendiente |
| storage-fallback-decoraciones-thumbnails-get | characterization / C1 | B | storage: `decoraciones/thumbnails/{ID}.png` get | allow | allow | allow | allow | pendiente |
| storage-fallback-decoraciones-thumbnails-update | characterization / C1 | B | storage: `decoraciones/thumbnails/{ID}.png` update | allow | allow | allow | allow | pendiente |
| storage-fallback-decoraciones-thumbnails-delete | characterization / C1 | B | storage: `decoraciones/thumbnails/{ID}.png` delete | allow | allow | allow | allow | pendiente |
| storage-fallback-plantillas-ID-assets-get | characterization / C1 | B | storage: `plantillas/{ID}/assets/{ID}.png` get | allow | allow | allow | allow | pendiente |
| storage-fallback-plantillas-ID-assets-update | characterization / C1 | B | storage: `plantillas/{ID}/assets/{ID}.png` update | allow | allow | allow | allow | pendiente |
| storage-fallback-plantillas-ID-assets-delete | characterization / C1 | B | storage: `plantillas/{ID}/assets/{ID}.png` delete | allow | allow | allow | allow | pendiente |
| storage-fallback-plantillas_secciones-get | characterization / C1 | B | storage: `plantillas_secciones/{ID}.png` get | allow | allow | allow | allow | pendiente |
| storage-fallback-plantillas_secciones-update | characterization / C1 | B | storage: `plantillas_secciones/{ID}.png` update | allow | allow | allow | allow | pendiente |
| storage-fallback-plantillas_secciones-delete | characterization / C1 | B | storage: `plantillas_secciones/{ID}.png` delete | allow | allow | allow | allow | pendiente |
| storage-fallback-public-get | characterization / C1 | B | storage: `public/{ID}.png` get | allow | allow | allow | allow | pendiente |
| storage-fallback-public-update | characterization / C1 | B | storage: `public/{ID}.png` update | allow | allow | allow | allow | pendiente |
| storage-fallback-public-delete | characterization / C1 | B | storage: `public/{ID}.png` delete | allow | allow | allow | allow | pendiente |
| storage-fallback-previews-plantillas-get | characterization / C1 | B | storage: `previews/plantillas/{ID}.png` get | allow | allow | allow | allow | pendiente |
| storage-fallback-previews-plantillas-update | characterization / C1 | B | storage: `previews/plantillas/{ID}.png` update | allow | allow | allow | allow | pendiente |
| storage-fallback-previews-plantillas-delete | characterization / C1 | B | storage: `previews/plantillas/{ID}.png` delete | allow | allow | allow | allow | pendiente |
| storage-fallback-user_uploads-A-get | characterization / C1 | B | storage: `user_uploads/{A}/{ID}.png` get | allow | allow | allow | allow | pendiente |
| storage-fallback-user_uploads-A-update | characterization / C1 | B | storage: `user_uploads/{A}/{ID}.png` update | allow | allow | allow | allow | pendiente |
| storage-fallback-user_uploads-A-delete | characterization / C1 | B | storage: `user_uploads/{A}/{ID}.png` delete | allow | allow | allow | allow | pendiente |
| storage-fallback-borradores-ID-get | characterization / C1 | B | storage: `borradores/{ID}/{ID}.png` get | allow | allow | allow | allow | pendiente |
| storage-fallback-borradores-ID-update | characterization / C1 | B | storage: `borradores/{ID}/{ID}.png` update | allow | allow | allow | allow | pendiente |
| storage-fallback-borradores-ID-delete | characterization / C1 | B | storage: `borradores/{ID}/{ID}.png` delete | allow | allow | allow | allow | pendiente |
| storage-fallback-assets-countdown-staging-ID-get | characterization / C1 | B | storage: `assets/countdown/staging/{ID}/{ID}.png` get | deny | allow | allow | deny | pendiente |
| storage-fallback-assets-countdown-staging-ID-update | characterization / C1 | B | storage: `assets/countdown/staging/{ID}/{ID}.png` update | deny | allow | allow | deny | pendiente |
| storage-fallback-assets-countdown-staging-ID-delete | characterization / C1 | B | storage: `assets/countdown/staging/{ID}/{ID}.png` delete | deny | allow | allow | deny | pendiente |
| storage-fallback-assets-countdown-frames-ID-operations-op-get | characterization / C1 | B | storage: `assets/countdown/frames/{ID}/operations/op/{ID}.png` get | allow | allow | allow | allow | pendiente |
| storage-fallback-assets-countdown-frames-ID-operations-op-update | characterization / C1 | B | storage: `assets/countdown/frames/{ID}/operations/op/{ID}.png` update | deny | allow | allow | deny | pendiente |
| storage-fallback-assets-countdown-frames-ID-operations-op-delete | characterization / C1 | B | storage: `assets/countdown/frames/{ID}/operations/op/{ID}.png` delete | deny | allow | allow | deny | pendiente |
| storage-fallback-analytics-exports-raw-2026-09-get | characterization / C1 | B | storage: `analytics-exports/raw/2026/09/{ID}.png` get | allow | allow | allow | allow | pendiente |
| storage-fallback-analytics-exports-raw-2026-09-update | characterization / C1 | B | storage: `analytics-exports/raw/2026/09/{ID}.png` update | allow | allow | allow | allow | pendiente |
| storage-fallback-analytics-exports-raw-2026-09-delete | characterization / C1 | B | storage: `analytics-exports/raw/2026/09/{ID}.png` delete | allow | allow | allow | allow | pendiente |
| provider-storage-anonymous-create | acceptance / A3 | anonymous | storage: `proveedores/{ID}/portada/portada-original.png` create | deny | deny | deny | deny | cumple |
| provider-storage-anonymous-update | acceptance / A3 | anonymous | storage: `proveedores/{ID}/portada/portada-original.png` update | deny | deny | deny | deny | cumple |
| provider-storage-anonymous-delete | acceptance / A3 | anonymous | storage: `proveedores/{ID}/portada/portada-original.png` delete | deny | deny | deny | deny | cumple |
| provider-storage-A-create | acceptance / A3 | A | storage: `proveedores/{ID}/portada/portada-original.png` create | deny | deny | deny | deny | cumple |
| provider-storage-A-update | acceptance / A3 | A | storage: `proveedores/{ID}/portada/portada-original.png` update | deny | deny | deny | deny | cumple |
| provider-storage-A-delete | acceptance / A3 | A | storage: `proveedores/{ID}/portada/portada-original.png` delete | deny | deny | deny | deny | cumple |
| provider-storage-public | characterization / C1 | anonymous | storage: `proveedores/{ID}/portada/portada-original.png` get | allow | allow | allow | allow | pendiente |
| provider-storage-hidden | characterization / C1 | anonymous | storage: `proveedores/{ID}/portada/portada-original.png` get | deny | deny | deny | deny | pendiente |
| provider-storage-admin-valid | characterization / C1 | admin | storage: `proveedores/{ID}/galeria/fixture.png` create | allow | allow | allow | allow | pendiente |
| provider-storage-admin-mime | characterization / C1 | admin | storage: `proveedores/{ID}/galeria/fixture.png` create | deny | deny | deny | deny | pendiente |
| provider-storage-admin-size | characterization / C1 | admin | storage: `proveedores/{ID}/galeria/fixture.png` create | deny | deny | deny | deny | pendiente |
| provider-storage-admin-path | characterization / C1 | admin | storage: `proveedores/{ID}/other/fixture.png` create | deny | deny | deny | deny | pendiente |
| q1-admin-firestore | characterization / C1 | admin | firestore: `proveedores/{ID}` delete | allow | allow | allow | allow | pendiente |
| q1-admin-storage | characterization / C1 | admin | storage: `proveedores/{ID}/galeria/fixture.png` delete | allow | allow | allow | allow | pendiente |
| q1-admin-backend-admin | characterization / C2 | admin | backend-helper: `requireAdmin` authorize | allow | allow | allow | allow | pendiente |
| q1-admin-backend-super | characterization / C2 | admin | backend-helper: `requireSuperAdmin` authorize | deny | deny | deny | deny | pendiente |
| q1-superclaim-firestore | characterization / C1 | superclaim | firestore: `proveedores/{ID}` delete | allow | allow | allow | allow | pendiente |
| q1-superclaim-storage | characterization / C1 | superclaim | storage: `proveedores/{ID}/galeria/fixture.png` delete | allow | allow | allow | allow | pendiente |
| q1-superclaim-backend-admin | characterization / C2 | superclaim | backend-helper: `requireAdmin` authorize | deny | deny | deny | deny | pendiente |
| q1-superclaim-backend-super | characterization / C2 | superclaim | backend-helper: `requireSuperAdmin` authorize | deny | deny | deny | deny | pendiente |
| q1-role-firestore | characterization / C1 | role | firestore: `proveedores/{ID}` delete | allow | allow | allow | allow | pendiente |
| q1-role-storage | characterization / C1 | role | storage: `proveedores/{ID}/galeria/fixture.png` delete | allow | allow | allow | allow | pendiente |
| q1-role-backend-admin | characterization / C2 | role | backend-helper: `requireAdmin` authorize | deny | deny | deny | deny | pendiente |
| q1-role-backend-super | characterization / C2 | role | backend-helper: `requireSuperAdmin` authorize | deny | deny | deny | deny | pendiente |
| q1-stringAdmin-firestore | characterization / C1 | stringAdmin | firestore: `proveedores/{ID}` delete | deny | deny | deny | deny | pendiente |
| q1-stringAdmin-storage | characterization / C1 | stringAdmin | storage: `proveedores/{ID}/galeria/fixture.png` delete | deny | deny | deny | deny | pendiente |
| q1-stringAdmin-backend-admin | characterization / C2 | stringAdmin | backend-helper: `requireAdmin` authorize | deny | deny | deny | deny | pendiente |
| q1-stringAdmin-backend-super | characterization / C2 | stringAdmin | backend-helper: `requireSuperAdmin` authorize | deny | deny | deny | deny | pendiente |
| q1-serverSuper-firestore | characterization / C1 | serverSuper | firestore: `proveedores/{ID}` delete | deny | deny | deny | deny | pendiente |
| q1-serverSuper-storage | characterization / C1 | serverSuper | storage: `proveedores/{ID}/galeria/fixture.png` delete | deny | deny | deny | deny | pendiente |
| q1-serverSuper-backend-admin | characterization / C2 | serverSuper | backend-helper: `requireAdmin` authorize | allow | allow | allow | allow | pendiente |
| q1-serverSuper-backend-super | characterization / C2 | serverSuper | backend-helper: `requireSuperAdmin` authorize | allow | allow | allow | allow | pendiente |
| q1-A-firestore | characterization / C1 | A | firestore: `proveedores/{ID}` delete | deny | deny | deny | deny | pendiente |
| q1-A-storage | characterization / C1 | A | storage: `proveedores/{ID}/galeria/fixture.png` delete | deny | deny | deny | deny | pendiente |
| q1-A-backend-admin | characterization / C2 | A | backend-helper: `requireAdmin` authorize | deny | deny | deny | deny | pendiente |
| q1-A-backend-super | characterization / C2 | A | backend-helper: `requireSuperAdmin` authorize | deny | deny | deny | deny | pendiente |
| proposal-canonicalAdmin-firestore | proposal / Q1 | canonicalAdmin | firestore: `proveedores/{ID}` delete | allow | deny | deny | deny | pendiente |
| proposal-canonicalAdmin-storage | proposal / Q1 | canonicalAdmin | storage: `proveedores/{ID}/galeria/fixture.png` delete | allow | deny | deny | deny | pendiente |
| proposal-canonicalAdmin-backend | proposal / Q1 | canonicalAdmin | backend-helper: `requireAdmin` authorize | allow | deny | deny | deny | pendiente |
| proposal-canonicalSuper-firestore | proposal / Q1 | canonicalSuper | firestore: `proveedores/{ID}` delete | allow | deny | deny | deny | pendiente |
| proposal-canonicalSuper-storage | proposal / Q1 | canonicalSuper | storage: `proveedores/{ID}/galeria/fixture.png` delete | allow | deny | deny | deny | pendiente |
| proposal-canonicalSuper-backend | proposal / Q1 | canonicalSuper | backend-helper: `requireAdmin` authorize | allow | deny | deny | deny | pendiente |
| proposal-superclaim-firestore | proposal / Q1 | superclaim | firestore: `proveedores/{ID}` delete | deny | allow | allow | allow | pendiente |
| proposal-superclaim-storage | proposal / Q1 | superclaim | storage: `proveedores/{ID}/galeria/fixture.png` delete | deny | allow | allow | allow | pendiente |
| proposal-superclaim-backend | proposal / Q1 | superclaim | backend-helper: `requireAdmin` authorize | deny | deny | deny | deny | pendiente |
| proposal-role-firestore | proposal / Q1 | role | firestore: `proveedores/{ID}` delete | deny | allow | allow | allow | pendiente |
| proposal-role-storage | proposal / Q1 | role | storage: `proveedores/{ID}/galeria/fixture.png` delete | deny | allow | allow | allow | pendiente |
| proposal-role-backend | proposal / Q1 | role | backend-helper: `requireAdmin` authorize | deny | deny | deny | deny | pendiente |
| 4b2a-profile-anonymous-create | acceptance / A1 | anonymous | firestore: `usuarios/{A}` create | deny | — | deny | deny | cumple |
| 4b2a-profile-anonymous-update | acceptance / A1 | anonymous | firestore: `usuarios/{A}` update | deny | — | deny | deny | cumple |
| 4b2a-profile-anonymous-delete | acceptance / A1 | anonymous | firestore: `usuarios/{A}` delete | deny | — | deny | deny | cumple |
| 4b2a-profile-admin-foreign-get | acceptance / A1 | admin | firestore: `usuarios/{A}` get | deny | — | deny | deny | cumple |
| 4b2a-profile-superclaim-foreign-get | acceptance / A1 | superclaim | firestore: `usuarios/{A}` get | deny | — | deny | deny | cumple |
| 4b2a-profile-role-foreign-get | acceptance / A1 | role | firestore: `usuarios/{A}` get | deny | — | deny | deny | cumple |
| 4b2a-image-anonymous-create | acceptance / A1 | anonymous | firestore: `usuarios/{A}/imagenes/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-image-anonymous-update | acceptance / A1 | anonymous | firestore: `usuarios/{A}/imagenes/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-image-anonymous-delete | acceptance / A1 | anonymous | firestore: `usuarios/{A}/imagenes/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-image-admin-foreign-get | acceptance / A1 | admin | firestore: `usuarios/{A}/imagenes/{ID}` get | deny | — | deny | deny | cumple |
| 4b2a-image-superclaim-foreign-get | acceptance / A1 | superclaim | firestore: `usuarios/{A}/imagenes/{ID}` get | deny | — | deny | deny | cumple |
| 4b2a-image-role-foreign-get | acceptance / A1 | role | firestore: `usuarios/{A}/imagenes/{ID}` get | deny | — | deny | deny | cumple |
| 4b2a-draft-anonymous-create | acceptance / A1 | anonymous | firestore: `borradores/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-draft-anonymous-update | acceptance / A1 | anonymous | firestore: `borradores/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-draft-anonymous-delete | acceptance / A1 | anonymous | firestore: `borradores/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-draft-admin-foreign-get | acceptance / A1 | admin | firestore: `borradores/{ID}` get | deny | — | deny | deny | cumple |
| 4b2a-draft-superclaim-foreign-get | acceptance / A1 | superclaim | firestore: `borradores/{ID}` get | deny | — | deny | deny | cumple |
| 4b2a-draft-role-foreign-get | acceptance / A1 | role | firestore: `borradores/{ID}` get | deny | — | deny | deny | cumple |
| 4b2a-publication-anonymous-create | acceptance / A1 | anonymous | firestore: `publicadas/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-publication-anonymous-update | acceptance / A1 | anonymous | firestore: `publicadas/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-publication-anonymous-delete | acceptance / A1 | anonymous | firestore: `publicadas/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-publication-admin-foreign-get | acceptance / A1 | admin | firestore: `publicadas/{ID}` get | deny | — | deny | deny | cumple |
| 4b2a-publication-superclaim-foreign-get | acceptance / A1 | superclaim | firestore: `publicadas/{ID}` get | deny | — | deny | deny | cumple |
| 4b2a-publication-role-foreign-get | acceptance / A1 | role | firestore: `publicadas/{ID}` get | deny | — | deny | deny | cumple |
| 4b2a-history-anonymous-create | acceptance / A1 | anonymous | firestore: `publicadas_historial/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-history-anonymous-update | acceptance / A1 | anonymous | firestore: `publicadas_historial/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-history-anonymous-delete | acceptance / A1 | anonymous | firestore: `publicadas_historial/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-history-admin-foreign-get | acceptance / A1 | admin | firestore: `publicadas_historial/{ID}` get | deny | — | deny | deny | cumple |
| 4b2a-history-superclaim-foreign-get | acceptance / A1 | superclaim | firestore: `publicadas_historial/{ID}` get | deny | — | deny | deny | cumple |
| 4b2a-history-role-foreign-get | acceptance / A1 | role | firestore: `publicadas_historial/{ID}` get | deny | — | deny | deny | cumple |
| 4b2a-draft-create-foreign-owner | acceptance / A1 | A | firestore: `borradores/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-draft-create-absent-owner | acceptance / A1 | A | firestore: `borradores/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-draft-create-null-owner | acceptance / A1 | A | firestore: `borradores/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-draft-create-number-owner | acceptance / A1 | A | firestore: `borradores/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-draft-replace-without-owner | acceptance / A1 | A | firestore: `borradores/{ID}` replace | deny | — | deny | deny | cumple |
| 4b2a-history-create-foreign-owner | acceptance / A1 | A | firestore: `publicadas_historial/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-history-create-absent-owner | acceptance / A1 | A | firestore: `publicadas_historial/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-history-create-null-owner | acceptance / A1 | A | firestore: `publicadas_historial/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-history-create-number-owner | acceptance / A1 | A | firestore: `publicadas_historial/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-history-replace-without-owner | acceptance / A1 | A | firestore: `publicadas_historial/{ID}` replace | deny | — | deny | deny | cumple |
| 4b2a-history-remove-owner | acceptance / A1 | A | firestore: `publicadas_historial/{ID}` removeOwner | deny | — | deny | deny | cumple |
| 4b2a-publication-remove-owner | acceptance / A1 | A | firestore: `publicadas/{ID}` removeOwner | deny | — | deny | deny | cumple |
| 4b2a-rsvps-B-get | acceptance / A1 | B | firestore: `publicadas/{ID}/rsvps/event` get | deny | — | deny | deny | cumple |
| 4b2a-rsvps-B-list | acceptance / A1 | B | firestore: `publicadas/{ID}/rsvps` list | deny | — | deny | deny | cumple |
| 4b2a-rsvps-B-create | acceptance / A1 | B | firestore: `publicadas/{ID}/rsvps/event` create | deny | — | deny | deny | cumple |
| 4b2a-rsvps-B-update | acceptance / A1 | B | firestore: `publicadas/{ID}/rsvps/event` update | deny | — | deny | deny | cumple |
| 4b2a-rsvps-B-delete | acceptance / A1 | B | firestore: `publicadas/{ID}/rsvps/event` delete | deny | — | deny | deny | cumple |
| 4b2a-rsvps-anonymous-get | acceptance / A1 | anonymous | firestore: `publicadas/{ID}/rsvps/event` get | deny | — | deny | deny | cumple |
| 4b2a-rsvps-anonymous-list | acceptance / A1 | anonymous | firestore: `publicadas/{ID}/rsvps` list | deny | — | deny | deny | cumple |
| 4b2a-rsvps-anonymous-create | acceptance / A1 | anonymous | firestore: `publicadas/{ID}/rsvps/event` create | deny | — | deny | deny | cumple |
| 4b2a-rsvps-anonymous-update | acceptance / A1 | anonymous | firestore: `publicadas/{ID}/rsvps/event` update | deny | — | deny | deny | cumple |
| 4b2a-rsvps-anonymous-delete | acceptance / A1 | anonymous | firestore: `publicadas/{ID}/rsvps/event` delete | deny | — | deny | deny | cumple |
| 4b2a-rsvps-admin-get | acceptance / A1 | admin | firestore: `publicadas/{ID}/rsvps/event` get | deny | — | deny | deny | cumple |
| 4b2a-rsvps-admin-list | acceptance / A1 | admin | firestore: `publicadas/{ID}/rsvps` list | deny | — | deny | deny | cumple |
| 4b2a-rsvps-admin-create | acceptance / A1 | admin | firestore: `publicadas/{ID}/rsvps/event` create | deny | — | deny | deny | cumple |
| 4b2a-rsvps-admin-update | acceptance / A1 | admin | firestore: `publicadas/{ID}/rsvps/event` update | deny | — | deny | deny | cumple |
| 4b2a-rsvps-admin-delete | acceptance / A1 | admin | firestore: `publicadas/{ID}/rsvps/event` delete | deny | — | deny | deny | cumple |
| 4b2a-rsvps-orphan-get | acceptance / A1 | A | firestore: `publicadas/{ID}/rsvps/event` get | deny | — | deny | deny | cumple |
| 4b2a-rsvps-nested-cross-get | acceptance / A1 | B | firestore: `publicadas/{ID}/rsvps/event/nested/child` get | deny | — | deny | deny | cumple |
| 4b2a-rsvps-owner-get | acceptance / A1 | A | firestore: `publicadas/{ID}/rsvps/event` get | allow | — | allow | allow | cumple |
| 4b2a-rsvps-group-query | acceptance / A1 | A | firestore: `rsvps` list | deny | — | deny | deny | cumple |
| 4b2a-visits-B-get | acceptance / A1 | B | firestore: `publicadas/{ID}/visits/event` get | deny | — | deny | deny | cumple |
| 4b2a-visits-B-list | acceptance / A1 | B | firestore: `publicadas/{ID}/visits` list | deny | — | deny | deny | cumple |
| 4b2a-visits-B-create | acceptance / A1 | B | firestore: `publicadas/{ID}/visits/event` create | deny | — | deny | deny | cumple |
| 4b2a-visits-B-update | acceptance / A1 | B | firestore: `publicadas/{ID}/visits/event` update | deny | — | deny | deny | cumple |
| 4b2a-visits-B-delete | acceptance / A1 | B | firestore: `publicadas/{ID}/visits/event` delete | deny | — | deny | deny | cumple |
| 4b2a-visits-anonymous-get | acceptance / A1 | anonymous | firestore: `publicadas/{ID}/visits/event` get | deny | — | deny | deny | cumple |
| 4b2a-visits-anonymous-list | acceptance / A1 | anonymous | firestore: `publicadas/{ID}/visits` list | deny | — | deny | deny | cumple |
| 4b2a-visits-anonymous-create | acceptance / A1 | anonymous | firestore: `publicadas/{ID}/visits/event` create | deny | — | deny | deny | cumple |
| 4b2a-visits-anonymous-update | acceptance / A1 | anonymous | firestore: `publicadas/{ID}/visits/event` update | deny | — | deny | deny | cumple |
| 4b2a-visits-anonymous-delete | acceptance / A1 | anonymous | firestore: `publicadas/{ID}/visits/event` delete | deny | — | deny | deny | cumple |
| 4b2a-visits-admin-get | acceptance / A1 | admin | firestore: `publicadas/{ID}/visits/event` get | deny | — | deny | deny | cumple |
| 4b2a-visits-admin-list | acceptance / A1 | admin | firestore: `publicadas/{ID}/visits` list | deny | — | deny | deny | cumple |
| 4b2a-visits-admin-create | acceptance / A1 | admin | firestore: `publicadas/{ID}/visits/event` create | deny | — | deny | deny | cumple |
| 4b2a-visits-admin-update | acceptance / A1 | admin | firestore: `publicadas/{ID}/visits/event` update | deny | — | deny | deny | cumple |
| 4b2a-visits-admin-delete | acceptance / A1 | admin | firestore: `publicadas/{ID}/visits/event` delete | deny | — | deny | deny | cumple |
| 4b2a-visits-orphan-get | acceptance / A1 | A | firestore: `publicadas/{ID}/visits/event` get | deny | — | deny | deny | cumple |
| 4b2a-visits-nested-cross-get | acceptance / A1 | B | firestore: `publicadas/{ID}/visits/event/nested/child` get | deny | — | deny | deny | cumple |
| 4b2a-visits-owner-raw-get | characterization / C1 | A | firestore: `publicadas/{ID}/visits/event` get | allow | — | allow | allow | pendiente |
| 4b2a-visits-owner-raw-list | characterization / C1 | A | firestore: `publicadas/{ID}/visits` list | allow | — | allow | allow | pendiente |
| 4b2a-visits-nested-create | acceptance / A2 | admin | firestore: `publicadas/{ID}/visits/event/nested/child` create | deny | — | deny | deny | cumple |
| 4b2a-visits-nested-update | acceptance / A2 | admin | firestore: `publicadas/{ID}/visits/event/nested/child` update | deny | — | deny | deny | cumple |
| 4b2a-visits-nested-delete | acceptance / A2 | admin | firestore: `publicadas/{ID}/visits/event/nested/child` delete | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-B-get | acceptance / A1 | B | firestore: `publicadas/{ID}/uniqueVisitors/event` get | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-B-list | acceptance / A1 | B | firestore: `publicadas/{ID}/uniqueVisitors` list | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-B-create | acceptance / A1 | B | firestore: `publicadas/{ID}/uniqueVisitors/event` create | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-B-update | acceptance / A1 | B | firestore: `publicadas/{ID}/uniqueVisitors/event` update | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-B-delete | acceptance / A1 | B | firestore: `publicadas/{ID}/uniqueVisitors/event` delete | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-anonymous-get | acceptance / A1 | anonymous | firestore: `publicadas/{ID}/uniqueVisitors/event` get | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-anonymous-list | acceptance / A1 | anonymous | firestore: `publicadas/{ID}/uniqueVisitors` list | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-anonymous-create | acceptance / A1 | anonymous | firestore: `publicadas/{ID}/uniqueVisitors/event` create | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-anonymous-update | acceptance / A1 | anonymous | firestore: `publicadas/{ID}/uniqueVisitors/event` update | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-anonymous-delete | acceptance / A1 | anonymous | firestore: `publicadas/{ID}/uniqueVisitors/event` delete | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-admin-get | acceptance / A1 | admin | firestore: `publicadas/{ID}/uniqueVisitors/event` get | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-admin-list | acceptance / A1 | admin | firestore: `publicadas/{ID}/uniqueVisitors` list | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-admin-create | acceptance / A1 | admin | firestore: `publicadas/{ID}/uniqueVisitors/event` create | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-admin-update | acceptance / A1 | admin | firestore: `publicadas/{ID}/uniqueVisitors/event` update | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-admin-delete | acceptance / A1 | admin | firestore: `publicadas/{ID}/uniqueVisitors/event` delete | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-orphan-get | acceptance / A1 | A | firestore: `publicadas/{ID}/uniqueVisitors/event` get | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-nested-cross-get | acceptance / A1 | B | firestore: `publicadas/{ID}/uniqueVisitors/event/nested/child` get | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-owner-raw-get | characterization / C1 | A | firestore: `publicadas/{ID}/uniqueVisitors/event` get | allow | — | allow | allow | pendiente |
| 4b2a-uniqueVisitors-owner-raw-list | characterization / C1 | A | firestore: `publicadas/{ID}/uniqueVisitors` list | allow | — | allow | allow | pendiente |
| 4b2a-uniqueVisitors-nested-create | acceptance / A2 | admin | firestore: `publicadas/{ID}/uniqueVisitors/event/nested/child` create | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-nested-update | acceptance / A2 | admin | firestore: `publicadas/{ID}/uniqueVisitors/event/nested/child` update | deny | — | deny | deny | cumple |
| 4b2a-uniqueVisitors-nested-delete | acceptance / A2 | admin | firestore: `publicadas/{ID}/uniqueVisitors/event/nested/child` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-publication-admin-create | acceptance / A2 | admin | firestore: `publicadas/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-backend-publication-admin-update | acceptance / A2 | admin | firestore: `publicadas/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-backend-publication-admin-delete | acceptance / A2 | admin | firestore: `publicadas/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-publication-superclaim-create | acceptance / A2 | superclaim | firestore: `publicadas/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-backend-publication-superclaim-update | acceptance / A2 | superclaim | firestore: `publicadas/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-backend-publication-superclaim-delete | acceptance / A2 | superclaim | firestore: `publicadas/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-publication-role-create | acceptance / A2 | role | firestore: `publicadas/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-backend-publication-role-update | acceptance / A2 | role | firestore: `publicadas/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-backend-publication-role-delete | acceptance / A2 | role | firestore: `publicadas/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-visits-admin-create | acceptance / A2 | admin | firestore: `publicadas/{ID}/visits/event` create | deny | — | deny | deny | cumple |
| 4b2a-backend-visits-admin-update | acceptance / A2 | admin | firestore: `publicadas/{ID}/visits/event` update | deny | — | deny | deny | cumple |
| 4b2a-backend-visits-admin-delete | acceptance / A2 | admin | firestore: `publicadas/{ID}/visits/event` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-visits-superclaim-create | acceptance / A2 | superclaim | firestore: `publicadas/{ID}/visits/event` create | deny | — | deny | deny | cumple |
| 4b2a-backend-visits-superclaim-update | acceptance / A2 | superclaim | firestore: `publicadas/{ID}/visits/event` update | deny | — | deny | deny | cumple |
| 4b2a-backend-visits-superclaim-delete | acceptance / A2 | superclaim | firestore: `publicadas/{ID}/visits/event` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-visits-role-create | acceptance / A2 | role | firestore: `publicadas/{ID}/visits/event` create | deny | — | deny | deny | cumple |
| 4b2a-backend-visits-role-update | acceptance / A2 | role | firestore: `publicadas/{ID}/visits/event` update | deny | — | deny | deny | cumple |
| 4b2a-backend-visits-role-delete | acceptance / A2 | role | firestore: `publicadas/{ID}/visits/event` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-uniqueVisitors-admin-create | acceptance / A2 | admin | firestore: `publicadas/{ID}/uniqueVisitors/event` create | deny | — | deny | deny | cumple |
| 4b2a-backend-uniqueVisitors-admin-update | acceptance / A2 | admin | firestore: `publicadas/{ID}/uniqueVisitors/event` update | deny | — | deny | deny | cumple |
| 4b2a-backend-uniqueVisitors-admin-delete | acceptance / A2 | admin | firestore: `publicadas/{ID}/uniqueVisitors/event` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-uniqueVisitors-superclaim-create | acceptance / A2 | superclaim | firestore: `publicadas/{ID}/uniqueVisitors/event` create | deny | — | deny | deny | cumple |
| 4b2a-backend-uniqueVisitors-superclaim-update | acceptance / A2 | superclaim | firestore: `publicadas/{ID}/uniqueVisitors/event` update | deny | — | deny | deny | cumple |
| 4b2a-backend-uniqueVisitors-superclaim-delete | acceptance / A2 | superclaim | firestore: `publicadas/{ID}/uniqueVisitors/event` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-uniqueVisitors-role-create | acceptance / A2 | role | firestore: `publicadas/{ID}/uniqueVisitors/event` create | deny | — | deny | deny | cumple |
| 4b2a-backend-uniqueVisitors-role-update | acceptance / A2 | role | firestore: `publicadas/{ID}/uniqueVisitors/event` update | deny | — | deny | deny | cumple |
| 4b2a-backend-uniqueVisitors-role-delete | acceptance / A2 | role | firestore: `publicadas/{ID}/uniqueVisitors/event` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-checkout-admin-create | acceptance / A2 | admin | firestore: `publication_checkout_sessions/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-backend-checkout-admin-update | acceptance / A2 | admin | firestore: `publication_checkout_sessions/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-backend-checkout-admin-delete | acceptance / A2 | admin | firestore: `publication_checkout_sessions/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-checkout-superclaim-create | acceptance / A2 | superclaim | firestore: `publication_checkout_sessions/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-backend-checkout-superclaim-update | acceptance / A2 | superclaim | firestore: `publication_checkout_sessions/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-backend-checkout-superclaim-delete | acceptance / A2 | superclaim | firestore: `publication_checkout_sessions/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-checkout-role-create | acceptance / A2 | role | firestore: `publication_checkout_sessions/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-backend-checkout-role-update | acceptance / A2 | role | firestore: `publication_checkout_sessions/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-backend-checkout-role-delete | acceptance / A2 | role | firestore: `publication_checkout_sessions/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-checkout-child-admin-create | acceptance / A2 | admin | firestore: `publication_checkout_sessions/{ID}/private/child` create | deny | — | deny | deny | cumple |
| 4b2a-backend-checkout-child-admin-update | acceptance / A2 | admin | firestore: `publication_checkout_sessions/{ID}/private/child` update | deny | — | deny | deny | cumple |
| 4b2a-backend-checkout-child-admin-delete | acceptance / A2 | admin | firestore: `publication_checkout_sessions/{ID}/private/child` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-checkout-child-superclaim-create | acceptance / A2 | superclaim | firestore: `publication_checkout_sessions/{ID}/private/child` create | deny | — | deny | deny | cumple |
| 4b2a-backend-checkout-child-superclaim-update | acceptance / A2 | superclaim | firestore: `publication_checkout_sessions/{ID}/private/child` update | deny | — | deny | deny | cumple |
| 4b2a-backend-checkout-child-superclaim-delete | acceptance / A2 | superclaim | firestore: `publication_checkout_sessions/{ID}/private/child` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-checkout-child-role-create | acceptance / A2 | role | firestore: `publication_checkout_sessions/{ID}/private/child` create | deny | — | deny | deny | cumple |
| 4b2a-backend-checkout-child-role-update | acceptance / A2 | role | firestore: `publication_checkout_sessions/{ID}/private/child` update | deny | — | deny | deny | cumple |
| 4b2a-backend-checkout-child-role-delete | acceptance / A2 | role | firestore: `publication_checkout_sessions/{ID}/private/child` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-reservation-admin-create | acceptance / A2 | admin | firestore: `public_slug_reservations/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-backend-reservation-admin-update | acceptance / A2 | admin | firestore: `public_slug_reservations/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-backend-reservation-admin-delete | acceptance / A2 | admin | firestore: `public_slug_reservations/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-reservation-superclaim-create | acceptance / A2 | superclaim | firestore: `public_slug_reservations/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-backend-reservation-superclaim-update | acceptance / A2 | superclaim | firestore: `public_slug_reservations/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-backend-reservation-superclaim-delete | acceptance / A2 | superclaim | firestore: `public_slug_reservations/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-reservation-role-create | acceptance / A2 | role | firestore: `public_slug_reservations/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-backend-reservation-role-update | acceptance / A2 | role | firestore: `public_slug_reservations/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-backend-reservation-role-delete | acceptance / A2 | role | firestore: `public_slug_reservations/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-discount-admin-create | acceptance / A2 | admin | firestore: `publication_discount_codes/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-backend-discount-admin-update | acceptance / A2 | admin | firestore: `publication_discount_codes/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-backend-discount-admin-delete | acceptance / A2 | admin | firestore: `publication_discount_codes/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-discount-superclaim-create | acceptance / A2 | superclaim | firestore: `publication_discount_codes/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-backend-discount-superclaim-update | acceptance / A2 | superclaim | firestore: `publication_discount_codes/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-backend-discount-superclaim-delete | acceptance / A2 | superclaim | firestore: `publication_discount_codes/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-discount-role-create | acceptance / A2 | role | firestore: `publication_discount_codes/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-backend-discount-role-update | acceptance / A2 | role | firestore: `publication_discount_codes/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-backend-discount-role-delete | acceptance / A2 | role | firestore: `publication_discount_codes/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-discount-usage-admin-create | acceptance / A2 | admin | firestore: `publication_discount_code_usage/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-backend-discount-usage-admin-update | acceptance / A2 | admin | firestore: `publication_discount_code_usage/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-backend-discount-usage-admin-delete | acceptance / A2 | admin | firestore: `publication_discount_code_usage/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-discount-usage-superclaim-create | acceptance / A2 | superclaim | firestore: `publication_discount_code_usage/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-backend-discount-usage-superclaim-update | acceptance / A2 | superclaim | firestore: `publication_discount_code_usage/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-backend-discount-usage-superclaim-delete | acceptance / A2 | superclaim | firestore: `publication_discount_code_usage/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-backend-discount-usage-role-create | acceptance / A2 | role | firestore: `publication_discount_code_usage/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-backend-discount-usage-role-update | acceptance / A2 | role | firestore: `publication_discount_code_usage/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-backend-discount-usage-role-delete | acceptance / A2 | role | firestore: `publication_discount_code_usage/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-publication-consumer-query | acceptance / A1 | A | firestore: `publicadas` list | allow | — | allow | allow | cumple |
| 4b2a-history-consumer-query | acceptance / A1 | A | firestore: `publicadas_historial` list | allow | — | allow | allow | cumple |
| 4b2a-image-consumer-query | acceptance / A1 | A | firestore: `usuarios/{A}/imagenes` list | allow | — | allow | allow | cumple |
| 4b2a-image-consumer-next-page | acceptance / A1 | A | firestore: `usuarios/{A}/imagenes` list | allow | — | allow | allow | cumple |
| 4b2a-pending-profile-owner-create | characterization / C1 | A | firestore: `usuarios/{A}` create | allow | — | allow | allow | pendiente |
| 4b2a-pending-profile-owner-update | characterization / C1 | A | firestore: `usuarios/{A}` update | allow | — | allow | allow | pendiente |
| 4b2a-pending-profile-owner-delete | characterization / C1 | A | firestore: `usuarios/{A}` delete | allow | — | allow | allow | pendiente |
| 4b2a-pending-history-owner-create | characterization / C1 | A | firestore: `publicadas_historial/{ID}` create | allow | — | allow | allow | pendiente |
| 4b2a-pending-history-owner-update | characterization / C1 | A | firestore: `publicadas_historial/{ID}` update | allow | — | allow | allow | pendiente |
| 4b2a-pending-history-owner-delete | characterization / C1 | A | firestore: `publicadas_historial/{ID}` delete | allow | — | allow | allow | pendiente |
| 4b2a-pending-rsvps-owner-create | characterization / C1 | A | firestore: `publicadas/{ID}/rsvps/event` create | allow | — | allow | allow | pendiente |
| 4b2a-pending-rsvps-owner-update | characterization / C1 | A | firestore: `publicadas/{ID}/rsvps/event` update | allow | — | allow | allow | pendiente |
| 4b2a-pending-rsvps-owner-delete | characterization / C1 | A | firestore: `publicadas/{ID}/rsvps/event` delete | allow | — | allow | allow | pendiente |
| 4b2a-residual-usuarios | characterization / C1 | B | firestore: `usuarios/{A}/unmodeled/child` update | allow | — | allow | allow | pendiente |
| 4b2a-residual-publicadas | characterization / C1 | B | firestore: `publicadas/{ID}/unmodeled/child` update | allow | — | allow | allow | pendiente |
| 4b2a-residual-publicadas_historial | characterization / C1 | B | firestore: `publicadas_historial/{ID}/unmodeled/child` update | allow | — | allow | allow | pendiente |
| 4b2a-storage-images-prefix-object-A-get | acceptance / A1 | A | storage: `usuarios/{A}/imagenes` get | allow | — | allow | allow | cumple |
| 4b2a-storage-images-prefix-object-A-create | acceptance / A1 | A | storage: `usuarios/{A}/imagenes` create | allow | — | allow | allow | cumple |
| 4b2a-storage-images-prefix-object-A-update | acceptance / A1 | A | storage: `usuarios/{A}/imagenes` update | allow | — | allow | allow | cumple |
| 4b2a-storage-images-prefix-object-A-delete | acceptance / A1 | A | storage: `usuarios/{A}/imagenes` delete | allow | — | allow | allow | cumple |
| 4b2a-storage-images-prefix-object-B-get | acceptance / A1 | B | storage: `usuarios/{A}/imagenes` get | deny | — | deny | deny | cumple |
| 4b2a-storage-images-prefix-object-B-create | acceptance / A1 | B | storage: `usuarios/{A}/imagenes` create | deny | — | deny | deny | cumple |
| 4b2a-storage-images-prefix-object-B-update | acceptance / A1 | B | storage: `usuarios/{A}/imagenes` update | deny | — | deny | deny | cumple |
| 4b2a-storage-images-prefix-object-B-delete | acceptance / A1 | B | storage: `usuarios/{A}/imagenes` delete | deny | — | deny | deny | cumple |
| 4b2a-storage-images-prefix-object-admin-get | acceptance / A1 | admin | storage: `usuarios/{A}/imagenes` get | deny | — | deny | deny | cumple |
| 4b2a-storage-images-prefix-object-admin-create | acceptance / A1 | admin | storage: `usuarios/{A}/imagenes` create | deny | — | deny | deny | cumple |
| 4b2a-storage-images-prefix-object-admin-update | acceptance / A1 | admin | storage: `usuarios/{A}/imagenes` update | deny | — | deny | deny | cumple |
| 4b2a-storage-images-prefix-object-admin-delete | acceptance / A1 | admin | storage: `usuarios/{A}/imagenes` delete | deny | — | deny | deny | cumple |
| 4b2a-storage-images-prefix-object-anonymous-get | acceptance / A1 | anonymous | storage: `usuarios/{A}/imagenes` get | deny | — | deny | deny | cumple |
| 4b2a-storage-images-prefix-object-anonymous-create | acceptance / A1 | anonymous | storage: `usuarios/{A}/imagenes` create | deny | — | deny | deny | cumple |
| 4b2a-storage-images-prefix-object-anonymous-update | acceptance / A1 | anonymous | storage: `usuarios/{A}/imagenes` update | deny | — | deny | deny | cumple |
| 4b2a-storage-images-prefix-object-anonymous-delete | acceptance / A1 | anonymous | storage: `usuarios/{A}/imagenes` delete | deny | — | deny | deny | cumple |
| 4b2a-storage-images-nested-A-get | acceptance / A1 | A | storage: `usuarios/{A}/imagenes/nested/{ID}.png` get | allow | — | allow | allow | cumple |
| 4b2a-storage-images-nested-A-create | acceptance / A1 | A | storage: `usuarios/{A}/imagenes/nested/{ID}.png` create | allow | — | allow | allow | cumple |
| 4b2a-storage-images-nested-A-update | acceptance / A1 | A | storage: `usuarios/{A}/imagenes/nested/{ID}.png` update | allow | — | allow | allow | cumple |
| 4b2a-storage-images-nested-A-delete | acceptance / A1 | A | storage: `usuarios/{A}/imagenes/nested/{ID}.png` delete | allow | — | allow | allow | cumple |
| 4b2a-storage-images-nested-B-get | acceptance / A1 | B | storage: `usuarios/{A}/imagenes/nested/{ID}.png` get | deny | — | deny | deny | cumple |
| 4b2a-storage-images-nested-B-create | acceptance / A1 | B | storage: `usuarios/{A}/imagenes/nested/{ID}.png` create | deny | — | deny | deny | cumple |
| 4b2a-storage-images-nested-B-update | acceptance / A1 | B | storage: `usuarios/{A}/imagenes/nested/{ID}.png` update | deny | — | deny | deny | cumple |
| 4b2a-storage-images-nested-B-delete | acceptance / A1 | B | storage: `usuarios/{A}/imagenes/nested/{ID}.png` delete | deny | — | deny | deny | cumple |
| 4b2a-storage-images-nested-admin-get | acceptance / A1 | admin | storage: `usuarios/{A}/imagenes/nested/{ID}.png` get | deny | — | deny | deny | cumple |
| 4b2a-storage-images-nested-admin-create | acceptance / A1 | admin | storage: `usuarios/{A}/imagenes/nested/{ID}.png` create | deny | — | deny | deny | cumple |
| 4b2a-storage-images-nested-admin-update | acceptance / A1 | admin | storage: `usuarios/{A}/imagenes/nested/{ID}.png` update | deny | — | deny | deny | cumple |
| 4b2a-storage-images-nested-admin-delete | acceptance / A1 | admin | storage: `usuarios/{A}/imagenes/nested/{ID}.png` delete | deny | — | deny | deny | cumple |
| 4b2a-storage-images-nested-anonymous-get | acceptance / A1 | anonymous | storage: `usuarios/{A}/imagenes/nested/{ID}.png` get | deny | — | deny | deny | cumple |
| 4b2a-storage-images-nested-anonymous-create | acceptance / A1 | anonymous | storage: `usuarios/{A}/imagenes/nested/{ID}.png` create | deny | — | deny | deny | cumple |
| 4b2a-storage-images-nested-anonymous-update | acceptance / A1 | anonymous | storage: `usuarios/{A}/imagenes/nested/{ID}.png` update | deny | — | deny | deny | cumple |
| 4b2a-storage-images-nested-anonymous-delete | acceptance / A1 | anonymous | storage: `usuarios/{A}/imagenes/nested/{ID}.png` delete | deny | — | deny | deny | cumple |
| 4b2a-storage-images-anonymous-list | acceptance / A1 | anonymous | storage: `usuarios/{A}/imagenes` list | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-A-get | acceptance / A1 | A | storage: `usuarios/{A}/thumbnails` get | allow | — | allow | allow | cumple |
| 4b2a-storage-thumbnails-prefix-object-A-create | acceptance / A1 | A | storage: `usuarios/{A}/thumbnails` create | allow | — | allow | allow | cumple |
| 4b2a-storage-thumbnails-prefix-object-A-update | acceptance / A1 | A | storage: `usuarios/{A}/thumbnails` update | allow | — | allow | allow | cumple |
| 4b2a-storage-thumbnails-prefix-object-A-delete | acceptance / A1 | A | storage: `usuarios/{A}/thumbnails` delete | allow | — | allow | allow | cumple |
| 4b2a-storage-thumbnails-prefix-object-B-get | acceptance / A1 | B | storage: `usuarios/{A}/thumbnails` get | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-B-create | acceptance / A1 | B | storage: `usuarios/{A}/thumbnails` create | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-B-update | acceptance / A1 | B | storage: `usuarios/{A}/thumbnails` update | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-B-delete | acceptance / A1 | B | storage: `usuarios/{A}/thumbnails` delete | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-admin-get | acceptance / A1 | admin | storage: `usuarios/{A}/thumbnails` get | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-admin-create | acceptance / A1 | admin | storage: `usuarios/{A}/thumbnails` create | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-admin-update | acceptance / A1 | admin | storage: `usuarios/{A}/thumbnails` update | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-admin-delete | acceptance / A1 | admin | storage: `usuarios/{A}/thumbnails` delete | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-anonymous-get | acceptance / A1 | anonymous | storage: `usuarios/{A}/thumbnails` get | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-anonymous-create | acceptance / A1 | anonymous | storage: `usuarios/{A}/thumbnails` create | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-anonymous-update | acceptance / A1 | anonymous | storage: `usuarios/{A}/thumbnails` update | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-anonymous-delete | acceptance / A1 | anonymous | storage: `usuarios/{A}/thumbnails` delete | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-nested-A-get | acceptance / A1 | A | storage: `usuarios/{A}/thumbnails/nested/{ID}.png` get | allow | — | allow | allow | cumple |
| 4b2a-storage-thumbnails-nested-A-create | acceptance / A1 | A | storage: `usuarios/{A}/thumbnails/nested/{ID}.png` create | allow | — | allow | allow | cumple |
| 4b2a-storage-thumbnails-nested-A-update | acceptance / A1 | A | storage: `usuarios/{A}/thumbnails/nested/{ID}.png` update | allow | — | allow | allow | cumple |
| 4b2a-storage-thumbnails-nested-A-delete | acceptance / A1 | A | storage: `usuarios/{A}/thumbnails/nested/{ID}.png` delete | allow | — | allow | allow | cumple |
| 4b2a-storage-thumbnails-nested-B-get | acceptance / A1 | B | storage: `usuarios/{A}/thumbnails/nested/{ID}.png` get | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-nested-B-create | acceptance / A1 | B | storage: `usuarios/{A}/thumbnails/nested/{ID}.png` create | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-nested-B-update | acceptance / A1 | B | storage: `usuarios/{A}/thumbnails/nested/{ID}.png` update | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-nested-B-delete | acceptance / A1 | B | storage: `usuarios/{A}/thumbnails/nested/{ID}.png` delete | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-nested-admin-get | acceptance / A1 | admin | storage: `usuarios/{A}/thumbnails/nested/{ID}.png` get | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-nested-admin-create | acceptance / A1 | admin | storage: `usuarios/{A}/thumbnails/nested/{ID}.png` create | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-nested-admin-update | acceptance / A1 | admin | storage: `usuarios/{A}/thumbnails/nested/{ID}.png` update | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-nested-admin-delete | acceptance / A1 | admin | storage: `usuarios/{A}/thumbnails/nested/{ID}.png` delete | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-nested-anonymous-get | acceptance / A1 | anonymous | storage: `usuarios/{A}/thumbnails/nested/{ID}.png` get | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-nested-anonymous-create | acceptance / A1 | anonymous | storage: `usuarios/{A}/thumbnails/nested/{ID}.png` create | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-nested-anonymous-update | acceptance / A1 | anonymous | storage: `usuarios/{A}/thumbnails/nested/{ID}.png` update | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-nested-anonymous-delete | acceptance / A1 | anonymous | storage: `usuarios/{A}/thumbnails/nested/{ID}.png` delete | deny | — | deny | deny | cumple |
| 4b2a-storage-thumbnails-anonymous-list | acceptance / A1 | anonymous | storage: `usuarios/{A}/thumbnails` list | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-A-get | acceptance / A1 | A | storage: `thumbnails_borradores/{A}` get | allow | — | allow | allow | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-A-create | acceptance / A1 | A | storage: `thumbnails_borradores/{A}` create | allow | — | allow | allow | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-A-update | acceptance / A1 | A | storage: `thumbnails_borradores/{A}` update | allow | — | allow | allow | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-A-delete | acceptance / A1 | A | storage: `thumbnails_borradores/{A}` delete | allow | — | allow | allow | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-B-get | acceptance / A1 | B | storage: `thumbnails_borradores/{A}` get | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-B-create | acceptance / A1 | B | storage: `thumbnails_borradores/{A}` create | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-B-update | acceptance / A1 | B | storage: `thumbnails_borradores/{A}` update | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-B-delete | acceptance / A1 | B | storage: `thumbnails_borradores/{A}` delete | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-admin-get | acceptance / A1 | admin | storage: `thumbnails_borradores/{A}` get | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-admin-create | acceptance / A1 | admin | storage: `thumbnails_borradores/{A}` create | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-admin-update | acceptance / A1 | admin | storage: `thumbnails_borradores/{A}` update | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-admin-delete | acceptance / A1 | admin | storage: `thumbnails_borradores/{A}` delete | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-anonymous-get | acceptance / A1 | anonymous | storage: `thumbnails_borradores/{A}` get | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-anonymous-create | acceptance / A1 | anonymous | storage: `thumbnails_borradores/{A}` create | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-anonymous-update | acceptance / A1 | anonymous | storage: `thumbnails_borradores/{A}` update | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-anonymous-delete | acceptance / A1 | anonymous | storage: `thumbnails_borradores/{A}` delete | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-A-get | acceptance / A1 | A | storage: `thumbnails_borradores/{A}/nested/{ID}.png` get | allow | — | allow | allow | cumple |
| 4b2a-storage-draft-thumbnails-nested-A-create | acceptance / A1 | A | storage: `thumbnails_borradores/{A}/nested/{ID}.png` create | allow | — | allow | allow | cumple |
| 4b2a-storage-draft-thumbnails-nested-A-update | acceptance / A1 | A | storage: `thumbnails_borradores/{A}/nested/{ID}.png` update | allow | — | allow | allow | cumple |
| 4b2a-storage-draft-thumbnails-nested-A-delete | acceptance / A1 | A | storage: `thumbnails_borradores/{A}/nested/{ID}.png` delete | allow | — | allow | allow | cumple |
| 4b2a-storage-draft-thumbnails-nested-B-get | acceptance / A1 | B | storage: `thumbnails_borradores/{A}/nested/{ID}.png` get | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-B-create | acceptance / A1 | B | storage: `thumbnails_borradores/{A}/nested/{ID}.png` create | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-B-update | acceptance / A1 | B | storage: `thumbnails_borradores/{A}/nested/{ID}.png` update | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-B-delete | acceptance / A1 | B | storage: `thumbnails_borradores/{A}/nested/{ID}.png` delete | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-admin-get | acceptance / A1 | admin | storage: `thumbnails_borradores/{A}/nested/{ID}.png` get | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-admin-create | acceptance / A1 | admin | storage: `thumbnails_borradores/{A}/nested/{ID}.png` create | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-admin-update | acceptance / A1 | admin | storage: `thumbnails_borradores/{A}/nested/{ID}.png` update | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-admin-delete | acceptance / A1 | admin | storage: `thumbnails_borradores/{A}/nested/{ID}.png` delete | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-anonymous-get | acceptance / A1 | anonymous | storage: `thumbnails_borradores/{A}/nested/{ID}.png` get | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-anonymous-create | acceptance / A1 | anonymous | storage: `thumbnails_borradores/{A}/nested/{ID}.png` create | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-anonymous-update | acceptance / A1 | anonymous | storage: `thumbnails_borradores/{A}/nested/{ID}.png` update | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-anonymous-delete | acceptance / A1 | anonymous | storage: `thumbnails_borradores/{A}/nested/{ID}.png` delete | deny | — | deny | deny | cumple |
| 4b2a-storage-draft-thumbnails-anonymous-list | acceptance / A1 | anonymous | storage: `thumbnails_borradores/{A}` list | deny | — | deny | deny | cumple |
| 4b2a-storage-root-list-usuarios | acceptance / A1 | B | storage: `usuarios` list | deny | — | deny | deny | cumple |
| 4b2a-storage-root-list-usuarios-{A} | acceptance / A1 | B | storage: `usuarios/{A}` list | deny | — | deny | deny | cumple |
| 4b2a-storage-root-list-thumbnails_borradores | acceptance / A1 | B | storage: `thumbnails_borradores` list | deny | — | deny | deny | cumple |
| 4b2a-published-root-A-create | acceptance / A2 | A | storage: `publicadas` create | deny | — | deny | deny | cumple |
| 4b2a-published-root-A-update | acceptance / A2 | A | storage: `publicadas` update | deny | — | deny | deny | cumple |
| 4b2a-published-root-A-delete | acceptance / A2 | A | storage: `publicadas` delete | deny | — | deny | deny | cumple |
| 4b2a-published-root-admin-create | acceptance / A2 | admin | storage: `publicadas` create | deny | — | deny | deny | cumple |
| 4b2a-published-root-admin-update | acceptance / A2 | admin | storage: `publicadas` update | deny | — | deny | deny | cumple |
| 4b2a-published-root-admin-delete | acceptance / A2 | admin | storage: `publicadas` delete | deny | — | deny | deny | cumple |
| 4b2a-published-root-superclaim-create | acceptance / A2 | superclaim | storage: `publicadas` create | deny | — | deny | deny | cumple |
| 4b2a-published-root-superclaim-update | acceptance / A2 | superclaim | storage: `publicadas` update | deny | — | deny | deny | cumple |
| 4b2a-published-root-superclaim-delete | acceptance / A2 | superclaim | storage: `publicadas` delete | deny | — | deny | deny | cumple |
| 4b2a-published-root-role-create | acceptance / A2 | role | storage: `publicadas` create | deny | — | deny | deny | cumple |
| 4b2a-published-root-role-update | acceptance / A2 | role | storage: `publicadas` update | deny | — | deny | deny | cumple |
| 4b2a-published-root-role-delete | acceptance / A2 | role | storage: `publicadas` delete | deny | — | deny | deny | cumple |
| 4b2a-published-root-anonymous-create | acceptance / A2 | anonymous | storage: `publicadas` create | deny | — | deny | deny | cumple |
| 4b2a-published-root-anonymous-update | acceptance / A2 | anonymous | storage: `publicadas` update | deny | — | deny | deny | cumple |
| 4b2a-published-root-anonymous-delete | acceptance / A2 | anonymous | storage: `publicadas` delete | deny | — | deny | deny | cumple |
| 4b2a-published-slug-A-create | acceptance / A2 | A | storage: `publicadas/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-published-slug-A-update | acceptance / A2 | A | storage: `publicadas/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-published-slug-A-delete | acceptance / A2 | A | storage: `publicadas/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-published-slug-admin-create | acceptance / A2 | admin | storage: `publicadas/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-published-slug-admin-update | acceptance / A2 | admin | storage: `publicadas/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-published-slug-admin-delete | acceptance / A2 | admin | storage: `publicadas/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-published-slug-superclaim-create | acceptance / A2 | superclaim | storage: `publicadas/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-published-slug-superclaim-update | acceptance / A2 | superclaim | storage: `publicadas/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-published-slug-superclaim-delete | acceptance / A2 | superclaim | storage: `publicadas/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-published-slug-role-create | acceptance / A2 | role | storage: `publicadas/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-published-slug-role-update | acceptance / A2 | role | storage: `publicadas/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-published-slug-role-delete | acceptance / A2 | role | storage: `publicadas/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-published-slug-anonymous-create | acceptance / A2 | anonymous | storage: `publicadas/{ID}` create | deny | — | deny | deny | cumple |
| 4b2a-published-slug-anonymous-update | acceptance / A2 | anonymous | storage: `publicadas/{ID}` update | deny | — | deny | deny | cumple |
| 4b2a-published-slug-anonymous-delete | acceptance / A2 | anonymous | storage: `publicadas/{ID}` delete | deny | — | deny | deny | cumple |
| 4b2a-published-nested-A-create | acceptance / A2 | A | storage: `publicadas/{ID}/assets/nested/fixture.png` create | deny | — | deny | deny | cumple |
| 4b2a-published-nested-A-update | acceptance / A2 | A | storage: `publicadas/{ID}/assets/nested/fixture.png` update | deny | — | deny | deny | cumple |
| 4b2a-published-nested-A-delete | acceptance / A2 | A | storage: `publicadas/{ID}/assets/nested/fixture.png` delete | deny | — | deny | deny | cumple |
| 4b2a-published-nested-admin-create | acceptance / A2 | admin | storage: `publicadas/{ID}/assets/nested/fixture.png` create | deny | — | deny | deny | cumple |
| 4b2a-published-nested-admin-update | acceptance / A2 | admin | storage: `publicadas/{ID}/assets/nested/fixture.png` update | deny | — | deny | deny | cumple |
| 4b2a-published-nested-admin-delete | acceptance / A2 | admin | storage: `publicadas/{ID}/assets/nested/fixture.png` delete | deny | — | deny | deny | cumple |
| 4b2a-published-nested-superclaim-create | acceptance / A2 | superclaim | storage: `publicadas/{ID}/assets/nested/fixture.png` create | deny | — | deny | deny | cumple |
| 4b2a-published-nested-superclaim-update | acceptance / A2 | superclaim | storage: `publicadas/{ID}/assets/nested/fixture.png` update | deny | — | deny | deny | cumple |
| 4b2a-published-nested-superclaim-delete | acceptance / A2 | superclaim | storage: `publicadas/{ID}/assets/nested/fixture.png` delete | deny | — | deny | deny | cumple |
| 4b2a-published-nested-role-create | acceptance / A2 | role | storage: `publicadas/{ID}/assets/nested/fixture.png` create | deny | — | deny | deny | cumple |
| 4b2a-published-nested-role-update | acceptance / A2 | role | storage: `publicadas/{ID}/assets/nested/fixture.png` update | deny | — | deny | deny | cumple |
| 4b2a-published-nested-role-delete | acceptance / A2 | role | storage: `publicadas/{ID}/assets/nested/fixture.png` delete | deny | — | deny | deny | cumple |
| 4b2a-published-nested-anonymous-create | acceptance / A2 | anonymous | storage: `publicadas/{ID}/assets/nested/fixture.png` create | deny | — | deny | deny | cumple |
| 4b2a-published-nested-anonymous-update | acceptance / A2 | anonymous | storage: `publicadas/{ID}/assets/nested/fixture.png` update | deny | — | deny | deny | cumple |
| 4b2a-published-nested-anonymous-delete | acceptance / A2 | anonymous | storage: `publicadas/{ID}/assets/nested/fixture.png` delete | deny | — | deny | deny | cumple |
| 4b2a-published-auth-sdk-get | characterization / C1 | A | storage: `publicadas/{ID}/index.html` get | allow | — | allow | allow | pendiente |
| 4b2a-storage-residual-usuarios-{A}-imagenes_legacy-{ID}.png | characterization / C1 | B | storage: `usuarios/{A}/imagenes_legacy/{ID}.png` update | allow | — | allow | allow | pendiente |
| 4b2a-storage-residual-usuarios-{A}-unmodeled-{ID}.png | characterization / C1 | B | storage: `usuarios/{A}/unmodeled/{ID}.png` update | allow | — | allow | allow | pendiente |
| 4b2a-storage-residual-publicadas_legacy-{ID}.html | characterization / C1 | B | storage: `publicadas_legacy/{ID}.html` update | allow | — | allow | allow | pendiente |
| 4b2b-root-anonymous-create | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}` create | deny | — | — | deny | cumple |
| 4b2b-root-anonymous-replace | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}` replace | deny | — | — | deny | cumple |
| 4b2b-root-anonymous-update | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}` update | deny | — | — | deny | cumple |
| 4b2b-root-anonymous-delete | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}` delete | deny | — | — | deny | cumple |
| 4b2b-root-A-create | acceptance / A4 | A | firestore: `countdownPresets/{ID}` create | deny | — | — | deny | cumple |
| 4b2b-root-A-replace | acceptance / A4 | A | firestore: `countdownPresets/{ID}` replace | deny | — | — | deny | cumple |
| 4b2b-root-A-update | acceptance / A4 | A | firestore: `countdownPresets/{ID}` update | deny | — | — | deny | cumple |
| 4b2b-root-A-delete | acceptance / A4 | A | firestore: `countdownPresets/{ID}` delete | deny | — | — | deny | cumple |
| 4b2b-root-B-create | acceptance / A4 | B | firestore: `countdownPresets/{ID}` create | deny | — | — | deny | cumple |
| 4b2b-root-B-replace | acceptance / A4 | B | firestore: `countdownPresets/{ID}` replace | deny | — | — | deny | cumple |
| 4b2b-root-B-update | acceptance / A4 | B | firestore: `countdownPresets/{ID}` update | deny | — | — | deny | cumple |
| 4b2b-root-B-delete | acceptance / A4 | B | firestore: `countdownPresets/{ID}` delete | deny | — | — | deny | cumple |
| 4b2b-root-admin-create | acceptance / A4 | admin | firestore: `countdownPresets/{ID}` create | deny | — | — | deny | cumple |
| 4b2b-root-admin-replace | acceptance / A4 | admin | firestore: `countdownPresets/{ID}` replace | deny | — | — | deny | cumple |
| 4b2b-root-admin-update | acceptance / A4 | admin | firestore: `countdownPresets/{ID}` update | deny | — | — | deny | cumple |
| 4b2b-root-admin-delete | acceptance / A4 | admin | firestore: `countdownPresets/{ID}` delete | deny | — | — | deny | cumple |
| 4b2b-root-superclaim-create | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}` create | deny | — | — | deny | cumple |
| 4b2b-root-superclaim-replace | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}` replace | deny | — | — | deny | cumple |
| 4b2b-root-superclaim-update | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}` update | deny | — | — | deny | cumple |
| 4b2b-root-superclaim-delete | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}` delete | deny | — | — | deny | cumple |
| 4b2b-root-role-create | acceptance / A4 | role | firestore: `countdownPresets/{ID}` create | deny | — | — | deny | cumple |
| 4b2b-root-role-replace | acceptance / A4 | role | firestore: `countdownPresets/{ID}` replace | deny | — | — | deny | cumple |
| 4b2b-root-role-update | acceptance / A4 | role | firestore: `countdownPresets/{ID}` update | deny | — | — | deny | cumple |
| 4b2b-root-role-delete | acceptance / A4 | role | firestore: `countdownPresets/{ID}` delete | deny | — | — | deny | cumple |
| 4b2b-root-anonymous-get | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}` get | deny | — | — | deny | cumple |
| 4b2b-root-A-get | acceptance / A4 | A | firestore: `countdownPresets/{ID}` get | deny | — | — | deny | cumple |
| 4b2b-root-B-get | acceptance / A4 | B | firestore: `countdownPresets/{ID}` get | deny | — | — | deny | cumple |
| 4b2b-version-anonymous-create | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/versions/2` create | deny | — | — | deny | cumple |
| 4b2b-version-anonymous-replace | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/versions/2` replace | deny | — | — | deny | cumple |
| 4b2b-version-anonymous-update | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/versions/2` update | deny | — | — | deny | cumple |
| 4b2b-version-anonymous-delete | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/versions/2` delete | deny | — | — | deny | cumple |
| 4b2b-version-A-create | acceptance / A4 | A | firestore: `countdownPresets/{ID}/versions/2` create | deny | — | — | deny | cumple |
| 4b2b-version-A-replace | acceptance / A4 | A | firestore: `countdownPresets/{ID}/versions/2` replace | deny | — | — | deny | cumple |
| 4b2b-version-A-update | acceptance / A4 | A | firestore: `countdownPresets/{ID}/versions/2` update | deny | — | — | deny | cumple |
| 4b2b-version-A-delete | acceptance / A4 | A | firestore: `countdownPresets/{ID}/versions/2` delete | deny | — | — | deny | cumple |
| 4b2b-version-B-create | acceptance / A4 | B | firestore: `countdownPresets/{ID}/versions/2` create | deny | — | — | deny | cumple |
| 4b2b-version-B-replace | acceptance / A4 | B | firestore: `countdownPresets/{ID}/versions/2` replace | deny | — | — | deny | cumple |
| 4b2b-version-B-update | acceptance / A4 | B | firestore: `countdownPresets/{ID}/versions/2` update | deny | — | — | deny | cumple |
| 4b2b-version-B-delete | acceptance / A4 | B | firestore: `countdownPresets/{ID}/versions/2` delete | deny | — | — | deny | cumple |
| 4b2b-version-admin-create | acceptance / A4 | admin | firestore: `countdownPresets/{ID}/versions/2` create | deny | — | — | deny | cumple |
| 4b2b-version-admin-replace | acceptance / A4 | admin | firestore: `countdownPresets/{ID}/versions/2` replace | deny | — | — | deny | cumple |
| 4b2b-version-admin-update | acceptance / A4 | admin | firestore: `countdownPresets/{ID}/versions/2` update | deny | — | — | deny | cumple |
| 4b2b-version-admin-delete | acceptance / A4 | admin | firestore: `countdownPresets/{ID}/versions/2` delete | deny | — | — | deny | cumple |
| 4b2b-version-superclaim-create | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}/versions/2` create | deny | — | — | deny | cumple |
| 4b2b-version-superclaim-replace | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}/versions/2` replace | deny | — | — | deny | cumple |
| 4b2b-version-superclaim-update | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}/versions/2` update | deny | — | — | deny | cumple |
| 4b2b-version-superclaim-delete | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}/versions/2` delete | deny | — | — | deny | cumple |
| 4b2b-version-role-create | acceptance / A4 | role | firestore: `countdownPresets/{ID}/versions/2` create | deny | — | — | deny | cumple |
| 4b2b-version-role-replace | acceptance / A4 | role | firestore: `countdownPresets/{ID}/versions/2` replace | deny | — | — | deny | cumple |
| 4b2b-version-role-update | acceptance / A4 | role | firestore: `countdownPresets/{ID}/versions/2` update | deny | — | — | deny | cumple |
| 4b2b-version-role-delete | acceptance / A4 | role | firestore: `countdownPresets/{ID}/versions/2` delete | deny | — | — | deny | cumple |
| 4b2b-version-child-anonymous-create | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/versions/2/internal/child` create | deny | — | — | deny | cumple |
| 4b2b-version-child-anonymous-replace | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/versions/2/internal/child` replace | deny | — | — | deny | cumple |
| 4b2b-version-child-anonymous-update | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/versions/2/internal/child` update | deny | — | — | deny | cumple |
| 4b2b-version-child-anonymous-delete | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/versions/2/internal/child` delete | deny | — | — | deny | cumple |
| 4b2b-version-child-A-create | acceptance / A4 | A | firestore: `countdownPresets/{ID}/versions/2/internal/child` create | deny | — | — | deny | cumple |
| 4b2b-version-child-A-replace | acceptance / A4 | A | firestore: `countdownPresets/{ID}/versions/2/internal/child` replace | deny | — | — | deny | cumple |
| 4b2b-version-child-A-update | acceptance / A4 | A | firestore: `countdownPresets/{ID}/versions/2/internal/child` update | deny | — | — | deny | cumple |
| 4b2b-version-child-A-delete | acceptance / A4 | A | firestore: `countdownPresets/{ID}/versions/2/internal/child` delete | deny | — | — | deny | cumple |
| 4b2b-version-child-B-create | acceptance / A4 | B | firestore: `countdownPresets/{ID}/versions/2/internal/child` create | deny | — | — | deny | cumple |
| 4b2b-version-child-B-replace | acceptance / A4 | B | firestore: `countdownPresets/{ID}/versions/2/internal/child` replace | deny | — | — | deny | cumple |
| 4b2b-version-child-B-update | acceptance / A4 | B | firestore: `countdownPresets/{ID}/versions/2/internal/child` update | deny | — | — | deny | cumple |
| 4b2b-version-child-B-delete | acceptance / A4 | B | firestore: `countdownPresets/{ID}/versions/2/internal/child` delete | deny | — | — | deny | cumple |
| 4b2b-version-child-admin-create | acceptance / A4 | admin | firestore: `countdownPresets/{ID}/versions/2/internal/child` create | deny | — | — | deny | cumple |
| 4b2b-version-child-admin-replace | acceptance / A4 | admin | firestore: `countdownPresets/{ID}/versions/2/internal/child` replace | deny | — | — | deny | cumple |
| 4b2b-version-child-admin-update | acceptance / A4 | admin | firestore: `countdownPresets/{ID}/versions/2/internal/child` update | deny | — | — | deny | cumple |
| 4b2b-version-child-admin-delete | acceptance / A4 | admin | firestore: `countdownPresets/{ID}/versions/2/internal/child` delete | deny | — | — | deny | cumple |
| 4b2b-version-child-superclaim-create | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}/versions/2/internal/child` create | deny | — | — | deny | cumple |
| 4b2b-version-child-superclaim-replace | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}/versions/2/internal/child` replace | deny | — | — | deny | cumple |
| 4b2b-version-child-superclaim-update | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}/versions/2/internal/child` update | deny | — | — | deny | cumple |
| 4b2b-version-child-superclaim-delete | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}/versions/2/internal/child` delete | deny | — | — | deny | cumple |
| 4b2b-version-child-role-create | acceptance / A4 | role | firestore: `countdownPresets/{ID}/versions/2/internal/child` create | deny | — | — | deny | cumple |
| 4b2b-version-child-role-replace | acceptance / A4 | role | firestore: `countdownPresets/{ID}/versions/2/internal/child` replace | deny | — | — | deny | cumple |
| 4b2b-version-child-role-update | acceptance / A4 | role | firestore: `countdownPresets/{ID}/versions/2/internal/child` update | deny | — | — | deny | cumple |
| 4b2b-version-child-role-delete | acceptance / A4 | role | firestore: `countdownPresets/{ID}/versions/2/internal/child` delete | deny | — | — | deny | cumple |
| 4b2b-operation-anonymous-create | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/operations/op` create | deny | — | — | deny | cumple |
| 4b2b-operation-anonymous-replace | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/operations/op` replace | deny | — | — | deny | cumple |
| 4b2b-operation-anonymous-update | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/operations/op` update | deny | — | — | deny | cumple |
| 4b2b-operation-anonymous-delete | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/operations/op` delete | deny | — | — | deny | cumple |
| 4b2b-operation-A-create | acceptance / A4 | A | firestore: `countdownPresets/{ID}/operations/op` create | deny | — | — | deny | cumple |
| 4b2b-operation-A-replace | acceptance / A4 | A | firestore: `countdownPresets/{ID}/operations/op` replace | deny | — | — | deny | cumple |
| 4b2b-operation-A-update | acceptance / A4 | A | firestore: `countdownPresets/{ID}/operations/op` update | deny | — | — | deny | cumple |
| 4b2b-operation-A-delete | acceptance / A4 | A | firestore: `countdownPresets/{ID}/operations/op` delete | deny | — | — | deny | cumple |
| 4b2b-operation-B-create | acceptance / A4 | B | firestore: `countdownPresets/{ID}/operations/op` create | deny | — | — | deny | cumple |
| 4b2b-operation-B-replace | acceptance / A4 | B | firestore: `countdownPresets/{ID}/operations/op` replace | deny | — | — | deny | cumple |
| 4b2b-operation-B-update | acceptance / A4 | B | firestore: `countdownPresets/{ID}/operations/op` update | deny | — | — | deny | cumple |
| 4b2b-operation-B-delete | acceptance / A4 | B | firestore: `countdownPresets/{ID}/operations/op` delete | deny | — | — | deny | cumple |
| 4b2b-operation-admin-create | acceptance / A4 | admin | firestore: `countdownPresets/{ID}/operations/op` create | deny | — | — | deny | cumple |
| 4b2b-operation-admin-replace | acceptance / A4 | admin | firestore: `countdownPresets/{ID}/operations/op` replace | deny | — | — | deny | cumple |
| 4b2b-operation-admin-update | acceptance / A4 | admin | firestore: `countdownPresets/{ID}/operations/op` update | deny | — | — | deny | cumple |
| 4b2b-operation-admin-delete | acceptance / A4 | admin | firestore: `countdownPresets/{ID}/operations/op` delete | deny | — | — | deny | cumple |
| 4b2b-operation-superclaim-create | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}/operations/op` create | deny | — | — | deny | cumple |
| 4b2b-operation-superclaim-replace | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}/operations/op` replace | deny | — | — | deny | cumple |
| 4b2b-operation-superclaim-update | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}/operations/op` update | deny | — | — | deny | cumple |
| 4b2b-operation-superclaim-delete | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}/operations/op` delete | deny | — | — | deny | cumple |
| 4b2b-operation-role-create | acceptance / A4 | role | firestore: `countdownPresets/{ID}/operations/op` create | deny | — | — | deny | cumple |
| 4b2b-operation-role-replace | acceptance / A4 | role | firestore: `countdownPresets/{ID}/operations/op` replace | deny | — | — | deny | cumple |
| 4b2b-operation-role-update | acceptance / A4 | role | firestore: `countdownPresets/{ID}/operations/op` update | deny | — | — | deny | cumple |
| 4b2b-operation-role-delete | acceptance / A4 | role | firestore: `countdownPresets/{ID}/operations/op` delete | deny | — | — | deny | cumple |
| 4b2b-operation-anonymous-get | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/operations/op` get | deny | — | — | deny | cumple |
| 4b2b-operation-A-get | acceptance / A4 | A | firestore: `countdownPresets/{ID}/operations/op` get | deny | — | — | deny | cumple |
| 4b2b-operation-B-get | acceptance / A4 | B | firestore: `countdownPresets/{ID}/operations/op` get | deny | — | — | deny | cumple |
| 4b2b-operation-child-anonymous-create | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/operations/op/internal/child` create | deny | — | — | deny | cumple |
| 4b2b-operation-child-anonymous-replace | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/operations/op/internal/child` replace | deny | — | — | deny | cumple |
| 4b2b-operation-child-anonymous-update | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/operations/op/internal/child` update | deny | — | — | deny | cumple |
| 4b2b-operation-child-anonymous-delete | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/operations/op/internal/child` delete | deny | — | — | deny | cumple |
| 4b2b-operation-child-A-create | acceptance / A4 | A | firestore: `countdownPresets/{ID}/operations/op/internal/child` create | deny | — | — | deny | cumple |
| 4b2b-operation-child-A-replace | acceptance / A4 | A | firestore: `countdownPresets/{ID}/operations/op/internal/child` replace | deny | — | — | deny | cumple |
| 4b2b-operation-child-A-update | acceptance / A4 | A | firestore: `countdownPresets/{ID}/operations/op/internal/child` update | deny | — | — | deny | cumple |
| 4b2b-operation-child-A-delete | acceptance / A4 | A | firestore: `countdownPresets/{ID}/operations/op/internal/child` delete | deny | — | — | deny | cumple |
| 4b2b-operation-child-B-create | acceptance / A4 | B | firestore: `countdownPresets/{ID}/operations/op/internal/child` create | deny | — | — | deny | cumple |
| 4b2b-operation-child-B-replace | acceptance / A4 | B | firestore: `countdownPresets/{ID}/operations/op/internal/child` replace | deny | — | — | deny | cumple |
| 4b2b-operation-child-B-update | acceptance / A4 | B | firestore: `countdownPresets/{ID}/operations/op/internal/child` update | deny | — | — | deny | cumple |
| 4b2b-operation-child-B-delete | acceptance / A4 | B | firestore: `countdownPresets/{ID}/operations/op/internal/child` delete | deny | — | — | deny | cumple |
| 4b2b-operation-child-admin-create | acceptance / A4 | admin | firestore: `countdownPresets/{ID}/operations/op/internal/child` create | deny | — | — | deny | cumple |
| 4b2b-operation-child-admin-replace | acceptance / A4 | admin | firestore: `countdownPresets/{ID}/operations/op/internal/child` replace | deny | — | — | deny | cumple |
| 4b2b-operation-child-admin-update | acceptance / A4 | admin | firestore: `countdownPresets/{ID}/operations/op/internal/child` update | deny | — | — | deny | cumple |
| 4b2b-operation-child-admin-delete | acceptance / A4 | admin | firestore: `countdownPresets/{ID}/operations/op/internal/child` delete | deny | — | — | deny | cumple |
| 4b2b-operation-child-superclaim-create | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}/operations/op/internal/child` create | deny | — | — | deny | cumple |
| 4b2b-operation-child-superclaim-replace | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}/operations/op/internal/child` replace | deny | — | — | deny | cumple |
| 4b2b-operation-child-superclaim-update | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}/operations/op/internal/child` update | deny | — | — | deny | cumple |
| 4b2b-operation-child-superclaim-delete | acceptance / A4 | superclaim | firestore: `countdownPresets/{ID}/operations/op/internal/child` delete | deny | — | — | deny | cumple |
| 4b2b-operation-child-role-create | acceptance / A4 | role | firestore: `countdownPresets/{ID}/operations/op/internal/child` create | deny | — | — | deny | cumple |
| 4b2b-operation-child-role-replace | acceptance / A4 | role | firestore: `countdownPresets/{ID}/operations/op/internal/child` replace | deny | — | — | deny | cumple |
| 4b2b-operation-child-role-update | acceptance / A4 | role | firestore: `countdownPresets/{ID}/operations/op/internal/child` update | deny | — | — | deny | cumple |
| 4b2b-operation-child-role-delete | acceptance / A4 | role | firestore: `countdownPresets/{ID}/operations/op/internal/child` delete | deny | — | — | deny | cumple |
| 4b2b-operation-child-anonymous-get | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/operations/op/internal/child` get | deny | — | — | deny | cumple |
| 4b2b-operation-child-A-get | acceptance / A4 | A | firestore: `countdownPresets/{ID}/operations/op/internal/child` get | deny | — | — | deny | cumple |
| 4b2b-operation-child-B-get | acceptance / A4 | B | firestore: `countdownPresets/{ID}/operations/op/internal/child` get | deny | — | — | deny | cumple |
| 4b2b-root-draft-anonymous-get | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}` get | deny | — | — | deny | cumple |
| 4b2b-root-published-anonymous-get | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}` get | deny | — | — | deny | cumple |
| 4b2b-root-archived-anonymous-get | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}` get | deny | — | — | deny | cumple |
| 4b2b-root-list-anonymous | acceptance / A4 | anonymous | firestore: `countdownPresets` list | deny | — | — | deny | cumple |
| 4b2b-published-query-anonymous | acceptance / A4 | anonymous | firestore: `countdownPresets` list | deny | — | — | deny | cumple |
| 4b2b-operation-list-anonymous | acceptance / A4 | anonymous | firestore: `countdownPresets/{ID}/operations` list | deny | — | — | deny | cumple |
| 4b2b-root-draft-A-get | acceptance / A4 | A | firestore: `countdownPresets/{ID}` get | deny | — | — | deny | cumple |
| 4b2b-root-published-A-get | acceptance / A4 | A | firestore: `countdownPresets/{ID}` get | deny | — | — | deny | cumple |
| 4b2b-root-archived-A-get | acceptance / A4 | A | firestore: `countdownPresets/{ID}` get | deny | — | — | deny | cumple |
| 4b2b-root-list-A | acceptance / A4 | A | firestore: `countdownPresets` list | deny | — | — | deny | cumple |
| 4b2b-published-query-A | acceptance / A4 | A | firestore: `countdownPresets` list | deny | — | — | deny | cumple |
| 4b2b-operation-list-A | acceptance / A4 | A | firestore: `countdownPresets/{ID}/operations` list | deny | — | — | deny | cumple |
| 4b2b-root-draft-B-get | acceptance / A4 | B | firestore: `countdownPresets/{ID}` get | deny | — | — | deny | cumple |
| 4b2b-root-published-B-get | acceptance / A4 | B | firestore: `countdownPresets/{ID}` get | deny | — | — | deny | cumple |
| 4b2b-root-archived-B-get | acceptance / A4 | B | firestore: `countdownPresets/{ID}` get | deny | — | — | deny | cumple |
| 4b2b-root-list-B | acceptance / A4 | B | firestore: `countdownPresets` list | deny | — | — | deny | cumple |
| 4b2b-published-query-B | acceptance / A4 | B | firestore: `countdownPresets` list | deny | — | — | deny | cumple |
| 4b2b-operation-list-B | acceptance / A4 | B | firestore: `countdownPresets/{ID}/operations` list | deny | — | — | deny | cumple |
| 4b2b-root-admin-read-variant | characterization / C1 | admin | firestore: `countdownPresets/{ID}` get | allow | — | — | allow | pendiente |
| 4b2b-operation-admin-read-variant | characterization / C1 | admin | firestore: `countdownPresets/{ID}/operations/op` get | allow | — | — | allow | pendiente |
| 4b2b-root-superclaim-read-variant | characterization / C1 | superclaim | firestore: `countdownPresets/{ID}` get | allow | — | — | allow | pendiente |
| 4b2b-operation-superclaim-read-variant | characterization / C1 | superclaim | firestore: `countdownPresets/{ID}/operations/op` get | allow | — | — | allow | pendiente |
| 4b2b-root-role-read-variant | characterization / C1 | role | firestore: `countdownPresets/{ID}` get | allow | — | — | allow | pendiente |
| 4b2b-operation-role-read-variant | characterization / C1 | role | firestore: `countdownPresets/{ID}/operations/op` get | allow | — | — | allow | pendiente |
| 4b2b-root-stringAdmin-read-variant | characterization / C1 | stringAdmin | firestore: `countdownPresets/{ID}` get | deny | — | — | deny | pendiente |
| 4b2b-operation-stringAdmin-read-variant | characterization / C1 | stringAdmin | firestore: `countdownPresets/{ID}/operations/op` get | deny | — | — | deny | pendiente |
| 4b2b-root-serverSuper-read-variant | characterization / C1 | serverSuper | firestore: `countdownPresets/{ID}` get | deny | — | — | deny | pendiente |
| 4b2b-operation-serverSuper-read-variant | characterization / C1 | serverSuper | firestore: `countdownPresets/{ID}/operations/op` get | deny | — | — | deny | pendiente |
| 4b2b-root-canonicalSuper-read-variant | characterization / C1 | canonicalSuper | firestore: `countdownPresets/{ID}` get | deny | — | — | deny | pendiente |
| 4b2b-operation-canonicalSuper-read-variant | characterization / C1 | canonicalSuper | firestore: `countdownPresets/{ID}/operations/op` get | deny | — | — | deny | pendiente |
| 4b2b-version-A-get-retained | characterization / C1 | A | firestore: `countdownPresets/{ID}/versions/2` get | allow | — | — | allow | pendiente |
| 4b2b-version-A-list-retained | characterization / C1 | A | firestore: `countdownPresets/{ID}/versions` list | allow | — | — | allow | pendiente |
| 4b2b-version-anonymous-get-retained | characterization / C1 | anonymous | firestore: `countdownPresets/{ID}/versions/2` get | deny | — | — | deny | pendiente |
| 4b2b-version-anonymous-list-retained | characterization / C1 | anonymous | firestore: `countdownPresets/{ID}/versions` list | deny | — | — | deny | pendiente |
| 4b2b-version-admin-get-retained | characterization / C1 | admin | firestore: `countdownPresets/{ID}/versions/2` get | allow | — | — | allow | pendiente |
| 4b2b-version-admin-list-retained | characterization / C1 | admin | firestore: `countdownPresets/{ID}/versions` list | allow | — | — | allow | pendiente |
| 4b2b-root-admin-list | characterization / C1 | admin | firestore: `countdownPresets` list | allow | — | — | allow | pendiente |
| 4b2b-staging-prefix-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/staging` create | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/staging` update | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/staging` delete | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-anonymous-get | acceptance / A4 | anonymous | storage: `assets/countdown/staging` get | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-A-create | acceptance / A4 | A | storage: `assets/countdown/staging` create | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-A-update | acceptance / A4 | A | storage: `assets/countdown/staging` update | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-A-delete | acceptance / A4 | A | storage: `assets/countdown/staging` delete | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-A-get | acceptance / A4 | A | storage: `assets/countdown/staging` get | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-B-create | acceptance / A4 | B | storage: `assets/countdown/staging` create | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-B-update | acceptance / A4 | B | storage: `assets/countdown/staging` update | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-B-delete | acceptance / A4 | B | storage: `assets/countdown/staging` delete | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-B-get | acceptance / A4 | B | storage: `assets/countdown/staging` get | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-admin-create | acceptance / A4 | admin | storage: `assets/countdown/staging` create | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-admin-update | acceptance / A4 | admin | storage: `assets/countdown/staging` update | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/staging` delete | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-admin-get | characterization / C1 | admin | storage: `assets/countdown/staging` get | allow | — | — | allow | pendiente |
| 4b2b-staging-prefix-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/staging` create | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/staging` update | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/staging` delete | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-superclaim-get | characterization / C1 | superclaim | storage: `assets/countdown/staging` get | allow | — | — | allow | pendiente |
| 4b2b-staging-prefix-role-create | acceptance / A4 | role | storage: `assets/countdown/staging` create | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-role-update | acceptance / A4 | role | storage: `assets/countdown/staging` update | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-role-delete | acceptance / A4 | role | storage: `assets/countdown/staging` delete | deny | — | — | deny | cumple |
| 4b2b-staging-prefix-role-get | characterization / C1 | role | storage: `assets/countdown/staging` get | allow | — | — | allow | pendiente |
| 4b2b-staging-nested-svg-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-anonymous-get | acceptance / A4 | anonymous | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` get | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-A-create | acceptance / A4 | A | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-A-update | acceptance / A4 | A | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-A-delete | acceptance / A4 | A | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-A-get | acceptance / A4 | A | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` get | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-B-create | acceptance / A4 | B | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-B-update | acceptance / A4 | B | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-B-delete | acceptance / A4 | B | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-B-get | acceptance / A4 | B | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` get | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-admin-create | acceptance / A4 | admin | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-admin-update | acceptance / A4 | admin | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-admin-get | characterization / C1 | admin | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` get | allow | — | — | allow | pendiente |
| 4b2b-staging-nested-svg-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-superclaim-get | characterization / C1 | superclaim | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` get | allow | — | — | allow | pendiente |
| 4b2b-staging-nested-svg-role-create | acceptance / A4 | role | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-role-update | acceptance / A4 | role | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-role-delete | acceptance / A4 | role | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-staging-nested-svg-role-get | characterization / C1 | role | storage: `assets/countdown/staging/{ID}/op/attempt/frame.svg` get | allow | — | — | allow | pendiente |
| 4b2b-staging-nested-png-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-anonymous-get | acceptance / A4 | anonymous | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` get | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-A-create | acceptance / A4 | A | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-A-update | acceptance / A4 | A | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-A-delete | acceptance / A4 | A | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-A-get | acceptance / A4 | A | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` get | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-B-create | acceptance / A4 | B | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-B-update | acceptance / A4 | B | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-B-delete | acceptance / A4 | B | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-B-get | acceptance / A4 | B | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` get | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-admin-create | acceptance / A4 | admin | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-admin-update | acceptance / A4 | admin | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-admin-get | characterization / C1 | admin | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` get | allow | — | — | allow | pendiente |
| 4b2b-staging-nested-png-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-superclaim-get | characterization / C1 | superclaim | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` get | allow | — | — | allow | pendiente |
| 4b2b-staging-nested-png-role-create | acceptance / A4 | role | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-role-update | acceptance / A4 | role | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-role-delete | acceptance / A4 | role | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-staging-nested-png-role-get | characterization / C1 | role | storage: `assets/countdown/staging/{ID}/op/attempt/thumbnail.png` get | allow | — | — | allow | pendiente |
| 4b2b-staging-anonymous-list | acceptance / A4 | anonymous | storage: `assets/countdown/staging` list | deny | — | — | deny | cumple |
| 4b2b-staging-A-list | acceptance / A4 | A | storage: `assets/countdown/staging` list | deny | — | — | deny | cumple |
| 4b2b-staging-B-list | acceptance / A4 | B | storage: `assets/countdown/staging` list | deny | — | — | deny | cumple |
| 4b2b-staging-admin-list | characterization / C1 | admin | storage: `assets/countdown/staging` list | allow | — | — | allow | pendiente |
| 4b2b-frame-draft-prefix-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/draft` create | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/draft` update | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/draft` delete | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-anonymous-get | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/draft` get | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-A-create | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/draft` create | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-A-update | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/draft` update | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-A-delete | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/draft` delete | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-A-get | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/draft` get | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-B-create | acceptance / A4 | B | storage: `assets/countdown/frames/{ID}/draft` create | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-B-update | acceptance / A4 | B | storage: `assets/countdown/frames/{ID}/draft` update | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-B-delete | acceptance / A4 | B | storage: `assets/countdown/frames/{ID}/draft` delete | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-B-get | acceptance / A4 | B | storage: `assets/countdown/frames/{ID}/draft` get | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-admin-create | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/draft` create | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-admin-update | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/draft` update | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/draft` delete | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-admin-get | characterization / C1 | admin | storage: `assets/countdown/frames/{ID}/draft` get | allow | — | — | allow | pendiente |
| 4b2b-frame-draft-prefix-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/draft` create | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/draft` update | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/draft` delete | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-superclaim-get | characterization / C1 | superclaim | storage: `assets/countdown/frames/{ID}/draft` get | allow | — | — | allow | pendiente |
| 4b2b-frame-draft-prefix-role-create | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/draft` create | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-role-update | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/draft` update | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-role-delete | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/draft` delete | deny | — | — | deny | cumple |
| 4b2b-frame-draft-prefix-role-get | characterization / C1 | role | storage: `assets/countdown/frames/{ID}/draft` get | allow | — | — | allow | pendiente |
| 4b2b-frame-draft-nested-svg-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-anonymous-get | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` get | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-A-create | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-A-update | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-A-delete | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-A-get | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` get | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-B-create | acceptance / A4 | B | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-B-update | acceptance / A4 | B | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-B-delete | acceptance / A4 | B | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-B-get | acceptance / A4 | B | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` get | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-admin-create | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-admin-update | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-admin-get | characterization / C1 | admin | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` get | allow | — | — | allow | pendiente |
| 4b2b-frame-draft-nested-svg-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-superclaim-get | characterization / C1 | superclaim | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` get | allow | — | — | allow | pendiente |
| 4b2b-frame-draft-nested-svg-role-create | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-role-update | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-role-delete | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-svg-role-get | characterization / C1 | role | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/frame.svg` get | allow | — | — | allow | pendiente |
| 4b2b-frame-draft-nested-png-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-anonymous-get | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` get | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-A-create | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-A-update | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-A-delete | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-A-get | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` get | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-B-create | acceptance / A4 | B | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-B-update | acceptance / A4 | B | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-B-delete | acceptance / A4 | B | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-B-get | acceptance / A4 | B | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` get | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-admin-create | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-admin-update | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-admin-get | characterization / C1 | admin | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` get | allow | — | — | allow | pendiente |
| 4b2b-frame-draft-nested-png-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-superclaim-get | characterization / C1 | superclaim | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` get | allow | — | — | allow | pendiente |
| 4b2b-frame-draft-nested-png-role-create | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-role-update | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-role-delete | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-frame-draft-nested-png-role-get | characterization / C1 | role | storage: `assets/countdown/frames/{ID}/draft/{ID}/op/attempt/thumbnail.png` get | allow | — | — | allow | pendiente |
| 4b2b-frame-draft-anonymous-list | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/draft` list | deny | — | — | deny | cumple |
| 4b2b-frame-draft-A-list | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/draft` list | deny | — | — | deny | cumple |
| 4b2b-frame-draft-B-list | acceptance / A4 | B | storage: `assets/countdown/frames/{ID}/draft` list | deny | — | — | deny | cumple |
| 4b2b-frame-draft-admin-list | characterization / C1 | admin | storage: `assets/countdown/frames/{ID}/draft` list | allow | — | — | allow | pendiente |
| 4b2b-thumbnail-draft-prefix-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/draft` create | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/draft` update | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/draft` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-anonymous-get | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/draft` get | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-A-create | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/draft` create | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-A-update | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/draft` update | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-A-delete | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/draft` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-A-get | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/draft` get | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-B-create | acceptance / A4 | B | storage: `assets/countdown/thumbnails/{ID}/draft` create | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-B-update | acceptance / A4 | B | storage: `assets/countdown/thumbnails/{ID}/draft` update | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-B-delete | acceptance / A4 | B | storage: `assets/countdown/thumbnails/{ID}/draft` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-B-get | acceptance / A4 | B | storage: `assets/countdown/thumbnails/{ID}/draft` get | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-admin-create | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/draft` create | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-admin-update | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/draft` update | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/draft` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-admin-get | characterization / C1 | admin | storage: `assets/countdown/thumbnails/{ID}/draft` get | allow | — | — | allow | pendiente |
| 4b2b-thumbnail-draft-prefix-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/draft` create | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/draft` update | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/draft` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-superclaim-get | characterization / C1 | superclaim | storage: `assets/countdown/thumbnails/{ID}/draft` get | allow | — | — | allow | pendiente |
| 4b2b-thumbnail-draft-prefix-role-create | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/draft` create | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-role-update | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/draft` update | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-role-delete | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/draft` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-prefix-role-get | characterization / C1 | role | storage: `assets/countdown/thumbnails/{ID}/draft` get | allow | — | — | allow | pendiente |
| 4b2b-thumbnail-draft-nested-svg-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-anonymous-get | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` get | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-A-create | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-A-update | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-A-delete | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-A-get | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` get | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-B-create | acceptance / A4 | B | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-B-update | acceptance / A4 | B | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-B-delete | acceptance / A4 | B | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-B-get | acceptance / A4 | B | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` get | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-admin-create | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-admin-update | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-admin-get | characterization / C1 | admin | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` get | allow | — | — | allow | pendiente |
| 4b2b-thumbnail-draft-nested-svg-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-superclaim-get | characterization / C1 | superclaim | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` get | allow | — | — | allow | pendiente |
| 4b2b-thumbnail-draft-nested-svg-role-create | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-role-update | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-role-delete | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-svg-role-get | characterization / C1 | role | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/frame.svg` get | allow | — | — | allow | pendiente |
| 4b2b-thumbnail-draft-nested-png-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-anonymous-get | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` get | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-A-create | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-A-update | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-A-delete | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-A-get | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` get | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-B-create | acceptance / A4 | B | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-B-update | acceptance / A4 | B | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-B-delete | acceptance / A4 | B | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-B-get | acceptance / A4 | B | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` get | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-admin-create | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-admin-update | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-admin-get | characterization / C1 | admin | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` get | allow | — | — | allow | pendiente |
| 4b2b-thumbnail-draft-nested-png-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-superclaim-get | characterization / C1 | superclaim | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` get | allow | — | — | allow | pendiente |
| 4b2b-thumbnail-draft-nested-png-role-create | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-role-update | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-role-delete | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-nested-png-role-get | characterization / C1 | role | storage: `assets/countdown/thumbnails/{ID}/draft/{ID}/op/attempt/thumbnail.png` get | allow | — | — | allow | pendiente |
| 4b2b-thumbnail-draft-anonymous-list | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/draft` list | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-A-list | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/draft` list | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-B-list | acceptance / A4 | B | storage: `assets/countdown/thumbnails/{ID}/draft` list | deny | — | — | deny | cumple |
| 4b2b-thumbnail-draft-admin-list | characterization / C1 | admin | storage: `assets/countdown/thumbnails/{ID}/draft` list | allow | — | — | allow | pendiente |
| 4b2b-frames-family-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/frames` create | deny | — | — | deny | cumple |
| 4b2b-frames-family-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/frames` update | deny | — | — | deny | cumple |
| 4b2b-frames-family-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/frames` delete | deny | — | — | deny | cumple |
| 4b2b-frames-family-A-create | acceptance / A4 | A | storage: `assets/countdown/frames` create | deny | — | — | deny | cumple |
| 4b2b-frames-family-A-update | acceptance / A4 | A | storage: `assets/countdown/frames` update | deny | — | — | deny | cumple |
| 4b2b-frames-family-A-delete | acceptance / A4 | A | storage: `assets/countdown/frames` delete | deny | — | — | deny | cumple |
| 4b2b-frames-family-admin-create | acceptance / A4 | admin | storage: `assets/countdown/frames` create | deny | — | — | deny | cumple |
| 4b2b-frames-family-admin-update | acceptance / A4 | admin | storage: `assets/countdown/frames` update | deny | — | — | deny | cumple |
| 4b2b-frames-family-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/frames` delete | deny | — | — | deny | cumple |
| 4b2b-frames-family-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/frames` create | deny | — | — | deny | cumple |
| 4b2b-frames-family-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/frames` update | deny | — | — | deny | cumple |
| 4b2b-frames-family-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/frames` delete | deny | — | — | deny | cumple |
| 4b2b-frames-family-role-create | acceptance / A4 | role | storage: `assets/countdown/frames` create | deny | — | — | deny | cumple |
| 4b2b-frames-family-role-update | acceptance / A4 | role | storage: `assets/countdown/frames` update | deny | — | — | deny | cumple |
| 4b2b-frames-family-role-delete | acceptance / A4 | role | storage: `assets/countdown/frames` delete | deny | — | — | deny | cumple |
| 4b2b-frames-family-A-get | characterization / C1 | A | storage: `assets/countdown/frames` get | allow | — | — | allow | pendiente |
| 4b2b-frames-family-anonymous-get | characterization / C1 | anonymous | storage: `assets/countdown/frames` get | deny | — | — | deny | pendiente |
| 4b2b-frames-preset-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}` create | deny | — | — | deny | cumple |
| 4b2b-frames-preset-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}` update | deny | — | — | deny | cumple |
| 4b2b-frames-preset-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}` delete | deny | — | — | deny | cumple |
| 4b2b-frames-preset-A-create | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}` create | deny | — | — | deny | cumple |
| 4b2b-frames-preset-A-update | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}` update | deny | — | — | deny | cumple |
| 4b2b-frames-preset-A-delete | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}` delete | deny | — | — | deny | cumple |
| 4b2b-frames-preset-admin-create | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}` create | deny | — | — | deny | cumple |
| 4b2b-frames-preset-admin-update | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}` update | deny | — | — | deny | cumple |
| 4b2b-frames-preset-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}` delete | deny | — | — | deny | cumple |
| 4b2b-frames-preset-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}` create | deny | — | — | deny | cumple |
| 4b2b-frames-preset-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}` update | deny | — | — | deny | cumple |
| 4b2b-frames-preset-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}` delete | deny | — | — | deny | cumple |
| 4b2b-frames-preset-role-create | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}` create | deny | — | — | deny | cumple |
| 4b2b-frames-preset-role-update | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}` update | deny | — | — | deny | cumple |
| 4b2b-frames-preset-role-delete | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}` delete | deny | — | — | deny | cumple |
| 4b2b-frames-preset-A-get | characterization / C1 | A | storage: `assets/countdown/frames/{ID}` get | allow | — | — | allow | pendiente |
| 4b2b-frames-preset-anonymous-get | characterization / C1 | anonymous | storage: `assets/countdown/frames/{ID}` get | deny | — | — | deny | pendiente |
| 4b2b-frames-operation-prefix-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/operations` create | deny | — | — | deny | cumple |
| 4b2b-frames-operation-prefix-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/operations` update | deny | — | — | deny | cumple |
| 4b2b-frames-operation-prefix-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/operations` delete | deny | — | — | deny | cumple |
| 4b2b-frames-operation-prefix-A-create | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/operations` create | deny | — | — | deny | cumple |
| 4b2b-frames-operation-prefix-A-update | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/operations` update | deny | — | — | deny | cumple |
| 4b2b-frames-operation-prefix-A-delete | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/operations` delete | deny | — | — | deny | cumple |
| 4b2b-frames-operation-prefix-admin-create | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/operations` create | deny | — | — | deny | cumple |
| 4b2b-frames-operation-prefix-admin-update | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/operations` update | deny | — | — | deny | cumple |
| 4b2b-frames-operation-prefix-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/operations` delete | deny | — | — | deny | cumple |
| 4b2b-frames-operation-prefix-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/operations` create | deny | — | — | deny | cumple |
| 4b2b-frames-operation-prefix-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/operations` update | deny | — | — | deny | cumple |
| 4b2b-frames-operation-prefix-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/operations` delete | deny | — | — | deny | cumple |
| 4b2b-frames-operation-prefix-role-create | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/operations` create | deny | — | — | deny | cumple |
| 4b2b-frames-operation-prefix-role-update | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/operations` update | deny | — | — | deny | cumple |
| 4b2b-frames-operation-prefix-role-delete | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/operations` delete | deny | — | — | deny | cumple |
| 4b2b-frames-operation-prefix-A-get | characterization / C1 | A | storage: `assets/countdown/frames/{ID}/operations` get | allow | — | — | allow | pendiente |
| 4b2b-frames-operation-prefix-anonymous-get | characterization / C1 | anonymous | storage: `assets/countdown/frames/{ID}/operations` get | deny | — | — | deny | pendiente |
| 4b2b-frames-operation-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/operations/op/attempt` create | deny | — | — | deny | cumple |
| 4b2b-frames-operation-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/operations/op/attempt` update | deny | — | — | deny | cumple |
| 4b2b-frames-operation-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/operations/op/attempt` delete | deny | — | — | deny | cumple |
| 4b2b-frames-operation-A-create | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/operations/op/attempt` create | deny | — | — | deny | cumple |
| 4b2b-frames-operation-A-update | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/operations/op/attempt` update | deny | — | — | deny | cumple |
| 4b2b-frames-operation-A-delete | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/operations/op/attempt` delete | deny | — | — | deny | cumple |
| 4b2b-frames-operation-admin-create | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/operations/op/attempt` create | deny | — | — | deny | cumple |
| 4b2b-frames-operation-admin-update | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/operations/op/attempt` update | deny | — | — | deny | cumple |
| 4b2b-frames-operation-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/operations/op/attempt` delete | deny | — | — | deny | cumple |
| 4b2b-frames-operation-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/operations/op/attempt` create | deny | — | — | deny | cumple |
| 4b2b-frames-operation-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/operations/op/attempt` update | deny | — | — | deny | cumple |
| 4b2b-frames-operation-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/operations/op/attempt` delete | deny | — | — | deny | cumple |
| 4b2b-frames-operation-role-create | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/operations/op/attempt` create | deny | — | — | deny | cumple |
| 4b2b-frames-operation-role-update | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/operations/op/attempt` update | deny | — | — | deny | cumple |
| 4b2b-frames-operation-role-delete | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/operations/op/attempt` delete | deny | — | — | deny | cumple |
| 4b2b-frames-operation-A-get | characterization / C1 | A | storage: `assets/countdown/frames/{ID}/operations/op/attempt` get | allow | — | — | allow | pendiente |
| 4b2b-frames-operation-anonymous-get | characterization / C1 | anonymous | storage: `assets/countdown/frames/{ID}/operations/op/attempt` get | deny | — | — | deny | pendiente |
| 4b2b-frames-svg-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-frames-svg-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-frames-svg-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-frames-svg-A-create | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-frames-svg-A-update | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-frames-svg-A-delete | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-frames-svg-admin-create | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-frames-svg-admin-update | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-frames-svg-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-frames-svg-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-frames-svg-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-frames-svg-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-frames-svg-role-create | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-frames-svg-role-update | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-frames-svg-role-delete | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-frames-svg-A-get | characterization / C1 | A | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/frame.svg` get | allow | — | — | allow | pendiente |
| 4b2b-frames-svg-anonymous-get | characterization / C1 | anonymous | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/frame.svg` get | deny | — | — | deny | pendiente |
| 4b2b-frames-png-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-frames-png-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-frames-png-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-frames-png-A-create | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-frames-png-A-update | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-frames-png-A-delete | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-frames-png-admin-create | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-frames-png-admin-update | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-frames-png-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-frames-png-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-frames-png-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-frames-png-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-frames-png-role-create | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-frames-png-role-update | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-frames-png-role-delete | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-frames-png-A-get | characterization / C1 | A | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/thumbnail.png` get | allow | — | — | allow | pendiente |
| 4b2b-frames-png-anonymous-get | characterization / C1 | anonymous | storage: `assets/countdown/frames/{ID}/operations/op/attempt/nested/thumbnail.png` get | deny | — | — | deny | pendiente |
| 4b2b-frames-legacy-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-frames-legacy-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-frames-legacy-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-frames-legacy-A-create | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-frames-legacy-A-update | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-frames-legacy-A-delete | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-frames-legacy-admin-create | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-frames-legacy-admin-update | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-frames-legacy-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/frames/{ID}/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-frames-legacy-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-frames-legacy-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-frames-legacy-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/frames/{ID}/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-frames-legacy-role-create | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-frames-legacy-role-update | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-frames-legacy-role-delete | acceptance / A4 | role | storage: `assets/countdown/frames/{ID}/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-frames-legacy-A-get | characterization / C1 | A | storage: `assets/countdown/frames/{ID}/frame.svg` get | allow | — | — | allow | pendiente |
| 4b2b-frames-legacy-anonymous-get | characterization / C1 | anonymous | storage: `assets/countdown/frames/{ID}/frame.svg` get | deny | — | — | deny | pendiente |
| 4b2b-frames-published-list | characterization / C1 | A | storage: `assets/countdown/frames/{ID}/operations` list | allow | — | — | allow | pendiente |
| 4b2b-thumbnails-family-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-family-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-family-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-family-A-create | acceptance / A4 | A | storage: `assets/countdown/thumbnails` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-family-A-update | acceptance / A4 | A | storage: `assets/countdown/thumbnails` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-family-A-delete | acceptance / A4 | A | storage: `assets/countdown/thumbnails` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-family-admin-create | acceptance / A4 | admin | storage: `assets/countdown/thumbnails` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-family-admin-update | acceptance / A4 | admin | storage: `assets/countdown/thumbnails` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-family-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/thumbnails` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-family-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-family-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-family-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-family-role-create | acceptance / A4 | role | storage: `assets/countdown/thumbnails` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-family-role-update | acceptance / A4 | role | storage: `assets/countdown/thumbnails` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-family-role-delete | acceptance / A4 | role | storage: `assets/countdown/thumbnails` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-family-A-get | characterization / C1 | A | storage: `assets/countdown/thumbnails` get | allow | — | — | allow | pendiente |
| 4b2b-thumbnails-family-anonymous-get | characterization / C1 | anonymous | storage: `assets/countdown/thumbnails` get | deny | — | — | deny | pendiente |
| 4b2b-thumbnails-preset-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-preset-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-preset-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-preset-A-create | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-preset-A-update | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-preset-A-delete | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-preset-admin-create | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-preset-admin-update | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-preset-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-preset-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-preset-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-preset-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-preset-role-create | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-preset-role-update | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-preset-role-delete | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-preset-A-get | characterization / C1 | A | storage: `assets/countdown/thumbnails/{ID}` get | allow | — | — | allow | pendiente |
| 4b2b-thumbnails-preset-anonymous-get | characterization / C1 | anonymous | storage: `assets/countdown/thumbnails/{ID}` get | deny | — | — | deny | pendiente |
| 4b2b-thumbnails-operation-prefix-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/operations` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-prefix-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/operations` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-prefix-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/operations` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-prefix-A-create | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/operations` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-prefix-A-update | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/operations` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-prefix-A-delete | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/operations` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-prefix-admin-create | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/operations` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-prefix-admin-update | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/operations` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-prefix-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/operations` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-prefix-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/operations` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-prefix-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/operations` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-prefix-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/operations` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-prefix-role-create | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/operations` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-prefix-role-update | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/operations` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-prefix-role-delete | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/operations` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-prefix-A-get | characterization / C1 | A | storage: `assets/countdown/thumbnails/{ID}/operations` get | allow | — | — | allow | pendiente |
| 4b2b-thumbnails-operation-prefix-anonymous-get | characterization / C1 | anonymous | storage: `assets/countdown/thumbnails/{ID}/operations` get | deny | — | — | deny | pendiente |
| 4b2b-thumbnails-operation-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-A-create | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-A-update | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-A-delete | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-admin-create | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-admin-update | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-role-create | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-role-update | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-role-delete | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-operation-A-get | characterization / C1 | A | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt` get | allow | — | — | allow | pendiente |
| 4b2b-thumbnails-operation-anonymous-get | characterization / C1 | anonymous | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt` get | deny | — | — | deny | pendiente |
| 4b2b-thumbnails-svg-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-svg-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-svg-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-svg-A-create | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-svg-A-update | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-svg-A-delete | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-svg-admin-create | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-svg-admin-update | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-svg-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-svg-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-svg-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-svg-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-svg-role-create | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-svg-role-update | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-svg-role-delete | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-svg-A-get | characterization / C1 | A | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/frame.svg` get | allow | — | — | allow | pendiente |
| 4b2b-thumbnails-svg-anonymous-get | characterization / C1 | anonymous | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/frame.svg` get | deny | — | — | deny | pendiente |
| 4b2b-thumbnails-png-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-png-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-png-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-png-A-create | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-png-A-update | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-png-A-delete | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-png-admin-create | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-png-admin-update | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-png-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-png-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-png-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-png-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-png-role-create | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/thumbnail.png` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-png-role-update | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/thumbnail.png` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-png-role-delete | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/thumbnail.png` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-png-A-get | characterization / C1 | A | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/thumbnail.png` get | allow | — | — | allow | pendiente |
| 4b2b-thumbnails-png-anonymous-get | characterization / C1 | anonymous | storage: `assets/countdown/thumbnails/{ID}/operations/op/attempt/nested/thumbnail.png` get | deny | — | — | deny | pendiente |
| 4b2b-thumbnails-legacy-anonymous-create | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-legacy-anonymous-update | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-legacy-anonymous-delete | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-legacy-A-create | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-legacy-A-update | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-legacy-A-delete | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-legacy-admin-create | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-legacy-admin-update | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-legacy-admin-delete | acceptance / A4 | admin | storage: `assets/countdown/thumbnails/{ID}/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-legacy-superclaim-create | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-legacy-superclaim-update | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-legacy-superclaim-delete | acceptance / A4 | superclaim | storage: `assets/countdown/thumbnails/{ID}/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-legacy-role-create | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/frame.svg` create | deny | — | — | deny | cumple |
| 4b2b-thumbnails-legacy-role-update | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/frame.svg` update | deny | — | — | deny | cumple |
| 4b2b-thumbnails-legacy-role-delete | acceptance / A4 | role | storage: `assets/countdown/thumbnails/{ID}/frame.svg` delete | deny | — | — | deny | cumple |
| 4b2b-thumbnails-legacy-A-get | characterization / C1 | A | storage: `assets/countdown/thumbnails/{ID}/frame.svg` get | allow | — | — | allow | pendiente |
| 4b2b-thumbnails-legacy-anonymous-get | characterization / C1 | anonymous | storage: `assets/countdown/thumbnails/{ID}/frame.svg` get | deny | — | — | deny | pendiente |
| 4b2b-thumbnails-published-list | characterization / C1 | A | storage: `assets/countdown/thumbnails/{ID}/operations` list | allow | — | — | allow | pendiente |
| 4b2b-ancestor-assets-anonymous-list | acceptance / A4 | anonymous | storage: `assets` list | deny | — | — | deny | cumple |
| 4b2b-ancestor-assets-A-list | acceptance / A4 | A | storage: `assets` list | deny | — | — | deny | cumple |
| 4b2b-ancestor-assets-B-list | acceptance / A4 | B | storage: `assets` list | deny | — | — | deny | cumple |
| 4b2b-ancestor-assets-admin-list | characterization / C1 | admin | storage: `assets` list | allow | — | — | allow | pendiente |
| 4b2b-ancestor-countdown-anonymous-list | acceptance / A4 | anonymous | storage: `assets/countdown` list | deny | — | — | deny | cumple |
| 4b2b-ancestor-countdown-A-list | acceptance / A4 | A | storage: `assets/countdown` list | deny | — | — | deny | cumple |
| 4b2b-ancestor-countdown-B-list | acceptance / A4 | B | storage: `assets/countdown` list | deny | — | — | deny | cumple |
| 4b2b-ancestor-countdown-admin-list | characterization / C1 | admin | storage: `assets/countdown` list | allow | — | — | allow | pendiente |
| 4b2b-ancestor-frames-anonymous-list | acceptance / A4 | anonymous | storage: `assets/countdown/frames` list | deny | — | — | deny | cumple |
| 4b2b-ancestor-frames-A-list | acceptance / A4 | A | storage: `assets/countdown/frames` list | deny | — | — | deny | cumple |
| 4b2b-ancestor-frames-B-list | acceptance / A4 | B | storage: `assets/countdown/frames` list | deny | — | — | deny | cumple |
| 4b2b-ancestor-frames-admin-list | characterization / C1 | admin | storage: `assets/countdown/frames` list | allow | — | — | allow | pendiente |
| 4b2b-ancestor-frame-preset-anonymous-list | acceptance / A4 | anonymous | storage: `assets/countdown/frames/{ID}` list | deny | — | — | deny | cumple |
| 4b2b-ancestor-frame-preset-A-list | acceptance / A4 | A | storage: `assets/countdown/frames/{ID}` list | deny | — | — | deny | cumple |
| 4b2b-ancestor-frame-preset-B-list | acceptance / A4 | B | storage: `assets/countdown/frames/{ID}` list | deny | — | — | deny | cumple |
| 4b2b-ancestor-frame-preset-admin-list | characterization / C1 | admin | storage: `assets/countdown/frames/{ID}` list | allow | — | — | allow | pendiente |
| 4b2b-ancestor-thumbnails-anonymous-list | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails` list | deny | — | — | deny | cumple |
| 4b2b-ancestor-thumbnails-A-list | acceptance / A4 | A | storage: `assets/countdown/thumbnails` list | deny | — | — | deny | cumple |
| 4b2b-ancestor-thumbnails-B-list | acceptance / A4 | B | storage: `assets/countdown/thumbnails` list | deny | — | — | deny | cumple |
| 4b2b-ancestor-thumbnails-admin-list | characterization / C1 | admin | storage: `assets/countdown/thumbnails` list | allow | — | — | allow | pendiente |
| 4b2b-ancestor-thumbnail-preset-anonymous-list | acceptance / A4 | anonymous | storage: `assets/countdown/thumbnails/{ID}` list | deny | — | — | deny | cumple |
| 4b2b-ancestor-thumbnail-preset-A-list | acceptance / A4 | A | storage: `assets/countdown/thumbnails/{ID}` list | deny | — | — | deny | cumple |
| 4b2b-ancestor-thumbnail-preset-B-list | acceptance / A4 | B | storage: `assets/countdown/thumbnails/{ID}` list | deny | — | — | deny | cumple |
| 4b2b-ancestor-thumbnail-preset-admin-list | characterization / C1 | admin | storage: `assets/countdown/thumbnails/{ID}` list | allow | — | — | allow | pendiente |
| 4b2b-residual-other-assets-get | characterization / C1 | A | storage: `assets/other-catalog/{ID}/file.png` get | allow | — | — | allow | pendiente |
| 4b2b-residual-other-assets-create | characterization / C1 | A | storage: `assets/other-catalog/{ID}/file.png` create | allow | — | — | allow | pendiente |
| 4b2b-residual-other-assets-update | characterization / C1 | A | storage: `assets/other-catalog/{ID}/file.png` update | allow | — | — | allow | pendiente |
| 4b2b-residual-other-assets-delete | characterization / C1 | A | storage: `assets/other-catalog/{ID}/file.png` delete | allow | — | — | allow | pendiente |
| 4b2b-residual-similar-name-get | characterization / C1 | A | storage: `assets/countdown_legacy/{ID}.svg` get | allow | — | — | allow | pendiente |
| 4b2b-residual-similar-name-create | characterization / C1 | A | storage: `assets/countdown_legacy/{ID}.svg` create | allow | — | — | allow | pendiente |
| 4b2b-residual-similar-name-update | characterization / C1 | A | storage: `assets/countdown_legacy/{ID}.svg` update | allow | — | — | allow | pendiente |
| 4b2b-residual-similar-name-delete | characterization / C1 | A | storage: `assets/countdown_legacy/{ID}.svg` delete | allow | — | — | allow | pendiente |
| 4b2b-residual-unmodeled-countdown-get | characterization / C1 | A | storage: `assets/countdown/unmodeled/{ID}.png` get | allow | — | — | allow | pendiente |
| 4b2b-residual-unmodeled-countdown-create | characterization / C1 | A | storage: `assets/countdown/unmodeled/{ID}.png` create | allow | — | — | allow | pendiente |
| 4b2b-residual-unmodeled-countdown-update | characterization / C1 | A | storage: `assets/countdown/unmodeled/{ID}.png` update | allow | — | — | allow | pendiente |
| 4b2b-residual-unmodeled-countdown-delete | characterization / C1 | A | storage: `assets/countdown/unmodeled/{ID}.png` delete | allow | — | — | allow | pendiente |
| 4b2b-residual-assets-object-get | characterization / C1 | A | storage: `assets` get | allow | — | — | allow | pendiente |
| 4b2b-residual-assets-object-create | characterization / C1 | A | storage: `assets` create | allow | — | — | allow | pendiente |
| 4b2b-residual-assets-object-update | characterization / C1 | A | storage: `assets` update | allow | — | — | allow | pendiente |
| 4b2b-residual-assets-object-delete | characterization / C1 | A | storage: `assets` delete | allow | — | — | allow | pendiente |
| 4b2b-residual-countdown-object-get | characterization / C1 | A | storage: `assets/countdown` get | allow | — | — | allow | pendiente |
| 4b2b-residual-countdown-object-create | characterization / C1 | A | storage: `assets/countdown` create | allow | — | — | allow | pendiente |
| 4b2b-residual-countdown-object-update | characterization / C1 | A | storage: `assets/countdown` update | allow | — | — | allow | pendiente |
| 4b2b-residual-countdown-object-delete | characterization / C1 | A | storage: `assets/countdown` delete | allow | — | — | allow | pendiente |
| 4b2b-other-assets-list | characterization / C1 | A | storage: `assets/other-catalog` list | allow | — | — | allow | pendiente |
