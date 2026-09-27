# Functions: reconciliación remota y verificación Email — 27/09/2026

Status: Historical Operational Diagnostic Evidence. **Snapshot previo al retiro
controlado del trigger, realizado después en la misma fecha.** El
[saneamiento posterior](DEFAULT_DEPLOY_READINESS.md) registra el inventario final
107, los bloqueos iniciales y su cierre al adoptar los límites actuales en source.
El cuerpo siguiente conserva
los resultados de esta reconciliación; el cierre productivo Email sigue pendiente.

La autoridad de asignaciones sigue siendo
[Functions ownership](../architecture/FUNCTIONS_CODEBASE_OWNERSHIP.md) y su registro
local. Este informe no cambia dominios, exports, opciones ni comportamiento.
Se revisó HEAD `7308b8c7` junto con la Etapa 1 implementada sin commit. No se
desplegó, eliminó, activó ni modificó ningún recurso remoto.

## Inventario y gates A1/A2

[Baseline sanitizado](baselines/functions-reconciliation-2026-09-27.json): listas
v2 de todas las regiones, corroboración Auth por v1, comparación con manifiestos
SDK nuevos y `functionOwnership.json`. Las fechas UTC de ambas consultas están
en el baseline. V2 también devuelve Auth gen1: no se suma otra vez la respuesta v1.
Los 108 recursos están ACTIVE, en us-central1, con runtime nodejs20.

| Codebase | Local | Remoto antes | Remoto después |
| --- | ---: | ---: | ---: |
| default / core | 101 | 102 | 102 |
| payments | 3 | 3 | 3 |
| email | 3 | 3 | 3 |
| Total | 107 | 108 | 108 |

**HECHOS:** local solamente: ninguno. Remoto solamente:
`generatePublishedShareImage`. Cero duplicados de nombre/región y cero errores
de ownership entre los 107 recursos compartidos. Metadata remota antes/después
idéntica, normalizando el orden irrelevante de filtros y bindings. No se consultó
Secret Manager `access`; los bindings y versiones son metadatos.

La comparación usa el convertidor y resolución CPU/concurrencia de Firebase CLI
14.4.0. Coinciden generación, trigger, región, runtime, memoria, CPU, timeout,
concurrencia, mínimos, identidad, bindings por nombre, filtros y retry de eventos.
Los ocho jobs Scheduler están ENABLED y coinciden en horario y zona; donde el
source omite zona, el remoto usa UTC. Sus retryConfig no añaden valores explícitos.
La ubicación Eventarc de los triggers Firestore es southamerica-east1; la región
de ejecución sigue siendo us-central1. El source no fija esa ubicación Eventarc.

