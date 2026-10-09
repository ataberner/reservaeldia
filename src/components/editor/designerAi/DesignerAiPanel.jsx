import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, MapPin, Send, Sparkles, X } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import MiniToolbarTabImagen from "@/components/MiniToolbarTabImagen";
import DesignerAiLocationControl from "@/components/editor/designerAi/DesignerAiLocationControl";
import DesignerAiGiftConfirmation from "@/components/editor/designerAi/DesignerAiGiftConfirmation";
import { createDesignerAiGiftProposal, approveDesignerAiGiftProposal, discardDesignerAiGiftProposal, isDesignerAiGiftProposalCurrent } from "@/domain/editor/designerAiGiftApproval";
import { readEditorRenderSnapshot } from "@/lib/editorSnapshotAdapter";
import {
  DESIGNER_AI_ACTION_ORIGINS,
  DESIGNER_AI_AUTO_START_MESSAGE,
  DESIGNER_AI_CONTRACT_VERSION,
  discardRedundantDesignerAiControlResolutions,
  validateDesignerAiActionBatch,
  validateDesignerAiControlRequest,
  validateDesignerAiResolutionUpdates,
} from "../../../../shared/designerAiCapabilityContract.js";
import {
  DESIGNER_AI_LEDGER_STATUSES,
  buildDesignerAiGalleryCompletionLeafId,
  buildDesignerAiConversationBrief,
  fingerprintDesignerAiValue,
  normalizeDesignerAiConversationState,
  prepareDesignerAiConversationEntry,
  reconcileDesignerAiConversationState,
} from "../../../../shared/designerAiConversationLedger.js";
import {
  buildDesignerAiCallablePayload,
  readDesignerAiCapabilitySnapshot,
} from "@/domain/editor/designerAiCapabilities";
import {
  appendDesignerAiMessageHistory,
  normalizeDesignerAiMessageHistory,
  selectDesignerAiRecentTurns,
} from "@/domain/editor/designerAiMessageHistory";
import { executeDesignerAiActionBatch } from "@/domain/editor/designerAiActionExecutor";
import { confirmDesignerAiPersistence } from "@/domain/editor/designerAiActionEvidence";
import { buildDesignerAiExecutionFeedback, buildDesignerAiExecutionProgress, withDesignerAiExecutionFeedback } from "@/domain/editor/designerAiExecutionFeedback";
import { buildDesignerAiCompletionMessage, buildDesignerAiGuidedQuestion, buildDesignerAiLocalContinuation, buildDesignerAiScopeNotice, resolveDesignerAiEntryGreeting, withDesignerAiGuidedContinuation, resolveDesignerAiGalleryHelp, resolveDesignerAiCoverHelp, DESIGNER_AI_COVER_HELP_QUESTION, DESIGNER_AI_COVER_HELP_LATER, DESIGNER_AI_GALLERY_HELP_QUESTION, DESIGNER_AI_GALLERY_HELP_LATER } from "@/domain/editor/designerAiGuidedConversation";
import useEditorDocumentOperation from "@/hooks/useEditorDocumentOperation";
import { createDesignerAiTurnTiming } from "@/domain/editor/designerAiTiming";
import {
  buildDesignerAiGooglePlaceControlState,
  buildDesignerAiLocationSearchQuery,
  buildDesignerAiManualLocationReply,
  buildDesignerAiManualLocationResolution,
  getDesignerAiLocationPhaseLabel,
  getDesignerAiGooglePlaceVerifiedLeafIds,
  resolveDesignerAiLocationDecisions,
} from "@/domain/editor/designerAiLocationInteraction";
import { EVENT_DETAIL_FEATURES } from "@/domain/eventDetails/features";
import { readEventLocationAuthoringState } from "@/domain/eventDetails/locationAuthoring";
import {
  readDashboardDocumentNameState,
  persistDashboardDocumentUpdate,
} from "@/lib/dashboardDocumentNameBridge";

const AUTO_START_MESSAGE = DESIGNER_AI_AUTO_START_MESSAGE;

function buildControlContinueMessage(completedLeafIds, snapshot) {
  if (snapshot.conversation?.mode === "editing") {
    return "El control local ya verificó el cambio. Confirmalo brevemente y seguí disponible para editar; no reinicies el recorrido ni repitas su cierre.";
  }
  const nextBlock = buildDesignerAiConversationBrief(snapshot).nextBlock;
  const verifiedLeafIds = Array.isArray(completedLeafIds) ? completedLeafIds : [];
  return `Estas hojas ya quedaron terminales mediante una decisión o un control local verificado: ${JSON.stringify(verifiedLeafIds)}. No emitas resolutions para ellas ni reinterpretés su evidencia. Releé el borrador y redactá la continuación natural desde este primer bloque pendiente real: ${JSON.stringify(nextBlock)}. No generalices la evidencia a otras fases ni avances a un bloque posterior.`;
}

const VERIFIED_CONTINUATION_FALLBACK = "El cambio quedó reflejado en el borrador, pero no pude preparar el próximo paso. Podés retomar el recorrido desde el estado actual.";

function createMessage(role, content, extra = {}) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content: String(content || "").trim(),
    ...extra,
  };
}

// Presentation evidence lives only with the in-memory message. The fresh ledger
// still selects the next step; this merely lets reentry retain a valid, more
// specific clarification (such as a missing year) without replaying its turn.
function guidedPresentationEvidence(snapshot, clarification = null) {
  if (snapshot.conversation?.mode === "editing") return {};
  const step = buildDesignerAiConversationBrief(snapshot).nextStep;
  if (!step || (clarification?.leafId && !step.leafIds.includes(clarification.leafId))) return {};
  const leaves = step.leafIds.map(id => snapshot.ledger.leaves.find(leaf => leaf.id === id))
    .map(leaf => leaf && { id: leaf.id, fingerprint: leaf.fingerprint, status: leaf.status });
  return { guidedStepFingerprint: fingerprintDesignerAiValue({ step, leaves,
    question: buildDesignerAiGuidedQuestion(snapshot) }) };
}

function normalizeCallableError(error) {
  const code = String(error?.code || "");
  const details = error?.details && typeof error.details === "object" ? error.details : {};
  if (/appcheck|unauthenticated/i.test(code)) {
    return "No pude verificar tu sesión. Recargá la página y volvé a iniciar sesión si hace falta. Tu mensaje sigue disponible.";
  }
  // Admission summaries are fixed, safe server presentations. Use them directly
  // so a daily stop never suggests an immediate retry and replay never promises
  // that nothing happened. Raw Firebase/provider error.message is never shown.
  if (details.category === "assistant_admission" && typeof details.summary === "string" && details.summary.trim()) {
    const reference = String(details.referenceId || "").trim().slice(0, 80);
    return `${details.summary.trim().slice(0, 240)}${reference ? ` Referencia: ${reference}` : ""}`;
  }
  if (code.includes("recovery-conflict") || code.includes("evidence-conflict")) {
    return "El estado cambió y no puedo reanudar ese lote con seguridad. Enviá una nueva solicitud para interpretar los datos actuales.";
  }
  const baseMessage = code.includes("permission-denied")
    ? "Tu sesión ya no tiene permiso para usar esta experiencia."
    : code.includes("already-exists")
      ? "Esta solicitud ya fue recibida. Revisá tu invitación antes de enviar otra."
    : code.includes("resource-exhausted")
      ? "No pude responder por el momento. Probá de nuevo en unos minutos."
      : code.includes("deadline-exceeded")
        ? "La respuesta tardó demasiado y no se aplicaron cambios."
        : code.includes("failed-precondition")
          ? "Tu asistente todavía no está disponible en este entorno."
          : code.includes("invalid-argument")
            ? "No pude interpretar ese mensaje. Probá contándolo de otra manera."
           : code.includes("stale-snapshot")
              ? "La invitación cambió mientras respondía. Enviá el mensaje otra vez para tomar los datos actuales."
              : code.includes("evidence-missing")
                ? "El cambio se envió al editor, pero todavía no pude verificarlo en el borrador. Probá nuevamente."
                : "No pude procesar el mensaje. Probá nuevamente en unos instantes.";
  const summary = String(details.summary || "").trim().slice(0, 240);
  const referenceId = String(details.referenceId || "").trim().slice(0, 80);
  const diagnosticParts = [
    summary ? `Causa: ${summary}` : "",
    referenceId ? `Referencia: ${referenceId}` : "",
  ].filter(Boolean);
  return diagnosticParts.length > 0
    ? `${baseMessage} ${diagnosticParts.join(" ")}`
    : baseMessage;
}

function isValidCallableResponse(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    value.contractVersion === DESIGNER_AI_CONTRACT_VERSION &&
    typeof value.batchId === "string" &&
    ["apply", "clarify", "out_of_scope"].includes(value.intent) &&
    typeof value.assistantMessage === "string" &&
    Array.isArray(value.actions) &&
    Array.isArray(value.resolutions)
  );
}

