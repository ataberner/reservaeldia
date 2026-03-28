import { createHmac, timingSafeEqual } from "crypto";
import { HttpsError } from "firebase-functions/v2/https";

type UnknownRecord = Record<string, unknown>;

export type MercadoPagoSignatureHeader = {
  ts: string;
  v1: string;
};

export type MercadoPagoWebhookEnvelope = {
  signatureHeader: string;
  requestId: string;
  action: string;
  dataId: string;
  topic: string;
};

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as UnknownRecord;
}

export function parseSignatureHeader(
  rawHeader: string
): MercadoPagoSignatureHeader | null {
  const parts = rawHeader
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split("="));

  const signatureMap = new Map<string, string>();
  parts.forEach(([key, value]) => {
    if (!key || !value) return;
    signatureMap.set(key, value);
  });

  const ts = signatureMap.get("ts") || "";
  const v1 = signatureMap.get("v1") || "";
  if (!ts || !v1) return null;

  return { ts, v1 };
}

export function toQueryValue(value: unknown): string {
  if (Array.isArray(value)) {
    return getString(value[0]);
  }
  return getString(value);
}

export function readMercadoPagoWebhookEnvelope(params: {
  headers?: UnknownRecord;
  query?: UnknownRecord;
  body?: unknown;
}): MercadoPagoWebhookEnvelope {
  const headers = params.headers || {};
  const query = params.query || {};
  const body = asRecord(params.body);
  const bodyData = asRecord(body.data);

  const action = toQueryValue(query.action) || getString(body.action);
  const dataId = toQueryValue(query["data.id"]) || getString(bodyData.id);
  const topic =
    toQueryValue(query.type) ||
    getString(body.type) ||
    toQueryValue(query.topic);

  return {
    signatureHeader: getString(headers["x-signature"]),
    requestId: getString(headers["x-request-id"]),
    action,
    dataId,
    topic,
  };
}

export function validateMercadoPagoSignature(params: {
  signatureHeader: string;
  requestId: string;
  dataId: string;
  getWebhookSecret(): string;
}): boolean {
  let secret = "";
  try {
    secret = params.getWebhookSecret();
  } catch {
    return false;
  }

  const parsed = parseSignatureHeader(params.signatureHeader);
  if (!parsed) return false;

  const manifest = `id:${params.dataId};request-id:${params.requestId};ts:${parsed.ts};`;
  const digest = createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(parsed.v1));
  } catch {
    return false;
  }
}

export async function resolvePaymentById<T>(params: {
  paymentId: string;
  loadPayment(id: number): Promise<T>;
}): Promise<T> {
  const numericId = Number(params.paymentId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new HttpsError("invalid-argument", "paymentId invalido");
  }

  return params.loadPayment(numericId);
}
