# Seguridad: matriz de acceso y preparación de FASE 4B2

Status: autoridad focalizada de obligaciones existentes, inventario observado y
propuesta pendiente. **Este documento completo no es una política aceptada.**
Revalidación local: 2026-09-11. FASE 4B2A implementa el subconjunto A1/A2
delimitado [abajo](#phase-4b2a); 4B2B protege [countdowns A4](#phase-4b2b).
Ninguna de estas implementaciones acepta Q1 ni el resto de las propuestas.

La entrada única de la decisión administrativa sigue siendo
[Q1](../architecture/SYSTEM_FRAGILITY_MAP.md#open-operational-decisions).
Este documento aporta su análisis; no crea otra decisión independiente.
F10/F11 siguen abiertos; F12 sigue parcialmente resuelto, con sus mismos límites.
No se inspeccionaron identidades, claims, configuración ni datos remotos.

Se buscó primero una autoridad suficiente: Security First establece ownership,
los contratos de publicación y datos establecen autoridades específicas, y el
contrato de proveedores establece su frontera. Ninguno tenía la matriz completa
ni resolvía la representación administrativa. Se concentran aquí esos enlaces y
las decisiones faltantes, sin reemplazar los contratos de dominio.

<a id="accepted-obligations"></a>

## Obligaciones aceptadas y fuentes

| ID | Obligación ya vigente | Autoridad; límite de interpretación |
| --- | --- | --- |
| A1 | Respetar propiedad de datos, evitar exposición innecesaria y usar paths de Storage por usuario. A no puede leer/modificar/eliminar recursos privados de B ni transferirse su ownership. | [Architecture Guidelines, 4.3](../architecture/ARCHITECTURE_GUIDELINES.md#43-security-first). Las excepciones compartidas/públicas requieren política explícita; un consumidor existente no la concede. Los positivos de edición propia se apoyan también en el [modelo de datos](../architecture/DATA_MODEL.md) y su boundary de [persistencia](../../src/components/editor/persistence/editorSessionPersistence.js). |
| A2 | Publicación, artefactos, estado de checkout y contabilidad de visitas mantienen la autoridad del backend; un cliente, aunque sea dueño, no puede sustituir ese proceso. | [Lifecycle Contract](CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md), Authoritative Entities, Approved Session Publication Execution, Public Delivery; [share](PUBLISHED_SHARE_IMAGE_CONTRACT.md); [visitas](../architecture/DATA_MODEL.md). La invitación pública se entrega por HTTP bajo lifecycle, no por permiso general al documento/bucket. |
| A3 | Clientes no administrativos no escriben proveedores, categorías ni imágenes de proveedores. | [Provider Data Model, §7](../architecture/PROVIDER_DATA_MODEL.md#7-security-and-public-projection-decision). Publicar el documento completo o crear una proyección sigue siendo decisión de ese contrato; no se resuelve en Q1. |
| A4 | El draft de countdown es administrativo; versiones publicadas son inmutables, con publicación controlada por versión y operación. | [DATA_MODEL, countdownPresets](../architecture/DATA_MODEL.md#countdownpresets). No habilita acceso directo general al root porque un catálogo se llame público. |

**Observado** significa comprobado en código o en la línea base; no significa
aprobado por producto. **Propuesto / pendiente** necesita aceptación antes de
convertirse en permiso. Los casos `acceptance` evalúan A1–A4; `characterization`
evalúa implementación actual; `proposal` mide diferencias con Q1 sin aprobarla.
La [línea base por caso](../testing/SECURITY_RULES_BASELINE_4B1.md) registra los
resultados y los límites del experimento.

<a id="access-matrix"></a>

## Matriz de recursos y canales

Operaciones: **g** get, **l** list/query, **c** create, **u** update/reemplazo,
**d** delete. `glcud` enumera las cinco; `—` ninguna. Actores: **N** sin sesión,
**O** propietario, **X** otro usuario, **M** administrador, **S** superadministrador,
**B** backend Admin SDK. M/S son niveles de la propuesta, no identidades ya
unificadas. Un usuario de Firebase Auth anónimo con UID cuenta hoy como autenticado;
el actor N de la suite es `request.auth == null`, no un UID de anonymous sign-in.

Canales: **SDK** sujeto a Rules; **CALL** callable con guard de backend;
**HTTP** handler de entrega/RSVP/visitas; **Admin** omite Rules y exige autorización
en su entrada. Un permiso en CALL no concede automáticamente el equivalente SDK.

Reglas actuales, abreviadas:

- **F**: fallback Firestore concede `glcud` a cualquier autenticado; N no accede.
  Alcanza cualquier descendiente. Las reglas coincidentes se combinan por OR.
- **S**: fallback Storage concede `glcud` a cualquier autenticado salvo
  `proveedores/**`, `usuarios/**`, `thumbnails_borradores/**`, `publicadas/**`, `assets/**`.
  Hay compatibilidad explícita para objetos/folders de usuarios no modelados;
  En assets hay compatibilidad específica para otros namespaces y familias
  countdown no modeladas; staging/frames/thumbnails ya no reciben ese grant.
  Fuera del alcance corregido no comprueba dueño, tamaño, MIME ni artefacto.
- **R-admin**: ambos archivos aceptan `admin === true`, `superadmin === true`
  o `role == "admin"`. Esto difiere de `adminAuth.ts`.
- Las exclusiones Firestore son exactamente `usuarios`, `publicadas`,
  `publicadas_historial`, `borradores`, `countdownPresets`, `plantillas`,
  `plantillas_catalog`, `plantillas_tags`, `site_settings`, `app_config`,
  `publication_checkout_sessions`, `public_slug_reservations`,
  `publication_discount_codes`, `publication_discount_code_usage`,
  `proveedores`, `categorias_proveedores`. Ninguna nueva colección queda
  protegida por defecto. Los matches específicos no se heredan a subcolecciones.
  Compatibilidad explícita conserva los descendientes no modelados indicados
  en la matriz; no vuelve a conceder los subárboles corregidos por OR.

### Firestore: recursos propios y publicación

| Recurso / responsable | Actores y operaciones por canal; consumidor real | Rules actual | Obligación y destino propuesto; estado |
| --- | --- | --- | --- |
| `usuarios/{uid}`; titular UID, perfil/preferencias backend | O: SDK g; CALL g/u mediante `upsertUserProfile`, `getMyProfileStatus`, `getMyUiPreferences`, `updateMyUiPreferences`. S: CALL gl de directorio. B: c/u. [index.ts](../../functions/src/index.ts), [useAdminAccess](../../src/hooks/useAdminAccess.js). | 4B2A: glcud sólo UID del path; query global denegada. CRUD propio permanece observado/pendiente de política de campos y cuenta; `admin` del perfil no autoriza. | A1 aceptado: negar X/N glcud y l global. Propuesto: SDK O g; c/u sólo campos propios explícitos si se conserva canal directo; d sólo flujo de cuenta autorizado. M/S sin acceso SDK global. No dar por aprobado CRUD del perfil por observar F. |
| `usuarios/{uid}/imagenes/{imageId}`; titular del path | O: SDK glcud para biblioteca; [useMisImagenes](../../src/hooks/useMisImagenes.js), [corregirImagenes](../../src/utils/corregirImagenes.js). | 4B2A: glcud sólo UID del path, recursivo; sin validar `storagePath`/URLs. | A1 aceptado: O glcud, X/N —. Ownership por UID del path, no por metadata modificable. Propuesto: validar que paths privados referidos pertenecen al mismo UID; URLs compartidas requieren su política. |
| `usuarios/{uid}/otros/**`; titular del path, sin consumidor encontrado | No se encontró escritor/lector actual de otras subcolecciones. | F glcud. | Propuesto: denegar por defecto; no heredar todas las operaciones de `imagenes`. La ausencia de consumidor no prueba inexistencia remota. |
| `borradores/{slug}`; `userId` | O: SDK glcud; autosave/flush en [persistencia](../../src/components/editor/persistence/editorSessionPersistence.js), query en [useDashboardDrafts](../../src/hooks/useDashboardDrafts.js). CALL copia, preview, trash y publicación validan identidad; B c/u/d. | Create exige userId del caller; gu/d miran resource.userId; u conserva userId; l debe estar filtrado. No bypass admin. | A1 aceptado: O glcud, X/N —, dueño inmutable. Los espejos de lifecycle no son prueba de pago/publicación (A2). Q1 no autoriza M/S a saltar ownership. |
| `borradores/{slug}/**`; dueño del padre | Sin consumidor persistente hallado. | Denegado: excluido de F y sin match de descendientes. | Observado; propuesto preservar denegación. Test de subcolección confirma que ser dueño del padre no concede automáticamente acceso. |
| `publicadas/{slug}`; `userId`, escritor backend | O: SDK gl por [dashboardList](../../src/domain/publications/dashboardList.js), [route](../../src/hooks/useDashboardEditorRoute.js), [preview](../../src/hooks/useDashboardPreviewController.js); CALL cambios de lifecycle; HTTP entrega; B glcud. | 4B2A: gl propio por userId; cud denegado a todo SDK cliente, incluso claims administrativos. | A1/A2 aceptados: SDK O gl, X/N —; SDK c/u/d — para todos, incluidos M/S. Público accede por HTTP. El backend sigue validando relación y lifecycle. |
| `publicadas/{slug}/rsvps/{id}`; dueño del padre, respuesta del invitado | O: SDK gl en [PublicadasGrid](../../src/components/PublicadasGrid.jsx) y [summary](../../src/hooks/useDashboardPublicationRsvpSummary.js). N: HTTP c validado por `publicRsvpSubmit`; B c y limpieza/finalización. | 4B2A: glcud requiere dueño del padre, incluidos descendientes. O cud sigue observado/pendiente; X/N no acceden. | A1 aceptado: O gl, X/N SDK —. Propuesto: SDK c/u/d —, preservar HTTP como autoridad de envío y exportación; no abrir Firestore al invitado. [Interactividad](PREVIEW_PUBLISH_INTERACTIVITY_CONTRACT.md) y [DATA_MODEL RSVP](../architecture/DATA_MODEL.md) conservan contenido/compatibilidad. |
| `publicadas/{slug}/visits/{hash}`, `uniqueVisitors/{hash}`; publicación/backend | HTTP genera recepción con cookie/token de carga; B c/g/agregación/d en [publicationVisitTracking](../../functions/src/payments/publicationVisitTracking.ts). | 4B2A: gl sólo dueño del padre (lectura cruda propia todavía observada); cud denegado a todos los clientes, recursivo. | A1/A2 aceptados: X —; SDK c/u/d — incluso O. Propuesto: g/l SDK — incluso O; exponer agregados autorizados, no identidades crudas. No existe consumidor directo actual de estas subcolecciones. |
| `publicadas_historial/{historyId}`; `userId`, finalización backend | O SDK gl filtrado en dashboardList; B c y operaciones de retención autorizadas en [finalización](../../functions/src/payments/publicationFinalizationFlow.ts). | 4B2A: gl/cud propio con userId válido/inmutable; CRUD propio observado. Descendientes no modelados mantienen F. | A1 aceptado: O gl, X/N —, userId inmutable. A2 conserva snapshot previo a borrar activos. Propuesto: SDK c/u/d —; descendientes no modelados —. No alterar retención. |
| `publication_checkout_sessions`, `public_slug_reservations`, `publication_discount_codes`, `publication_discount_code_usage`, todos sus descendientes | CALL usuario dueño de sesión, S gestión comercial/descuentos; HTTP proveedor de pago; B glcud. [payment reads](../../functions/src/payments/publicationPaymentReads.ts), [payments](../../functions/src/payments/publicationPayments.ts). | SDK glcud denegado, incluyendo R-admin. | A2 aceptado para escrituras; preservar acceso sólo por backend. Q1 decide quién cumple S, sin cambiar lifecycle, precios ni validaciones. |
| `invitaciones/{id}`; autoridad de ownership no documentada para este legado | [Editor.jsx](../../src/components/Editor.jsx) tiene SDK g/u; no es el editor canónico. Activación/ruta real de este componente no demostrada. | F. | Observado / pendiente: ningún grant nuevo. 4B2 debe mantenerlo denegado o adaptar/eliminar consumidor con alcance aprobado; no inventar `userId` remoto. |

### Firestore: catálogos y administración

| Recurso / responsable | Actores, operaciones, canal y consumidor | Rules actual | Obligación / propuesta / estado |
| --- | --- | --- | --- |
| `plantillas/{id}`; editorial backend | Autenticado SDK g de publicada en [template repository](../../src/domain/templates/repository.js); M/S CALL glcud con restricciones de estado y actor en [editorialService](../../functions/src/templates/editorialService.ts). | SDK gl publicado; tolera campos estado/estadoEditorial ausentes. SDK cud — incluso admin; subcolecciones —. | Observado. Propuesto preservar acceso a publicadas y CALL para edición; decidir compatibilidad de documentos sin estado con evidencia autorizada posterior. M edita en proceso/revisión; S publica/edita publicada y hard-delete, según Q1. |
| `plantillas_catalog/{id}`; proyección de editorial | N y autenticado SDK gl con `estado=active`, `estadoEditorial=publicada`; `tipo` en query real. B c/u/d. | Lectura pública sólo tuple; cud —; query sin filtros denegada. | Observado, propuesta de preservación; no convertir toda plantilla/editorial en recurso público. Pruebas públicas caracterizan Rules, no aprueban política nueva. |
| `plantillas_tags/{id}`; editorial backend | M/S CALL gl/c/u, B writes; [editorialService](../../functions/src/templates/editorialService.ts), [dashboardHome](../../functions/src/dashboardHome/service.ts). | SDK glcud —, descendientes —. | Observado; preservar backend. Rol M/S pendiente Q1. |
| `plantillas_secciones/{id}`; catálogo compartido legacy | SDK gl en [hook](../../src/hooks/usePlantillasDeSeccion.js); SDK c en [ModalCrearSeccion](../../src/components/ModalCrearSeccion.jsx) y [utils/plantillas](../../src/utils/plantillas.js). | F. | Pendiente: alcance global vs recurso personal no aprobado. Propuesta: biblioteca compartida administrada; lectores explícitos, escrituras por M vía backend. Necesita decisión de dominio/compatibilidad antes de cortar el consumidor. |
| `iconos/{id}`; catálogo de sistema | Autenticado SDK gl, u de revalidación en [elements/service](../../src/domain/elements/service.js); M SDK c y upload en [iconCatalogAdminApi](../../src/components/admin/iconCatalog/iconCatalogAdminApi.js); M CALL metadata/estado/prioridad/revalidación en [service](../../functions/src/iconCatalog/service.ts). B triggers. | Match gl autenticado y cud R-admin anulados en práctica por F. | A1 no legitima escritura global del usuario. Propuesto: lectura de catálogo activo, M c inicial validado/upload; demás u/d por CALL para preservar auditoría y dependencias. La revalidación ordinaria necesita flujo acotado o retiro, no un grant global. Q1 pendiente. |
| `iconos_archived/{id}`; catálogo archivado | M SDK gl/count, CALL gestión; B archivo/limpieza. [repository](../../functions/src/iconCatalog/repository.ts). | R-admin glcud + F. | Propuesto: M gl; SDK cud —, CALL operaciones autorizadas. Preservar referencias publicadas. |
| `iconos_usage_snapshots/{id}`, `iconos_audit/{id}`; backend | M CALL estadísticas/revalidación; B c/u en [triggers](../../functions/src/iconCatalog/triggers.ts) y repository. | R-admin read / write false **coinciden con F**. | Observado experimentalmente. Propuesto SDK writes — incluso admin; reads M limitados o CALL según necesidad real. No certificar auditoría sólo porque write false está escrito. |
| `decoraciones/{id}`, `decoraciones_archived/{id}`; catálogo administrativo | M SDK gl/c y Storage upload en [decor API](../../src/components/admin/decorCatalog/decorCatalogAdminApi.js); CALL gestión en [service](../../functions/src/decorCatalog/service.ts); B procesamiento. Lecturas existentes de elementos en [elements service](../../src/domain/elements/service.js). | R-admin glcud + F; autenticado común obtiene todo. | [DATA_MODEL](../architecture/DATA_MODEL.md) separa authoring admin de render para todos. Propuesto no romper render existente; metadata interna/admin sólo M, bytes publicados por canal explícito; alta/edición por entradas validadas. Detalle de lectura de catálogo pendiente. |
| `decoraciones_audit/{id}`; backend | CALL administración; B c. | R-admin read / write false + F. | Propuesto SDK cud —; gl por M/CALL según Q1; pruebas C registran bypass actual. |
| `countdownPresets/{id}`; builder backend | CALL autenticado: catálogo resuelve exactamente activeVersion; CALL admin: drafts, publicar, duplicar, archivar, borrar. [service backend](../../functions/src/countdownPresets/service.ts), [cliente callable](../../src/domain/countdownPresets/service.js), [builder](../architecture/COUNTDOWN_PRESET_BUILDER.md). | 4B2B: SDK gl R-admin; cud — para todo cliente. Estado published no habilita gl ordinario. | A4: draft administrativo y mutación por procedimiento versionado. Lectura administrativa SDK conservada como observación, no aceptación de Q1. Propuesta SDK — total sigue pendiente. Catálogo CALL exige auth. |
| `countdownPresets/{id}/versions/{n}` y descendientes; publicación backend | CALL catálogo exacto activeVersion; CALL admin historia; B crea versión mediante transaction.create. Sin lector SDK actual hallado. | 4B2B: SDK cud — incluso R-admin; gl autenticado conservado, independiente del estado del root. | A4: impedir fabricación, reemplazo y borrado fuera del proceso. Lectura SDK cruda sigue observada/pendiente: no es catálogo, ni aprobación de distribución de versiones archivadas. |
| `countdownPresets/{id}/operations/{operationId}` y otros descendientes administrativos; backend | CALL save/publish/duplicate, operación idempotente y resultado administrativo; B c/transacciones. | 4B2B: SDK gl R-admin; cud — recursivo. | A4 protege resultados administrativos y registros de concurrencia/replay. Lecturas administrativas conservadas como observación; no crea capacidades nuevas. |
| `text_presets/{id}`; backend | Autenticado CALL catálogo activo; M CALL CRUD, duplicar, visibilidad/sync; [text service](../../functions/src/textPresets/service.ts). | F. | Observado; propuesto SDK — y continuar CALL. `PublicV1` exige auth; el nombre no concede acceso anónimo. |
| `site_settings/{pricing, dashboard_home,...}`, `site_settings/pricing/history/{id}`, `app_config/**`; backend | Usuario CALL configuración pública seleccionada, S CALL administrar/precios/historia. [pricing](../../functions/src/siteSettings/pricing.ts), [dashboardHome](../../functions/src/dashboardHome/service.ts). | SDK — recursivo. | Observado; preservar exclusividad backend y proyección por callable. Rol S pendiente Q1. |
| `analyticsEvents`, `analyticsUsers`, `analyticsInvitations`, `analyticsDaily`, `analyticsWeekly`, `analyticsMonthly`, `analyticsTemplates`, `analyticsCohorts`, `analyticsJobs`, `analyticsExports` | B eventos/agregados/jobs/export; S CALL consultas/export. [analytics/service](../../functions/src/analytics/service.ts) constantes, `requireSuperAdmin`, agregaciones y exports. | Cada match dice false; todos coinciden con F. | Observado, no excepción aceptada. Propuesto SDK glcud —, S por CALL con proyección y scope; no exponer IDs/datos de otros usuarios. |
| `analytics{Daily,Weekly,Monthly}/{period}/users/{uid}`, `/templates/{templateId}`; `analyticsCohorts/{cohort}/periods/{n}` | B agrega; S CALL estadísticas. Los nombres de descendientes están en analytics/service, no hay consumidor SDK hallado. | F recursivo; negar sólo roots no alcanza. | Propuesto misma exclusividad backend; fixtures cubren descendientes users/templates/periods. |
| `clientIssues/{id}`; titular del reporte/backend soporte | Usuario CALL `reportClientIssue`; S CALL soporte; B c/g/l en [index.ts](../../functions/src/index.ts). | F; glcud autenticado sin pertenencia. | A1 protege contenido privado. Propuesto SDK —, retención y visibilidad por responsable de soporte sin conceder escritura de auditoría al cliente. |
| Colecciones/desciendientes no inventariados | No hay consumidor demostrado; `unmodeled_4b1` es exclusivamente centinela sintético. | F. | Propuesto deny default con matches explícitos. El inventario de código no certifica el inventario remoto; no migrar ni borrar supuestos legados. |

La referencia anterior a un lector directo de countdownPresets en
[countdownAudit/runtime.js](../../src/domain/countdownAudit/runtime.js) era
incorrecta: `captureDocumentSnapshot` (493) sólo es llamado para `plantillas`
(549) y `borradores` (553). No se adaptó ese diagnóstico. Los nueve métodos del
servicio cliente countdown usan CALL; inspeccionar esos consumidores no equivale
a ejecutar sus handlers o la UI.

### Storage

| Prefijo / responsable | Actores, operaciones, canal y consumidor | Rules actual | Obligación / propuesta / estado |
| --- | --- | --- | --- |
| `usuarios/{uid}/imagenes/**`, `usuarios/{uid}/thumbnails/**` | O SDK glcud, bytes y thumbnails en [useMisImagenes](../../src/hooks/useMisImagenes.js). | 4B2A: glcud sólo UID del path, incluidos prefijo exacto y descendientes; X/N —. | A1 aceptado: O glcud, X/N SDK —. Validación de tipo/tamaño requiere compatibilidad con formatos reales; límites nuevos pendientes. Tokens de descarga requieren revisión independiente. |
| `thumbnails_borradores/{uid}/{slug}.webp` | O SDK c/u y URL; [guardarThumbnail](../../src/utils/guardarThumbnail.js). | 4B2A: glcud sólo UID del path para todo su subárbol; no comprueba borrador relacionado. | A1: O glcud propio; X/N —. Propuesto verificar también dueño del slug antes de crear/reemplazar; no transferir propiedad por metadata. |
| `borradores/{slug}/index.html` y otros assets del prefijo | B crea/copia/genera/elimina; [index.ts](../../functions/src/index.ts), endpoints preview. Usuario llega por CALL/HTTP según entrada. | S glcud a cualquier sesión. | A1/A2: privacidad por owner de `borradores/{slug}`. Propuesto SDK c/u/d — para artefactos de backend; lectura de owner por canal explícito. Este path no contiene UID: resolver relación, no inferir dueño desde slug. |
| `user_uploads/**`, `previews/**` legacy | Referencias/clonado en [template storageAssets](../../functions/src/templates/storageAssets.ts), [render normalization](../../functions/src/utils/publishAssetNormalization.ts); no se halló uploader genérico actual que defina todas las formas. | S. | Pendiente: no inferir que todo segundo segmento es UID. `previews/plantillas/{id}.png` sí tiene consumidor concreto; separar ese subprefijo. 4B2 requiere inventario autorizado de compatibilidad o mantener bloqueados paths ambiguos. |
| `previews/plantillas/{id}.png`, `plantillas/{id}/preview.png`, `plantillas/{id}/assets/**` | M preview SDK upload [DashboardHeader](../../src/components/DashboardHeader.jsx); B crea/clona y elimina [editorialService](../../functions/src/templates/editorialService.ts) / storageAssets. URLs usadas por catálogo/editor/render. | S; algunos productores usan makePublic/token (otro canal). | Propuesto: M upload preview validado, CALL gestión y B clonado; lectura compartida/publicada explícita sin exponer drafts. Q1 y compatibilidad de assets compartidos pendientes; no borrar automáticamente archivos referenciados. |
| `publicadas/{slug}/index.html`, `publicadas/{slug}/share.jpg` | B c/u/d; N HTTP g por [servePublishedInvitation](../../functions/src/index.ts) y `/i/{slug}/share.jpg`; [execution](../../functions/src/payments/publicationPublishExecution.ts). | 4B2A: cud denegado en todo `publicadas/**`, incluidos objetos en el prefijo exacto, slug y assets anidados. gl autenticado se conserva observado; N —. | A2 aceptado: SDK cud — incluso O/M/S. Propuesta SDK gl — y preservar HTTP/lifecycle. Negar SDK anónimo no demuestra que el HTTP público funciona. |
| `iconos/**`, `iconos_archived/**` | M SDK upload inicial [icon admin API](../../src/components/admin/iconCatalog/iconCatalogAdminApi.js), legado [SubirIcono](../../src/components/SubirIcono.jsx); B procesa/archiva. Editores/render consumen URLs. | Iconos: read autenticado, write R-admin; archived R-admin; ambos + S. | Propuesto O gl sólo catálogo activo si se acepta; M upload acotado, u/d por backend según dependencias. Archivo no significa público. Q1 y política compartida pendientes. |
| `decoraciones/originals/**`, `decoraciones/thumbnails/**` | M SDK upload en [decor API](../../src/components/admin/decorCatalog/decorCatalogAdminApi.js); B derivados; render por URL. | R-admin + S. | Propuesta distinguir originales administrativos, derivados compartidos y assets publicados; no bloquear render de decoración persistida por rol del visitante. |
| `assets/countdown/staging/**`, `assets/countdown/frames/{preset}/draft/**`, `assets/countdown/thumbnails/{preset}/draft/**` | B save/staging/rollback/duplicate; administración por CALL builder. [countdown service](../../functions/src/countdownPresets/service.ts); hidratación del editor por URL con token. | 4B2B: SDK gl R-admin observado; cud — para todo cliente. Incluye objetos en el prefijo exacto y descendientes. | A4 protege draft y procedimiento de assets. No llamar público a staging. Propuesta de retirar también SDK administrativo sigue pendiente; Rules no revocan ni certifican URLs con token. |
| `assets/countdown/{frames,thumbnails}/{preset}/operations/{op}/{attempt}/**` | B publica/copia bytes originales; lectores consumen URL de versión activada. | 4B2B: SDK cud —, incluso R-admin; gl autenticado conservado. | A4 inmutabilidad: tampoco fabricar artefactos con create. Distribución SDK/URLs y tokens siguen pendientes; no cambia retención ni acceso anónimo. |
| Resto de `assets/countdown/{frames,thumbnails}/**`, incluidos objetos exactos y frames legacy | Contenedores de artefactos del servicio; referencias SVG/PNG existentes. | 4B2B: cud —; g autenticado fuera de draft. Listado de niveles mixtos (familia/preset) sólo R-admin; de ramas no privadas, autenticado. | A4 impide fabricar/sustituir artefactos fuera del procedimiento. Lecturas conservadas como observación, no aprobación general de legacy. |
| Ancestros `assets`, `assets/countdown`, frames/thumbnails y preset: l | Pueden enumerar staging/draft. Otros catálogos conservan l en su propio namespace. | 4B2B: l R-admin mediante match recursivo exclusivo de list; no concede get/write. Objetos individuales en assets/countdown conservan g/cud autenticado. | A4 protege enumeración privada. Otros namespaces/familias countdown no modeladas conservan glcud autenticado, pendientes de política compartida/legacy. |
| `plantillas_secciones/img-*.ext`, `public/{timestamp}.ext` | SDK c en [imagenes](../../src/utils/imagenes.js), [subirImagenPublica](../../src/utils/subirImagenPublica.js); g mediante URL. | S, no UID. El comentario “sin token” no certifica acceso público. | Pendiente de política compartida y compatibilidad. Propuesto escribir mediante backend con actor/ownership rastreable; no ampliar Rules para sostener naming ambiguo. |
| `analytics-exports/raw/{yyyy}/{mm}/{exportId}.csv` | B crea; S CALL obtiene URL firmada de corta duración en [analytics/service](../../functions/src/analytics/service.ts). | S permite X SDK glcud. | A1 protege datos de usuarios; propuesto SDK — incluso M/S; S obtiene export autorizado por CALL, con TTL/alcance existente. Firmada no depende de Rules. |
| Cualquier otro prefijo, incluidos nombres que parezcan privados | No consumidor demostrado. | S fuera de las exclusiones enumeradas; otros folders `usuarios/{uid}` y objeto en UID conservan acceso autenticado. Listar usuarios/UID o thumbnails_borradores globalmente queda denegado por contener paths privados. | Propuesto deny default; nombres y metadata enviados por cliente no conceden ownership. |

### Frontera de proveedores preservada

| Recurso | Canal y comportamiento actual | Permiso/estado |
| --- | --- | --- |
| `proveedores/{id}` | Admin scripts operadores glcud; sin ruta/cliente/Function desplegada de directorio en el repositorio. SDK gl si R-admin o tuple publicado/activo/visible; cud R-admin con shape en c/u. | A3 deny cud N/X. Otros grants observados; prueba de tuple público sólo caracteriza. Su proyección pública requiere decisión del contrato de proveedores. |
| `categorias_proveedores/{id}` | SDK gl si R-admin o activa; cud R-admin con shape; Admin import/seed. | A3, sin habilitar scripts/importaciones. Query público requeriría `activa==true`. |
| `proveedores/{id}/portada/{file}`, `/galeria/{file}` | SDK g/l R-admin o tuple del documento padre; c/u R-admin, filename/MIME y ≤15 MiB; d R-admin. Admin enriquecimiento omite Rules. | A3. Ensayos con imágenes sintéticas prueban exclusión del fallback y lectura cruzada Firestore/Storage. Sin publicar proveedores reales ni habilitar endpoints. |
| Subcolecciones Firestore y otros subpaths Storage de proveedores | No grant recursivo adicional; tampoco fallback. | Preservar denegación. Cambiar helper administrativo depende de Q1; no ampliar shape, tipos, tamaño o visibilidad. |

<a id="queries-and-boundaries"></a>

## Queries, relaciones y fronteras que 4B2 debe conservar

1. `borradores`, `publicadas`, `publicadas_historial`: query SDK con
   `where("userId", "==", auth.uid)`. Un filtro en UI no protege una consulta
   sin filtro. La suite siembra A y B y ejecuta tanto consulta propia como ajena
   y global. El legado [corregirIconos](../../src/utils/corregirIconos.js) consulta
   todos los borradores: ya es incompatible con Rules de drafts; no ejecutado.
2. RSVP: obtener dueño del padre, no del campo enviado en la respuesta. Una
   collectionGroup query global de `rsvps` no tiene consumidor actual; no se le
   concede permiso por analogía con una subcolección. 4B2A prueba su denegación sin filtros mediante SDK; no autoriza collectionGroup global.
3. No permitir cambiar/borrar `userId`; en create comprobar el nuevo dueño y
   en update el viejo y el nuevo. En paths con UID ese segmento es autoridad.
   Los campos de rol en `usuarios` no son claims ni fuente autorizadora.
4. `slugPublico`, `borradorSlug`, `lastPaymentSessionId` y referencias de imágenes
   pueden apuntar a otros documentos/paths. La suite caracteriza dos referencias
   extranjeras actualmente admitidas. Admitir una referencia no demuestra por sí
   solo que se la haya leído/renderizado. Backend debe validar dueño y relación
   al consumir; Rules no debe convertir esa referencia en permiso. El contrato
   de render y sus URLs compartidas requieren una decisión específica antes de
   imponer validación global de arrays/URLs desde Rules.
5. Catálogo de plantillas: tuple de publicación debe estar en query, no filtrado
   sólo en memoria; preservar `tipo`. Faltan pruebas de compatibilidad de índices
   desplegados; el emulador no prueba todos los requisitos de índices remotos.
6. Analytics y auditorías: quitar grant recursivo, no sólo añadir otro `false`.
   Snapshot/audit/counter no debe quedar editable por admin SDK cliente porque
   la UI administrativa lo lea. El escritor Admin backend es otro canal.
7. `getDownloadURL` devuelve una URL por token; bytes obtenidos usando ese token,
   GCS público/makePublic, URLs firmadas y respuestas de Functions no quedan
   certificados por un `getBytes` sujeto a Rules. La suite **no** usa download
   tokens para evaluar autorización. No hay tests de revocación de URLs o de
   lifecycle HTTP, porque los handlers siguen bloqueados por 4A.

<a id="q1-proposal"></a>

## Q1: propuesta administrativa concreta, todavía no aceptada

### Estado comprobado

- [adminAuth.ts](../../functions/src/auth/adminAuth.ts): usuario autenticado es
  `request.auth.uid`; M es `admin === true` o UID de superadmin en servidor;
  S es UID en unión de `SUPERADMINS_UIDS` y `CLOUD_RUNTIME_CONFIG.superadmins.uids`.
  No acepta `superadmin` ni `role` del token. No se leyeron valores de esas fuentes.
- Rules: aceptan tres variantes de claims y no conocen las listas del servidor.
  Los probes usan delete de proveedor, **excluido del fallback**, para que el
  fallback de iconos no disimule esta diferencia. El helper backend se prueba
  como función pura con configuración sintética temporal; no se habilita CALL.
- [getAdminAccess / setAdminClaim](../../functions/src/index.ts) y
  [useAdminAccess](../../src/hooks/useAdminAccess.js) consumen la política híbrida.
  [useAuthClaims](../../src/hooks/useAuthClaims.js) considera sólo `admin === true`.
  Visibilidad de botones nunca sustituye autorización.
- `setAdminClaim` exige S del servidor, lee el usuario objetivo y agrega `admin`
  preservando los demás claims; para revocar elimina sólo `admin`. Rechaza quitar
  admin a S configurado. Por ello **no revoca** un `superadmin:true` o `role:admin`
  que siga siendo suficiente para Rules. No hay emisor de superadmin claim
  hallado en las fuentes de aplicación inspeccionadas. No se infiere qué emisores
  externos ni configuraciones existen remotamente.
- No se encontró invalidación de tokens/epochs dentro de `setAdminClaim`; los
  claims anteriores no desaparecen de tokens ya emitidos al cambiar Auth.

Caracterización ejecutada (Rules: delete de proveedor sintético; backend: helper
puro, no handler). Evidencia detallada en los casos `q1-*` de la línea base:

| Identidad sintética | Firestore / Storage | requireAdmin | requireSuperAdmin |
| --- | --- | --- | --- |
| Usuario A sin claims | deny / deny | deny | deny |
| `admin: true` | allow / allow | allow | deny |
| `superadmin: true` | allow / allow | deny | deny |
| `role: "admin"` | allow / allow | deny | deny |
| `admin: "true"` (string) | deny / deny | deny | deny |
| UID sólo en configuración S sintética del helper | deny / deny | allow | allow |

### Comparación de alternativas reales

| Alternativa propuesta | Ventajas | Costos y consecuencias |
| --- | --- | --- |
| **Recomendada: claims canónicos versionados con capacidades explícitas** | Backend, Rules y UI consumen la misma identidad administrativa; permite distinguir publicar plantilla, gestionar catálogo y gestionar privilegios. Evita que una lista invisible para Rules conceda otro nivel. | Cambiar helpers de los tres consumidores, emisión/revocación, provisioning inicial y compatibilidad. Requiere transición coordinada y prueba de tokens antiguos; no basta renombrar `admin`. Las capacidades deben tener una autoridad única, sin campos de Firestore editables que las dupliquen. |
| Modelo híbrido formal: S en configuración de servidor, M por claim canónico | Conserva forma de `requireSuperAdmin` y el operador actual de configuración. S puede reservar operaciones sensibles a CALL. | Rules no puede leer env: S necesitaría claim M provisionado para SDK catálogo o pasar todo por backend. Si se replica un claim S, hay sincronización y dos estados que pueden divergir al revocar. Debe definirse qué gana en discrepancia; mayor costo permanente de operación y tests. |

No se propone un tercer sistema de roles por documentos: no hay autoridad
existente que lo justifique. Un registro de revocación, si se acepta abajo,
controla frescura del token y no asigna capacidades.

### Capacidades recomendadas

Esta tabla **es propuesta**. Preserva las diferencias funcionales observadas en
`resolveTemplatePermissions`, guards S y contratos, sin aceptar por ello todos
los grants actuales. No concede lectura directa universal de datos de clientes.

| Nivel | Capacidades propuestas | Exclusiones / canal |
| --- | --- | --- |
| Usuario | Editar borradores/biblioteca propios; consultas propias de publicación/RSVP; consumo del catálogo autorizado; publicación por checkout/CALL. | Ninguna capacidad administrativa. Campos `admin`, `role` o `red` escritos en su perfil no autorizan. |
| M | `catalogManage` (iconos/decoraciones/presets) y `templateEdit` (en proceso/revisión; restaurar sólo lo que archivó). | No publicar/editar plantilla ya publicada, hard-delete editorial, administrar usuarios/privilegios, precios, sitio, analítica global ni soporte privado. Cada operación sigue validando estado/actor. |
| S | Capacidades M más `templatePublish`, `templateDelete`, `siteManage`, `pricingManage`, `analyticsReadExport`, `analyticsOperate`, `userSupport`, `designerAiUse`, `accessManage`. | Gestión sensible sólo CALL. Soporte es consulta específica auditada, no SDK glcud sobre todo el tenant ni permiso para editar invitaciones privadas arbitrariamente. No cambia pagos, publicación pública, retención ni proveedores. |

Correspondencias concretas para no perder consumidores al unificar helpers:

| Entrada observada | Capacidad propuesta / compatibilidad |
| --- | --- |
| `listAdminUsers`, `getAdminUserByEmail`, `getUsersStats`, `listUsersDirectory`, `getUserDirectoryDetail`, `getAdminDraftSnapshot` en index.ts; `prepareDraftPreviewRender` con `administrativeOwnerUid` | `userSupport`, lectura administrativa explícita y scope de usuario/borrador validado. La UI de soporte no obtiene un SDK privilegiado general. Esta excepción de lectura a ownership requiere aceptar Q1-A. |
| `designerAiChat` en index.ts y `canAccessDesignerAi` del frontend | `designerAiUse`; conserva el acceso restringido observado. No habilitar IA en el demo ni cambiar su contrato funcional. |
| Pricing e historial, `upsertPublicationDiscountCode`, `listPublicationDiscountCodes`, `listPublicationDiscountCodeUsage` | `pricingManage`; conserva validación comercial existente. No concede saltar checkout o emitir una publicación fuera del backend. |
| Overview/export de analytics; `adminRebuildBusinessAnalyticsV1` | `analyticsReadExport` para leer/exportar y `analyticsOperate` para solicitar rebuild. Los jobs/schedulers siguen siendo backend, no capacidades de un cliente. |
| `adminCommitTemplateWorkspaceV1`, `adminCreateTemplateFromDraftV1` permiten a S ciertos cruces de workspace/propietario | No trasladar ese bypass a Rules ni asumir que soporte autoriza copiar contenido privado al catálogo. Propuesta: edición de workspace propio; conversión de borrador ajeno requiere autorización específica de contenido antes de concederse. Es un punto de compatibilidad/decisión en Q1-A, no una corrección silenciosa. |

Representación recomendada: namespace de claim `red` con `v:1`, `role` (`admin`
o `superadmin`) y `capabilities` booleanas enumeradas arriba. Ausencia = usuario;
valores desconocidos, strings `"true"`, combinaciones incoherentes o versión
desconocida no conceden privilegios. `role` identifica un perfil de capacidades,
no otro OR alternativo; el emisor valida el perfil y los consumidores validan
la capacidad concreta. Un S debe recibir explícitamente las capacidades M.
No se habilitan combinaciones arbitrarias desde un payload cliente.

**Otorgamiento y revocación propuestos:** S con `accessManage` otorga/revoca sólo
perfiles M de otros usuarios mediante una entrada autenticada de backend.
Bootstrap/cambio de S queda en un operador del proyecto designado explícitamente,
con aprobación de otro responsable y procedimiento auditable fuera del autoservicio
de la app. Rechazar cambios de privilegios sobre sí mismo desde la app y evitar
retirar el último S recuperable. No agregar bypass permanente por email/UID.
La identidad del operador y del aprobador todavía debe definirla el proyecto.

Conservar claims ajenos a Reserva el Día: leer estado actual, modificar sólo el
namespace propio, serializar escritores de claims por UID y verificar lectura
posterior. `setCustomUserClaims` reemplaza el mapa completo: spread preserva
campos en una escritura, pero no resuelve carreras entre emisores. Inventariar
emisores autorizados sin exponer valores, validar tamaño/formato y registrar
actor, target, capacidades cambiadas, versión y resultado (sin tokens). Al migrar,
retirar también los aliases administrativos propios aceptados temporalmente;
no eliminar claims de terceros por coincidencia de nombre sin confirmar su dueño.
La semántica de reemplazo y propagación está documentada por
[Firebase Auth](https://firebase.google.com/docs/auth/admin/custom-claims).

### Tokens anteriores, transición y revocación

**Recomendación propuesta:** revocación de privilegios efectiva en la siguiente
solicitud, sin depender de que el cliente refresque voluntariamente el token.
Agregar `red.rev` y un registro server-only `authorizationState/{uid}` con
`generation` para frescura/revocación, sin roles. Rules Firestore y Storage y el backend
exigen coincidencia antes de aceptar una capacidad administrativa. Ausencia o
generación distinta deniega. Estado inaccesible al cliente para c/u/d. El epoch
se cambia primero, luego claims: una falla intermedia deniega, no mantiene acceso.
Las operaciones ya autorizadas en vuelo no pueden deshacerse retroactivamente.
Este registro es un **cambio propuesto de datos y operación**, no implementado.
Responsable propuesto de `authorizationState/{uid}`: backend de privilegios;
Admin g/c/u/d bajo su procedimiento, SDK cliente glcud denegado. Las lecturas
internas de Rules para verificar generación son distintas de conceder SDK get.
Los probes Q siembran generación 1 exclusivamente como fixture demo y usan
perfiles de capacidades completos; no implementan ni certifican revocación.

Costo: lectura extra de Rules (y permisos de integración Storage→Firestore),
latencia/backend, límites de accesos a documentos en Rules, y reconciliación
de cambio de claims con epoch. Si el responsable acepta explícitamente una
ventana de token viejo hasta su expiración, puede omitirse ese registro, con
pruebas y documentación de esa exposición. Revocar refresh tokens por sí solo
no demuestra rechazo inmediato en SDK Rules. Firebase distingue ID tokens de
vida corta y refresh tokens en [session management](https://firebase.google.com/docs/auth/admin/manage-sessions).

Transición condicionada a aceptación y autorización posterior:

1. Identificar, mediante relevamiento autorizado posterior, los emisores, variantes
   y operadores existentes. Esta fase no inspeccionó producción; no asumir que
   todo `role:admin` o UID configurado debe convertirse en S.
2. Implementar validadores de esquema/capacidad/frescura compartidos por intención
   y pruebas de paridad; adaptar `getAdminAccess`, UI y administración editorial.
   Mantener ownership y validaciones de negocio además de la capacidad.
3. Preparar provisioning de S y M aprobados, con backup seguro de claims y rollback
   limitado a estado autorizado. No reintroducir fallback como rollback.
4. Definir un puente temporal con fecha de fin: `admin:true` sólo si se aprueba
   equivalencia M; aliases `superadmin`/`role` no se promocionan automáticamente.
   Para revocación inmediata el puente también necesita estado de generación
   válido. Resolver primero identidades que hoy dependen de la lista servidor.
5. Actualizar emisores y desplegar consumidores coordinadamente bajo otra
   autorización. Refrescar tokens para altas; tokens anteriores a revocación
   deben fallar. Eliminar aliases y lectura de listas una vez verificada transición.
6. Verificar sintéticamente alta, baja, token viejo, emisor concurrente, claims
   ajenos, actor sin `accessManage`, autoasignación, último S y recuperación.
   Ninguno de esos cambios productivos ocurre en 4B1.

### Resoluciones exactas que faltan en Q1

- **Q1-A, representación y capacidades:** aceptar claims canónicos y la tabla de
  M/S, o elegir híbrido y especificar cómo S llega a SDK sin divergencia. Precisar
  cualquier capacidad a ampliar/reducir; cambia helpers, guardas y UI.
- **Q1-B, autoridad de otorgamiento:** designar operador y aprobador de S;
  confirmar que S sólo administra M de terceros desde la app y que soporte
  privado sigue por operaciones específicas. Cambia provisión/revocación,
  protección de autoasignación y recuperación.
- **Q1-C, frescura/compatibilidad:** aceptar revocación en siguiente solicitud
  mediante generación server-only o aceptar explícitamente la ventana del token;
  decidir puente temporal `admin:true` y condición/fecha de retirada. Cambia Rules,
  estado de revocación y plan de transición. Claims/config remotos siguen desconocidos.

Las respuestas deben registrarse en **Q1** con enlace a esta versión y estado de
decisión separado de implementación/verificación. No cerrar Q1 con tests C verdes.

<a id="phase-4b2"></a>

## Plan implementable de FASE 4B2

<a id="phase-4b2a"></a>

### Subconjunto implementado localmente: 4B2A

Se implementaron propiedad de perfil/biblioteca por UID; lecturas propias y
ownership inmutable de historial; lectura de publicación por `userId`; RSVP y
visitas por dueño del padre. Publicación, visitas y artefactos Storage
`publicadas/**` rechazan escrituras de todo cliente. Borradores y checkout
conservan sus restricciones. Ningún helper administrativo cambió.

El fallback general excluye las tres colecciones nuevas y los tres prefijos
Storage corregidos. Los matches recursivos privados incluyen niveles anidados;
en Storage también el objeto que coincide exactamente con el prefijo.
Los fallbacks internos excluyen `imagenes`, `rsvps`, `visits`, `uniqueVisitors`
y folders `imagenes`/`thumbnails` según su superficie, de modo que no conceden
por OR los accesos corregidos. Las lecturas query de publicación/historia
requieren ownership demostrable por `where(userId == auth.uid)`; ser admin
no lo sustituye. Un padre ausente o extranjero tampoco autoriza una respuesta.

**Verificado en demo, no desplegado:** [selección y comparación por ID](../testing/SECURITY_RULES_4B2A.md).
Los 134 A1/A2 existentes y 324 regresiones nuevas de aceptación pasan;
se corrigieron 74 violaciones de 4B1 (41 Firestore, 33 Storage).
La corrida histórica 4B2A mantuvo cinco fallas A4 fuera de su alcance y salida 1;
su corrección posterior se registra en 4B2B, sin reemplazar aquella evidencia.
Q1 y la frontera de proveedores conservan sus expectativas anteriores.

**Operaciones pendientes, sin convertirlas en política aceptada:**

- Perfil propio c/u/d, RSVP propio c/u/d e historial propio c/u/d siguen
  permitidos, ahora con ownership. Las nueve caracterizaciones nuevas registran
  esa conservación; no aprueban CRUD de cuenta, respuestas ni snapshots.
- Visitas/uniqueVisitors crudos siguen legibles por el dueño; SDK read de
  artefactos publicados sigue permitido a autenticados. Su retiro requiere
  la decisión indicada en la matriz; no se modifica HTTP, tokens ni retención.
- Otras subcolecciones de usuarios/publicadas y descendientes de historial
  conservan el grant autenticado anterior. En Storage lo conservan los folders
  distintos de imagen/thumbnail bajo usuarios y los objetos en `usuarios/{uid}`.
  Los listados de nivel usuarios/UID y thumbnails_borradores global se deniegan
  porque incluyen paths privados. Estos residuos no certifican aislamiento
  integral de cada árbol; sólo los recursos y operaciones seleccionados.
- Referencias extranjeras en metadata no conceden acceso al destino; validarlas
  como contenido, retirar otros fallbacks y proteger catálogos/legacy siguen
  fuera de 4B2A. No hay grants administrativos nuevos sobre datos privados.

<a id="phase-4b2b"></a>

### Subconjunto implementado localmente: 4B2B

A4 excluye countdownPresets del fallback Firestore. El root puede contener draft
aunque esté publicado; sólo conserva lectura SDK por el predicado administrativo
existente. Toda escritura SDK del árbol (create incluido) se deniega: root,
puntero, versiones, operaciones y descendientes. Publicación, concurrencia,
idempotencia, archivado y tombstones continúan bajo sus entradas backend.

Storage excluye assets del fallback general y repone sólo la compatibilidad
fuera de los tres contenedores countdown corregidos. Staging y draft requieren
el predicado administrativo para gl; todo staging/frames/thumbnails rechaza
escritura SDK, incluidos prefijos exactos y artefactos legacy. Listar ancestros
mixtos requiere ese predicado, sin conceder get/write por el match de listado.
Otros catálogos permanecen accesibles en sus namespaces como antes.

Los permisos administrativos conservados y la lectura autenticada de versiones
crudas/artefactos publicados son **observaciones**, no adopción de Q1 ni aprobación
de nueva distribución. Root/operations SDK — total sigue propuesto. No se cambian
helpers, claims, callable autenticado, SVG/PNG, schema, paths, tokens o retención.
La [comparación 4B2B](../testing/SECURITY_RULES_4B2B.md) registra corridas, asserts,
compatibilidad comprobada y límites. Los handlers countdown siguen bloqueados
por 4A; policies puros y checks de texto no certifican su ejecución ni la UI.

La tabla siguiente conserva los bloques y sus límites; el primero tiene únicamente
el subconjunto 4B2A implementado. No cerrar F10/F11 sin resolver sus residuos
y verificar separadamente la aplicación remota bajo autorización posterior.

| Bloque posterior | Archivos / cambios previstos | Dependencia y evidencia necesaria |
| --- | --- | --- |
| 1. Ownership y backend de publicación | `firestore.rules`: matches explícitos para usuarios/biblioteca, publicadas, historial y subcolecciones; dueño inmutable; c/u/d backend para publicación/visitas/checkout. `storage.rules`: usuario/thumbnail por UID, artefactos publicadas c/u/d denegados. Quitar el grant coincidente **para cada familia corregida**, conservando explícitamente las pendientes. | Subconjunto independiente de Q1 para O/X/N y artefactos backend. A1/A2 positivos y negativos deben pasar; no requiere resolver quién es S para negar SDK a todos en escrituras backend. No cambiar HTTP, lifecycle ni retención. |
| 2. Countdown privado/inmutable | Implementación local 4B2B descrita arriba; raíces administrativas, versiones/operaciones y assets protegidos por operación. | A4 independiente de Q1. Diagnóstico directo descartado por callers reales; no ampliar allowlist local. Lecturas crudas, URLs con token y prueba del handler/UI conservan sus límites pendientes. |
| 3. Administración y fallbacks restantes | Helpers `isAdmin` en ambos Rules, `functions/src/auth/adminAuth.ts`, `getAdminAccess`, guardas de capacidades, namespace/epoch y emisor de claims. Matches para catálogos, auditoría, analytics y exports; estado backend-only. | Q1-A/B/C para permisos administrativos y transición. Catalog revalidation, uploads directos, archive/delete e immutable versions requieren positivos de compatibilidad; no aceptar un simple deny-all global. |
| 4. Recursos compartidos/legados | Definir grants concretos para plantillas_secciones, public, previews, user_uploads y assets publicados; ajustar uploaders afectados dentro de alcance autorizado. | Decisiones de dominio independientes de Q1 cuando falte política pública/compartida. No abrir prefijos completos para salvar un consumidor. No migración o borrado implícito. |
| 5. Verificación local | Suite dedicada debe tener cero violaciones A y cero errores de infraestructura; actualizar C como observación del cambio aprobado y convertir sólo propuestas aceptadas en asserts normativos. Agregar tests de claims/frescura y consumidores afectados. | Cada corrida inicia copia nueva y registra hash. UI desktop/mobile si se adapta; pruebas del payload/query de dashboard, RSVP y biblioteca; triggers/HTTP requieren ampliar aislamiento bajo tarea autorizada, no fingir prueba con Admin. |
| 6. Evidencia de despliegue separada | Posterior autorización de proyecto/bucket exactos, hashes Rules desplegadas, IAM/canales públicos, compatibilidad de índices, canarios sintéticos, observación de rechazos y rollback acotado. | No ejecutado ni autorizado aquí. Pruebas demo no prueban Rules remotas, claims existentes, URLs por token, CDN, sesiones cacheadas o configuración de S. F10/F11 no se cierran sólo con una corrección local. |

Casos negativos mínimos posteriores: X con filtro de B; query global; cambio o
eliminación de owner; create spoof; subcolección que aparenta heredar permisos;
referencia cruzada usada para escalar acceso; writer SDK de auditoría/analytics;
reemplazo/delete de publicación por O/M/S; upload en UID ajeno; rol string o
versión desconocida; token revocado; autoasignación; recuperación que reintroduce
aliases; proveedor oculto/inactivo/path/MIME/tamaño inválido. Mantener positivos
de O y de cada capacidad aceptada, incluidos catálogo/render y entrega pública
cuando exista un recorrido local seguro para esos handlers.

## Verificación y límites

Tooling: [runLocal](../../scripts/local/runLocal.cjs),
[catálogo ejecutable](../../scripts/local/rulesCases.mjs),
[suite](../../scripts/local/rules.test.mjs),
[runbook](../operations/DEVELOPMENT_WORKFLOW.md#rules-4b1).
No dependencias nuevas: `firebase` ya instalado admite `mockUserToken` en
[Firestore](https://firebase.google.com/docs/reference/js/firestore#connectfirestoreemulator)
y [Storage](https://firebase.google.com/docs/reference/js/storage#connectstorageemulator).
Son SDKs de cliente; sus operaciones pasan por Rules del emulador. No se usa el
token especial `owner` en operaciones evaluadas. El Admin se limita a fixtures.

Cada caso registra actor/claims sintéticos, path, operación, autoridad, esperado,
observado y clasificación. `permission-denied`/`storage/unauthorized` son los
únicos errores reconocidos como denegación. Timeouts, JAR/compilación/startup,
objetos ausentes, hook o limpieza fallida son infraestructura y hacen fallar la
ejecución. Fixtures usan UUID; los probes de objetos en prefijos exactos usan
esos nombres dentro del emulador exclusivo de sesión. Todo se limpia por path
exacto; no se comparte sesión ni se vacía una base/bucket global.

No se verificaron despliegue, IAM, claims reales, URLs firmadas/tokens/GCS público,
política de retención, entrega HTTP bloqueada, pagos, proveedores operativos,
IA/correo, schedulers/triggers, SDK móvil ni todos los
legados remotos. Tampoco autenticación de tokens firmados reales: mockUserToken
modela `request.auth` exclusivamente en emuladores. Los helpers de backend se
caracterizan sin ejecutar negocio; no son pruebas de Rules ni de HTTP/callables.
Las decisiones de Q1 y las excepciones compartidas continúan propuestas.
