# Línea base efectiva de Rules — FASE 4B1

Status: Testing Baseline; evidencia local, no aprobación de permisos.

Fecha UTC: 2026-09-11T13:41:29.255Z. Sesión: `session-lxNRm0`.
Comando ejecutado: `node scripts/local/runLocal.cjs rules`, implementación de
`npm run test:local:rules`. Código de salida **1**, esperado por violaciones
de obligaciones vigentes. Rules productivas del árbol de trabajo **sin cambios**.

Proyecto `demo-reservaeldia-local`; bucket `demo-reservaeldia-local.appspot.com`.
Auth 127.0.0.1:19099; Firestore 127.0.0.1:18080; Functions 127.0.0.1:15001;
Storage 127.0.0.1:19199. Mismo recorrido 4A, sin Next ni seed de desarrollo.

[Autoridades y matriz](../contracts/SECURITY_CONTRACT.md#accepted-obligations),
[Q1 propuesto](../contracts/SECURITY_CONTRACT.md#q1-proposal),
[runbook](../operations/DEVELOPMENT_WORKFLOW.md#rules-4b1),
[casos](../../scripts/local/rulesCases.mjs), [runner](../../scripts/local/rules.test.mjs).

## Identidad de fuentes

| Archivo | SHA-256 del archivo consumido |
| --- | --- |
| `firestore.rules` | `2f6effc016c8640a0faeaa1425ad396a2f7b26a9e0548fb221d611ab783bca3a` |
| `storage.rules` | `bb8224303fd2ee57a00bceee1bde95d5c545b1785ada22b6d79b9af2930c492a` |
| `scripts/local/rules.test.mjs` | `dae96d99e41daa6578e2bfb9b82e76f0ed59bd68433195f1ebd8399258a22554` |
| `scripts/local/rulesCases.mjs` | `319f65d107505b92132c49fcf0f8103f86c96c8be7cd0f807a02697dd90c651d` |
| `functions/src/auth/adminAuth.ts` | `590d95830639f6624d6088e2a38898babfa18e96fc25dd8911ed29f6961be793` |
| `scripts/local/functionsEntry.cjs` | `cbcd877ba5e5686b60c35b0cb95ef00d6fd7e433b4ed555f60df227da45fb591` |

Versiones ejecutadas: Node v22.13.1, Firebase CLI 14.4.0,
Java 25.0.2, Firebase cliente 11.7.3, Admin 13.4.0, Firestore emulator 1.19.8,
Storage Rules runtime 1.1.3. Node 20 y otras versiones no se ejecutaron.

## Resultado

| Grupo | Ejecutados | Coinciden con esperado | Difieren | Errores de infraestructura en casos |
| --- | ---: | ---: | ---: | ---: |
| acceptance | 157 | 78 | 79 | 0 |
| characterization | 147 | 147 | 0 | 0 |
| proposal | 12 | 2 | 10 | 0 |

**316 casos ejecutados, 0 omitidos/cancelados.** Node TAP informa 237 aprobados
y 79 fallidos: los 12 probes propuestos sólo exigen una observación válida, no
aceptación normativa (10 difieren del target propuesto, 2 coinciden). Los 147
casos C verdes reproducen conducta actual, incluidos grants inseguros.

300 operaciones reales de Rules: **178 Firestore y 122 Storage**. Los otros
16 casos son helpers puros de backend (12 C y 4 Q), explícitamente distintos
de Rules. Las 79 violaciones A se distribuyen en **46 Firestore y 33 Storage**.
No hubo errores de fixtures, transporte, permisos de infraestructura o limpieza
en los 316 casos de esta corrida; manifest y hashes se verificaron antes/después.

Prechecks propios: `npm run local:check` pasó; `npm run test:local:unit`
pasó 12/12. Build TypeScript y sincronización se ejecutaron en copia temporal.

## Intentos previos y cierre

| Intento | Resultado y clasificación |
| --- | --- |
| rules-run-1, session-nWr01K | Arranque: discovery de Functions excedió 10 segundos; runner no se inició. Cierre del hijo bloqueado por sandbox; Java residual se identificó por PID/padre/ruta propia y se detuvo con permiso. No cuenta como deny ni prueba de Rules. |
| rules-run-2 | Precheck rechazó puerto 18080 ocupado por ese residual; no se creó nueva sesión ni se ejecutaron casos. |
| rules-run-3, session-WC9AbS | Arranque correcto; hook de la suite esperaba incorrectamente HTTP 412 en callable bloqueado, que responde 400/FAILED_PRECONDITION. 316 tests reportados hookFailed, **0 operaciones de autorización ejecutadas**. Se corrigió sólo ese precheck, sin modificar wrapper/Rules. |
| rules-run-4, session-c2ge2s | Primera corrida completa: 316 casos, 79 fallos A y cero errores de infraestructura en casos. |
| rules-run-5, session-lxNRm0 | Corrida final de fuentes actuales con perfiles Q completos y fixture de generación; 316 casos, mismos 79 fallos A, salida 1. |

El log de rules-run-4 imprimió salida fatal del proceso Firestore **durante la detención
del árbol propio**, después de terminar TAP y escribir evidencia. No ocurrió
durante un caso ni se contó como denegación. El marcador quedó stopped=true y
se comprobó que todos los puertos dedicados quedaron libres. No se cerraron
procesos ajenos ni se tocaron sesiones preexistentes. La corrida final rules-run-5
terminó sin ese aviso de cierre.

Evidencia cruda preservada tras limpiar las copias temporales:
`.local-isolation/phase4b1/evidence/session-lxNRm0/rules-evidence.json`,
`rules-source.json` y `session.json`; logs propios en `.local-isolation/phase4b1/`.
También se conservaron los reportes/marcadores de intentos previos. Las cuatro
sesiones creadas por esta tarea se eliminaron con el limpiador de 4A. Un directorio
Java vacío de la primera sesión devolvió EPERM desde el contexto elevado; se
completó su limpieza desde el contexto sandbox propietario, sin cambiar ACLs.
El documento presente conserva la evidencia mínima por caso. Datos y bytes son sintéticos;
no contiene tokens firmados, identidades remotas ni valores de configuración personal.

Preservación: SHA-256 de los 11.208 archivos iniciales comprobado; 11.202 idénticos,
seis editados dentro del alcance, ninguno eliminado ni cambiado fuera de alcance.
Los tres deltas de tooling se reconstruyeron inversamente hasta el hash inicial;
los tres documentos editados tienen snapshot inicial y diff exclusivo de esta
tarea en `.local-isolation/phase4b1/task-only.diff`. Cuatro archivos nuevos:
contrato de seguridad, esta línea base, catálogo de casos y runner de Rules.
`git diff --check` y sintaxis de los cuatro scripts alcanzados pasaron; 316
referencias locales/anchors comprobados sin faltantes. La repetición final de
`test:local:unit` dio 12/12. Escaneo de patrones de claves/tokens sobre archivos
nuevos sin hallazgos, complementado con revisión de fixtures sintéticas.

## Interpretación y exclusiones

A1–A4 enlazan obligaciones vigentes. C1 observa Rules actuales, C2 helpers de
backend; Q1 es propuesta sin aceptación. La clasificación “pendiente de política”
de C/Q **no declara seguro el permiso**; la columna coincidencia indica si se
reprodujo la expectativa descriptiva o si el target Q todavía difiere.

La suite usa mockUserToken del SDK cliente. Admin sólo prepara y limpia fixtures
por paths exactos; nunca autoriza la operación evaluada. Lecturas exigen existencia
y queries no vacías en servidor. Sólo permission-denied/storage/unauthorized
cuentan como deny. N es sin request.auth; no equivale a Auth anonymous con UID.

Las pruebas públicas de catálogo/proveedor son C: preservan lo observado, sin
resolver la política de recursos compartidos ni la proyección pública del proveedor.
La entrega pública de invitaciones explícitamente autorizada por contrato es
HTTP; **no ejecutada** porque el handler sigue bloqueado. Tampoco se ejecutaron
URL token/firmada, GCS/IAM, proveedores operativos, pagos/IA/correo, triggers,
schedulers, collectionGroup global, UI desktop/mobile, Node 20 ni test:local
integral. No hubo despliegue, migración, commit ni acceso a proyecto remoto.

Probes Q sólo comparan la representación administrativa propuesta contra los
helpers actuales; no prueban emisión/revocación, red.rev, capacidades completas,
concurrencia de claims ni transición. Esos tests dependen de resolución de Q1.

## Identidades sintéticas

`{RUN}` sustituye exactamente `rules4b1-ed49f6c2-703c-449b-bcbb-79be7806351d` en las tablas;
UIDs/paths distintos por caso son derivados de ese UUID, no de datos reales.

| Identidad | Token mock (sin firma; sólo emulador) |
| --- | --- |
| anonymous | `null` |
| A | `{"sub":"{A}"}` |
| B | `{"sub":"{B}"}` |
| admin | `{"sub":"{ADMIN}","admin":true}` |
| superclaim | `{"sub":"{ADMIN}","superadmin":true}` |
| role | `{"sub":"{ADMIN}","role":"admin"}` |
| stringAdmin | `{"sub":"{ADMIN}","admin":"true"}` |
| serverSuper | `{"sub":"{SUPER}"}` |
| canonicalAdmin | `{"sub":"{ADMIN}","red":{"v":1,"rev":1,"role":"admin","capabilities":{"catalogManage":true,"templateEdit":true}}}` |
| canonicalSuper | `{"sub":"{ADMIN}","red":{"v":1,"rev":1,"role":"superadmin","capabilities":{"catalogManage":true,"templateEdit":true,"templatePublish":true,"templateDelete":true,"siteManage":true,"pricingManage":true,"analyticsReadExport":true,"analyticsOperate":true,"userSupport":true,"designerAiUse":true,"accessManage":true}}}` |

En claims, {A}={RUN}-a, {B}={RUN}-b, {ADMIN}={RUN}-admin,
{SUPER}={RUN}-server-super. Sólo probes de helpers reciben temporalmente
SUPERADMINS_UIDS={SUPER}; esa configuración no se propaga al emulador.

| Autoridad | Fuente |
| --- | --- |
| A1 | docs/architecture/ARCHITECTURE_GUIDELINES.md#43-security-first (ownership) |
| A2 | docs/contracts/CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md (backend publication / visit authority) |
| A3 | docs/architecture/PROVIDER_DATA_MODEL.md#7-security-and-public-projection-decision (non-admin writes forbidden) |
| A4 | docs/architecture/DATA_MODEL.md#countdownpresets (administrative draft; immutable published versions) |
| C1 | firestore.rules / storage.rules (observed, not policy acceptance) |
| C2 | functions/src/auth/adminAuth.ts (observed, not policy acceptance) |
| Q1 | docs/contracts/SECURITY_CONTRACT.md#q1-proposal (proposed; Q1 unresolved) |

## Casos acceptance

| Caso | Identidad | Canal | Recurso | Operación | Esperado / autoridad | Observado | Clasificación | Coincide |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| profile-owner-get | A | firestore | `usuarios/{RUN}-a` | get | allow / A1 | allow | cumple | sí |
| profile-cross-get | B | firestore | `usuarios/{RUN}-a` | get | deny / A1 | allow | vulnera | no |
| profile-anonymous-get | anonymous | firestore | `usuarios/{RUN}-a` | get | deny / A1 | deny (permission-denied) | cumple | sí |
| profile-cross-create | B | firestore | `usuarios/{RUN}-a` | create | deny / A1 | allow | vulnera | no |
| profile-cross-update | B | firestore | `usuarios/{RUN}-a` | update | deny / A1 | allow | vulnera | no |
| profile-cross-delete | B | firestore | `usuarios/{RUN}-a` | delete | deny / A1 | allow | vulnera | no |
| profile-unfiltered-list | A | firestore | `usuarios` | list | deny / A1 | allow | vulnera | no |
| image-owner-get | A | firestore | `usuarios/{RUN}-a/imagenes/{RUN}-image-owner-get` | get | allow / A1 | allow | cumple | sí |
| image-cross-get | B | firestore | `usuarios/{RUN}-a/imagenes/{RUN}-image-cross-get` | get | deny / A1 | allow | vulnera | no |
| image-anonymous-get | anonymous | firestore | `usuarios/{RUN}-a/imagenes/{RUN}-image-anonymous-get` | get | deny / A1 | deny (permission-denied) | cumple | sí |
| image-cross-create | B | firestore | `usuarios/{RUN}-a/imagenes/{RUN}-image-cross-create` | create | deny / A1 | allow | vulnera | no |
| image-cross-update | B | firestore | `usuarios/{RUN}-a/imagenes/{RUN}-image-cross-update` | update | deny / A1 | allow | vulnera | no |
| image-cross-delete | B | firestore | `usuarios/{RUN}-a/imagenes/{RUN}-image-cross-delete` | delete | deny / A1 | allow | vulnera | no |
| image-A-list | A | firestore | `usuarios/{RUN}-a/imagenes` | list | allow / A1 | allow | cumple | sí |
| image-B-list | B | firestore | `usuarios/{RUN}-a/imagenes` | list | deny / A1 | allow | vulnera | no |
| draft-owner-get | A | firestore | `borradores/{RUN}-draft-owner-get` | get | allow / A1 | allow | cumple | sí |
| draft-cross-get | B | firestore | `borradores/{RUN}-draft-cross-get` | get | deny / A1 | deny (permission-denied) | cumple | sí |
| draft-anonymous-get | anonymous | firestore | `borradores/{RUN}-draft-anonymous-get` | get | deny / A1 | deny (permission-denied) | cumple | sí |
| draft-cross-create | B | firestore | `borradores/{RUN}-draft-cross-create` | create | deny / A1 | deny (permission-denied) | cumple | sí |
| draft-cross-update | B | firestore | `borradores/{RUN}-draft-cross-update` | update | deny / A1 | deny (permission-denied) | cumple | sí |
| draft-cross-delete | B | firestore | `borradores/{RUN}-draft-cross-delete` | delete | deny / A1 | deny (permission-denied) | cumple | sí |
| draft-owner-list | A | firestore | `borradores` filtros: [["userId","==","{A}"]] | list | allow / A1 | allow | cumple | sí |
| draft-unfiltered-list | A | firestore | `borradores` | list | deny / A1 | deny (permission-denied) | cumple | sí |
| draft-foreign-filter | A | firestore | `borradores` filtros: [["userId","==","{B}"]] | list | deny / A1 | deny (permission-denied) | cumple | sí |
| publication-owner-get | A | firestore | `publicadas/{RUN}-publication-owner-get` | get | allow / A1 | allow | cumple | sí |
| publication-cross-get | B | firestore | `publicadas/{RUN}-publication-cross-get` | get | deny / A1 | allow | vulnera | no |
| publication-anonymous-get | anonymous | firestore | `publicadas/{RUN}-publication-anonymous-get` | get | deny / A1 | deny (permission-denied) | cumple | sí |
| publication-cross-create | B | firestore | `publicadas/{RUN}-publication-cross-create` | create | deny / A1 | allow | vulnera | no |
| publication-cross-update | B | firestore | `publicadas/{RUN}-publication-cross-update` | update | deny / A1 | allow | vulnera | no |
| publication-cross-delete | B | firestore | `publicadas/{RUN}-publication-cross-delete` | delete | deny / A1 | allow | vulnera | no |
| publication-owner-list | A | firestore | `publicadas` filtros: [["userId","==","{A}"]] | list | allow / A1 | allow | cumple | sí |
| publication-unfiltered-list | A | firestore | `publicadas` | list | deny / A1 | allow | vulnera | no |
| publication-foreign-filter | A | firestore | `publicadas` filtros: [["userId","==","{B}"]] | list | deny / A1 | allow | vulnera | no |
| history-owner-get | A | firestore | `publicadas_historial/{RUN}-history-owner-get` | get | allow / A1 | allow | cumple | sí |
| history-cross-get | B | firestore | `publicadas_historial/{RUN}-history-cross-get` | get | deny / A1 | allow | vulnera | no |
| history-anonymous-get | anonymous | firestore | `publicadas_historial/{RUN}-history-anonymous-get` | get | deny / A1 | deny (permission-denied) | cumple | sí |
| history-cross-create | B | firestore | `publicadas_historial/{RUN}-history-cross-create` | create | deny / A1 | allow | vulnera | no |
| history-cross-update | B | firestore | `publicadas_historial/{RUN}-history-cross-update` | update | deny / A1 | allow | vulnera | no |
| history-cross-delete | B | firestore | `publicadas_historial/{RUN}-history-cross-delete` | delete | deny / A1 | allow | vulnera | no |
| history-owner-list | A | firestore | `publicadas_historial` filtros: [["userId","==","{A}"]] | list | allow / A1 | allow | cumple | sí |
| history-unfiltered-list | A | firestore | `publicadas_historial` | list | deny / A1 | allow | vulnera | no |
| history-foreign-filter | A | firestore | `publicadas_historial` filtros: [["userId","==","{B}"]] | list | deny / A1 | allow | vulnera | no |
| draft-owner-create | A | firestore | `borradores/{RUN}-draft-owner-create` | create | allow / A1 | allow | cumple | sí |
| image-owner-create | A | firestore | `usuarios/{RUN}-a/imagenes/{RUN}-image-owner-create` | create | allow / A1 | allow | cumple | sí |
| draft-owner-update | A | firestore | `borradores/{RUN}-draft-owner-update` | update | allow / A1 | allow | cumple | sí |
| image-owner-update | A | firestore | `usuarios/{RUN}-a/imagenes/{RUN}-image-owner-update` | update | allow / A1 | allow | cumple | sí |
| draft-owner-delete | A | firestore | `borradores/{RUN}-draft-owner-delete` | delete | allow / A1 | allow | cumple | sí |
| image-owner-delete | A | firestore | `usuarios/{RUN}-a/imagenes/{RUN}-image-owner-delete` | delete | allow / A1 | allow | cumple | sí |
| draft-change-owner | A | firestore | `borradores/{RUN}-draft-change-owner` | update | deny / A1 | deny (permission-denied) | cumple | sí |
| draft-remove-owner | A | firestore | `borradores/{RUN}-draft-remove-owner` | update (eliminar userId) | deny / A1 | deny (permission-denied) | cumple | sí |
| draft-spoof-create | A | firestore | `borradores/{RUN}-draft-spoof-create` | create | deny / A1 | deny (permission-denied) | cumple | sí |
| publication-change-owner | A | firestore | `publicadas/{RUN}-publication-change-owner` | update | deny / A1 | allow | vulnera | no |
| history-change-owner | A | firestore | `publicadas_historial/{RUN}-history-change-owner` | update | deny / A1 | allow | vulnera | no |
| profile-cross-owner-field | B | firestore | `usuarios/{RUN}-a` | update | deny / A1 | allow | vulnera | no |
| rsvps-cross-get | B | firestore | `publicadas/{RUN}-rsvps-cross-get/rsvps/event` | get | deny / A1 | allow | vulnera | no |
| rsvps-cross-update | B | firestore | `publicadas/{RUN}-rsvps-cross-update/rsvps/event` | update | deny / A1 | allow | vulnera | no |
| rsvps-owner-list | A | firestore | `publicadas/{RUN}-rsvps-owner-list/rsvps` | list | allow / A1 | allow | cumple | sí |
| rsvps-cross-list | B | firestore | `publicadas/{RUN}-rsvps-cross-list/rsvps` | list | deny / A1 | allow | vulnera | no |
| visits-cross-get | B | firestore | `publicadas/{RUN}-visits-cross-get/visits/event` | get | deny / A1 | allow | vulnera | no |
| visits-cross-update | B | firestore | `publicadas/{RUN}-visits-cross-update/visits/event` | update | deny / A1 | allow | vulnera | no |
| visits-owner-create | A | firestore | `publicadas/{RUN}-visits-owner-create/visits/event` | create | deny / A2 | allow | vulnera | no |
| visits-owner-update | A | firestore | `publicadas/{RUN}-visits-owner-update/visits/event` | update | deny / A2 | allow | vulnera | no |
| visits-owner-delete | A | firestore | `publicadas/{RUN}-visits-owner-delete/visits/event` | delete | deny / A2 | allow | vulnera | no |
| uniqueVisitors-cross-get | B | firestore | `publicadas/{RUN}-uniqueVisitors-cross-get/uniqueVisitors/event` | get | deny / A1 | allow | vulnera | no |
| uniqueVisitors-cross-update | B | firestore | `publicadas/{RUN}-uniqueVisitors-cross-update/uniqueVisitors/event` | update | deny / A1 | allow | vulnera | no |
| uniqueVisitors-owner-create | A | firestore | `publicadas/{RUN}-uniqueVisitors-owner-create/uniqueVisitors/event` | create | deny / A2 | allow | vulnera | no |
| uniqueVisitors-owner-update | A | firestore | `publicadas/{RUN}-uniqueVisitors-owner-update/uniqueVisitors/event` | update | deny / A2 | allow | vulnera | no |
| uniqueVisitors-owner-delete | A | firestore | `publicadas/{RUN}-uniqueVisitors-owner-delete/uniqueVisitors/event` | delete | deny / A2 | allow | vulnera | no |
| publication-owner-create | A | firestore | `publicadas/{RUN}-publication-owner-create` | create | deny / A2 | allow | vulnera | no |
| checkout-owner-create | A | firestore | `publication_checkout_sessions/{RUN}-checkout-owner-create` | create | deny / A2 | deny (permission-denied) | cumple | sí |
| publication-owner-update | A | firestore | `publicadas/{RUN}-publication-owner-update` | update | deny / A2 | allow | vulnera | no |
| checkout-owner-update | A | firestore | `publication_checkout_sessions/{RUN}-checkout-owner-update` | update | deny / A2 | deny (permission-denied) | cumple | sí |
| publication-owner-delete | A | firestore | `publicadas/{RUN}-publication-owner-delete` | delete | deny / A2 | allow | vulnera | no |
| checkout-owner-delete | A | firestore | `publication_checkout_sessions/{RUN}-checkout-owner-delete` | delete | deny / A2 | deny (permission-denied) | cumple | sí |
| countdown-private-draft | A | firestore | `countdownPresets/{RUN}-countdown-private-draft` | get | deny / A4 | allow | vulnera | no |
| countdown-immutable-A-update | A | firestore | `countdownPresets/{RUN}-countdown-immutable-A-update/versions/1` | update | deny / A4 | allow | vulnera | no |
| countdown-immutable-A-delete | A | firestore | `countdownPresets/{RUN}-countdown-immutable-A-delete/versions/1` | delete | deny / A4 | allow | vulnera | no |
| countdown-immutable-admin-update | admin | firestore | `countdownPresets/{RUN}-countdown-immutable-admin-update/versions/1` | update | deny / A4 | allow | vulnera | no |
| countdown-immutable-admin-delete | admin | firestore | `countdownPresets/{RUN}-countdown-immutable-admin-delete/versions/1` | delete | deny / A4 | allow | vulnera | no |
| provider-proveedores-anonymous-create | anonymous | firestore | `proveedores/{RUN}-provider-proveedores-anonymous-create` | create | deny / A3 | deny (permission-denied) | cumple | sí |
| provider-proveedores-anonymous-update | anonymous | firestore | `proveedores/{RUN}-provider-proveedores-anonymous-update` | update | deny / A3 | deny (permission-denied) | cumple | sí |
| provider-proveedores-anonymous-delete | anonymous | firestore | `proveedores/{RUN}-provider-proveedores-anonymous-delete` | delete | deny / A3 | deny (permission-denied) | cumple | sí |
| provider-proveedores-A-create | A | firestore | `proveedores/{RUN}-provider-proveedores-A-create` | create | deny / A3 | deny (permission-denied) | cumple | sí |
| provider-proveedores-A-update | A | firestore | `proveedores/{RUN}-provider-proveedores-A-update` | update | deny / A3 | deny (permission-denied) | cumple | sí |
| provider-proveedores-A-delete | A | firestore | `proveedores/{RUN}-provider-proveedores-A-delete` | delete | deny / A3 | deny (permission-denied) | cumple | sí |
| provider-categorias_proveedores-anonymous-create | anonymous | firestore | `categorias_proveedores/{RUN}-provider-categorias_proveedores-anonymous-create` | create | deny / A3 | deny (permission-denied) | cumple | sí |
| provider-categorias_proveedores-anonymous-update | anonymous | firestore | `categorias_proveedores/{RUN}-provider-categorias_proveedores-anonymous-update` | update | deny / A3 | deny (permission-denied) | cumple | sí |
| provider-categorias_proveedores-anonymous-delete | anonymous | firestore | `categorias_proveedores/{RUN}-provider-categorias_proveedores-anonymous-delete` | delete | deny / A3 | deny (permission-denied) | cumple | sí |
| provider-categorias_proveedores-A-create | A | firestore | `categorias_proveedores/{RUN}-provider-categorias_proveedores-A-create` | create | deny / A3 | deny (permission-denied) | cumple | sí |
| provider-categorias_proveedores-A-update | A | firestore | `categorias_proveedores/{RUN}-provider-categorias_proveedores-A-update` | update | deny / A3 | deny (permission-denied) | cumple | sí |
| provider-categorias_proveedores-A-delete | A | firestore | `categorias_proveedores/{RUN}-provider-categorias_proveedores-A-delete` | delete | deny / A3 | deny (permission-denied) | cumple | sí |
| storage-usuarios-A-get | A | storage | `usuarios/{RUN}-a/imagenes/{RUN}-storage-usuarios-A-get.png` | get | allow / A1 | allow | cumple | sí |
| storage-usuarios-A-create | A | storage | `usuarios/{RUN}-a/imagenes/{RUN}-storage-usuarios-A-create.png` | create | allow / A1 | allow | cumple | sí |
| storage-usuarios-A-update | A | storage | `usuarios/{RUN}-a/imagenes/{RUN}-storage-usuarios-A-update.png` | update | allow / A1 | allow | cumple | sí |
| storage-usuarios-A-delete | A | storage | `usuarios/{RUN}-a/imagenes/{RUN}-storage-usuarios-A-delete.png` | delete | allow / A1 | allow | cumple | sí |
| storage-usuarios-B-get | B | storage | `usuarios/{RUN}-a/imagenes/{RUN}-storage-usuarios-B-get.png` | get | deny / A1 | allow | vulnera | no |
| storage-usuarios-B-create | B | storage | `usuarios/{RUN}-a/imagenes/{RUN}-storage-usuarios-B-create.png` | create | deny / A1 | allow | vulnera | no |
| storage-usuarios-B-update | B | storage | `usuarios/{RUN}-a/imagenes/{RUN}-storage-usuarios-B-update.png` | update | deny / A1 | allow | vulnera | no |
| storage-usuarios-B-delete | B | storage | `usuarios/{RUN}-a/imagenes/{RUN}-storage-usuarios-B-delete.png` | delete | deny / A1 | allow | vulnera | no |
| storage-usuarios-anonymous-get | anonymous | storage | `usuarios/{RUN}-a/imagenes/{RUN}-storage-usuarios-anonymous-get.png` | get | deny / A1 | deny (storage/unauthorized) | cumple | sí |
| storage-usuarios-anonymous-create | anonymous | storage | `usuarios/{RUN}-a/imagenes/{RUN}-storage-usuarios-anonymous-create.png` | create | deny / A1 | deny (storage/unauthorized) | cumple | sí |
| storage-usuarios-anonymous-update | anonymous | storage | `usuarios/{RUN}-a/imagenes/{RUN}-storage-usuarios-anonymous-update.png` | update | deny / A1 | deny (storage/unauthorized) | cumple | sí |
| storage-usuarios-anonymous-delete | anonymous | storage | `usuarios/{RUN}-a/imagenes/{RUN}-storage-usuarios-anonymous-delete.png` | delete | deny / A1 | deny (storage/unauthorized) | cumple | sí |
| storage-usuarios-A-list | A | storage | `usuarios/{RUN}-a/imagenes` | list | allow / A1 | allow | cumple | sí |
| storage-usuarios-B-list | B | storage | `usuarios/{RUN}-a/imagenes` | list | deny / A1 | allow | vulnera | no |
| storage-user-thumbnail-A-get | A | storage | `usuarios/{RUN}-a/thumbnails/{RUN}-storage-user-thumbnail-A-get.webp` | get | allow / A1 | allow | cumple | sí |
| storage-user-thumbnail-A-create | A | storage | `usuarios/{RUN}-a/thumbnails/{RUN}-storage-user-thumbnail-A-create.webp` | create | allow / A1 | allow | cumple | sí |
| storage-user-thumbnail-A-update | A | storage | `usuarios/{RUN}-a/thumbnails/{RUN}-storage-user-thumbnail-A-update.webp` | update | allow / A1 | allow | cumple | sí |
| storage-user-thumbnail-A-delete | A | storage | `usuarios/{RUN}-a/thumbnails/{RUN}-storage-user-thumbnail-A-delete.webp` | delete | allow / A1 | allow | cumple | sí |
| storage-user-thumbnail-B-get | B | storage | `usuarios/{RUN}-a/thumbnails/{RUN}-storage-user-thumbnail-B-get.webp` | get | deny / A1 | allow | vulnera | no |
| storage-user-thumbnail-B-create | B | storage | `usuarios/{RUN}-a/thumbnails/{RUN}-storage-user-thumbnail-B-create.webp` | create | deny / A1 | allow | vulnera | no |
| storage-user-thumbnail-B-update | B | storage | `usuarios/{RUN}-a/thumbnails/{RUN}-storage-user-thumbnail-B-update.webp` | update | deny / A1 | allow | vulnera | no |
| storage-user-thumbnail-B-delete | B | storage | `usuarios/{RUN}-a/thumbnails/{RUN}-storage-user-thumbnail-B-delete.webp` | delete | deny / A1 | allow | vulnera | no |
| storage-user-thumbnail-anonymous-get | anonymous | storage | `usuarios/{RUN}-a/thumbnails/{RUN}-storage-user-thumbnail-anonymous-get.webp` | get | deny / A1 | deny (storage/unauthorized) | cumple | sí |
| storage-user-thumbnail-anonymous-create | anonymous | storage | `usuarios/{RUN}-a/thumbnails/{RUN}-storage-user-thumbnail-anonymous-create.webp` | create | deny / A1 | deny (storage/unauthorized) | cumple | sí |
| storage-user-thumbnail-anonymous-update | anonymous | storage | `usuarios/{RUN}-a/thumbnails/{RUN}-storage-user-thumbnail-anonymous-update.webp` | update | deny / A1 | deny (storage/unauthorized) | cumple | sí |
| storage-user-thumbnail-anonymous-delete | anonymous | storage | `usuarios/{RUN}-a/thumbnails/{RUN}-storage-user-thumbnail-anonymous-delete.webp` | delete | deny / A1 | deny (storage/unauthorized) | cumple | sí |
| storage-user-thumbnail-A-list | A | storage | `usuarios/{RUN}-a/thumbnails` | list | allow / A1 | allow | cumple | sí |
| storage-user-thumbnail-B-list | B | storage | `usuarios/{RUN}-a/thumbnails` | list | deny / A1 | allow | vulnera | no |
| storage-thumbnails_borradores-A-get | A | storage | `thumbnails_borradores/{RUN}-a/{RUN}-storage-thumbnails_borradores-A-get.webp` | get | allow / A1 | allow | cumple | sí |
| storage-thumbnails_borradores-A-create | A | storage | `thumbnails_borradores/{RUN}-a/{RUN}-storage-thumbnails_borradores-A-create.webp` | create | allow / A1 | allow | cumple | sí |
| storage-thumbnails_borradores-A-update | A | storage | `thumbnails_borradores/{RUN}-a/{RUN}-storage-thumbnails_borradores-A-update.webp` | update | allow / A1 | allow | cumple | sí |
| storage-thumbnails_borradores-A-delete | A | storage | `thumbnails_borradores/{RUN}-a/{RUN}-storage-thumbnails_borradores-A-delete.webp` | delete | allow / A1 | allow | cumple | sí |
| storage-thumbnails_borradores-B-get | B | storage | `thumbnails_borradores/{RUN}-a/{RUN}-storage-thumbnails_borradores-B-get.webp` | get | deny / A1 | allow | vulnera | no |
| storage-thumbnails_borradores-B-create | B | storage | `thumbnails_borradores/{RUN}-a/{RUN}-storage-thumbnails_borradores-B-create.webp` | create | deny / A1 | allow | vulnera | no |
| storage-thumbnails_borradores-B-update | B | storage | `thumbnails_borradores/{RUN}-a/{RUN}-storage-thumbnails_borradores-B-update.webp` | update | deny / A1 | allow | vulnera | no |
| storage-thumbnails_borradores-B-delete | B | storage | `thumbnails_borradores/{RUN}-a/{RUN}-storage-thumbnails_borradores-B-delete.webp` | delete | deny / A1 | allow | vulnera | no |
| storage-thumbnails_borradores-anonymous-get | anonymous | storage | `thumbnails_borradores/{RUN}-a/{RUN}-storage-thumbnails_borradores-anonymous-get.webp` | get | deny / A1 | deny (storage/unauthorized) | cumple | sí |
| storage-thumbnails_borradores-anonymous-create | anonymous | storage | `thumbnails_borradores/{RUN}-a/{RUN}-storage-thumbnails_borradores-anonymous-create.webp` | create | deny / A1 | deny (storage/unauthorized) | cumple | sí |
| storage-thumbnails_borradores-anonymous-update | anonymous | storage | `thumbnails_borradores/{RUN}-a/{RUN}-storage-thumbnails_borradores-anonymous-update.webp` | update | deny / A1 | deny (storage/unauthorized) | cumple | sí |
| storage-thumbnails_borradores-anonymous-delete | anonymous | storage | `thumbnails_borradores/{RUN}-a/{RUN}-storage-thumbnails_borradores-anonymous-delete.webp` | delete | deny / A1 | deny (storage/unauthorized) | cumple | sí |
| storage-thumbnails_borradores-A-list | A | storage | `thumbnails_borradores/{RUN}-a` | list | allow / A1 | allow | cumple | sí |
| storage-thumbnails_borradores-B-list | B | storage | `thumbnails_borradores/{RUN}-a` | list | deny / A1 | allow | vulnera | no |
| published-index.html-A-create | A | storage | `publicadas/{RUN}-published-index.html-A-create/index.html` | create | deny / A2 | allow | vulnera | no |
| published-index.html-A-update | A | storage | `publicadas/{RUN}-published-index.html-A-update/index.html` | update | deny / A2 | allow | vulnera | no |
| published-index.html-A-delete | A | storage | `publicadas/{RUN}-published-index.html-A-delete/index.html` | delete | deny / A2 | allow | vulnera | no |
| published-index.html-B-create | B | storage | `publicadas/{RUN}-published-index.html-B-create/index.html` | create | deny / A2 | allow | vulnera | no |
| published-index.html-B-update | B | storage | `publicadas/{RUN}-published-index.html-B-update/index.html` | update | deny / A2 | allow | vulnera | no |
| published-index.html-B-delete | B | storage | `publicadas/{RUN}-published-index.html-B-delete/index.html` | delete | deny / A2 | allow | vulnera | no |
| published-index.html-admin-create | admin | storage | `publicadas/{RUN}-published-index.html-admin-create/index.html` | create | deny / A2 | allow | vulnera | no |
| published-index.html-admin-update | admin | storage | `publicadas/{RUN}-published-index.html-admin-update/index.html` | update | deny / A2 | allow | vulnera | no |
| published-index.html-admin-delete | admin | storage | `publicadas/{RUN}-published-index.html-admin-delete/index.html` | delete | deny / A2 | allow | vulnera | no |
| published-share.jpg-A-create | A | storage | `publicadas/{RUN}-published-share.jpg-A-create/share.jpg` | create | deny / A2 | allow | vulnera | no |
| published-share.jpg-A-update | A | storage | `publicadas/{RUN}-published-share.jpg-A-update/share.jpg` | update | deny / A2 | allow | vulnera | no |
| published-share.jpg-A-delete | A | storage | `publicadas/{RUN}-published-share.jpg-A-delete/share.jpg` | delete | deny / A2 | allow | vulnera | no |
| published-share.jpg-B-create | B | storage | `publicadas/{RUN}-published-share.jpg-B-create/share.jpg` | create | deny / A2 | allow | vulnera | no |
| published-share.jpg-B-update | B | storage | `publicadas/{RUN}-published-share.jpg-B-update/share.jpg` | update | deny / A2 | allow | vulnera | no |
| published-share.jpg-B-delete | B | storage | `publicadas/{RUN}-published-share.jpg-B-delete/share.jpg` | delete | deny / A2 | allow | vulnera | no |
| published-share.jpg-admin-create | admin | storage | `publicadas/{RUN}-published-share.jpg-admin-create/share.jpg` | create | deny / A2 | allow | vulnera | no |
| published-share.jpg-admin-update | admin | storage | `publicadas/{RUN}-published-share.jpg-admin-update/share.jpg` | update | deny / A2 | allow | vulnera | no |
| published-share.jpg-admin-delete | admin | storage | `publicadas/{RUN}-published-share.jpg-admin-delete/share.jpg` | delete | deny / A2 | allow | vulnera | no |
| provider-storage-anonymous-create | anonymous | storage | `proveedores/{RUN}-provider-storage-anonymous-create/portada/portada-original.png` | create | deny / A3 | deny (storage/unauthorized) | cumple | sí |
| provider-storage-anonymous-update | anonymous | storage | `proveedores/{RUN}-provider-storage-anonymous-update/portada/portada-original.png` | update | deny / A3 | deny (storage/unauthorized) | cumple | sí |
| provider-storage-anonymous-delete | anonymous | storage | `proveedores/{RUN}-provider-storage-anonymous-delete/portada/portada-original.png` | delete | deny / A3 | deny (storage/unauthorized) | cumple | sí |
| provider-storage-A-create | A | storage | `proveedores/{RUN}-provider-storage-A-create/portada/portada-original.png` | create | deny / A3 | deny (storage/unauthorized) | cumple | sí |
| provider-storage-A-update | A | storage | `proveedores/{RUN}-provider-storage-A-update/portada/portada-original.png` | update | deny / A3 | deny (storage/unauthorized) | cumple | sí |
| provider-storage-A-delete | A | storage | `proveedores/{RUN}-provider-storage-A-delete/portada/portada-original.png` | delete | deny / A3 | deny (storage/unauthorized) | cumple | sí |

## Casos characterization

| Caso | Identidad | Canal | Recurso | Operación | Esperado / autoridad | Observado | Clasificación | Coincide |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| draft-foreign-publication-link | A | firestore | `borradores/{RUN}-draft-foreign-publication-link` | update | allow / C1 | allow | pendiente de política | sí |
| image-foreign-storage-reference | A | firestore | `usuarios/{RUN}-a/imagenes/{RUN}-image-foreign-storage-reference` | create | allow / C1 | allow | pendiente de política | sí |
| draft-unmodeled-subcollection | A | firestore | `borradores/{RUN}-draft-unmodeled-subcollection/private/child` | get | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| profile-self-role-field | A | firestore | `usuarios/{RUN}-a` | update | allow / C1 | allow | pendiente de política | sí |
| analyticsEvents-overlap-read | A | firestore | `analyticsEvents/{RUN}-analyticsEvents-overlap-read` | get | allow / C1 | allow | pendiente de política | sí |
| analyticsEvents-overlap-write | A | firestore | `analyticsEvents/{RUN}-analyticsEvents-overlap-write` | create | allow / C1 | allow | pendiente de política | sí |
| analyticsUsers-overlap-read | A | firestore | `analyticsUsers/{RUN}-analyticsUsers-overlap-read` | get | allow / C1 | allow | pendiente de política | sí |
| analyticsUsers-overlap-write | A | firestore | `analyticsUsers/{RUN}-analyticsUsers-overlap-write` | create | allow / C1 | allow | pendiente de política | sí |
| analyticsInvitations-overlap-read | A | firestore | `analyticsInvitations/{RUN}-analyticsInvitations-overlap-read` | get | allow / C1 | allow | pendiente de política | sí |
| analyticsInvitations-overlap-write | A | firestore | `analyticsInvitations/{RUN}-analyticsInvitations-overlap-write` | create | allow / C1 | allow | pendiente de política | sí |
| analyticsDaily-overlap-read | A | firestore | `analyticsDaily/{RUN}-analyticsDaily-overlap-read` | get | allow / C1 | allow | pendiente de política | sí |
| analyticsDaily-overlap-write | A | firestore | `analyticsDaily/{RUN}-analyticsDaily-overlap-write` | create | allow / C1 | allow | pendiente de política | sí |
| analyticsWeekly-overlap-read | A | firestore | `analyticsWeekly/{RUN}-analyticsWeekly-overlap-read` | get | allow / C1 | allow | pendiente de política | sí |
| analyticsWeekly-overlap-write | A | firestore | `analyticsWeekly/{RUN}-analyticsWeekly-overlap-write` | create | allow / C1 | allow | pendiente de política | sí |
| analyticsMonthly-overlap-read | A | firestore | `analyticsMonthly/{RUN}-analyticsMonthly-overlap-read` | get | allow / C1 | allow | pendiente de política | sí |
| analyticsMonthly-overlap-write | A | firestore | `analyticsMonthly/{RUN}-analyticsMonthly-overlap-write` | create | allow / C1 | allow | pendiente de política | sí |
| analyticsTemplates-overlap-read | A | firestore | `analyticsTemplates/{RUN}-analyticsTemplates-overlap-read` | get | allow / C1 | allow | pendiente de política | sí |
| analyticsTemplates-overlap-write | A | firestore | `analyticsTemplates/{RUN}-analyticsTemplates-overlap-write` | create | allow / C1 | allow | pendiente de política | sí |
| analyticsCohorts-overlap-read | A | firestore | `analyticsCohorts/{RUN}-analyticsCohorts-overlap-read` | get | allow / C1 | allow | pendiente de política | sí |
| analyticsCohorts-overlap-write | A | firestore | `analyticsCohorts/{RUN}-analyticsCohorts-overlap-write` | create | allow / C1 | allow | pendiente de política | sí |
| analyticsJobs-overlap-read | A | firestore | `analyticsJobs/{RUN}-analyticsJobs-overlap-read` | get | allow / C1 | allow | pendiente de política | sí |
| analyticsJobs-overlap-write | A | firestore | `analyticsJobs/{RUN}-analyticsJobs-overlap-write` | create | allow / C1 | allow | pendiente de política | sí |
| analyticsExports-overlap-read | A | firestore | `analyticsExports/{RUN}-analyticsExports-overlap-read` | get | allow / C1 | allow | pendiente de política | sí |
| analyticsExports-overlap-write | A | firestore | `analyticsExports/{RUN}-analyticsExports-overlap-write` | create | allow / C1 | allow | pendiente de política | sí |
| iconos_audit-overlap-read | A | firestore | `iconos_audit/{RUN}-iconos_audit-overlap-read` | get | allow / C1 | allow | pendiente de política | sí |
| iconos_audit-overlap-write | A | firestore | `iconos_audit/{RUN}-iconos_audit-overlap-write` | create | allow / C1 | allow | pendiente de política | sí |
| iconos_usage_snapshots-overlap-read | A | firestore | `iconos_usage_snapshots/{RUN}-iconos_usage_snapshots-overlap-read` | get | allow / C1 | allow | pendiente de política | sí |
| iconos_usage_snapshots-overlap-write | A | firestore | `iconos_usage_snapshots/{RUN}-iconos_usage_snapshots-overlap-write` | create | allow / C1 | allow | pendiente de política | sí |
| decoraciones_audit-overlap-read | A | firestore | `decoraciones_audit/{RUN}-decoraciones_audit-overlap-read` | get | allow / C1 | allow | pendiente de política | sí |
| decoraciones_audit-overlap-write | A | firestore | `decoraciones_audit/{RUN}-decoraciones_audit-overlap-write` | create | allow / C1 | allow | pendiente de política | sí |
| fallback-analyticsDaily-users | A | firestore | `analyticsDaily/{RUN}-fallback-analyticsDaily-users/users/{RUN}-b` | update | allow / C1 | allow | pendiente de política | sí |
| fallback-analyticsWeekly-templates | A | firestore | `analyticsWeekly/{RUN}-fallback-analyticsWeekly-templates/templates/template` | update | allow / C1 | allow | pendiente de política | sí |
| fallback-analyticsCohorts-periods | A | firestore | `analyticsCohorts/{RUN}-fallback-analyticsCohorts-periods/periods/0` | update | allow / C1 | allow | pendiente de política | sí |
| fallback-countdownPresets-versions | A | firestore | `countdownPresets/{RUN}-fallback-countdownPresets-versions/versions/1` | update | allow / C1 | allow | pendiente de política | sí |
| fallback-countdownPresets-operations | A | firestore | `countdownPresets/{RUN}-fallback-countdownPresets-operations/operations/operation` | update | allow / C1 | allow | pendiente de política | sí |
| fallback-clientIssues-root | A | firestore | `clientIssues/{RUN}-fallback-clientIssues-root` | update | allow / C1 | allow | pendiente de política | sí |
| fallback-text_presets-root | A | firestore | `text_presets/{RUN}-fallback-text_presets-root` | update | allow / C1 | allow | pendiente de política | sí |
| fallback-plantillas_secciones-root | A | firestore | `plantillas_secciones/{RUN}-fallback-plantillas_secciones-root` | update | allow / C1 | allow | pendiente de política | sí |
| fallback-invitaciones-root | A | firestore | `invitaciones/{RUN}-fallback-invitaciones-root` | update | allow / C1 | allow | pendiente de política | sí |
| fallback-unmodeled_4b1-root | A | firestore | `unmodeled_4b1/{RUN}-fallback-unmodeled_4b1-root` | update | allow / C1 | allow | pendiente de política | sí |
| iconos-ordinary-read | A | firestore | `iconos/{RUN}-iconos-ordinary-read` | get | allow / C1 | allow | pendiente de política | sí |
| iconos-ordinary-create | A | firestore | `iconos/{RUN}-iconos-ordinary-create` | create | allow / C1 | allow | pendiente de política | sí |
| iconos-ordinary-update | A | firestore | `iconos/{RUN}-iconos-ordinary-update` | update | allow / C1 | allow | pendiente de política | sí |
| iconos-ordinary-delete | A | firestore | `iconos/{RUN}-iconos-ordinary-delete` | delete | allow / C1 | allow | pendiente de política | sí |
| iconos_archived-ordinary-read | A | firestore | `iconos_archived/{RUN}-iconos_archived-ordinary-read` | get | allow / C1 | allow | pendiente de política | sí |
| iconos_archived-ordinary-create | A | firestore | `iconos_archived/{RUN}-iconos_archived-ordinary-create` | create | allow / C1 | allow | pendiente de política | sí |
| iconos_archived-ordinary-update | A | firestore | `iconos_archived/{RUN}-iconos_archived-ordinary-update` | update | allow / C1 | allow | pendiente de política | sí |
| iconos_archived-ordinary-delete | A | firestore | `iconos_archived/{RUN}-iconos_archived-ordinary-delete` | delete | allow / C1 | allow | pendiente de política | sí |
| decoraciones-ordinary-read | A | firestore | `decoraciones/{RUN}-decoraciones-ordinary-read` | get | allow / C1 | allow | pendiente de política | sí |
| decoraciones-ordinary-create | A | firestore | `decoraciones/{RUN}-decoraciones-ordinary-create` | create | allow / C1 | allow | pendiente de política | sí |
| decoraciones-ordinary-update | A | firestore | `decoraciones/{RUN}-decoraciones-ordinary-update` | update | allow / C1 | allow | pendiente de política | sí |
| decoraciones-ordinary-delete | A | firestore | `decoraciones/{RUN}-decoraciones-ordinary-delete` | delete | allow / C1 | allow | pendiente de política | sí |
| decoraciones_archived-ordinary-read | A | firestore | `decoraciones_archived/{RUN}-decoraciones_archived-ordinary-read` | get | allow / C1 | allow | pendiente de política | sí |
| decoraciones_archived-ordinary-create | A | firestore | `decoraciones_archived/{RUN}-decoraciones_archived-ordinary-create` | create | allow / C1 | allow | pendiente de política | sí |
| decoraciones_archived-ordinary-update | A | firestore | `decoraciones_archived/{RUN}-decoraciones_archived-ordinary-update` | update | allow / C1 | allow | pendiente de política | sí |
| decoraciones_archived-ordinary-delete | A | firestore | `decoraciones_archived/{RUN}-decoraciones_archived-ordinary-delete` | delete | allow / C1 | allow | pendiente de política | sí |
| exclusive-site_settings-root | admin | firestore | `site_settings/{RUN}-exclusive-site_settings-root` | update | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| exclusive-site_settings-history | admin | firestore | `site_settings/{RUN}-exclusive-site_settings-history/history/1` | update | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| exclusive-app_config-root | admin | firestore | `app_config/{RUN}-exclusive-app_config-root` | update | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| exclusive-plantillas_tags-root | admin | firestore | `plantillas_tags/{RUN}-exclusive-plantillas_tags-root` | update | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| exclusive-public_slug_reservations-root | admin | firestore | `public_slug_reservations/{RUN}-exclusive-public_slug_reservations-root` | update | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| exclusive-publication_discount_codes-root | admin | firestore | `publication_discount_codes/{RUN}-exclusive-publication_discount_codes-root` | update | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| exclusive-publication_discount_code_usage-root | admin | firestore | `publication_discount_code_usage/{RUN}-exclusive-publication_discount_code_usage-root` | update | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| template-auth-published-get | A | firestore | `plantillas/{RUN}-template-auth-published-get` | get | allow / C1 | allow | pendiente de política | sí |
| template-anonymous-get | anonymous | firestore | `plantillas/{RUN}-template-anonymous-get` | get | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| template-legacy-missing-gates | A | firestore | `plantillas/{RUN}-template-legacy-missing-gates` | get | allow / C1 | allow | pendiente de política | sí |
| template-unpublished-get | A | firestore | `plantillas/{RUN}-template-unpublished-get` | get | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| template-admin-write | admin | firestore | `plantillas/{RUN}-template-admin-write` | update | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| catalog-public-get | anonymous | firestore | `plantillas_catalog/{RUN}-catalog-public-get` | get | allow / C1 | allow | pendiente de política | sí |
| catalog-public-filtered-list | anonymous | firestore | `plantillas_catalog` filtros: [["estado","==","active"],["estadoEditorial","==","publicada"]] | list | allow / C1 | allow | pendiente de política | sí |
| catalog-unfiltered-list | anonymous | firestore | `plantillas_catalog` | list | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| provider-public-tuple | anonymous | firestore | `proveedores/{RUN}-provider-public-tuple` | get | allow / C1 | allow | pendiente de política | sí |
| provider-hidden | A | firestore | `proveedores/{RUN}-provider-hidden` | get | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| provider-inactive | anonymous | firestore | `proveedores/{RUN}-provider-inactive` | get | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| provider-subcollection | A | firestore | `proveedores/{RUN}-provider-subcollection/internal/1` | get | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| provider-admin-malformed | admin | firestore | `proveedores/{RUN}-provider-admin-malformed` | create | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| provider-category-public | anonymous | firestore | `categorias_proveedores/{RUN}-provider-category-public` | get | allow / C1 | allow | pendiente de política | sí |
| published-anonymous-sdk-get | anonymous | storage | `publicadas/{RUN}-published-anonymous-sdk-get/index.html` | get | deny / C1 | deny (storage/unauthorized) | pendiente de política | sí |
| storage-fallback-iconos-get | B | storage | `iconos/{RUN}-storage-fallback-iconos-get.png` | get | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-iconos-update | B | storage | `iconos/{RUN}-storage-fallback-iconos-update.png` | update | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-iconos-delete | B | storage | `iconos/{RUN}-storage-fallback-iconos-delete.png` | delete | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-iconos_archived-get | B | storage | `iconos_archived/{RUN}-storage-fallback-iconos_archived-get.png` | get | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-iconos_archived-update | B | storage | `iconos_archived/{RUN}-storage-fallback-iconos_archived-update.png` | update | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-iconos_archived-delete | B | storage | `iconos_archived/{RUN}-storage-fallback-iconos_archived-delete.png` | delete | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-decoraciones-originals-get | B | storage | `decoraciones/originals/{RUN}-storage-fallback-decoraciones-originals-get.png` | get | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-decoraciones-originals-update | B | storage | `decoraciones/originals/{RUN}-storage-fallback-decoraciones-originals-update.png` | update | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-decoraciones-originals-delete | B | storage | `decoraciones/originals/{RUN}-storage-fallback-decoraciones-originals-delete.png` | delete | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-decoraciones-thumbnails-get | B | storage | `decoraciones/thumbnails/{RUN}-storage-fallback-decoraciones-thumbnails-get.png` | get | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-decoraciones-thumbnails-update | B | storage | `decoraciones/thumbnails/{RUN}-storage-fallback-decoraciones-thumbnails-update.png` | update | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-decoraciones-thumbnails-delete | B | storage | `decoraciones/thumbnails/{RUN}-storage-fallback-decoraciones-thumbnails-delete.png` | delete | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-plantillas-ID-assets-get | B | storage | `plantillas/{RUN}-storage-fallback-plantillas-ID-assets-get/assets/{RUN}-storage-fallback-plantillas-ID-assets-get.png` | get | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-plantillas-ID-assets-update | B | storage | `plantillas/{RUN}-storage-fallback-plantillas-ID-assets-update/assets/{RUN}-storage-fallback-plantillas-ID-assets-update.png` | update | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-plantillas-ID-assets-delete | B | storage | `plantillas/{RUN}-storage-fallback-plantillas-ID-assets-delete/assets/{RUN}-storage-fallback-plantillas-ID-assets-delete.png` | delete | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-plantillas_secciones-get | B | storage | `plantillas_secciones/{RUN}-storage-fallback-plantillas_secciones-get.png` | get | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-plantillas_secciones-update | B | storage | `plantillas_secciones/{RUN}-storage-fallback-plantillas_secciones-update.png` | update | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-plantillas_secciones-delete | B | storage | `plantillas_secciones/{RUN}-storage-fallback-plantillas_secciones-delete.png` | delete | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-public-get | B | storage | `public/{RUN}-storage-fallback-public-get.png` | get | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-public-update | B | storage | `public/{RUN}-storage-fallback-public-update.png` | update | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-public-delete | B | storage | `public/{RUN}-storage-fallback-public-delete.png` | delete | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-previews-plantillas-get | B | storage | `previews/plantillas/{RUN}-storage-fallback-previews-plantillas-get.png` | get | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-previews-plantillas-update | B | storage | `previews/plantillas/{RUN}-storage-fallback-previews-plantillas-update.png` | update | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-previews-plantillas-delete | B | storage | `previews/plantillas/{RUN}-storage-fallback-previews-plantillas-delete.png` | delete | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-user_uploads-A-get | B | storage | `user_uploads/{RUN}-a/{RUN}-storage-fallback-user_uploads-A-get.png` | get | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-user_uploads-A-update | B | storage | `user_uploads/{RUN}-a/{RUN}-storage-fallback-user_uploads-A-update.png` | update | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-user_uploads-A-delete | B | storage | `user_uploads/{RUN}-a/{RUN}-storage-fallback-user_uploads-A-delete.png` | delete | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-borradores-ID-get | B | storage | `borradores/{RUN}-storage-fallback-borradores-ID-get/{RUN}-storage-fallback-borradores-ID-get.png` | get | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-borradores-ID-update | B | storage | `borradores/{RUN}-storage-fallback-borradores-ID-update/{RUN}-storage-fallback-borradores-ID-update.png` | update | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-borradores-ID-delete | B | storage | `borradores/{RUN}-storage-fallback-borradores-ID-delete/{RUN}-storage-fallback-borradores-ID-delete.png` | delete | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-assets-countdown-staging-ID-get | B | storage | `assets/countdown/staging/{RUN}-storage-fallback-assets-countdown-staging-ID-get/{RUN}-storage-fallback-assets-countdown-staging-ID-get.png` | get | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-assets-countdown-staging-ID-update | B | storage | `assets/countdown/staging/{RUN}-storage-fallback-assets-countdown-staging-ID-update/{RUN}-storage-fallback-assets-countdown-staging-ID-update.png` | update | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-assets-countdown-staging-ID-delete | B | storage | `assets/countdown/staging/{RUN}-storage-fallback-assets-countdown-staging-ID-delete/{RUN}-storage-fallback-assets-countdown-staging-ID-delete.png` | delete | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-assets-countdown-frames-ID-operations-op-get | B | storage | `assets/countdown/frames/{RUN}-storage-fallback-assets-countdown-frames-ID-operations-op-get/operations/op/{RUN}-storage-fallback-assets-countdown-frames-ID-operations-op-get.png` | get | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-assets-countdown-frames-ID-operations-op-update | B | storage | `assets/countdown/frames/{RUN}-storage-fallback-assets-countdown-frames-ID-operations-op-update/operations/op/{RUN}-storage-fallback-assets-countdown-frames-ID-operations-op-update.png` | update | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-assets-countdown-frames-ID-operations-op-delete | B | storage | `assets/countdown/frames/{RUN}-storage-fallback-assets-countdown-frames-ID-operations-op-delete/operations/op/{RUN}-storage-fallback-assets-countdown-frames-ID-operations-op-delete.png` | delete | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-analytics-exports-raw-2026-09-get | B | storage | `analytics-exports/raw/2026/09/{RUN}-storage-fallback-analytics-exports-raw-2026-09-get.png` | get | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-analytics-exports-raw-2026-09-update | B | storage | `analytics-exports/raw/2026/09/{RUN}-storage-fallback-analytics-exports-raw-2026-09-update.png` | update | allow / C1 | allow | pendiente de política | sí |
| storage-fallback-analytics-exports-raw-2026-09-delete | B | storage | `analytics-exports/raw/2026/09/{RUN}-storage-fallback-analytics-exports-raw-2026-09-delete.png` | delete | allow / C1 | allow | pendiente de política | sí |
| provider-storage-public | anonymous | storage | `proveedores/{RUN}-provider-storage-public/portada/portada-original.png` | get | allow / C1 | allow | pendiente de política | sí |
| provider-storage-hidden | anonymous | storage | `proveedores/{RUN}-provider-storage-hidden/portada/portada-original.png` | get | deny / C1 | deny (storage/unauthorized) | pendiente de política | sí |
| provider-storage-admin-valid | admin | storage | `proveedores/{RUN}-provider-storage-admin-valid/galeria/fixture.png` | create | allow / C1 | allow | pendiente de política | sí |
| provider-storage-admin-mime | admin | storage | `proveedores/{RUN}-provider-storage-admin-mime/galeria/fixture.png` | create | deny / C1 | deny (storage/unauthorized) | pendiente de política | sí |
| provider-storage-admin-size | admin | storage | `proveedores/{RUN}-provider-storage-admin-size/galeria/fixture.png` | create | deny / C1 | deny (storage/unauthorized) | pendiente de política | sí |
| provider-storage-admin-path | admin | storage | `proveedores/{RUN}-provider-storage-admin-path/other/fixture.png` | create | deny / C1 | deny (storage/unauthorized) | pendiente de política | sí |
| q1-admin-firestore | admin | firestore | `proveedores/{RUN}-q1-admin-firestore` | delete | allow / C1 | allow | pendiente de política | sí |
| q1-admin-storage | admin | storage | `proveedores/{RUN}-q1-admin-storage/galeria/fixture.png` | delete | allow / C1 | allow | pendiente de política | sí |
| q1-admin-backend-admin | admin | backend-helper | `requireAdmin` | authorize | allow / C2 | allow | pendiente de política | sí |
| q1-admin-backend-super | admin | backend-helper | `requireSuperAdmin` | authorize | deny / C2 | deny (permission-denied) | pendiente de política | sí |
| q1-superclaim-firestore | superclaim | firestore | `proveedores/{RUN}-q1-superclaim-firestore` | delete | allow / C1 | allow | pendiente de política | sí |
| q1-superclaim-storage | superclaim | storage | `proveedores/{RUN}-q1-superclaim-storage/galeria/fixture.png` | delete | allow / C1 | allow | pendiente de política | sí |
| q1-superclaim-backend-admin | superclaim | backend-helper | `requireAdmin` | authorize | deny / C2 | deny (permission-denied) | pendiente de política | sí |
| q1-superclaim-backend-super | superclaim | backend-helper | `requireSuperAdmin` | authorize | deny / C2 | deny (permission-denied) | pendiente de política | sí |
| q1-role-firestore | role | firestore | `proveedores/{RUN}-q1-role-firestore` | delete | allow / C1 | allow | pendiente de política | sí |
| q1-role-storage | role | storage | `proveedores/{RUN}-q1-role-storage/galeria/fixture.png` | delete | allow / C1 | allow | pendiente de política | sí |
| q1-role-backend-admin | role | backend-helper | `requireAdmin` | authorize | deny / C2 | deny (permission-denied) | pendiente de política | sí |
| q1-role-backend-super | role | backend-helper | `requireSuperAdmin` | authorize | deny / C2 | deny (permission-denied) | pendiente de política | sí |
| q1-stringAdmin-firestore | stringAdmin | firestore | `proveedores/{RUN}-q1-stringAdmin-firestore` | delete | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| q1-stringAdmin-storage | stringAdmin | storage | `proveedores/{RUN}-q1-stringAdmin-storage/galeria/fixture.png` | delete | deny / C1 | deny (storage/unauthorized) | pendiente de política | sí |
| q1-stringAdmin-backend-admin | stringAdmin | backend-helper | `requireAdmin` | authorize | deny / C2 | deny (permission-denied) | pendiente de política | sí |
| q1-stringAdmin-backend-super | stringAdmin | backend-helper | `requireSuperAdmin` | authorize | deny / C2 | deny (permission-denied) | pendiente de política | sí |
| q1-serverSuper-firestore | serverSuper | firestore | `proveedores/{RUN}-q1-serverSuper-firestore` | delete | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| q1-serverSuper-storage | serverSuper | storage | `proveedores/{RUN}-q1-serverSuper-storage/galeria/fixture.png` | delete | deny / C1 | deny (storage/unauthorized) | pendiente de política | sí |
| q1-serverSuper-backend-admin | serverSuper | backend-helper | `requireAdmin` | authorize | allow / C2 | allow | pendiente de política | sí |
| q1-serverSuper-backend-super | serverSuper | backend-helper | `requireSuperAdmin` | authorize | allow / C2 | allow | pendiente de política | sí |
| q1-A-firestore | A | firestore | `proveedores/{RUN}-q1-A-firestore` | delete | deny / C1 | deny (permission-denied) | pendiente de política | sí |
| q1-A-storage | A | storage | `proveedores/{RUN}-q1-A-storage/galeria/fixture.png` | delete | deny / C1 | deny (storage/unauthorized) | pendiente de política | sí |
| q1-A-backend-admin | A | backend-helper | `requireAdmin` | authorize | deny / C2 | deny (permission-denied) | pendiente de política | sí |
| q1-A-backend-super | A | backend-helper | `requireSuperAdmin` | authorize | deny / C2 | deny (permission-denied) | pendiente de política | sí |

## Casos proposal

| Caso | Identidad | Canal | Recurso | Operación | Esperado / autoridad | Observado | Clasificación | Coincide |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| proposal-canonicalAdmin-firestore | canonicalAdmin | firestore | `proveedores/{RUN}-proposal-canonicalAdmin-firestore` | delete | allow / Q1 | deny (permission-denied) | pendiente de política | no |
| proposal-canonicalAdmin-storage | canonicalAdmin | storage | `proveedores/{RUN}-proposal-canonicalAdmin-storage/galeria/fixture.png` | delete | allow / Q1 | deny (storage/unauthorized) | pendiente de política | no |
| proposal-canonicalAdmin-backend | canonicalAdmin | backend-helper | `requireAdmin` | authorize | allow / Q1 | deny (permission-denied) | pendiente de política | no |
| proposal-canonicalSuper-firestore | canonicalSuper | firestore | `proveedores/{RUN}-proposal-canonicalSuper-firestore` | delete | allow / Q1 | deny (permission-denied) | pendiente de política | no |
| proposal-canonicalSuper-storage | canonicalSuper | storage | `proveedores/{RUN}-proposal-canonicalSuper-storage/galeria/fixture.png` | delete | allow / Q1 | deny (storage/unauthorized) | pendiente de política | no |
| proposal-canonicalSuper-backend | canonicalSuper | backend-helper | `requireAdmin` | authorize | allow / Q1 | deny (permission-denied) | pendiente de política | no |
| proposal-superclaim-firestore | superclaim | firestore | `proveedores/{RUN}-proposal-superclaim-firestore` | delete | deny / Q1 | allow | pendiente de política | no |
| proposal-superclaim-storage | superclaim | storage | `proveedores/{RUN}-proposal-superclaim-storage/galeria/fixture.png` | delete | deny / Q1 | allow | pendiente de política | no |
| proposal-superclaim-backend | superclaim | backend-helper | `requireAdmin` | authorize | deny / Q1 | deny (permission-denied) | pendiente de política | sí |
| proposal-role-firestore | role | firestore | `proveedores/{RUN}-proposal-role-firestore` | delete | deny / Q1 | allow | pendiente de política | no |
| proposal-role-storage | role | storage | `proveedores/{RUN}-proposal-role-storage/galeria/fixture.png` | delete | deny / Q1 | allow | pendiente de política | no |
| proposal-role-backend | role | backend-helper | `requireAdmin` | authorize | deny / Q1 | deny (permission-denied) | pendiente de política | sí |
