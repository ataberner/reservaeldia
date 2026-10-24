# Artefacto acotado de Storage: borradores y proveedores

Estado: candidato local; no desplegado. La autoridad de permisos es
[SECURITY_CONTRACT.md](../../docs/contracts/SECURITY_CONTRACT.md). Este directorio
no sustituye las Rules canónicas ni habilita una operación remota.

`base.rules` se recuperó sin red del blob
`f276a8952a3dfaa7e2f7370ae0be17cb6cd3f35d:storage.rules`. Sus 2325 bytes y SHA256
`bb8224303fd2ee57a00bceee1bde95d5c545b1785ada22b6d79b9af2930c492a`
coinciden exactamente con el ruleset observado
`cd354678-8198-4a0a-b651-0f8f8868e305` en la evidencia local indicada en
`manifest.json`. No se reconstruyó a partir de una transcripción saneada.
Conservar LF: los hashes representan bytes, sin normalización. Los atributos
Git `-text` se aplican por nombre exacto a `base.rules`, `storage.rules`,
`manifest.json` y `firebase.json`, para preservar sus bytes frente a
`core.autocrlf` sin cambiar archivos canónicos ni otros archivos del repositorio.

El candidato `storage.rules` deriva de esa base con sólo estos cambios:

- Las lecturas de portada/galería de proveedores exigen el `isAdmin` existente;
  se retira `isPublicProvider` y su consulta de la tupla pública en Firestore.
- `borradores/{allPaths=**}` deniega todas las operaciones SDK, incluso al dueño
  y al administrador; incluye el objeto cuyo nombre es exactamente `borradores`.
- Las dos cláusulas del fallback excluyen `borradores`, además de `proveedores`.
  Una denegación en un match no revoca un permiso concedido por otro.

Se conservan claims admin/superadmin/role, validaciones de nombre/tamaño/MIME y
escritura admin de fotos, iconos, decoraciones y el fallback remoto restante.
Ese fallback todavía permite accesos amplios de usuarios autenticados a otras
rutas: su caracterización **no constituye aprobación de esos permisos**. No se
incluyen las protecciones adicionales de `storage.rules` canónico para usuarios,
thumbnails, publicaciones o countdown; requieren su alcance y revisión propios.
Rules no invalidan tokens de descarga, URLs firmadas ni copias ya distribuidas.

`firebase.json` contiene sólo Storage y el bucket explícito
`reservaeldia-7a440.firebasestorage.app`; no contiene Functions, Hosting, Firestore,
índices, hooks o targets implícitos. El manifiesto fija hashes de base, candidato
y configuración. No se modificaron las Rules ni configuraciones raíz.

## Comprobación local y preparación de una ventana futura

Con Node 22.23.4 y las herramientas ya preparadas:

```powershell
node --test scripts/local/storageReleaseArtifact.test.mjs
node scripts/local/runStorageRelease.cjs
```

El primer comando sólo usa archivos locales y fixtures temporales. El segundo
crea dos sesiones aisladas consecutivas bajo `.local-isolation/storage-release-*`,
con Firestore y Storage demo, HOME vacío, bloqueo Node de conexiones externas,
JARs verificados en caché, sin instalación, Auth, Functions, Next ni lectura de
credenciales/tokens ADC. Usa
Admin sólo para fixtures sintéticos exactos; los accesos evaluados usan el SDK
cliente y tokens mock oficiales del emulador. No reutiliza procesos ajenos.
Guarda los archivos exactos probados, manifiestos, TAP, resultados y registro de
detención de sus procesos. Ejecutar después de coordinar recursos locales.

La matriz cubre get/list/create/update/delete de borradores propios/ajenos,
prefijos exactos, proveedores públicos/privados, visitante/A/B/admin y variantes
de claims, perfil editable que se atribuye admin, validaciones de imágenes y
caracterización de rutas no alcanzadas contra la base observada. La regla de
Firestore del harness sólo deniega clientes y sirve para fixtures; no representa
una validación de las Rules Firestore productivas.

Antes de un eventual despliegue **autorizado por separado**, el operador debe
obtener evidencia nueva con el recolector de sólo lectura revisado y conservar
su procedencia. Luego, desde la raíz:

