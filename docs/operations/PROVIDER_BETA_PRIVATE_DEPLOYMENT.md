# Beta de proveedores — despliegue privado en dos entregas

Status: Operational Diagnostic Evidence.
Fecha: 2026-10-25. Ejecución parcial bajo autorización específica de esta sesión.

El [contrato canónico](../architecture/PROVIDER_DATA_MODEL.md#10-beta-privada-v1-contrato-funcional-y-evolución-compatible)
define comportamiento y permisos. La evidencia local está separada en
[hito 1](../testing/PROVIDER_BETA_MILESTONE_1.md) y
[directorio privado](../testing/PROVIDER_PRIVATE_DIRECTORY.md). Este runbook
registra operaciones y pendientes; por sí mismo no concede autorización remota.

## Alcance autorizado y separación de entregas

El pedido posterior al hito local autorizó llevar el panel a producción privada
y conectar después las landings al directorio aprobado, en dos entregas pequeñas.
Esto no abre el directorio público, el registro, las invitaciones de gestión ni
la importación remota. Se conservan Auth/login de parejas y sus invitaciones.

1. **Panel administrativo:** candidato `e0fa2b76`, preparado en
   `feat/proveedores-beta-base` e integrado en la base local de `main`.
   [PR #1](https://github.com/ataberner/reservaeldia/pull/1) abierto el
   2026-10-25 a las 18:33 UTC. El origen de despliegue de esta entrega es el árbol
   congelado `C:\Reservaeldia`; no incluye cambios del directorio en desarrollo.
   Rules y dos Functions ya aplicadas; PR integrado como `689bde9b`.
   Hosting live y recorrido productivo acotado están comprobados en la sección inferior.
2. **Directorio aprobado privado:** rama corta
   `feat/proveedores-directorio-privado`, actualizada a `689bde9b` (mismo árbol
   que `e0fa2b76` antes de agregar esta entrega), en
   `C:\Reservaeldia\.local-isolation\proveedores-beta-base`. UI/backend y
   comprobaciones locales tienen evidencia propia. No atribuir a esta entrega
   el estado remoto de la primera. Sus dos Functions están aplicadas; Hosting e
   integración siguen pendientes al registrar el checkpoint siguiente.

## Evidencia remota confirmada de la entrega 1

Proyecto `reservaeldia-7a440`, Firestore `(default)`, bucket
`reservaeldia-7a440.firebasestorage.app`, Functions `default`/`us-central1`.
Readback realizado el **2026-10-25T18:29:12Z**:

| Recurso | Evidencia observada |
| --- | --- |
| Firestore Rules | Aplicadas 18:22:45Z. SHA-256 `7033002a97a6a59c7097de2d28a3115987e457b68f759ce17634f2a92c10902a`; ruleset `7205800c-a0ae-4f85-af57-469699cf794c`. |
| Storage Rules | Aplicadas 18:17:42Z. SHA-256 `45ad7da135b748f824df779491c2a02db9b5846eede3b946999de0f6adcb7c23`; ruleset `bcebc406-a235-49be-9259-cb006238c251`. |
| `adminProvidersV1` | Aplicada aproximadamente 18:27Z; ACTIVE, Node 22; revisión `adminprovidersv1-00001-qok`. |
| `providerAdminImageV1` | Aplicada aproximadamente 18:27Z; ACTIVE, Node 22; revisión `provideradminimagev1-00001-fud`. |
| Controles backend | `app_config/proveedoresBeta`: `panelEnabled`, `privateDirectoryEnabled`, `onboardingEnabled`, `directoryEnabled` observados en `false`. |
| Acceso anónimo | Cinco comprobaciones acotadas PASS a las 18:29:16Z. No equivalen a un recorrido autenticado, prueba de otras cuentas ni certificación general de Rules. |

Los hashes corresponden al candidato acotado de
[deployment/provider-beta](../../deployment/provider-beta/README.md), no a una
autorización para reemplazar las Rules canónicas completas. Se conservan los
cierres previos de borradores/catálogos y los bytes ajenos al delta de proveedores.
No se repitió la remediación histórica de tokens ni el cambio general de runtime.

## Procedimiento reproducible y particularidades de CLI

Antes de cada operación, cotejar proyecto, recurso, commit/fuentes y base remota
actual contra la evidencia. No repetir un despliegue terminado sólo para obtener
validación. CLI comprobada: **Firebase Tools 14.4.0**, Node **22.23.4** local.

Para el candidato con `firestore` como array y base `(default)`, CLI 14.4.0
necesita el selector de base explícito. El intento con `firestore:rules` omitió
esa entrega; no se registra como aplicación exitosa:

```powershell
firebase deploy --project reservaeldia-7a440 --config deployment/provider-beta/firebase.json --only 'firestore:(default)'
firebase deploy --project reservaeldia-7a440 --config deployment/provider-beta/firebase.json --only storage
```

La configuración mínima referida contiene sólo Firestore `(default)` y el bucket
nombrado, con reglas locales del candidato. `--only storage` queda acotado por
esa configuración; no sustituirla por una lista de buckets distinta.

Functions de la primera entrega se seleccionan exactamente, sin desplegar todo
`default`, Payments, Email, triggers o schedulers:

```powershell
$env:FUNCTIONS_DISCOVERY_TIMEOUT = '30'
firebase deploy --project reservaeldia-7a440 --only 'functions:default:adminProvidersV1,functions:default:providerAdminImageV1'
```

El discovery local inicial excedió 10 s y falló antes de crear Functions. Subir
su espera local a 30 s permitió descubrir las fuentes; no cambió el timeout de
ejecución remoto, ni reemplazó el gate de ownership. Mantener ambas en Node 22,
timeout 60 s y máximo 3 instancias: callable 256 MiB, media HTTP 512 MiB. Sin
Secrets, sender de correo ni cuentas nuevas como efecto del despliegue.

## Aplicación de la entrega 2

El contrato del directorio especifica el gate independiente
`privateDirectoryEnabled`; `panelEnabled` no abre la lectura del directorio y
viceversa. `directoryEnabled` y `onboardingEnabled` permanecen falsos. El acceso
privado implementado sigue limitado al superadmin verificado existente.

Orden de aplicación, sujeto a los checks finales de esta entrega:

1. Confirmar que las Rules restrictivas de la tabla remota siguen aplicadas.
   No hay una nueva migración, seed, importación ni apertura SDK de proveedores.
2. Conservar `panelEnabled:true` después de verificar la primera entrega y los
   otros tres controles cerrados; desplegar sólo
   `default:providerDirectoryV1` y `default:providerDirectoryImageV1`, región
   `us-central1`, Node 22, 256 MiB cada una, timeout 60 s, máximo 3 instancias.
   Son lecturas callable/HTTP GET; no Secrets ni triggers. Conservar los endpoints
   administrativos de la entrega anterior.
3. Confirmar ACTIVE, recursos/opciones, lectura de config y denegación anónima,
   común, claim admin y superadmin con gate cerrado. Revalidar Rules SDK sin
   ampliar privilegios de cuentas ni editar perfiles como permiso.
4. Aplicar el Hosting revisado con `/lugares/`, `/profesionales/` y
   `/proveedor/?id=...`; noindex no es protección. La exportación debe contener
   únicamente shells y código, nunca fichas, contactos ni credenciales de media.
5. Habilitar sólo el gate privado expresamente autorizado después del cierre de
   acceso. Verificar listados/detalle e imágenes aprobados, cambio de borrador,
   pausa/archivo, contacto y login/invitación de parejas. Los recursos/identidades
   sintéticos remotos requieren autorización específica; la receta local no la
   concede. Registrar evidencia exacta en el cierre siguiente.

No se requieren índices compuestos nuevos ni migración de `proveedores`.
Catálogos ausentes/incompatibles se resuelven con el procedimiento existente,
sin seed remoto implícito. Asignaciones, invitaciones y registro espontáneo
permanecen fuera de esta entrega.

### Checkpoint remoto del backend privado

Verificación integral previa **PASS**, workflow `40226008315`, fuente
`f5a8b722`, además de build/export aislado y recorrido local desktop/móvil.
Se desplegaron exclusivamente las dos Functions indicadas con CLI 14.4.0 y
Node 22.23.4. Los hooks existentes compilaron también los paquetes Payments/Email
localmente; no se desplegaron esos codebases ni sus endpoints.

Readback **2026-10-25T19:41:38Z**:

| Recurso | Resultado |
| --- | --- |
| `providerDirectoryV1` | ACTIVE, Node 22, 256 MiB, 60 s, máximo 3; revisión `providerdirectoryv1-00001-lah`, aplicada 19:41:01Z. |
| `providerDirectoryImageV1` | ACTIVE, Node 22, 256 MiB, 60 s, máximo 3; revisión `providerdirectoryimagev1-00001-jis`, aplicada 19:41:02Z. |
| Alcance | Inventario 113 Functions, todas Node 22; ninguna Function ajena actualizada desde el inicio de este despliegue. `getAdminAccess` y las dos Functions administrativas conservan sus revisiones anteriores. |
| Rules y datos | Hashes de Rules iguales a la entrega 1; 3197 proveedores, incluidos los tres sintéticos. Sin índices, migración ni escrituras de negocios como parte del deploy. |
| Gates | `panelEnabled:true`; `privateDirectoryEnabled:false`, `directoryEnabled:false`, `onboardingEnabled:false`. |
| Acceso anónimo | **7/7 PASS**, 19:41:45Z: callable/media administrativos y de directorio devuelven 401; SDK proveedores/config/Storage rechazan. Media responde `private, no-store`. |

El primer intento local fue detenido al iniciar CLI por permisos del sandbox sobre
su configuración personal, antes de operaciones remotas. La ejecución autorizada
con las credenciales existentes completó el despliegue; se conservan ambos logs.
Este checkpoint no acredita todavía el Hosting del directorio ni su recorrido
productivo autenticado.

## Efectos de PR, Hosting y Netlify

`firebase-hosting-pull-request.yml` despliega preview al abrir/actualizar un PR
del mismo repo tras su job de verificación. `firebase-hosting-merge.yml` despliega
live por push a `main`. No usar esos eventos como atajo para validar un candidato.
El PR #1 ya fue abierto bajo la autorización de esta ejecución; su apertura no
demuestra merge, publicación live ni resultado correcto de sus checks.

También se observó un check **Netlify deploy-preview** en el PR #1. El
`netlify.toml` local declara `npm run build`, salida `out` y Functions de Netlify
en `netlify/functions`; no declara por sí solo los eventos remotos o su resultado.
No se modificaron automatismos. Los checks Firebase y Netlify del PR #1
finalizaron correctamente. El preview Netlify mostró el rechazo anónimo real en
`/admin/proveedores/`; no se inició sesión en ese origen alternativo.

## Estado de Hosting e integración

| Paso | Estado actual / evidencia requerida |
| --- | --- |
| PR #1 checks Firebase/Netlify y preview | PASS: workflow `40221762688` (verificación aislada y build/preview); Netlify deploy-preview success, checks de headers/redirects/pages neutral. Rechazo anónimo observado en `https://deploy-preview-1--reservaeldia.netlify.app/admin/proveedores/`. |
| Integración remota del PR #1 | Integrado mediante merge autorizado `689bde9b6babc8723d346109722e901f5b0061bb`. Sin protecciones ni reviews obligatorias configuradas al comprobar; no se eludieron checks. |
| Hosting live de la entrega 1 | PASS: workflow `40222487740`, build/deploy y `verify:hosting:production` success. Release `1792954156944000`, versión `972c3b51b4275486`, 2026-10-25T18:49:16.944Z, commit `689bde9b`. |
| Gate administrativo | La sesión habitual superadmin vio «Beta privada cerrada» en el Hosting live. A las 18:51:02Z se habilitó sólo `panelEnabled` con precondición de updateTime; los otros tres flags permanecieron false. Cinco denegaciones anónimas repetidas después de habilitar: PASS. |
| Recorrido de panel en producción | PASS acotado con la sesión habitual superadmin: crear/guardar incompleto, editar, enviar/abrir revisión, rechazar aprobación obsoleta, aprobar vigente, preview privado sin nota interna, conservar aprobada al guardar, pausar/reactivar y archivar manteniendo historial. Fotos y cuenta común quedan pendientes explícitos. |
| Login e invitación de parejas en producción | Sesión habitual conservada, dashboard cargado y apertura de un borrador existente en el editor (seis canvases observados); sin acciones de edición, publicación, pago o correo. No equivale a probar credenciales de una cuenta común ni un nuevo login desde cero. |
| Entrega 2, Functions | PASS: dos endpoints activos y denegaciones anónimas, según checkpoint. |
| Entrega 2, PR/Hosting/recorrido | PENDIENTE: integración y Hosting después de checks; gate privado todavía cerrado. |
| Apertura pública | Fuera del alcance; `directoryEnabled:false`, `onboardingEnabled:false`. |

Actualizar esta sección sin sustituir resultados observados por planes ni
convertir un PASS local en comprobación productiva.

Limitaciones productivas confirmadas por el usuario: no hay una cuenta común de
prueba autorizada; su rechazo remoto queda pendiente (cubierto localmente). La
carga de imágenes mediante la extensión Chrome requiere acceso a URLs de archivo;
el usuario prefirió dejar esa comprobación pendiente. No se amplió el permiso ni
se crearon identidades alternativas. Las pruebas locales de imágenes y la
denegación anónima del endpoint remoto son evidencias diferentes.

### Datos sintéticos del recorrido administrativo

Readback acotado a los tres IDs creados por UI, 2026-10-25T19:04:16Z:

| ID | Estado observado |
| --- | --- |
| `prov_017152a8e6c34ab7bd85384043e4cc70` | `BETA PRIVADA 20261025 · Lugar de prueba`: publicado privado, aprobación 4; borrador 7 distinto y revisión administrativa 9 después de pausa/reactivación; nueve eventos. |
| `prov_c3538cbffbe042cbbda56adf98ec6dd2` | `BETA PRIVADA 20261025 · Profesional de prueba`: publicado privado, aprobación 1, revisión administrativa 3; tres eventos. |
| `prov_12105bc6ae0840bc8329c0b41bd9c10c` | `BETA PRIVADA 20261025 · Control de archivo`: borrador incompleto archivado (`estado:eliminado`, `activo:false`); dos eventos, conservado. |

Los tres conservan `visible:false`. No tienen responsable ni fotos; los contactos
usan `example.test`. No se modificaron proveedores reales ni se crearon cuentas,
enviaron correos o ejecutaron pagos. La nota interna sintética sólo se ve en
administración. Estos registros se conservan para la prueba privada siguiente;
no son contenido comercial ni datos a publicar.

## Recuperación segura

Cerrar `panelEnabled` detiene nuevos accesos administrativos/media; cerrar
`privateDirectoryEnabled` detiene lecturas/listados/detalle/media del directorio.
Conservar onboarding/directorio público cerrados. Mantener Rules restrictivas,
snapshots, historial, archivos, cuentas y Node 22. Ante fallo UI, retirar su entrada
o volver a Hosting seguro compatible; ante fallo backend, corregir sólo sus
endpoints con el gate cerrado. No volver a Rules vulnerables, permisos SDK amplios,
download tokens ni runtime antiguo; no borrar fichas/cuentas para recuperarse.
Los bytes privados ya descargados no pueden revocarse del dispositivo de quien
estaba autorizado; no prometer revocación de copias.