**Diferencia adicional investigada: límites máximos de instancias.** Los 104
endpoints no Email declaran `maxInstances: null` en el manifiesto SDK. Remotamente
90 tienen 100, valor predeterminado documentado por
[Cloud Run functions](https://docs.cloud.google.com/functions/quotas). Otros 14
tienen límites menores que no deben desaparecer por una reconciliación automática:

| Máximo remoto | Endpoints sin máximo explícito local |
| ---: | --- |
| 20 | adminGetTemplateEditorDocumentV1, prepareDraftPreviewRender, publicarInvitacion, retryPaidPublicationWithNewSlug, createPublicationPayment, mercadoPagoWebhook |
| 34 | runBusinessAnalyticsExportJobsV1, runBusinessAnalyticsRebuildJobsV1 |
| 60 | adminRebuildBusinessAnalyticsV1, getBusinessAnalyticsOverviewV1, getBusinessAnalyticsRawExportStatusV1, preparePublicTemplatePreview, processPendingAnalyticsEventsV1, requestBusinessAnalyticsRawExportV1 |

**Límite de evidencia:** los sources desplegados recuperados de publicarInvitacion
y createPublicationPayment tampoco declaran ese máximo. La consulta acotada de
auditoría no estableció el origen de esos valores; no se atribuyen a una persona,
commit ni ajuste automático de cuotas. Se conocen y conservan los límites efectivos;
su eventual incorporación al source requiere una decisión separada antes de
desplegar los endpoints afectados. No se editaron opciones/hashes para ocultarlos.
Los tres endpoints Email sí tienen máximos explícitos y paridad completa.

**Decisión A2:** la diferencia de nombres queda clasificada y retenida de forma
explícita; no es un export local faltante que haya que inventar. Ownership local
permanece 101/3/3. La verificación de Email puede continuar porque no cambia esos
recursos, ni necesita un deploy general de default. No se declara paridad absoluta
de configuración de todo default ni se autoriza corregir los 14 límites.

## generatePublishedShareImage: clasificación B

**B — reemplazada/obsoleta con evidencia suficiente. Retiro no ejecutado.**

Se recuperó el source exacto señalado por la metadata de la revisión desplegada:
`gcf-v2-sources-860495975406-us-central1`, objeto
`generatePublishedShareImage/function-source.zip`, generación `1777765849550671`.
El ZIP y la inspección quedan solo en `.local-isolation/architecture-stage2/`;
no se incorporan archivos históricos ni paquetes recuperados al backend.

**Historia comprobada:** el recurso se creó `2026-05-02T23:50:49.967300317Z` y
su última actualización fue `2026-05-02T23:52:21.100664245Z`, revisión
`generatepublishedshareimage-00001-wof`. El archive declara el export en
`src/index.ts:1508` y delega en
`src/payments/publicationPayments.ts:1350`, `processPendingPublishedShareImageHandler`.
La implementación no aparece en ninguno de los 851 commits alcanzables examinados
con `git log --all -S` para ambos símbolos. No se puede asignar un commit exacto
a su alta o eliminación local. No se afirma haber examinado objetos Git inalcanzables.

El commit `4d5014c2`, del 07/05/2026, incorpora el pipeline síncrono, el
[contrato de share image](../contracts/PUBLISHED_SHARE_IMAGE_CONTRACT.md) y la
prueba que exige explícitamente no exportar el trigger ni depender de
`onDocumentWritten`. Es evidencia de intención arquitectónica, aunque no contiene
un diff de eliminación del export histórico. La prueba permanece en
`functions/publicationPublishExecution.test.mjs:824`.

**Responsabilidad antigua:** evento Firestore written sobre `publicadas/{slug}`,
gen2, 1 GiB, CPU 1, concurrencia 1, timeout 60 s, sin retry ni Secrets vinculados.
Identidad de ejecución y Eventarc:
`860495975406-compute@developer.gserviceaccount.com`. Solo reclama documentos
`share.status=pending`, mediante transacción, marcándolos rendering. Lee
`publicadas/{slug}`, opcionalmente `plantillas/{templateId}`, y Storage
`publicadas/{slug}/index.html`; escribe `share.jpg`, HTML con OG y `publicadas.share`.
Ante error puede escribir fallback. Utiliza los parámetros normales
`PUBLISH_SHARE_IMAGE_ENABLED`, `PUBLISH_SHARE_IMAGE_DEFAULT_URL` y
`PUPPETEER_EXECUTABLE_PATH`, ausentes en el entorno inspeccionado (usa defaults).

**Consumidores y reemplazo:** no es un HTTP/callable consumido por el frontend.
Su consumidor implícito era el productor de `share.pending`. La búsqueda actual
en `src/`, `functions/src/` y `shared/` no encuentra el handler ni el builder
pending. El frontend lee publicaciones y llama el lifecycle de checkout; la
ruta `/i/:slug/share.jpg` sirve el asset existente mediante
`publicDeliveryRoutes.ts`, no invoca este trigger.

El reemplazo es `executePublicationPublish` →
`resolveRequiredGeneratedPublishedShareImageMetadata`: genera/confirma `share.jpg`
antes del HTML final y de persistir la publicación. Se recuperaron también los
sources **realmente desplegados** de publicarInvitacion, retryPaidPublicationWithNewSlug,
createPublicationPayment y mercadoPagoWebhook. Los cuatro contienen el mismo
`lib/payments/publicationPublishExecution.js` (hash en baseline), usan ese orden
y carecen del productor pending y del handler antiguo. No se infiere despliegue
solo porque el código local lo tenga.

Las agregaciones Firestore, sin leer documentos/identidades de usuarios, dieron
**0 pending y 0 rendering** el 27/09 a las 15:24 UTC. Las consultas completas de
los tres mensajes del renderer antiguo (inicio/finalización/fallo) entre el
28/08 y la consulta no encontraron entradas. Esto no prueba cero invocaciones
no-op ni ausencia de consumidores ajenos al repositorio: la conclusión se apoya
también en los sources desplegados y la ausencia de trabajo pendiente.

Eliminar el recurso no borraría los assets ni documentos existentes; las rutas
actuales seguirían leyéndolos y las publicaciones nuevas usan el pipeline síncrono.
Sí impediría atender futuros productores antiguos que volvieran a escribir pending;
por eso no se debe restaurar una revisión vieja del publicador sin revisar este límite.

### Retiro controlado preparado, bloqueado por recuperación

**Hallazgo:** el entorno heredado del trigger conserva los nombres
`MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_CLIENT_SECRET` y `MP_WEBHOOK_SECRET`,
además de configuración normal MP y superadmin. No son bindings Secret Manager.
Se inspeccionaron nombres y los parámetros no sensibles de share image en memoria;
no se imprimieron, copiaron ni compararon los valores de esas credenciales.
La API rechaza seleccionar claves individuales del mapa de entorno; este control
descarta el mapa después de producir la evidencia sanitizada. No hubo llamadas
a `secrets.versions.access` ni cambios/rotaciones de Payments.

No hay aún una recuperación probada del recurso antiguo que preserve su
comportamiento sin volver a introducir ese entorno. Recuperar el ZIP solo no
demuestra un rollback operativo seguro. **Por la condición de rollback del pedido,
se conserva el recurso; no se ejecuta una eliminación antes de resolverlo.**
La incertidumbre afecta al retiro/recuperación, no a la evidencia del reemplazo B.

Plan acotado restante, en orden:

1. Definir y verificar la recuperación del único trigger desde el source recuperado,
   con su mismo nombre, gen2, filtros/ubicación Eventarc, SA, memoria, CPU, timeout,
   concurrencia y no-retry. Resolver explícitamente la configuración heredada sin
   restaurar valores MP. No registrar el endpoint como export local vigente.
2. Repetir inventario, conteos pending/rendering y comprobación de publicadores;
   comprobar que no existe un intento activo ni nueva dependencia del flujo antiguo.
3. Revalidar guardrails, contrato de publicación y alcance. Solo entonces retirar
   **generatePublishedShareImage/us-central1** de **reservaeldia-7a440** mediante
   una operación por nombre; nunca deploy de default, wildcard o borrado de assets.
4. Releer metadata y confirmar 101/3/3, preservando los demás recursos. Si se
   necesita recuperación, usar el procedimiento validado del paso 1, no un deploy
   del source actual ni la reinyección del dotenv histórico.

Este informe no presenta un comando de rollback incompleto como ejecutable.

## Email: checklist y decisión B

Todos ya estaban desplegados en el proyecto real `reservaeldia-7a440`, bajo
codebase email. **Proyecto productivo no significa modo de envío production.**
Los tres conservan us-central1, nodejs20, 256 MiB y minInstances 0.

| Endpoint | Generación / trigger | Estado inicial → final | Identidad | CPU / concurrencia / timeout / max | Retry |
| --- | --- | --- | --- | --- | --- |
| testTransactionalEmail | gen2 / HTTPS privado | ACTIVE → ACTIVE | email-sandbox-sender | 1 / 1 / 20 s / 1 | Sin retry de evento; SES maxAttempts=1 |
| testWelcomeEmail | gen2 / HTTPS privado | ACTIVE → ACTIVE | email-sandbox-sender | 1 / 1 / 20 s / 1 | Sin retry de evento; SES maxAttempts=1 |
| onUserCreatedWelcomeEmail | gen1 / Auth user.create | ACTIVE → ACTIVE | welcome-email-sender | CPU no expuesta v1 / 1 / 60 s / 2 | failurePolicy.retry habilitada |

Ambas identidades son `@reservaeldia-7a440.iam.gserviceaccount.com` y existen sin
disabled. Los smokes mantienen IAM check habilitado, sin allUsers/allAuthenticatedUsers
en sus policies de servicio y con hashes de permisos iguales al baseline.
No se auditó herencia organizacional de IAM. El Auth trigger usa el rol custom
`welcomeEmailDeliveryWriter`: solo datastore.entities.create/update, condicionado
a la base `(default)`. Esto no equivale a aislamiento IAM por colección.

**Configuración verificada en los tres:** EMAIL_MODE=sandbox,
WELCOME_EMAIL_ACTIVATION_AT vacío; SUPERADMINS_UIDS presente y coincidente con
la autoridad local de core y email (solo resultados booleanos registrados).
Sin nombres normales ajenos, descontando las variables de plataforma.
AWS_SES_ACCESS_KEY_ID v3 y AWS_SES_SECRET_ACCESS_KEY v2 están ENABLED; ambas
identidades tienen secretAccessor en ambos recursos. No se leyeron sus valores.

**Ya realizado:** migración de los dos smokes, creación y activación Auth,
service accounts, permisos mínimos y bindings. `compareEmailMetadata.cjs` aprobó
la paridad de opciones/URLs/policies/versiones y ownership de los dos smokes.
La metadata Auth conserva el evento, opciones y updateTime del cierre del 26/09.
El log de correlación existente volvió a consultarse: sandbox/skipped/attempts=0,
EMAIL_SANDBOX_BUSINESS_BLOCKED, sin MessageId. No se creó otra cuenta, no se
modificó un delivery y no se repitieron los envíos manuales ya aceptados.

**Qué faltaba en esta tarea:** corroborar el estado actual; no apareció un deploy,
migración, grant o activación de infraestructura pendiente. **Modificaciones: ninguna.**

**Activación de negocio pendiente:** el operador confirmó durante esta revisión
que SES sigue en sandbox. Esto es declaración actual del operador, no una consulta
AWS GetAccount. El sender bloquea production y el transporte acepta solo el
destinatario sandbox. No se removieron esos gates, no se fijó una fecha de corte
y no se retiró testWelcomeEmail anticipadamente.

Antes de un rollout productivo se necesitan SES production access, el procedimiento
real de bounces/complaints, cambio autorizado y probado del gate/allowlist, fecha
UTC de activación, verificación de clientes y control operativo. Mantener la
reserva create-atómico por UID, cualquier delivery existente como terminal,
no-backfill, corte por fecha de creación Auth, SES maxAttempts=1 y no reenvío
automático de estados unknown/dispatching. Los skips sandbox no se reprocesan.

**Rollback de Email:** no hubo cambios que revertir. Se conserva la revisión
actual sandbox con fecha vacía y el procedimiento histórico de ownership del
[runbook](TRANSACTIONAL_EMAIL_SANDBOX_RUNBOOK.md#migracion-email-codebase), que no
debe ejecutarse para un problema de negocio. Antes de activar envíos, preparar
el rollback dirigido de onUserCreatedWelcomeEmail a esa revisión/configuración,
conservando email, nombre, SA, bindings y deliveries. Deshabilitar nuevas llamadas
no revierte un mensaje aceptado o un intento en curso. No se promete exactamente
una entrega ni se usa borrar records como rollback.

## Validación y alcance

La evidencia local reproducible está en `.local-isolation/architecture-stage2/`.
El gate normal se ejecuta en una copia del worktree con hogar de credenciales
vacío, proyecto demo, herramientas fijadas ya instaladas y red externa bloqueada.
Los builds y typechecks no modifican los paquetes generados del workspace principal.
Se conserva el primer timeout de 30 s del test de inicialización; no se amplió el
límite del test ni el de discovery CLI de 10 s. El gate integral posterior volvió
a ejecutar esa suite y pasó, sin cambios de código ni de timeouts.

| Verificación final | Resultado |
| --- | --- |
| `node scripts/local/runLocal.cjs verify` en copia aislada | 1578/1578, exit 0; incluye 37 de ownership/packages/configuración/discovery, 1408 Rules/countdown/Auth y pruebas browser/integration/offline |
| Builds de default, payments y email | Los tres aprobados dentro del gate |
| `tsc --noEmit` con tsconfig.json, tsconfig.payments.json y tsconfig.email-package.json | Los tres aprobados |
| `node --test --test-concurrency=1` sobre las seis suites de `test:emails`, publicationPublishExecution y publicDeliveryRoutes, con red bloqueada | 201/201; 152 Email y 49 publicación/delivery |
| Unión de manifiestos y registro | 107; 101/3/3; cero duplicados, desconocidos o faltantes; hashes de opciones y allowlists aprobados |
| Discovery CLI real, procesos nuevos | default 101 / 2792 ms; payments 3 / 1016 ms; email 3 / 973 ms; detector, no tiempo total del wrapper; cero fallos en la serie final |
| Paridad remota de smokes Email | 2/2, metadata/ownership/policies/versiones conservados |
| Lint del gate | 244 archivos, cero errores; 233 warnings preexistentes, sin limpieza ajena |
| Cleanup del launcher | Árbol propio cerrado y ocho puertos libres |

Host de los checks: Node 22.13.1, Firebase CLI 14.4.0, SDK 6.4.0; el runtime
declarado/desplegado continúa nodejs20. No se afirma una ejecución nueva de estos
tests bajo Node 20. Reporte integral:
`.local-isolation/stage2-validation-Bg5GUq/workspace/.local-isolation/reports/run-kjrUMI/result.json`.

Se conservan también los intentos del helper suplementario con configuración
incorrecta del harness: primero heredó el modo demo (bloqueó los transportes
falsos); luego faltó NODE_ENV=production para el renderer puro. Se corrigió
solamente el entorno del helper ignorado, conservando hogar vacío, red bloqueada
y clientes falsos; no el código del producto ni las expectativas. La ejecución
final completa 201/201 consta en `architecture-stage2/email-publication.tap`.

En esta etapa se crearon únicamente este informe y el baseline sanitizado, y se
añadieron referencias/estado al índice, autoridad de ownership, runbook Email y
mapa de configuración. Se conservaron los cambios previos de Etapa 1 sin commit.
`functionOwnership.json`, source, firebase.json, Rules, dotenv y lockfiles no
cambiaron durante esta etapa. Ningún deploy, borrado, cambio de configuración,
IAM, service account, Secrets, activación, email o mutación de datos de negocio.
Revisión final: 253 enlaces locales válidos, baseline JSON/identidades únicas
verificados y `git diff --check` aprobado. Sin patrones de credenciales reales
en los seis documentos/baselines alcanzados; los ZIP recuperados permanecen
ignorados, fuera de la documentación versionable.

Pendientes reales: retiro controlado del trigger B con recuperación segura;
decisión sobre los 14 límites remotos antes de desplegar sus endpoints;
activación productiva de Email con los prerrequisitos anteriores. No corresponde
repetir la migración Email ni crear nuevas codebases para resolver estos pendientes.
