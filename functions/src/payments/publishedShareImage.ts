import { createHash } from "crypto";
import sharp from "sharp";
import {
  captureFirstSectionShareImage,
  type CaptureFirstSectionShareImageParams,
} from "./publishedShareImageRenderer";

export const PUBLISHED_SHARE_IMAGE_WIDTH = 1200;
export const PUBLISHED_SHARE_IMAGE_HEIGHT = 630;
export const PUBLISHED_SHARE_IMAGE_QUALITY = 85;
export const PUBLISHED_SHARE_IMAGE_TIMEOUT_MS = 7000;
export const PUBLISHED_SHARE_IMAGE_RENDER_DELAY_MS = 15000;
export const PUBLISHED_SHARE_IMAGE_MIME_TYPE = "image/jpeg";
const MAX_PUBLIC_SHARE_IMAGE_VALIDATION_BYTES = 5 * 1024 * 1024;
export const DEFAULT_STATIC_SHARE_IMAGE_URL =
  "https://reservaeldia.com.ar/assets/img/default-share.jpg";

type PublishedShareStatus = "generated" | "fallback";
type PublishedShareSource =
  | "renderer"
  | "published-html-first-section"
  | "portada"
  | "template-share-image"
  | "static-default";
type PublishedShareFallbackSource =
  | "portada"
  | "template-share-image"
  | "static-default";

export type PublishedShareFallbackReason =
  | "disabled"
  | "renderer-timeout"
  | "renderer-error"
  | "missing-first-section"
  | "invalid-generated-image"
  | "share-upload-failed"
  | "invalid-portada"
  | "missing-template-share-image"
  | null;

export type PublishedShareMetadata = {
  status: PublishedShareStatus;
  source: PublishedShareSource;
  storagePath: string | null;
  imageUrl: string;
  width: 1200;
  height: 630;
  mimeType: "image/jpeg";
  version: string;
  generatedAt: unknown;
  fallbackReason?: PublishedShareFallbackReason;
  errorCode?: string | null;
};

export type GeneratedShareImageResult = {
  buffer: Buffer;
  width?: number;
  height?: number;
  mimeType?: string;
};

export type ResolvePublishedShareImageParams = {
  publicSlug: string;
  publicUrl: string;
  baseHtml: string;
  title: string;
  description: string;
  portada?: string | null;
  templateId?: string | null;
  generatedAt: unknown;
  shareImageEnabled?: boolean;
  defaultShareImageUrl?: string;
  renderTimeoutMs?: number;
  renderDelayMs?: number;
  jpegQuality?: number;
  generatedSource?: "published-html-first-section" | "renderer";
  generateShareImage?(
    params: CaptureFirstSectionShareImageParams
  ): Promise<Buffer | GeneratedShareImageResult>;
  saveGeneratedShareImage?(params: {
    storagePath: string;
    image: Buffer;
    contentType: "image/jpeg";
    cacheControl: string;
  }): Promise<void>;
  confirmGeneratedShareImage?(params: { storagePath: string }): Promise<boolean>;
  validatePublicImageUrl?(params: {
    imageUrl: string;
    source: PublishedShareFallbackSource;
  }): Promise<boolean>;
  loadTemplateShareImageUrl?(params: { templateId: string }): Promise<string | null>;
  warn?(message: string, context: Record<string, unknown>): void;
};

export type ResolveGeneratedPublishedShareImageParams = {
  publicSlug: string;
  publicUrl: string;
  baseHtml: string;
  generatedAt: unknown;
  shareImageEnabled?: boolean;
  renderTimeoutMs?: number;
  renderDelayMs?: number;
  jpegQuality?: number;
  generatedSource?: "published-html-first-section" | "renderer";
  generateShareImage?(
    params: CaptureFirstSectionShareImageParams
  ): Promise<Buffer | GeneratedShareImageResult>;
  saveGeneratedShareImage(params: {
    storagePath: string;
    image: Buffer;
    contentType: "image/jpeg";
    cacheControl: string;
  }): Promise<void>;
  confirmGeneratedShareImage(params: { storagePath: string }): Promise<boolean>;
  warn?(message: string, context: Record<string, unknown>): void;
};

