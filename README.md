# Reserva el Dia

Reserva el Dia is a digital invitation platform built around a Next.js dashboard, a React + Konva invitation editor, Firebase Hosting, Firestore, Firebase Storage, and Cloud Functions.

The current product flow is draft-first:

- invitations are authored as draft render state in `borradores`
- dashboard preview re-reads persisted state and generates HTML through the backend generator path
- publication writes a stored HTML artifact plus publication metadata used by the public route

## Documentation

Agents and collaborators: start with [AGENTS.md](AGENTS.md) for authorization,
the working procedure, Definition of Done, and delivery evidence. This entry
works independently of the Prompt Builder.

Current canonical documentation lives under `docs/`; use the
[Documentation Index](docs/DOCUMENTATION_INDEX.md) to select relevant contracts
and the [Architecture Overview](docs/architecture/ARCHITECTURE_OVERVIEW.md) for
initial product and implementation orientation.

Recommended starting points:

- `docs/DOCUMENTATION_INDEX.md`
- `docs/architecture/ARCHITECTURE_OVERVIEW.md`
- `docs/architecture/EDITOR_SYSTEM.md`
- `docs/architecture/INTERACTION_SYSTEM_CURRENT_STATE.md`
- `docs/architecture/PREVIEW_SYSTEM_ANALYSIS.md`
- `docs/contracts/RENDER_COMPATIBILITY_MATRIX.md`
- `docs/testing/EDITOR_REGRESSION_CHECKLIST.md`

## Notes

- For isolated local development and verification, follow [Development Workflow](docs/operations/DEVELOPMENT_WORKFLOW.md). The normal development commands now start a credential-free demo session with all four Firebase emulators; the runbook owns prerequisites, commands, fixtures and limitations.

- The repo still contains legacy paths and compatibility branches. Documentation distinguishes normative contracts, accepted decisions, implementation maps, and historical evidence.
- Code demonstrates current behavior; valid contracts and accepted decisions define expected behavior. Resolve discrepancies through the [index authority rules](docs/DOCUMENTATION_INDEX.md#authority-and-conflicts), rather than automatically changing docs or tests to match code.
- Checked-in Rules and specialized operational scripts retain open risks; consult the [current risk register](docs/architecture/SYSTEM_FRAGILITY_MAP.md#operational-readiness). The demo environment does not certify permissions or administrative role policy.
