import { useEffect, useMemo, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { AlertCircle, CheckCircle2, Circle, Loader2, RefreshCw, X } from "lucide-react";
import { functions as cloudFunctions } from "@/firebase";
import PublicationSuccessState from "@/components/payments/PublicationSuccessState";
import {
  buildPublishFailureUserMessage,
  buildCheckoutModalContextKey,
  isProcessingCheckoutStatus,
  isPublishedCheckoutStatus,
  isRetryablePublishFailureStatusPayload,
  resolveCheckoutModalInitialization,
  resolvePublishingProgressState,
  resolveTerminalPublicationResult,
} from "@/domain/payments/publicationCheckoutState";
import {
  PUBLIC_SLUG_AVAILABILITY_REASONS,
  parseSlugFromPublicUrl,
  validatePublicSlug,
} from "@/lib/publicSlug";

let mercadoPagoSdkPromise = null;

function loadMercadoPagoSdk() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Mercado Pago solo disponible en navegador"));
  }
  if (window.MercadoPago) {
    return Promise.resolve(window.MercadoPago);
  }
  if (mercadoPagoSdkPromise) {
    return mercadoPagoSdkPromise;
  }

  mercadoPagoSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-sdk="mercadopago-v2"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.MercadoPago), { once: true });
      existing.addEventListener("error", () => reject(new Error("No se pudo cargar Mercado Pago SDK")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.dataset.sdk = "mercadopago-v2";
    script.onload = () => resolve(window.MercadoPago);
    script.onerror = () => reject(new Error("No se pudo cargar Mercado Pago SDK"));
    document.body.appendChild(script);
  });

  return mercadoPagoSdkPromise;
}

function getReasonMessage(reason) {
  switch (reason) {
    case PUBLIC_SLUG_AVAILABILITY_REASONS.INVALID_FORMAT:
      return "El enlace personalizado debe tener entre 2 y 60 caracteres y usar solo letras, numeros, guion o guion bajo.";
    case PUBLIC_SLUG_AVAILABILITY_REASONS.RESERVED_WORD:
      return "Ese enlace no esta disponible. Prueba con otro.";
    case PUBLIC_SLUG_AVAILABILITY_REASONS.ALREADY_PUBLISHED:
      return "Ese enlace ya esta en uso.";
    case PUBLIC_SLUG_AVAILABILITY_REASONS.TEMPORARILY_RESERVED:
      return "Ese enlace esta temporalmente reservado por otro checkout activo.";
    default:
      return "";
  }
}

function parseErrorMessage(error, fallback) {
  const rawMessage = error?.message || error?.details?.message || error?.details || "";
  const message = typeof rawMessage === "string" ? rawMessage.trim() : "";
  if (message === "No payment type was selected") {
    return "Selecciona un medio de pago para continuar.";
  }
  if (message === "renderer-timeout" || /renderer-timeout/i.test(message)) {
    return "No pudimos generar la imagen para compartir en este intento. Tu pago quedo aprobado y la publicacion no se marco como publicada.";
  }
  return message || fallback;
}

function asNonEmptyString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function formatArs(amount) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
}

function isCheckoutDebugEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search || "");
    const queryFlag = String(params.get("checkoutDebug") || "").trim().toLowerCase();
    if (queryFlag === "1" || queryFlag === "true") return true;

    const storageFlag = String(window.localStorage?.getItem("checkoutDebug") || "")
      .trim()
      .toLowerCase();
    return storageFlag === "1" || storageFlag === "true";
  } catch {
    return false;
  }
}

