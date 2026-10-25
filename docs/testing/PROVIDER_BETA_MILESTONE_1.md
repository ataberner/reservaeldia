# Beta privada de proveedores — hito 1

Status: Testing Baseline.
Fecha: 2026-10-25. Alcance: etapas 1–3 locales; sin efectos remotos.

Contrato: [Provider Data Model §10](../architecture/PROVIDER_DATA_MODEL.md#10-beta-privada-v1-contrato-funcional-y-evolución-compatible).
Este informe registra evidencia, no redefine comportamiento.

## Base y dependencias

Worktree aislado `.local-isolation/proveedores-beta-base`, rama
`feat/proveedores-beta-base`, base `d3ba5c22`. El árbol principal estaba limpio.
`git merge-base --is-ancestor 2c4fe15a d3ba5c22` devolvió 0: la base contiene las
correcciones aprobadas y Node 22; el commit posterior registra el cierre de
tokens. No se copiaron cambios ajenos ni configuración personal al sandbox.
No se afirma que Git pruebe por sí mismo el estado remoto.

Los antecedentes [DRAFT_PROVIDER_AUTHORIZATION.md](DRAFT_PROVIDER_AUTHORIZATION.md)
y su runbook conservan sus límites: primer objeto históricamente no verificable,
A/B remotos diferidos y ausencia de certificación exhaustiva de drenaje/CI.
No se repitieron despliegues ni la remediación de tokens.

## Verificación prevista y evidencia

La evidencia ejecutada se completará al cerrar el hito. Hasta entonces esta
sección no declara PASS. Casos requeridos: beta cerrada, visitantes/usuarios/
claims/perfil alterado denegados, SDK cerrado, proyección sin datos internos,
revisiones exactas, edición concurrente, pausa/archivo con historial, compatibilidad
schema 2, fotos sin tokens, escritorio/móvil y login/recorrido de parejas.

## Límites

No se probarán producción, cuentas reales, correos, pagos, importación remota ni
apertura pública. Etapas 4–9 siguen pendientes según el contrato canónico.
