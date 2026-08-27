import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Send, X } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import MiniToolbarTabDetallesEvento from "@/components/MiniToolbarTabDetallesEvento";
import MiniToolbarTabImagen from "@/components/MiniToolbarTabImagen";
import {
  DESIGNER_AI_ACTION_ORIGINS,
  DESIGNER_AI_CONTRACT_VERSION,
  validateDesignerAiActionBatch,
  validateDesignerAiControlRequest,
  validateDesignerAiResolutionUpdates,
} from "../../../../shared/designerAiCapabilityContract.js";
import {
  normalizeDesignerAiConversationState,
  reconcileDesignerAiConversationState,
} from "../../../../shared/designerAiConversationLedger.js";
import {
  buildDesignerAiCallablePayload,
  readDesignerAiCapabilitySnapshot,
} from "@/domain/editor/designerAiCapabilities";
import { executeDesignerAiActionBatch } from "@/domain/editor/designerAiActionExecutor";
import {
  readDashboardDocumentNameState,
  requestDashboardDocumentNameUpdate,
} from "@/lib/dashboardDocumentNameBridge";

const MAX_SESSION_MESSAGES = 6;
const AUTO_START_MESSAGE = "Iniciá la conversación con una bienvenida breve y guiame desde el primer bloque que todavía tenga información pendiente.";
const CONTROL_CONTINUE_MESSAGE = "La selección local ya quedó reflejada en el borrador. Confirmala brevemente y continuá desde las hojas que todavía estén pendientes.";
const COMPLETE_MESSAGE = "Listo, ya tenemos todo. La información de la invitación quedó preparada. Si después quieren cambiar algo, pueden volver por acá.";

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
  if (code.includes("permission-denied")) return "Tu sesión ya no tiene permiso para usar esta experiencia.";
  if (code.includes("resource-exhausted")) return "No pude responder por el momento. Probá de nuevo en unos minutos.";
  if (code.includes("deadline-exceeded")) return "La respuesta tardó demasiado y no se aplicaron cambios.";
  if (code.includes("failed-precondition")) return "Diseñador AI todavía no está disponible en este entorno.";
  if (code.includes("invalid-argument")) return "No pude interpretar ese mensaje. Probá contándolo de otra manera.";
  if (code.includes("stale-snapshot")) return "La invitación cambió mientras respondía. Enviá el mensaje otra vez para tomar los datos actuales.";
  return "No pude procesar el mensaje. Probá nuevamente en unos instantes.";
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
    const slotKey = String(request.cellId || request.cellIndex);
    return [`media.gallery.${request.galleryId}.slot.${slotKey}`];
  }
  return [];
}

function leafFingerprint(snapshot, leafId) {
  return snapshot?.ledger?.leaves?.find((leaf) => leaf.id === leafId)?.fingerprint || "";
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
    if (revisionChanged && nameReflected) return latest;
    await waitOneEditorFrame(frameRegistry);
    latest = readSnapshot();
  }
  return latest;
}