function resolveControlLeafIds(request) {
  if (request?.type === "cover_upload") return ["media.cover"];
  if (request?.type === "google_place_picker") {
    return [`event.${request.phase}.place_selection`];
  }
  if (request?.type === "gallery_cell_upload") {
    const completionLeafId = buildDesignerAiGalleryCompletionLeafId(request.galleryId);
    return completionLeafId ? [completionLeafId] : [];
  }
  return [];
}

function leafFingerprint(snapshot, leafId) {
  return snapshot?.ledger?.leaves?.find((leaf) => leaf.id === leafId)?.fingerprint || "";
}

function galleryEditFingerprint(snapshot, galleryId) {
  const normalizedGalleryId = String(galleryId || "").trim();
  const gallery = snapshot?.values?.galleries?.find(
    (candidate) => String(candidate?.id || "").trim() === normalizedGalleryId
  );
  return gallery
    ? fingerprintDesignerAiValue({ galleryId: normalizedGalleryId, slots: gallery.slots || [] })
    : "";
}

function buildTrustedControlState(request, snapshot, extra = {}) {
  const leafIds = resolveControlLeafIds(request);
  const phaseValues = request?.type === "google_place_picker"
    ? snapshot?.values?.[request.phase]
    : null;
  const galleries = Array.isArray(snapshot?.values?.galleries)
    ? snapshot.values.galleries.filter((gallery) => Array.isArray(gallery?.slots) && gallery.slots.length > 0)
    : [];
  const galleryIndex = request?.type === "gallery_cell_upload"
    ? galleries.findIndex((gallery) => gallery?.id === request.galleryId)
    : -1;
  return {
    request,
    leafIds,
    baselineFingerprints: Object.fromEntries(
      leafIds.map((leafId) => [leafId, leafFingerprint(snapshot, leafId)])
    ),
    initialQuery: request?.type === "google_place_picker"
      ? buildDesignerAiLocationSearchQuery(phaseValues)
      : "",
    eventMode: snapshot?.values?.eventMode === "ceremony_party"
      ? "ceremony_party"
      : "single",
    baselineGalleryFingerprint: request?.type === "gallery_cell_upload"
      ? galleryEditFingerprint(snapshot, request.galleryId)
      : "",
    galleryHasChanges: false,
    galleryIndex,
    galleryCount: galleries.length,
    finishing: false,
    ...extra,
  };
}

function waitOneEditorFrame(registry) {
  return new Promise((resolve) => {
    const entry = { kind: "timeout", id: null, resolve };
    const complete = () => {
      registry.delete(entry);
      resolve();
    };
    if (typeof window.requestAnimationFrame === "function") {
      entry.kind = "raf";
      entry.id = window.requestAnimationFrame(complete);
    } else {
      entry.id = window.setTimeout(complete, 0);
    }
    registry.add(entry);
  });
}

function cancelPendingEditorFrames(registry) {
  for (const entry of registry) {
    if (entry.kind === "raf" && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(entry.id);
    } else {
      window.clearTimeout(entry.id);
    }
    entry.resolve();
  }
  registry.clear();
}