export type OpenGraphMetadataInput = {
  title: string;
  description: string;
  imageUrl: string;
  url: string;
  imageWidth?: number;
  imageHeight?: number;
};

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getErrorCode(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error || "renderer-error");
  if (message === "disabled") return "disabled";
  if (message === "renderer-not-configured") return "renderer-not-configured";
  if (message === "missing-first-section") return "missing-first-section";
  if (/timeout/i.test(message)) return "renderer-timeout";
  return message.slice(0, 120) || "renderer-error";
}

function getFallbackReasonFromError(error: unknown): PublishedShareFallbackReason {
  const code = getErrorCode(error);
  if (code === "disabled") return "disabled";
  if (code === "missing-first-section") return "missing-first-section";
  if (code === "renderer-timeout") return "renderer-timeout";
  if (code === "invalid-generated-image") return "invalid-generated-image";
  if (code === "share-upload-failed") return "share-upload-failed";
  return "renderer-error";
}

function buildGeneratedShareStoragePath(publicSlug: string): string {
  return `publicadas/${publicSlug}/share.jpg`;
}

function createVersion(seed: Buffer | string): string {
  return createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

function createVersionSeed(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    const maybeTimestamp = value as {
      toDate?: () => Date;
      toMillis?: () => number;
      seconds?: number;
      nanoseconds?: number;
    };

    if (typeof maybeTimestamp.toDate === "function") {
      return maybeTimestamp.toDate().toISOString();
    }
    if (typeof maybeTimestamp.toMillis === "function") {
      return String(maybeTimestamp.toMillis());
    }
    if (
      Number.isFinite(maybeTimestamp.seconds) ||
      Number.isFinite(maybeTimestamp.nanoseconds)
    ) {
      return `${maybeTimestamp.seconds || 0}:${maybeTimestamp.nanoseconds || 0}`;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value ?? "");
}

function createShareVersion(parts: unknown[]): string {
  return createVersion(parts.map((part) => createVersionSeed(part)).join("|"));
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorCode: string
): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(errorCode)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function appendVersionParam(rawUrl: string, version: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.set("v", version);
    return parsed.toString();
  } catch {
    const separator = rawUrl.includes("?") ? "&" : "?";
    return `${rawUrl}${separator}v=${encodeURIComponent(version)}`;
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function isPublishedShareImageEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return getString(env.PUBLISH_SHARE_IMAGE_ENABLED) !== "0";
}

export function getDefaultStaticShareImageUrl(
  env: Record<string, string | undefined> = process.env
): string {
  return getString(env.PUBLISH_SHARE_IMAGE_DEFAULT_URL) || DEFAULT_STATIC_SHARE_IMAGE_URL;
}

export function extractTemplateShareImageUrl(
  templateData: Record<string, unknown> | null | undefined
): string | null {
  if (!templateData || typeof templateData !== "object") return null;
  const share =
    templateData.share && typeof templateData.share === "object"
      ? (templateData.share as Record<string, unknown>)
      : {};
  return getString(share.imageUrl) || null;
}

async function defaultValidatePublicImageUrl(params: {
  imageUrl: string;
}): Promise<boolean> {
  const imageUrl = getString(params.imageUrl);
  if (!isHttpsUrl(imageUrl)) return false;

  const fetchImpl = (globalThis as any).fetch;
  const AbortControllerCtor = (globalThis as any).AbortController;
  if (typeof fetchImpl !== "function" || typeof AbortControllerCtor !== "function") {
    return false;
  }

  async function request() {
    const controller = new AbortControllerCtor();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      return await fetchImpl(imageUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  try {
    const response = await request();
    const contentType = String(response.headers?.get?.("content-type") || "");
    if (!response.ok || !/^image\/jpeg\b/i.test(contentType)) return false;

    const contentLength = Number(response.headers?.get?.("content-length") || 0);
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_PUBLIC_SHARE_IMAGE_VALIDATION_BYTES
    ) {
      return false;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > MAX_PUBLIC_SHARE_IMAGE_VALIDATION_BYTES) return false;

    return isCompliantPublishedShareImageBuffer(buffer);
  } catch {
    return false;
  }
}

function normalizeGeneratedImageInput(
  raw: Buffer | GeneratedShareImageResult
): GeneratedShareImageResult {
  const result = Buffer.isBuffer(raw) ? { buffer: raw } : raw;
  if (!result || !Buffer.isBuffer(result.buffer) || result.buffer.length === 0) {
    throw new Error("invalid-generated-image");
  }

  if (
    typeof result.width !== "undefined" &&
    result.width !== PUBLISHED_SHARE_IMAGE_WIDTH
  ) {
    throw new Error("invalid-generated-image");
  }

  if (
    typeof result.height !== "undefined" &&
    result.height !== PUBLISHED_SHARE_IMAGE_HEIGHT
  ) {
    throw new Error("invalid-generated-image");
  }

  if (
    typeof result.mimeType !== "undefined" &&
    result.mimeType !== PUBLISHED_SHARE_IMAGE_MIME_TYPE
  ) {
    throw new Error("invalid-generated-image");
  }

  return result;
}

async function readShareImageMetadata(buffer: Buffer): Promise<{
  format?: string;
  width?: number;
  height?: number;
}> {
  try {
    const metadata = await sharp(buffer, {
      animated: false,
      failOnError: false,
    }).metadata();
    return {
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
    };
  } catch {
    throw new Error("invalid-generated-image");
  }
}

export async function isCompliantPublishedShareImageBuffer(
  buffer: Buffer
): Promise<boolean> {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;
  try {
    const metadata = await readShareImageMetadata(buffer);
    return (
      metadata.format === "jpeg" &&
      metadata.width === PUBLISHED_SHARE_IMAGE_WIDTH &&
      metadata.height === PUBLISHED_SHARE_IMAGE_HEIGHT
    );
  } catch {
    return false;
  }
}

export async function normalizeGeneratedShareImageBuffer(
  raw: Buffer | GeneratedShareImageResult,
  quality = PUBLISHED_SHARE_IMAGE_QUALITY
): Promise<GeneratedShareImageResult> {
  const result = normalizeGeneratedImageInput(raw);
  const metadata = await readShareImageMetadata(result.buffer);

  if (
    metadata.width !== PUBLISHED_SHARE_IMAGE_WIDTH ||
    typeof metadata.height !== "number" ||
    metadata.height < PUBLISHED_SHARE_IMAGE_HEIGHT ||
    !metadata.format
  ) {
    throw new Error("invalid-generated-image");
  }

  const image = sharp(result.buffer, {
    animated: false,
    failOnError: false,
  });
  const pipeline =
    metadata.height > PUBLISHED_SHARE_IMAGE_HEIGHT
      ? image.extract({
          left: 0,
          top: 0,
          width: PUBLISHED_SHARE_IMAGE_WIDTH,
          height: PUBLISHED_SHARE_IMAGE_HEIGHT,
        })
      : image;
  const normalizedBuffer = await pipeline
    .jpeg({ quality })
    .toBuffer()
    .catch(() => {
      throw new Error("invalid-generated-image");
    });

  const isCompliant = await isCompliantPublishedShareImageBuffer(normalizedBuffer);
  if (!isCompliant) {
    throw new Error("invalid-generated-image");
  }

  return {
    buffer: normalizedBuffer,
    width: PUBLISHED_SHARE_IMAGE_WIDTH,
    height: PUBLISHED_SHARE_IMAGE_HEIGHT,
    mimeType: PUBLISHED_SHARE_IMAGE_MIME_TYPE,
  };
}

export function isCurrentGeneratedShareImageRequest(params: {
  publicationData: Record<string, unknown> | null | undefined;
  publicSlug: string;
  requestedVersion: string | null | undefined;
}): boolean {
  const share =
    params.publicationData?.share && typeof params.publicationData.share === "object"
      ? (params.publicationData.share as Record<string, unknown>)
      : null;
  if (!share) return false;

  const version = getString(share.version);
  const source = getString(share.source);
  return (
    getString(share.status) === "generated" &&
    (source === "published-html-first-section" || source === "renderer") &&
    getString(share.storagePath) === buildGeneratedShareStoragePath(params.publicSlug) &&
    Boolean(version) &&
    getString(params.requestedVersion) === version
  );
}

async function resolveGeneratedShareMetadata(
  params: ResolveGeneratedPublishedShareImageParams
): Promise<PublishedShareMetadata> {
  if (params.shareImageEnabled === false) {
    throw new Error("disabled");
  }

  if (
    typeof params.saveGeneratedShareImage !== "function" ||
    typeof params.confirmGeneratedShareImage !== "function"
  ) {
    throw new Error("renderer-not-configured");
  }

  const renderTimeoutMs = params.renderTimeoutMs || PUBLISHED_SHARE_IMAGE_TIMEOUT_MS;
  const renderDelayMs = Math.max(0, Math.floor(params.renderDelayMs || 0));
  const jpegQuality = params.jpegQuality || PUBLISHED_SHARE_IMAGE_QUALITY;
  const generatedSource = params.generatedSource || "renderer";
  const renderParams = {
    html: params.baseHtml,
    width: PUBLISHED_SHARE_IMAGE_WIDTH,
    height: PUBLISHED_SHARE_IMAGE_HEIGHT,
    quality: jpegQuality,
    timeoutMs: renderTimeoutMs,
    delayMs: renderDelayMs,
  };
  const generatedInput = params.generateShareImage
    ? await withTimeout(
        params.generateShareImage(renderParams),
        renderTimeoutMs,
        "renderer-timeout"
      )
    : await captureFirstSectionShareImage(renderParams);
  const generated = await normalizeGeneratedShareImageBuffer(
    generatedInput,
    jpegQuality
  );

  if (generated.buffer.length > 300 * 1024) {
    params.warn?.("Imagen share generada supera el tamano objetivo", {
      publicSlug: params.publicSlug,
      byteLength: generated.buffer.length,
      targetBytes: 300 * 1024,
    });
  }

  const storagePath = buildGeneratedShareStoragePath(params.publicSlug);
  await params.saveGeneratedShareImage({
    storagePath,
    image: generated.buffer,
    contentType: PUBLISHED_SHARE_IMAGE_MIME_TYPE,
    cacheControl: "public,max-age=31536000,immutable",
  });

  const confirmed = await params.confirmGeneratedShareImage({ storagePath }).catch(
    (error) => {
      params.warn?.("No se pudo confirmar imagen share generada", {
        publicSlug: params.publicSlug,
        storagePath,
        error: error instanceof Error ? error.message : String(error || ""),
      });
      return false;
    }
  );
  if (!confirmed) {
    throw new Error("share-upload-failed");
  }

  const imageDigest = createVersion(generated.buffer);
  const version = createShareVersion([
    generatedSource,
    params.publicSlug,
    imageDigest,
    params.generatedAt,
  ]);
  return {
    status: "generated",
    source: generatedSource,
    storagePath,
    imageUrl: appendVersionParam(`${params.publicUrl}/share.jpg`, version),
    width: PUBLISHED_SHARE_IMAGE_WIDTH,
    height: PUBLISHED_SHARE_IMAGE_HEIGHT,
    mimeType: PUBLISHED_SHARE_IMAGE_MIME_TYPE,
    version,
    generatedAt: params.generatedAt,
    fallbackReason: null,
    errorCode: null,
  };
}

export async function resolveRequiredGeneratedPublishedShareImageMetadata(
  params: ResolveGeneratedPublishedShareImageParams
): Promise<PublishedShareMetadata> {
  try {
    return await resolveGeneratedShareMetadata(params);
  } catch (error) {
    const fallbackReason = getFallbackReasonFromError(error);
    const errorCode = getErrorCode(error);
    params.warn?.("No se pudo generar imagen share publicada; se bloquea publish", {
      publicSlug: params.publicSlug,
      fallbackReason,
      errorCode,
    });
    throw new Error(errorCode);
  }
}

async function resolveFallbackShareMetadata(params: {
  publicSlug: string;
  portada: string | null;
  templateId: string | null;
  generatedAt: unknown;
  defaultShareImageUrl: string;
  fallbackReason: PublishedShareFallbackReason;
  errorCode: string | null;
  validatePublicImageUrl: NonNullable<
    ResolvePublishedShareImageParams["validatePublicImageUrl"]
  >;
  loadTemplateShareImageUrl?: ResolvePublishedShareImageParams["loadTemplateShareImageUrl"];
  warn?: ResolvePublishedShareImageParams["warn"];
}): Promise<PublishedShareMetadata> {
  const validateCandidate = async (
    imageUrl: string,
    source: PublishedShareFallbackSource
  ): Promise<boolean> => {
    try {
      return await params.validatePublicImageUrl({ imageUrl, source });
    } catch (error) {
      params.warn?.("No se pudo validar candidato de imagen share", {
        source,
        error: error instanceof Error ? error.message : String(error || ""),
      });
      return false;
    }
  };
  const portada = getString(params.portada);
  if (portada) {
    const isValidPortada = await validateCandidate(portada, "portada");
    if (isValidPortada) {
      const version = createShareVersion([
        "portada",
        params.publicSlug,
        portada,
        params.generatedAt,
      ]);
      return {
        status: "fallback",
        source: "portada",
        storagePath: null,
        imageUrl: appendVersionParam(portada, version),
        width: PUBLISHED_SHARE_IMAGE_WIDTH,
        height: PUBLISHED_SHARE_IMAGE_HEIGHT,
        mimeType: PUBLISHED_SHARE_IMAGE_MIME_TYPE,
        version,
        generatedAt: params.generatedAt,
        fallbackReason: params.fallbackReason,
        errorCode: params.errorCode,
      };
    }
  }

  const templateId = getString(params.templateId);
  if (templateId && params.loadTemplateShareImageUrl) {
    try {
      const templateShareImageUrl = getString(
        await params.loadTemplateShareImageUrl({ templateId })
      );
      if (templateShareImageUrl) {
        const isValidTemplateShareImage = await validateCandidate(
          templateShareImageUrl,
          "template-share-image"
        );
        if (isValidTemplateShareImage) {
          const version = createShareVersion([
            "template-share-image",
            params.publicSlug,
            templateShareImageUrl,
            params.generatedAt,
          ]);
          return {
            status: "fallback",
            source: "template-share-image",
            storagePath: null,
            imageUrl: appendVersionParam(templateShareImageUrl, version),
            width: PUBLISHED_SHARE_IMAGE_WIDTH,
            height: PUBLISHED_SHARE_IMAGE_HEIGHT,
            mimeType: PUBLISHED_SHARE_IMAGE_MIME_TYPE,
            version,
            generatedAt: params.generatedAt,
            fallbackReason: params.fallbackReason,
            errorCode: params.errorCode,
          };
        }
      }
    } catch (error) {
      params.warn?.("No se pudo resolver imagen share de plantilla", {
        templateId,
        error: error instanceof Error ? error.message : String(error || ""),
      });
    }
  }

  const defaultShareImageUrl = getString(params.defaultShareImageUrl);
  if (!isHttpsUrl(defaultShareImageUrl)) {
    throw new Error("static-default-share-image-url-invalid");
  }
  const isValidDefaultShareImage = await validateCandidate(
    defaultShareImageUrl,
    "static-default"
  );
  if (!isValidDefaultShareImage) {
    throw new Error("static-default-share-image-url-invalid");
  }

  const version = createShareVersion([
    "static-default",
    params.publicSlug,
    defaultShareImageUrl,
    params.generatedAt,
  ]);
  return {
    status: "fallback",
    source: "static-default",
    storagePath: null,
    imageUrl: appendVersionParam(defaultShareImageUrl, version),
    width: PUBLISHED_SHARE_IMAGE_WIDTH,
    height: PUBLISHED_SHARE_IMAGE_HEIGHT,
    mimeType: PUBLISHED_SHARE_IMAGE_MIME_TYPE,
    version,
    generatedAt: params.generatedAt,
    fallbackReason: params.fallbackReason,
    errorCode: params.errorCode,
  };
}

export async function resolvePublishedShareImageMetadata(
  params: ResolvePublishedShareImageParams
): Promise<PublishedShareMetadata> {
  const defaultShareImageUrl =
    getString(params.defaultShareImageUrl) || getDefaultStaticShareImageUrl();
  const validatePublicImageUrl =
    params.validatePublicImageUrl || defaultValidatePublicImageUrl;
  const fallbackBase = {
    publicSlug: params.publicSlug,
    portada: getString(params.portada) || null,
    templateId: getString(params.templateId) || null,
    generatedAt: params.generatedAt,
    defaultShareImageUrl,
    validatePublicImageUrl,
    loadTemplateShareImageUrl: params.loadTemplateShareImageUrl,
    warn: params.warn,
  };
  const canAttemptGenerated =
    params.shareImageEnabled !== false &&
    typeof params.saveGeneratedShareImage === "function" &&
    typeof params.confirmGeneratedShareImage === "function";

  if (!canAttemptGenerated) {
    return resolveFallbackShareMetadata({
      ...fallbackBase,
      fallbackReason: "disabled",
      errorCode: params.shareImageEnabled === false ? "disabled" : "renderer-not-configured",
    });
  }

  const saveGeneratedShareImage = params.saveGeneratedShareImage;
  const confirmGeneratedShareImage = params.confirmGeneratedShareImage;
  if (!saveGeneratedShareImage || !confirmGeneratedShareImage) {
    return resolveFallbackShareMetadata({
      ...fallbackBase,
      fallbackReason: "disabled",
      errorCode: "renderer-not-configured",
    });
  }

  try {
    return await resolveGeneratedShareMetadata({
      publicSlug: params.publicSlug,
      publicUrl: params.publicUrl,
      baseHtml: params.baseHtml,
      generatedAt: params.generatedAt,
      shareImageEnabled: params.shareImageEnabled,
      renderTimeoutMs: params.renderTimeoutMs,
      renderDelayMs: params.renderDelayMs,
      jpegQuality: params.jpegQuality,
      generatedSource: params.generatedSource || "published-html-first-section",
      generateShareImage: params.generateShareImage,
      saveGeneratedShareImage,
      confirmGeneratedShareImage,
      warn: params.warn,
    });
  } catch (error) {
    const fallbackReason = getFallbackReasonFromError(error);
    const errorCode = getErrorCode(error);
    params.warn?.("No se pudo generar imagen share publicada; se usa fallback", {
      publicSlug: params.publicSlug,
      fallbackReason,
      errorCode,
    });

    return resolveFallbackShareMetadata({
      ...fallbackBase,
      fallbackReason,
      errorCode,
    });
  }
}

function escapeHtmlAttribute(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#039;");
}

function metaTag(attribute: "property" | "name", key: string, value: unknown): string {
  return `<meta ${attribute}="${escapeHtmlAttribute(key)}" content="${escapeHtmlAttribute(
    value
  )}" />`;
}

function stripManagedOpenGraphTags(html: string): string {
  const managedKeys = [
    "og:title",
    "og:description",
    "og:image",
    "og:image:width",
    "og:image:height",
    "og:url",
    "og:type",
    "twitter:card",
  ];

  return managedKeys.reduce((currentHtml, key) => {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `\\s*<meta\\s+[^>]*(?:property|name)=["']${escapedKey}["'][^>]*>`,
      "gi"
    );
    return currentHtml.replace(pattern, "");
  }, html);
}

export function buildOpenGraphMetadataTags(input: OpenGraphMetadataInput): string {
  const width = input.imageWidth || PUBLISHED_SHARE_IMAGE_WIDTH;
  const height = input.imageHeight || PUBLISHED_SHARE_IMAGE_HEIGHT;
  return [
    metaTag("property", "og:title", input.title),
    metaTag("property", "og:description", input.description),
    metaTag("property", "og:image", input.imageUrl),
    metaTag("property", "og:image:width", String(width)),
    metaTag("property", "og:image:height", String(height)),
    metaTag("property", "og:url", input.url),
    metaTag("property", "og:type", "website"),
    metaTag("name", "twitter:card", "summary_large_image"),
  ].join("\n");
}

export function injectOpenGraphMetadata(
  html: string,
  input: OpenGraphMetadataInput
): string {
  const sourceHtml = String(html || "");
  const cleanedHtml = stripManagedOpenGraphTags(sourceHtml);
  const tags = buildOpenGraphMetadataTags(input);
  const insertion = `\n${tags}\n`;

  if (/<\/head\s*>/i.test(cleanedHtml)) {
    return cleanedHtml.replace(/<\/head\s*>/i, `${insertion}</head>`);
  }

  if (/<html[^>]*>/i.test(cleanedHtml)) {
    return cleanedHtml.replace(/<html[^>]*>/i, (match) => `${match}<head>${insertion}</head>`);
  }

  return `<head>${insertion}</head>${cleanedHtml}`;
}

export function buildPublicationOgDescription(): string {
  return "Invitacion digital publicada en Reserva el Dia.";
}