function DesignerAiTrustedControl({ request, onClose, imageProps }) {
  if (!request) return null;
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-violet-200 bg-violet-50/45 p-2.5" aria-label="Selección para la invitación">
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-violet-800 transition hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Volver al chat
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg bg-white p-2">
        {request.type === "google_place_picker" ? (
          <MiniToolbarTabDetallesEvento
            simplifiedForAssistant
            assistantSubstep={{ id: `designer-place-${request.phase}`, scope: "event-location" }}
          />
        ) : (
          <MiniToolbarTabImagen
            {...imageProps}
            simplifiedForAssistant
            assistantSubstep={
              request.type === "cover_upload"
                ? { id: "designer-cover", scope: "cover" }
                : { id: `designer-gallery-${request.galleryId}`, scope: "gallery", galleryId: request.galleryId }
            }
            canCreateGallery={false}
          />
        )}
      </div>
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
  const pendingFramesRef = useRef(new Set());
  const autoStartedSessionRef = useRef("");
  const callable = useMemo(() => httpsCallable(functions, "designerAiChat"), []);

  const readSnapshot = useCallback(() => readDesignerAiCapabilitySnapshot(window, {
    conversationState: conversationStateRef.current,
  }), []);

  const persistConversationState = useCallback((state) => {
    const normalized = normalizeDesignerAiConversationState(state);
    conversationStateRef.current = normalized;
    requestDashboardDocumentNameUpdate({
      persist: true,
      source: "designer-ai-ledger",
      designerAiConversation: normalized,
    });
    return normalized;
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [messages, sending]);

  const submitMessage = useCallback(async (rawMessage, { showUserMessage = true } = {}) => {
    const message = String(rawMessage || "").trim();
    if (!message || sendingRef.current) return;
    const requestSessionKey = sessionKeyRef.current;
    const requestSequence = ++requestSequenceRef.current;
    const initialSnapshot = readSnapshot();
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
    sendingRef.current = true;
    setSending(true);
    setLiveMessage("Preparando la invitación.");

    try {
      const response = await callable(buildDesignerAiCallablePayload({
        clientMessageId: userMessage.id,
        message,
        recentTurns,
        snapshot: initialSnapshot,
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
        ? {
            request: controlRequest,
            leafIds: resolveControlLeafIds(controlRequest),
            baselineFingerprints: Object.fromEntries(
              resolveControlLeafIds(controlRequest).map((leafId) => [leafId, leafFingerprint(finalSnapshot, leafId)])
            ),
          }
        : null;
      activeControlRef.current = controlState;
      setActiveControl(controlState);
      const assistantMessage = finalSnapshot.ledger.completion.complete && result.intent !== "out_of_scope"
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
      const safeMessage = `${normalizeCallableError(error)}${reflected}`;
      setMessages((current) => {
        const next = appendSessionMessages(current, createMessage("assistant", safeMessage, { intent: "error" }));
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
    conversationStateRef.current = normalizeDesignerAiConversationState(
      documentState.designerAiConversation
    );
    const initialSnapshot = readDesignerAiCapabilitySnapshot(window, {
      conversationState: conversationStateRef.current,
    });
    persistConversationState(reconcileDesignerAiConversationState({
      snapshot: initialSnapshot,
      previousState: conversationStateRef.current,
    }));
    autoStartedSessionRef.current = sessionKeyRef.current;
    void submitMessageRef.current?.(AUTO_START_MESSAGE, { showUserMessage: false });
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
    autoStartedSessionRef.current = "";
    conversationStateRef.current = normalizeDesignerAiConversationState(null);
    setMessages([]);
    setActiveControl(null);
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

  useEffect(() => {
    const controlState = activeControlRef.current;
    if (!controlState || sendingRef.current) return;
    const snapshot = readSnapshot();
    const completedLeafIds = controlState.leafIds.filter(
      (leafId) => leafFingerprint(snapshot, leafId) !== controlState.baselineFingerprints[leafId]
    );
    if (completedLeafIds.length === 0) return;
    const nextState = reconcileDesignerAiConversationState({
      snapshot,
      previousState: conversationStateRef.current,
      controlLeafIds: completedLeafIds,
    });
    persistConversationState(nextState);
    activeControlRef.current = null;
    setActiveControl(null);
    void submitMessageRef.current?.(CONTROL_CONTINUE_MESSAGE, { showUserMessage: false });
  }, [contentVersion, persistConversationState, readSnapshot]);

  const handleSubmit = (event) => {
    event.preventDefault();
    void submitMessage(draftMessage);
  };
  const handleComposerKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void submitMessage(draftMessage);
  };
  const imageProps = { abrirSelector, imagenes, imagenesEnProceso, cargarImagenes, borrarImagen, hayMas, cargando, seccionActivaId, setMostrarGaleria, setImagenesSeleccionadas };

  if (activeControl) {
    return (
      <DesignerAiTrustedControl
        request={activeControl.request}
        onClose={() => {
          activeControlRef.current = null;
          setActiveControl(null);
        }}
        imageProps={imageProps}
      />
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Diseñador AI">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-2.5" role="log" aria-label="Conversación">
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
          </article>
        ))}
        {sending ? (
          <div className="mr-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Pensando…
          </div>
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
            disabled={sending}
            rows={3}
            placeholder="Contame los datos o cambios que quieran hacer."
            className="min-h-[76px] min-w-0 flex-1 resize-none rounded-lg border border-slate-300 px-2.5 py-2 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
          />
          <button type="submit" disabled={sending || !draftMessage.trim()} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-violet-700 text-white transition hover:bg-violet-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:bg-slate-300" aria-label="Enviar mensaje">
            {sending
              ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              : <Send className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-slate-500">Enter envía; Shift+Enter agrega una línea. El chat se borra al cambiar de borrador.</p>
      </form>
      <p className="sr-only" aria-live="polite">{liveMessage}</p>
    </section>
  );
}