```powershell
node scripts/local/storageReleaseArtifact.mjs --evidence <control-plane-fresco.json>
```

El gate no consulta red ni despliega. Rechaza otra base/ruleset/release, proyecto,
bucket, contenido/configuración inesperados y observaciones de más de 15 minutos
o futuras. Usa la observación más antigua de un reporte reanudado: actualizar
sólo `finishedAt` no refresca datos previamente leídos. La evidencia original ya
no satisface ese plazo; no se alteran sus timestamps para hacerla pasar.

Un archivo JSON y su timestamp no autentican una lectura remota. El operador
debe comprobar su origen en el recolector revisado y realizar el control junto
a la operación futura; el gate no es una precondición atómica del servicio.
Ante deriva, detener y preparar/revisar otra base, sin volver a consultar ni
adaptar automáticamente. El directorio no contiene un comando que despliegue y
la CLI de Firebase por sí sola no ejecuta este guard: el procedimiento autorizado
debe exigirlo como paso previo y comprobar después el release efectivo.

La base es evidencia de comparación, **no un rollback seguro**: restaurarla
reabriría los accesos corregidos. Ante fallas, mantener el cierre de seguridad y
preparar una revisión correctiva hacia adelante.

## Evidencia ejecutada el 23 de octubre de 2026

- Guard offline: 14/14 PASS; la evidencia remota histórica fue rechazada con
  `fresh_read_required`, como corresponde. Ninguna nueva consulta remota.
- Base: 312/312 PASS en `.local-isolation/storage-release-GcuXfr/tests.tap`,
  SHA256 `4ebd127f5f9fe36b9b625d54f61f3a7c906d3af3b4221b4c631b519f26d39022`.
- Candidato: 312/312 PASS en `.local-isolation/storage-release-UPQoR2/tests.tap`,
  SHA256 `eab493d7c73bb4cf4558b330b78bed21f52bd7a25acb66f1e86999a9c5959b2a`.
- Ambos guardaron `source-manifest.json`, las copias exactas de los archivos,
  `rules-results.json` y `session.json`: cero fallos de limpieza, cero intentos
  externos de las suites y cierre confirmado de los procesos propios. Ventana
  total de estas sesiones: 22:41:37–22:42:25 UTC.
- Node 22.23.4, CLI 14.4.0, Firebase cliente 11.7.3, Admin 13.4.0,
  Firestore emulator 1.19.8, Storage rules runtime 1.1.3, OpenJDK 25.0.2. Esto no
  sustituye una corrida CI con otra plataforma/JDK ni un canario remoto.

Comparación de las mismas 312 operaciones: cambiaron las 48 autorizaciones
autenticadas de borradores y 12 lecturas/listados de proveedores públicos sin
claims admin. Las 128 operaciones de rutas ajenas al delta no cambiaron; tampoco
las 48 escrituras de proveedores, cinco validaciones de imágenes ni las restantes
denegaciones y accesos admin. Se contrastó cada posición/categoría/actor/operación
de ambos resultados, sin inferir igualdad sólo de los conteos.

Intentos previos conservados: `storage-release-Vp8XSy` falló antes de evaluar
Rules porque Admin 13 no acepta una credencial estructural para Firestore; Windows
también requirió escalación para detener su árbol propio. `storage-release-iNKecB`
pasó las 312 operaciones pero el control de aislamiento detectó dos probes GCP
impedidos por el guard de sockets. El harness final usa el tipo de credencial del
bootstrap existente, adquisición de token prohibida y la opción soportada
`METADATA_SERVER_DETECTION=none`. Se corrigieron las causas y la corrida final
pasó sin relajar expectativas de permisos ni el control de red. No se alteraron
las evidencias fallidas para presentarlas como aprobadas.

Después de aprobar Storage, el runner incorporó el modo fijo
`--firestore-assets` para probar por separado el artefacto
`deployment/render-asset-firestore/`. Tres tests nuevos del selector pasaron;
ese modo ejecutó sólo su matriz de 160 casos (PASS, sesión
`.local-isolation/storage-release-kG9MHM`), sin repetir Storage. Las sesiones
Storage conservan el snapshot del runner con el que se ejecutaron. El default
sigue probando base y candidato Storage, y ningún modo acepta overrides de
proyecto, bucket o configuración.
