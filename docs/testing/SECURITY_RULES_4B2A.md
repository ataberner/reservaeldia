# Corrección local de propiedad y autoridad backend — FASE 4B2A

Estado: implementada y verificada localmente para las operaciones seleccionadas.
Sin despliegue. Q1 no aceptada.
La [línea base 4B1](SECURITY_RULES_BASELINE_4B1.md) permanece histórica e intacta.
Este informe registra alcance y evidencia; la autoridad sigue siendo el
[contrato de seguridad](../contracts/SECURITY_CONTRACT.md#accepted-obligations).

## Selección anterior a editar Rules

Se seleccionaron **134 IDs existentes**, exactamente los casos `acceptance`
con autoridad `A1` o `A2` de `scripts/local/rulesCases.mjs` en 4B1. Incluyen
positivos y denegaciones ya correctas; no se seleccionó por resultado del test.
Lista completa y hashes iniciales: `.local-isolation/phase4b2a/selection-before-rules.json`.
La comparación por ID al final de este informe conserva esa selección explícita.
Los 18 A3 se ejecutan como regresión de frontera; los cinco A4 quedan fuera de
implementación, aunque se ejecuta igualmente toda la suite, sin filtros ni skips.

| Recurso / operación | Antes → exigido por autoridad aceptada | Consumidor que preservar | IDs existentes seleccionados | Dependencia pendiente |
| --- | --- | --- | --- | --- |
| `usuarios/{uid}` g; X/N glcud | Auth global → g propio; negar X/N y query global, A1 | Callables de perfil/preferencias; lectura SDK propia | `profile-*` | CRUD propio sigue observado, sin aprobar campos/borrado de cuenta; no se restringe en esta fase |
| `usuarios/{uid}/imagenes/**` glcud | Auth global → UID del path, A1 | `useMisImagenes`: upload, paginación y eliminación | `image-*`, salvo caracterización de referencia extranjera | No validar URLs compartidas ni convertir otras subcolecciones en biblioteca |
| `borradores/{slug}` glcud | Ownership vigente → preservarlo, A1; create propio, userId inmutable | Autosave/persistencia y query de `useDashboardDrafts` | `draft-*` de aceptación | Relaciones `slugPublico` no conceden permisos; sin política nueva de referencias |
| `publicadas/{slug}` gl / cud | Auth global → gl con userId propio (A1); cud ningún cliente (A2), incluso claims admin | Query `dashboardList` con userId/publicadaEn/limit; lecturas route/preview | `publication-*` | Ninguna para estas operaciones; M/S no reciben acceso privado ajeno |
| `publicadas/{slug}/rsvps/**` gl; X/N cud | Auth global → propietario del padre (A1), nunca campo de la respuesta | `PublicadasGrid`, `useDashboardPublicationRsvpSummary` | `rsvps-*` | Escrituras propias conservadas como observación; denegarlas todas sigue propuesto |
| `publicadas/{slug}/{visits,uniqueVisitors}/**` | Auth global → lectura sólo dueño del padre (A1); cud ningún cliente (A2) | HTTP contabilidad backend; no lector SDK crudo encontrado | `visits-*`, `uniqueVisitors-*` | Lectura cruda propia sigue permitida/observada; su retiro no se aprueba aquí |
| `publicadas_historial/{id}` gl; ownership en cud | Auth global → query propia, create con userId propio, u conserva userId, X/N — (A1) | `dashboardList` consulta historia con userId/limit | `history-*` | CRUD propio sigue observado; exclusividad SDK backend total continúa propuesta |
| Checkout y recursos relacionados, recursivos | SDK denegado → preservar A2 | Callables, Admin y pagos; sin habilitar handlers bloqueados | `checkout-owner-{create,update,delete}` | Q1 no cambia la exclusividad de estos datos |
| Storage `usuarios/{uid}/{imagenes,thumbnails}/**`, `thumbnails_borradores/{uid}/**` glcud | Auth global → UID propio A1, incluidos prefijos exactos/niveles anidados | `useMisImagenes`, `guardarThumbnail` | `storage-{usuarios,user-thumbnail,thumbnails_borradores}-*` | MIME/tamaño, relación slug/draft y URLs por token siguen pendientes |
| Storage `publicadas/**` cud | Auth global → ningún SDK cliente A2, todo el prefijo de artefactos de publicación | `publicationPublishExecution`, generación share y finalización backend | `published-{index.html,share.jpg}-{A,B,admin}-{create,update,delete}` | SDK read autenticado se conserva observado; no cambia entrega HTTP/lifecycle |

Fuentes concretas y canales están enlazados en la matriz canónica. Se conservará
el acceso observado fuera de los recursos modelados: otras subcolecciones bajo
usuarios/publicadas, descendientes de historial y otros folders bajo
`usuarios/{uid}` en Storage. Continúan expuestos a autenticados; no se les
concede estado aceptado. Una regla de compatibilidad debe excluir por nombre
los subárboles corregidos, sin volver a conceder sus operaciones por OR.
Denegar esos recursos no modelados por defecto requiere la decisión de dominio
ya pendiente. Los catálogos, analítica, proveedores y prefijos legacy no cambian.

Se agregarán regresiones de ausencia de sesión, ownership omitido/cambiado,
claims administrativos, padre extranjero/ausente, queries reales con orden/límite,
límites de prefijos y escrituras backend. Los positivos de operaciones pendientes
se etiquetarán `characterization`, nunca `acceptance`.

## Resultado y comparación

Corrida final: **session-QCbF1y**, 2026-09-11T16:33:29.342Z UTC.
Las filas seleccionadas arriba se implementaron con los límites indicados.
**134/134 IDs existentes A1/A2 pasan** (60 ya pasaban, 74 vulneraciones corregidas:
41 Firestore y 33 Storage). Además pasan **324/324 regresiones nuevas A1/A2**.
Se preservaron los 316 IDs, categorías y expectativas originales; no hubo
inversión, skip, reclasificación ni actualización de caracterización para ocultar
fallas. Se agregaron 344 casos: 324 acceptance y 20 characterization.

| Grupo | 4B1: coincide / total | 4B2A: coincide / total | Diferencias actuales | Infraestructura en casos |
| --- | ---: | ---: | ---: | ---: |
| acceptance | 78 / 157 | 476 / 481 | 5 | 0 |
| characterization | 147 / 147 | 167 / 167 | 0 | 0 |
| proposal Q1 | 2 / 12 | 2 / 12 | 10 | 0 |

**660 casos ejecutados; TAP: 655 aprobados, 5 fallidos, 0 omitidos/cancelados.**
Los 12 probes Q1 cuentan como ejecución válida, no como política aprobada.
644 operaciones sujetas a Rules: **371 Firestore, 273 Storage**; los otros 16
son helpers puros, etiquetados por separado. Admin sólo prepara/limpia fixtures.
Las dos corridas completas de Rules reprodujeron el mismo resultado por ID.

Únicas fallas de aceptación, idénticas a 4B1 y fuera de alcance:

- countdown-private-draft
- countdown-immutable-A-update
- countdown-immutable-A-delete
- countdown-immutable-admin-update
- countdown-immutable-admin-delete

No hubo regresiones inesperadas de autorización. Las 147 caracterizaciones
históricas conservan esperado y observado. Las 20 nuevas registran permisos
propios todavía pendientes y residuos explícitos, sin aceptarlos como política.
Los probes Q1 conservan exactamente sus diferencias.

## Comandos, intentos y destinos

| Comando / intento | Sesión o log | Salida | Resultado |
| --- | --- | ---: | --- |
| npm run local:check | local-check.log | 0 | Requisitos, proyecto/bucket/puertos verificados |
| npm run test:local:unit, inicial y final | unit.log, unit-final.log | 0 / 0 | 12/12 cada vez; entorno limpio, transporte y timeout local acotado |
| npm run test:local:rules, inicial | session-iaFEo0 / rules-run-1.log | 1 | 660 ejecutados, cinco fallas A4, cero errores de infraestructura |
| npm run test:local, primer intento | session-rK9n4z / local-test.log | 1 | 94 tests pasaron; discovery de Functions superó 10 s. Integración, navegador y offline no iniciados en este intento |
| npm run test:local, repetición | session-6DPeD0 / local-test-2.log | 0 | 97/97; compilación, SDK/callables, navegador y emuladores ausentes |
| npm run test:local:rules, final | session-QCbF1y / rules-run-2.log | 1 | 660 ejecutados, mismo resultado por ID con tooling final |

El timeout fue **infraestructura de arranque**, no deny ni fallo de Rules.
La CLI instalada interpreta FUNCTIONS_DISCOVERY_TIMEOUT en segundos; se fijó
60 sólo en cleanEnvironment, con assert de valor fijo frente a override heredado.
No se cambió readiness, handlers habilitados, bloqueo de red, destinos ni Rules
para salvar ese arranque. Los cuatro emuladores continuaron siendo obligatorios.
El launcher devolvió los códigos reales y cerró únicamente sus árboles.

Destino en todas las sesiones: proyecto demo-reservaeldia-local, bucket
demo-reservaeldia-local.appspot.com; Auth 127.0.0.1:19099, Firestore
127.0.0.1:18080, Functions 127.0.0.1:15001, Storage 127.0.0.1:19199. Hub 14400,
logging 14500 y websocket 19150; Next 127.0.0.1:3100 sólo en integración.
Entorno personal vacío, identidades/paths sintéticos por UUID, sin importación
de usuarios/claims/datos reales. Compilados de Functions actuales en cada copia.

Node v22.13.1, Java 25.0.2, Firebase CLI 14.4.0; SDK cliente 11.7.3,
Admin 13.4.0, Firestore emulator 1.19.8 y Storage Rules runtime 1.1.3.
No se instalaron dependencias. Los avisos de MOTD/metadata bloqueados y de
deprecación de Java no se contaron como resultados de autorización.

## Revisión local exacta

Rules comparadas por bytes al copiar, hashes validados antes/después de la suite.
Los hashes coinciden también con la sesión de integración final. Estos hashes
identifican el árbol local ejecutado; no se hizo commit ni se verificó un deploy.

| Archivo consumido | SHA-256 |
| --- | --- |
| firestore.rules | 57bdf85410fc95d01bc12e632bd580ff18028557567844cc0f466536f2a08635 |
| storage.rules | 3d38edd91fd5650c7196facda38c66b3852c2b9064a4fc6433ae94df9af508e8 |
| scripts/local/rulesCases.mjs | d384f96be048e9892fa949f298ae052ac3ff65acd47b60d3d1ef620ba5133d06 |
| scripts/local/rules.test.mjs | cd5ce26eff56f59e38dd6eed28a17ae45f68a6ad987c29f4e9b37185ab2161a5 |
| scripts/local/session.cjs | c1c1e3369719d9d7464502b702f707d09b91a52e6f8edfc9858cc0ceb24c6525 |
| scripts/local/environment.test.mjs | 001b5db0d8506b343520787755e2293c4a697d8c9a56b88558bcbecac74d726d |
| scripts/local/runLocal.cjs | cf0b5279f19f25aa58fdc165637cb462313564ece1f99bd420ceb66ad2c289a3 |
| scripts/local/functionsEntry.cjs | cbcd877ba5e5686b60c35b0cb95ef00d6fd7e433b4ed555f60df227da45fb591 |
| scripts/local/networkGuard.cjs | 48e45c189ef3d068b5ee1626d56cfb15b6968e2a2a124f444ef1ff71c3db9168 |
| functions/src/auth/adminAuth.ts | 590d95830639f6624d6088e2a38898babfa18e96fc25dd8911ed29f6961be793 |
| src/domain/publications/dashboardList.js | 20ab338eef6bf0e9679ec92fe47d930e5321f3d929147ef7ca6d17da614f0cd6 |
| src/hooks/useMisImagenes.js | f543bc7520fe342ce2089cae5fd85e950e5f71dc6c22d01bc8749c01925eaa5c |
| src/utils/guardarThumbnail.js | e60b14683bc2a95900b68f64830b1f742ba2f6fd6b8d90da63a2dc64d499b885 |

## Compatibilidad y límites

Los positivos SDK verifican g/c/u/d propios de borradores y biblioteca, lectura
de perfil, queries de publicación e historial con ownership y límite, orden
publicadaEn, y biblioteca con fechaSubida/limit 12 y cursor. RSVP se consulta
por el padre y un campo userId extranjero en la respuesta no sustituye esa
autoridad. Los tests negativos verifican query global/ajena, sesión ausente,
owner inválido/eliminado, padre ausente, collectionGroup RSVP, clientes admin,
subárboles y prefijos Storage exactos/anidados. No hay bypass Admin en el assert.

La integración 4A pasó 12 tests cliente/configuración, 7 backend/render, 75
regresiones existentes con transporte bloqueado y tres escenarios integrales:
SDK+callables, navegador y emuladores ausentes. Preferencias escritas por el
callable fueron leídas por el SDK propietario. Navegador 1280×800 y 390×844:
HTTP 200, 12 solicitudes bloqueadas por CSP, cero errores de inicialización
Firebase. Seed sintético ejecutado; sin claims administrativos.

No se modificaron consumidores, ni se certifica interacción completa de UI de
biblioteca/autosave/dashboard mediante estos probes de sus operaciones/queries.
No se ejecutaron publicación/checkout/RSVP HTTP/preview de backend, IA, correo,
triggers/schedulers ni proveedores operativos: continúan bloqueados por 4A.
Tampoco Node 20, SDK móvil, índices desplegados, IAM, URLs firmadas/tokens,
retención/lifecycle remoto, lint/CI global ni migradores. Denegar SDK no demuestra
revocación de URLs ni certifica entrega HTTP pública.

## Archivos y alcance residual

| Archivo | Cambio de esta fase |
| --- | --- |
| firestore.rules | Propiedad específica y writes de publicación/visitas exclusivos del backend; exclusiones completas del grant coincidente |
| storage.rules | UID en imagen/thumbnail y todo publicadas/** sin writes cliente; compatibilidad residual explícita |
| scripts/local/rulesCases.mjs | 344 casos nuevos, manteniendo los 316 originales y todas sus expectativas |
| scripts/local/rules.test.mjs | Queries con orden/límite/cursor, collectionGroup, reemplazo sin owner y listado Storage que comprueba items o prefixes |
| scripts/local/session.cjs; environment.test.mjs | Discovery local acotado a 60 s y validación del override; sin nuevos destinos o handlers |
| SECURITY_CONTRACT.md; SYSTEM_FRAGILITY_MAP.md | Matriz efectiva, operaciones pendientes y mitigación parcial F10/F11; Q1 y F12 conservados |
| DEVELOPMENT_WORKFLOW.md; DOCUMENTATION_INDEX.md | Timeout local, navegación y referencia a esta comparación |
| Este informe | Selección previa, evidencia y comparación por ID; no reemplaza la autoridad ni la línea base |

F10/F11 siguen abiertos: catálogos, analytics/auditorías, clientIssues, countdowns,
legacy, subcolecciones no modeladas y otros folders de usuarios conservan grants
observados. Perfil/RSVP/historial propios, lecturas crudas propias de visitas y
SDK read autenticado de artefactos publicados siguen pendientes según matriz.
La corrección local no prueba su aplicación remota. F12 permanece parcialmente
resuelto; Q1 sigue propuesta sin aceptación ni cambios de helpers/claims.

Próximo alcance: decidir qué escrituras propias deben quedar sólo en backend y
qué lecturas crudas retirar, junto con tratamiento de descendientes/legacy; para
administración, resolver Q1-A (representación/capacidades), Q1-B (operadores y
aprobadores) y Q1-C (frescura/compatibilidad). Los countdowns A4 requieren una tarea
separada. Cualquier aplicación remota requiere autorización y evidencia de
hashes desplegados, índices, IAM/canales de entrega y canarios separada del demo.

## Reproducción y conservación

Usar los cuatro comandos del [runbook](../operations/DEVELOPMENT_WORKFLOW.md#rules-4b1),
siempre desde una sesión nueva. test:local:rules permanece separado de CI y de
test:local; su salida 1 sigue siendo correcta mientras fallen los cinco A4.
La selección y resultados legibles por ID están abajo; datos completos sintéticos,
logs de comandos, markers y manifests están en .local-isolation/phase4b2a/:
commands.json, selection-before-rules.json, comparison-by-id.json,
verified-source-hashes.json y evidence/session-*/. Son evidencia local ignorada
por Git y regenerable. Se conserva el mínimo JSON/log antes de limpiar sólo
las cuatro sesiones propias detenidas, mediante el clean del launcher.

Validación final: las cuatro sesiones propias fueron eliminadas y los ocho
puertos dedicados quedaron libres. `preservation.json` confirma **11.202 archivos
preexistentes fuera del alcance con hashes idénticos**, diez archivos existentes
modificados dentro del alcance y sólo este informe agregado; cero faltantes o
cambios inesperados. Se conservan las copias previas de los archivos intervenidos.
La línea base 4B1, los bloques Q1/F12, helpers administrativos y guards de efectos
mantienen su contenido anterior. Se revisó el diff propio contra ese estado
inicial, incluidos archivos sin seguimiento; `git diff --check` terminó en 0.
`links.json`, `cleanup.json` y `content-check.json` registran verificaciones
complementarias. No se realizaron operaciones remotas, commits ni cambios de CI.

## Comparación por ID

S = ID seleccionado antes de editar (los 134 A1/A2 de 4B1). Los nuevos casos
no tenían resultado histórico: «nuevo» no significa omitido en esta fase.
Actor, recurso y operación se resuelven por el ID estable en
[rulesCases.mjs](../../scripts/local/rulesCases.mjs) y en comparison-by-id.json.
Las autoridades A1–A4/C1/C2/Q1 están declaradas en ese catálogo y la matriz.
Para C/Q, coincide sólo describe una observación, nunca una aceptación de política.

| ID | S | Grupo | Esperado | 4B1 observado | 4B2A observado | Clasificación |
| --- | --- | --- | --- | --- | --- | --- |
| profile-owner-get | S | acceptance | allow | allow | allow | cumple |
| profile-cross-get | S | acceptance | deny | allow | deny | cumple |
| profile-anonymous-get | S | acceptance | deny | deny | deny | cumple |
| profile-cross-create | S | acceptance | deny | allow | deny | cumple |
| profile-cross-update | S | acceptance | deny | allow | deny | cumple |
| profile-cross-delete | S | acceptance | deny | allow | deny | cumple |
| profile-unfiltered-list | S | acceptance | deny | allow | deny | cumple |
| image-owner-get | S | acceptance | allow | allow | allow | cumple |
| image-cross-get | S | acceptance | deny | allow | deny | cumple |
| image-anonymous-get | S | acceptance | deny | deny | deny | cumple |
| image-cross-create | S | acceptance | deny | allow | deny | cumple |
| image-cross-update | S | acceptance | deny | allow | deny | cumple |
| image-cross-delete | S | acceptance | deny | allow | deny | cumple |
| image-A-list | S | acceptance | allow | allow | allow | cumple |
| image-B-list | S | acceptance | deny | allow | deny | cumple |
| draft-owner-get | S | acceptance | allow | allow | allow | cumple |
| draft-cross-get | S | acceptance | deny | deny | deny | cumple |
| draft-anonymous-get | S | acceptance | deny | deny | deny | cumple |
| draft-cross-create | S | acceptance | deny | deny | deny | cumple |
| draft-cross-update | S | acceptance | deny | deny | deny | cumple |
| draft-cross-delete | S | acceptance | deny | deny | deny | cumple |
| draft-owner-list | S | acceptance | allow | allow | allow | cumple |
| draft-unfiltered-list | S | acceptance | deny | deny | deny | cumple |
| draft-foreign-filter | S | acceptance | deny | deny | deny | cumple |
| publication-owner-get | S | acceptance | allow | allow | allow | cumple |
| publication-cross-get | S | acceptance | deny | allow | deny | cumple |
| publication-anonymous-get | S | acceptance | deny | deny | deny | cumple |
| publication-cross-create | S | acceptance | deny | allow | deny | cumple |
| publication-cross-update | S | acceptance | deny | allow | deny | cumple |
| publication-cross-delete | S | acceptance | deny | allow | deny | cumple |
| publication-owner-list | S | acceptance | allow | allow | allow | cumple |
| publication-unfiltered-list | S | acceptance | deny | allow | deny | cumple |
| publication-foreign-filter | S | acceptance | deny | allow | deny | cumple |
| history-owner-get | S | acceptance | allow | allow | allow | cumple |
| history-cross-get | S | acceptance | deny | allow | deny | cumple |
| history-anonymous-get | S | acceptance | deny | deny | deny | cumple |
| history-cross-create | S | acceptance | deny | allow | deny | cumple |
| history-cross-update | S | acceptance | deny | allow | deny | cumple |
| history-cross-delete | S | acceptance | deny | allow | deny | cumple |
| history-owner-list | S | acceptance | allow | allow | allow | cumple |
| history-unfiltered-list | S | acceptance | deny | allow | deny | cumple |
| history-foreign-filter | S | acceptance | deny | allow | deny | cumple |
| draft-owner-create | S | acceptance | allow | allow | allow | cumple |
| image-owner-create | S | acceptance | allow | allow | allow | cumple |
| draft-owner-update | S | acceptance | allow | allow | allow | cumple |
| image-owner-update | S | acceptance | allow | allow | allow | cumple |
| draft-owner-delete | S | acceptance | allow | allow | allow | cumple |
| image-owner-delete | S | acceptance | allow | allow | allow | cumple |
| draft-change-owner | S | acceptance | deny | deny | deny | cumple |
| draft-remove-owner | S | acceptance | deny | deny | deny | cumple |
| draft-spoof-create | S | acceptance | deny | deny | deny | cumple |
| publication-change-owner | S | acceptance | deny | allow | deny | cumple |
| history-change-owner | S | acceptance | deny | allow | deny | cumple |
| profile-cross-owner-field | S | acceptance | deny | allow | deny | cumple |
| rsvps-cross-get | S | acceptance | deny | allow | deny | cumple |
| rsvps-cross-update | S | acceptance | deny | allow | deny | cumple |
| rsvps-owner-list | S | acceptance | allow | allow | allow | cumple |
| rsvps-cross-list | S | acceptance | deny | allow | deny | cumple |
| visits-cross-get | S | acceptance | deny | allow | deny | cumple |
| visits-cross-update | S | acceptance | deny | allow | deny | cumple |
| visits-owner-create | S | acceptance | deny | allow | deny | cumple |
| visits-owner-update | S | acceptance | deny | allow | deny | cumple |
| visits-owner-delete | S | acceptance | deny | allow | deny | cumple |
| uniqueVisitors-cross-get | S | acceptance | deny | allow | deny | cumple |
| uniqueVisitors-cross-update | S | acceptance | deny | allow | deny | cumple |
| uniqueVisitors-owner-create | S | acceptance | deny | allow | deny | cumple |
| uniqueVisitors-owner-update | S | acceptance | deny | allow | deny | cumple |
| uniqueVisitors-owner-delete | S | acceptance | deny | allow | deny | cumple |
| publication-owner-create | S | acceptance | deny | allow | deny | cumple |
| checkout-owner-create | S | acceptance | deny | deny | deny | cumple |
| publication-owner-update | S | acceptance | deny | allow | deny | cumple |
| checkout-owner-update | S | acceptance | deny | deny | deny | cumple |
| publication-owner-delete | S | acceptance | deny | allow | deny | cumple |
| checkout-owner-delete | S | acceptance | deny | deny | deny | cumple |
| draft-foreign-publication-link | — | characterization | allow | allow | allow | pendiente de política |
| image-foreign-storage-reference | — | characterization | allow | allow | allow | pendiente de política |
| draft-unmodeled-subcollection | — | characterization | deny | deny | deny | pendiente de política |
| profile-self-role-field | — | characterization | allow | allow | allow | pendiente de política |
| countdown-private-draft | — | acceptance | deny | allow | allow | vulnera |
| countdown-immutable-A-update | — | acceptance | deny | allow | allow | vulnera |
| countdown-immutable-A-delete | — | acceptance | deny | allow | allow | vulnera |
| countdown-immutable-admin-update | — | acceptance | deny | allow | allow | vulnera |
| countdown-immutable-admin-delete | — | acceptance | deny | allow | allow | vulnera |
| analyticsEvents-overlap-read | — | characterization | allow | allow | allow | pendiente de política |
| analyticsEvents-overlap-write | — | characterization | allow | allow | allow | pendiente de política |
| analyticsUsers-overlap-read | — | characterization | allow | allow | allow | pendiente de política |
| analyticsUsers-overlap-write | — | characterization | allow | allow | allow | pendiente de política |
| analyticsInvitations-overlap-read | — | characterization | allow | allow | allow | pendiente de política |
| analyticsInvitations-overlap-write | — | characterization | allow | allow | allow | pendiente de política |
| analyticsDaily-overlap-read | — | characterization | allow | allow | allow | pendiente de política |
| analyticsDaily-overlap-write | — | characterization | allow | allow | allow | pendiente de política |
| analyticsWeekly-overlap-read | — | characterization | allow | allow | allow | pendiente de política |
| analyticsWeekly-overlap-write | — | characterization | allow | allow | allow | pendiente de política |
| analyticsMonthly-overlap-read | — | characterization | allow | allow | allow | pendiente de política |
| analyticsMonthly-overlap-write | — | characterization | allow | allow | allow | pendiente de política |
| analyticsTemplates-overlap-read | — | characterization | allow | allow | allow | pendiente de política |
| analyticsTemplates-overlap-write | — | characterization | allow | allow | allow | pendiente de política |
| analyticsCohorts-overlap-read | — | characterization | allow | allow | allow | pendiente de política |
| analyticsCohorts-overlap-write | — | characterization | allow | allow | allow | pendiente de política |
| analyticsJobs-overlap-read | — | characterization | allow | allow | allow | pendiente de política |
| analyticsJobs-overlap-write | — | characterization | allow | allow | allow | pendiente de política |
| analyticsExports-overlap-read | — | characterization | allow | allow | allow | pendiente de política |
| analyticsExports-overlap-write | — | characterization | allow | allow | allow | pendiente de política |
| iconos_audit-overlap-read | — | characterization | allow | allow | allow | pendiente de política |
| iconos_audit-overlap-write | — | characterization | allow | allow | allow | pendiente de política |
| iconos_usage_snapshots-overlap-read | — | characterization | allow | allow | allow | pendiente de política |
| iconos_usage_snapshots-overlap-write | — | characterization | allow | allow | allow | pendiente de política |
| decoraciones_audit-overlap-read | — | characterization | allow | allow | allow | pendiente de política |
| decoraciones_audit-overlap-write | — | characterization | allow | allow | allow | pendiente de política |
| fallback-analyticsDaily-users | — | characterization | allow | allow | allow | pendiente de política |
| fallback-analyticsWeekly-templates | — | characterization | allow | allow | allow | pendiente de política |
| fallback-analyticsCohorts-periods | — | characterization | allow | allow | allow | pendiente de política |
| fallback-countdownPresets-versions | — | characterization | allow | allow | allow | pendiente de política |
| fallback-countdownPresets-operations | — | characterization | allow | allow | allow | pendiente de política |
| fallback-clientIssues-root | — | characterization | allow | allow | allow | pendiente de política |
| fallback-text_presets-root | — | characterization | allow | allow | allow | pendiente de política |
| fallback-plantillas_secciones-root | — | characterization | allow | allow | allow | pendiente de política |
| fallback-invitaciones-root | — | characterization | allow | allow | allow | pendiente de política |
| fallback-unmodeled_4b1-root | — | characterization | allow | allow | allow | pendiente de política |
| iconos-ordinary-read | — | characterization | allow | allow | allow | pendiente de política |
| iconos-ordinary-create | — | characterization | allow | allow | allow | pendiente de política |
| iconos-ordinary-update | — | characterization | allow | allow | allow | pendiente de política |
| iconos-ordinary-delete | — | characterization | allow | allow | allow | pendiente de política |
| iconos_archived-ordinary-read | — | characterization | allow | allow | allow | pendiente de política |
| iconos_archived-ordinary-create | — | characterization | allow | allow | allow | pendiente de política |
| iconos_archived-ordinary-update | — | characterization | allow | allow | allow | pendiente de política |
| iconos_archived-ordinary-delete | — | characterization | allow | allow | allow | pendiente de política |
| decoraciones-ordinary-read | — | characterization | allow | allow | allow | pendiente de política |
| decoraciones-ordinary-create | — | characterization | allow | allow | allow | pendiente de política |
| decoraciones-ordinary-update | — | characterization | allow | allow | allow | pendiente de política |
| decoraciones-ordinary-delete | — | characterization | allow | allow | allow | pendiente de política |
| decoraciones_archived-ordinary-read | — | characterization | allow | allow | allow | pendiente de política |
| decoraciones_archived-ordinary-create | — | characterization | allow | allow | allow | pendiente de política |
| decoraciones_archived-ordinary-update | — | characterization | allow | allow | allow | pendiente de política |
| decoraciones_archived-ordinary-delete | — | characterization | allow | allow | allow | pendiente de política |
| exclusive-site_settings-root | — | characterization | deny | deny | deny | pendiente de política |
| exclusive-site_settings-history | — | characterization | deny | deny | deny | pendiente de política |
| exclusive-app_config-root | — | characterization | deny | deny | deny | pendiente de política |
| exclusive-plantillas_tags-root | — | characterization | deny | deny | deny | pendiente de política |
| exclusive-public_slug_reservations-root | — | characterization | deny | deny | deny | pendiente de política |
| exclusive-publication_discount_codes-root | — | characterization | deny | deny | deny | pendiente de política |
| exclusive-publication_discount_code_usage-root | — | characterization | deny | deny | deny | pendiente de política |
| template-auth-published-get | — | characterization | allow | allow | allow | pendiente de política |
| template-anonymous-get | — | characterization | deny | deny | deny | pendiente de política |
| template-legacy-missing-gates | — | characterization | allow | allow | allow | pendiente de política |
| template-unpublished-get | — | characterization | deny | deny | deny | pendiente de política |
| template-admin-write | — | characterization | deny | deny | deny | pendiente de política |
| catalog-public-get | — | characterization | allow | allow | allow | pendiente de política |
| catalog-public-filtered-list | — | characterization | allow | allow | allow | pendiente de política |
| catalog-unfiltered-list | — | characterization | deny | deny | deny | pendiente de política |
| provider-proveedores-anonymous-create | — | acceptance | deny | deny | deny | cumple |
| provider-proveedores-anonymous-update | — | acceptance | deny | deny | deny | cumple |
| provider-proveedores-anonymous-delete | — | acceptance | deny | deny | deny | cumple |
| provider-proveedores-A-create | — | acceptance | deny | deny | deny | cumple |
| provider-proveedores-A-update | — | acceptance | deny | deny | deny | cumple |
| provider-proveedores-A-delete | — | acceptance | deny | deny | deny | cumple |
| provider-categorias_proveedores-anonymous-create | — | acceptance | deny | deny | deny | cumple |
| provider-categorias_proveedores-anonymous-update | — | acceptance | deny | deny | deny | cumple |
| provider-categorias_proveedores-anonymous-delete | — | acceptance | deny | deny | deny | cumple |
| provider-categorias_proveedores-A-create | — | acceptance | deny | deny | deny | cumple |
| provider-categorias_proveedores-A-update | — | acceptance | deny | deny | deny | cumple |
| provider-categorias_proveedores-A-delete | — | acceptance | deny | deny | deny | cumple |
| provider-public-tuple | — | characterization | allow | allow | allow | pendiente de política |
| provider-hidden | — | characterization | deny | deny | deny | pendiente de política |
| provider-inactive | — | characterization | deny | deny | deny | pendiente de política |
| provider-subcollection | — | characterization | deny | deny | deny | pendiente de política |
| provider-admin-malformed | — | characterization | deny | deny | deny | pendiente de política |
| provider-category-public | — | characterization | allow | allow | allow | pendiente de política |
| storage-usuarios-A-get | S | acceptance | allow | allow | allow | cumple |
| storage-usuarios-A-create | S | acceptance | allow | allow | allow | cumple |
| storage-usuarios-A-update | S | acceptance | allow | allow | allow | cumple |
| storage-usuarios-A-delete | S | acceptance | allow | allow | allow | cumple |
| storage-usuarios-B-get | S | acceptance | deny | allow | deny | cumple |
| storage-usuarios-B-create | S | acceptance | deny | allow | deny | cumple |
| storage-usuarios-B-update | S | acceptance | deny | allow | deny | cumple |
| storage-usuarios-B-delete | S | acceptance | deny | allow | deny | cumple |
| storage-usuarios-anonymous-get | S | acceptance | deny | deny | deny | cumple |
| storage-usuarios-anonymous-create | S | acceptance | deny | deny | deny | cumple |
| storage-usuarios-anonymous-update | S | acceptance | deny | deny | deny | cumple |
| storage-usuarios-anonymous-delete | S | acceptance | deny | deny | deny | cumple |
| storage-usuarios-A-list | S | acceptance | allow | allow | allow | cumple |
| storage-usuarios-B-list | S | acceptance | deny | allow | deny | cumple |
| storage-user-thumbnail-A-get | S | acceptance | allow | allow | allow | cumple |
| storage-user-thumbnail-A-create | S | acceptance | allow | allow | allow | cumple |
| storage-user-thumbnail-A-update | S | acceptance | allow | allow | allow | cumple |
| storage-user-thumbnail-A-delete | S | acceptance | allow | allow | allow | cumple |
| storage-user-thumbnail-B-get | S | acceptance | deny | allow | deny | cumple |
| storage-user-thumbnail-B-create | S | acceptance | deny | allow | deny | cumple |
| storage-user-thumbnail-B-update | S | acceptance | deny | allow | deny | cumple |
| storage-user-thumbnail-B-delete | S | acceptance | deny | allow | deny | cumple |
| storage-user-thumbnail-anonymous-get | S | acceptance | deny | deny | deny | cumple |
| storage-user-thumbnail-anonymous-create | S | acceptance | deny | deny | deny | cumple |
| storage-user-thumbnail-anonymous-update | S | acceptance | deny | deny | deny | cumple |
| storage-user-thumbnail-anonymous-delete | S | acceptance | deny | deny | deny | cumple |
| storage-user-thumbnail-A-list | S | acceptance | allow | allow | allow | cumple |
| storage-user-thumbnail-B-list | S | acceptance | deny | allow | deny | cumple |
| storage-thumbnails_borradores-A-get | S | acceptance | allow | allow | allow | cumple |
| storage-thumbnails_borradores-A-create | S | acceptance | allow | allow | allow | cumple |
| storage-thumbnails_borradores-A-update | S | acceptance | allow | allow | allow | cumple |
| storage-thumbnails_borradores-A-delete | S | acceptance | allow | allow | allow | cumple |
| storage-thumbnails_borradores-B-get | S | acceptance | deny | allow | deny | cumple |
| storage-thumbnails_borradores-B-create | S | acceptance | deny | allow | deny | cumple |
| storage-thumbnails_borradores-B-update | S | acceptance | deny | allow | deny | cumple |
| storage-thumbnails_borradores-B-delete | S | acceptance | deny | allow | deny | cumple |
| storage-thumbnails_borradores-anonymous-get | S | acceptance | deny | deny | deny | cumple |
| storage-thumbnails_borradores-anonymous-create | S | acceptance | deny | deny | deny | cumple |
| storage-thumbnails_borradores-anonymous-update | S | acceptance | deny | deny | deny | cumple |
| storage-thumbnails_borradores-anonymous-delete | S | acceptance | deny | deny | deny | cumple |
| storage-thumbnails_borradores-A-list | S | acceptance | allow | allow | allow | cumple |
| storage-thumbnails_borradores-B-list | S | acceptance | deny | allow | deny | cumple |
| published-index.html-A-create | S | acceptance | deny | allow | deny | cumple |
| published-index.html-A-update | S | acceptance | deny | allow | deny | cumple |
| published-index.html-A-delete | S | acceptance | deny | allow | deny | cumple |
| published-index.html-B-create | S | acceptance | deny | allow | deny | cumple |
| published-index.html-B-update | S | acceptance | deny | allow | deny | cumple |
| published-index.html-B-delete | S | acceptance | deny | allow | deny | cumple |
| published-index.html-admin-create | S | acceptance | deny | allow | deny | cumple |
| published-index.html-admin-update | S | acceptance | deny | allow | deny | cumple |
| published-index.html-admin-delete | S | acceptance | deny | allow | deny | cumple |
| published-share.jpg-A-create | S | acceptance | deny | allow | deny | cumple |
| published-share.jpg-A-update | S | acceptance | deny | allow | deny | cumple |
| published-share.jpg-A-delete | S | acceptance | deny | allow | deny | cumple |
| published-share.jpg-B-create | S | acceptance | deny | allow | deny | cumple |
| published-share.jpg-B-update | S | acceptance | deny | allow | deny | cumple |
| published-share.jpg-B-delete | S | acceptance | deny | allow | deny | cumple |
| published-share.jpg-admin-create | S | acceptance | deny | allow | deny | cumple |
| published-share.jpg-admin-update | S | acceptance | deny | allow | deny | cumple |
| published-share.jpg-admin-delete | S | acceptance | deny | allow | deny | cumple |
| published-anonymous-sdk-get | — | characterization | deny | deny | deny | pendiente de política |
| storage-fallback-iconos-get | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-iconos-update | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-iconos-delete | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-iconos_archived-get | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-iconos_archived-update | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-iconos_archived-delete | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-decoraciones-originals-get | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-decoraciones-originals-update | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-decoraciones-originals-delete | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-decoraciones-thumbnails-get | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-decoraciones-thumbnails-update | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-decoraciones-thumbnails-delete | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-plantillas-ID-assets-get | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-plantillas-ID-assets-update | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-plantillas-ID-assets-delete | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-plantillas_secciones-get | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-plantillas_secciones-update | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-plantillas_secciones-delete | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-public-get | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-public-update | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-public-delete | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-previews-plantillas-get | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-previews-plantillas-update | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-previews-plantillas-delete | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-user_uploads-A-get | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-user_uploads-A-update | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-user_uploads-A-delete | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-borradores-ID-get | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-borradores-ID-update | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-borradores-ID-delete | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-assets-countdown-staging-ID-get | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-assets-countdown-staging-ID-update | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-assets-countdown-staging-ID-delete | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-assets-countdown-frames-ID-operations-op-get | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-assets-countdown-frames-ID-operations-op-update | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-assets-countdown-frames-ID-operations-op-delete | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-analytics-exports-raw-2026-09-get | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-analytics-exports-raw-2026-09-update | — | characterization | allow | allow | allow | pendiente de política |
| storage-fallback-analytics-exports-raw-2026-09-delete | — | characterization | allow | allow | allow | pendiente de política |
| provider-storage-anonymous-create | — | acceptance | deny | deny | deny | cumple |
| provider-storage-anonymous-update | — | acceptance | deny | deny | deny | cumple |
| provider-storage-anonymous-delete | — | acceptance | deny | deny | deny | cumple |
| provider-storage-A-create | — | acceptance | deny | deny | deny | cumple |
| provider-storage-A-update | — | acceptance | deny | deny | deny | cumple |
| provider-storage-A-delete | — | acceptance | deny | deny | deny | cumple |
| provider-storage-public | — | characterization | allow | allow | allow | pendiente de política |
| provider-storage-hidden | — | characterization | deny | deny | deny | pendiente de política |
| provider-storage-admin-valid | — | characterization | allow | allow | allow | pendiente de política |
| provider-storage-admin-mime | — | characterization | deny | deny | deny | pendiente de política |
| provider-storage-admin-size | — | characterization | deny | deny | deny | pendiente de política |
| provider-storage-admin-path | — | characterization | deny | deny | deny | pendiente de política |
| q1-admin-firestore | — | characterization | allow | allow | allow | pendiente de política |
| q1-admin-storage | — | characterization | allow | allow | allow | pendiente de política |
| q1-admin-backend-admin | — | characterization | allow | allow | allow | pendiente de política |
| q1-admin-backend-super | — | characterization | deny | deny | deny | pendiente de política |
| q1-superclaim-firestore | — | characterization | allow | allow | allow | pendiente de política |
| q1-superclaim-storage | — | characterization | allow | allow | allow | pendiente de política |
| q1-superclaim-backend-admin | — | characterization | deny | deny | deny | pendiente de política |
| q1-superclaim-backend-super | — | characterization | deny | deny | deny | pendiente de política |
| q1-role-firestore | — | characterization | allow | allow | allow | pendiente de política |
| q1-role-storage | — | characterization | allow | allow | allow | pendiente de política |
| q1-role-backend-admin | — | characterization | deny | deny | deny | pendiente de política |
| q1-role-backend-super | — | characterization | deny | deny | deny | pendiente de política |
| q1-stringAdmin-firestore | — | characterization | deny | deny | deny | pendiente de política |
| q1-stringAdmin-storage | — | characterization | deny | deny | deny | pendiente de política |
| q1-stringAdmin-backend-admin | — | characterization | deny | deny | deny | pendiente de política |
| q1-stringAdmin-backend-super | — | characterization | deny | deny | deny | pendiente de política |
| q1-serverSuper-firestore | — | characterization | deny | deny | deny | pendiente de política |
| q1-serverSuper-storage | — | characterization | deny | deny | deny | pendiente de política |
| q1-serverSuper-backend-admin | — | characterization | allow | allow | allow | pendiente de política |
| q1-serverSuper-backend-super | — | characterization | allow | allow | allow | pendiente de política |
| q1-A-firestore | — | characterization | deny | deny | deny | pendiente de política |
| q1-A-storage | — | characterization | deny | deny | deny | pendiente de política |
| q1-A-backend-admin | — | characterization | deny | deny | deny | pendiente de política |
| q1-A-backend-super | — | characterization | deny | deny | deny | pendiente de política |
| proposal-canonicalAdmin-firestore | — | proposal | allow | deny | deny | pendiente de política |
| proposal-canonicalAdmin-storage | — | proposal | allow | deny | deny | pendiente de política |
| proposal-canonicalAdmin-backend | — | proposal | allow | deny | deny | pendiente de política |
| proposal-canonicalSuper-firestore | — | proposal | allow | deny | deny | pendiente de política |
| proposal-canonicalSuper-storage | — | proposal | allow | deny | deny | pendiente de política |
| proposal-canonicalSuper-backend | — | proposal | allow | deny | deny | pendiente de política |
| proposal-superclaim-firestore | — | proposal | deny | allow | allow | pendiente de política |
| proposal-superclaim-storage | — | proposal | deny | allow | allow | pendiente de política |
| proposal-superclaim-backend | — | proposal | deny | deny | deny | pendiente de política |
| proposal-role-firestore | — | proposal | deny | allow | allow | pendiente de política |
| proposal-role-storage | — | proposal | deny | allow | allow | pendiente de política |
| proposal-role-backend | — | proposal | deny | deny | deny | pendiente de política |
| 4b2a-profile-anonymous-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-profile-anonymous-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-profile-anonymous-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-profile-admin-foreign-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-profile-superclaim-foreign-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-profile-role-foreign-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-image-anonymous-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-image-anonymous-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-image-anonymous-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-image-admin-foreign-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-image-superclaim-foreign-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-image-role-foreign-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-draft-anonymous-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-draft-anonymous-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-draft-anonymous-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-draft-admin-foreign-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-draft-superclaim-foreign-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-draft-role-foreign-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-publication-anonymous-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-publication-anonymous-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-publication-anonymous-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-publication-admin-foreign-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-publication-superclaim-foreign-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-publication-role-foreign-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-history-anonymous-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-history-anonymous-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-history-anonymous-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-history-admin-foreign-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-history-superclaim-foreign-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-history-role-foreign-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-draft-create-foreign-owner | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-draft-create-absent-owner | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-draft-create-null-owner | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-draft-create-number-owner | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-draft-replace-without-owner | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-history-create-foreign-owner | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-history-create-absent-owner | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-history-create-null-owner | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-history-create-number-owner | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-history-replace-without-owner | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-history-remove-owner | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-publication-remove-owner | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-rsvps-B-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-rsvps-B-list | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-rsvps-B-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-rsvps-B-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-rsvps-B-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-rsvps-anonymous-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-rsvps-anonymous-list | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-rsvps-anonymous-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-rsvps-anonymous-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-rsvps-anonymous-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-rsvps-admin-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-rsvps-admin-list | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-rsvps-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-rsvps-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-rsvps-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-rsvps-orphan-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-rsvps-nested-cross-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-rsvps-owner-get | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-rsvps-group-query | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-B-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-B-list | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-B-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-B-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-B-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-anonymous-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-anonymous-list | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-anonymous-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-anonymous-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-anonymous-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-admin-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-admin-list | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-orphan-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-nested-cross-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-owner-raw-get | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-visits-owner-raw-list | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-visits-nested-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-nested-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-visits-nested-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-B-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-B-list | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-B-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-B-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-B-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-anonymous-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-anonymous-list | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-anonymous-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-anonymous-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-anonymous-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-admin-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-admin-list | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-orphan-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-nested-cross-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-owner-raw-get | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-uniqueVisitors-owner-raw-list | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-uniqueVisitors-nested-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-nested-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-uniqueVisitors-nested-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-publication-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-publication-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-publication-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-publication-superclaim-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-publication-superclaim-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-publication-superclaim-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-publication-role-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-publication-role-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-publication-role-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-visits-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-visits-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-visits-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-visits-superclaim-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-visits-superclaim-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-visits-superclaim-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-visits-role-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-visits-role-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-visits-role-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-uniqueVisitors-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-uniqueVisitors-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-uniqueVisitors-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-uniqueVisitors-superclaim-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-uniqueVisitors-superclaim-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-uniqueVisitors-superclaim-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-uniqueVisitors-role-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-uniqueVisitors-role-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-uniqueVisitors-role-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-checkout-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-checkout-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-checkout-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-checkout-superclaim-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-checkout-superclaim-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-checkout-superclaim-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-checkout-role-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-checkout-role-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-checkout-role-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-checkout-child-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-checkout-child-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-checkout-child-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-checkout-child-superclaim-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-checkout-child-superclaim-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-checkout-child-superclaim-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-checkout-child-role-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-checkout-child-role-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-checkout-child-role-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-reservation-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-reservation-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-reservation-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-reservation-superclaim-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-reservation-superclaim-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-reservation-superclaim-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-reservation-role-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-reservation-role-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-reservation-role-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-discount-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-discount-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-discount-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-discount-superclaim-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-discount-superclaim-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-discount-superclaim-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-discount-role-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-discount-role-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-discount-role-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-discount-usage-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-discount-usage-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-discount-usage-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-discount-usage-superclaim-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-discount-usage-superclaim-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-discount-usage-superclaim-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-discount-usage-role-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-discount-usage-role-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-backend-discount-usage-role-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-publication-consumer-query | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-history-consumer-query | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-image-consumer-query | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-image-consumer-next-page | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-pending-profile-owner-create | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-pending-profile-owner-update | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-pending-profile-owner-delete | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-pending-history-owner-create | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-pending-history-owner-update | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-pending-history-owner-delete | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-pending-rsvps-owner-create | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-pending-rsvps-owner-update | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-pending-rsvps-owner-delete | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-residual-usuarios | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-residual-publicadas | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-residual-publicadas_historial | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-storage-images-prefix-object-A-get | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-images-prefix-object-A-create | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-images-prefix-object-A-update | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-images-prefix-object-A-delete | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-images-prefix-object-B-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-prefix-object-B-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-prefix-object-B-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-prefix-object-B-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-prefix-object-admin-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-prefix-object-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-prefix-object-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-prefix-object-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-prefix-object-anonymous-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-prefix-object-anonymous-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-prefix-object-anonymous-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-prefix-object-anonymous-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-nested-A-get | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-images-nested-A-create | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-images-nested-A-update | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-images-nested-A-delete | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-images-nested-B-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-nested-B-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-nested-B-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-nested-B-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-nested-admin-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-nested-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-nested-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-nested-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-nested-anonymous-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-nested-anonymous-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-nested-anonymous-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-nested-anonymous-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-images-anonymous-list | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-A-get | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-thumbnails-prefix-object-A-create | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-thumbnails-prefix-object-A-update | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-thumbnails-prefix-object-A-delete | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-thumbnails-prefix-object-B-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-B-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-B-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-B-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-admin-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-anonymous-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-anonymous-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-anonymous-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-prefix-object-anonymous-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-nested-A-get | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-thumbnails-nested-A-create | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-thumbnails-nested-A-update | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-thumbnails-nested-A-delete | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-thumbnails-nested-B-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-nested-B-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-nested-B-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-nested-B-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-nested-admin-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-nested-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-nested-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-nested-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-nested-anonymous-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-nested-anonymous-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-nested-anonymous-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-nested-anonymous-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-thumbnails-anonymous-list | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-A-get | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-A-create | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-A-update | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-A-delete | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-B-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-B-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-B-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-B-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-admin-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-anonymous-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-anonymous-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-anonymous-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-prefix-object-anonymous-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-A-get | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-draft-thumbnails-nested-A-create | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-draft-thumbnails-nested-A-update | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-draft-thumbnails-nested-A-delete | — | acceptance | allow | nuevo | allow | cumple |
| 4b2a-storage-draft-thumbnails-nested-B-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-B-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-B-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-B-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-admin-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-anonymous-get | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-anonymous-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-anonymous-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-nested-anonymous-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-draft-thumbnails-anonymous-list | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-root-list-usuarios | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-root-list-usuarios-{A} | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-storage-root-list-thumbnails_borradores | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-root-A-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-root-A-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-root-A-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-root-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-root-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-root-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-root-superclaim-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-root-superclaim-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-root-superclaim-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-root-role-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-root-role-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-root-role-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-root-anonymous-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-root-anonymous-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-root-anonymous-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-slug-A-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-slug-A-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-slug-A-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-slug-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-slug-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-slug-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-slug-superclaim-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-slug-superclaim-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-slug-superclaim-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-slug-role-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-slug-role-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-slug-role-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-slug-anonymous-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-slug-anonymous-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-slug-anonymous-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-nested-A-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-nested-A-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-nested-A-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-nested-admin-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-nested-admin-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-nested-admin-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-nested-superclaim-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-nested-superclaim-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-nested-superclaim-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-nested-role-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-nested-role-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-nested-role-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-nested-anonymous-create | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-nested-anonymous-update | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-nested-anonymous-delete | — | acceptance | deny | nuevo | deny | cumple |
| 4b2a-published-auth-sdk-get | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-storage-residual-usuarios-{A}-imagenes_legacy-{ID}.png | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-storage-residual-usuarios-{A}-unmodeled-{ID}.png | — | characterization | allow | nuevo | allow | pendiente de política |
| 4b2a-storage-residual-publicadas_legacy-{ID}.html | — | characterization | allow | nuevo | allow | pendiente de política |
