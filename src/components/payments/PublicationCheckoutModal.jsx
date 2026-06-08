import { useEffect, useMemo, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { functions as cloudFunctions } from "@/firebase";
import PublicationSuccessState from "@/components/payments/PublicationSuccessState";
import {
  buildPublicationAutoRetryUserMessage,
  buildPublishFailureUserMessage,
  buildCheckoutModalContextKey,
  isProcessingCheckoutStatus,
  isPublishedCheckoutStatus,
  isRetryablePublishFailureStatusPayload,
  resolveCheckoutModalInitialization,
  resolvePublicationAutoRetryState,
  resolvePublishingProgressState,
  resolveTerminalPublicationResult,
} from "@/domain/payments/publicationCheckoutState";
import {
  PUBLIC_SLUG_AVAILABILITY_REASONS,
  parseSlugFromPublicUrl,
  validatePublicSlug,
} from "@/lib/publicSlug";
import { normalizePricingConfig } from "@/domain/siteSettings/pricingModel";
import { getPublicPublicationPricing } from "@/domain/siteSettings/service";

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

const CHECKOUT_PANEL_CLASS =
  "rounded-xl border border-[#E5E5E5] bg-white p-3";
const CHECKOUT_LABEL_CLASS = "text-xs font-semibold uppercase text-[#262626]/60";
const CHECKOUT_INPUT_CLASS =
  "min-h-[40px] w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#262626] outline-none transition placeholder:text-[#262626]/38 focus:border-[#692B9A] focus:ring-2 focus:ring-[#EFDBFF] disabled:bg-[#FBF7F9] disabled:text-[#262626]/38";
const CHECKOUT_FOCUS_CLASS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#692B9A]";

const PUBLICATION_STAGE_COPY = Object.freeze({
  preparing_invitation: {
    title: "Preparando tu invitacion",
    shortTitle: "Datos",
    description: "Organizamos los datos necesarios para empezar.",
  },
  validating_content: {
    title: "Revisando contenido",
    shortTitle: "Revision",
    description: "Chequeamos que la invitacion este lista para publicar.",
  },
  generating_public_html: {
    title: "Armando la pagina publica",
    shortTitle: "Pagina",
    description: "Creamos la version online de tu invitacion.",
  },
  generating_share_image: {
    title: "Creando imagen para compartir",
    shortTitle: "Imagen",
    description: "Generamos la vista previa que acompana el enlace.",
  },
  saving_publication: {
    title: "Guardando la publicacion",
    shortTitle: "Guardado",
    description: "Subimos los archivos y reservamos el enlace final.",
  },
  finalizing_publication: {
    title: "Activando el enlace",
    shortTitle: "Activacion",
    description: "Confirmamos que todo quede disponible para compartir.",
  },
});

const STATUS_STYLES = Object.freeze({
  completed: {
    label: "Completada",
    iconClass: "border-[#029B4A] bg-[#029B4A] text-white",
    textClass: "text-[#029B4A]",
    cardClass: "border-[#029B4A]/25 bg-white",
  },
  running: {
    label: "En curso",
    iconClass: "border-[#692B9A] bg-[#EFDBFF] text-[#692B9A]",
    textClass: "text-[#692B9A]",
    cardClass: "border-[#692B9A]/35 bg-[#FAF5FF]",
  },
  failed: {
    label: "Con error",
    iconClass: "border-[#B3261E] bg-[#FFDADA] text-[#B3261E]",
    textClass: "text-[#B3261E]",
    cardClass: "border-[#B3261E]/35 bg-[#FFF7F7]",
  },
  pending: {
    label: "Pendiente",
    iconClass: "border-[#E5E5E5] bg-white text-[#262626]/38",
    textClass: "text-[#262626]/54",
    cardClass: "border-[#E5E5E5] bg-white",
  },
});

function getStageCopy(step) {
  return PUBLICATION_STAGE_COPY[step?.key] || {
    title: step?.label || "Etapa de publicacion",
    description: "Seguimos el avance informado por el sistema.",
  };
}

function getStepVisual(step, retry) {
  const status = STATUS_STYLES[step.status] ? step.status : "pending";
  const styles = STATUS_STYLES[status];
  const isRunning = status === "running";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const Icon = isFailed ? AlertCircle : isCompleted ? CheckCircle2 : isRunning ? Loader2 : Circle;
  const label = retry?.isActive && isRunning ? "Reintentando" : styles.label;

  return {
    ...styles,
    Icon,
    label,
    isRunning,
  };
}

function StatusPill({ tone = "neutral", children }) {
  const toneClass =
    tone === "success"
      ? "border-[#029B4A]/25 bg-[#029B4A]/10 text-[#026B35]"
      : tone === "alert"
        ? "border-[#B3261E]/25 bg-[#FFDADA] text-[#B3261E]"
        : tone === "warning"
          ? "border-[#F39F5F]/35 bg-[#FAF5ED] text-[#8A4D16]"
          : tone === "brand"
            ? "border-[#692B9A]/25 bg-[#FAF5FF] text-[#692B9A]"
            : "border-[#E5E5E5] bg-white text-[#262626]/70";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}

function PublicationProgressList({ progress, retry }) {
  if (!progress?.hasProgress) return null;

  const currentStage = progress.currentStage || {};
  const currentStep =
    progress.steps.find((step) => step.key === currentStage.key) ||
    progress.steps.find((step) => step.status === "failed") ||
    progress.steps.find((step) => step.status === "running") ||
    null;
  const currentCopy = currentStep ? getStageCopy(currentStep) : null;
  const substageLabel = currentStage?.substage?.label || "";
  const isFailed = currentStep?.status === "failed" || currentStage?.status === "failed";
  const headline = isFailed
    ? "Necesitamos revisar una etapa"
    : retry?.isActive
      ? "Reintentando automaticamente"
      : "Publicacion en curso";
  const currentDetail = currentCopy
    ? `${isFailed ? "Fallo en" : "Ahora"}: ${currentCopy.title}`
    : "Estamos confirmando el avance.";

  return (
    <div className={`${CHECKOUT_PANEL_CLASS} p-2.5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={CHECKOUT_LABEL_CLASS}>Avance de publicacion</p>
          <p className="mt-0.5 text-sm font-semibold text-[#020B0A]">{headline}</p>
        </div>
        {retry?.isActive ? <StatusPill tone="brand">Retry automatico</StatusPill> : null}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {progress.steps.map((step) => {
          const copy = getStageCopy(step);
          const visual = getStepVisual(step, retry);

          return (
            <div
              key={step.key}
              className={`min-w-0 rounded-lg border px-1.5 py-2 text-center ${visual.cardClass}`}
              aria-current={visual.isRunning ? "step" : undefined}
            >
              <span
                className={`mx-auto inline-flex h-6 w-6 items-center justify-center rounded-full border ${visual.iconClass}`}
              >
                <visual.Icon className={`h-3.5 w-3.5 ${visual.isRunning ? "animate-spin" : ""}`} />
              </span>
              <span className="mt-1 block text-[11px] font-semibold leading-3 text-[#262626]" title={copy.title}>
                {copy.shortTitle || copy.title}
              </span>
              <span className={`mt-0.5 block text-[10px] font-semibold leading-3 ${visual.textClass}`}>
                {visual.label}
              </span>
            </div>
          );
        })}
      </div>

      <div
        className={`mt-2 rounded-lg border px-2 py-1.5 text-xs leading-4 ${
          isFailed
            ? "border-[#B3261E]/25 bg-[#FFF7F7] text-[#B3261E]"
            : "border-[#E5E5E5] bg-[#FBF7F9] text-[#262626]/70"
        }`}
      >
        <p className="font-semibold">{currentDetail}</p>
        {substageLabel ? <p className="mt-0.5">{substageLabel}</p> : currentCopy?.description ? (
          <p className="mt-0.5">{currentCopy.description}</p>
        ) : null}
      </div>

      <details className="mt-2 rounded-lg border border-[#E5E5E5] bg-white px-2 py-1.5 text-xs text-[#262626]/70">
        <summary className="cursor-pointer font-semibold text-[#262626]/70">
          Ver detalle de etapas
        </summary>
        <div className="mt-2 grid gap-1.5">
          {progress.steps.map((step) => {
            const copy = getStageCopy(step);
            const visual = getStepVisual(step, retry);

            return (
              <div key={step.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <span className="min-w-0">
                  <span className="block font-semibold text-[#262626]">{copy.title}</span>
                  <span className="block leading-4">{copy.description}</span>
                </span>
                <span className={`font-semibold ${visual.textClass}`}>{visual.label}</span>
              </div>
            );
          })}
        </div>
      </details>
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

function PublicationAutoRetryNotice({ retry }) {
  if (!retry?.isActive) return null;

  const attemptText =
    retry.nextAttempt && retry.maxAttempts
      ? `Intento ${retry.nextAttempt} de ${retry.maxAttempts}`
      : "Reintentando publicacion";

  return (
    <div className="rounded-xl border border-[#EFDBFF] bg-[#FAF5FF] p-3 text-sm text-[#262626]">
      <p className="inline-flex items-center gap-2 font-semibold text-[#692B9A]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Estamos finalizando tu publicacion
      </p>
      <p className="mt-1 text-xs leading-4 text-[#262626]/70">
        Tu pago ya esta aprobado. Estamos recuperando el proceso y no necesitas volver a pagar.
      </p>
      <p className="mt-1 text-xs font-semibold text-[#692B9A]">{attemptText}</p>
    </div>
  );
}

function ValidationMessage({ validation, emptyText, checkingText, successText, errorText }) {
  if (validation?.checking) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#262626]/54">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {checkingText}
      </span>
    );
  }

  if (validation?.normalizedSlug) {
    if (validation.isValid && validation.isAvailable) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#029B4A]">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {successText}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B3261E]">
        <AlertCircle className="h-3.5 w-3.5" />
        {errorText}
      </span>
    );
  }

  return <span className="text-xs text-[#262626]/54">{emptyText}</span>;
}

function FieldPanel({ label, title, children }) {
  return (
    <section className={CHECKOUT_PANEL_CLASS}>
      <div className="mb-2">
        <p className={CHECKOUT_LABEL_CLASS}>{label}</p>
        <h3 className="mt-0.5 text-sm font-semibold text-[#020B0A]">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function PaymentSummaryCard({
  operation,
  hasSessionAmounts,
  hasDisplayAmounts,
  pricingPreviewLoading,
  hasPendingDiscountCode,
  amountBaseLabel,
  discountAmountLabel,
  amountLabel,
  hasAppliedDiscount,
  summaryFinalAmount,
  sessionPublicSlug,
  showConflictFlow,
  isPostPaymentFlowActive,
  hasRetryablePublishFailure,
  publicationAutoRetry,
}) {
  const statusTone = hasRetryablePublishFailure
    ? "alert"
    : showConflictFlow
      ? "warning"
      : publicationAutoRetry?.isActive || isPostPaymentFlowActive
        ? "brand"
        : hasSessionAmounts
          ? "success"
          : "neutral";
  const statusLabel = hasRetryablePublishFailure
    ? "Requiere reintento"
    : showConflictFlow
      ? "Pago aprobado"
      : publicationAutoRetry?.isActive
        ? "Retry automatico"
        : isPostPaymentFlowActive
          ? "Procesando"
          : hasSessionAmounts
            ? summaryFinalAmount <= 0
              ? "Sin pago requerido"
              : "Pago preparado"
            : pricingPreviewLoading
              ? "Cargando"
              : hasDisplayAmounts
                ? ""
                : "No disponible";
  const showStatusPill =
    Boolean(statusLabel) &&
    (hasRetryablePublishFailure ||
      showConflictFlow ||
      Boolean(publicationAutoRetry?.isActive) ||
      isPostPaymentFlowActive ||
      hasSessionAmounts ||
      pricingPreviewLoading ||
      !hasDisplayAmounts);
  const amountDisplay = hasDisplayAmounts
    ? amountLabel
    : pricingPreviewLoading
      ? "Cargando..."
      : "No disponible";
  const priceLineLabel = operation === "update" ? "Precio de actualizacion" : "Precio de publicacion";
  const discountDisplay = hasSessionAmounts
    ? hasAppliedDiscount
      ? `-${discountAmountLabel}`
      : "$ 0"
    : hasPendingDiscountCode
      ? "Al preparar"
      : "$ 0";
  const discountClass = hasAppliedDiscount
    ? "font-semibold text-[#029B4A]"
    : hasPendingDiscountCode
      ? "font-semibold text-[#692B9A]"
      : "font-semibold text-[#262626]/54";

  return (
    <aside className={`${CHECKOUT_PANEL_CLASS} lg:sticky lg:top-0`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={CHECKOUT_LABEL_CLASS}>Resumen de pago</p>
          <h3 className="mt-0.5 text-sm font-semibold text-[#020B0A]">
            {operation === "update" ? "Actualizacion" : "Publicacion nueva"}
          </h3>
        </div>
        {showStatusPill ? <StatusPill tone={statusTone}>{statusLabel}</StatusPill> : null}
      </div>

      <div className="mt-3 rounded-xl border border-[#EFDBFF] bg-[#FAF5FF] p-3">
        <dl className="space-y-2 text-sm text-[#262626]">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#262626]/70">{showConflictFlow ? "Pago aprobado" : priceLineLabel}</dt>
            <dd className="font-semibold text-[#020B0A]">{hasAppliedDiscount ? amountBaseLabel : amountDisplay}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#262626]/70">Descuento</dt>
            <dd className={discountClass}>{discountDisplay}</dd>
          </div>
          <div className="border-t border-[#E5E5E5] pt-2">
            <div className="flex items-center justify-between gap-3">
              <dt className="font-semibold text-[#020B0A]">Total a pagar</dt>
              <dd className="text-xl font-semibold text-[#692B9A]">{amountDisplay}</dd>
            </div>
          </div>
        </dl>
        {!hasSessionAmounts && hasPendingDiscountCode ? (
          <p className="mt-1 text-xs leading-4 text-[#262626]/60">
            El codigo se descuenta al preparar el pago.
          </p>
        ) : null}
      </div>

      {showConflictFlow ? (
        <p className="mt-3 rounded-lg border border-[#F39F5F]/30 bg-[#FAF5ED] p-2 text-xs leading-4 text-[#8A4D16]">
          No se realizara un nuevo cobro. Solo falta elegir otro enlace para publicar.
        </p>
      ) : null}

      {sessionPublicSlug ? (
        <div className="mt-3 rounded-lg border border-[#E5E5E5] bg-white p-2">
          <p className="text-xs font-semibold text-[#262626]/60">Enlace final</p>
          <p className="mt-0.5 break-all text-xs font-semibold text-[#020B0A]">
            reservaeldia.com.ar/i/{sessionPublicSlug}
          </p>
        </div>
      ) : null}
    </aside>
  );
}

function CheckoutStatusPanel({ checkoutInfo, checkoutError }) {
  if (!checkoutInfo && !checkoutError) return null;

  return (
    <div className="space-y-2">
      {checkoutInfo ? (
        <div className="rounded-lg border border-[#EFDBFF] bg-[#FAF5FF] p-2 text-xs leading-4 text-[#692B9A]">
          <p>{checkoutInfo}</p>
        </div>
      ) : null}

      {checkoutError ? (
        <div className="flex items-start gap-2 rounded-lg border border-[#B3261E]/25 bg-[#FFDADA] p-2 text-xs leading-4 text-[#B3261E]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{checkoutError}</p>
        </div>
      ) : null}
    </div>
  );
}

function InlineProcessingNotice({ children }) {
  return (
    <p className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-white px-3 py-1.5 text-xs text-[#262626]/70">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#692B9A]" />
      {children}
    </p>
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
  const [pricingPreview, setPricingPreview] = useState(null);
  const [pricingPreviewLoading, setPricingPreviewLoading] = useState(false);
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
  const [publicationAutoRetry, setPublicationAutoRetry] = useState(null);
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

  useEffect(() => {
    if (!visible) return undefined;

    let cancelled = false;
    setPricingPreviewLoading(true);

    getPublicPublicationPricing()
      .then((config) => {
        if (cancelled) return;
        setPricingPreview(config ? normalizePricingConfig(config) : null);
      })
      .catch(() => {
        if (cancelled) return;
        setPricingPreview(null);
      })
      .finally(() => {
        if (cancelled) return;
        setPricingPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible]);

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
  const pricingPreviewBaseAmount = Number(
    isNewOperation ? pricingPreview?.publishPrice : pricingPreview?.updatePrice
  );
  const hasPricingPreviewAmount =
    Boolean(pricingPreview) && Number.isFinite(pricingPreviewBaseAmount) && pricingPreviewBaseAmount >= 0;
  const displayBaseAmount = hasSessionAmounts ? summaryBaseAmount : pricingPreviewBaseAmount;
  const displayFinalAmount = hasSessionAmounts ? summaryFinalAmount : displayBaseAmount;
  const hasDisplayAmounts = hasSessionAmounts || hasPricingPreviewAmount;

  const amountLabel = hasDisplayAmounts ? formatArs(displayFinalAmount) : "";
  const amountBaseLabel = hasDisplayAmounts ? formatArs(displayBaseAmount) : "";
  const discountAmountLabel = hasSessionAmounts ? formatArs(summaryDiscountAmount) : "";
  const hasAppliedDiscount = hasSessionAmounts && summaryDiscountAmount > 0;
  const hasPendingDiscountCode = Boolean(normalizedDiscountCode) && !hasSessionAmounts;

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
    setPricingPreview(null);
    setPricingPreviewLoading(false);
    setHasApprovedSlugConflict(false);
    setReceipt(null);
    setPublishedUrl("");
    setCopiedPublicUrl(false);
    setConflictSlugInput("");
    setRetryingConflict(false);
    setPublishingProgress(null);
    setPublishingDiagnostics(null);
    setPublicationAutoRetry(null);
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
    setPublicationAutoRetry(null);
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
      publicationAutoRetryStatus: statusPayload?.publicationAutoRetry?.status || null,
      publicationAutoRetryAttempt:
        statusPayload?.publicationAutoRetry?.nextAttempt ||
        statusPayload?.publicationAutoRetry?.attempt ||
        null,
    });

    const progress = resolvePublishingProgressState(statusPayload);
    const autoRetry = resolvePublicationAutoRetryState(statusPayload);
    setPublishingProgress(progress.hasProgress ? progress : null);
    setPublishingDiagnostics(statusPayload?.publishingShareImageDiagnostics || null);
    setPublicationAutoRetry(autoRetry.isActive ? autoRetry : null);

    if (autoRetry.isActive) {
      setHasRetryablePublishFailure(false);
      setCheckoutInfo(buildPublicationAutoRetryUserMessage(statusPayload));
      setCheckoutError("");
      return;
    }

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
    setPublicationAutoRetry(null);
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
          if (
            !isRetryablePublishFailureStatusPayload(statusPayload || {}) &&
            !resolvePublicationAutoRetryState(statusPayload || {}).isActive
          ) {
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
      if (
        !isRetryablePublishFailureStatusPayload(statusPayload || {}) &&
        !resolvePublicationAutoRetryState(statusPayload || {}).isActive
      ) {
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
      if (
        !isRetryablePublishFailureStatusPayload(statusPayload || {}) &&
        !resolvePublicationAutoRetryState(statusPayload || {}).isActive
      ) {
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
    setPublicationAutoRetry(null);
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
      if (
        !isRetryablePublishFailureStatusPayload(statusPayload || {}) &&
        !resolvePublicationAutoRetryState(statusPayload || {}).isActive
      ) {
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
    setPublicationAutoRetry(null);
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
  const isPostPaymentFlowActive =
    Boolean(publicationAutoRetry?.isActive) ||
    Boolean(publishingProgress?.hasProgress) ||
    hasRetryablePublishFailure ||
    pollingStatus ||
    paying;
  const primaryActionDisabled = !isReadyToCreateSession || creatingSession;
  const primaryActionClass = `inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${CHECKOUT_FOCUS_CLASS} ${
    primaryActionDisabled
      ? "cursor-not-allowed bg-[#E5E5E5] text-[#262626]/38"
      : "bg-[#692B9A] text-white hover:bg-[#5A2188]"
  }`;
  const retryPublishActionClass = `inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition sm:w-auto ${CHECKOUT_FOCUS_CLASS} ${
    retryingPublish
      ? "cursor-not-allowed bg-[#E5E5E5] text-[#262626]/38"
      : "bg-[#692B9A] text-white hover:bg-[#5A2188]"
  }`;
  const retryConflictActionClass = `inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${CHECKOUT_FOCUS_CLASS} ${
    !isReadyToRetryConflict || retryingConflict
      ? "cursor-not-allowed bg-[#E5E5E5] text-[#262626]/38"
      : "bg-[#8A4D16] text-white hover:bg-[#6F3D10]"
  }`;

  return (
    <div className="fixed inset-0 z-[10000] bg-[#020B0A]/55 backdrop-blur-sm">
      <div className="flex h-full items-center justify-center p-2 sm:p-6">
        <div className="flex max-h-[90dvh] w-full max-w-[820px] flex-col overflow-hidden rounded-2xl border border-[#E5E5E5] bg-white font-['DM_Sans',sans-serif] shadow-[0_24px_64px_rgba(2,11,10,0.26)]">
          <div className="flex items-start justify-between gap-4 border-b border-[#E5E5E5] bg-white px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-[#020B0A]">
                Publicar invitacion
              </h2>
              <p className="mt-0.5 text-xs text-[#262626]/60">
                {isNewOperation ? "Publicacion nueva" : "Actualizacion"}{" "}
                {amountLabel
                  ? `- ${amountLabel}`
                  : pricingPreviewLoading
                    ? "- cargando precio"
                    : "- precio no disponible"}
              </p>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E5E5E5] bg-white text-[#692B9A] transition hover:bg-[#FAF5FF] ${CHECKOUT_FOCUS_CLASS}`}
              aria-label="Cerrar checkout"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto bg-white px-4 py-4">
            {receipt ? (
              <div className="mx-auto max-w-3xl">
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
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_270px] md:items-start">
                <div className="space-y-3">
                  {showPreSuccessFlow && isNewOperation && showStandardFlow ? (
                    <FieldPanel label="URL publica" title="Elegi tu enlace">
                      <div className="overflow-hidden rounded-lg border border-[#E5E5E5] bg-white transition focus-within:border-[#692B9A] focus-within:ring-2 focus-within:ring-[#EFDBFF] sm:flex">
                        <span className="flex min-h-[40px] items-center border-b border-[#E5E5E5] bg-[#FAF5FF] px-3 text-xs font-semibold text-[#692B9A] sm:border-b-0 sm:border-r">
                          reservaeldia.com.ar/i/
                        </span>
                        <input
                          type="text"
                          value={slugInput}
                          onChange={(event) => {
                            setSlugInput(event.target.value);
                            if (sessionData?.sessionId && !receipt) invalidateCurrentSession();
                          }}
                          className="min-h-[40px] w-full min-w-0 flex-1 px-3 py-2 text-sm text-[#262626] outline-none placeholder:text-[#262626]/38"
                          placeholder="mi-invitacion"
                          autoComplete="off"
                          disabled={Boolean(receipt)}
                        />
                      </div>
                      <div className="mt-2 min-h-[20px]">
                        <ValidationMessage
                          validation={slugValidation}
                          checkingText="Verificando enlace..."
                          successText={`Disponible: ${slugValidation.normalizedSlug}`}
                          errorText={slugReasonMessage || "Ese enlace no esta disponible."}
                          emptyText="Ingresa un enlace para continuar."
                        />
                      </div>
                    </FieldPanel>
                  ) : showPreSuccessFlow && !isNewOperation && showStandardFlow ? (
                    <FieldPanel label="URL publica" title="Enlace actual">
                      <div className="rounded-lg border border-[#EFDBFF] bg-[#FAF5FF] p-2">
                        <p className="break-all text-sm font-semibold text-[#020B0A]">
                          https://reservaeldia.com.ar/i/{effectiveCurrentSlug || "sin-enlace"}
                        </p>
                        <p className="mt-1 text-xs leading-4 text-[#262626]/60">
                          En una actualizacion se mantiene el enlace publico existente.
                        </p>
                      </div>
                    </FieldPanel>
                  ) : showPreSuccessFlow ? (
                    <div className="rounded-xl border border-[#F39F5F]/35 bg-[#FAF5ED] p-3 text-sm leading-5 text-[#8A4D16]">
                      Tu pago ya fue aprobado. Solo falta elegir un nuevo enlace para completar la publicacion.
                    </div>
                  ) : null}

                  {showPreSuccessFlow && showStandardFlow ? (
                    <FieldPanel label="Descuento" title="Codigo promocional">
                      <input
                        type="text"
                        value={discountCodeInput}
                        onChange={(event) => {
                          setDiscountCodeInput(event.target.value.toUpperCase());
                          if (sessionData?.sessionId && !receipt) invalidateCurrentSession();
                        }}
                        className={CHECKOUT_INPUT_CLASS}
                        placeholder="EJ: BODA10"
                        autoComplete="off"
                        disabled={Boolean(receipt)}
                      />
                      <p className="mt-1 text-xs leading-4 text-[#262626]/54">
                        Si tenes un codigo, se aplica al preparar el checkout.
                      </p>
                    </FieldPanel>
                  ) : null}

                  {!receipt && showStandardFlow ? (
                    <section className="pt-1">
                      <button
                        type="button"
                        onClick={handleCreateSession}
                        disabled={primaryActionDisabled}
                        className={primaryActionClass}
                      >
                        {creatingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {sessionData?.sessionId ? "Actualizar total y pago" : "Preparar pago"}
                      </button>
                    </section>
                  ) : null}

                  <CheckoutStatusPanel checkoutInfo={showPreSuccessFlow ? checkoutInfo : ""} checkoutError={checkoutError} />

                  {!receipt && publishingProgress?.hasProgress ? (
                    <PublicationProgressList progress={publishingProgress} retry={publicationAutoRetry} />
                  ) : null}

                  {!receipt && publicationAutoRetry?.isActive ? (
                    <PublicationAutoRetryNotice retry={publicationAutoRetry} />
                  ) : null}

                  {!receipt && showConflictFlow ? (
                    <section className="space-y-2 rounded-xl border border-[#F39F5F]/45 bg-[#FAF5ED] p-3">
                      <div className="flex items-start gap-2">
                        <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-[#8A4D16]" />
                        <div>
                          <p className="text-sm font-semibold text-[#8A4D16]">
                            Ese enlace ya no esta disponible
                          </p>
                          <p className="mt-0.5 text-xs leading-4 text-[#8A4D16]/85">
                            Elegi uno nuevo para finalizar sin volver a pagar.
                          </p>
                        </div>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-[#F39F5F]/45 bg-white transition focus-within:border-[#8A4D16] focus-within:ring-2 focus-within:ring-[#FFF1C2] sm:flex">
                        <span className="flex min-h-[40px] items-center border-b border-[#F39F5F]/35 bg-[#FFF1C2] px-3 text-xs font-semibold text-[#8A4D16] sm:border-b-0 sm:border-r">
                          reservaeldia.com.ar/i/
                        </span>
                        <input
                          type="text"
                          value={conflictSlugInput}
                          onChange={(event) => setConflictSlugInput(event.target.value)}
                          className="min-h-[40px] w-full min-w-0 flex-1 px-3 py-2 text-sm text-[#262626] outline-none placeholder:text-[#262626]/38"
                          placeholder="nuevo-enlace"
                          autoComplete="off"
                        />
                      </div>
                      <div className="min-h-[20px]">
                        <ValidationMessage
                          validation={conflictValidation}
                          checkingText="Verificando..."
                          successText={`Disponible: ${conflictValidation.normalizedSlug}`}
                          errorText={conflictReasonMessage || "Enlace no disponible."}
                          emptyText="Ingresa un enlace para reintentar."
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleRetryWithNewSlug}
                        disabled={!isReadyToRetryConflict || retryingConflict}
                        className={retryConflictActionClass}
                      >
                        {retryingConflict ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Publicar con nuevo enlace
                      </button>
                    </section>
                  ) : null}

                  {!receipt && sessionData?.sessionId && !showConflictFlow && !isPostPaymentFlowActive ? (
                    summaryFinalAmount <= 0 ? (
                      <div className="rounded-xl border border-[#029B4A]/25 bg-[#029B4A]/10 p-3 text-sm leading-5 text-[#026B35]">
                        Descuento total aplicado. No necesitas ingresar un medio de pago.
                      </div>
                    ) : (
                      <div className={`${CHECKOUT_PANEL_CLASS} p-3 sm:p-4`}>
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#020B0A]">
                          Medio de pago
                        </div>
                        <div id="publication-payment-brick" className="rounded-lg border border-[#E5E5E5] bg-white p-2" />
                      </div>
                    )
                  ) : null}

                  {showPreSuccessFlow && checkoutDebugEnabled && hasRetryablePublishFailure ? (
                    <PublicationDebugDetails
                      sessionId={sessionData?.sessionId || ""}
                      progress={publishingProgress}
                      diagnostics={publishingDiagnostics}
                    />
                  ) : null}

                  {showPreSuccessFlow && hasRetryablePublishFailure && sessionData?.sessionId ? (
                    <section className="rounded-xl border border-[#B3261E]/25 bg-white p-3">
                      <p className="text-sm font-semibold text-[#B3261E]">
                        Tu pago quedo aprobado y la publicacion se puede reintentar.
                      </p>
                      <p className="mt-1 text-xs leading-4 text-[#262626]/70">
                        Vamos a usar la misma sesion aprobada, sin iniciar un nuevo cobro.
                      </p>
                      <button
                        type="button"
                        onClick={handleRetryPublish}
                        disabled={retryingPublish}
                        className={`mt-3 ${retryPublishActionClass}`}
                      >
                        {retryingPublish ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        Reintentar sin volver a pagar
                      </button>
                    </section>
                  ) : null}

                  {showPreSuccessFlow && pollingStatus && !paying && !hasRetryablePublishFailure && !publishingProgress?.hasProgress ? (
                    <InlineProcessingNotice>
                      {publishingProgress?.currentStage?.label || "Confirmando estado del pago..."}
                    </InlineProcessingNotice>
                  ) : null}

                  {showPreSuccessFlow && paying && !hasRetryablePublishFailure && !publishingProgress?.hasProgress ? (
                    <InlineProcessingNotice>
                      {publishingProgress?.currentStage?.label || "Enviando pago..."}
                    </InlineProcessingNotice>
                  ) : null}
                </div>

                <div>
                  <PaymentSummaryCard
                    operation={operation}
                    hasSessionAmounts={hasSessionAmounts}
                    hasDisplayAmounts={hasDisplayAmounts}
                    pricingPreviewLoading={pricingPreviewLoading}
                    hasPendingDiscountCode={hasPendingDiscountCode}
                    amountBaseLabel={amountBaseLabel}
                    discountAmountLabel={discountAmountLabel}
                    amountLabel={amountLabel}
                    hasAppliedDiscount={hasAppliedDiscount}
                    summaryFinalAmount={summaryFinalAmount}
                    sessionPublicSlug={sessionData?.publicSlug || effectiveCurrentSlug}
                    showConflictFlow={showConflictFlow}
                    isPostPaymentFlowActive={isPostPaymentFlowActive}
                    hasRetryablePublishFailure={hasRetryablePublishFailure}
                    publicationAutoRetry={publicationAutoRetry}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
