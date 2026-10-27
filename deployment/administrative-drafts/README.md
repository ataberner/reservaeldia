# Rules acotadas para creación y edición administrativa

Artefacto para AD1, aplicado y verificado el 2026-10-26 UTC por autorización
explícita del usuario. La [evidencia de despliegue y sus límites](../../docs/contracts/SECURITY_CONTRACT.md#administrative-drafts)
registra Rules, cinco Functions y Hosting. Este archivo no ejecuta operaciones.
La
[decisión de seguridad](../../docs/contracts/SECURITY_CONTRACT.md#administrative-drafts)
autoriza el canal backend explícito y conserva el dueño y el aislamiento SDK.
La autorización operativa de la sesión no se deriva de este archivo.

Base exacta: `deployment/provider-beta/firestore.rules`, SHA256
`7033002a97a6a59c7097de2d28a3115987e457b68f759ce17634f2a92c10902a`.
El [runbook de proveedores](../../docs/operations/PROVIDER_BETA_PRIVATE_DEPLOYMENT.md)
registra ese hash aplicado el 25/10/2026; ese registro histórico no reemplaza
una lectura remota fresca en la ventana actual.

El candidato agrega únicamente el helper de reconocimiento de revisión AD1 y
el delta create/update de `borradores/{draftId}`. Estos fragmentos coinciden con
las Rules canónicas probadas. Todos los bytes restantes de la base se conservan,
incluidos el cierre SDK de proveedores y la exclusión write del fallback de
iconos/decoraciones. No se cambia read/delete, propietario, publicación, Storage,
índices, claims ni la decisión Q1. El manifiesto fija fuente, tamaño y hashes;
`.gitattributes` conserva los bytes CRLF de Rules sin normalizarlos.

Comprobación local con el Node fijado en `.node-version`:

```powershell
node scripts/local/administrativeDraftReleaseArtifact.cjs --check
node --test scripts/local/administrativeDraftReleaseArtifact.test.cjs
node scripts/local/runStorageRelease.cjs --administrative-drafts
node scripts/local/administrativeDraftReleaseArtifact.cjs --check --evidence <reporte-fresco-absoluto>
```

`--write` regenera solamente estos archivos desde la base y los fragmentos
canónicos fijados por hash. No acepta otra lógica ni otros bytes de base. El
guard no usa credenciales, no consulta servicios y no despliega. La evidencia
remota requiere origen confiable: tres GETs release/ruleset/release iguales,
proyecto/base `(default)` esperados, bytes exactos y antigüedad máxima15 minutos.
Un JSON por sí mismo no autentica su origen. No editar fechas ni adoptar deriva
para satisfacer el guard; conservar la captura anterior y obtener otra lectura.

La configuración contiene sólo Firestore `(default)`. Para CLI14.4.0 el selector
de base explícito es `--only 'firestore:(default)'`; el proyecto debe fijarse
como `reservaeldia-7a440`. El operador compara de nuevo release/hash justo antes
de aplicar y verifica después release y bytes candidatos. El guard local no es
una precondición atómica del servidor. No usar `firebase.json` raíz ni el archivo
canónico completo: reabrirían el fallback de catálogos y arrastrarían otro delta.

Orden: Rules → backend y frontend coordinados → readback y comprobaciones
autorizadas. No habilitar la edición antes de tener los checks de revisión del
writer y de música. Las pestañas antiguas deben recargarse para guardar contenido
de un borrador administrativamente revisado; no relajar Rules por compatibilidad.

Recuperación: conservar la reserva de revisión/auditoría y la precondición del
writer de música; cerrar el acceso a la nueva UI/canal y corregir hacia adelante
si fuese necesario. Tras existir borradores con revisión administrativa, volver
a las Rules o escritores previos reabre sobrescrituras. `base.rules` documenta
el delta, no es una propuesta de rollback. Mantener también los cierres previos
de catálogos/proveedores; no hacer migraciones ni borrar campos para destrabar
clientes antiguos.

Los tests de artefacto comprueban derivación, paridad de los fragmentos, bytes
ajenos, configuración y rechazo de evidencia vencida/alterada. No equivalen a
una ejecución SDK contra el candidato ni a validación remota; los resultados
ejecutados y sus límites se registran por separado.
