import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, MapPin, Send, X } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import MiniToolbarTabImagen from "@/components/MiniToolbarTabImagen";
import DesignerAiLocationControl from "@/components/editor/designerAi/DesignerAiLocationControl";
import {
  DESIGNER_AI_ACTION_ORIGINS,
  DESIGNER_AI_CONTRACT_VERSION,
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
import { executeDesignerAiActionBatch } from "@/domain/editor/designerAiActionExecutor";
import {
  buildDesignerAiGooglePlaceControlState,
  buildDesignerAiLocationSearchQuery,
  buildDesignerAiManualLocationReply,
  buildDesignerAiManualLocationResolution,
  getDesignerAiLocationPhaseLabel,
  isDesignerAiGooglePlaceControlReflected,
  resolveDesignerAiLocationDecisions,
} from "@/domain/editor/designerAiLocationInteraction";
import { EVENT_DETAIL_FEATURES } from "@/domain/eventDetails/features";
import { readEventLocationAuthoringState } from "@/domain/eventDetails/locationAuthoring";
import {
  readDashboardDocumentNameState,
  requestDashboardDocumentNameUpdate,
} from "@/lib/dashboardDocumentNameBridge";

const MAX_SESSION_MESSAGES = 6;
const AUTO_START_MESSAGE = "Iniciá la conversación con una bienvenida breve y guiame desde el primer bloque que todavía tenga información pendiente.";
const COMPLETE_MESSAGE = "Terminamos el recorrido principal. Podés seguir editando manualmente toda la invitación como quieras y consultar el resultado con el botón Vista previa, en la esquina superior derecha.";

function buildControlContinueMessage(completedLeafIds, snapshot) {
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

function appendSessionMessages(current, ...messages) {
  return [...current, ...messages]
    .filter((message) => message.content)
    .slice(-MAX_SESSION_MESSAGES);
}

function normalizeCallableError(error) {
  const code = String(error?.code || "");
  const baseMessage = code.includes("permission-denied")
    ? "Tu sesión ya no tiene permiso para usar esta experiencia."
    : code.includes("resource-exhausted")
      ? "No pude responder por el momento. Probá de nuevo en unos minutos."
      : code.includes("deadline-exceeded")
        ? "La respuesta tardó demasiado y no se aplicaron cambios."
        : code.includes("failed-precondition")
          ? "Diseñador AI todavía no está disponible en este entorno."
          : code.includes("invalid-argument")
            ? "No pude interpretar ese mensaje. Probá contándolo de otra manera."
           : code.includes("stale-snapshot")
              ? "La invitación cambió mientras respondía. Enviá el mensaje otra vez para tomar los datos actuales."
              : code.includes("evidence-missing")
                ? "El cambio se envió al editor, pero todavía no pude verificarlo en el borrador. Probá nuevamente."
                : "No pude procesar el mensaje. Probá nuevamente en unos instantes.";
  const details = error?.details && typeof error.details === "object"
    ? error.details
    : {};
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

async function waitForAppliedSnapshot({ initialSnapshot, actions, readSnapshot, isSessionCurrent, frameRegistry }) {
  const expectedName = [...actions]
    .reverse()
    .find((action) => action.type === "document.set_name")?.arguments?.name;
  let latest = readSnapshot();
  for (let frame = 0; frame < 120; frame += 1) {
    if (!isSessionCurrent()) return latest;
    const revisionChanged = latest.revision !== initialSnapshot.revision;
    const nameReflected = expectedName === undefined || latest.values.documentName === expectedName;
    const locationsReflected = actions
      .filter((action) => action.type === "event.set_location_text")
      .every((action) => {
        const phase = action.arguments.phase === "party" ? "party" : "ceremony";
        return latest.values?.[phase]?.venueName === action.arguments.venueName &&
          latest.values?.[phase]?.address === action.arguments.address &&
          latest.values?.[phase]?.placeSelected === false;
      });
    if (revisionChanged && nameReflected && locationsReflected) return latest;
    await waitOneEditorFrame(frameRegistry);
    latest = readSnapshot();
  }
  if (actions.some((action) => action.type === "event.set_location_text")) {
    throw Object.assign(new Error("La ubicación no quedó reflejada en el snapshot vigente."), {
      code: "designer-ai/evidence-missing",
    });
  }
  return latest;
}

function DesignerAiLocationDecision({ decision, onSearch, onUseManual }) {
  return (
    <section className="w-full min-w-0 rounded-xl border border-violet-200 bg-violet-50/60 p-3" aria-label={`Decidir ubicación de ${decision.label}`}>
      {decision.cancelled ? (
        <p className="mb-2 text-xs leading-relaxed text-slate-700">
          No se seleccionó un resultado de Google Maps. Podés volver a buscar o continuar con los datos escritos.
        </p>
      ) : null}
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => onSearch(decision)}
          className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        >
          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
          Buscar en Google Maps
        </button>
        <button
          type="button"
          onClick={() => onUseManual(decision)}
          className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-800 transition hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
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
      <DesignerAiLocationControl
        phase={request.phase}
        eventMode={controlState.eventMode}
        initialQuery={controlState.initialQuery}
        onCancel={onClose}
        onSelectionApplied={onSelectionApplied}
      />
    );
  }
  return (
    <section className="flex max-h-[min(28rem,65vh)] min-h-0 w-full min-w-0 flex-col rounded-xl border border-violet-200 bg-violet-50/45 p-2.5" aria-label="Selección para la invitación">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        {request.type === "gallery_cell_upload" && controlState.galleryIndex >= 0 ? (
          <p className="min-w-0 truncate text-xs font-semibold text-violet-900">
            Galería {controlState.galleryIndex + 1} de {controlState.galleryCount}
          </p>
        ) : <span />}
        <button
          type="button"
          onClick={onClose}
          disabled={controlState.finishing === true}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-violet-800 transition hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-wait disabled:text-violet-400"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Volver al chat
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg bg-white p-2">
        <MiniToolbarTabImagen
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
        <div className="mt-2 flex shrink-0 flex-col gap-2 border-t border-violet-100 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-relaxed text-slate-600" aria-live="polite">
            {controlState.galleryHasChanges
              ? "Los cambios realizados quedaron guardados."
              : "Podés conservar las fotos actuales o hacer los cambios que quieras."}
          </p>
          <button
            type="button"
            onClick={onGalleryComplete}
            disabled={controlState.finishing === true}
            className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-wait disabled:bg-violet-400 sm:w-auto"
          >
            {controlState.finishing === true ? "Guardando…" : "Terminé con esta galería"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default function DesignerAiPanel({
  sessionKey,
  contentVersion = 0,
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
  const [messages, setMessages] = useState([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [activeControl, setActiveControl] = useState(null);
  const [locationDecisions, setLocationDecisions] = useState([]);
  const [liveMessage, setLiveMessage] = useState("");
  const sessionKeyRef = useRef(sessionKey);
  const messagesRef = useRef([]);
  const sendingRef = useRef(false);
  const submitMessageRef = useRef(null);
  const messagesEndRef = useRef(null);
  const appliedBatchIdsRef = useRef(new Set());
  const requestSequenceRef = useRef(0);
  const conversationStateRef = useRef(normalizeDesignerAiConversationState(null));
  const activeControlRef = useRef(null);
  const controlVerificationRef = useRef(false);
  const pendingFramesRef = useRef(new Set());
  const autoStartedSessionRef = useRef("");
  const callable = useMemo(() => httpsCallable(functions, "designerAiChat"), []);

  const readSnapshot = useCallback(() => readDesignerAiCapabilitySnapshot(window, {
    conversationState: conversationStateRef.current,
  }), []);

  const persistConversationState = useCallback((state, {
    onPersisted = null,
    onPersistenceError = null,
  } = {}) => {
    const normalized = normalizeDesignerAiConversationState(state);
    conversationStateRef.current = normalized;
    requestDashboardDocumentNameUpdate({
      persist: true,
      source: "designer-ai-ledger",
      designerAiConversation: normalized,
      onPersisted,
      onPersistenceError,
    });
    return normalized;
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [activeControl, locationDecisions, messages, sending]);

  const submitMessage = useCallback(async (rawMessage, {
    showUserMessage = true,
    entryMode = "continuation",
    snapshotOverride = null,
    verifiedContinuation = false,
  } = {}) => {
    const message = String(rawMessage || "").trim();
    if (!message || sendingRef.current) return;
    const requestSessionKey = sessionKeyRef.current;
    const requestSequence = ++requestSequenceRef.current;
    const initialSnapshot = snapshotOverride || readSnapshot();
    const userMessage = createMessage("user", message);
    const conversationWithUser = showUserMessage
      ? appendSessionMessages(messagesRef.current, userMessage)
      : messagesRef.current;
    const recentTurns = conversationWithUser.map((turn) => ({ role: turn.role, content: turn.content }));
    if (showUserMessage) {
      messagesRef.current = conversationWithUser;
      setMessages(conversationWithUser);
    }
    setDraftMessage("");
    setActiveControl(null);
    activeControlRef.current = null;
    controlVerificationRef.current = false;
    setLocationDecisions([]);
    sendingRef.current = true;
    setSending(true);
    setLiveMessage("Preparando la invitación.");

    try {
      const response = await callable(buildDesignerAiCallablePayload({
        clientMessageId: userMessage.id,
        message,
        recentTurns,
        snapshot: initialSnapshot,
        entryMode,
      }));
      if (sessionKeyRef.current !== requestSessionKey || requestSequenceRef.current !== requestSequence) return;
      const result = response?.data;
      if (!isValidCallableResponse(result)) throw Object.assign(new Error("Respuesta inválida."), { code: "designer-ai/malformed-response" });
      if (appliedBatchIdsRef.current.has(result.batchId)) return;

      const currentSnapshot = readSnapshot();
      if (currentSnapshot.revision !== initialSnapshot.revision) throw Object.assign(new Error("El borrador cambió."), { code: "designer-ai/stale-snapshot" });
      const actionValidation = validateDesignerAiActionBatch(result.actions, { origin: DESIGNER_AI_ACTION_ORIGINS.MODEL, snapshot: currentSnapshot });
      const controlValidation = validateDesignerAiControlRequest(result.controlRequest, currentSnapshot);
      const resolutionValidation = validateDesignerAiResolutionUpdates(result.resolutions, currentSnapshot);
      if (!actionValidation.ok || !controlValidation.ok || !resolutionValidation.ok) {
        throw Object.assign(new Error([...actionValidation.errors, ...controlValidation.errors, ...resolutionValidation.errors].join(" ")), { code: "designer-ai/prevalidation-failed" });
      }

      appliedBatchIdsRef.current.add(result.batchId);
      const preliminaryState = reconcileDesignerAiConversationState({
        snapshot: currentSnapshot,
        previousState: conversationStateRef.current,
        actions: result.actions,
        resolutions: result.resolutions,
      });
      if (result.actions.length > 0) {
        await executeDesignerAiActionBatch(result.actions, {
          snapshot: currentSnapshot,
          targetWindow: window,
          isSessionCurrent: () => sessionKeyRef.current === requestSessionKey,
          designerAiConversation: preliminaryState,
        });
      }
      if (sessionKeyRef.current !== requestSessionKey) return;
      const reflectedSnapshot = result.actions.length > 0
        ? await waitForAppliedSnapshot({
            initialSnapshot: currentSnapshot,
            actions: result.actions,
            readSnapshot: () => readDesignerAiCapabilitySnapshot(window, { conversationState: preliminaryState }),
            isSessionCurrent: () => sessionKeyRef.current === requestSessionKey,
            frameRegistry: pendingFramesRef.current,
          })
        : currentSnapshot;
      if (sessionKeyRef.current !== requestSessionKey) return;
      const nextConversationState = reconcileDesignerAiConversationState({
        snapshot: reflectedSnapshot,
        previousState: preliminaryState,
        actions: result.actions,
        resolutions: result.resolutions,
      });
      persistConversationState(nextConversationState);
      const finalSnapshot = readDesignerAiCapabilitySnapshot(window, { conversationState: nextConversationState });
      const controlRequest = result.controlRequest || null;
      const controlState = controlRequest
        ? buildTrustedControlState(controlRequest, finalSnapshot)
        : null;
      activeControlRef.current = controlState;
      setActiveControl(controlState);
      setLocationDecisions(
        controlState ? [] : resolveDesignerAiLocationDecisions(result, finalSnapshot)
      );
      const assistantMessage = finalSnapshot.ledger.guidedFlow.completion.complete && result.intent !== "out_of_scope"
        ? COMPLETE_MESSAGE
        : result.assistantMessage;
      setMessages((current) => {
        const next = appendSessionMessages(current, createMessage("assistant", assistantMessage, { intent: result.intent }));
        messagesRef.current = next;
        return next;
      });
      setLiveMessage(assistantMessage);
    } catch (error) {
      if (sessionKeyRef.current !== requestSessionKey) return;
      const reflected = Array.isArray(error?.appliedActions) && error.appliedActions.length
        ? " Algunos cambios llegaron a reflejarse antes del error."
        : "";
      const safeMessage = verifiedContinuation
        ? VERIFIED_CONTINUATION_FALLBACK
        : `${normalizeCallableError(error)}${reflected}`;
      setMessages((current) => {
        const next = appendSessionMessages(current, createMessage("assistant", safeMessage, {
          intent: "error",
          canRetryContinuation: verifiedContinuation,
        }));
        messagesRef.current = next;
        return next;
      });
      setLiveMessage(safeMessage);
    } finally {
      if (sessionKeyRef.current === requestSessionKey && requestSequenceRef.current === requestSequence) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  }, [callable, persistConversationState, readSnapshot]);

  submitMessageRef.current = submitMessage;

  const startConversationIfReady = useCallback(() => {
    if (
      autoStartedSessionRef.current === sessionKeyRef.current ||
      sendingRef.current
    ) return false;
    const documentState = readDashboardDocumentNameState(window);
    if (documentState.hydrated !== true) return false;
    const entry = prepareDesignerAiConversationEntry(
      documentState.designerAiConversation
    );
    conversationStateRef.current = entry.requestState;
    const initialSnapshot = readDesignerAiCapabilitySnapshot(window, {
      conversationState: entry.requestState,
    });
    const startedState = reconcileDesignerAiConversationState({
      snapshot: initialSnapshot,
      previousState: entry.persistedState,
    });
    autoStartedSessionRef.current = sessionKeyRef.current;
    const requestSessionKey = sessionKeyRef.current;
    persistConversationState(startedState, {
      onPersisted: () => {
        if (sessionKeyRef.current !== requestSessionKey) return;
        void submitMessageRef.current?.(AUTO_START_MESSAGE, {
          showUserMessage: false,
          entryMode: entry.entryMode,
          snapshotOverride: initialSnapshot,
        });
      },
      onPersistenceError: () => {
        if (sessionKeyRef.current !== requestSessionKey) return;
        const safeMessage = "No pude iniciar Diseñador AI porque no se guardó el estado del borrador. Cerrá el panel y probá nuevamente.";
        setMessages((current) => {
          const next = appendSessionMessages(current, createMessage("assistant", safeMessage, { intent: "error" }));
          messagesRef.current = next;
          return next;
        });
        setLiveMessage(safeMessage);
      },
    });
    return true;
  }, [persistConversationState]);

  useEffect(() => {
    cancelPendingEditorFrames(pendingFramesRef.current);
    sessionKeyRef.current = sessionKey;
    requestSequenceRef.current += 1;
    appliedBatchIdsRef.current.clear();
    messagesRef.current = [];
    sendingRef.current = false;
    activeControlRef.current = null;
    controlVerificationRef.current = false;
    autoStartedSessionRef.current = "";
    conversationStateRef.current = normalizeDesignerAiConversationState(null);
    setMessages([]);
    setActiveControl(null);
    setLocationDecisions([]);
    setSending(false);
    setDraftMessage("");
    setLiveMessage("Preparando la conversación.");
    const timerId = window.setTimeout(() => {
      if (sessionKeyRef.current !== sessionKey) return;
      startConversationIfReady();
    }, 0);
    return () => {
      window.clearTimeout(timerId);
      cancelPendingEditorFrames(pendingFramesRef.current);
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

  const completeActiveControlIfReflected = useCallback(async ({
    wait = false,
    expectedLocation = null,
  } = {}) => {
    if (controlVerificationRef.current) return null;
    const controlState = activeControlRef.current;
    if (!controlState || sendingRef.current) return;
    if (controlState.request?.type === "gallery_cell_upload") return false;
    controlVerificationRef.current = true;
    let snapshot = readSnapshot();
    let completedLeafIds = [];
    const attempts = wait ? 120 : 1;
    for (let frame = 0; frame < attempts; frame += 1) {
      snapshot = readSnapshot();
      const request = controlState.request;
      if (request?.type === "google_place_picker" && expectedLocation?.googlePlaceId) {
        const feature = request.phase === "party"
          ? EVENT_DETAIL_FEATURES.PARTY
          : EVENT_DETAIL_FEATURES.CEREMONY;
        const persistedLocation = readEventLocationAuthoringState(window, feature);
        const selectionReflected = isDesignerAiGooglePlaceControlReflected({
          snapshot,
          persistedLocation,
          phase: request.phase,
          expectedLocation,
        });
        completedLeafIds = selectionReflected ? controlState.leafIds : [];
      } else {
        completedLeafIds = controlState.leafIds.filter(
          (leafId) => leafFingerprint(snapshot, leafId) !== controlState.baselineFingerprints[leafId]
        );
      }
      if (completedLeafIds.length > 0) break;
      if (!wait || sessionKeyRef.current !== sessionKey) break;
      await waitOneEditorFrame(pendingFramesRef.current);
    }
    if (completedLeafIds.length === 0) {
      controlVerificationRef.current = false;
      return false;
    }
    const nextState = reconcileDesignerAiConversationState({
      snapshot,
      previousState: conversationStateRef.current,
      controlLeafIds: completedLeafIds,
    });
    persistConversationState(nextState);
    const verifiedSnapshot = readDesignerAiCapabilitySnapshot(window, {
      conversationState: nextState,
    });
    activeControlRef.current = null;
    setActiveControl(null);
    setLocationDecisions([]);
    controlVerificationRef.current = false;
    void submitMessageRef.current?.(
      buildControlContinueMessage(completedLeafIds, verifiedSnapshot),
      {
        showUserMessage: false,
        snapshotOverride: verifiedSnapshot,
        verifiedContinuation: true,
      }
    );
    return true;
  }, [persistConversationState, readSnapshot, sessionKey]);

  useEffect(() => {
    refreshActiveGalleryChangeState();
    void completeActiveControlIfReflected();
  }, [completeActiveControlIfReflected, contentVersion, refreshActiveGalleryChangeState]);

  const finishActiveGallery = useCallback(() => {
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
        const next = appendSessionMessages(current, createMessage("assistant", safeMessage, { intent: "error" }));
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
          const next = appendSessionMessages(current, createMessage("assistant", safeMessage, { intent: "error" }));
          messagesRef.current = next;
          return next;
        });
        setLiveMessage(safeMessage);
      },
    });
    return true;
  }, [persistConversationState, readSnapshot]);

  const openLocationControl = useCallback((decision) => {
    const snapshot = readSnapshot();
    const controlState = buildDesignerAiGooglePlaceControlState(decision, snapshot);
    const validation = validateDesignerAiControlRequest(controlState.request, snapshot);
    if (!validation.ok) {
      const safeMessage = "No pude abrir la búsqueda para esa ubicación porque el estado del evento cambió. Probá nuevamente desde el chat.";
      setMessages((current) => {
        const next = appendSessionMessages(current, createMessage("assistant", safeMessage, { intent: "error" }));
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
        const next = appendSessionMessages(current, createMessage("assistant", safeMessage, { intent: "error" }));
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
      const next = appendSessionMessages(current, userChoice);
      messagesRef.current = next;
      return next;
    });
    setLocationDecisions((current) => current.filter(
      (item) => item.phase !== decision.phase
    ));
    const requestSessionKey = sessionKeyRef.current;
    persistConversationState(nextState, {
      onPersisted: () => {
        if (sessionKeyRef.current !== requestSessionKey) return;
        const verifiedSnapshot = readDesignerAiCapabilitySnapshot(window, {
          conversationState: nextState,
        });
        void submitMessageRef.current?.(
          buildControlContinueMessage([resolution.leafId], verifiedSnapshot),
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
        setLocationDecisions((current) => [
          decision,
          ...current.filter((item) => item.phase !== decision.phase),
        ]);
        const safeMessage = "No pude guardar la elección de ubicación manual. Probá nuevamente.";
        setMessages((current) => {
          const next = appendSessionMessages(current, createMessage("assistant", safeMessage, { intent: "error" }));
          messagesRef.current = next;
          return next;
        });
        setLiveMessage(safeMessage);
      },
    });
    return true;
  }, [persistConversationState, readSnapshot]);

  const closeTrustedControl = useCallback(() => {
    const controlState = activeControlRef.current;
    activeControlRef.current = null;
    controlVerificationRef.current = false;
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
  const retryVerifiedContinuation = useCallback((messageId) => {
    if (sendingRef.current || activeControlRef.current) return false;
    setMessages((current) => {
      const next = current.map((message) => message.id === messageId
        ? { ...message, canRetryContinuation: false }
        : message);
      messagesRef.current = next;
      return next;
    });
    const snapshot = readSnapshot();
    void submitMessage(
      buildControlContinueMessage([], snapshot),
      {
        showUserMessage: false,
        snapshotOverride: snapshot,
        verifiedContinuation: true,
      }
    );
    return true;
  }, [readSnapshot, submitMessage]);
  const imageProps = { abrirSelector, imagenes, imagenesEnProceso, cargarImagenes, borrarImagen, hayMas, cargando, seccionActivaId, setMostrarGaleria, setImagenesSeleccionadas };

  return (
    <section className="flex h-full max-h-full min-h-0 w-full flex-1 flex-col overflow-hidden" aria-label="Diseñador AI">
      <div className="min-h-0 flex-1 basis-0 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-2.5" role="log" aria-label="Conversación">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`max-w-[92%] rounded-xl px-3 py-2 text-xs leading-relaxed shadow-sm ${
              message.role === "user"
                ? "ml-auto bg-violet-700 text-white"
                : message.intent === "error"
                  ? "mr-auto border border-rose-200 bg-rose-50 text-rose-900"
                  : "mr-auto border border-slate-200 bg-white text-slate-800"
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
            {message.canRetryContinuation ? (
              <button
                type="button"
                onClick={() => retryVerifiedContinuation(message.id)}
                disabled={sending}
                className="mt-2 inline-flex min-h-10 items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-wait disabled:opacity-60"
              >
                Continuar recorrido
              </button>
            ) : null}
          </article>
        ))}
        {sending ? (
          <div className="mr-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Pensando…
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
        {!sending && activeControl ? (
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
        ) : null}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="mt-2 shrink-0 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_-8px_20px_rgba(15,23,42,0.04)]">
        <label htmlFor="designer-ai-message" className="sr-only">Mensaje para Diseñador AI</label>
        <div className="flex items-end gap-2">
          <textarea
            id="designer-ai-message"
            value={draftMessage}
            onChange={(event) => setDraftMessage(event.target.value.slice(0, 1200))}
            onKeyDown={handleComposerKeyDown}
            disabled={sending || Boolean(activeControl)}
            rows={3}
            placeholder="Contame los datos o cambios que quieran hacer."
            className="min-h-[76px] min-w-0 flex-1 resize-none rounded-lg border border-slate-300 px-2.5 py-2 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
          />
          <button type="submit" disabled={sending || Boolean(activeControl) || !draftMessage.trim()} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-violet-700 text-white transition hover:bg-violet-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:bg-slate-300" aria-label="Enviar mensaje">
            {sending
              ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              : <Send className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>

      </form>
      <p className="sr-only" aria-live="polite">{liveMessage}</p>
    </section>
  );
}
