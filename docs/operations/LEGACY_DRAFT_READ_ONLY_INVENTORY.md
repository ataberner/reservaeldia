# Inventario acotado de HTML histórico y accesos alternativos

Status: Operational Diagnostic Procedure.
Fecha: 2026-10-23. Preparado localmente; este documento no acredita una lectura
remota ni autoriza despliegues, migraciones, adopción de archivos o revocaciones.
Autoridad: [Security Contract](../contracts/SECURITY_CONTRACT.md) y
[evidencia local](../testing/DRAFT_PROVIDER_AUTHORIZATION.md).

La continuación del 23/10/2026 usa el procedimiento
[paginado y reanudable de metadatos](RESUMABLE_METADATA_INVENTORY.md), con
checkpoint cifrado y proyecciones adicionales de proveedores. Este documento
conserva los límites y resultados del runner inicial; no atribuirle los cursores
ni la cobertura del nuevo recorrido. No repetir la muestra inicial para continuar.

## Objetivo y consumidores comprobados

Cuantificar compatibilidad con el lector HTML endurecido y detectar señales de
exposición por canales que Rules no revoca. El comportamiento pertenece a
`functions/src/drafts/legacyHtmlDraft.ts`: requiere marcador, vínculo UID/slug/hash
y SHA-256 de la generación del objeto. La copia sólo recupera una reserva sin
destino si conserva fuente/generación/hash y la plantilla sigue disponible.
Este inventario no invoca esa copia ni cambia documentos o archivos.

`functions/src/index.ts`, `copiarPlantillaHTML`, todavía devuelve la URL de
`verInvitacion`; abrirla requiere Bearer del dueño. La búsqueda local no encontró
callers de esas dos funciones ni de `generarPreview` en `src/`, `package.json`
o `functions/package.json`. `functions/src/backupindex.ts` conserva código
histórico; no es el entrypoint del registro de ownership. Esto no demuestra uso
remoto. El CLI retirado `scripts/generarPreview.cjs` generaba
`borradores/{id}/preview.png` con token: se inspeccionan todos los metadatos bajo
`borradores/`, no sólo `index.html`. El preview moderno sigue por
`prepareDraftPreviewRender`, según el [mapa vigente](../architecture/PREVIEW_SYSTEM_ANALYSIS.md).

También se inspeccionan metadatos de `proveedores/`; no se leen documentos de
proveedores, datos de contacto, fotografías ni bytes de sus imágenes.

## Herramienta y guardas

- [Runner](../../scripts/inventoryLegacyDrafts.mjs): REST directo, sin Admin SDK,
  ADC implícito, dotenv, navegador, retries automáticos ni invocación de Functions.
- [Modelo puro](../../scripts/draftInventoryModel.mjs): clasificación y allowlist
  de solicitudes; no es una fuente de autorización ni una herramienta de backfill.
- [Tests offline](../../scripts/draftInventoryModel.test.mjs): fixtures sintéticos,
  transporte inyectado y CLI sin credenciales; no requieren emuladores.

Sin `--execute-read-only` imprime el plan, sin consultar credenciales ni red.
La ejecución exige proyecto y bucket explícitos, coincidentes con el único par
permitido en código. No toma `.firebaserc` ni defaults de una sesión.

| Límite máximo, no ampliable por CLI | Valor |
| --- | --- |
| Documentos Firestore, sumando query, joins y consultas de plantilla | 200 |
| Objetos enumerados por prefijo (`borradores/`, `proveedores/`) | 200 por prefijo |
| Página Firestore/Storage | 25 |
| Peticiones REST, sin retries automáticos | 200 |
| Respuesta JSON individual | 512 KiB |
| HTML individual para hash, únicamente con flag | 2 MiB |
| Presupuesto acumulado de cuerpos de respuestas | 10 MiB |
| Duración de solicitudes de la corrida / solicitud individual | 180 s / 15 s |

`--max-docs` y `--max-objects` sólo reducen límites. Se rechaza Content-Length
superior al presupuesto antes de consumirlo; en streams sin longitud se aborta
al recibir el primer bloque que lo excede. No se promete un límite exacto de
tráfico TCP/TLS ya recibido por el sistema. No se conservan ni imprimen cuerpos
excedidos. El hash solicita Range acotado y generación exacta; se omiten objetos
comprimidos para evitar confundir bytes almacenados y descompresión transparente.
No se interpretan HTML, URLs ni scripts.

