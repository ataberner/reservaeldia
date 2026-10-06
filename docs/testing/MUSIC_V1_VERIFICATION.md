# Verificación de Música V1

Status: Testing Baseline.
Fecha: 2026-10-05. Entorno: Windows, Node 22.13.1, Chromium fijado 138.0.7204.157; servicios demo/locales.
Alcance: implementación para revisión; sin merge, push, migración ni deploy.

## Aislamiento y arquitectura

Worktree `C:\Reservaeldia-music`, rama `feature/music`, base `cde1bc82f13a066006fe62c99fc3011e2132bccc`.
La comprobación final de `C:\Reservaeldia` lo encontró en main, limpio y todavía en ese commit.

| Frontera auditada | Resultado/owner |
| --- | --- |
| Sidebar / Regalos / switch | Registro DashboardSidebar, montaje MiniToolbar y estilos activation de Regalos reutilizados. |
| Estado y persistencia | CanvasEditor → bridge/snapshot → useBorradorSync → editorSessionPersistence/FIFO. Music global opcional, sin canvas section ni URL. |
| Roles y disponibilidad | canManageSite/requireAdmin existentes; rollout separado. Cambios de draft con Música via callable atómica owner-checked. Q1 global no se redefine. |
| HTML | generarHTMLDesdeObjetos mantiene objetos; generarHTMLDesdeSecciones integra gate/runtime una vez. Prepared render compartido preview/publicación. |
| Preview | ModalVistaPrevia y buildPreviewFrameSrcDoc: desktop, mobile mockup, mobile-focused; iframe cleanup, gate nuevo en reapertura, audio sidebar detenido. |
| Motion / IO / timelines | Readiness existente espera loader y entry; reveal/zoom/draw/group/gallery/pulse/RSVP/hover/parallax diferidos. Countdown entrada/frame/tick también espera. |
| Smart Layout / scriptTemplate | DOMContentLoaded/load/fonts/reintentos siguen preparando geometría. No nueva autoridad de reflow ni reinstanciación del DOM. |
| Publicación e imagen social | Identidad root conservada; HTML resuelve recurso de catálogo; capture de share entra sin audio mediante el mismo lifecycle. |
| Assets / Rules | Catálogo estático de assets públicos Hosting; no permisos nuevos de Storage ni upload privado V1. Firestore bloquea cambios efectivos de Música por SDK. |
| Templates | Whitelists frontend/shared/backend actualizadas; usuarios comunes no heredan música activa al copiar una plantilla. |

## Evidencia ejecutada

Los números son por grupo/comando, con solapamientos; no deben sumarse como un total único.

| Verificación | Resultado |
| --- | --- |
| Build Functions final (`node functions/scripts/buildContracts.cjs`) | PASS; 68 copias verificadas. |
| Música/templates final (`musicSecurity`, `musicRenderIntegration`, `invitationMusicRuntime`, `shared/musicConfig`, `shared/templates/contract`) | 49/49 PASS, cero skips. |
| Runtime/render/publicación/motion | 117/117 PASS; la suite P0 final individual tiene 23 casos. |
| Editor, persistencia FIFO, snapshots, transporte, previews y autoría | 93 casos distintos PASS. |
| Regresiones parity/mobile/lifecycle/publish validation | 94 PASS, 5 capturas optativas omitidas por flags, cero fallas. |
| Aislamiento/configuración local | 12/12 PASS. |
| Next build/export con cleanEnvironment y networkGuard | PASS; 14 páginas. Aviso de caniuse-lite desactualizado. |
| Lint canónico Functions | 273 archivos, cero errores, 234 warnings; no se hizo un refactor general para eliminarlos. |
| Ownership Functions | Tres builds; 41 tests PASS; discovery CLI real de 102 default, 3 payments y 3 email, sin red remota. |
| Firestore/Storage Rules + callable real + countdown | 1487 assertions PASS, cero fallas/skips. Ver limitación del runner abajo. |
| Chromium con MP3 real local | Cinco superficies + dos iframes escalados; gate/P0/DOM/scroll, play-pause-resume, exclusión, cleanup y reapertura PASS. |
| Panel React con CSS compilado | 376px y 320px, ON/OFF: cuatro capturas sin overflow, controles ≥44px. |
| Revisión final | Sin hallazgos accionables P0/P1; diff whitespace y enlaces documentales comprobados. |

La primera ejecución de ownership detectó un hash incorrecto en la fila nueva del registro: `entryPoint` forma parte del manifest. Se inspeccionó la metadata y se corrigió exclusivamente esa fila; las ejecuciones posteriores verifican el endpoint exacto, sin modificar sus opciones ni debilitar el gate.

El runner de Rules devolvió código 3 por una confirmación de `taskkill` en Windows, después de aprobar sus 1487 assertions. La verificación posterior confirmó el PID propio terminado y todos los puertos libres. Se preservó el reporte original: `.local-isolation/reports/run-SQlW8O/result.json` y `cleanup-verification.json`. No se presenta el wrapper completo como exit 0.

## Reproducir

En el worktree, con dependencias/herramientas preparadas según [Development Workflow](../operations/DEVELOPMENT_WORKFLOW.md):

```powershell
node functions/scripts/buildContracts.cjs
node --test functions/musicSecurity.test.mjs functions/musicRenderIntegration.test.mjs functions/invitationMusicRuntime.test.mjs shared/musicConfig.test.mjs shared/templates/contract.test.mjs
node --require ./scripts/local/networkGuard.cjs scripts/checkMusicBrowser.mjs
npm --prefix functions run verify:ownership
npm run test:local:rules
```

En PowerShell, si se redirige stderr de Node, capturar explícitamente `$LASTEXITCODE`: los warnings nativos pueden hacer que el wrapper informe error aunque Node termine correctamente.

El script Chromium sirve únicamente el MP3 del repositorio por loopback, bloquea requests externas y usa un perfil sintético. Escribe JSON y PNGs en `.local-isolation/music-browser-*`. La última captura aprobada durante esta tarea está en `music-browser-1791240080157`. El fallo inicial del test de click sobre iframes escalados se corrigió en el cálculo de coordenadas del driver; el producto no necesitó cambiar por ese fallo.

Logs adicionales: `music-final-build.log`, `music-final-tests.log`, `music-parity-tests.log`, `music-functions-lint.log`, `music-ownership-confirmed.log`, `music-frontend-build/verification.log`, `music-panel-visual-report.json`, todos bajo `.local-isolation/`.

## Límites de la evidencia

No se verificaron dispositivos físicos ni Safari/iOS; Chromium con viewport mobile no prueba esas implementaciones. No se ejecutó el gate integrado completo `verify:local`; sí sus verificaciones relevantes de ownership, Rules, configuración y lint, además de las suites funcionales listadas. Cinco capturas optativas legacy permanecieron omitidas; la nueva prueba Chromium cubre Música y mockups reales, no reemplaza toda su matriz legacy.

No se inspeccionaron claims, Rules, recursos ni invitaciones de producción. La decisión de entrada es por documento, sin persistencia permanente. La canción incluida es el asset preexistente de prueba; carga/activación y límites sobre HTML ya publicado se documentan en [MUSIC_CATALOG](../operations/MUSIC_CATALOG.md).
