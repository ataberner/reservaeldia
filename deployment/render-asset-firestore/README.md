# Dependencia Firestore del permiso de assets compartidos

Estado: candidato local separado, no desplegado. Este artefacto sostiene la
autoridad administrativa que necesita la política de render de catálogos activos.
No implementa un panel, perfiles de proveedor, Q1 ni una corrección general de
Rules. No modifica `firestore.rules` ni `firebase.json` de la raíz.

La base es el snapshot exacto `base.rules` del archivo canónico local
`firestore.rules`, con sus cambios previos, 14370 bytes y SHA256
`700e0117fab33ccac394311907976fca5f0334b0b05d92adf709de7f0c12d1f0`.
**No representa una lectura del estado remoto.** El candidato conserva todos
los bytes ajenos al fallback y separa sus cláusulas read/write. El predicado de
read se conserva byte por byte; únicamente write agrega las exclusiones de
`iconos` y `decoraciones`. Sus hashes, tamaño y configuración están en
`manifest.json`.

Los cuatro archivos del artefacto (`base.rules`, `firestore.rules`,
`manifest.json` y `firebase.json`) tienen atributos Git explícitos `-text`
en este directorio. Git conserva sus bytes al guardar y recuperar el contenido,
independientemente de `core.autocrlf`; no se normalizan las Rules canónicas ni
otros archivos del repositorio. El candidato y su configuración conservan los
bytes y hashes usados en la suite SDK de 160 casos.

El motivo es concreto: `renderAssetCatalogAccess.ts` sólo concede acceso a una
referencia exacta de un catálogo activo. Si cualquier usuario puede modificar
ese registro por el fallback, puede convertirlo en un permiso para sí mismo.
El match administrativo de cada catálogo no anula un grant del fallback.

Se conservan sin rediseño los grants explícitos y las variantes de claims
`admin: true`, `superadmin: true` y `role: "admin"`. Un campo equivalente en el
perfil propio no concede privilegios. La matriz resultante es:

| Recurso | Lectura SDK | Escritura SDK |
| --- | --- | --- |
| `iconos/{id}` | Usuario autenticado | Claims administrativos existentes |
| `decoraciones/{id}` | Usuario autenticado, por el fallback existente | Claims administrativos existentes |
| Descendientes bajo ambos catálogos | Usuario autenticado, por el fallback existente | Denegada |

Las búsquedas estáticas en `functions/src/iconCatalog/repository.ts`,
`functions/src/decorCatalog/repository.ts`, sus módulos de auditoría y las APIs
administrativas de `src/components/admin/` encontraron documentos raíz y
colecciones hermanas de auditoría/archivo; no consumidores Firestore de
subcolecciones bajo `iconos/{id}` o `decoraciones/{id}`. Esto no inventaría datos
remotos ni consumidores externos. Las colecciones hermanas no cambian.

## Compatibilidad y límites

El editor ordinario consume decoraciones mediante
`src/domain/elements/service.js`, `fetchFirestoreDecorCatalogPage`, llamado por
`src/hooks/useElementCatalog.js`. Separar read/write conserva exactamente el
permiso de sus consultas y evita retirar esa capacidad al cerrar las escrituras.
También conserva las lecturas autenticadas de descendientes; este artefacto
no aprueba ni redefine la política de privacidad de esos documentos. No cambia
el cliente ni amplía ningún permiso de lectura.

La revalidación SDK de iconos (`requestIconCatalogRevalidation` en el mismo
servicio) también pasa a exigir los claims administrativos existentes. La
escritura de catálogos por una cuenta ordinaria deja de ser una capacidad válida.

## Validación local

Con Node 22.23.4 y las herramientas locales ya preparadas:

```powershell
node scripts/local/firestoreAssetReleaseArtifact.mjs
node --test scripts/local/firestoreAssetReleaseArtifact.test.mjs
node scripts/local/runStorageRelease.cjs --firestore-assets
```

El guard sólo lee archivos locales: exige el hash del snapshot exacto y deriva
de esos bytes el candidato. Compara además el canónico con ese snapshot
normalizando únicamente CRLF a LF, para admitir los checkouts Linux/Windows.
Cualquier otra diferencia (espacios, comentarios, BOM, CR aislado, salto final
o permisos) exige revisar una base nueva. El snapshot y el candidato siempre
se comprueban byte por byte, sin normalización. Rechaza otra base, cambios
adicionales (incluido cualquier cambio de lectura), otra base de
datos, servicios adicionales o hooks. No consulta red, no autentica evidencia
remota y no despliega. `firebase.json` contiene únicamente Firestore `(default)`;
no contiene índices, Storage, Hosting ni Functions.

El último comando usa el harness demo aislado existente, con HOME limpio,
bloqueo de conexiones externas para Node, sin Auth/Functions ni credenciales
operativas. Firestore carga **este archivo exacto**; Storage sólo acompaña al
harness y no recibe pruebas nuevas en este modo. El manifiesto de la sesión
registra hashes de la base, candidato, configuración y fuentes de la prueba.
No iniciar otra instancia simultánea; coordinar los puertos y recursos locales.

La suite SDK contiene 160 casos get/list/create/update/delete: anónimo, A, B,
claims administrativos válidos, claim booleano inválido y perfil propio con
campos admin falsificados, en ambos documentos raíz y sus descendientes.
Admin se usa exclusivamente para fixtures sintéticos exactos y su limpieza;
las operaciones evaluadas usan el SDK cliente. La creación del perfil forjado
también usa el SDK cliente. Los resultados ejecutados deben consultarse en la
sesión correspondiente; preparar la suite no equivale a haberla aprobado.

Ejecución local de este candidato exacto: **160/160 PASS**, Node 22.23.4,
sesión `.local-isolation/storage-release-kG9MHM`, 23/10/2026.
`tests.tap` SHA256:
`e64b5f80b5eac5601f5e6ad0578f3422fdd919768f62f23353a3a508cfd836bc`.
La suite registró cero intentos externos y limpieza completa. El empaquetado
posterior conservó los bytes probados; guards finales 18/18 y comprobaciones
Git de EOL están detallados en el informe de autorización.

Un futuro despliegue requiere autorización separada, verificar la compatibilidad
indicada, comparar este candidato con las Rules remotas reales y revisar el
delta efectivo completo, además de canarios y comprobación del release final.
El cambio de predicados es respecto de la base **local**, no una promesa de un
delta equivalente respecto de producción. No restaurar la escritura del fallback como rollback:
volvería a permitir falsificar la autoridad del catálogo.