APIs de datos permitidas: GET de metadatos/listas/objetos y POST `runQuery`
(consulta sin transacción). La allowlist rechaza writes, otros hosts, proyectos,
buckets y namespaces. No sigue redirects. No escribe reportes por sí misma:
stdout contiene JSON saneado; stderr, progreso agregado.

## Credenciales y permisos mínimos

El operador obtiene explícitamente un access token OAuth temporal desde un
origen autorizado y lo entrega en `RESERVA_INVENTORY_ACCESS_TOKEN`, sólo en
memoria del proceso. No pasarlo en argv, imprimirlo, guardarlo o registrarlo en
transcripciones. El runner no hace login, no renueva tokens y no cambia IAM.
Un vencimiento o permiso faltante produce un código saneado y cobertura parcial.

El relevamiento local por **existencia/origen**, sin abrir valores, encontró
gcloud, ADC de usuario en la ubicación estándar de `%APPDATA%/gcloud`, Node y
`google-auth-library` 9.15.1 instalada. `GOOGLE_APPLICATION_CREDENTIALS` no estaba
definida. Esto no prueba identidad, vigencia, scopes ni permisos efectivos. Un
wrapper revisado puede resolver ese ADC, capturar el token sin imprimirlo,
lanzar el runner y descartar la variable al finalizar.

| Lectura | IAM requerido |
| --- | --- |
| Firestore: query y GET de proyecciones | `datastore.entities.get`, `datastore.entities.list`, típicamente `roles/datastore.viewer` |
| Enumerar objetos / obtener metadatos o bytes | `storage.objects.list`, `storage.objects.get` en el bucket |
| UBLA / Public Access Prevention del bucket | `storage.buckets.get` |
| ACL de objetos con `--inspect-acl` | `storage.objects.getIamPolicy` adicional |
| IAM directo del bucket con `--inspect-acl` | `storage.buckets.getIamPolicy` |

