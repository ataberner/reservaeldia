# Default/core: retiro del trigger obsoleto y límites de instancias

Status: Operational Diagnostic Evidence and Accepted Capacity Decision. 2026-09-27.

Alcance: retiro exclusivo de `generatePublishedShareImage` y revisión de los 14
máximos remotos menores que 100 sin declaración local. HEAD `7308b8c7`, sobre los
cambios sin commit de ownership y reconciliación. No cambia la arquitectura,
handlers, exports, dependencias, Rules ni datos. El cierre siguiente declara
explícitamente en source la capacidad que producción ya tenía.

## Cierre de límites — decisión actual aceptada

**DECISIÓN accepted:** por instrucción explícita del operador, conservar los 14
límites productivos en el source canónico. Se adoptan provisionalmente como
**A por decisión técnica actual**, sin afirmar que sean óptimos ni que se haya
descubierto su intención histórica. La falta de esa historia deja de bloquear:
la autoridad es ahora esta decisión de preservar comportamiento.

**HECHO:** el inventario remoto del `2026-09-27T16:29:29.073Z` confirmó 107 ACTIVE,
101 default / 3 payments / 3 email, y los mismos máximos 20/34/60. Toda la metadata
coincidía con el cierre del retiro. No se hizo ningún cambio remoto en este cierre.

| maxInstances adoptado | Functions |
| ---: | --- |
| 20 | adminGetTemplateEditorDocumentV1, prepareDraftPreviewRender, publicarInvitacion, retryPaidPublicationWithNewSlug, createPublicationPayment, mercadoPagoWebhook |
| 34 | runBusinessAnalyticsExportJobsV1, runBusinessAnalyticsRebuildJobsV1 |
| 60 | adminRebuildBusinessAnalyticsV1, getBusinessAnalyticsOverviewV1, getBusinessAnalyticsRawExportStatusV1, preparePublicTemplatePreview, processPendingAnalyticsEventsV1, requestBusinessAnalyticsRawExportV1 |

Son 12 default y 2 payments. Funcionalmente: 5 preview/publicación/templates,
7 Analytics y 2 Mercado Pago. Se conserva exactamente la lista revisada, sin
forzar el agrupamiento orientativo de 4/8.

El source canónico contiene los valores: `functions/src/index.ts`,
`functions/src/templates/editorialService.ts`, `functions/src/analytics/service.ts`
y `functions/src/payments/entrypoint.ts`. No hay una capa nueva de configuración.
La única diferencia de opciones permitida en los manifiestos es `maxInstances`
de null al valor remoto, para esos 14 nombres. Se actualizaron solo esos hashes
en `functionOwnership.json` y se retiraron sus 14 `deployBlocker`.

Los guardrails existentes siguen verificando toda la metadata actual; las
comparaciones con el fixture histórico de migración excluyen únicamente esta
opción revisada. El fixture histórico se conserva intacto. Las pruebas del
predeploy ahora esperan éxito para las decisiones resueltas y conservan los
casos negativos sintéticos. No se añadió infraestructura ni otro guardrail.

No se planifica optimización ni expiración automática de los límites. Cambiarlos
exige otra decisión deliberada apoyada en métricas de costo, latencia, errores,
cuotas o capacidad. Declararlos en source evita un salto accidental a 100 en el
próximo deploy. Este cierre no autoriza un deploy ni activa Email.

**Verificación de la adopción: aprobada.**

- Gate existente `node scripts/local/runLocal.cjs verify`: **1581/1581**, exit 0,
  en `.local-isolation/instance-limits-validation-AzAoRp/workspace`. Reporte:
  `.local-isolation/reports/run-4FUB77/result.json` dentro de esa copia. Incluye
  los tres builds, 40 tests de ownership/packages/configuración/discovery,
  contratos, compatibilidad, Rules/countdown, integración, navegador y offline.
  Cleanup aprobado: 18 procesos propios cerrados y ocho puertos libres.
- Typecheck de `tsconfig.json`, `tsconfig.payments.json` y
  `tsconfig.email-package.json`: **3/3 aprobados**. Tests existentes de
  `publicationPublishExecution.test.mjs` y `publicDeliveryRoutes.test.mjs`:
  **49/49**. Sin credenciales ni acceso remoto desde los tests.
- Discovery CLI real, timeout intacto de 10 s: default **101 / 7.374 s**,
  payments **3 / 5.447 s**, email **3 / 5.072 s**. Unión **107**, sin duplicados,
  desconocidos ni faltantes. Se compararon los manifiestos anteriores/nuevos:
  únicamente cambiaron los 14 maxInstances aprobados; los otros 93 endpoints y
  todos los demás atributos permanecen idénticos. Los 14 máximos coinciden con
  el remoto. Solo quedan 90 máximos omitidos que la plataforma resuelve a 100.
