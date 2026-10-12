import { createHash } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";

export const DESIGNER_AI_USAGE_COLLECTION = "designerAiUsage";
export const DESIGNER_AI_ADMISSION_CONFIG_PATH = `${DESIGNER_AI_USAGE_COLLECTION}/config`;
export const DESIGNER_AI_REQUEST_MAX_AGE_MS = 10 * 60_000;
export const DESIGNER_AI_REQUEST_FUTURE_TOLERANCE_MS = 60_000;
export const DESIGNER_AI_RESERVATION_LEASE_MS = 120_000;
export const DESIGNER_AI_USAGE_RETENTION_MS = 7 * 24 * 60 * 60_000;
export const DESIGNER_AI_MAX_RESERVED_INPUT_TOKENS = 3_000_000;
export const DESIGNER_AI_MAX_RESERVED_OUTPUT_TOKENS = 12_000;

export type DesignerAiAdmissionReason =
  | "authentication_required" | "email_verification_required" | "anonymous_not_allowed"
  | "invalid_request" | "request_expired" | "disabled" | "configuration_invalid"
  | "draft_unavailable" | "minute_quota" | "daily_quota" | "concurrent_request"
  | "global_budget" | "duplicate_active" | "duplicate_completed" | "duplicate_unknown"
  | "request_conflict" | "reservation_invalid" | "accounting_unavailable" | "client_update_required";

const ERROR_PRESENTATIONS: Record<DesignerAiAdmissionReason, {
  code: ConstructorParameters<typeof HttpsError>[0]; message: string; retryable: boolean;
}> = {
  authentication_required: { code: "unauthenticated", message: "Iniciá sesión para usar tu asistente.", retryable: false },
  email_verification_required: { code: "permission-denied", message: "Verificá tu email para usar tu asistente.", retryable: false },
  anonymous_not_allowed: { code: "permission-denied", message: "Iniciá sesión con una cuenta para usar tu asistente.", retryable: false },
  invalid_request: { code: "invalid-argument", message: "La solicitud del asistente es inválida.", retryable: false },
  request_expired: { code: "failed-precondition", message: "Esta solicitud venció. Enviá un nuevo mensaje.", retryable: false },
  disabled: { code: "failed-precondition", message: "Tu asistente no está disponible en este momento.", retryable: false },
  configuration_invalid: { code: "failed-precondition", message: "Tu asistente no está disponible en este momento.", retryable: false },
  draft_unavailable: { code: "permission-denied", message: "No podés usar el asistente en este borrador.", retryable: false },
  minute_quota: { code: "resource-exhausted", message: "Alcanzaste el límite temporal del asistente. Esperá un momento.", retryable: true },
  daily_quota: { code: "resource-exhausted", message: "Alcanzaste el límite diario del asistente.", retryable: false },
  concurrent_request: { code: "resource-exhausted", message: "Ya hay una solicitud del asistente en curso.", retryable: true },
  global_budget: { code: "resource-exhausted", message: "El asistente alcanzó su límite de uso por hoy.", retryable: false },
  duplicate_active: { code: "already-exists", message: "Esta solicitud ya está en curso.", retryable: false },
  duplicate_completed: { code: "already-exists", message: "Esta solicitud ya fue procesada. Revisá tu invitación antes de enviar otra.", retryable: false },
  duplicate_unknown: { code: "already-exists", message: "La solicitud anterior no pudo confirmarse. Revisá tu invitación antes de enviar otra.", retryable: false },
  request_conflict: { code: "invalid-argument", message: "El identificador de la solicitud ya fue utilizado.", retryable: false },
  reservation_invalid: { code: "failed-precondition", message: "La solicitud del asistente ya no está activa.", retryable: false },
  accounting_unavailable: { code: "unavailable", message: "No pudimos verificar el uso del asistente. Intentá de nuevo más tarde.", retryable: true },
  client_update_required: { code: "failed-precondition", message: "Actualizamos tu asistente. Recargá la página para continuar; tu mensaje sigue disponible.", retryable: false },
};

export class DesignerAiAdmissionError extends HttpsError {
  readonly reason: DesignerAiAdmissionReason;
  constructor(reason: DesignerAiAdmissionReason) {
    const presentation = ERROR_PRESENTATIONS[reason];
    super(presentation.code, presentation.message, {
      category: "assistant_admission", reason, summary: presentation.message,
      retryable: presentation.retryable,
    });
    this.reason = reason;
  }
}

export type DesignerAiAdmissionConfig = {
  schemaVersion: 1;
  enabled: true;
  policyVersion: string;
  model: string;
  perUserMinuteLimit: number;
  perUserDayLimit: number;
  dailyBudgetMicrousd: number;
  inputMicrousdPerMillionTokens: number;
  outputMicrousdPerMillionTokens: number;
};

