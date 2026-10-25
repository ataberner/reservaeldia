# Candidato Rules para beta privada

Sólo preparación local, sin deploy. Contrato y secuencia:
[PROVIDER_BETA_PRIVATE_DEPLOYMENT.md](../../docs/operations/PROVIDER_BETA_PRIVATE_DEPLOYMENT.md).

Bases inmutables tomadas de los artefactos históricos de seguridad que conserva
Git: `deployment/render-asset-firestore/firestore.rules` y
`deployment/storage-draft-provider/storage.rules`. Los informes previos registran
su aplicación, pero estos archivos no prueban la ausencia de deriva remota actual.
Antes de aplicar se necesita comparación remota fresca y autorización explícita.

Único delta: eliminar grants SDK de `proveedores/**` en ambos servicios, incluyendo
subcolecciones, medios nuevos y prefijos. Todos los demás bytes de las bases se
conservan, incluidos los cierres de borradores y catálogos ya existentes. No
desplegar las Rules canónicas completas en lugar de este candidato acotado.
`.gitattributes` conserva los bytes y declara CRLF como final de línea válido
únicamente para el candidato Firestore; siguen activos los checks de espacios
sobrantes. No normalizar ese archivo sin revisar hashes y base.

Generar o comprobar, sólo filesystem local:

```powershell
node scripts/local/providerBetaReleaseArtifact.cjs --check
node --test scripts/local/providerBetaReleaseArtifact.test.cjs
```

`--write` regenera únicamente estos cuatro artefactos desde las bases fijadas;
no acepta otra base y falla ante deriva. No despliega ni obtiene credenciales.
El hash de `manifest.json` no es un permiso para operar.

Recuperación: cerrar controles beta y mantener estas restricciones. No restaurar
los grants SDK históricos ni download tokens. Las bases sirven para comparar el
delta; no constituyen una propuesta de rollback vulnerable.