- `node functions/scripts/checkDeployReadiness.cjs default` y `payments`:
  **exit 0**, cero blockers. Los tests mantienen el rechazo de decisiones
  inciertas sintéticas y argumentos inválidos.
- Captura remota final `2026-09-27T16:41:39.966Z`: **107 ACTIVE, 101/3/3**,
  metadata v1/v2 idéntica a la captura inicial. Evidencia local ignorada:
  `.local-isolation/instance-limits-adoption/` (`remote-before.json`,
  `remote-after.json`, `approved-changes.json`, `manifest-parity.json`,
  `reconciliation.json`, `local-checks.json`). El baseline versionado anterior
  permanece como snapshot histórico del retiro, no como estado del source actual.
- Lint: **245 archivos, 0 errores, 233 warnings preexistentes**; sin correcciones
  ajenas. `git diff --check` aprobado. Sin nuevas codebases, guardrails,
  dependencias, cambios de Rules, handlers o lógica de negocio. Sin deploy,
  operaciones remotas de escritura, activaciones Email ni commits.

**DEFAULT READY FOR DEPLOY**

**PAYMENTS READY FOR DEPLOY**

---

**Evidencia histórica anterior a la decisión:** las secciones siguientes
conservan el retiro y la clasificación C inicial. Sus blockers y conclusión
anterior quedan reemplazados por el cierre de límites de arriba.

## Inventario y retiro

La captura inicial del `2026-09-27T16:01:54.241Z` confirmó exactamente el estado de
la [reconciliación anterior](FUNCTIONS_STAGE2_RECONCILIATION.md): 108 recursos,
sin cambios de metadata. La evidencia de esta operación queda en el
[baseline sanitizado](baselines/functions-default-hygiene-2026-09-27.json).

| Codebase | Local | Remoto antes | Remoto después |
| --- | ---: | ---: | ---: |
| default/core | 101 | 102 | 101 |
| payments | 3 | 3 | 3 |
| email | 3 | 3 | 3 |
| Total | 107 | 108 | 107 |

**HECHO:** `generatePublishedShareImage` mantenía generación 2, us-central1,
Firestore `google.cloud.firestore.document.v1.written`, documento
`publicadas/{slug}`, base y namespace `(default)`. Eventarc estaba en
southamerica-east1, sin retry. La clasificación **B, reemplazada/obsoleta**, se
mantiene; no se reconstruyó un export local.

Precondiciones revalidadas antes de eliminar:

- No hay referencias al endpoint/handler antiguo ni productores de share pending
  en los sources activos de frontend, backend y shared. Los estados de Analytics
  o checkout llamados pending no son `publicadas.share`.
- Los cuatro publicadores desplegados (`publicarInvitacion`,
  `retryPaidPublicationWithNewSlug`, `createPublicationPayment`,
  `mercadoPagoWebhook`) conservaban las revisiones y generaciones de source
  inspeccionadas en Etapa 2. Se volvieron a examinar sus ZIP: el pipeline compilado
  tiene SHA256 `2a37854cae008f29b2f1e4461b2ff33150759bea41803fd940c240c06a0f9ee7`,
  exige generación y confirmación de la imagen y carece del handler/productor
  asíncrono anterior. No se publicaron ni ejecutaron esos endpoints.
- [publicationPublishExecution.ts](../../functions/src/payments/publicationPublishExecution.ts)
  genera/confirma la imagen antes de HTML y escritura activa (líneas 328–423).
  [Contrato share](../contracts/PUBLISHED_SHARE_IMAGE_CONTRACT.md) y
  `publicationPublishExecution.test.mjs:824` prohíben depender del trigger antiguo.
- Agregaciones Firestore de solo lectura devolvieron **pending=0, rendering=0**
  a las 16:04 UTC y nuevamente inmediatamente antes del DELETE (16:06 UTC).
  Se conservaron únicamente conteos/readTime, sin documentos ni datos personales.
- Los 49 tests de publicación/entrega pasaron antes del retiro.

