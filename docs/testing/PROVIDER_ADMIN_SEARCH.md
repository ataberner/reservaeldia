# Búsqueda administrativa de proveedores — corrección y verificación

Status: Testing Baseline.
Fecha: 2026-10-25. Implementación y comprobaciones en curso; no es evidencia de despliegue.

Autoridad: [Provider Data Model §10.4](../architecture/PROVIDER_DATA_MODEL.md#104-backend-archivos-administración-y-beta).
Este informe conserva reproducción, mediciones y resultados. Actualizar ante cambios
de búsqueda, cursores, límites o despliegue; no duplica permisos ni reglas de negocio.

## Base y causa

Rama `fix/busqueda-administrativa-proveedores`, worktree
`C:\Reservaeldia\.local-isolation\busqueda-administrativa-proveedores`, desde
`origin/main` comprobado en `da0831b8`. Se conserva como antecedente separado el
commit documental pendiente `4f268e0e`, sin alterar el worktree de la entrega previa.
Las dependencias reutilizadas tienen los cinco lockfiles semánticamente iguales;
la comparación inicial de bytes difería por finales de línea, no por paquetes.

`betaService.ts:listProviders` detenía la búsqueda después de 500 candidatos y
devolvía el ID del último examinado como cursor, aunque no hubiera coincidencias.
El orden por ID sitúa `prov_*` después de miles de `pcar_*`. Además, completar una
página no comprobaba si existía otra coincidencia. La UI presentaba esos bloques
como páginas de resultados. `scanned` contaba filas examinadas, no necesariamente
todos los documentos recibidos desde Firestore.

## Evidencia de esta corrección

Node 22.23.4, sin destinos remotos en los tests:

| Comprobación | Resultado observado |
| --- | --- |
| Reproducción backend antes del cambio | Dos fallas funcionales: coincidencia 601 ausente y página completa con continuación falsa. |
| Reproducción UI antes del cambio | Cinco regresiones nuevas fallaron; cinco casos existentes pasaron. |
| Build canónico y backend focal | PASS; 38/38 tests: 11 búsqueda, 17 beta, 10 directorio. |
| UI y formulario | PASS; 17/17, incluidas respuestas fuera de orden, retry, filtros y retorno tras guardar. |
| Lint | PASS; 318 archivos, cero errores; 233 advertencias preexistentes. |
| Ownership local | FAIL integral por timeout CLI default de 10 s; tres builds y 41/41 tests internos pasaron. No se relajó ni repitió el límite. CI integral obligatorio antes de desplegar. |
| Volumen/API/browser local | En ejecución; no declarado aprobado. |
| CI, integración y despliegue | Pendientes al crear este informe. |

Evidencia ignorada en el worktree: `.local-isolation/admin-search-frontend/`,
`.local-isolation/contracts-build-jSkqHM/`, `.local-isolation/lint-evidence.json`,
`.local-isolation/ownership-IVKxGw/workspace` y `.local-isolation/reports/run-kGVSHP/`.
Los tests de volumen crean 3.205 registros sintéticos mediante emuladores; el caso
de exceso usa 5.001. El wrapper de medición cuenta documentos devueltos por cada
query además de los examinados y la lectura independiente del control de beta.
No hay nueva telemetría ni datos de negocios en logs de producción.

Para repetir el recorrido focal después de preparar las herramientas del repositorio:

```powershell
$env:Path = 'C:\Reservaeldia\.local-isolation\tool-cache\node-v22.23.4-win-x64;' + $env:Path
node scripts/local/runLocal.cjs check
node scripts/local/runLocal.cjs provider-admin-search
```

Ese modo valida destinos demo, copia el workspace, compila, ejecuta API/browser,
detiene servicios propios y verifica modo offline. No reemplaza ownership, lint,
el gate integral de CI ni el build/export de Hosting. Guarda capturas sintéticas
y mediciones explícitas; sus tiempos no certifican latencia ni facturación remota.

## Base remota comprobada antes de operar

Lectura 2026-10-25 22:25 UTC: 3.199 proveedores, cuatro controles de beta con sus
valores autorizados, 113 Functions Node 22 y Rules sin cambios respecto del artefacto
de la entrega privada. `adminProvidersV1` estaba en `adminprovidersv1-00001-qok`.
El conteo de las 22:35 UTC confirmó 3.194 documentos anteriores a la ficha sintética
existente `prov_017152a8e6c34ab7bd85384043e4cc70`. No se modificó ninguna ficha.
La configuración del candidato coincide en memoria con `getAdminAccess` y
`adminProvidersV1` remotos; el archivo local permanece ignorado, sin valores en evidencia.

## Operación autorizada

El push de esta rama sólo ejecuta la verificación del candidato. PR dispara Hosting
preview; merge a `main` dispara Hosting live después de los checks existentes.
Preparar y verificar primero el backend compatible, desplegar exclusivamente
`functions:default:adminProvidersV1`, y después integrar frontend mediante PR.
No cambia ownership, runtime, opciones del endpoint, Rules, índices ni fotos.
Conservar `panelEnabled:true`, `privateDirectoryEnabled:true`,
`directoryEnabled:false`, `onboardingEnabled:false`. Verificación productiva sólo
con fichas existentes y lecturas; no modificar los negocios creados por el usuario.

Ante fallo, cerrar únicamente el panel si compromete su funcionamiento seguro,
manteniendo el directorio privado y las protecciones. Corregir el endpoint o UI
conservando datos y permisos; no volver a reglas vulnerables ni presentar el
escaneo anterior como una búsqueda correcta.
