# Reserva el Dia

Reserva el Dia is a digital invitation platform built around a Next.js dashboard, a React + Konva invitation editor, Firebase Hosting, Firestore, Firebase Storage, and Cloud Functions.

The current product flow is draft-first:

- invitations are authored as draft render state in `borradores`
- dashboard preview re-reads persisted state and generates HTML through the backend generator path
- publication writes a stored HTML artifact plus publication metadata used by the public route

## Documentation

Current canonical documentation lives under `docs/`.

Recommended starting points:

- `docs/architecture/ARCHITECTURE_OVERVIEW.md`
- `docs/architecture/EDITOR_SYSTEM.md`
- `docs/architecture/INTERACTION_SYSTEM_CURRENT_STATE.md`
- `docs/architecture/PREVIEW_SYSTEM_ANALYSIS.md`
- `docs/contracts/RENDER_COMPATIBILITY_MATRIX.md`
- `docs/testing/EDITOR_REGRESSION_CHECKLIST.md`

## Notes

- The repo still contains legacy paths and compatibility branches. The documentation above is current-state documentation, not a target-state design set.
- When architecture docs and code disagree, the code is the source of truth.
