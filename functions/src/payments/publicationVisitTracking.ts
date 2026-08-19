import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { resolvePublicationLifecycleSnapshotFromData } from "./publicationLifecycle";

type UnknownRecord = Record<string, unknown>;

// Firebase Hosting strips rewritten-request cookies except for this reserved name.
export const PUBLIC_VISITOR_COOKIE_NAME = "__session";
export const PUBLIC_VISITOR_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
export const PUBLIC_VISIT_RUNTIME_MARKER = 'data-public-visit-runtime="v1"';
export const PUBLIC_VISIT_TOKEN_TTL_MS = 10 * 60 * 1000;
export const PUBLIC_VISIT_MEASUREMENT_SCHEMA_VERSION = 2;
export const MAX_PUBLICATION_METRIC_SLUGS = 25;

const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;
const TOKEN_PART_PATTERN = /^[A-Za-z0-9_-]+$/;

export type PublicVisitorIdentity = {
  visitorId: string;
  isNew: boolean;
};

export type PublicVisitTokenPayload = {
  version: 1;
  slug: string;
  visitorHash: string;
  nonce: string;
  issuedAtMs: number;
  expiresAtMs: number;
};

export type PublicVisitCounts = {
  totalVisits: number;
  uniqueVisits: number;
};

type DocumentSnapshotLike = {
  exists: boolean;
  data(): UnknownRecord | undefined;
};

type DocumentReferenceLike = {
  collection(name: string): CollectionReferenceLike;
};

type CollectionReferenceLike = {
  doc(id: string): unknown;
  where(
    fieldPath: string,
    operator: "==",
    value: unknown
  ): {
    count(): {
      get(): Promise<{
        data(): { count?: unknown };
      }>;
    };
  };
  count(): {
    get(): Promise<{
      data(): { count?: unknown };
    }>;
  };
};

type TransactionLike = {
  get(ref: unknown): Promise<DocumentSnapshotLike>;
  create(ref: unknown, data: UnknownRecord): unknown;
};

function normalizeCookieHeader(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || "");
  return typeof value === "string" ? value : "";
}

function getCookieValue(cookieHeader: unknown, name: string): string {
  const safeName = String(name || "").trim();
  if (!safeName) return "";

  const parts = normalizeCookieHeader(cookieHeader).split(";");
  for (const part of parts) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex < 0) continue;
    const key = part.slice(0, separatorIndex).trim();
    if (key !== safeName) continue;
    return part.slice(separatorIndex + 1).trim();
  }
  return "";
}

function normalizeVisitorId(value: unknown): string {
  const visitorId = typeof value === "string" ? value.trim() : "";
  return VISITOR_ID_PATTERN.test(visitorId) ? visitorId : "";
}

function toNonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function toBase64Url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function requireSigningSecret(secretInput: unknown): string {
  const secret = typeof secretInput === "string" ? secretInput.trim() : "";
  if (secret.length < 32) {
    throw new Error("PUBLIC_VISIT_SIGNING_SECRET debe tener al menos 32 caracteres.");
  }
  return secret;
}

function signTokenBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function parseTokenPayload(value: unknown): PublicVisitTokenPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as UnknownRecord;
  const slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
  const visitorHash =
    typeof raw.visitorHash === "string" ? raw.visitorHash.trim() : "";
  const nonce = typeof raw.nonce === "string" ? raw.nonce.trim() : "";
  const issuedAtMs = Number(raw.issuedAtMs);
  const expiresAtMs = Number(raw.expiresAtMs);

  if (
    raw.version !== 1 ||
    !slug ||
    !/^[a-f0-9]{64}$/.test(visitorHash) ||
    !VISITOR_ID_PATTERN.test(nonce) ||
    !Number.isFinite(issuedAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= issuedAtMs
  ) {
    return null;
  }

  return {
    version: 1,
    slug,
    visitorHash,
    nonce,
    issuedAtMs: Math.round(issuedAtMs),
    expiresAtMs: Math.round(expiresAtMs),
  };
}

