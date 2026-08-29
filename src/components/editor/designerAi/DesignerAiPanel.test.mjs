import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panelSource = readFileSync(new URL("./DesignerAiPanel.jsx", import.meta.url), "utf8");
const sidebarSource = readFileSync(new URL("../../DashboardSidebar.jsx", import.meta.url), "utf8");
const layoutSource = readFileSync(new URL("../../DashboardLayout.jsx", import.meta.url), "utf8");
const historySource = readFileSync(new URL("../../../domain/editor/designerAiMessageHistory.js", import.meta.url), "utf8");

test("starts a ledger-driven conversation internally and keeps the seed out of the visible chat", () => {
  assert.match(panelSource, /const AUTO_START_MESSAGE = .*primer bloque.*pendiente/);
  assert.doesNotMatch(panelSource, /primera capacidad disponible/);
  assert.doesNotMatch(panelSource, /aunque ya esté completa/);
  assert.match(
    panelSource,
    /submitMessageRef\.current\?\.\(AUTO_START_MESSAGE, \{[\s\S]*entryMode: entry\.entryMode,[\s\S]*snapshotOverride: initialSnapshot/
  );
  assert.match(panelSource, /showUserMessage\s*\? appendDesignerAiMessageHistory/);
});

test("keeps up to 30 messages in the draft-scoped sidebar while preserving the six-turn callable contract", () => {
  assert.match(historySource, /DESIGNER_AI_IN_MEMORY_MESSAGE_LIMIT = 30/);
  assert.match(historySource, /DESIGNER_AI_CALLABLE_RECENT_TURN_LIMIT = 6/);
  assert.match(panelSource, /messageHistory = \[\]/);
  assert.match(panelSource, /normalizeDesignerAiMessageHistory\(messageHistory\)/);
  assert.match(panelSource, /selectDesignerAiRecentTurns\(conversationWithUser\)/);
  assert.match(sidebarSource, /const \[designerAiMessageHistory, setDesignerAiMessageHistory\] = useState\(\[\]\)/);
  assert.match(sidebarSource, /messageHistory=\{designerAiMessageHistory\}/);
  assert.match(sidebarSource, /onMessageHistoryChange=\{setDesignerAiMessageHistory\}/);
  assert.match(layoutSource, /const sidebarInstanceKey = slugInvitacion[\s\S]*`editor-sidebar:\$\{slugInvitacion\}`/);
  assert.match(layoutSource, /<DashboardSidebar\s+key=\{sidebarInstanceKey\}/);
});

test("restores same-draft history without restarting and invalidates late work on panel cleanup", () => {
  assert.match(panelSource, /if \(messagesRef\.current\.length > 0\) \{[\s\S]*autoStartedSessionRef\.current = sessionKeyRef\.current;[\s\S]*return true;/);
  assert.doesNotMatch(panelSource, /messagesRef\.current = \[\]/);
  assert.doesNotMatch(panelSource, /setMessages\(\[\]\)/);
  assert.match(panelSource, /if \(sessionKeyRef\.current === sessionKey\) \{[\s\S]*sessionKeyRef\.current = "";[\s\S]*requestSequenceRef\.current \+= 1;/);
});

test("reconciles every batch and completes trusted controls only after a real draft change", () => {
  assert.match(panelSource, /reconcileDesignerAiConversationState/);
  assert.match(panelSource, /baselineFingerprints/);
  assert.match(panelSource, /leafFingerprint\(snapshot, leafId\) !==/);
  assert.match(panelSource, /buildControlContinueMessage/);
  assert.doesNotMatch(panelSource, /coveredCapabilityIds/);
});

test("keeps Gallery changes non-terminal until the user explicitly finishes the current Gallery", () => {
  assert.match(panelSource, /buildDesignerAiGalleryCompletionLeafId\(request\.galleryId\)/);
  assert.match(panelSource, /controlState\.request\?\.type === "gallery_cell_upload"\) return false/);
  assert.match(panelSource, /baselineGalleryFingerprint/);
  assert.match(panelSource, /galleryHasChanges/);
  assert.match(panelSource, /galleries\.findIndex\(\(gallery\) => gallery\?\.id === request\.galleryId\)/);
  assert.match(panelSource, /Galería \{controlState\.galleryIndex \+ 1\} de \{controlState\.galleryCount\}/);
  assert.match(panelSource, /"Terminé con esta galería"/);
  assert.match(panelSource, /onGalleryComplete=\{finishActiveGallery\}/);
  assert.match(panelSource, /onClick=\{onClose\}[\s\S]{0,120}disabled=\{controlState\.finishing === true\}/);
  assert.match(panelSource, /controlLeafIds: \[completionLeafId\]/);
  assert.match(panelSource, /onPersisted: \(\) =>/);
  assert.match(panelSource, /verifiedLeaf\?\.status !== DESIGNER_AI_LEDGER_STATUSES\.RESOLVED_BY_CONTROL/);
});

test("Gallery cancellation returns to chat without recording completion and keeps unrelated controls out", () => {
  const closeStart = panelSource.indexOf("const closeTrustedControl");
  const closeEnd = panelSource.indexOf("\n\n  const handleSubmit", closeStart);
  const closeSource = panelSource.slice(closeStart, closeEnd);
  assert.doesNotMatch(closeSource, /reconcileDesignerAiConversationState/);
  assert.doesNotMatch(closeSource, /controlLeafIds/);
  assert.match(panelSource, /<MiniToolbarTabImagen/);
  assert.doesNotMatch(panelSource, /<MiniToolbarTabRegalos/);
  assert.doesNotMatch(panelSource, /<MiniToolbarTabDetallesEvento/);
});

test("replaces the chat area with the active trusted control and restores the composer on close", () => {
  assert.match(panelSource, /import DesignerAiLocationControl/);
  assert.doesNotMatch(panelSource, /import MiniToolbarTabDetallesEvento/);
  assert.match(panelSource, /\{activeControl \? \([\s\S]*<DesignerAiTrustedControl[\s\S]*\) : \([\s\S]*role="log"[\s\S]*<form onSubmit=/);
  assert.doesNotMatch(panelSource, /if \(activeControl\) \{[\s\S]*return \(/);
  assert.match(panelSource, /restoreChatFocusRef\.current = true;[\s\S]*setActiveControl\(null\)/);
  assert.match(panelSource, /messageComposerRef\.current\?\.focus\?\.\(\)/);
});

test("fills the available Designer AI tab height for either chat or a trusted control", () => {
  assert.match(panelSource, /className="flex h-full max-h-full min-h-0 w-full flex-1 flex-col overflow-hidden[^"]*p-0[^"]*transition-none/);
  assert.match(panelSource, /className="flex min-h-0 flex-1 basis-0[^"]*overflow-y-auto[^"]*overscroll-contain/);
  assert.match(panelSource, /className="flex min-h-0 flex-1 flex-col overflow-hidden bg-\[#FBF7F9\] p-3"/);
  assert.match(panelSource, /className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-\[#FBF7F9\] p-3/);
  assert.match(panelSource, /<form[^>]*className="shrink-0 border-t/);
  assert.match(sidebarSource, /botonActivo === "designer-ai"[\s\S]{0,120}\? "gap-0 px-0 pb-0 pt-0"/);
  assert.match(sidebarSource, /height: designerAiActive \? "100%" : "auto"/);
  assert.match(sidebarSource, /overflowY: shouldShowAssistantControls \|\| designerAiActive \? "hidden" : "auto"/);
});

test("isolates the chat from legacy landing styles and respects reduced motion", () => {
  assert.match(panelSource, /\[&_h2\]:\[text-shadow:none\]/);
  assert.match(panelSource, /\[&_p\]:\[text-shadow:none\]/);
  assert.match(panelSource, /\[&_section\]:transition-none/);
  assert.match(panelSource, /matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(panelSource, /behavior: prefersReducedMotion \? "auto" : "smooth"/);
});

test("uses the documented minimal visual tokens without changing chat controls", () => {
  assert.match(panelSource, /bg-\[#FBF7F9\]/);
  assert.match(panelSource, /bg-\[#692B9A\]/);
  assert.match(panelSource, /focus-visible:ring-\[#EFDBFF\]/);
  assert.match(panelSource, /font-\['DM_Sans',sans-serif\]/);
  assert.match(panelSource, /font-\['Source_Sans_3',sans-serif\]/);
  assert.match(panelSource, /min-h-11 min-w-11/);
  assert.match(panelSource, /disabled=\{sending \|\| Boolean\(activeControl\)\}/);
});

test("offers an explicit Maps decision, preserves preload and keeps cancellation non-terminal", () => {
  assert.match(panelSource, />\s*Buscar en Google Maps\s*</);
  assert.match(panelSource, /decision\.address \? "Usar estos datos" : "Ingresar dirección manual"/);
  assert.match(panelSource, /initialQuery=\{controlState\.initialQuery\}/);
  assert.match(panelSource, /buildDesignerAiLocationSearchQuery\(location\) \|\| controlState\.initialQuery/);
  assert.match(panelSource, /cancelled: true/);
  assert.doesNotMatch(panelSource, /closeTrustedControl[\s\S]{0,800}controlLeafIds/);
});

test("records the manual Maps decision directly in the ledger without a synthetic model command", () => {
  assert.match(panelSource, /buildDesignerAiManualLocationResolution\(decision\)/);
  assert.match(panelSource, /validateDesignerAiResolutionUpdates\(\[resolution\], snapshot\)/);
  assert.match(panelSource, /resolutions: \[resolution\]/);
  assert.match(panelSource, /onUseManual=\{useManualLocation\}/);
  assert.doesNotMatch(panelSource, /submitMessage\(buildDesignerAiManualLocationReply/);
});

test("keeps verified changes and offers a guided continuation retry when copy generation fails", () => {
  assert.match(panelSource, /verifiedContinuation: true/);
  assert.match(panelSource, /VERIFIED_CONTINUATION_FALLBACK/);
  assert.match(panelSource, /canRetryContinuation: verifiedContinuation/);
  assert.match(panelSource, />\s*Continuar recorrido\s*</);
  assert.match(panelSource, /No emitas resolutions para ellas ni reinterpretés su evidencia/);
});

test("verifies the exact selected Google place through the canonical authoring owner", () => {
  assert.match(panelSource, /readEventLocationAuthoringState\(window, feature\)/);
  assert.match(panelSource, /isDesignerAiGooglePlaceControlReflected\(\{[\s\S]*snapshot,[\s\S]*persistedLocation,[\s\S]*phase: request\.phase,[\s\S]*expectedLocation/);
  assert.match(panelSource, /onSelectionApplied=\{\(expectedLocation\) => completeActiveControlIfReflected/);
  assert.match(panelSource, /snapshotOverride: verifiedSnapshot/);
  assert.match(panelSource, /hojas ya quedaron terminales mediante una decisión o un control local verificado/);
  assert.match(panelSource, /No generalices la evidencia a otras fases ni avances a un bloque posterior/);
});

test("waits for hydrated draft data and closes only from guided-flow completeness", () => {
  assert.match(panelSource, /documentState\.hydrated !== true/);
  assert.match(panelSource, /finalSnapshot\.ledger\.guidedFlow\.completion\.complete/);
  assert.match(panelSource, /Terminamos el recorrido principal/);
  assert.match(panelSource, /Vista previa, en la esquina superior derecha/);
  assert.doesNotMatch(panelSource, /Listo, ya tenemos todo/);
});

test("persists the explicit usage marker before auto-start and forwards the exact Gallery slot", () => {
  assert.match(panelSource, /prepareDesignerAiConversationEntry/);
  assert.match(panelSource, /previousState: entry\.persistedState/);
  assert.match(panelSource, /onPersisted: \(\) => \{[\s\S]*AUTO_START_MESSAGE/);
  assert.match(panelSource, /onPersistenceError: \(\) =>/);
  assert.match(panelSource, /cellId: request\.cellId \|\| ""/);
  assert.match(panelSource, /cellIndex: request\.cellIndex/);
});

test("renders a conversation-only surface without technical application notices", () => {
  assert.doesNotMatch(panelSource, />Recorrer Todo Asistente</);
  assert.doesNotMatch(panelSource, />Edita solo las capacidades disponibles en Asistente\.</);
  assert.doesNotMatch(panelSource, /message\.status/);
  assert.doesNotMatch(panelSource, /Aplicado:/);
  assert.doesNotMatch(panelSource, /No fue necesario modificar el borrador\./);
});

test("shows safe server diagnostics and a traceable reference for chat errors", () => {
  assert.match(panelSource, /details\.summary/);
  assert.match(panelSource, /details\.referenceId/);
  assert.match(panelSource, /Causa:/);
  assert.match(panelSource, /Referencia:/);
  assert.doesNotMatch(panelSource, /error\?\.stack/);
});

test("does not join Designer AI to the Assistant Guided Tour", () => {
  assert.doesNotMatch(panelSource, /data-assistant-tour-/);
});