function DesignerAiLocationDecision({ decision, onSearch, onUseManual }) {
  return (
    <section className="w-full min-w-0 rounded-2xl border border-[#EFDBFF] bg-white p-3 text-left transition-none" aria-label={`Decidir ubicación de ${decision.label}`}>
      {decision.cancelled ? (
        <p className="mb-2 text-[13px] leading-5 text-[#575153]">
          No se seleccionó un resultado de Google Maps. Podés volver a buscar o continuar con los datos escritos.
        </p>
      ) : null}
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => onSearch(decision)}
          className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-[#692B9A] px-3 py-2 font-['DM_Sans',sans-serif] text-xs font-medium text-white transition-colors hover:bg-[#57227f] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EFDBFF]"
        >
          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
          Buscar en Google Maps
        </button>
        <button
          type="button"
          onClick={() => onUseManual(decision)}
          className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-xl border border-[#d9c0ec] bg-white px-3 py-2 font-['DM_Sans',sans-serif] text-xs font-medium text-[#692B9A] transition-colors hover:bg-[#FAF5FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EFDBFF]"
        >
          {decision.address ? "Usar estos datos" : "Ingresar dirección manual"}
        </button>
      </div>
    </section>
  );
}

function DesignerAiTrustedControl({
  controlState,
  onClose,
  onSelectionApplied,
  onGalleryComplete,
  imageProps,
}) {
  const request = controlState?.request;
  if (!request) return null;
  if (request.type === "google_place_picker") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#FBF7F9] p-3">
        <DesignerAiLocationControl
          phase={request.phase}
          eventMode={controlState.eventMode}
          initialQuery={controlState.initialQuery}
          onCancel={onClose}
          onSelectionApplied={onSelectionApplied}
        />
      </div>
    );
  }
  return (
    <section className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-[#FBF7F9] p-3 text-left transition-none" aria-label="Selección para la invitación">
      <div className="mb-2 flex min-w-0 shrink-0 items-center justify-between gap-2">
        {request.type === "gallery_cell_upload" && controlState.galleryIndex >= 0 ? (
          <p className="min-w-0 truncate text-xs font-medium text-[#692B9A]">
            Galería {controlState.galleryIndex + 1} de {controlState.galleryCount}
          </p>
        ) : <span />}
        <button
          type="button"
          onClick={onClose}
          disabled={controlState.finishing === true}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-[#d9c0ec] bg-white px-2.5 py-1.5 text-xs font-medium text-[#692B9A] transition-colors hover:bg-[#FAF5FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EFDBFF] disabled:cursor-wait disabled:text-[#9a879f]"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Volver al chat
        </button>
      </div>
      <div inert={controlState.finishing === true ? true : undefined} aria-busy={controlState.finishing === true} className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[#eee9ec] bg-white p-2">
        <MiniToolbarTabImagen
            key={`${request.type}:${request.galleryId || "cover"}:${controlState.finishing === true}`}
            {...imageProps}
            simplifiedForAssistant
            assistantSubstep={
              request.type === "cover_upload"
                ? { id: "designer-cover", scope: "cover" }
                : {
                    id: `designer-gallery-${request.galleryId}-${request.cellId || request.cellIndex}`,
                    scope: "gallery",
                    galleryId: request.galleryId,
                    cellId: request.cellId || "",
                    cellIndex: request.cellIndex,
                  }
            }
            canCreateGallery={false}
          />
      </div>
      {request.type === "gallery_cell_upload" ? (
        <div className="mt-2 flex shrink-0 flex-col gap-2 border-t border-[#eee9ec] pt-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-[#625d60]" aria-live="polite">
            {controlState.galleryHasChanges
              ? "Los cambios están visibles. Confirmaremos el guardado al terminar."
              : "Podés conservar las fotos actuales o hacer los cambios que quieras."}
          </p>
          <button
            type="button"
            onClick={onGalleryComplete}
            disabled={controlState.finishing === true}
            className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl bg-[#692B9A] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#57227f] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EFDBFF] disabled:cursor-wait disabled:bg-[#a990b7] sm:w-auto"
          >
            {controlState.finishing === true ? "Guardando…" : "Terminé con esta galería"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default function DesignerAiPanel({
  onPreview,
  journeyRef: sidebarJourneyRef,
  sessionKey,
  contentVersion = 0,
  messageHistory = [],
  onMessageHistoryChange = null,
  abrirSelector,
  imagenes,
  imagenesEnProceso,
  cargarImagenes,
  borrarImagen,
  hayMas,
  cargando,
  seccionActivaId,
  setMostrarGaleria,
  setImagenesSeleccionadas,
}) {
  const messages = useMemo(
    () => normalizeDesignerAiMessageHistory(messageHistory),
    [messageHistory]
  );
  const [draftMessage, setDraftMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationReady, setConversationReady] = useState(false);
  const [executionPhase, setExecutionPhase] = useState(buildDesignerAiExecutionProgress());
  const [activeControl, setActiveControl] = useState(null);
  const [giftProposal, setGiftProposal] = useState(null);
  const pendingGiftRef = useRef(null);
  const [locationDecisions, setLocationDecisions] = useState([]);
  const [liveMessage, setLiveMessage] = useState("");
  const sessionKeyRef = useRef(sessionKey);
  const messagesRef = useRef(messages);
  const sendingRef = useRef(false);
  const turnTimingRef = useRef(null);
  const submitMessageRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messageComposerRef = useRef(null);
  const restoreChatFocusRef = useRef(false);
  const appliedBatchIdsRef = useRef(new Set());
  const recoveryRef = useRef(null);
  const requestRetryRef = useRef(null);
  const requestSequenceRef = useRef(0);
  const conversationStateRef = useRef(normalizeDesignerAiConversationState(null));
  const localJourneyRef = useRef({ initialized: false, editing: false });
  const journeyRef = sidebarJourneyRef || localJourneyRef;
  const activeControlRef = useRef(null);
  const controlVerificationRef = useRef(false);
  const pendingFramesRef = useRef(new Set());
  const autoStartedSessionRef = useRef("");
  const callable = useMemo(() => httpsCallable(functions, "designerAiChat"), []);

  messagesRef.current = messages;

  const setMessages = useCallback((nextMessagesOrUpdater) => {
    if (typeof onMessageHistoryChange !== "function") return;
    onMessageHistoryChange((current) => {
      const safeCurrent = Array.isArray(current) ? current : [];
      const nextMessages = typeof nextMessagesOrUpdater === "function"
        ? nextMessagesOrUpdater(safeCurrent)
        : nextMessagesOrUpdater;
      const boundedMessages = normalizeDesignerAiMessageHistory(nextMessages);
      messagesRef.current = boundedMessages;
      return boundedMessages;
    });
  }, [onMessageHistoryChange]);

  const readSnapshot = useCallback(() => {
    const snapshot = readDesignerAiCapabilitySnapshot(window, {
      conversationState: conversationStateRef.current,
    });
    if (journeyRef.current.editing) snapshot.conversation.mode = "editing";
    return snapshot;
  }, [journeyRef]);
  const beginOperation = useEditorDocumentOperation();

  const settleGiftProposal = useCallback((confirmed = false, invalidated = false, displayedProposal = null) => {
    const pending = pendingGiftRef.current;
    if (!pending || (displayedProposal && pending.proposal !== displayedProposal)) return;
    pendingGiftRef.current = null;
    setGiftProposal(null);
    let approval = null;
    let error = null;
    try {
      if (invalidated || (confirmed && readSnapshot().revision !== pending.revision)) {
        throw Object.assign(new Error("La invitación cambió."), { code: "designer-ai/stale-snapshot", details: { retryable: false } });
      }
      if (confirmed) approval = approveDesignerAiGiftProposal(pending.proposal, pending.readContext());
    } catch (failure) { error = failure; }
    discardDesignerAiGiftProposal(pending.proposal);
    sendingRef.current = true;
    setSending(true);
    pending.resolve({ approval, error, cancelled: !confirmed && !error });
    messageComposerRef.current?.focus?.();
  }, [readSnapshot]);

  useEffect(() => {
    if (!giftProposal) return;
    const check = () => {
      const pending = pendingGiftRef.current;
      if (pending && (readSnapshot().revision !== pending.revision ||
          !isDesignerAiGiftProposalCurrent(pending.proposal, pending.readContext()))) settleGiftProposal(false, true);
    };
    check();
    const timer = window.setInterval(check, 250);
    return () => window.clearInterval(timer);
  }, [giftProposal, contentVersion, readSnapshot, settleGiftProposal]);

  const publishGuidedCompletion = useCallback((snapshot) => {
    if (journeyRef.current.editing || !snapshot.ledger.guidedFlow.completion.complete) return false;
    journeyRef.current.editing = true;
    const completionMessage = buildDesignerAiCompletionMessage(snapshot);
    setMessages((current) => appendDesignerAiMessageHistory(current,
      createMessage("assistant", completionMessage, { guidedCompletion: true })));
    setLiveMessage(completionMessage);
    return true;
  }, [journeyRef, setMessages]);

  const persistConversationState = useCallback((state, {
    onPersisted = null,
    onPersistenceError = null,
  } = {}) => {
    const normalized = normalizeDesignerAiConversationState(state);
    const persistedUsage = readDashboardDocumentNameState(window).designerAiConversation?.usage;
    // Evaluate the reconciled ledger, including verified receipts/resolutions.
    // The historical marker never resolves a leaf and shares this existing write.
    normalized.usage.guidedFlowCompleted = normalized.usage.guidedFlowCompleted ||
      persistedUsage?.guidedFlowCompleted === true ||
      conversationStateRef.current.usage.guidedFlowCompleted ||
      readDesignerAiCapabilitySnapshot(window, { conversationState: normalized })
        .ledger.guidedFlow.completion.complete;
    const operation = beginOperation();
    return persistDashboardDocumentUpdate({
      source: "designer-ai-ledger",
      designerAiConversation: normalized,
    }).then(() => {
      if (!operation.isCurrent()) return null;
      conversationStateRef.current = normalized;
      onPersisted?.();
      return normalized;
    }).catch((error) => {
      if (!operation.isCurrent()) return null;
      if (onPersistenceError) { onPersistenceError(error); return null; }
      throw error;
    }).finally(operation.cancel);
  }, [beginOperation]);

  useEffect(() => {
    if (giftProposal) return;
    if (sending) turnTimingRef.current?.markFeedback();
    else turnTimingRef.current?.publish(window);
  }, [giftProposal, messages, sending]);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    messagesEndRef.current?.scrollIntoView?.({
      block: "nearest",
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [activeControl, locationDecisions, messages, sending]);

  useEffect(() => {
    if (activeControl || !restoreChatFocusRef.current) return;
    restoreChatFocusRef.current = false;
    messageComposerRef.current?.focus?.();
  }, [activeControl]);

  const submitMessage = useCallback(async (rawMessage, {
    showUserMessage = true,
    entryMode = "continuation",
    snapshotOverride = null,
    verifiedContinuation = false,
    resumePartial = false,
    recentTurnsOverride = null,
    controlUserReply = showUserMessage,
  } = {}) => {
    const message = String(rawMessage || "").trim();
    if (message && pendingGiftRef.current) {
      const pending = pendingGiftRef.current;
      pendingGiftRef.current = null;
      discardDesignerAiGiftProposal(pending.proposal);
      pending.resolve({ cancelled: true });
      setGiftProposal(null);
    }
    if (!message || sendingRef.current) return;
    // Composing is allowed during hydration; interpreting an empty temporary
    // schema as a complete invitation is not.
    if (!readDashboardDocumentNameState(window).hydrated ||
        !readDesignerAiCapabilitySnapshot(window).authoringReady) return;
    const timing = createDesignerAiTurnTiming();
    turnTimingRef.current = timing;
    const stopContext = timing.startStage("contextMs");
    requestRetryRef.current = null;
    const requestSessionKey = sessionKeyRef.current;
    const requestSequence = ++requestSequenceRef.current;
    const resume = resumePartial ? recoveryRef.current : null;
    if (resumePartial && !resume) return;
    if (!resumePartial) {
      recoveryRef.current?.operation.cancel();
      recoveryRef.current = null;
    }
    const operation = resume?.operation || beginOperation();
    const initialSnapshot = snapshotOverride || readSnapshot();
    // Keep the original pre-action evidence across retries. A later local edit
    // must not make an invalidated Gifts choice look current again.
    let previousSnapshot = resume?.previousSnapshot || initialSnapshot;
    const userMessage = createMessage("user", message);
    const conversationWithUser = showUserMessage
      ? appendDesignerAiMessageHistory(messagesRef.current, userMessage)
      : messagesRef.current;
    // The current turn travels only in `message`, never in the bounded history.
    const recentTurns = recentTurnsOverride || selectDesignerAiRecentTurns(messagesRef.current);
    if (showUserMessage) {
      messagesRef.current = conversationWithUser;
      setMessages(conversationWithUser);
    }
    if (showUserMessage) setDraftMessage("");
    setActiveControl(null);
    activeControlRef.current = null;
    controlVerificationRef.current = false;
    setLocationDecisions([]);
    sendingRef.current = true;
    setSending(true);
    const initialProgress = "Preparando la respuesta…";
    setExecutionPhase(initialProgress);
    setLiveMessage(initialProgress);

    let result = resume?.result || null;
    let execution = null;
    let executionStarted = false;
    let outcome = "error";
    try {
      if (!conversationStateRef.current.usage.hasStarted) {
        await persistConversationState({ ...conversationStateRef.current, usage: { ...conversationStateRef.current.usage, hasStarted: true } });
        if (!operation.isCurrent()) return;
      }
      if (resume && !operation.isCurrent()) throw Object.assign(new Error("La sesión cambió."), { code: "designer-ai/recovery-conflict" });
      const payload = resume ? null : buildDesignerAiCallablePayload({
        draftId: readDashboardDocumentNameState(window).documentId,
        clientMessageId: userMessage.id,
        message,
        recentTurns,
        snapshot: initialSnapshot,
        entryMode,
      });
      stopContext();
      const stopCallable = timing.startStage("callableMs");
      let response;
      try { response = resume ? { data: resume.result } : await callable(payload); }
      finally { stopCallable(); }
      if (!operation.isCurrent() || sessionKeyRef.current !== requestSessionKey || requestSequenceRef.current !== requestSequence) return;
      result = response?.data;
      if (!isValidCallableResponse(result)) throw Object.assign(new Error("Respuesta inválida."), { code: "designer-ai/malformed-response" });
      timing.setBatchId(result.batchId);
      // Opening is a read-only application decision, including during a rolling
      // backend upgrade. A greeting seed never authorizes model-proposed writes.
      const automaticEntry = message === AUTO_START_MESSAGE && entryMode !== "continuation";
      if (automaticEntry) result = { ...result, intent: "clarify", actions: [], resolutions: [], controlRequest: null, clarification: null, notice: null };
      if (!resume && appliedBatchIdsRef.current.has(result.batchId)) {
        outcome = "duplicate";
        const duplicateMessage = "Recibí una respuesta repetida y no volví a aplicar sus cambios. Podés enviar una nueva solicitud.";
        setMessages(current => appendDesignerAiMessageHistory(current, createMessage("assistant", duplicateMessage)));
        setLiveMessage(duplicateMessage);
        return;
      }

      const currentSnapshot = readSnapshot();
      if (currentSnapshot.revision !== initialSnapshot.revision) throw Object.assign(new Error("El borrador cambió."), { code: "designer-ai/stale-snapshot" });
      previousSnapshot = resume?.previousSnapshot || currentSnapshot;
      const remainingActions = resume ? resume.recovery.actionResults.filter((r) => !r.effective).map((r) => r.action) : result.actions;
      const actionValidation = validateDesignerAiActionBatch(remainingActions, { origin: DESIGNER_AI_ACTION_ORIGINS.MODEL, snapshot: currentSnapshot });
      const controlValidation = validateDesignerAiControlRequest(result.controlRequest, currentSnapshot, { actions: remainingActions });
      // Older backend/model responses can attach an unnecessary local-control
      // wait to a leaf already covered by this valid action batch. Discard only
      // that redundancy; completion still requires the executor's saved receipt.
      if (!resume && actionValidation.ok) result = { ...result,
        resolutions: discardRedundantDesignerAiControlResolutions(result.resolutions, currentSnapshot, { actions: result.actions }) };
      // A resume retains the original validated intent. Rules are checked against
      // observed state during reconciliation; confirmed actions aren't projected twice.
      const resolutionValidation = resume ? { ok: true, errors: [] } : validateDesignerAiResolutionUpdates(result.resolutions, currentSnapshot, { actions: result.actions });
      if (!actionValidation.ok || !controlValidation.ok || !resolutionValidation.ok) {
        throw Object.assign(new Error([...actionValidation.errors, ...controlValidation.errors, ...resolutionValidation.errors].join(" ")), { code: "designer-ai/prevalidation-failed" });
      }

      const giftContext = () => ({ actions: result.actions, snapshot: readSnapshot(),
        rawGifts: readEditorRenderSnapshot(window)?.gifts, recovery: resume?.recovery || null });
      const proposal = createDesignerAiGiftProposal(giftContext(), () => operation.isCurrent() &&
        sessionKeyRef.current === requestSessionKey && requestSequenceRef.current === requestSequence);
      let giftApproval = null;
      if (proposal) {
        const decision = await new Promise(resolve => {
          pendingGiftRef.current = { proposal, resolve, readContext: giftContext, revision: currentSnapshot.revision };
          setGiftProposal(proposal);
          sendingRef.current = false;
          setSending(false);
          setLiveMessage("Cambios pendientes de confirmación. Revisá los destinos de Regalos.");
        });
        if (!operation.isCurrent() || requestSequenceRef.current !== requestSequence) return;
        if (decision.error) throw decision.error;
        if (decision.cancelled) {
          outcome = "cancelled";
          recoveryRef.current = null;
          const text = "Cancelé los cambios pendientes. No apliqué ese conjunto de cambios.";
          setMessages(current => appendDesignerAiMessageHistory(current, createMessage("assistant", text)));
          setLiveMessage(text);
          return;
        }
        giftApproval = decision.approval;
        setSending(true);
        sendingRef.current = true;
      }

      appliedBatchIdsRef.current.add(result.batchId);
      let actionResults = [];
      if (result.actions.length > 0) {
        executionStarted = true;
        const stopActions = timing.startStage("actionsAndPersistenceMs");
        try { execution = await executeDesignerAiActionBatch(result.actions, {
          snapshot: currentSnapshot,
          targetWindow: window,
          isSessionCurrent: () => operation.isCurrent() && sessionKeyRef.current === requestSessionKey,
          waitFrame: () => waitOneEditorFrame(pendingFramesRef.current),
          recovery: resume?.recovery || null,
          giftApproval,
          onProgress: (_phase, action) => {
            if (!operation.isCurrent()) return;
            const text = buildDesignerAiExecutionProgress(action, currentSnapshot);
            setExecutionPhase(text);
            setLiveMessage(text);
          },
        });
        } finally { stopActions(); }
        actionResults = execution.actionResults;
      }
      if (!operation.isCurrent()) return;
      const reflectedSnapshot = readSnapshot();
      const nextConversationState = reconcileDesignerAiConversationState({
        snapshot: reflectedSnapshot,
        previousSnapshot,
        previousState: conversationStateRef.current,
        actionResults,
        resolutions: result.resolutions,
      });
      setExecutionPhase("Guardando…");
      setLiveMessage("Guardando…");
      const stopMetadata = timing.startStage("metadataMs");
      try { await persistConversationState(nextConversationState); }
      finally { stopMetadata(); }
      if (!operation.isCurrent()) return;
      recoveryRef.current = null;
      const finalSnapshot = readDesignerAiCapabilitySnapshot(window, { conversationState: nextConversationState });
      if (fingerprintDesignerAiValue({ availability: reflectedSnapshot.availability, values: reflectedSnapshot.values }) !==
          fingerprintDesignerAiValue({ availability: finalSnapshot.availability, values: finalSnapshot.values })) {
        throw Object.assign(new Error("La invitación cambió mientras se guardaba el progreso."), {
          code: "designer-ai/stale-snapshot", actionResults, recovery: null,
        });
      }
      const coverHelp = resolveDesignerAiCoverHelp({ result, snapshot: finalSnapshot,
        decision: journeyRef.current.coverHelp, userReply: resume?.controlUserReply ?? controlUserReply });
      journeyRef.current.coverHelp = coverHelp.decision;
      const galleryHelp = resolveDesignerAiGalleryHelp({ result: { ...result, controlRequest: coverHelp.controlRequest }, snapshot: finalSnapshot,
        decision: journeyRef.current.galleryHelp, userReply: resume?.controlUserReply ?? controlUserReply });
      journeyRef.current.galleryHelp = galleryHelp.decision;
      const proposedControlRequest = coverHelp.offer ? null : galleryHelp.controlRequest || null;
      // Automatic continuation cannot reinterpret a Maps choice or open a
      // picker ahead of the fresh step. Explicit human requests remain reactive.
      const controlRequest = finalSnapshot.conversation.mode !== "editing" &&
        !(resume?.controlUserReply ?? controlUserReply) && proposedControlRequest?.type === "google_place_picker"
        ? null : proposedControlRequest;
      const continuationResult = { ...result, controlRequest };
      const controlState = controlRequest
        ? buildTrustedControlState(controlRequest, finalSnapshot)
        : null;
      activeControlRef.current = controlState;
      setActiveControl(controlState);
      setLocationDecisions(
        controlState ? [] : resolveDesignerAiLocationDecisions(continuationResult, finalSnapshot)
      );
      const helpQuestion = coverHelp.offer ? DESIGNER_AI_COVER_HELP_QUESTION : galleryHelp.offer ? DESIGNER_AI_GALLERY_HELP_QUESTION : "";
      const helpNotice = coverHelp.deferred ? DESIGNER_AI_COVER_HELP_LATER : galleryHelp.deferred ? DESIGNER_AI_GALLERY_HELP_LATER : "";
      const executionFeedback = buildDesignerAiExecutionFeedback(actionResults, { snapshot: finalSnapshot })
        ? withDesignerAiExecutionFeedback("Listo.", actionResults, finalSnapshot, { userMessage: message }) : "";
      const assistantMessage = helpQuestion
        ? [automaticEntry ? resolveDesignerAiEntryGreeting(result) : "", executionFeedback, helpNotice,
          buildDesignerAiScopeNotice(continuationResult), helpQuestion].filter(Boolean).join("\n\n")
        : withDesignerAiGuidedContinuation(
          withDesignerAiExecutionFeedback(helpNotice || result.assistantMessage, actionResults, finalSnapshot, { userMessage: message }),
          { previousSnapshot: currentSnapshot, snapshot: finalSnapshot, result: continuationResult, verifiedContinuation,
            executionFeedback, trustedAcknowledgement: helpNotice || (verifiedContinuation ? "El cambio quedó guardado." : ""),
            userMessage: message,
            entryMode: message === AUTO_START_MESSAGE ? entryMode : "continuation" }
        );
      setMessages((current) => {
        const next = appendDesignerAiMessageHistory(current, createMessage("assistant", assistantMessage, {
          intent: result.intent,
          ...(!controlState && (!helpQuestion || helpQuestion === buildDesignerAiGuidedQuestion(finalSnapshot))
            ? guidedPresentationEvidence(finalSnapshot, result.clarification) : {}),
        }));
        messagesRef.current = next;
        return next;
      });
      setLiveMessage(assistantMessage);
      publishGuidedCompletion(finalSnapshot);
      outcome = "success";
    } catch (error) {
      if (!operation.isCurrent() || sessionKeyRef.current !== requestSessionKey) return;
      if (!executionStarted && showUserMessage && (error?.details?.category === "assistant_admission" ||
          /appcheck|unauthenticated|resource-exhausted|already-exists/i.test(String(error?.code)))) {
        setDraftMessage(current => current || message);
      }
      if (!error.actionResults && execution) {
        error.actionResults = execution.actionResults;
        error.recovery = execution.recovery;
      }
      recoveryRef.current = error.recovery ? { result, recovery: error.recovery, operation, previousSnapshot,
        controlUserReply: resume?.controlUserReply ?? controlUserReply } : null;
      if (error.actionResults?.length) {
        const partialState = reconcileDesignerAiConversationState({
          snapshot: readSnapshot(), previousSnapshot, previousState: conversationStateRef.current,
          actionResults: error.actionResults,
        });
        conversationStateRef.current = partialState;
        await persistConversationState(partialState, { onPersistenceError: () => {} });
        if (!operation.isCurrent()) return;
      }
      const reflected = Array.isArray(error?.appliedActions) && error.appliedActions.length
        ? " Algunos cambios llegaron a reflejarse antes del error."
        : error.actionResults?.some((item) => item.effective && !item.persisted)
          ? " Hay cambios visibles cuyo guardado no se confirmó."
          : "";
      const partialFeedback = buildDesignerAiExecutionFeedback(error.actionResults, { partial: true, snapshot: readSnapshot() });
      const safeMessage = partialFeedback
        ? `${partialFeedback}\n\n${error.code === "designer-ai/stale-snapshot"
          ? "La invitación cambió durante la operación. Revisá el borrador y enviá una nueva solicitud para usar su estado actual."
          : error.actionResults.every((item) => item.persisted && !item.error)
          ? "No pude guardar el progreso del recorrido. Podés reintentar desde acá."
          : error.recovery ? "Podés reintentar los cambios pendientes."
          : "La invitación cambió durante la operación. Enviá una nueva solicitud para usar su estado actual."}`
        : verifiedContinuation
        ? VERIFIED_CONTINUATION_FALLBACK
        : `${normalizeCallableError(error)}${reflected}`;
      const errorMessage = createMessage("assistant", safeMessage, {
          intent: "error",
          canRetryContinuation: verifiedContinuation,
          actionResults: error.actionResults || [],
          recoveryBatchId: error.recovery ? result.batchId : null,
      });
      if (!executionStarted && !resume && !verifiedContinuation && error?.details?.retryable !== false &&
          !/appcheck|permission-denied|unauthenticated|already-exists|invalid-argument|failed-precondition/i.test(String(error?.code))) {
        requestRetryRef.current = {
          messageId: errorMessage.id,
          run: () => submitMessageRef.current?.(message, { showUserMessage: false, entryMode, recentTurnsOverride: recentTurns, controlUserReply }),
        };
      }
      setMessages((current) => {
        const next = appendDesignerAiMessageHistory(current, errorMessage);
        messagesRef.current = next;
        return next;
      });
      setLiveMessage(safeMessage);
    } finally {
      if (recoveryRef.current?.operation !== operation) operation.cancel();
      if (sessionKeyRef.current === requestSessionKey && requestSequenceRef.current === requestSequence) {
        timing.complete(outcome);
        sendingRef.current = false;
        setSending(false);
      }
    }
  }, [beginOperation, callable, journeyRef, persistConversationState, publishGuidedCompletion, readSnapshot, setMessages]);

  submitMessageRef.current = submitMessage;

  const startConversationIfReady = useCallback(() => {
    if (
      autoStartedSessionRef.current === sessionKeyRef.current ||
      sendingRef.current
    ) return false;
    const documentState = readDashboardDocumentNameState(window);
    if (documentState.hydrated !== true) return false;
    // Header metadata and field authoring hydrate independently. An early empty
    // schema must not turn the names into unavailable leaves or persist an entry.
    if (!readDesignerAiCapabilitySnapshot(window).authoringReady) return false;
    setConversationReady(true);
    if (journeyRef.current.sessionKey !== sessionKeyRef.current) {
      journeyRef.current = { sessionKey: sessionKeyRef.current, initialized: false, editing: false };
    }
    if (!journeyRef.current.initialized) {
      const snapshot = readDesignerAiCapabilitySnapshot(window, {
        conversationState: documentState.designerAiConversation,
      });
      journeyRef.current.initialized = true;
      journeyRef.current.editing = snapshot.conversation.mode === "editing" ||
        snapshot.ledger.guidedFlow.completion.complete;
    }
    if (messagesRef.current.length > 0) {
      conversationStateRef.current = normalizeDesignerAiConversationState(
        documentState.designerAiConversation
      );
      autoStartedSessionRef.current = sessionKeyRef.current;
      const snapshot = readSnapshot();
      // The durable completion marker may have changed while the panel was
      // closed. Reentry never resets that experience or announces closure again.
      journeyRef.current.editing = journeyRef.current.editing || snapshot.conversation.mode === "editing" ||
        snapshot.ledger.guidedFlow.completion.complete;
      setLocationDecisions(resolveDesignerAiLocationDecisions({}, snapshot));
      // A pending turn is cancelled on unmount. Do not silently leave its user
      // message unanswered, or replay a batch that may have partially persisted.
      if (messagesRef.current.at(-1)?.role === "user") {
        const interruptedMessage = "La operación se interrumpió al cerrar el asistente. Revisá el borrador y enviá una nueva solicitud para continuar.";
        setMessages(current => appendDesignerAiMessageHistory(current, createMessage("assistant", interruptedMessage)));
        setLiveMessage(interruptedMessage);
        return true;
      }
      const lastMessage = messagesRef.current.at(-1);
      const question = !journeyRef.current.editing ? buildDesignerAiGuidedQuestion(snapshot) : "";
      const presentation = guidedPresentationEvidence(snapshot);
      const sameStep = presentation.guidedStepFingerprint &&
        lastMessage?.guidedStepFingerprint === presentation.guidedStepFingerprint;
      // Keep history and explicit recovery controls. A changed/legacy question
      // receives a local continuation from the current draft, without a model
      // request, an automatic control, a metadata write or an input reset.
      if (question && !sameStep && lastMessage?.intent !== "error" && !lastMessage?.canRetryContinuation &&
          !String(lastMessage?.content || "").trim().endsWith(question)) {
        setMessages(current => appendDesignerAiMessageHistory(current,
          createMessage("assistant", question, { intent: "clarify", ...presentation })));
        setLiveMessage(question);
        return true;
      }
      setLiveMessage("");
      return true;
    }
    const entry = prepareDesignerAiConversationEntry(
      documentState.designerAiConversation
    );
    conversationStateRef.current = entry.requestState;
    const initialSnapshot = readDesignerAiCapabilitySnapshot(window, {
      conversationState: entry.requestState,
    });
    initialSnapshot.conversation.mode = journeyRef.current.editing ? "editing" : "guided";
    const startedState = reconcileDesignerAiConversationState({
      snapshot: initialSnapshot,
      previousState: entry.persistedState,
    });
    autoStartedSessionRef.current = sessionKeyRef.current;
    const requestSessionKey = sessionKeyRef.current;
    const beginConversation = () => {
      if (sendingRef.current || sessionKeyRef.current !== requestSessionKey) return;
      requestRetryRef.current = null;
      sendingRef.current = true;
      setSending(true);
      return persistConversationState(startedState, {
        onPersisted: () => {
          if (sessionKeyRef.current !== requestSessionKey) return;
          sendingRef.current = false;
          void submitMessageRef.current?.(AUTO_START_MESSAGE, {
            showUserMessage: false,
            entryMode: entry.entryMode,
            // Metadata persistence/retry may have waited while the person edited.
            snapshotOverride: readSnapshot(),
          });
        },
        onPersistenceError: () => {
          if (sessionKeyRef.current !== requestSessionKey) return;
          sendingRef.current = false;
          setSending(false);
          const safeMessage = "No pude iniciar Tu asistente porque no se guardó el estado del borrador. Podés reintentar desde acá.";
          const errorMessage = createMessage("assistant", safeMessage, { intent: "error" });
          requestRetryRef.current = { messageId: errorMessage.id, run: beginConversation };
          setMessages((current) => {
            const next = appendDesignerAiMessageHistory(current, errorMessage);
            messagesRef.current = next;
            return next;
          });
          setLiveMessage(safeMessage);
        },
      });
    };
    void beginConversation();
    return true;
  }, [journeyRef, persistConversationState, readSnapshot, setMessages]);

  useEffect(() => {
    cancelPendingEditorFrames(pendingFramesRef.current);
    sessionKeyRef.current = sessionKey;
    requestSequenceRef.current += 1;
    appliedBatchIdsRef.current.clear();
    recoveryRef.current?.operation.cancel();
    recoveryRef.current = null;
    requestRetryRef.current = null;
    sendingRef.current = false;
    activeControlRef.current = null;
    turnTimingRef.current = null;
    controlVerificationRef.current = false;
    restoreChatFocusRef.current = false;
    autoStartedSessionRef.current = "";
    conversationStateRef.current = normalizeDesignerAiConversationState(null);
    setActiveControl(null);
    setGiftProposal(null);
    setLocationDecisions([]);
    setSending(false);
    setDraftMessage("");
    setConversationReady(false);
    setLiveMessage("Preparando la conversación.");
    const timerId = window.setTimeout(() => {
      if (sessionKeyRef.current !== sessionKey) return;
      startConversationIfReady();
    }, 0);
    return () => {
      window.clearTimeout(timerId);
      const pending = pendingGiftRef.current;
      pendingGiftRef.current = null;
      if (pending) { discardDesignerAiGiftProposal(pending.proposal); pending.resolve({ cancelled: true }); }
      cancelPendingEditorFrames(pendingFramesRef.current);
      if (sessionKeyRef.current === sessionKey) {
        sessionKeyRef.current = "";
        requestSequenceRef.current += 1;
      }
    };
  }, [sessionKey, startConversationIfReady]);

  useEffect(() => {
    startConversationIfReady();
  }, [contentVersion, startConversationIfReady]);

  const refreshActiveGalleryChangeState = useCallback(() => {
    const controlState = activeControlRef.current;
    if (controlState?.request?.type !== "gallery_cell_upload") return false;
    const currentFingerprint = galleryEditFingerprint(
      readSnapshot(),
      controlState.request.galleryId
    );
    const hasChanges = controlState.galleryHasChanges === true || Boolean(
      controlState.baselineGalleryFingerprint &&
      currentFingerprint &&
      currentFingerprint !== controlState.baselineGalleryFingerprint
    );
    if (hasChanges === controlState.galleryHasChanges) return hasChanges;
    const nextControlState = { ...controlState, galleryHasChanges: hasChanges };
    activeControlRef.current = nextControlState;
    setActiveControl(nextControlState);
    return hasChanges;
  }, [readSnapshot]);

  const continueFromVerifiedSnapshot = useCallback((snapshot, acknowledgement) => {
    const continuation = buildDesignerAiLocalContinuation(snapshot, {
      acknowledgement, galleryHelp: journeyRef.current.galleryHelp,
    });
    if (!validateDesignerAiControlRequest(continuation.controlRequest, snapshot).ok) return false;
    journeyRef.current.galleryHelp = continuation.galleryHelp;
    const control = continuation.controlRequest ? buildTrustedControlState(continuation.controlRequest, snapshot) : null;
    activeControlRef.current = control;
    setActiveControl(control);
    setLocationDecisions(control ? [] : resolveDesignerAiLocationDecisions({}, snapshot));
    setMessages((current) => {
      const next = appendDesignerAiMessageHistory(current, createMessage("assistant", continuation.assistantMessage, {
        intent: "clarify", ...(!control ? guidedPresentationEvidence(snapshot) : {}),
      }));
      messagesRef.current = next;
      return next;
    });
    setLiveMessage(continuation.assistantMessage);
    return true;
  }, [journeyRef, setMessages]);

  const completeActiveControlIfReflected = useCallback(async ({
    wait = false,
    expectedLocation = null,
  } = {}) => {
    if (controlVerificationRef.current) return null;
    const controlState = activeControlRef.current;
    if (!controlState || sendingRef.current) return;
    if (controlState.request?.type === "gallery_cell_upload") return false;
    if (controlState.request?.type === "google_place_picker" && !expectedLocation?.googlePlaceId) return false;
    const operation = beginOperation();
    controlVerificationRef.current = true;
    let snapshot = readSnapshot();
    let completedLeafIds = [];
    const attempts = wait ? 120 : 1;
    for (let frame = 0; frame < attempts; frame += 1) {
      if (!operation.isCurrent() || activeControlRef.current !== controlState) break;
      snapshot = readSnapshot();
      const request = controlState.request;
      if (request?.type === "google_place_picker" && expectedLocation?.googlePlaceId) {
        const feature = request.phase === "party"
          ? EVENT_DETAIL_FEATURES.PARTY
          : EVENT_DETAIL_FEATURES.CEREMONY;
        const persistedLocation = readEventLocationAuthoringState(window, feature);
        completedLeafIds = getDesignerAiGooglePlaceVerifiedLeafIds({
          snapshot,
          persistedLocation,
          phase: request.phase,
          expectedLocation,
        });
      } else {
        completedLeafIds = controlState.leafIds.filter(
          (leafId) => leafFingerprint(snapshot, leafId) !== controlState.baselineFingerprints[leafId]
        );
      }
      if (completedLeafIds.length > 0) break;
      if (!wait || sessionKeyRef.current !== sessionKey) break;
      await waitOneEditorFrame(pendingFramesRef.current);
    }
    if (completedLeafIds.length === 0 || !operation.isCurrent() || activeControlRef.current !== controlState) {
      controlVerificationRef.current = false;
      operation.cancel();
      return false;
    }
    const nextState = reconcileDesignerAiConversationState({
      snapshot,
      previousState: conversationStateRef.current,
      controlLeafIds: completedLeafIds,
    });
    try {
      // Places awaits its authoring write; cover is published by its owner only
      // after its durable write. Gallery requires a separate flush below.
      await persistConversationState(nextState);
      if (!operation.isCurrent() || activeControlRef.current !== controlState) return false;
    } catch {
      controlVerificationRef.current = false;
      setLiveMessage("El cambio está visible, pero no pude confirmar el guardado del recorrido. Probá nuevamente.");
      return false;
    } finally { operation.cancel(); }
    const verifiedSnapshot = readDesignerAiCapabilitySnapshot(window, {
      conversationState: nextState,
    });
    if (controlState.request.type === "cover_upload" && verifiedSnapshot.ledger.leaves.find(
      (leaf) => leaf.id === "media.cover"
    )?.status !== DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_CONTROL) {
      controlVerificationRef.current = false;
      return false;
    }
    activeControlRef.current = null;
    setActiveControl(null);
    setLocationDecisions([]);
    controlVerificationRef.current = false;
    if (publishGuidedCompletion(verifiedSnapshot)) return true;
    verifiedSnapshot.conversation.mode = journeyRef.current.editing ? "editing" : "guided";
    if (controlState.request.type === "cover_upload") {
      return continueFromVerifiedSnapshot(verifiedSnapshot, "Listo, cambié la foto de portada.");
    }
    void submitMessageRef.current?.(
      buildControlContinueMessage(completedLeafIds, verifiedSnapshot),
      {
        showUserMessage: false,
        snapshotOverride: verifiedSnapshot,
        verifiedContinuation: true,
      }
    );
    return true;
  }, [beginOperation, continueFromVerifiedSnapshot, journeyRef, persistConversationState, publishGuidedCompletion, readSnapshot, sessionKey]);

  useEffect(() => {
    refreshActiveGalleryChangeState();
    void completeActiveControlIfReflected();
  }, [completeActiveControlIfReflected, contentVersion, refreshActiveGalleryChangeState]);

  const finishActiveGallery = useCallback(async () => {
    const controlState = activeControlRef.current;
    if (
      controlVerificationRef.current ||
      sendingRef.current ||
      controlState?.request?.type !== "gallery_cell_upload"
    ) return false;
    const snapshot = readSnapshot();
    const completionLeafId = buildDesignerAiGalleryCompletionLeafId(
      controlState.request.galleryId
    );
    const completionLeaf = snapshot?.ledger?.leaves?.find(
      (leaf) => leaf.id === completionLeafId
    );
    if (!completionLeafId || !completionLeaf) {
      const safeMessage = "No pude finalizar esta galería porque ya no está disponible en el borrador. Volvé al chat para continuar con el estado actual.";
      setMessages((current) => {
        const next = appendDesignerAiMessageHistory(current, createMessage("assistant", safeMessage, { intent: "error" }));
        messagesRef.current = next;
        return next;
      });
      setLiveMessage(safeMessage);
      return false;
    }

    controlVerificationRef.current = true;
    const previousState = conversationStateRef.current;
    const nextState = reconcileDesignerAiConversationState({
      snapshot,
      previousState,
      controlLeafIds: [completionLeafId],
    });
    const finishingControlState = { ...controlState, finishing: true };
    activeControlRef.current = finishingControlState;
    setActiveControl(finishingControlState);
    const requestSessionKey = sessionKeyRef.current;
    const operation = beginOperation();
    try {
      const persisted = await confirmDesignerAiPersistence(window, operation.isCurrent);
      const galleryId = controlState.request.galleryId;
      const expectedGallery = snapshot.values.galleries.find((item) => item.id === galleryId);
      const savedGallery = persisted.snapshot.values.galleries.find((item) => item.id === galleryId);
      if (!operation.isCurrent() || JSON.stringify(expectedGallery) !== JSON.stringify(savedGallery)) {
        throw new Error("La galería guardada no coincide con la visible.");
      }
    } catch {
      if (operation.isCurrent()) {
        controlVerificationRef.current = false;
        activeControlRef.current = controlState;
        setActiveControl(controlState);
        const message = "No pude confirmar el guardado de las fotos. La galería sigue pendiente; probá nuevamente.";
        setMessages((current) => appendDesignerAiMessageHistory(current, createMessage("assistant", message, { intent: "error" })));
        setLiveMessage(message);
      }
      operation.cancel();
      return false;
    }

    persistConversationState(nextState, {
      onPersisted: () => {
        if (sessionKeyRef.current !== requestSessionKey) return;
        const currentControlState = activeControlRef.current;
        if (
          currentControlState?.request?.type !== "gallery_cell_upload" ||
          currentControlState.request.galleryId !== controlState.request.galleryId
        ) return;
        const verifiedSnapshot = readDesignerAiCapabilitySnapshot(window, {
          conversationState: nextState,
        });
        const verifiedLeaf = verifiedSnapshot?.ledger?.leaves?.find(
          (leaf) => leaf.id === completionLeafId
        );
        if (verifiedLeaf?.status !== DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_CONTROL) {
          conversationStateRef.current = previousState;
          controlVerificationRef.current = false;
          const restoredControlState = { ...currentControlState, finishing: false };
          activeControlRef.current = restoredControlState;
          setActiveControl(restoredControlState);
          return;
        }
        activeControlRef.current = null;
        setActiveControl(null);
        setLocationDecisions([]);
        controlVerificationRef.current = false;
        if (publishGuidedCompletion(verifiedSnapshot)) return;
        verifiedSnapshot.conversation.mode = journeyRef.current.editing ? "editing" : "guided";
        void submitMessageRef.current?.(
          buildControlContinueMessage([completionLeafId], verifiedSnapshot),
          {
            showUserMessage: false,
            snapshotOverride: verifiedSnapshot,
            verifiedContinuation: true,
          }
        );
      },
      onPersistenceError: () => {
        if (sessionKeyRef.current !== requestSessionKey) return;
        conversationStateRef.current = previousState;
        controlVerificationRef.current = false;
        const currentControlState = activeControlRef.current;
        if (currentControlState?.request?.type === "gallery_cell_upload") {
          const restoredControlState = { ...currentControlState, finishing: false };
          activeControlRef.current = restoredControlState;
          setActiveControl(restoredControlState);
        }
        const safeMessage = "Los cambios de fotos se conservaron, pero no pude guardar que terminaste esta galería. Probá nuevamente.";
        setMessages((current) => {
          const next = appendDesignerAiMessageHistory(current, createMessage("assistant", safeMessage, { intent: "error" }));
          messagesRef.current = next;
          return next;
        });
        setLiveMessage(safeMessage);
      },
    }).finally(operation.cancel);
    return true;
  }, [beginOperation, journeyRef, persistConversationState, publishGuidedCompletion, readSnapshot, setMessages]);

  const openLocationControl = useCallback((decision) => {
    const snapshot = readSnapshot();
    const controlState = buildDesignerAiGooglePlaceControlState(decision, snapshot);
    const validation = validateDesignerAiControlRequest(controlState.request, snapshot);
    if (!validation.ok) {
      const safeMessage = "No pude abrir la búsqueda para esa ubicación porque el estado del evento cambió. Probá nuevamente desde el chat.";
      setMessages((current) => {
        const next = appendDesignerAiMessageHistory(current, createMessage("assistant", safeMessage, { intent: "error" }));
        messagesRef.current = next;
        return next;
      });
      setLiveMessage(safeMessage);
      return;
    }
    activeControlRef.current = controlState;
    setActiveControl(controlState);
    setLocationDecisions((current) => current.filter((item) => item.phase !== decision.phase));
  }, [readSnapshot]);

  const useManualLocation = useCallback((decision) => {
    if (sendingRef.current || activeControlRef.current) return false;
    const snapshot = readSnapshot();
    const resolution = buildDesignerAiManualLocationResolution(decision);
    const validation = validateDesignerAiResolutionUpdates([resolution], snapshot);
    if (!validation.ok) {
      const safeMessage = "No pude registrar la elección de ubicación manual porque el estado del evento cambió. Probá nuevamente desde el chat.";
      setMessages((current) => {
        const next = appendDesignerAiMessageHistory(current, createMessage("assistant", safeMessage, { intent: "error" }));
        messagesRef.current = next;
        return next;
      });
      setLiveMessage(safeMessage);
      return false;
    }

    const previousState = conversationStateRef.current;
    const nextState = reconcileDesignerAiConversationState({
      snapshot,
      previousState,
      resolutions: [resolution],
    });
    const userChoice = createMessage(
      "user",
      buildDesignerAiManualLocationReply(decision)
    );
    setMessages((current) => {
      const next = appendDesignerAiMessageHistory(current, userChoice);
      messagesRef.current = next;
      return next;
    });
    setLocationDecisions((current) => current.filter(
      (item) => item.phase !== decision.phase
    ));
    const requestSessionKey = sessionKeyRef.current;
    const operation = beginOperation();
    sendingRef.current = true;
    setSending(true);
    setExecutionPhase("Guardando…");
    persistConversationState(nextState, {
      onPersisted: () => {
        if (sessionKeyRef.current !== requestSessionKey) return;
        const verifiedSnapshot = readDesignerAiCapabilitySnapshot(window, {
          conversationState: nextState,
        });
        if (publishGuidedCompletion(verifiedSnapshot)) return;
        verifiedSnapshot.conversation.mode = journeyRef.current.editing ? "editing" : "guided";
        // The persisted manual choice is already authoritative. Derive the
        // next question locally so a model continuation cannot reopen Maps.
        const currentChoice = verifiedSnapshot.ledger.leaves.find(leaf => leaf.id === resolution.leafId);
        const manualChoiceIsCurrent = currentChoice?.status === "resolved_by_rule" && currentChoice.rule === "leave_empty";
        continueFromVerifiedSnapshot(verifiedSnapshot, manualChoiceIsCurrent
          ? "Listo, seguimos con la ubicación manual." : "Sigamos con tu invitación.");
      },
      onPersistenceError: () => {
        if (sessionKeyRef.current !== requestSessionKey) return;
        conversationStateRef.current = previousState;
        setLocationDecisions((current) => [
          decision,
          ...current.filter((item) => item.phase !== decision.phase),
        ]);
        const safeMessage = "No pude guardar la elección de ubicación manual. Probá nuevamente.";
        setMessages((current) => {
          const next = appendDesignerAiMessageHistory(current, createMessage("assistant", safeMessage, { intent: "error" }));
          messagesRef.current = next;
          return next;
        });
        setLiveMessage(safeMessage);
      },
    }).finally(() => {
      if (operation.isCurrent() && sessionKeyRef.current === requestSessionKey) {
        sendingRef.current = false;
        setSending(false);
      }
      operation.cancel();
    });
    return true;
  }, [beginOperation, continueFromVerifiedSnapshot, journeyRef, persistConversationState, publishGuidedCompletion, readSnapshot]);

  const closeTrustedControl = useCallback(() => {
    const controlState = activeControlRef.current;
    activeControlRef.current = null;
    controlVerificationRef.current = false;
    restoreChatFocusRef.current = true;
    setActiveControl(null);
    if (controlState?.request?.type !== "google_place_picker") return;
    const snapshot = readSnapshot();
    const phase = controlState.request.phase === "party" ? "party" : "ceremony";
    const eventMode = snapshot.values?.eventMode === "ceremony_party" ? "ceremony_party" : "single";
    const location = snapshot.values?.[phase] || {};
    setLocationDecisions((current) => [{
      phase,
      eventMode,
      label: getDesignerAiLocationPhaseLabel(phase, eventMode),
      query: buildDesignerAiLocationSearchQuery(location) || controlState.initialQuery,
      venueName: String(location.venueName || ""),
      address: String(location.address || ""),
      cancelled: true,
    }, ...current.filter((item) => item.phase !== phase)]);
  }, [readSnapshot]);

  const handleSubmit = (event) => {
    event.preventDefault();
    void submitMessage(draftMessage);
  };
  const handleComposerKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void submitMessage(draftMessage);
  };
  const retryVerifiedContinuation = useCallback(async (messageId) => {
    if (sendingRef.current || activeControlRef.current) return false;
    const operation = beginOperation();
    sendingRef.current = true;
    setSending(true);
    setExecutionPhase("Retomando el recorrido…");
    try {
      let snapshot = readSnapshot();
      if (!journeyRef.current.editing && snapshot.ledger.guidedFlow.completion.complete) {
        // Manual edits may have completed the journey since the failed call.
        // Persist the existing monotonic marker before showing its first closure.
        await persistConversationState(reconcileDesignerAiConversationState({ snapshot, previousState: conversationStateRef.current }));
        if (!operation.isCurrent()) return false;
        snapshot = readSnapshot();
      }
      if (!publishGuidedCompletion(snapshot) && !continueFromVerifiedSnapshot(snapshot)) return false;
      setMessages((current) => {
        const next = current.map((message) => message.id === messageId
          ? { ...message, canRetryContinuation: false }
          : message);
        messagesRef.current = next;
        return next;
      });
      return true;
    } catch {
      if (operation.isCurrent()) setLiveMessage("No pude guardar el progreso del recorrido. Probá continuar nuevamente.");
      return false;
    } finally {
      if (operation.isCurrent()) { sendingRef.current = false; setSending(false); }
      operation.cancel();
    }
  }, [beginOperation, continueFromVerifiedSnapshot, journeyRef, persistConversationState, publishGuidedCompletion, readSnapshot, setMessages]);
  const imageProps = { abrirSelector, imagenes, imagenesEnProceso, cargarImagenes, borrarImagen, hayMas, cargando, seccionActivaId, setMostrarGaleria, setImagenesSeleccionadas };

  return (
    <section
      className="flex h-full max-h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white p-0 text-left font-['DM_Sans',sans-serif] text-[#262626] transition-none [&_h2]:[text-shadow:none] [&_h3]:[text-shadow:none] [&_p]:m-0 [&_p]:[text-shadow:none] [&_section]:transition-none"
      aria-label="Tu asistente"
      aria-busy={sending || !conversationReady}
    >
      <header className="flex min-h-12 shrink-0 items-center gap-2.5 border-b border-[#E5E5E5] bg-white px-3 pr-12">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#FAF5FF] text-[#692B9A]" aria-hidden="true">
          <Sparkles className="h-4 w-4" />
        </span>
        <h2 className="m-0 truncate text-sm font-semibold leading-5 text-[#262626]">
          Tu asistente
        </h2>
      </header>
      {activeControl ? (
        <DesignerAiTrustedControl
          controlState={activeControl}
          onClose={closeTrustedControl}
          onSelectionApplied={(expectedLocation) => completeActiveControlIfReflected({
            wait: true,
            expectedLocation,
          })}
          onGalleryComplete={finishActiveGallery}
          imageProps={imageProps}
        />
      ) : (
        <>
      {giftProposal ? <DesignerAiGiftConfirmation proposal={giftProposal}
        onConfirm={() => settleGiftProposal(true, false, giftProposal)} onCancel={() => settleGiftProposal(false, false, giftProposal)} /> : <div
        className="flex min-h-0 flex-1 basis-0 flex-col gap-2.5 overflow-y-auto overscroll-contain bg-[#FBF7F9] px-3 py-3.5 [scrollbar-gutter:stable]"
        role="log"
        aria-label="Conversación"
      >
        {messages.map((message) => (
          <article
            key={message.id}
            className={`max-w-[88%] rounded-2xl px-3 py-2.5 font-['Source_Sans_3',sans-serif] text-sm leading-5 ${
              message.role === "user"
                ? "ml-auto rounded-br-md bg-[#692B9A] text-white"
                : message.intent === "error"
                  ? "mr-auto rounded-bl-md border border-[#FFDADA] bg-[#fff3f2] text-[#8f1d18]"
                  : "mr-auto rounded-bl-md border border-[#E5E5E5] bg-white text-[#262626]"
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
            {message.guidedCompletion ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {typeof onPreview === "function" ? (
                  <button type="button" onClick={onPreview} disabled={sending}
                    className="min-h-11 rounded-xl bg-[#692B9A] px-3 py-2 text-xs font-medium text-white disabled:opacity-60">
                    Ver vista previa
                  </button>
                ) : null}
                <button type="button" onClick={() => messageComposerRef.current?.focus()} disabled={sending}
                  className="min-h-11 rounded-xl border border-[#d9c0ec] px-3 py-2 text-xs font-medium text-[#692B9A] disabled:opacity-60">
                  Seguir ajustando
                </button>
              </div>
            ) : null}
            {message.recoveryBatchId && message === messages.at(-1) && recoveryRef.current?.result.batchId === message.recoveryBatchId ? (
              <div className="mt-2">
                <button type="button" disabled={sending}
                  onClick={() => void submitMessage("Reintentar pendientes", { showUserMessage: false, resumePartial: true })}
                  className="min-h-11 rounded-xl border border-[#d9c0ec] bg-white px-3 py-2 text-xs font-medium text-[#692B9A] disabled:opacity-60">
                  Reintentar pendientes
                </button>
                <p className="mt-1 text-xs">Este reintento conserva los cambios confirmados. Enviar otro mensaje inicia una nueva solicitud.</p>
              </div>
            ) : message === messages.at(-1) && requestRetryRef.current?.messageId === message.id ? (
              <button type="button" disabled={sending}
                onClick={() => { if (!sendingRef.current) void requestRetryRef.current?.run(); }}
                className="mt-2 min-h-11 rounded-xl border border-[#d9c0ec] bg-white px-3 py-2 text-xs font-medium text-[#692B9A] disabled:opacity-60">
                Reintentar
              </button>
            ) : message.canRetryContinuation && message === messages.at(-1) ? (
              <button
                type="button"
                onClick={() => retryVerifiedContinuation(message.id)}
                disabled={sending}
                className="mt-2 inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d9c0ec] bg-white px-3 py-2 text-xs font-medium text-[#692B9A] transition-colors hover:bg-[#FAF5FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EFDBFF] disabled:cursor-wait disabled:opacity-60"
              >
                Continuar recorrido
              </button>
            ) : null}
          </article>
        ))}
        {sending ? (
          <div className="mr-auto inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-[#E5E5E5] bg-white px-3 py-2.5 font-['Source_Sans_3',sans-serif] text-sm text-[#625d60]">
            <LoaderCircle className="h-4 w-4 animate-spin text-[#692B9A] motion-reduce:animate-none" aria-hidden="true" />
            {executionPhase}
          </div>
        ) : null}
        {!sending && !activeControl ? locationDecisions.map((decision) => (
          <DesignerAiLocationDecision
            key={decision.phase}
            decision={decision}
            onSearch={openLocationControl}
            onUseManual={useManualLocation}
          />
        )) : null}
        <div ref={messagesEndRef} />
      </div>}
      <form onSubmit={handleSubmit} className="shrink-0 border-t border-[#E5E5E5] bg-white px-3 py-2.5">
        <label htmlFor="designer-ai-message" className="sr-only">Mensaje para Tu asistente</label>
        <div className="flex items-end gap-2">
          <textarea
            ref={messageComposerRef}
            id="designer-ai-message"
            value={draftMessage}
            onChange={(event) => setDraftMessage(event.target.value.slice(0, 1200))}
            onKeyDown={handleComposerKeyDown}
            disabled={Boolean(activeControl)}
            rows={3}
            placeholder="Contame que tenes en mente..."
            className="min-h-[68px] min-w-0 flex-1 resize-none rounded-xl border border-[#d8d3d5] bg-[#FBF7F9] px-3 py-2.5 font-['Source_Sans_3',sans-serif] text-sm leading-5 text-[#262626] outline-none transition-colors placeholder:text-[#81797d] focus:border-[#692B9A] focus-visible:ring-2 focus-visible:ring-[#EFDBFF] disabled:cursor-not-allowed disabled:bg-[#f2eff1]"
          />
          <button type="submit" disabled={!conversationReady || sending || Boolean(activeControl) || !draftMessage.trim()} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-[#692B9A] text-white transition-colors hover:bg-[#57227f] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EFDBFF] disabled:cursor-not-allowed disabled:bg-[#c9c3c7]" aria-label="Enviar mensaje">
            {sending
              ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              : <Send className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>

      </form>
        </>
      )}
      <p className="sr-only" aria-live="polite">{liveMessage}</p>
    </section>
  );
}
