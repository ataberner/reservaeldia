import { createHash } from "crypto";
import { JSDOM } from "jsdom";
import sharp from "sharp";
import {
  captureFirstSectionShareImage,
  type CaptureFirstSectionShareImageParams,
  type ShareImageRenderDiagnostics,
  type ShareImageRenderSubstage,
} from "./publishedShareImageRenderer";

export const PUBLISHED_SHARE_IMAGE_WIDTH = 1200;
export const PUBLISHED_SHARE_IMAGE_HEIGHT = 630;
export const PUBLISHED_SHARE_IMAGE_QUALITY = 85;
export const PUBLISHED_SHARE_IMAGE_TIMEOUT_MS = 15000;
export const PUBLISHED_SHARE_IMAGE_RENDER_DELAY_MS = 15000;
export const PUBLISHED_SHARE_IMAGE_MIME_TYPE = "image/jpeg";
const MAX_PUBLIC_SHARE_IMAGE_VALIDATION_BYTES = 5 * 1024 * 1024;
export const DEFAULT_STATIC_SHARE_IMAGE_URL =
  "https://reservaeldia.com.ar/assets/img/default-share.jpg";
const SHARE_IMAGE_PIPELINE_SUBSTAGES = Object.freeze({
  PREPARING_RENDERER_HTML: {
    key: "preparing_renderer_html",
    label: "Preparando HTML para imagen",
  },
  CAPTURING_IMAGE: {
    key: "capturing_image",
    label: "Capturando imagen",
  },
  OPTIMIZING_IMAGE: {
    key: "optimizing_image",
    label: "Optimizando imagen",
  },
  SAVING_IMAGE: {
    key: "saving_image",
    label: "Guardando imagen",
  },
  CONFIRMING_IMAGE: {
    key: "confirming_image",
    label: "Confirmando imagen",
  },
});

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
  shareImageDiagnostics?: ShareImageRenderDiagnostics;
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
  shareImageDiagnostics?: ShareImageRenderDiagnostics;
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

function callShareImageDiagnostic(
  diagnostics: ShareImageRenderDiagnostics | undefined,
  method: keyof ShareImageRenderDiagnostics,
  ...args: unknown[]
): void {
  const handler = diagnostics?.[method] as
    | ((...input: unknown[]) => Promise<void> | void)
    | undefined;
  if (typeof handler !== "function") return;

  try {
    Promise.resolve(handler(...args)).catch(() => undefined);
  } catch {
    // Diagnostics must not affect the publish contract.
  }
}

async function runShareImagePipelineSubstage<T>(
  diagnostics: ShareImageRenderDiagnostics | undefined,
  substage: ShareImageRenderSubstage,
  context: Record<string, unknown>,
  operation: () => Promise<T> | T,
  getCompleteContext?: (result: T) => Record<string, unknown>
): Promise<T> {
  callShareImageDiagnostic(diagnostics, "startSubstage", substage, context);
  try {
    const result = await operation();
    callShareImageDiagnostic(diagnostics, "completeSubstage", substage, {
      ...context,
      ...(getCompleteContext ? getCompleteContext(result) : {}),
    });
    return result;
  } catch (error) {
    callShareImageDiagnostic(diagnostics, "failSubstage", error, {
      substage: substage.key,
      substageLabel: substage.label,
      ...context,
    });
    throw error;
  }
}

function extractHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function collectShareImageHtmlDiagnostics(html: string): Record<string, unknown> {
  const htmlBytes = Buffer.byteLength(String(html || ""), "utf8");
  try {
    const dom = new JSDOM(String(html || ""));
    const { document } = dom.window;
    const images = Array.from(document.querySelectorAll("img"));
    const firstSection = document.querySelector(".inv > .sec:first-child");
    const firstSectionImages = firstSection
      ? Array.from(firstSection.querySelectorAll("img"))
      : [];
    const links = Array.from(document.querySelectorAll("link[href]"));
    const externalHosts = new Set<string>();

    images.forEach((image) => {
      const src = getString(image.getAttribute("src"));
      const host = src ? extractHost(src) : "";
      if (host) externalHosts.add(host);
    });
    links.forEach((link) => {
      const href = getString(link.getAttribute("href"));
      const host = href ? extractHost(href) : "";
      if (host) externalHosts.add(host);
    });

    const fontStylesheetLinks = links.filter((link) => {
      const href = getString(link.getAttribute("href")).toLowerCase();
      const rel = getString(link.getAttribute("rel")).toLowerCase();
      return (
        rel.includes("stylesheet") &&
        (href.includes("fonts.googleapis.com") ||
          href.includes("fonts.gstatic.com") ||
          href.includes("font"))
      );
    });

    return {
      htmlBytes,
      imageCount: images.length,
      firstSectionImageCount: firstSectionImages.length,
      outsideFirstSectionImageCount: Math.max(
        0,
        images.length - firstSectionImages.length
      ),
      lazyImageCount: images.filter(
        (image) => getString(image.getAttribute("loading")).toLowerCase() === "lazy"
      ).length,
      stylesheetCount: links.filter((link) =>
        getString(link.getAttribute("rel")).toLowerCase().includes("stylesheet")
      ).length,
      fontStylesheetCount: fontStylesheetLinks.length,
      cssFontFaceCount: (String(html || "").match(/@font-face/gi) || []).length,
      externalHostCount: externalHosts.size,
      externalHostsSample: Array.from(externalHosts).slice(0, 10),
      hasFirstSection: Boolean(firstSection),
    };
  } catch {
    return {
      htmlBytes,
      htmlDiagnosticsError: true,
    };
  }
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

export function preparePublishedShareImageHtml(html: string): string {
  const sourceHtml = String(html || "");
  if (!sourceHtml) return sourceHtml;

  try {
    const dom = new JSDOM(sourceHtml);
    const { document } = dom.window;

    document
      .querySelectorAll(
        ".objeto.mapa-google,[data-type='mapa-google'],iframe[src*='google.com/maps/embed'],iframe[src*='www.google.com/maps/embed']"
      )
      .forEach((element) => {
        const wrapper = element.closest?.(".objeto.mapa-google,[data-type='mapa-google']");
        (wrapper || element).remove();
      });

    return dom.serialize();
  } catch {
    return sourceHtml;
  }
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
  const diagnostics = params.shareImageDiagnostics;
  const rendererHtml = await runShareImagePipelineSubstage(
    diagnostics,
    SHARE_IMAGE_PIPELINE_SUBSTAGES.PREPARING_RENDERER_HTML,
    {
      publicSlug: params.publicSlug,
      renderTimeoutMs,
      baseHtmlBytes: Buffer.byteLength(String(params.baseHtml || ""), "utf8"),
    },
    () => preparePublishedShareImageHtml(params.baseHtml),
    (html) => collectShareImageHtmlDiagnostics(html)
  );
  callShareImageDiagnostic(diagnostics, "recordDiagnostics", {
    publicSlug: params.publicSlug,
    renderTimeoutMs,
    renderDelayMs,
    jpegQuality,
    ...collectShareImageHtmlDiagnostics(rendererHtml),
  });
  const renderParams = {
    html: rendererHtml,
    width: PUBLISHED_SHARE_IMAGE_WIDTH,
    height: PUBLISHED_SHARE_IMAGE_HEIGHT,
    quality: jpegQuality,
    timeoutMs: renderTimeoutMs,
    delayMs: renderDelayMs,
    diagnostics,
  };
  const generatedInput = params.generateShareImage
    ? await runShareImagePipelineSubstage(
        diagnostics,
        SHARE_IMAGE_PIPELINE_SUBSTAGES.CAPTURING_IMAGE,
        {
          publicSlug: params.publicSlug,
          renderTimeoutMs,
          injectedShareRenderer: true,
        },
        () =>
          withTimeout(
            params.generateShareImage!(renderParams),
            renderTimeoutMs,
            "renderer-timeout"
          )
      )
    : await captureFirstSectionShareImage(renderParams);
  const generated = await runShareImagePipelineSubstage(
    diagnostics,
    SHARE_IMAGE_PIPELINE_SUBSTAGES.OPTIMIZING_IMAGE,
    {
      publicSlug: params.publicSlug,
      jpegQuality,
      rawBytes: Buffer.isBuffer(generatedInput)
        ? generatedInput.length
        : generatedInput.buffer?.length || null,
    },
    () => normalizeGeneratedShareImageBuffer(generatedInput, jpegQuality),
    (normalized) => ({
      normalizedBytes: normalized.buffer.length,
      width: normalized.width || null,
      height: normalized.height || null,
      mimeType: normalized.mimeType || null,
    })
  );

  if (generated.buffer.length > 300 * 1024) {
    params.warn?.("Imagen share generada supera el tamano objetivo", {
      publicSlug: params.publicSlug,
      byteLength: generated.buffer.length,
      targetBytes: 300 * 1024,
    });
  }

  const storagePath = buildGeneratedShareStoragePath(params.publicSlug);
  await runShareImagePipelineSubstage(
    diagnostics,
    SHARE_IMAGE_PIPELINE_SUBSTAGES.SAVING_IMAGE,
    {
      publicSlug: params.publicSlug,
      storagePath,
      byteLength: generated.buffer.length,
      contentType: PUBLISHED_SHARE_IMAGE_MIME_TYPE,
    },
    async () => {
      try {
        await params.saveGeneratedShareImage({
          storagePath,
          image: generated.buffer,
          contentType: PUBLISHED_SHARE_IMAGE_MIME_TYPE,
          cacheControl: "public,max-age=31536000,immutable",
        });
      } catch (error) {
        params.warn?.("No se pudo guardar imagen share generada", {
          publicSlug: params.publicSlug,
          storagePath,
          error: error instanceof Error ? error.message : String(error || ""),
        });
        throw new Error("share-upload-failed");
      }
    }
  );

  await runShareImagePipelineSubstage(
    diagnostics,
    SHARE_IMAGE_PIPELINE_SUBSTAGES.CONFIRMING_IMAGE,
    {
      publicSlug: params.publicSlug,
      storagePath,
    },
    async () => {
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
      return confirmed;
    },
    (confirmed) => ({
      confirmed,
    })
  );

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
    callShareImageDiagnostic(params.shareImageDiagnostics, "recordDiagnostics", {
      publicSlug: params.publicSlug,
      fallbackReason,
      errorCode,
      renderTimeoutMs: params.renderTimeoutMs || PUBLISHED_SHARE_IMAGE_TIMEOUT_MS,
    });
    params.warn?.("No se pudo generar imagen share publicada; se bloquea publish", {
      publicSlug: params.publicSlug,
      fallbackReason,
      errorCode,
      renderTimeoutMs: params.renderTimeoutMs || PUBLISHED_SHARE_IMAGE_TIMEOUT_MS,
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
