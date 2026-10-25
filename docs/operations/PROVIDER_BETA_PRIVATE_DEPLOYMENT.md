# Beta de proveedores — propuesta de despliegue privado

Status: Operational Diagnostic Evidence.
Fecha: 2026-10-25. Propuesta pendiente de ejecución autorizada.

El [contrato](../architecture/PROVIDER_DATA_MODEL.md#10-beta-privada-v1-contrato-funcional-y-evolución-compatible)
define comportamiento; el [informe](../testing/PROVIDER_BETA_MILESTONE_1.md) registra
pruebas locales. Este documento no autoriza cambios remotos.

## Recursos y orden

1. Revisar el candidato/commits, evidencia local y diff de reglas. Leer estado
   remoto sólo bajo autorización posterior para preparar artefactos acotados que
   conserven protecciones vigentes; no desplegar a ciegas las Rules completas.
2. Mantener `app_config/proveedoresBeta` ausente o con `panelEnabled`,
   `onboardingEnabled`, `directoryEnabled` en `false`. No modificar identidades,
   claims, responsables ni registros importados como prerrequisito del deploy.
3. Preparar Rules con único delta beta: Firestore `proveedores/**` y Storage
   `proveedores/**` sin acceso SDK, conservando `app_config/**` backend-only y las
   exclusiones de fallback. Aplicar estos cierres antes de abrir el panel.
4. Desplegar únicamente `default:adminProvidersV1` y
   `default:providerAdminImageV1`, región `us-central1`, Node 22, sin Secrets ni
   triggers/schedulers/email. Verificar registro de ownership/opciones exactas.
   No volver a desplegar las 109 Functions históricas por este hito.
5. Construir Hosting desde el candidato revisado y aplicar únicamente mediante
   el procedimiento de Hosting autorizado. El shell exportado no contiene datos
   privados; el backend continúa cerrado. No usar un PR como mecanismo de prueba.
6. Comprobar denegación sin sesión, usuario común, claim admin y perfil alterado;
   panel cerrado incluso para superadmin. Sólo después habilitar `panelEnabled`
   para el piloto administrativo, manteniendo los otros dos controles falsos.
7. Con identidades/recursos sintéticos expresamente autorizados, comprobar crear,
   guardar, enviar/revisar, conflicto, pausa/archivo, historial y GET privado de
   foto. Aprobar conserva `visible:false`; una URL conocida sin sesión deniega.
   Repetir un recorrido acotado de login/invitación de parejas sin pagos ni correo.

No se requieren índices compuestos nuevos ni migración masiva. Catálogos ya
existentes se leen/validan; su ausencia/incompatibilidad se resuelve con el
procedimiento de catálogo existente bajo autorización independiente, sin seed
implícito. El registro funcional de cuentas beta y asignaciones es etapa posterior.

## Recuperación segura

Cerrar `panelEnabled` detiene acceso administrativo/media nuevos. Conservar también
cerrados onboarding/directorio. Mantener Rules restrictivas, datos, snapshots,
historial, archivos y Node 22. Si falla UI, retirar su entrada o volver a Hosting
seguro compatible; si falla backend, corregir únicamente esos endpoints con el
gate cerrado. No restaurar permisos SDK amplios, URLs/token de descarga, runtime
antiguo ni versiones vulnerables. No borrar cuentas ni fichas para recuperarse.
Una respuesta privada ya descargada no puede revocarse del dispositivo del
administrador; no prometer revocación de copias.

## Efectos de Git

`firebase-hosting-pull-request.yml` despliega preview al abrir/actualizar PR del
mismo repo; `firebase-hosting-merge.yml` despliega live por push a main. En este
hito sólo hay commits locales y descripción de PR preparada. Antes de push/PR,
resolver explícitamente el control de esos workflows; no autorizar despliegue
indirectamente ni hacer merge.