**Operación ejecutada:** una petición
`DELETE https://cloudfunctions.googleapis.com/v2/projects/reservaeldia-7a440/locations/us-central1/functions/generatePublishedShareImage`.
Se usó la sesión existente de Firebase CLI; no Secret Manager access. La
[API específica de eliminación](https://docs.cloud.google.com/functions/docs/reference/rest/v2/projects.locations.functions/delete)
opera sobre ese recurso, sin un deploy de default. Respondió HTTP 200 y la
operación terminó `done=true`, sin error. El primer polling pidió subcampos de
metadata no admitidos y recibió 400; se corrigió **solo la consulta**, sin repetir
el DELETE. La operación completa se identifica en el baseline.

**HECHO posterior:** desapareció exclusivamente ese nombre/región. Los otros 107
recursos conservaron generación, trigger, estado, runtime, revisión, opciones,
identidad, bindings, labels y metadata de build/update. Se normaliza el orden de
objetos, filtros y bindings antes de comparar. Auth gen1 aparece también en la
lista v2: la lista v1 se corrobora, no se suma otra vez.
La consulta directa posterior devolvió 404 tanto para la Function como para su
trigger Eventarc administrado. No se envió otra petición de eliminación.

### Recuperación definida antes de ejecutar

Es un retiro, no un cambio reversible con un toggle. No se promete restauración
instantánea ni replay de eventos. Se conservan el archive exacto y metadatos del
trigger en el directorio local ignorado de Etapa 2 **solo para investigación**;
no se debe desplegar ese archive ni recuperar su entorno sensible heredado.

La responsabilidad ya vive en el publicador síncrono. El DELETE no elimina
documentos `publicadas`, `index.html` ni `share.jpg`. Si aparece un caso afectado,
identificar el slug y verificar metadata/asset; una reparación autorizada debe
usar la publicación/republicación vigente, con generación/confirmación y rollback
de artefactos existentes ante fallo. Para checkout ya aprobado se conserva su
sesión y flujo de reintento: no crear otro pago ni forzar estados en Firestore.
No hay trabajo pendiente que reproducir según las dos consultas previas.
Si apareciera un productor legado desconocido, detener su uso e investigar antes
de habilitar otra ejecución. Ninguna reparación, republicación, escritura de
datos o restauración del trigger se ejecutó en esta tarea.

<a id="instance-limits"></a>

## Histórico: los 14 límites inicialmente clase C

**HECHOS comunes:** los 14 continúan con el máximo remoto observado. Source y
manifiestos SDK anteriores/finales omiten el máximo (`maxInstances: null`). No se
identificó evidencia suficiente para clasificar ninguno A o B; no se declaró un
valor nuevo ni se desplegó un cambio de capacidad. Los dos Payments forman parte
de los 14 del diagnóstico; solamente 12 pertenecen a default.

| Function | Owner | Remote | Source anterior | Clase | Source final | Evidencia funcional y razón para conservar/bloquear |
| --- | --- | ---: | --- | --- | --- | --- |
| adminGetTemplateEditorDocumentV1 | default | 20 | omitido | C | omitido | `templates/editorialService.ts:1364`: documento privado y preview opcional. CPU 1/min 1 añadidos por `7757ef4a`; no máximo. Concurrencia 80 permite hasta 1600 requests al máximo; 20 no demuestra protección de una sola ejecución. |
| prepareDraftPreviewRender | default | 20 | omitido | C | omitido | `index.ts:1591`: preparación del render con lecturas/normalización; CPU 1/min 1, concurrencia 80. Costo de preview no justifica por sí mismo el número 20. |
| publicarInvitacion | default | 20 | omitido | C | omitido | `index.ts:1923`: Chromium/Sharp, Storage y persistencia activa; 1 GiB/CPU 1/concurrencia 1. Crítico: conservar protección potencial de costo y capacidad; publicación generada obligatoria no fija 20. |
| retryPaidPublicationWithNewSlug | default | 20 | omitido | C | omitido | `index.ts:1719`: publicación pagada/reintento con slug y artefactos; mismo renderer. Los locks/idempotencia por sesión no son un presupuesto global de 20 instancias. |
| createPublicationPayment | payments | 20 | omitido | C | omitido | `payments/entrypoint.ts:21`: API Mercado Pago y eventual publicación; clave `publication-{sessionId}` evita duplicar ese pago, no acota requests globales ni prueba una cuota del proveedor de 20. |
| mercadoPagoWebhook | payments | 20 | omitido | C | omitido | `payments/entrypoint.ts:33`: notificaciones MP, consulta/settlement y publicación; lease de 90 s/reintento acotado por sesión. Crítico para pagos, renderer y reentrega; no hay rate limit documentado equivalente a 20. |
| runBusinessAnalyticsExportJobsV1 | default | 34 | omitido | C | omitido | `analytics/service.ts:3314`: job cada minuto, 1 GiB/540 s, CSV/Storage/Firestore. Reclamo transaccional/lease por export; no es límite global y 34 no deriva de la cantidad de jobs por lote. |
| runBusinessAnalyticsRebuildJobsV1 | default | 34 | omitido | C | omitido | `analytics/service.ts:3813`: rebuild cada minuto, 1 GiB/540 s; job singleton con reclamo transaccional y lease. Protege estado compartido, pero no explica un máximo de 34; reducirlo a 1 tampoco está autorizado. |
| adminRebuildBusinessAnalyticsV1 | default | 60 | omitido | C | omitido | `analytics/service.ts:3864`: superadmin encola rebuild y consulta estado; esa comprobación no define capacidad global. No hay justificación del valor 60. |
| getBusinessAnalyticsOverviewV1 | default | 60 | omitido | C | omitido | `analytics/service.ts:3165`: lecturas/agregados para superadmin; costo Firestore; no proveedor ni límite documentado que justifique 60. |
| getBusinessAnalyticsRawExportStatusV1 | default | 60 | omitido | C | omitido | `analytics/service.ts:3290`: lectura/polling de export autorizado; idempotencia de lectura no decide concurrencia/costo agregado de 60 instancias. |
| preparePublicTemplatePreview | default | 60 | omitido | C | omitido | `index.ts:1601`: preview público, lee/normaliza plantilla y genera HTML. CPU fraccionaria/512 MiB; riesgo de volumen público/costo; no justifica retirar ni ratificar 60. |
| processPendingAnalyticsEventsV1 | default | 60 | omitido | C | omitido | `analytics/service.ts:3354`: cada 15 min procesa hasta 50 pending + 25 failed; evita rebuild activo y usa deduplicación transaccional por evento. Tamaño de lote e idempotencia no determinan maxInstances. |
| requestBusinessAnalyticsRawExportV1 | default | 60 | omitido | C | omitido | `analytics/service.ts:3264`, enqueue en 2830: superadmin crea un nuevo job por solicitud; lease posterior no evita múltiples solicitudes/costo de exports. No prueba una cuota de 60. |

### Intención: evidencia y límites de inferencia

- `git log --all -G 'maxInstances|max_instance_count|--max-instances'` sobre
  `functions/src`, scripts y docs solo encontró configuraciones Email, no los 14.
  La búsqueda de `maxScale` incluyó render visual sin relación con autoscaling.
- Historial de opciones revisado: Analytics `702e0e33`/`893840dc` (13/03) y
  `e721f31b` (01/04); publicadores/render `4d5014c2` (07/05); warm previews
  `7757ef4a` (24/08); aislamiento Payments `74f1482c` (22/09). Son decisiones
  de memoria, CPU, concurrencia o mínimos; no declaran esos máximos.
- El baseline local anterior a Payments y el registro de ownership mantienen
  manifiestos sin máximo. Los archives desplegados de los publicadores tampoco
  lo declaran. El runbook Payments conserva opciones, pero su baseline del 22/09
  no capturaba `maxInstanceCount`: no sirve como prueba de que fuera inexistente.
- La lectura acotada de Audit Logs recuperó 460 timestamps de escrituras desde
  abril, pero quedó incompleta por HTTP 429. No se recuperaron payloads que
  pudieran incluir entornos. Las consultas por presencia de máximo explícito
  también quedaron limitadas. **No se atribuye el cambio a una persona, consola,
  CLI ni automatismo de Google, ni se afirma ausencia de ajustes manuales.**
- **INFERENCIA, no decisión:** 20×1 CPU, 60×0.3333 CPU y 34×0.5833 CPU son
  aproximadamente 20 CPU por endpoint. La cuota actual consultada es
  `run.googleapis.com/cpu_allocation=200000` mCPU en us-central1, no evidencia
  del valor histórico ni de una decisión de negocio. Una fórmula coincidente no
  basta para clasificar A/B. Las cuotas también son compartidas por región.
- El contrato de checkout documenta idempotencia y leases, no capacidad global.
  La API MP puede ser llamada varias veces por request y desde otras Functions:
  maxInstances no equivale a requests/segundo. No se inventó una cuota externa.

## Histórico: DEPLOY BLOCKER y guardrail

**Los 14 endpoints de la tabla son DEPLOY BLOCKER.** No hay un blocker adicional
por el trigger retirado. `default` tiene 12; `payments` tiene 2. No se modificaron
opciones/hashes de ningún endpoint. Email queda fuera de esta tarea.

El registro existente `functions/functionOwnership.json` añade `deployBlocker`
a cada endpoint incierto: clase C, máximo remoto observado y enlace a esta
decisión. Es evidencia de un bloqueo, **no configuración de runtime**. No hay
un segundo registro de ownership ni un valor que el build copie al source.

`functions/scripts/checkDeployReadiness.cjs <codebase>` consulta ese registro sin
red, credenciales ni dotenv. `firebase.json` lo ejecuta antes del build de default
y payments. La configuración alternativa `firebase.payments-rollback.json`
conserva el mismo bloqueo; cambiar codebase durante un rollback no debe eludirlo.
El bloqueo es por codebase, incluso en un deploy selectivo dentro de ella.

Los tests de ownership, ya integrados en el gate normal, verifican el fallo real
del proceso de predeploy, metadata válida, argumentos inválidos y separación por
owner. Un gate local verde demuestra que **el bloqueo funciona**, no autoriza el
deploy. El guardrail es offline: detecta estas diferencias conocidas, no descubre
cambios remotos posteriores. Tampoco puede impedir un API/CLI alternativo que
ignore `firebase.json`.

Para levantar cada bloqueo falta resolver su intención/capacidad con evidencia:
ratificar A y declarar `maxInstances` en su source canónico, o aceptar B con razón
documentada y source como autoridad. Actualizar opciones/hashes y pruebas solo
para esa decisión; luego retirar su `deployBlocker` y reconsultar producción.
No eliminar el bloqueo para hacer pasar predeploy ni copiar los 14 valores por
inercia. La evidencia de CPU no sustituye esa decisión operativa.

## Validación histórica del retiro y bloqueo

- `node scripts/local/runLocal.cjs verify`, ejecutado en la copia aislada
  `.local-isolation/core-hygiene-validation-IBVDSH/workspace`: **1581/1581**, exit 0.
  Reporte: `.local-isolation/reports/run-k2otMn/result.json` dentro de esa copia.
  Incluye builds de las tres codebases, 40 tests de ownership/package/runtime
  configuration/discovery initialization, contratos, compatibilidad, 1408 tests
  de Rules/countdown, integración, navegador y modo offline. Las Rules no cambian.
- `tsc --noEmit --project tsconfig.json`, `tsconfig.payments.json` y
  `tsconfig.email-package.json`: **3/3 aprobados**, sobre la copia compilada.
- `node --test --test-concurrency=1 publicationPublishExecution.test.mjs publicDeliveryRoutes.test.mjs`:
  **49/49 después del retiro**, además de 49/49 antes. Red externa bloqueada,
  homes de credenciales vacíos; no se ejecutaron publicaciones reales.
- Discovery real Firebase CLI 14.4.0, tres procesos nuevos, timeout intacto de
  10 s: default **101 / 5.572 s**, payments **3 / 6.249 s**, email **3 / 5.009 s**.
  Unión de manifiestos **107**, duplicados/desconocidos/faltantes **0**; todos los
  hashes de opciones y asignaciones permanecen iguales a los de Etapa 1.
- Pruebas negativas del predeploy: default y payments retornan 1 con sus blockers;
  owner/argumentos inválidos fallan. El chequeo puro de blockers de Email no falla,
  sin afirmar por eso autorización de activación de negocio.
- Lint: **245 archivos, 0 errores, 233 warnings preexistentes**. No se corrigieron.
  Cleanup del gate aprobado: 18 procesos propios cerrados, ocho puertos libres.
- Inventario remoto final: **107 ACTIVE**, default 101/payments 3/email 3; ningún
  otro recurso cambió respecto del inventario inicial. Comparación normalizada:
  solo difiere `maxInstances` en los 104 endpoints no Email. En 90 casos es
  omitido local frente al valor de plataforma 100; en los **14 casos C** es un
  límite inferior incierto. Resto de atributos normalizados, nombres y ownership
  coinciden. No se afirma identidad de todo el código desplegado con HEAD.
- `git diff --check` aprobado. Sin modificaciones en `functions/src`, `src`,
  `shared`, Rules, lockfiles ni dependencias. Sin commits, deploys, cambios IAM,
  cambios de configuración remota, activaciones Email ni escrituras de negocio.

Cambios de esta tarea: checker offline/predeploy y tests; metadata `deployBlocker`
en el registro existente; este informe/baseline y enlaces/estado actualizados en
ownership, índice, reconciliación histórica, aislamiento y README Payments.
Se preservaron los cambios previos sin commit de las etapas anteriores.

La conclusión inicial de no disponibilidad para deploy queda reemplazada por el
cierre de límites y su validación al inicio de este documento.
