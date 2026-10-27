# Asistencia de diseño en el modal de inicio

Estado al 2026-10-26: implementación local; **sin deploy**. El usuario autorizó
implementar y desplegar. El bloqueo es técnico, no una aprobación pendiente.

## Comportamiento y alcance

- Modal de completar perfil con estilos propios, texto de ayuda sin costo
  adicional y posibilidad de personalizar desde el editor.
- Checkbox opcional, desmarcado para cuentas nuevas. WhatsApp opcional incluso
  al solicitar asistencia; se fomenta su uso sin mostrar el texto eliminado
  sobre el contacto por email.
- Preferencia privada en `usuarios/{uid}.designAssistance`; validación compartida,
  escritura sobre el UID autenticado y compatibilidad con clientes anteriores.
- Directorio superadmin con solicitud y enlace de WhatsApp o email de Auth.
  El contacto es manual; no se envían mensajes automáticamente.
- Se modifica el modal existente. El registro por email que ya completa el
  perfil conserva su recorrido y no fuerza un segundo modal.
- Functions existentes afectadas: `upsertUserProfile`, `getMyProfileStatus`,
  `listUsersDirectory`, `getUserDirectoryDetail`, codebase `default`,
  región `us-central1`. Sin nuevos endpoints, cambios de opciones, Rules,
  claims, dependencias ni migraciones.

Contrato: [DATA_MODEL](../../docs/architecture/DATA_MODEL.md#asistencia-de-diseño-en-el-perfil).
Estilos: [CSS_ARCHITECTURE_CONTRACT](../../docs/architecture/CSS_ARCHITECTURE_CONTRACT.md)
y [mapa landing/dashboard](../../docs/architecture/LANDING_DASHBOARD_STYLING_MAP.md).

## Verificación ejecutada

Evidencia local en `.local-isolation/profile-assistance-20261026/`.
Runtime: Node 22.23.4; Firebase CLI fijado por el repositorio: 14.4.0.

| Verificación | Resultado |
| --- | --- |
| Contrato compartido, directorio administrativo y auth gate | 31 pruebas aprobadas; la prueba adicional de navegador no inició |
| Modal React real en JSDOM | 1 prueba aprobada, con casos de asistencia opcional, teléfono, reintento y doble submit |
| Callables compiladas con colaboradores en memoria | 2 pruebas aprobadas, incluyendo identidad, datos inválidos y clientes anteriores |
| Builds default/payments/email y copias compartidas | Aprobados; copias verificadas |
| Ownership/packages/configuración | 41/41 aprobadas en reintento sin cambiar assertions ni timeouts |
| Discovery con CLI real | Pendiente: default agotó 10 segundos; payments/email no se ejecutaron después de ese fallo |
| Lint de Functions y contratos | 324 archivos; 0 errores, 233 advertencias |
| Next build/export y verificación estática | Aprobados; build ID `kTt0EJHMbtVpYIxhb2S31` |
| Integración Auth/Firestore/Functions | No ejecutada: hub del emulador no abrió puerto 14400 en 60 segundos |
| Navegador desktop/mobile | No ejecutado: Windows rechazó iniciar Chromium (3221225506) |
| Diff y encoding de archivos alcanzados | Sin errores de whitespace ni caracteres de reemplazo |

Logs principales: `frontend-tests.log`, `modal-dom-tests.log`,
`backend-tests-final.log`, `ownership-copies.log`,
`ownership-retry-tests.log`, `ownership-retry-result.json`,
`lint-final.json`, `hosting-build-result.json`, `integration-result.json`.
El launcher de emuladores registró sus procesos cerrados y los ocho puertos
libres en `.local-isolation/reports/run-B6iky9/result.json`. El runner de la
integración confirmó nuevamente puertos libres.

El primer intento de ownership sufrió timeouts mientras se copiaban
dependencias; el reintento de las 41 pruebas pasó cuando terminó esa actividad.
El gate completo sigue pendiente por discovery; no se declara aprobado.

## Deploy pendiente

El preflight no pudo resolver `reservaeldia.com.ar`,
`cloudfunctions.googleapis.com` ni `firebasehosting.googleapis.com`
(`ENOTFOUND`). Se detuvo antes de consultar configuración remota autenticada
o ejecutar operaciones de despliegue. No hubo escrituras productivas.

El candidato Hosting en
`.local-isolation/profile-assistance-20261026/hosting-workspace/`
parte de la última copia de release disponible
(`.local-isolation/admin-drafts-release-20261025/workspace/`) y superpone los
archivos de frontend de esta tarea. Excluye los cambios ajenos de FAQ y conserva
el historial estático disponible. Su configuración incluye solamente Hosting.
Esa copia local **no prueba cuál es la versión actualmente publicada**: falta
revalidar el remoto y su configuración pública.

Para continuar, conservar los cambios ajenos sin commit, completar navegador,
integración y discovery en un entorno operativo; luego renovar el preflight
remoto, verificar configuración y release vigentes, y preparar el despliegue
limitado a las cuatro Functions indicadas y Hosting. Publicar primero los
consumidores backend y luego el frontend; comprobar endpoints y release tras
cada paso, siguiendo el [ownership canónico](../../docs/architecture/FUNCTIONS_CODEBASE_OWNERSHIP.md)
y la [guía de cambios](../../docs/operations/CHANGE_WORKFLOW.md).
No desplegar Rules, otras Functions ni todo el árbol de trabajo.
