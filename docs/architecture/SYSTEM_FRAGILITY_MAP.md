# SYSTEM FRAGILITY MAP

## 1. Summary

This map reflects the current repository behavior on 2026-03-30.

Recent hardening materially reduced several runtime risks:

- editor bridge contracts are now explicit and partially test-frozen
- editor selection runtime now centralizes selection-critical runtime state behind one internal surface, with compatibility mirrors kept explicit
- autosave, direct section writes, and flush now share one FIFO ordering boundary
- preview vs publish parity is now characterized by named fixtures and mismatch codes
- payment-edge normalization and result-shaping logic no longer live entirely inline in `publicationPayments.ts`

Those changes narrowed risk. They did not make the system simple.

## 2. Mitigated Runtime Risks

| Area | Previous risk shape | Current level | What changed | Evidence |
| --- | --- | --- | --- | --- |
| Editor bridge contracts | Implicit globals and event names | Medium | `window.canvasEditor`, legacy global families, and flush events are now explicitly defined in `editorBridgeContracts` | `src/lib/editorBridgeContracts.js`, `src/lib/editorBridgeContracts.test.mjs` |
| Live editor read boundary | Preview/consumers reading mixed globals | Medium | `window.editorSnapshot` is now the canonical snapshot adapter, with legacy fallback kept explicit | `src/lib/editorSnapshotAdapter.js`, `src/lib/editorSnapshotAdapter.test.mjs` |
| Editor selection runtime boundary | React selection state, transient drag state, and selection globals could diverge | Medium | committed selection, marquee/preselection, pending drag selection, and drag visual selection now share one internal runtime snapshot; legacy mirrors remain explicit | `src/lib/editorSelectionRuntime.js`, `src/lib/editorSelectionRuntime.test.mjs`, `src/components/editor/canvasEditor/useCanvasEditorSelectionRuntime.js`, `src/components/editor/textSystem/render/konva/selectionVisualModes.js` |
| Persistence ordering | Autosave vs direct section writes vs flush could race | Medium | writes now join one FIFO coordinator | `src/components/editor/persistence/draftWriteCoordinator.js`, `src/components/editor/persistence/draftWriteCoordinator.test.mjs` |
| Critical flush transport | Flush behavior depended on caller conventions | Medium | draft event transport and template direct-bridge transport are explicit | `src/domain/drafts/criticalFlush.js`, `src/domain/drafts/criticalFlush.test.mjs`, `src/domain/drafts/flushGate.js` |
| Preview vs publish parity | Drift was real but poorly named | Medium | parity is now characterized by named mismatch codes and warning-only cases | `shared/previewPublishParity.mjs`, `shared/previewPublishParity.test.mjs`, `shared/previewPublishParityFixtures.mjs` |
| Payment edge normalization | Request parsing and retry result shaping were buried in orchestration | Medium-Low | edge helpers are extracted and test-backed | `functions/src/payments/publicationPaymentEdge.ts`, `functions/publicationPaymentEdge.test.mjs` |

## 3. Remaining Runtime Hotspots

| Area | Current level | Why it is still hot |
| --- | --- | --- |
| `src/components/CanvasEditor.jsx` and editor interaction runtime | Very High | selection runtime reduced ambiguity, but selection, multi-selection, drag, inline editing, resize, rotation, legacy globals, and external bridges still converge here |
| Selection visuals and transform lifecycle | High | visual mode rules are clearer, but drag overlay, transformer timing, bounds indicators, line controls, and restore-after-settle still span multiple components |
| `functions/src/utils/generarHTMLDesdeSecciones.ts` | High | shared preview/public runtime with many behavior branches and broad blast radius |
| `functions/src/utils/generarHTMLDesdeObjetos.ts` | High | object-level rendering still carries many family-specific and legacy branches |
| `functions/src/payments/publicationPayments.ts` | High | request-facing payment, checkout, lifecycle entry, and publish orchestration still converge here even after extractions |
| Distributed publication lifecycle | High | public state still spans draft metadata, active `publicadas`, history docs, slug reservations, and Storage artifacts |
| Asset readiness across stages | Medium | template copy, editor load, preview, and publish still resolve assets in different runtime contexts |
| `altoModo: pantalla`, `yNorm`, and `fullbleed` | Medium | these contracts are supported, but preview/publish parity still depends on warnings and special-case handling |
| Functional CTA contracts | Medium | visual object support is not enough; correctness still depends on root `rsvp` / `gifts` config and runtime HTML |

## 4. Maintainability Hotspots

These are not always the most failure-prone at runtime, but they remain expensive to reason about and easy to regress.

| Area | Current level | Maintainability concern |
| --- | --- | --- |
| `src/components/CanvasEditor.jsx` | Very High | large orchestration surface with many state domains and bridge side effects |
| `src/components/editor/textSystem/render/konva/CanvasStageContentComposer.jsx` + `SelectionTransformer.jsx` | High | selection visual mode decisions are centralized, but actual drag/transform lifecycle code and legacy fallbacks remain split across components |
| `functions/src/payments/publicationPayments.ts` | Very High | dense orchestration shell even after helper extraction |
| `functions/src/utils/generarHTMLDesdeSecciones.ts` | High | dense multi-feature generator with preview and publish responsibilities |
| `functions/src/utils/generarHTMLDesdeObjetos.ts` | High | many type branches, shape branches, and compatibility branches in one module |
| `functions/src/index.ts` | High | broad exported surface with mixed public-delivery and legacy responsibilities |
| Editor text/inline focus stack | Medium-High | behavior is better instrumented, but still spans runtime, overlay, metrics, debug, and bridge layers |

## 5. Solved or Narrowed Claims From Older Docs

These statements are no longer accurate enough:

- "editor bridge behavior is mostly implicit"
- "selection authority is only React state plus ad hoc globals"
- "preview/publish parity is vague"
- "autosave and direct section writes are independent persistence channels"
- "payment edge handling is only monolithic publish/payments logic"

Current reality:

- bridge keys, global families, and flush events are explicit
- selection runtime and selection visual mode helpers narrowed the selection read/write surface, but did not remove all interaction globals
- parity has named mismatch codes and warning-only fixtures
- persistence triggers are still different, but ordering is serialized
- payment-edge normalization is extracted, while orchestration risk remains in `publicationPayments.ts`

## 6. Current Risk Interpretation

Runtime risk is now concentrated in behavior-rich seams:

- editor interaction runtime
- HTML generation
- publish/payment orchestration
- distributed lifecycle state

Maintainability risk is now a separate category from pure runtime fragility:

- some seams are safer at runtime because contracts are explicit
- those same seams can still be expensive to extend because the code remains dense or highly branched

## 7. Practical Rules

- Treat bridge contracts, parity fixtures, and publish validation codes as active system boundaries, not just test helpers.
- When a risk is now "mitigated", that means the contract is narrower or more observable, not that the area is low-risk.
- For preview/publish issues, check parity fixtures and publish validation before blaming the editor canvas.
- For persistence issues, verify FIFO ordering, direct section writes, and critical flush behavior together.