Firestore admite scopes `datastore` o `cloud-platform`; Storage admite
`devstorage.read_only`. Un scope OAuth amplio no concede IAM: el alcance real
depende de IAM y de las operaciones del runner. No suponer que
`cloud-platform.read-only` sirve para Firestore: no figura en
[runQuery](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/runQuery).
No solicitar grants ni iniciar login automáticamente ante un 403. Los permisos
ACL adicionales constan en [objects.list](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/list)
y los del bucket en [getIamPolicy](https://docs.cloud.google.com/storage/docs/json_api/v1/buckets/getIamPolicy).

## Ejecución después de revisión y dentro de la autorización vigente

Verificación local, sin servicios:

```powershell
node --test scripts/draftInventoryModel.test.mjs
node scripts/inventoryLegacyDrafts.mjs
```

Con token preparado de forma segura por el operador, lectura acotada:

```powershell
node scripts/inventoryLegacyDrafts.mjs --execute-read-only --project reservaeldia-7a440 --bucket reservaeldia-7a440.firebasestorage.app --inspect-acl --verify-hashes
```

No ejecutar desde emuladores, debugging HTTP, preloads en `NODE_OPTIONS`, TLS
debilitado o captura de claves TLS. El runner rechaza esos indicadores; ejecutar
Node desde un proceso limpio sigue siendo responsabilidad del operador.
La lectura puede producir cargos y registros de auditoría aunque no cambie datos.

Exit 0: terminó el alcance declarado sin errores/límites observados. Exit 2:
inventario parcial, hash pendiente o cobertura incompleta, conservando lo
observado. Exit 1: fallo de preflight/argumentos. Ningún exit certifica aptitud
para desplegar ni privacidad integral del bucket. No aumentar límites para
ocultar un resultado parcial: planificar otra muestra autorizada o una tarea
de inventario mayor. No hay cursor persistido ni tabla reversible de IDs.

## Interpretación

| Clasificación | Evidencia y límite |
| --- | --- |
| `compatible` | Editor HTML explícito, fuera de papelera, marker y vínculo coincidentes, SHA-256 calculado sobre generación observada igual al marker. Compatibilidad estructural con el lector; no establece autoría histórica ni prueba render/HTTP exitoso. |
| `recovery_verifiable` | Destino observado ausente; marker válido, fuente fijada disponible con SHA-256 verificado y plantilla disponible según normalizador compartido. Permite planificar recuperación; no la ejecuta ni prueba procedencia confiable del marker histórico. |
| `pending_hash` | Metadatos coherentes, bytes sin comprobar: flag ausente, objeto grande, encoding o presupuesto impiden llamarlo compatible. |
| `block` | Falta marcador/vínculo, conflicto, hash distinto, papelera, identidad inválida, fuente ausente o plantilla no disponible. Conservar documentos/bytes; no adoptar ni reconstruir automáticamente. |
| `unresolved` | Una precondición no fue observada por permisos, límites o cobertura. No convertir desconocido en ausencia. |
| `outside_html_scope` | Documento explícitamente Konva sin objeto HTML observado; no certifica toda su seguridad. |

Firestore proyecta sólo identidad técnica, modalidad, estado y cuatro hojas de
`draftCreation`. No lee `contenido`, objetos del editor, nombres ni contactos.
Un documento sin `editor` explícito y con marker válido queda
`unresolved/legacy_mode_unverified`: el backend tiene compatibilidad basada en
`contenido`/arrays cuya comprobación requiere otra lectura aprobada. Sin marker
válido sí queda bloqueado por ese motivo. No inferir modalidad por nombre de archivo.

Un marker que satisface el lector pero contiene un `sourcePath` histórico fuera
de la política estricta del inventario queda
`unresolved/binding_outside_inventory_path_policy`. No se consulta esa fuente
ni se relaja la allowlist de red. La restricción del inventario no demuestra
rechazo del lector de aplicación. Un marker inválido sigue siendo `block`.

Un objeto HTML fuera de la muestra de query sólo se considera huérfano después
de un GET exacto del documento con proyección y 404. Si falta presupuesto o
permiso queda `unjoined_html_object`. Ausencia en una muestra parcial no es
inexistencia. No se hace join por email, nombre, texto HTML o similitud.

Los registros usan HMAC-SHA256 con clave aleatoria de 32 bytes sólo en memoria,
truncado a 24 caracteres. `objectId` relaciona documento/objeto dentro del informe;
las corridas no son correlacionables sin la clave, que no se exporta. No se
imprimen slugs, UIDs, hashes del contenido, generaciones, paths privados, tokens,
URLs privadas completas, errores HTTP crudos o principals identificables.
Los agregados de exposición corresponden a objetos **enumerados**; el GET de
HTML adicional queda también en `artifactExposure` del registro de borrador.

## Límites de tokens, ACL, IAM y consistencia

- `downloadTokenPresent` detecta metadata, no uso, validez efectiva, titulares o
  URLs distribuidas. No se abre ninguna URL con token ni se emite una nueva.
  Rules no revoca automáticamente esos accesos.
- ACL pública y bindings públicos directos son señales, no prueba de acceso
  anónimo efectivo. Puede haber condiciones, restricciones o roles sin lectura.
  No se evalúa IAM heredado de proyecto/organización, IAM de managed folders,
  políticas deny ni todas las identidades autorizadas.
- UBLA activo hace inaplicables ACL de objetos. Permisos faltantes conservan
  cobertura incompleta; un 403 al pedir ACL permite continuar con metadatos sin
  ACL, sin afirmar que sean privados.
- No enumera URLs firmadas emitidas, tokens copiados a otros sistemas, caches
  de navegador/CDN, copias externas, generaciones no actuales, objetos borrados
  recuperables ni otros prefijos/buckets. `proveedores/` no cubre imágenes en
  otros namespaces. No consulta Auth ni existencia/suspensión/revocación o
  legitimidad de los titulares.
- Firestore/Storage se leen secuencialmente sin snapshot común. El hash fija
  generación, pero documentos, ACL y estado pueden cambiar. Revalidar todas las
  precondiciones antes de cualquier recuperación/publicación posterior.
- Marcadores históricos coincidentes no prueban procedencia: las Rules nuevas
  pueden no estar desplegadas y sus writers anteriores pueden haber permitido
  falsificación. Reconciliar necesita evidencia independiente de autoría y
  autorización; no se hace backfill por parecido.

## Evidencia de preparación

Se ejecutaron los tests locales sintéticos indicados arriba; el reporte central
conserva la evidencia remota posterior, si se realiza. Este procedimiento no
debe presentar una muestra limitada como inventario completo del sistema.