export function admissionRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function parseDesignerAiAdmissionConfig(value: unknown): DesignerAiAdmissionConfig {
  const config = admissionRecord(value);
  if (!config || config.enabled !== true) throw new DesignerAiAdmissionError("disabled");
  if (config.schemaVersion !== 1 || typeof config.policyVersion !== "string" ||
      !/^[a-zA-Z0-9_.-]{1,80}$/.test(config.policyVersion) ||
      typeof config.model !== "string" || !/^[a-zA-Z0-9_.-]{1,80}$/.test(config.model) ||
      !positiveInteger(config.perUserMinuteLimit) || config.perUserMinuteLimit > 1000 ||
      !positiveInteger(config.perUserDayLimit) || config.perUserDayLimit > 100_000 ||
      config.perUserDayLimit < config.perUserMinuteLimit ||
      !positiveInteger(config.dailyBudgetMicrousd) ||
      !positiveInteger(config.inputMicrousdPerMillionTokens) || config.inputMicrousdPerMillionTokens > 1_000_000_000 ||
      !positiveInteger(config.outputMicrousdPerMillionTokens) || config.outputMicrousdPerMillionTokens > 1_000_000_000) {
    throw new DesignerAiAdmissionError("configuration_invalid");
  }
  return {
    schemaVersion: 1, enabled: true, policyVersion: config.policyVersion, model: config.model,
    perUserMinuteLimit: config.perUserMinuteLimit, perUserDayLimit: config.perUserDayLimit,
    dailyBudgetMicrousd: config.dailyBudgetMicrousd,
    inputMicrousdPerMillionTokens: config.inputMicrousdPerMillionTokens,
    outputMicrousdPerMillionTokens: config.outputMicrousdPerMillionTokens,
  };
}

export function requireDesignerAiIdentity(auth: unknown): string {
  const identity = admissionRecord(auth);
  if (typeof identity?.uid !== "string" || !identity.uid.trim()) {
    throw new DesignerAiAdmissionError("authentication_required");
  }
  const token = admissionRecord(identity.token);
  const firebase = admissionRecord(token?.firebase);
  const provider = firebase?.sign_in_provider;
  const linkedIdentities = admissionRecord(firebase?.identities);
  const hasIdentity = (key: string) => Array.isArray(linkedIdentities?.[key]) &&
    (linkedIdentities[key] as unknown[]).some(value => typeof value === "string" && value.length > 0);
  const hasLinkedGoogle = hasIdentity("google.com");
  // Firebase's signed identities preserve the frontend's linked-Google exception.
  // Custom authentication must not hide an attached password/email identity.
  const hasPassword = provider === "password" || hasIdentity("password") ||
    (provider === "custom" && hasIdentity("email"));
  if (provider === "anonymous") throw new DesignerAiAdmissionError("anonymous_not_allowed");
  if (hasPassword && !hasLinkedGoogle && token?.email_verified !== true) {
    throw new DesignerAiAdmissionError("email_verification_required");
  }
  return identity.uid;
}

export type DesignerAiAdmissionInput = {
  uid: string;
  draftId: string;
  clientMessageId: string;
  requestCreatedAt: number;
  payloadDigest: string;
  model: string;
  // Server-computed upper bounds for ALL attempts, including retry and repair.
  maxInputTokens: number;
  maxOutputTokens: number;
};

export function validateDesignerAiAdmissionInput(input: DesignerAiAdmissionInput, nowMs: number): void {
  const validSegment = (value: unknown, max: number) => typeof value === "string" &&
    value.length > 0 && value.length <= max && value === value.trim() &&
    !value.includes("/") && !Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) &&
    value !== "." && value !== ".." && !/^__.*__$/.test(value);
  if (!validSegment(input.uid, 128) || !validSegment(input.draftId, 160) ||
      !validSegment(input.clientMessageId, 160) || !/^[a-f0-9]{64}$/.test(input.payloadDigest) ||
      typeof input.model !== "string" || !/^[a-zA-Z0-9_.-]{1,80}$/.test(input.model) ||
      !Number.isSafeInteger(input.requestCreatedAt) || input.requestCreatedAt < 0 ||
      !Number.isSafeInteger(nowMs) || nowMs < 0 ||
      !Number.isSafeInteger(input.maxInputTokens) || input.maxInputTokens < 0 || input.maxInputTokens > DESIGNER_AI_MAX_RESERVED_INPUT_TOKENS ||
      !Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens < 0 || input.maxOutputTokens > DESIGNER_AI_MAX_RESERVED_OUTPUT_TOKENS ||
      (input.maxInputTokens === 0) !== (input.maxOutputTokens === 0)) {
    throw new DesignerAiAdmissionError("invalid_request");
  }
  if (input.requestCreatedAt < nowMs - DESIGNER_AI_REQUEST_MAX_AGE_MS ||
      input.requestCreatedAt > nowMs + DESIGNER_AI_REQUEST_FUTURE_TOLERANCE_MS) {
    throw new DesignerAiAdmissionError("request_expired");
  }
}

export function designerAiUsageKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function calculateDesignerAiCostMicrousd(
  inputTokens: number, outputTokens: number,
  pricing: Pick<DesignerAiAdmissionConfig, "inputMicrousdPerMillionTokens" | "outputMicrousdPerMillionTokens">
): number {
  if (![inputTokens, outputTokens].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new DesignerAiAdmissionError("invalid_request");
  }
  // Integer ceiling, without floating point under-reservation. Rates are versioned server config.
  const cost = (BigInt(inputTokens) * BigInt(pricing.inputMicrousdPerMillionTokens) +
    BigInt(outputTokens) * BigInt(pricing.outputMicrousdPerMillionTokens) + 999_999n) / 1_000_000n;
  if (cost > BigInt(Number.MAX_SAFE_INTEGER)) throw new DesignerAiAdmissionError("configuration_invalid");
  return Number(cost);
}