function PublicationProgressList({ progress }) {
  if (!progress?.hasProgress) return null;

  return (
    <div className="rounded-lg border border-[#d8ccea] bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        Publicacion en curso
      </p>
      <div className="mt-3 space-y-2">
        {progress.steps.map((step) => {
          const isRunning = step.status === "running";
          const isCompleted = step.status === "completed";
          const isFailed = step.status === "failed";
          const Icon = isFailed
            ? AlertCircle
            : isCompleted
              ? CheckCircle2
              : isRunning
                ? Loader2
                : Circle;
          const colorClass = isFailed
            ? "text-red-600"
            : isCompleted
              ? "text-emerald-700"
              : isRunning
                ? "text-[#6f3bc0]"
                : "text-slate-400";

          return (
            <div key={step.key} className={`flex items-center gap-2 text-xs ${colorClass}`}>
              <Icon className={`h-3.5 w-3.5 shrink-0 ${isRunning ? "animate-spin" : ""}`} />
              <span className="min-w-0">
                {step.label}
                {progress.currentStage?.key === step.key && progress.currentStage?.substage?.label ? (
                  <span className="block text-[11px] text-slate-500">
                    {progress.currentStage.substage.label}
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PublicationDebugDetails({ sessionId, progress, diagnostics }) {
  const currentStage = progress?.currentStage || null;
  const substage = currentStage?.substage || null;
  const hasDetails =
    Boolean(sessionId) ||
    Boolean(currentStage?.key) ||
    Boolean(substage?.key) ||
    Boolean(diagnostics && Object.keys(diagnostics).length);

  if (!hasDetails) return null;

  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
      <summary className="cursor-pointer font-semibold text-slate-800">Detalles tecnicos</summary>
      <dl className="mt-2 grid gap-1">
        {sessionId ? (
          <div>
            <dt className="font-semibold">sessionId</dt>
            <dd className="break-all">{sessionId}</dd>
          </div>
        ) : null}
        {currentStage?.key ? (
          <div>
            <dt className="font-semibold">stage</dt>
            <dd>{currentStage.key}</dd>
          </div>
        ) : null}
        {substage?.key ? (
          <div>
            <dt className="font-semibold">substage</dt>
            <dd>{substage.key}</dd>
          </div>
        ) : null}
        {substage?.errorCode || currentStage?.errorCode ? (
          <div>
            <dt className="font-semibold">errorCode</dt>
            <dd>{substage?.errorCode || currentStage?.errorCode}</dd>
          </div>
        ) : null}
        {diagnostics && Object.keys(diagnostics).length ? (
          <div>
            <dt className="font-semibold">diagnostics</dt>
            <dd>
              <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-[11px]">
                {JSON.stringify(diagnostics, null, 2)}
              </pre>
            </dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}

export default function PublicationCheckoutModal({
  visible,
  onClose,
  draftSlug,
  operation = "new",
  currentPublicSlug = "",
  currentPublicUrl = "",
  onPublished,
}) {
  const [slugInput, setSlugInput] = useState("");
  const [slugValidation, setSlugValidation] = useState({
    normalizedSlug: "",
    isValid: false,
    isAvailable: false,
    reason: "",
    checking: false,
  });
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutInfo, setCheckoutInfo] = useState("");
  const [sessionData, setSessionData] = useState(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [paying, setPaying] = useState(false);
  const [pollingStatus, setPollingStatus] = useState(false);
  const [discountCodeInput, setDiscountCodeInput] = useState("");
  const [hasApprovedSlugConflict, setHasApprovedSlugConflict] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [publishedUrl, setPublishedUrl] = useState("");
  const [copiedPublicUrl, setCopiedPublicUrl] = useState(false);
  const [conflictSlugInput, setConflictSlugInput] = useState("");
  const [conflictValidation, setConflictValidation] = useState({
    normalizedSlug: "",
    isValid: false,
    isAvailable: false,
    reason: "",
    checking: false,
  });
  const [retryingConflict, setRetryingConflict] = useState(false);
  const [publishingProgress, setPublishingProgress] = useState(null);
  const [publishingDiagnostics, setPublishingDiagnostics] = useState(null);
  const [hasRetryablePublishFailure, setHasRetryablePublishFailure] = useState(false);
  const [retryingPublish, setRetryingPublish] = useState(false);

  const checkoutDebugEnabled = useMemo(() => isCheckoutDebugEnabled(), [visible]);
  const logCheckoutDebug = (event, payload = {}) => {
    if (!checkoutDebugEnabled) return;
    try {
      console.log("[checkout-debug]", {
        event,
        ts: new Date().toISOString(),
        ...payload,
      });
    } catch (_error) {
      // noop
    }
  };

  const brickControllerRef = useRef(null);
  const pollTimerRef = useRef(null);
  const notifiedPublishRef = useRef(false);
  const onPublishedRef = useRef(onPublished);
  const modalInitializationRef = useRef({
    visible: false,
    contextKey: "",
  });

  useEffect(() => {
    onPublishedRef.current = onPublished;
  }, [onPublished]);

  const isNewOperation = operation === "new";
  const checkoutContextKey = useMemo(
    () => buildCheckoutModalContextKey({ draftSlug, operation }),
    [draftSlug, operation]
  );
  const effectiveCurrentSlug = useMemo(
    () => currentPublicSlug || parseSlugFromPublicUrl(currentPublicUrl) || "",
    [currentPublicSlug, currentPublicUrl]
  );

  const normalizedDiscountCode = useMemo(
    () => String(discountCodeInput || "").trim().toUpperCase(),
    [discountCodeInput]
  );

  const hasSessionAmounts = Boolean(sessionData?.sessionId);
  const summaryBaseAmount = Number(sessionData?.amountBaseArs ?? 0);
  const summaryDiscountAmount = Number(sessionData?.discountAmountArs ?? 0);
  const summaryFinalAmount = Number(
    sessionData?.amountArs ?? Math.max(0, summaryBaseAmount - summaryDiscountAmount)
  );

  const amountLabel = hasSessionAmounts ? formatArs(summaryFinalAmount) : "";
  const amountBaseLabel = hasSessionAmounts ? formatArs(summaryBaseAmount) : "";
  const discountAmountLabel = hasSessionAmounts ? formatArs(summaryDiscountAmount) : "";
  const hasAppliedDiscount = summaryDiscountAmount > 0;

  const isReadyToCreateSession = isNewOperation
    ? slugValidation.isValid && slugValidation.isAvailable && !slugValidation.checking
    : Boolean(effectiveCurrentSlug);

  const isReadyToRetryConflict = conflictValidation.isValid && conflictValidation.isAvailable;

  const checkSlugAvailabilityCallable = useMemo(
    () => httpsCallable(cloudFunctions, "checkPublicSlugAvailability"),
    []
  );
  const createSessionCallable = useMemo(
    () => httpsCallable(cloudFunctions, "createPublicationCheckoutSession"),
    []
  );
  const createPaymentCallable = useMemo(
    () => httpsCallable(cloudFunctions, "createPublicationPayment"),
    []
  );
  const getStatusCallable = useMemo(
    () => httpsCallable(cloudFunctions, "getPublicationCheckoutStatus"),
    []
  );
  const retryConflictCallable = useMemo(
    () => httpsCallable(cloudFunctions, "retryPaidPublicationWithNewSlug"),
    []
  );
  const publishApprovedSessionCallable = useMemo(
    () => httpsCallable(cloudFunctions, "publicarInvitacion"),
    []
  );

  const clearPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPollingStatus(false);
  };

  const unmountBrick = async () => {
    if (!brickControllerRef.current) return;
    try {
      await brickControllerRef.current.unmount();
    } catch (_error) {
      // noop
    } finally {
      brickControllerRef.current = null;
    }
  };

  const resetState = () => {
    clearPolling();
    unmountBrick();
    setCheckoutError("");
    setCheckoutInfo("");
    setSessionData(null);
    setCreatingSession(false);
    setPaying(false);
    setDiscountCodeInput("");
    setHasApprovedSlugConflict(false);
    setReceipt(null);
    setPublishedUrl("");
    setCopiedPublicUrl(false);
    setConflictSlugInput("");
    setRetryingConflict(false);
    setPublishingProgress(null);
    setPublishingDiagnostics(null);
    setHasRetryablePublishFailure(false);
    setRetryingPublish(false);
    notifiedPublishRef.current = false;
    setSlugValidation({ normalizedSlug: "", isValid: false, isAvailable: false, reason: "", checking: false });
    setConflictValidation({ normalizedSlug: "", isValid: false, isAvailable: false, reason: "", checking: false });
  };

  const notifyPublished = ({ url, slug, receiptData }) => {
    if (notifiedPublishRef.current) return;
    notifiedPublishRef.current = true;
    onPublishedRef.current?.({
      publicUrl: url,
      publicSlug: slug,
      operation,
      receipt: receiptData || null,
    });
  };

  const handleClose = () => {
    logCheckoutDebug("checkout:close", {
      sessionId: sessionData?.sessionId || null,
      status: sessionData?.status || null,
      receiptPaymentId: receipt?.paymentId || null,
    });
    resetState();
    onClose?.();
  };

  const successPublicUrl = asNonEmptyString(publishedUrl) || asNonEmptyString(receipt?.publicUrl);

  const handleCopyPublicUrl = async () => {
    if (!successPublicUrl) return;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(successPublicUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = successPublicUrl;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setCopiedPublicUrl(true);
      setCheckoutError("");
    } catch (_error) {
      setCheckoutError("No se pudo copiar el enlace. Copialo manualmente.");
    }
  };

  const applyTerminalPublishResult = ({ url, receiptData, slug }) => {
    const terminalResult = resolveTerminalPublicationResult({
      publicUrl: url,
      publicSlug: slug,
      receiptData,
      operation,
    });

    if (!terminalResult.publicUrl) {
      setCheckoutInfo("");
      setCheckoutError(
        "La publicacion se completo, pero no recibimos el enlace final. Actualiza la pagina para ver el estado publicado."
      );
      return;
    }

    setHasApprovedSlugConflict(false);
    setHasRetryablePublishFailure(false);
    setPublishedUrl(terminalResult.publicUrl);
    setReceipt(terminalResult.receipt);
    setCheckoutInfo("Pago aprobado y publicacion completada.");
    setCheckoutError("");
    setPublishingProgress(null);
    setPublishingDiagnostics(null);
    clearPolling();
    logCheckoutDebug("checkout:published", {
      sessionId: sessionData?.sessionId || null,
      publicUrl: terminalResult.publicUrl,
      publicSlug: terminalResult.publicSlug || null,
      paymentId: terminalResult.receipt?.paymentId || null,
    });
    notifyPublished({
      url: terminalResult.publicUrl,
      slug: terminalResult.publicSlug,
      receiptData: terminalResult.receipt,
    });
  };

  useEffect(() => {
    if (!copiedPublicUrl) return undefined;
    const timer = setTimeout(() => setCopiedPublicUrl(false), 2000);
    return () => clearTimeout(timer);
  }, [copiedPublicUrl]);

  const applyCheckoutStatus = (statusPayload) => {
    const status = String(statusPayload?.sessionStatus || "").trim();
    logCheckoutDebug("status:apply", {
      sessionId: sessionData?.sessionId || null,
      sessionStatus: status || null,
      paymentId: statusPayload?.receipt?.paymentId || null,
      publicUrl: statusPayload?.publicUrl || null,
      errorMessage: statusPayload?.errorMessage || null,
      publishingStage: statusPayload?.publishingStage?.key || null,
      publishingSubstage:
        statusPayload?.publishingStage?.substage?.key ||
        statusPayload?.publishingShareImageSubstage?.key ||
        null,
    });

    const progress = resolvePublishingProgressState(statusPayload);
    setPublishingProgress(progress.hasProgress ? progress : null);
    setPublishingDiagnostics(statusPayload?.publishingShareImageDiagnostics || null);

    if (isRetryablePublishFailureStatusPayload(statusPayload)) {
      setHasRetryablePublishFailure(true);
      setCheckoutError(buildPublishFailureUserMessage(statusPayload));
      setCheckoutInfo("");
      clearPolling();
      return;
    }

    if (isPublishedCheckoutStatus(status)) {
      applyTerminalPublishResult({
        url: String(statusPayload?.publicUrl || "").trim(),
        receiptData: statusPayload?.receipt || null,
      });
      clearPolling();
      return;
    }

    if (status === "approved_slug_conflict") {
      setHasRetryablePublishFailure(false);
      setHasApprovedSlugConflict(true);
      setCheckoutError("");
      setCheckoutInfo("El pago fue aprobado, pero el enlace elegido entro en conflicto. Elegi uno nuevo para finalizar.");
      clearPolling();
      return;
    }

    if (status === "payment_rejected") {
      setHasRetryablePublishFailure(false);
      setCheckoutError(statusPayload?.errorMessage || "El pago fue rechazado. Intenta con otro medio.");
      setCheckoutInfo("");
      clearPolling();
      return;
    }

    if (status === "expired") {
      setHasRetryablePublishFailure(false);
      setCheckoutError(statusPayload?.errorMessage || "La sesion de pago expiro. Inicia una nueva.");
      setCheckoutInfo("");
      clearPolling();
      return;
    }

    if (isProcessingCheckoutStatus(status)) {
      setHasRetryablePublishFailure(false);
      setCheckoutInfo(
        progress.currentStage?.label ||
          "Estamos confirmando tu pago. Esto puede tardar unos segundos."
      );
      setCheckoutError("");
    }
  };

  const refreshCheckoutStatus = async (sessionId) => {
    if (!sessionId) return null;
    try {
      const result = await getStatusCallable({ sessionId });
      const payload = result?.data || {};
      applyCheckoutStatus(payload);
      return payload;
    } catch (error) {
      logCheckoutDebug("status:refresh:error", {
        sessionId,
        message: parseErrorMessage(error, "No se pudo verificar el estado del pago."),
      });
      return null;
    }
  };

  const startPollingStatus = (sessionId) => {
    if (!sessionId || pollTimerRef.current) return;
    logCheckoutDebug("statusPolling:start", { sessionId });
    setPollingStatus(true);

    pollTimerRef.current = setInterval(async () => {
      try {
        const result = await getStatusCallable({ sessionId });
        const payload = result?.data || {};
        logCheckoutDebug("statusPolling:tick", {
          sessionId,
          sessionStatus: payload?.sessionStatus || null,
          paymentId: payload?.receipt?.paymentId || null,
        });
        applyCheckoutStatus(payload);
      } catch (error) {
        const message = parseErrorMessage(error, "No se pudo verificar el estado del pago.");
        setCheckoutError(message);
        logCheckoutDebug("statusPolling:error", {
          sessionId,
          message,
        });
      }
    }, 1800);
  };

  const checkSlugAvailability = async ({ value, setState }) => {
    const localValidation = validatePublicSlug(value);
    if (!localValidation.normalizedSlug) {
      setState({ normalizedSlug: "", isValid: false, isAvailable: false, reason: "", checking: false });
      return;
    }

    if (!localValidation.isValid) {
      setState({
        normalizedSlug: localValidation.normalizedSlug,
        isValid: false,
        isAvailable: false,
        reason: localValidation.reason,
        checking: false,
      });
      return;
    }

    setState((prev) => ({ ...prev, normalizedSlug: localValidation.normalizedSlug, isValid: true, checking: true, reason: "" }));

    try {
      const result = await checkSlugAvailabilityCallable({
        draftSlug,
        candidateSlug: localValidation.normalizedSlug,
      });

      const payload = result?.data || {};
      setState({
        normalizedSlug: String(payload.normalizedSlug || localValidation.normalizedSlug),
        isValid: Boolean(payload.isValid),
        isAvailable: Boolean(payload.isAvailable),
        reason: String(payload.reason || ""),
        checking: false,
      });
    } catch (error) {
      setState({
        normalizedSlug: localValidation.normalizedSlug,
        isValid: true,
        isAvailable: false,
        reason: "",
        checking: false,
      });
      setCheckoutError(parseErrorMessage(error, "No se pudo verificar el enlace."));
    }
  };

  const invalidateCurrentSession = () => {
    clearPolling();
    unmountBrick();
    setSessionData(null);
    setHasApprovedSlugConflict(false);
    setPublishingProgress(null);
    setPublishingDiagnostics(null);
    setHasRetryablePublishFailure(false);
    setRetryingPublish(false);
    setCheckoutInfo("");
    setCheckoutError("");
  };

  const handleCreateSession = async () => {
    if (!draftSlug || creatingSession || receipt || hasApprovedSlugConflict) return;
    setCreatingSession(true);
    setCheckoutError("");
    setCheckoutInfo("");

    try {
      const payload =
        operation === "new"
          ? {
              draftSlug,
              operation: "new",
              requestedPublicSlug: slugValidation.normalizedSlug,
              discountCode: normalizedDiscountCode || undefined,
            }
          : {
              draftSlug,
              operation: "update",
              discountCode: normalizedDiscountCode || undefined,
            };

      logCheckoutDebug("createSession:start", {
        draftSlug,
        operation,
        requestedPublicSlug: operation === "new" ? slugValidation.normalizedSlug || null : null,
        discountCode: normalizedDiscountCode || null,
      });

      const result = await createSessionCallable(payload);
      const data = result?.data || {};
      setSessionData(data);
      setHasApprovedSlugConflict(false);
      logCheckoutDebug("createSession:result", {
        sessionId: data?.sessionId || null,
        operation: data?.operation || operation,
        publicSlug: data?.publicSlug || null,
        amountBaseArs: data?.amountBaseArs ?? null,
        discountAmountArs: data?.discountAmountArs ?? null,
        amountArs: data?.amountArs ?? null,
      });

      if (Number(data?.amountArs || 0) <= 0) {
        setCheckoutInfo("Descuento total aplicado. Confirmando publicacion...");
        setPaying(true);
        try {
          const autoPaymentPromise = createPaymentCallable({
            sessionId: data.sessionId,
            brickData: {},
          });
          startPollingStatus(data.sessionId);
          const autoResult = await autoPaymentPromise;
          const payload = autoResult?.data || {};
          logCheckoutDebug("createPayment:autoDiscount", {
            sessionId: data?.sessionId || null,
            sessionStatus: payload?.sessionStatus || null,
            paymentId: payload?.paymentId || null,
            publicUrl: payload?.publicUrl || null,
          });

          if (isPublishedCheckoutStatus(payload?.sessionStatus)) {
            applyTerminalPublishResult({
              url: String(payload?.publicUrl || ""),
              receiptData: payload?.receipt || null,
              slug: payload?.receipt?.publicSlug || data?.publicSlug,
            });
          } else if (payload?.sessionStatus === "approved_slug_conflict") {
            setHasApprovedSlugConflict(true);
            setCheckoutInfo(payload?.message || "Descuento aplicado. El enlace elegido entro en conflicto. Elegi uno nuevo para terminar.");
          } else if (payload?.sessionStatus === "payment_processing") {
            setCheckoutInfo(payload?.message || "Confirmando publicacion...");
            startPollingStatus(data.sessionId);
          } else if (payload?.sessionStatus === "expired") {
            setCheckoutError(payload?.errorMessage || "La sesion expiro.");
          } else if (payload?.sessionStatus === "payment_rejected") {
            setCheckoutError(payload?.errorMessage || "No se pudo completar la publicacion.");
          } else {
            setCheckoutInfo("Estamos confirmando la publicacion.");
            startPollingStatus(data.sessionId);
          }
        } catch (error) {
          const message = parseErrorMessage(error, "No se pudo completar la publicacion.");
          const statusPayload = await refreshCheckoutStatus(data.sessionId);
          if (!isRetryablePublishFailureStatusPayload(statusPayload || {})) {
            setCheckoutError(message);
          }
          logCheckoutDebug("createPayment:autoDiscount:error", {
            sessionId: data?.sessionId || null,
            message,
          });
        } finally {
          setPaying(false);
        }
      } else {
        setCheckoutInfo("Datos listos. Completa el pago para publicar.");
      }
    } catch (error) {
      const message = parseErrorMessage(error, "No se pudo iniciar el checkout.");
      setCheckoutError(message);
      logCheckoutDebug("createSession:error", {
        draftSlug,
        operation,
        message,
      });
    } finally {
      setCreatingSession(false);
    }
  };

  const submitPayment = async (rawBrickData) => {
    if (!sessionData?.sessionId) return;

    setPaying(true);
    setCheckoutError("");
    setCheckoutInfo("");

    try {
      const brickData = rawBrickData?.formData || rawBrickData || {};
      const paymentMethodId =
        asNonEmptyString(brickData?.payment_method_id) ||
        asNonEmptyString(rawBrickData?.payment_method_id) ||
        asNonEmptyString(brickData?.paymentMethodId) ||
        asNonEmptyString(rawBrickData?.paymentMethodId) ||
        asNonEmptyString(brickData?.selectedPaymentMethod?.id) ||
        asNonEmptyString(brickData?.selectedPaymentMethod) ||
        asNonEmptyString(rawBrickData?.selectedPaymentMethod?.id) ||
        asNonEmptyString(rawBrickData?.selectedPaymentMethod);

      if (!paymentMethodId) {
        throw new Error("Selecciona un medio de pago y completa sus datos.");
      }

      logCheckoutDebug("createPayment:submit", {
        sessionId: sessionData?.sessionId || null,
        paymentMethodId,
        installments: Number(brickData?.installments) || null,
      });

      const normalizedBrickData = {
        ...(rawBrickData || {}),
        ...brickData,
        payment_method_id: paymentMethodId,
      };

      const paymentPromise = createPaymentCallable({
        sessionId: sessionData.sessionId,
        brickData: normalizedBrickData,
      });
      startPollingStatus(sessionData.sessionId);
      const result = await paymentPromise;
      const payload = result?.data || {};
      logCheckoutDebug("createPayment:result", {
        sessionId: sessionData?.sessionId || null,
        sessionStatus: payload?.sessionStatus || null,
        paymentId: payload?.paymentId || null,
        publicUrl: payload?.publicUrl || null,
      });

      if (isPublishedCheckoutStatus(payload?.sessionStatus)) {
        applyTerminalPublishResult({
          url: String(payload?.publicUrl || ""),
          receiptData: payload?.receipt || null,
          slug: payload?.receipt?.publicSlug || sessionData?.publicSlug,
        });
      } else if (payload?.sessionStatus === "approved_slug_conflict") {
        setHasApprovedSlugConflict(true);
        setCheckoutInfo(payload?.message || "Pago aprobado. El enlace elegido entro en conflicto. Elegi uno nuevo para terminar.");
      } else if (payload?.sessionStatus === "payment_rejected") {
        setCheckoutError(payload?.errorMessage || "El pago fue rechazado.");
      } else if (payload?.sessionStatus === "payment_processing") {
        setCheckoutInfo(payload?.message || "Procesando pago...");
        startPollingStatus(sessionData.sessionId);
      } else if (payload?.sessionStatus === "expired") {
        setCheckoutError(payload?.errorMessage || "La sesion expiro.");
      } else {
        setCheckoutInfo("Estamos confirmando el pago.");
        startPollingStatus(sessionData.sessionId);
      }
    } catch (error) {
      const message = parseErrorMessage(error, "No se pudo procesar el pago.");
      const statusPayload = await refreshCheckoutStatus(sessionData.sessionId);
      if (!isRetryablePublishFailureStatusPayload(statusPayload || {})) {
        setCheckoutError(message);
      }
      logCheckoutDebug("createPayment:error", {
        sessionId: sessionData?.sessionId || null,
        message,
      });
    } finally {
      setPaying(false);
    }
  };

  const handleRetryWithNewSlug = async () => {
    if (!sessionData?.sessionId || !isReadyToRetryConflict || retryingConflict) return;

    setRetryingConflict(true);
    setCheckoutError("");

    try {
      logCheckoutDebug("retryConflict:start", {
        sessionId: sessionData?.sessionId || null,
        requestedSlug: conflictValidation.normalizedSlug || null,
      });
      const retryPromise = retryConflictCallable({
        sessionId: sessionData.sessionId,
        newPublicSlug: conflictValidation.normalizedSlug,
      });
      startPollingStatus(sessionData.sessionId);
      const result = await retryPromise;
      const data = result?.data || {};
      logCheckoutDebug("retryConflict:result", {
        sessionId: sessionData?.sessionId || null,
        sessionStatus: data?.sessionStatus || null,
        publicUrl: data?.publicUrl || null,
      });

      if (isPublishedCheckoutStatus(data?.sessionStatus)) {
        setHasApprovedSlugConflict(false);
        const finalUrl = String(data?.publicUrl || "").trim();
        const receiptData = {
          ...(receipt || {}),
          operation,
          amountArs: Number(sessionData?.amountArs || 0),
          currency: "ARS",
          publicSlug: conflictValidation.normalizedSlug,
          publicUrl: finalUrl || null,
          approvedAt: (receipt && receipt.approvedAt) || new Date().toISOString(),
        };

        applyTerminalPublishResult({
          url: finalUrl,
          receiptData,
          slug: conflictValidation.normalizedSlug,
        });
      } else {
        setCheckoutInfo(data?.message || "No se pudo completar con ese enlace. Intenta con uno diferente.");
      }
    } catch (error) {
      const message = parseErrorMessage(error, "No se pudo completar la publicacion.");
      const statusPayload = await refreshCheckoutStatus(sessionData.sessionId);
      if (!isRetryablePublishFailureStatusPayload(statusPayload || {})) {
        setCheckoutError(message);
      }
      logCheckoutDebug("retryConflict:error", {
        sessionId: sessionData?.sessionId || null,
        message,
      });
    } finally {
      setRetryingConflict(false);
    }
  };

  const handleRetryPublish = async () => {
    if (!sessionData?.sessionId || retryingPublish || receipt) return;

    setRetryingPublish(true);
    setHasRetryablePublishFailure(false);
    setPublishingDiagnostics(null);
    setCheckoutError("");
    setCheckoutInfo("Reintentando publicacion...");

    try {
      logCheckoutDebug("retryPublish:start", {
        sessionId: sessionData?.sessionId || null,
        draftSlug,
        publicSlug: sessionData?.publicSlug || effectiveCurrentSlug || null,
      });
      const retryPromise = publishApprovedSessionCallable({
        slug: draftSlug,
        slugPublico: sessionData?.publicSlug || effectiveCurrentSlug || undefined,
        paymentSessionId: sessionData.sessionId,
      });
      startPollingStatus(sessionData.sessionId);
      const result = await retryPromise;
      const statusPayload = await refreshCheckoutStatus(sessionData.sessionId);
      if (isPublishedCheckoutStatus(statusPayload?.sessionStatus)) {
        return;
      }

      const data = result?.data || {};
      if (data?.success && data?.url) {
        applyTerminalPublishResult({
          url: String(data.url || ""),
          receiptData: statusPayload?.receipt || receipt || null,
          slug: sessionData?.publicSlug || effectiveCurrentSlug,
        });
        return;
      }

      setCheckoutInfo("No se pudo completar la publicacion en este intento.");
    } catch (error) {
      const message = parseErrorMessage(error, "No se pudo reintentar la publicacion.");
      const statusPayload = await refreshCheckoutStatus(sessionData.sessionId);
      if (!isRetryablePublishFailureStatusPayload(statusPayload || {})) {
        setCheckoutError(message);
      }
      logCheckoutDebug("retryPublish:error", {
        sessionId: sessionData?.sessionId || null,
        message,
      });
    } finally {
      setRetryingPublish(false);
    }
  };

  useEffect(() => {
    const initialization = resolveCheckoutModalInitialization({
      visible,
      draftSlug,
      operation,
      previousVisible: modalInitializationRef.current.visible,
      previousContextKey: modalInitializationRef.current.contextKey,
    });

    modalInitializationRef.current = initialization.nextTracker;

    if (!visible) return undefined;
    if (!initialization.shouldInitialize) return undefined;

    const initialSlug = effectiveCurrentSlug || "";
    setSlugInput(initialSlug);
    setConflictSlugInput("");
    setDiscountCodeInput("");
    setCheckoutError("");
    setCheckoutInfo("");
    setReceipt(null);
    setSessionData(null);
    setPublishedUrl("");
    setPublishingProgress(null);
    setPublishingDiagnostics(null);
    setHasRetryablePublishFailure(false);
    setRetryingPublish(false);
    notifiedPublishRef.current = false;

    return () => {
      clearPolling();
      unmountBrick();
    };
  }, [visible, checkoutContextKey]);

  useEffect(() => {
    if (!visible || !isNewOperation) return undefined;

    const handler = setTimeout(() => {
      checkSlugAvailability({ value: slugInput, setState: setSlugValidation });
    }, 350);

    return () => clearTimeout(handler);
  }, [visible, isNewOperation, slugInput]);

  useEffect(() => {
    if (!visible || !sessionData?.sessionId || !hasApprovedSlugConflict) return undefined;

    const handler = setTimeout(() => {
      checkSlugAvailability({ value: conflictSlugInput, setState: setConflictValidation });
    }, 350);

    return () => clearTimeout(handler);
  }, [visible, sessionData?.sessionId, hasApprovedSlugConflict, conflictSlugInput]);

  useEffect(() => {
    if (!visible || !sessionData?.sessionId || receipt || hasApprovedSlugConflict) return undefined;
    if (summaryFinalAmount <= 0) return undefined;

    let cancelled = false;

    const mountBrick = async () => {
      try {
        logCheckoutDebug("brick:mount:start", {
          sessionId: sessionData?.sessionId || null,
          amountArs: Number(sessionData?.amountArs || 0),
          hasPreference: Boolean(sessionData?.mpPreferenceId),
        });
        await unmountBrick();
        const MercadoPago = await loadMercadoPagoSdk();
        if (cancelled) return;

        const container = document.getElementById("publication-payment-brick");
        if (!container) {
          throw new Error("No se encontro el contenedor del checkout de Mercado Pago.");
        }

        const mp = new MercadoPago(sessionData.mpPublicKey, { locale: "es-AR" });
        const bricksBuilder = mp.bricks();
        const initialization = {
          amount: Number(sessionData.amountArs || 0),
          payer: {
            email: sessionData.payerEmail || undefined,
            entityType: "individual",
          },
        };

        if (sessionData?.mpPreferenceId) {
          initialization.preferenceId = sessionData.mpPreferenceId;
        }

        const controller = await bricksBuilder.create("payment", "publication-payment-brick", {
          initialization,
          customization: {
            visual: { style: { theme: "default" } },
            paymentMethods: {
              creditCard: "all",
              debitCard: "all",
              prepaidCard: "all",
              mercadoPago: "all",
              ticket: "all",
            },
          },
          callbacks: {
            onReady: () => {
              setCheckoutError("");
              setCheckoutInfo("Checkout listo. Selecciona un medio de pago para continuar.");
              logCheckoutDebug("brick:onReady", {
                sessionId: sessionData?.sessionId || null,
              });
            },
            onSubmit: async (payload) => {
              logCheckoutDebug("brick:onSubmit", {
                sessionId: sessionData?.sessionId || null,
              });
              await submitPayment(payload);
            },
            onError: (error) => {
              const message = parseErrorMessage(error, "Error de Mercado Pago.");
              setCheckoutError(message);
              logCheckoutDebug("brick:onError", {
                sessionId: sessionData?.sessionId || null,
                message,
              });
            },
          },
        });

        if (cancelled) {
          try {
            await controller.unmount();
          } catch (_error) {
            // noop
          }
          return;
        }

        brickControllerRef.current = controller;
        logCheckoutDebug("brick:mount:ok", {
          sessionId: sessionData?.sessionId || null,
        });
      } catch (error) {
        const message = parseErrorMessage(error, "No se pudo cargar el checkout embebido.");
        setCheckoutError(message);
        logCheckoutDebug("brick:mount:error", {
          sessionId: sessionData?.sessionId || null,
          message,
        });
      }
    };

    mountBrick();

    return () => {
      cancelled = true;
      unmountBrick();
    };
  }, [
    visible,
    sessionData?.sessionId,
    sessionData?.amountArs,
    sessionData?.mpPublicKey,
    sessionData?.mpPreferenceId,
    receipt,
    hasApprovedSlugConflict,
    summaryFinalAmount,
  ]);

  if (!visible) return null;

  const showConflictFlow = Boolean(sessionData?.sessionId) && hasApprovedSlugConflict;
  const showStandardFlow = !showConflictFlow;
  const slugReasonMessage = getReasonMessage(slugValidation.reason);
  const conflictReasonMessage = getReasonMessage(conflictValidation.reason);
  const showPreSuccessFlow = !receipt;

  return (
    <div className="fixed inset-0 z-[10000] bg-black/45 backdrop-blur-sm">
      <div className="flex h-full items-center justify-center p-3 sm:p-6">
        <div className="w-full max-w-[920px] overflow-hidden rounded-2xl border border-[#ddd2f5] bg-white shadow-[0_24px_72px_rgba(20,10,45,0.32)]">
          <div className="flex items-center justify-between border-b border-[#e7dcf8] bg-gradient-to-r from-[#faf6ff] via-white to-[#f6f9ff] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Checkout de publicacion</p>
              <p className="text-[11px] text-[#6f3bc0]/85">
                {isNewOperation ? "Publicacion nueva" : "Actualizacion"} - {amountLabel}
              </p>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d8ccea] bg-white text-[#6f3bc0] hover:bg-[#f3ebff]"
              aria-label="Cerrar checkout"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[80vh] overflow-auto px-4 py-4 sm:px-5 sm:py-5">
            <div className="space-y-4">
              {showPreSuccessFlow && isNewOperation && showStandardFlow ? (
                <div className="space-y-2 rounded-xl border border-[#d8ccea] bg-white p-3">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Elegi tu enlace publico
                  </label>
                  <div className="flex items-center overflow-hidden rounded-xl border border-[#d7caef] bg-white">
                    <span className="bg-[#f8f2ff] px-3 py-2 text-xs text-[#6f3bc0]">reservaeldia.com.ar/i/</span>
                    <input
                      type="text"
                      value={slugInput}
                      onChange={(event) => {
                        setSlugInput(event.target.value);
                        if (sessionData?.sessionId && !receipt) invalidateCurrentSession();
                      }}
                      className="flex-1 px-3 py-2 text-sm text-slate-800 focus:outline-none"
                      placeholder="mi-invitacion"
                      autoComplete="off"
                      disabled={Boolean(receipt)}
                    />
                  </div>
                  <div className="min-h-[20px] text-xs">
                    {slugValidation.checking ? (
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Verificando enlace...
                      </span>
                    ) : slugValidation.normalizedSlug ? (
                      slugValidation.isValid && slugValidation.isAvailable ? (
                        <span className="text-emerald-700">Disponible: {slugValidation.normalizedSlug}</span>
                      ) : (
                        <span className="text-red-600">{slugReasonMessage || "Ese enlace no esta disponible."}</span>
                      )
                    ) : (
                      <span className="text-slate-400">Ingresa un enlace para continuar.</span>
                    )}
                  </div>
                </div>
              ) : showPreSuccessFlow && !isNewOperation && showStandardFlow ? (
                <div className="rounded-xl border border-[#d8ccea] bg-[#faf6ff] p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#6f3bc0]">URL actual (fija en esta actualizacion)</p>
                  <p className="mt-1 break-all text-sm text-slate-700">https://reservaeldia.com.ar/i/{effectiveCurrentSlug || "sin-enlace"}</p>
                </div>
              ) : showPreSuccessFlow ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-3 text-sm text-amber-900">
                  Tu pago ya fue aprobado. Solo falta elegir un nuevo enlace para completar la publicacion.
                </div>
              ) : null}

              {showPreSuccessFlow && showStandardFlow ? (
                <div className="space-y-2 rounded-xl border border-[#d8ccea] bg-white p-3">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Codigo de descuento (opcional)</label>
                  <input
                    type="text"
                    value={discountCodeInput}
                    onChange={(event) => {
                      setDiscountCodeInput(event.target.value.toUpperCase());
                      if (sessionData?.sessionId && !receipt) invalidateCurrentSession();
                    }}
                    className="w-full rounded-lg border border-[#d7caef] px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#d9c6f8]"
                    placeholder="EJ: BODA10"
                    autoComplete="off"
                    disabled={Boolean(receipt)}
                  />
                  <p className="text-[11px] text-slate-500">Se valida al preparar el checkout.</p>
                </div>
              ) : null}

              {showPreSuccessFlow ? (
                <div className="rounded-xl border border-[#d8ccea] bg-[#faf6ff] p-3 text-sm text-slate-700">
                  <p className="font-semibold text-[#6f3bc0]">
                    {isNewOperation ? "Publicacion nueva" : "Actualizacion"} - Resumen
                  </p>
                  <div className="mt-2 space-y-1 text-xs">
                    {hasSessionAmounts ? (
                      <>
                        <p>
                          Precio base: <strong>{amountBaseLabel}</strong>
                        </p>
                        <p>
                          Descuento: <strong>-{discountAmountLabel}</strong>
                        </p>
                        <p className="font-semibold text-[#6f3bc0]">
                          {showConflictFlow ? "Pago ya aprobado: " : "Total a pagar: "}
                          {amountLabel}
                        </p>
                      </>
                    ) : (
                      <>
                        <p>El monto exacto se confirmara al preparar el checkout.</p>
                        <p>El backend siempre define el precio vigente antes de crear el pago.</p>
                      </>
                    )}
                    {showConflictFlow ? <p>No se realizara un nuevo cobro.</p> : null}
                    {sessionData?.publicSlug ? (
                      <p>
                        Enlace final: <strong>{sessionData.publicSlug}</strong>
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {!receipt && showStandardFlow ? (
                <button
                  type="button"
                  onClick={handleCreateSession}
                  disabled={!isReadyToCreateSession || creatingSession}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition ${
                    !isReadyToCreateSession || creatingSession
                      ? "cursor-not-allowed bg-[#baa4df]"
                      : "bg-gradient-to-r from-[#874fce] via-[#7741bf] to-[#6532b2] hover:from-[#7d47c4] hover:via-[#6f3bbc] hover:to-[#5f2ea6]"
                  }`}
                >
                  {creatingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {sessionData?.sessionId ? "Actualizar total y pago" : "Preparar checkout"}
                </button>
              ) : null}

              {receipt ? (
                <PublicationSuccessState
                  operation={receipt?.operation || operation}
                  publicUrl={successPublicUrl}
                  amountLabel={amountLabel}
                  paymentId={receipt?.paymentId || ""}
                  approvedAt={receipt?.approvedAt || ""}
                  copied={copiedPublicUrl}
                  onCopy={handleCopyPublicUrl}
                  onClose={handleClose}
                />
              ) : null}

              {!receipt && publishingProgress?.hasProgress ? (
                <PublicationProgressList progress={publishingProgress} />
              ) : null}

              {!receipt && showConflictFlow ? (
                <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/80 p-4">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-amber-900">
                    <RefreshCw className="h-4 w-4" />
                    Ese enlace ya no esta disponible, elegi uno nuevo
                  </p>
                  <div className="flex items-center overflow-hidden rounded-xl border border-amber-300 bg-white">
                    <span className="bg-amber-100 px-3 py-2 text-xs text-amber-900">reservaeldia.com.ar/i/</span>
                    <input
                      type="text"
                      value={conflictSlugInput}
                      onChange={(event) => setConflictSlugInput(event.target.value)}
                      className="flex-1 px-3 py-2 text-sm text-slate-800 focus:outline-none"
                      placeholder="nuevo-enlace"
                      autoComplete="off"
                    />
                  </div>
                  <div className="min-h-[20px] text-xs">
                    {conflictValidation.checking ? (
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Verificando...
                      </span>
                    ) : conflictValidation.normalizedSlug ? (
                      conflictValidation.isValid && conflictValidation.isAvailable ? (
                        <span className="text-emerald-700">Disponible: {conflictValidation.normalizedSlug}</span>
                      ) : (
                        <span className="text-red-600">{conflictReasonMessage || "Enlace no disponible."}</span>
                      )
                    ) : (
                      <span className="text-slate-500">Ingresa un enlace para reintentar.</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleRetryWithNewSlug}
                    disabled={!isReadyToRetryConflict || retryingConflict}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition ${
                      !isReadyToRetryConflict || retryingConflict
                        ? "cursor-not-allowed bg-amber-300"
                        : "bg-amber-600 hover:bg-amber-700"
                    }`}
                  >
                    {retryingConflict ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Publicar con nuevo enlace
                  </button>
                </div>
              ) : null}

              {!receipt && sessionData?.sessionId && !showConflictFlow ? (
                summaryFinalAmount <= 0 ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-800">
                    Descuento total aplicado. No necesitas ingresar un medio de pago.
                  </div>
                ) : (
                  <div id="publication-payment-brick" className="rounded-xl border border-[#d8ccea] bg-white p-3" />
                )
              ) : null}

              {showPreSuccessFlow && checkoutInfo ? <p className="text-xs text-[#6f3bc0]">{checkoutInfo}</p> : null}

              {checkoutError ? (
                <p className="inline-flex items-center gap-1.5 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {checkoutError}
                </p>
              ) : null}

              {showPreSuccessFlow && checkoutDebugEnabled && hasRetryablePublishFailure ? (
                <PublicationDebugDetails
                  sessionId={sessionData?.sessionId || ""}
                  progress={publishingProgress}
                  diagnostics={publishingDiagnostics}
                />
              ) : null}

              {showPreSuccessFlow && hasRetryablePublishFailure && sessionData?.sessionId ? (
                <button
                  type="button"
                  onClick={handleRetryPublish}
                  disabled={retryingPublish}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${
                    retryingPublish
                      ? "cursor-not-allowed bg-[#baa4df]"
                      : "bg-[#6f3bc0] hover:bg-[#6232ad]"
                  }`}
                >
                  {retryingPublish ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Reintentar publicacion
                </button>
              ) : null}

              {showPreSuccessFlow && pollingStatus && !hasRetryablePublishFailure ? (
                <p className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {publishingProgress?.currentStage?.label || "Confirmando estado del pago..."}
                </p>
              ) : null}

              {showPreSuccessFlow && paying && !hasRetryablePublishFailure ? (
                <p className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {publishingProgress?.currentStage?.label || "Enviando pago..."}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