export function resolvePublicVisitorIdentity(params: {
  cookieHeader: unknown;
  generateVisitorId?: () => string;
}): PublicVisitorIdentity {
  const existing = normalizeVisitorId(
    getCookieValue(params.cookieHeader, PUBLIC_VISITOR_COOKIE_NAME)
  );
  if (existing) {
    return { visitorId: existing, isNew: false };
  }

  const generated = normalizeVisitorId(
    params.generateVisitorId?.() || randomBytes(16).toString("base64url")
  );
  if (!generated) {
    throw new Error("No se pudo generar una identidad publica valida.");
  }
  return { visitorId: generated, isNew: true };
}

export function buildPublicVisitorCookieHeader(params: {
  visitorId: string;
  secure: boolean;
}): string {
  const visitorId = normalizeVisitorId(params.visitorId);
  if (!visitorId) throw new Error("Identidad publica invalida.");

  return [
    `${PUBLIC_VISITOR_COOKIE_NAME}=${visitorId}`,
    "Path=/i",
    `Max-Age=${PUBLIC_VISITOR_COOKIE_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
    params.secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function hashPublicVisitorForSlug(slug: string, visitorId: string): string {
  const safeSlug = String(slug || "").trim();
  const safeVisitorId = normalizeVisitorId(visitorId);
  if (!safeSlug || !safeVisitorId) {
    throw new Error("No se puede derivar una identidad de visita sin slug y visitante.");
  }
  return createHash("sha256")
    .update(`${safeSlug}\u0000${safeVisitorId}`)
    .digest("hex");
}

export function createPublicVisitToken(params: {
  slug: string;
  visitorHash: string;
  secret: string;
  nowMs?: number;
  nonce?: string;
}): string {
  const secret = requireSigningSecret(params.secret);
  const nowMs = Number.isFinite(params.nowMs) ? Math.round(params.nowMs as number) : Date.now();
  const nonce = normalizeVisitorId(
    params.nonce || randomBytes(16).toString("base64url")
  );
  const visitorHash = String(params.visitorHash || "").trim();
  const slug = String(params.slug || "").trim();
  if (!slug || !/^[a-f0-9]{64}$/.test(visitorHash) || !nonce) {
    throw new Error("Datos invalidos para firmar una visita publica.");
  }

  const payload: PublicVisitTokenPayload = {
    version: 1,
    slug,
    visitorHash,
    nonce,
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + PUBLIC_VISIT_TOKEN_TTL_MS,
  };
  const body = toBase64Url(JSON.stringify(payload));
  return `${body}.${signTokenBody(body, secret)}`;
}

export function verifyPublicVisitToken(params: {
  token: unknown;
  slug: string;
  visitorHash: string;
  secret: string;
  nowMs?: number;
}): PublicVisitTokenPayload | null {
  const secret = requireSigningSecret(params.secret);
  const token = typeof params.token === "string" ? params.token.trim() : "";
  const [body, signature, ...extra] = token.split(".");
  if (
    extra.length ||
    !body ||
    !signature ||
    !TOKEN_PART_PATTERN.test(body) ||
    !TOKEN_PART_PATTERN.test(signature)
  ) {
    return null;
  }

  const expected = Buffer.from(signTokenBody(body, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }

  let payload: PublicVisitTokenPayload | null = null;
  try {
    payload = parseTokenPayload(JSON.parse(fromBase64Url(body).toString("utf8")));
  } catch {
    return null;
  }
  if (!payload) return null;

  const nowMs = Number.isFinite(params.nowMs) ? Math.round(params.nowMs as number) : Date.now();
  const safeSlug = String(params.slug || "").trim();
  const safeVisitorHash = String(params.visitorHash || "").trim();
  if (
    payload.slug !== safeSlug ||
    payload.visitorHash !== safeVisitorHash ||
    payload.expiresAtMs < nowMs ||
    payload.issuedAtMs > nowMs + 60_000
  ) {
    return null;
  }
  return payload;
}

export function buildPublicVisitEventId(slug: string, nonce: string): string {
  const safeSlug = String(slug || "").trim();
  const safeNonce = normalizeVisitorId(nonce);
  if (!safeSlug || !safeNonce) throw new Error("Evento de visita invalido.");
  return createHash("sha256").update(`${safeSlug}\u0000${safeNonce}`).digest("hex");
}

export function injectPublicVisitRuntime(htmlInput: unknown, token: string): string {
  const html = String(htmlInput || "");
  if (!html || html.includes(PUBLIC_VISIT_RUNTIME_MARKER)) return html;

  const serializedToken = JSON.stringify(String(token || ""));
  const runtime = `
  <script ${PUBLIC_VISIT_RUNTIME_MARKER}>
    (function(){
      var sent = false;
      var token = ${serializedToken};
      function sendVisit(){
        if (sent || !token) return;
        sent = true;
        var endpoint = window.location.pathname.replace(/\\/+$/, "") + "/visit";
        fetch(endpoint, {
          method: "POST",
          credentials: "same-origin",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token })
        }).catch(function(){});
      }
      function sendWhenVisible(){
        if (document.visibilityState === "visible") {
          sendVisit();
          return;
        }
        function onVisibilityChange(){
          if (document.visibilityState !== "visible") return;
          document.removeEventListener("visibilitychange", onVisibilityChange);
          sendVisit();
        }
        document.addEventListener("visibilitychange", onVisibilityChange);
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", sendWhenVisible, { once: true });
      } else {
        sendWhenVisible();
      }
    })();
  </script>`;

  const closingBodyIndex = html.toLowerCase().lastIndexOf("</body>");
  if (closingBodyIndex < 0) return `${html}${runtime}`;
  return `${html.slice(0, closingBodyIndex)}${runtime}\n${html.slice(closingBodyIndex)}`;
}

export function normalizePublicationMetricSlugs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  value.forEach((item) => {
    const slug = typeof item === "string" ? item.trim() : "";
    if (slug) unique.add(slug);
  });
  return Array.from(unique).slice(0, MAX_PUBLICATION_METRIC_SLUGS);
}

export async function readPublicationVisitCounts(
  publicationRef: DocumentReferenceLike
): Promise<PublicVisitCounts> {
  const [totalSnapshot, uniqueSnapshot] = await Promise.all([
    publicationRef
      .collection("visits")
      .where("schemaVersion", "==", PUBLIC_VISIT_MEASUREMENT_SCHEMA_VERSION)
      .count()
      .get(),
    publicationRef
      .collection("uniqueVisitors")
      .where("schemaVersion", "==", PUBLIC_VISIT_MEASUREMENT_SCHEMA_VERSION)
      .count()
      .get(),
  ]);

  const totalVisits = toNonNegativeInteger(totalSnapshot.data().count);
  return {
    totalVisits,
    uniqueVisits: Math.min(
      toNonNegativeInteger(uniqueSnapshot.data().count),
      totalVisits
    ),
  };
}

export async function recordPublicVisitAtomically(params: {
  runTransaction<T>(callback: (transaction: TransactionLike) => Promise<T>): Promise<T>;
  publicationRef: DocumentReferenceLike;
  eventId: string;
  visitorHash: string;
  createdAtValue: unknown;
}): Promise<"created" | "duplicate" | "unavailable"> {
  const eventRef = params.publicationRef.collection("visits").doc(params.eventId);
  const uniqueVisitorRef = params.publicationRef
    .collection("uniqueVisitors")
    .doc(params.visitorHash);

  return params.runTransaction(async (transaction) => {
    const [publicationSnap, eventSnap, uniqueVisitorSnap] = await Promise.all([
      transaction.get(params.publicationRef),
      transaction.get(eventRef),
      transaction.get(uniqueVisitorRef),
    ]);

    if (!publicationSnap.exists) return "unavailable";
    const lifecycle = resolvePublicationLifecycleSnapshotFromData(
      publicationSnap.data() || {}
    );
    if (
      !lifecycle.rawPublicState ||
      !lifecycle.isPubliclyAccessibleByState ||
      lifecycle.isExpired
    ) {
      return "unavailable";
    }
    if (eventSnap.exists) return "duplicate";

    transaction.create(eventRef, {
      schemaVersion: PUBLIC_VISIT_MEASUREMENT_SCHEMA_VERSION,
      source: "public-delivery-runtime",
      createdAt: params.createdAtValue,
    });
    if (!uniqueVisitorSnap.exists) {
      transaction.create(uniqueVisitorRef, {
        schemaVersion: PUBLIC_VISIT_MEASUREMENT_SCHEMA_VERSION,
        firstSeenAt: params.createdAtValue,
      });
    }
    return "created";
  });
}
