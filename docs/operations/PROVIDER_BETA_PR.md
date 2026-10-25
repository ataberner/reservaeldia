# PR preparado — beta privada de proveedores, etapas 1–3

Status: Operational Diagnostic Evidence.

Título: `feat(proveedores): administración privada con revisión y versión aprobada`

Rama: `feat/proveedores-beta-base`. Base comprobada: `d3ba5c22`, que contiene
`2c4fe15a` (autorización y Node 22). Este documento es el cuerpo preparado del PR;
no se abrió ni se hizo push. Los workflows actuales pueden desplegar Hosting al
recibir eventos de PR: revisar sus efectos antes de crear el PR remoto.

## Problema y comportamiento resultante

Las fichas importadas tenían un modelo y pipeline reutilizables, pero no una
administración que separara borrador, revisión y contenido aprobado. Este cambio
agrega `/admin/proveedores/` usando Auth y superadmin existentes. Todo acceso exige
el control backend de beta; directorio e incorporaciones permanecen cerrados.

Administración puede buscar y filtrar un listado paginado, crear y editar fichas
V1, gestionar fotos privadas, examinar una revisión concreta, aprobar, pedir
correcciones, pausar, reactivar y archivar con historial. Guardar una nueva
descripción o foto conserva la versión aprobada anterior; una revisión desfasada
o una edición concurrente devuelve conflicto. Aprobar mantiene `visible:false`.

## Implementación

- Conserva `proveedores/{id}`, IDs importados y `propietario.userId`. Lee schema 2
  y adopta schema 3 al editar; no migra masivamente ni crea otra base de negocios.
- `adminProvidersV1` y `providerAdminImageV1` quedan en `identity-support/default`,
  Node 22, sin Secrets ni disparadores de correo. SDK directo a fichas, historial
  y archivos queda cerrado; sólo backend autenticado entrega DTOs y bytes privados.
- Proyecciones por lista de campos permitidos, snapshots independientes y
  transacciones con revisión esperada. La primera edición legacy exige también
  su versión de Firestore; enriquecimiento rechaza fichas adoptadas por beta.
- CSS de la ruta, sin migración global de estilos. Login, destino del dashboard
  de parejas, landings públicas y editor conservan su implementación.
- Contrato funcional completo en
  [PROVIDER_DATA_MODEL §10](../architecture/PROVIDER_DATA_MODEL.md#10-beta-privada-v1-contrato-funcional-y-evolución-compatible).
  Importación UI, responsables, invitaciones, solicitudes y directorio se dejan
  para las etapas correspondientes; no hay acciones simuladas.

## Validación y alcance comprobado

Resultados, comandos, evidencia visual y limitaciones:
[PROVIDER_BETA_MILESTONE_1.md](../testing/PROVIDER_BETA_MILESTONE_1.md).
Las pruebas usan emuladores demo, cuentas/bytes sintéticos y bloqueo de red
externa. No equivalen a una comprobación de producción ni reemplazan los límites
históricos de seguridad documentados.

## Aplicación posterior

[Propuesta privada acotada](PROVIDER_BETA_PRIVATE_DEPLOYMENT.md) con
[artefactos Rules exactos](../../deployment/provider-beta/README.md), controles
cerrados, dos Functions y Hosting. Requiere autorización posterior y comparación
fresca de Rules remotas. La recuperación conserva Rules restrictivas, Node 22,
datos e historial; no restaura permisos o versiones vulnerables.

No se ejecutaron despliegues, migraciones remotas, correos, pagos ni creación de
usuarios reales. Próxima etapa funcional: importación con preview, selección,
idempotencia y reanudación, en una rama nueva desde la base integrada.
