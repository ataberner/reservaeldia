const SHARE_IMAGE_WIDTH = 1200;
const SHARE_IMAGE_HEIGHT = 630;
const SHARE_IMAGE_QUALITY = 85;
const SHARE_IMAGE_TIMEOUT_MS = 15000;
const SHARE_IMAGE_EFFECT_SETTLE_MAX_MS = 3500;
const SHARE_IMAGE_EFFECT_SETTLE_BUFFER_MS = 350;
const SHARE_IMAGE_LAYOUT_STABLE_MAX_MS = 450;
const SHARE_IMAGE_SCREENSHOT_RESERVED_MS = 5000;
const SHARE_IMAGE_MAX_CAPTURE_OFFSET_PX = 10000;

declare const document: any;
declare const window: any;
declare function requestAnimationFrame(callback: (...args: unknown[]) => void): number;

type BrowserLike = {
  newPage(): Promise<any>;
  close(): Promise<void>;
};

type PuppeteerLike = {
  launch(options: Record<string, unknown>): Promise<BrowserLike>;
};

type ChromiumLike = {
  args?: string[];
  executablePath?: () => Promise<string> | string;
  headless?: unknown;
};

type BrowserRuntime = {
  puppeteer: PuppeteerLike;
  chromium: ChromiumLike;
};

type CaptureRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ShareImageRenderSubstage = {
  key: string;
  label: string;
};

export type ShareImageRenderDiagnostics = {
  startSubstage?(
    substage: ShareImageRenderSubstage,
    context?: Record<string, unknown>
  ): Promise<void> | void;
  completeSubstage?(
    substage: ShareImageRenderSubstage,
    context?: Record<string, unknown>
  ): Promise<void> | void;
  failSubstage?(
    error: unknown,
    context?: Record<string, unknown>
  ): Promise<void> | void;
  recordDiagnostics?(context?: Record<string, unknown>): Promise<void> | void;
};

export type CaptureFirstSectionShareImageParams = {
  html: string;
  width?: number;
  height?: number;
  quality?: number;
  timeoutMs?: number;
  delayMs?: number;
  effectSettleMaxMs?: number;
  diagnostics?: ShareImageRenderDiagnostics;
};

export type CaptureFirstSectionShareImageDeps = {
  loadBrowserRuntime?: () => Promise<BrowserRuntime> | BrowserRuntime;
};

function loadBrowserRuntime(): BrowserRuntime {
  // Lazy-loaded by design: this keeps browser startup and dependency loading out
  // of cold paths that do not need social-image rendering.
  const loadedPuppeteer = require("puppeteer-core");
  const loadedChromium = require("@sparticuz/chromium");
  return {
    puppeteer: (loadedPuppeteer.default || loadedPuppeteer) as PuppeteerLike,
    chromium: (loadedChromium.default || loadedChromium) as ChromiumLike,
  };
}

async function resolveExecutablePath(chromium: ChromiumLike): Promise<string> {
  const localExecutablePath = String(
    process.env.PUPPETEER_EXECUTABLE_PATH || ""
  ).trim();
  if (localExecutablePath) {
    return localExecutablePath;
  }

  if (typeof chromium.executablePath !== "function") {
    throw new Error("chromium-executable-path-unavailable");
  }

  const executablePath = await chromium.executablePath();
  if (!executablePath) {
    throw new Error("chromium-executable-path-unavailable");
  }
  return executablePath;
}

function createRendererTimeoutError(): Error {
  return new Error("renderer-timeout");
}

function createInvalidCaptureRegionError(): Error {
  return new Error("invalid-capture-region");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || typeof value === "undefined") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeCaptureRegion(
  region: Record<string, unknown> | null | undefined,
  targetWidth: number,
  targetHeight: number
): CaptureRegion {
  const x = toFiniteNumber(region?.x);
  const y = toFiniteNumber(region?.y);
  if (x === null || y === null || x < 0 || y < 0) {
    throw createInvalidCaptureRegionError();
  }
  if (x > SHARE_IMAGE_MAX_CAPTURE_OFFSET_PX || y > SHARE_IMAGE_MAX_CAPTURE_OFFSET_PX) {
    throw createInvalidCaptureRegionError();
  }
  if (
    !Number.isFinite(targetWidth) ||
    !Number.isFinite(targetHeight) ||
    targetWidth <= 0 ||
    targetHeight <= 0
  ) {
    throw createInvalidCaptureRegionError();
  }

  return {
    x: Math.floor(x),
    y: Math.floor(y),
    width: Math.floor(targetWidth),
    height: Math.floor(targetHeight),
  };
}

const SHARE_IMAGE_RENDER_SUBSTAGES = Object.freeze({
  PREPARING_RENDERER: {
    key: "preparing_renderer",
    label: "Preparando renderer",
  },
  RESOLVING_CHROMIUM: {
    key: "resolving_chromium",
    label: "Resolviendo Chromium",
  },
  LAUNCHING_BROWSER: {
    key: "launching_browser",
    label: "Abriendo navegador",
  },
  LOADING_HTML: {
    key: "loading_html",
    label: "Cargando HTML",
  },
  WAITING_DOCUMENT: {
    key: "waiting_document",
    label: "Esperando documento",
  },
  WAITING_FONTS: {
    key: "waiting_fonts",
    label: "Cargando fuentes",
  },
  ISOLATING_FIRST_SECTION: {
    key: "isolating_first_section",
    label: "Aislando portada",
  },
  WAITING_IMAGES: {
    key: "waiting_images",
    label: "Cargando imagenes",
  },
  SETTLING_LAYOUT: {
    key: "settling_layout",
    label: "Estabilizando portada",
  },
  CAPTURING_SCREENSHOT: {
    key: "capturing_screenshot",
    label: "Capturando imagen",
  },
});

function getMemoryDiagnostics(): Record<string, unknown> {
  try {
    const memory = process.memoryUsage();
    return {
      memoryRssMb: Math.round(memory.rss / 1024 / 1024),
      memoryHeapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      memoryExternalMb: Math.round(memory.external / 1024 / 1024),
    };
  } catch {
    return {};
  }
}

export function parseCssTimeListForShareRenderer(value: unknown): number[] {
  return String(value || "")
    .split(",")
    .map((part) => {
      const raw = String(part || "").trim().toLowerCase();
      if (!raw) return 0;
      const numeric = Number.parseFloat(raw);
      if (!Number.isFinite(numeric)) return 0;
      return raw.endsWith("ms") ? numeric : numeric * 1000;
    });
}

function splitCssList(value: unknown): string[] {
  return String(value || "")
    .split(",")
    .map((part) => String(part || "").trim());
}

function getRepeatedListValue<T>(values: T[], index: number, fallback: T): T {
  if (!values.length) return fallback;
  const value = values[index % values.length];
  return typeof value === "undefined" ? fallback : value;
}

function hasKnownEntranceClass(className: string): boolean {
  return /(^|\s)(mefx-reveal-init|mefx-reveal-on|mefx-zoom-init|mefx-zoom-on|mefx-draw-init|mefx-draw-on|mefx-stagger-item|mefx-stagger-on|cdv2-entry-up|cdv2-entry-fade|cdv2-entry-scale)(\s|$)/.test(
    className
  );
}

export function resolveFiniteCssMotionWaitMsForShareRenderer(snapshot: {
  className?: unknown;
  dataMotion?: unknown;
  animationName?: unknown;
  animationDuration?: unknown;
  animationDelay?: unknown;
  animationIterationCount?: unknown;
  transitionDuration?: unknown;
  transitionDelay?: unknown;
}): number {
  const className = String(snapshot.className || "");
  const dataMotion = String(snapshot.dataMotion || "").trim().toLowerCase();
  const isKnownEntrance =
    hasKnownEntranceClass(className) ||
    dataMotion === "reveal" ||
    dataMotion === "zoom" ||
    dataMotion === "draw";
  if (!isKnownEntrance) return 0;

  const transitionDurations = parseCssTimeListForShareRenderer(
    snapshot.transitionDuration
  );
  const transitionDelays = parseCssTimeListForShareRenderer(snapshot.transitionDelay);
  const transitionCount = Math.max(
    transitionDurations.length,
    transitionDelays.length
  );
  let maxWaitMs = 0;
  for (let index = 0; index < transitionCount; index += 1) {
    const duration = getRepeatedListValue(transitionDurations, index, 0);
    const delay = getRepeatedListValue(transitionDelays, index, 0);
    if (duration > 0) {
      maxWaitMs = Math.max(maxWaitMs, Math.max(0, delay) + duration);
    }
  }

  const animationNames = splitCssList(snapshot.animationName);
  const animationDurations = parseCssTimeListForShareRenderer(
    snapshot.animationDuration
  );
  const animationDelays = parseCssTimeListForShareRenderer(snapshot.animationDelay);
  const animationIterations = splitCssList(snapshot.animationIterationCount);
  const animationCount = Math.max(
    animationNames.length,
    animationDurations.length,
    animationDelays.length,
    animationIterations.length
  );
  for (let index = 0; index < animationCount; index += 1) {
    const name = getRepeatedListValue(animationNames, index, "none").toLowerCase();
    const duration = getRepeatedListValue(animationDurations, index, 0);
    const delay = getRepeatedListValue(animationDelays, index, 0);
    const iterationValue = getRepeatedListValue(animationIterations, index, "1");
    if (!name || name === "none" || duration <= 0) continue;
    if (String(iterationValue).trim().toLowerCase() === "infinite") continue;
    const iterations = Number.parseFloat(String(iterationValue || "1"));
    if (!Number.isFinite(iterations) || iterations <= 0) continue;
    maxWaitMs = Math.max(maxWaitMs, Math.max(0, delay) + duration * iterations);
  }

  return Math.max(0, Math.ceil(maxWaitMs));
}

export async function captureFirstSectionShareImage(
  params: CaptureFirstSectionShareImageParams,
  deps: CaptureFirstSectionShareImageDeps = {}
): Promise<Buffer> {
  const width = params.width || SHARE_IMAGE_WIDTH;
  const height = params.height || SHARE_IMAGE_HEIGHT;
  const quality = params.quality || SHARE_IMAGE_QUALITY;
  const timeoutMs = params.timeoutMs || SHARE_IMAGE_TIMEOUT_MS;
  const delayMs = Math.max(0, Math.floor(params.delayMs || 0));
  const effectSettleMaxMs = Math.max(
    0,
    Math.min(
      typeof params.effectSettleMaxMs === "number"
        ? Math.floor(params.effectSettleMaxMs)
        : SHARE_IMAGE_EFFECT_SETTLE_MAX_MS,
      Math.max(0, timeoutMs - SHARE_IMAGE_SCREENSHOT_RESERVED_MS)
    )
  );

  let browser: BrowserLike | null = null;
  let page: any | null = null;
  let closingResources: Promise<void> | null = null;
  let timeout: NodeJS.Timeout | null = null;
  let timedOut = false;
  let currentSubstage: ShareImageRenderSubstage | null = null;
  let currentSubstageFailed = false;
  let latestDiagnosticContext: Record<string, unknown> = {};
  let renderStartedAtMs = Date.now();

  const diagnostics = params.diagnostics;
  const htmlBytes = Buffer.byteLength(String(params.html || ""), "utf8");

  const report = (
    method: keyof ShareImageRenderDiagnostics,
    ...args: unknown[]
  ) => {
    const handler = diagnostics?.[method] as
      | ((...input: unknown[]) => Promise<void> | void)
      | undefined;
    if (typeof handler !== "function") return;

    try {
      Promise.resolve(handler(...args)).catch(() => undefined);
    } catch {
      // Renderer diagnostics must not affect capture behavior.
    }
  };

  const getElapsedMs = () => Math.max(0, Date.now() - renderStartedAtMs);
  const getRemainingMs = () => Math.max(0, timeoutMs - getElapsedMs());

  const withDiagnosticContext = (
    context: Record<string, unknown> = {}
  ): Record<string, unknown> => ({
    width,
    height,
    timeoutMs,
    htmlBytes,
    elapsedMs: getElapsedMs(),
    remainingMs: getRemainingMs(),
    ...getMemoryDiagnostics(),
    ...context,
  });

  const startSubstage = (
    substage: ShareImageRenderSubstage,
    context: Record<string, unknown> = {}
  ) => {
    currentSubstage = substage;
    currentSubstageFailed = false;
    report("startSubstage", substage, withDiagnosticContext(context));
  };

  const completeSubstage = (
    substage: ShareImageRenderSubstage,
    context: Record<string, unknown> = {}
  ) => {
    if (timedOut || (currentSubstageFailed && currentSubstage?.key === substage.key)) {
      return;
    }
    report(
      "completeSubstage",
      substage,
      withDiagnosticContext({
        ...latestDiagnosticContext,
        ...context,
      })
    );
  };

  const failSubstage = (
    error: unknown,
    context: Record<string, unknown> = {}
  ) => {
    if (!currentSubstage || currentSubstageFailed) return;
    currentSubstageFailed = true;
    report(
      "failSubstage",
      error,
      withDiagnosticContext({
        ...latestDiagnosticContext,
        substage: currentSubstage.key,
        substageLabel: currentSubstage.label,
        ...context,
      })
    );
  };

  const recordDiagnostics = (context: Record<string, unknown> = {}) => {
    latestDiagnosticContext = {
      ...latestDiagnosticContext,
      ...context,
    };
    report("recordDiagnostics", withDiagnosticContext(latestDiagnosticContext));
  };

  const runSubstage = async <T>(
    substage: ShareImageRenderSubstage,
    context: Record<string, unknown>,
    operation: () => Promise<T> | T,
    getCompleteContext?: (result: T) => Record<string, unknown>
  ): Promise<T> => {
    startSubstage(substage, context);
    try {
      const result = await operation();
      completeSubstage(substage, {
        ...context,
        ...(getCompleteContext ? getCompleteContext(result) : {}),
      });
      return result;
    } catch (error) {
      failSubstage(error, context);
      throw error;
    }
  };

  const closeResources = async () => {
    if (closingResources) {
      await closingResources;
      return;
    }

    const pageToClose = page;
    const browserToClose = browser;
    page = null;
    browser = null;

    if (!pageToClose && !browserToClose) return;

    closingResources = (async () => {
      if (pageToClose && typeof pageToClose.close === "function") {
        await pageToClose.close().catch(() => undefined);
      }
      if (browserToClose) {
        await browserToClose.close().catch(() => undefined);
      }
    })();

    try {
      await closingResources;
    } finally {
      closingResources = null;
    }
  };

  const assertNotTimedOut = () => {
    if (timedOut) {
      throw createRendererTimeoutError();
    }
  };

  const capture = async (): Promise<Buffer> => {
    try {
      const runtime = await runSubstage(
        SHARE_IMAGE_RENDER_SUBSTAGES.PREPARING_RENDERER,
        {
          hasInjectedBrowserRuntime: Boolean(deps.loadBrowserRuntime),
        },
        async () =>
          deps.loadBrowserRuntime
            ? await deps.loadBrowserRuntime()
            : loadBrowserRuntime()
      );
      assertNotTimedOut();
      const executablePath = await runSubstage(
        SHARE_IMAGE_RENDER_SUBSTAGES.RESOLVING_CHROMIUM,
        {
          hasEnvExecutablePath: Boolean(
            String(process.env.PUPPETEER_EXECUTABLE_PATH || "").trim()
          ),
        },
        () => resolveExecutablePath(runtime.chromium),
        (resolvedPath) => ({
          executablePathResolved: Boolean(resolvedPath),
        })
      );
      assertNotTimedOut();

      browser = await runSubstage(
        SHARE_IMAGE_RENDER_SUBSTAGES.LAUNCHING_BROWSER,
        {
          chromiumArgCount: Array.isArray(runtime.chromium.args)
            ? runtime.chromium.args.length
            : 0,
          chromiumHeadless: runtime.chromium.headless ?? "shell",
        },
        () =>
          runtime.puppeteer.launch({
            executablePath,
            args: runtime.chromium.args || [],
            headless: runtime.chromium.headless ?? "shell",
            defaultViewport: {
              width,
              height,
              deviceScaleFactor: 1,
            },
            timeout: timeoutMs,
          })
      );
      assertNotTimedOut();
      page = await browser.newPage();
      assertNotTimedOut();

      if (typeof page.setDefaultTimeout === "function") {
        page.setDefaultTimeout(timeoutMs);
      }
      if (typeof page.setDefaultNavigationTimeout === "function") {
        page.setDefaultNavigationTimeout(timeoutMs);
      }

      await runSubstage(
        SHARE_IMAGE_RENDER_SUBSTAGES.LOADING_HTML,
        {
          waitUntil: "load",
        },
        async () => {
          await page.setViewport({
            width,
            height,
            deviceScaleFactor: 1,
          });
          assertNotTimedOut();
          await page.setContent(params.html, {
            waitUntil: "load",
            timeout: timeoutMs,
          });
        }
      );
      assertNotTimedOut();
      await runSubstage(
        SHARE_IMAGE_RENDER_SUBSTAGES.WAITING_DOCUMENT,
        {},
        () =>
          page.waitForFunction(
            () => document.readyState === "complete",
            { timeout: timeoutMs }
          )
      );
      assertNotTimedOut();

      await runSubstage(
        SHARE_IMAGE_RENDER_SUBSTAGES.WAITING_FONTS,
        {},
        async () => {
          const fontStats = await page.evaluate(() => {
            const documentWithFonts = document as {
              fonts?: { ready?: Promise<unknown>; size?: number; status?: string };
            };

            return {
              fontFaceCount:
                typeof documentWithFonts.fonts?.size === "number"
                  ? documentWithFonts.fonts.size
                  : null,
              fontStatus: documentWithFonts.fonts?.status || null,
            };
          });
          recordDiagnostics(fontStats || {});

          await page.evaluate(async () => {
            const documentWithFonts = document as {
              fonts?: { ready?: Promise<unknown> };
            };

            if (documentWithFonts.fonts?.ready) {
              await documentWithFonts.fonts.ready.catch(() => undefined);
            }
          });
          recordDiagnostics({ fontsReady: true });
        }
      );
      assertNotTimedOut();

      const firstSectionImageScope = await runSubstage(
        SHARE_IMAGE_RENDER_SUBSTAGES.ISOLATING_FIRST_SECTION,
        {},
        async () => {
          const scope = await page.evaluate(() => {
            const images = Array.from(document.images || []) as any[];
            const firstSection = document.querySelector(
              ".inv > .sec:first-child"
            ) as any;
            const sections = Array.from(document.querySelectorAll(".inv > .sec"));

            const readImageUrl = (image: any) =>
              String(
                image?.currentSrc ||
                  image?.src ||
                  image?.getAttribute?.("src") ||
                  ""
              ).slice(0, 180);
            const readImageHost = (image: any) => {
              const rawUrl = readImageUrl(image);
              if (!rawUrl) return "";
              if (rawUrl.startsWith("data:")) return "inline-data";
              try {
                return new URL(rawUrl, window.location.href).hostname;
              } catch (_error) {
                return "";
              }
            };
            const sampleUnique = (values: string[], limit: number) => {
              const output: string[] = [];
              const seen = new Set<string>();
              values.forEach((value) => {
                const normalized = String(value || "").trim();
                if (!normalized || seen.has(normalized) || output.length >= limit) {
                  return;
                }
                seen.add(normalized);
                output.push(normalized);
              });
              return output;
            };
            const isLazy = (image: any) =>
              String(
                image?.getAttribute?.("loading") || image?.loading || ""
              ).toLowerCase() === "lazy";

            if (!firstSection) {
              return {
                hasFirstSection: false,
                totalImageCount: images.length,
                imageCount: images.length,
              };
            }

            const firstSectionImages = Array.from(
              firstSection.querySelectorAll("img")
            ) as any[];
            const firstSectionImageSet = new Set(firstSectionImages);
            const ignoredImages = images.filter(
              (image) => !firstSectionImageSet.has(image)
            );

            sections.forEach((section) => {
              if (section !== firstSection) {
                (section as any).style.display = "none";
              }
            });

            const remainingImages = Array.from(document.images || []) as any[];

            return {
              hasFirstSection: true,
              totalImageCount: images.length,
              imageCount: images.length,
              firstSectionImageCount: firstSectionImages.length,
              captureRelevantImageCount: firstSectionImages.length,
              ignoredImageCount: ignoredImages.length,
              outsideFirstSectionImageCount: ignoredImages.length,
              hiddenOutsideSectionCount: Math.max(0, sections.length - 1),
              lazyImageCount: images.filter(isLazy).length,
              firstSectionLazyImageCount: firstSectionImages.filter(isLazy).length,
              ignoredLazyImageCount: ignoredImages.filter(isLazy).length,
              remainingDocumentImageCount: remainingImages.length,
              ignoredImageHostsSample: sampleUnique(
                ignoredImages.map(readImageHost),
                8
              ),
              ignoredImageUrlSample: sampleUnique(
                ignoredImages.map(readImageUrl),
                5
              ),
            };
          });

          if (!scope?.hasFirstSection) {
            throw new Error("missing-first-section");
          }

          return scope;
        },
        (scope) => ({
          hasFirstSection: Boolean(scope?.hasFirstSection),
          totalImageCount: scope?.totalImageCount,
          firstSectionImageCount: scope?.firstSectionImageCount,
          captureRelevantImageCount: scope?.captureRelevantImageCount,
          ignoredImageCount: scope?.ignoredImageCount,
          hiddenOutsideSectionCount: scope?.hiddenOutsideSectionCount,
          remainingDocumentImageCount: scope?.remainingDocumentImageCount,
        })
      );
      recordDiagnostics(firstSectionImageScope || {});
      assertNotTimedOut();

      await runSubstage(
        SHARE_IMAGE_RENDER_SUBSTAGES.WAITING_IMAGES,
        {},
        async () => {
          const imageStats = await page.evaluate(() => {
            const firstSection = document.querySelector(
              ".inv > .sec:first-child"
            ) as any;
            const images = firstSection
              ? (Array.from(firstSection.querySelectorAll("img")) as any[])
              : [];
            const readImageUrl = (image: any) =>
              String(
                image?.currentSrc ||
                  image?.src ||
                  image?.getAttribute?.("src") ||
                  ""
              ).slice(0, 180);
            const readImageHost = (image: any) => {
              const rawUrl = readImageUrl(image);
              if (!rawUrl) return "";
              if (rawUrl.startsWith("data:")) return "inline-data";
              try {
                return new URL(rawUrl, window.location.href).hostname;
              } catch (_error) {
                return "";
              }
            };
            const sampleUnique = (values: string[], limit: number) => {
              const output: string[] = [];
              const seen = new Set<string>();
              values.forEach((value) => {
                const normalized = String(value || "").trim();
                if (!normalized || seen.has(normalized) || output.length >= limit) {
                  return;
                }
                seen.add(normalized);
                output.push(normalized);
              });
              return output;
            };
            const isLazy = (image: any) =>
              String(
                image?.getAttribute?.("loading") || image?.loading || ""
              ).toLowerCase() === "lazy";
            const pendingImages = images.filter((image) => !image.complete);

            return {
              imageCount: images.length,
              completeImageCount: images.filter((image) => image.complete).length,
              pendingImageCount: pendingImages.length,
              lazyImageCount: images.filter(isLazy).length,
              firstSectionImageCount: images.length,
              remainingDocumentImageCount: Array.from(document.images || []).length,
              pendingFirstSectionImageHostsSample: sampleUnique(
                pendingImages.map(readImageHost),
                8
              ),
              pendingFirstSectionImageUrlSample: sampleUnique(
                pendingImages.map(readImageUrl),
                5
              ),
            };
          });
          recordDiagnostics(imageStats || {});

          const waitResult = await page.evaluate(async () => {
            const firstSection = document.querySelector(
              ".inv > .sec:first-child"
            ) as any;
            const images = firstSection
              ? (Array.from(firstSection.querySelectorAll("img")) as any[])
              : [];
            const readImageUrl = (image: any) =>
              String(
                image?.currentSrc ||
                  image?.src ||
                  image?.getAttribute?.("src") ||
                  ""
              ).slice(0, 180);
            const readImageHost = (image: any) => {
              const rawUrl = readImageUrl(image);
              if (!rawUrl) return "";
              if (rawUrl.startsWith("data:")) return "inline-data";
              try {
                return new URL(rawUrl, window.location.href).hostname;
              } catch (_error) {
                return "";
              }
            };
            const sampleUnique = (values: string[], limit: number) => {
              const output: string[] = [];
              const seen = new Set<string>();
              values.forEach((value) => {
                const normalized = String(value || "").trim();
                if (!normalized || seen.has(normalized) || output.length >= limit) {
                  return;
                }
                seen.add(normalized);
                output.push(normalized);
              });
              return output;
            };
            const failedImages: any[] = [];
            let alreadyCompleteImageCount = 0;
            let loadedImageCount = 0;

            await Promise.all(
              images.map((image) => {
                const safeImage = image as any;
                if (safeImage.complete) {
                  alreadyCompleteImageCount += 1;
                  if (!safeImage.naturalWidth && !safeImage.naturalHeight) {
                    failedImages.push(safeImage);
                  }
                  return true;
                }
                return new Promise((resolve) => {
                  const onLoad = () => {
                    loadedImageCount += 1;
                    resolve(true);
                  };
                  const onError = () => {
                    failedImages.push(safeImage);
                    resolve(false);
                  };
                  safeImage.addEventListener("load", onLoad, { once: true });
                  safeImage.addEventListener("error", onError, { once: true });
                });
              })
            );

            return {
              waitedImageCount: images.length,
              alreadyCompleteImageCount,
              loadedImageCount,
              failedImageCount: failedImages.length,
              failedImageHostsSample: sampleUnique(
                failedImages.map(readImageHost),
                8
              ),
              failedImageUrlSample: sampleUnique(
                failedImages.map(readImageUrl),
                5
              ),
            };
          });
          recordDiagnostics({ imagesReady: true, ...(waitResult || {}) });
        }
      );
      assertNotTimedOut();

      await runSubstage(
        SHARE_IMAGE_RENDER_SUBSTAGES.SETTLING_LAYOUT,
        {
          phase: "initial-layout-frames",
        },
        () =>
          page.evaluate(async () => {
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve))
            );
          })
      );
      assertNotTimedOut();

      const rawCaptureRegion = await runSubstage(
        SHARE_IMAGE_RENDER_SUBSTAGES.SETTLING_LAYOUT,
        {
          phase: "capture-region",
          effectSettleMaxMs,
        },
        () =>
          page.evaluate(
            async (targetWidth: number, targetHeight: number) => {
              const measureStartedAt = Date.now();
              const firstSection = document.querySelector(
                ".inv > .sec:first-child"
              ) as any;
              if (!firstSection) return null;
              const sections = Array.from(document.querySelectorAll(".inv > .sec"));

              sections.forEach((section) => {
                if (section !== firstSection) {
                  (section as any).style.display = "none";
                }
              });

              const sectionStyle = window.getComputedStyle(firstSection);
              const bodyStyle = window.getComputedStyle(document.body);
              const htmlStyle = window.getComputedStyle(document.documentElement);
              const backgroundColor =
                sectionStyle.backgroundColor ||
                bodyStyle.backgroundColor ||
                htmlStyle.backgroundColor ||
                "#ffffff";

              document.documentElement.style.margin = "0";
              document.body.style.margin = "0";
              document.documentElement.style.backgroundColor = backgroundColor;
              document.body.style.backgroundColor = backgroundColor;
              document.body.style.minWidth = `${targetWidth}px`;

              const initialRect = firstSection.getBoundingClientRect();
              const safeInitialHeight = Number.isFinite(initialRect.height)
                ? Math.max(0, Math.ceil(initialRect.height))
                : 0;
              firstSection.style.minHeight = `${Math.max(
                safeInitialHeight,
                targetHeight
              )}px`;

              window.scrollTo(0, 0);
              if (document.scrollingElement) {
                document.scrollingElement.scrollTop = 0;
                document.scrollingElement.scrollLeft = 0;
              }

              await new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve))
              );

              const rect = firstSection.getBoundingClientRect();
              const rawClipX = rect.left + window.scrollX;
              const rawClipY = rect.top + window.scrollY;
              const clipX = Number.isFinite(rawClipX)
                ? Math.max(0, Math.floor(rawClipX))
                : null;
              const clipY = Number.isFinite(rawClipY)
                ? Math.max(0, Math.floor(rawClipY))
                : null;
              const safeClipX = clipX === null ? 0 : clipX;
              const safeClipY = clipY === null ? 0 : clipY;

              document.body.style.minWidth = `${safeClipX + targetWidth}px`;
              document.body.style.minHeight = `${safeClipY + targetHeight}px`;
              document.documentElement.style.minHeight = `${
                safeClipY + targetHeight
              }px`;
              window.scrollTo(0, 0);

              await new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve))
              );

              const nodes = Array.from(firstSection.querySelectorAll("*")) as any[];
              const images = Array.from(firstSection.querySelectorAll("img")) as any[];
              const inspectedNodes = nodes.slice(0, 1500);
              let cssBackgroundImageNodeCount = 0;
              let filterNodeCount = 0;
              let backdropFilterNodeCount = 0;
              let boxShadowNodeCount = 0;
              let textShadowNodeCount = 0;
              let transformNodeCount = 0;
              let fixedStickyNodeCount = 0;

              inspectedNodes.forEach((node) => {
                if (!node || typeof window.getComputedStyle !== "function") return;
                const style = window.getComputedStyle(node);
                if (style.backgroundImage && style.backgroundImage !== "none") {
                  cssBackgroundImageNodeCount += 1;
                }
                if (style.filter && style.filter !== "none") {
                  filterNodeCount += 1;
                }
                if (style.backdropFilter && style.backdropFilter !== "none") {
                  backdropFilterNodeCount += 1;
                }
                if (style.boxShadow && style.boxShadow !== "none") {
                  boxShadowNodeCount += 1;
                }
                if (style.textShadow && style.textShadow !== "none") {
                  textShadowNodeCount += 1;
                }
                if (style.transform && style.transform !== "none") {
                  transformNodeCount += 1;
                }
                if (style.position === "fixed" || style.position === "sticky") {
                  fixedStickyNodeCount += 1;
                }
              });

              const visibleImages = images.filter((image) => {
                const imageRect = image.getBoundingClientRect();
                const style = window.getComputedStyle(image);
                return (
                  style.display !== "none" &&
                  style.visibility !== "hidden" &&
                  Number(style.opacity || 1) !== 0 &&
                  imageRect.width > 0 &&
                  imageRect.height > 0
                );
              });
              const documentElement = document.documentElement;
              const body = document.body;
              const documentScrollWidth = Math.max(
                documentElement?.scrollWidth || 0,
                body?.scrollWidth || 0
              );
              const documentScrollHeight = Math.max(
                documentElement?.scrollHeight || 0,
                body?.scrollHeight || 0
              );

              return {
                x: clipX,
                y: clipY,
                width: targetWidth,
                height: targetHeight,
                rawClipX,
                rawClipY,
                initialSectionRectX: initialRect.x,
                initialSectionRectY: initialRect.y,
                initialSectionRectWidth: initialRect.width,
                initialSectionRectHeight: initialRect.height,
                sectionRectX: rect.x,
                sectionRectY: rect.y,
                sectionRectTop: rect.top,
                sectionRectLeft: rect.left,
                sectionRectWidth: rect.width,
                sectionRectHeight: rect.height,
                firstSectionOffsetWidth: firstSection.offsetWidth || 0,
                firstSectionOffsetHeight: firstSection.offsetHeight || 0,
                firstSectionScrollWidth: firstSection.scrollWidth || 0,
                firstSectionScrollHeight: firstSection.scrollHeight || 0,
                documentScrollWidth,
                documentScrollHeight,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight,
                deviceScaleFactor: window.devicePixelRatio || 1,
                firstSectionNodeCount: nodes.length + 1,
                inspectedStyleNodeCount: inspectedNodes.length,
                firstSectionImageCount: images.length,
                firstSectionVisibleImageCount: visibleImages.length,
                firstSectionVideoCount: firstSection.querySelectorAll("video").length,
                firstSectionSvgCount: firstSection.querySelectorAll("svg").length,
                firstSectionGifImageCount: images.filter((image) =>
                  /\.gif(\?|#|$)/i.test(
                    String(
                      image.currentSrc ||
                        image.src ||
                        image.getAttribute?.("src") ||
                        ""
                    )
                  )
                ).length,
                cssBackgroundImageNodeCount,
                filterNodeCount,
                backdropFilterNodeCount,
                boxShadowNodeCount,
                textShadowNodeCount,
                transformNodeCount,
                fixedStickyNodeCount,
                captureRegionMeasureMs: Date.now() - measureStartedAt,
              };
            },
            width,
            height
          ),
        (region) => ({
          hasCaptureRegion: Boolean(region),
        })
      );
      assertNotTimedOut();

      if (!rawCaptureRegion) {
        const error = new Error("missing-first-section");
        failSubstage(error, {
          phase: "capture-region",
          hasCaptureRegion: false,
        });
        throw error;
      }

      let captureRegion: CaptureRegion;
      try {
        captureRegion = normalizeCaptureRegion(rawCaptureRegion, width, height);
      } catch (error) {
        failSubstage(error, {
          phase: "capture-region",
          rawCaptureX: rawCaptureRegion.x,
          rawCaptureY: rawCaptureRegion.y,
          rawCaptureWidth: rawCaptureRegion.width,
          rawCaptureHeight: rawCaptureRegion.height,
          maxCaptureOffsetPx: SHARE_IMAGE_MAX_CAPTURE_OFFSET_PX,
        });
        throw error;
      }
      recordDiagnostics({
        ...rawCaptureRegion,
        captureClipX: captureRegion.x,
        captureClipY: captureRegion.y,
        captureClipWidth: captureRegion.width,
        captureClipHeight: captureRegion.height,
        captureClipAreaPx: captureRegion.width * captureRegion.height,
        captureBeyondViewport: true,
      });

      const motionSettleBudgetMs = Math.max(
        0,
        Math.min(
          effectSettleMaxMs,
          getRemainingMs() - SHARE_IMAGE_SCREENSHOT_RESERVED_MS
        )
      );
      recordDiagnostics({
        effectSettleMaxMs,
        motionSettleBudgetMs,
        screenshotReservedMs: SHARE_IMAGE_SCREENSHOT_RESERVED_MS,
        motionSettleSkippedForScreenshotBudget:
          effectSettleMaxMs > 0 && motionSettleBudgetMs <= 0,
      });

      if (motionSettleBudgetMs > 0) {
        await runSubstage(
          SHARE_IMAGE_RENDER_SUBSTAGES.SETTLING_LAYOUT,
          {
            phase: "motion-settle",
            effectSettleMaxMs,
            motionSettleBudgetMs,
          },
          () =>
            page.evaluate(
              async (
                maxWaitMs: number,
                settleBufferMs: number,
                layoutStableMaxMs: number,
                parseCssTimeListSource: string,
                resolveFiniteCssMotionWaitMsSource: string
              ) => {
                const parseCssTimeListForShareRenderer = (0, eval)(
                  `(${parseCssTimeListSource})`
                );
                const resolveFiniteCssMotionWaitMsForShareRenderer = (0, eval)(
                  `(${resolveFiniteCssMotionWaitMsSource})`
                );

                const firstSection = document.querySelector(
                  ".inv > .sec:first-child"
                ) as any;
                if (!firstSection || maxWaitMs <= 0) return;

                const startedAt = Date.now();
                const elapsed = () => Date.now() - startedAt;
                const remaining = () => Math.max(0, maxWaitMs - elapsed());
                const wait = (ms: number) =>
                  new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
                const nextFrame = () =>
                  new Promise((resolve) => requestAnimationFrame(resolve));
                const nextFrames = async (count: number) => {
                  for (let index = 0; index < count && remaining() > 0; index += 1) {
                    await nextFrame();
                  }
                };
                const waitWithinBudget = async (
                  promise: Promise<unknown>,
                  ms: number
                ) =>
                  Promise.race([
                    promise.catch(() => undefined),
                    wait(Math.max(0, Math.min(ms, remaining()))),
                  ]);

            const isReducedMotion = () => {
              try {
                return Boolean(
                  window.matchMedia &&
                    window.matchMedia("(prefers-reduced-motion: reduce)").matches
                );
              } catch (_error) {
                return false;
              }
            };

            const getMotionElements = () =>
              Array.from(
                firstSection.querySelectorAll(
                  "[data-motion='reveal'],[data-motion='zoom'],[data-motion='draw']"
                )
              ) as any[];

            const hasActivatedMotion = (element: any) => {
              const effect = String(element.getAttribute("data-motion") || "")
                .trim()
                .toLowerCase();
              if (effect === "reveal") {
                return element.classList.contains("mefx-reveal-on");
              }
              if (effect === "zoom") {
                return element.classList.contains("mefx-zoom-on");
              }
              if (effect === "draw") {
                return element.classList.contains("mefx-draw-on");
              }
              return true;
            };

            const waitForLoaderAndMotionActivation = async () => {
              if (remaining() <= 0) return;
              const loader = document.getElementById("inv-loader");
              const loaderReady = String(
                document.body && document.body.getAttribute("data-loader-ready")
              );
              if (loader || loaderReady === "0") {
                await waitWithinBudget(
                  new Promise((resolve) => {
                    let done = false;
                    const finish = () => {
                      if (done) return;
                      done = true;
                      resolve(undefined);
                    };
                    window.addEventListener("invitation-loader-hidden", finish, {
                      once: true,
                    });
                    const observer =
                      typeof MutationObserver === "function" && document.body
                        ? new MutationObserver(() => {
                            const ready = String(
                              document.body.getAttribute("data-loader-ready")
                            );
                            if (ready === "1" || !document.getElementById("inv-loader")) {
                              if (observer) observer.disconnect();
                              finish();
                            }
                          })
                        : null;
                    if (observer) {
                      observer.observe(document.body, {
                        attributes: true,
                        attributeFilter: ["data-loader-ready"],
                      });
                    }
                    if (
                      String(document.body?.getAttribute("data-loader-ready")) ===
                        "1" ||
                      !document.getElementById("inv-loader")
                    ) {
                      if (observer) observer.disconnect();
                      finish();
                    }
                  }),
                  Math.min(2500, remaining())
                );
              }

              await nextFrames(2);
              if (remaining() <= 0 || isReducedMotion()) return;

              const motionElements = getMotionElements();
              if (!motionElements.length) return;
              const activationStartedAt = Date.now();
              const activationBudget = Math.min(1000, remaining());
              while (Date.now() - activationStartedAt < activationBudget) {
                if (motionElements.every(hasActivatedMotion)) return;
                await nextFrame();
              }
            };

            const isFiniteRunningAnimation = (animation: any) => {
              if (!animation || animation.playState === "finished") return false;
              const effect = animation.effect;
              if (!effect || typeof effect.getComputedTiming !== "function") {
                return false;
              }
              const timing = effect.getComputedTiming();
              const endTime = Number(timing && timing.endTime);
              return Number.isFinite(endTime) && endTime > 0;
            };

            const waitForRunningFiniteAnimations = async () => {
              if (
                !firstSection ||
                typeof firstSection.getAnimations !== "function" ||
                remaining() <= 0
              ) {
                return false;
              }
              const animations = firstSection
                .getAnimations({ subtree: true })
                .filter(isFiniteRunningAnimation);
              if (!animations.length) return true;
              await waitWithinBudget(
                Promise.allSettled(
                  animations.map((animation: any) => animation.finished)
                ),
                remaining()
              );
              if (remaining() > 0) {
                await wait(Math.min(settleBufferMs, remaining()));
              }
              return true;
            };

            const waitForComputedFiniteMotionFallback = async () => {
              if (
                firstSection &&
                typeof firstSection.getAnimations === "function"
              ) {
                return;
              }
              const nodes = [firstSection].concat(
                Array.from(firstSection.querySelectorAll("*")) as any[]
              );
              let maxFiniteMs = 0;
              nodes.forEach((node: any) => {
                if (!node || typeof window.getComputedStyle !== "function") return;
                const style = window.getComputedStyle(node);
                maxFiniteMs = Math.max(
                  maxFiniteMs,
                  resolveFiniteCssMotionWaitMsForShareRenderer({
                    className: node.className,
                    dataMotion:
                      typeof node.getAttribute === "function"
                        ? node.getAttribute("data-motion")
                        : "",
                    animationName: style.animationName,
                    animationDuration: style.animationDuration,
                    animationDelay: style.animationDelay,
                    animationIterationCount: style.animationIterationCount,
                    transitionDuration: style.transitionDuration,
                    transitionDelay: style.transitionDelay,
                  })
                );
              });

              if (maxFiniteMs > 0 && remaining() > 0) {
                await wait(Math.min(maxFiniteMs + settleBufferMs, remaining()));
              }
            };

            const rectSnapshot = () => {
              const rect = firstSection.getBoundingClientRect();
              return [
                Math.round(rect.left * 10) / 10,
                Math.round(rect.top * 10) / 10,
                Math.round(rect.width * 10) / 10,
                Math.round(rect.height * 10) / 10,
              ].join("|");
            };

            const waitForStableLayout = async () => {
              const stableStartedAt = Date.now();
              let lastSnapshot = rectSnapshot();
              let stableFrames = 0;
              while (
                remaining() > 0 &&
                Date.now() - stableStartedAt < layoutStableMaxMs
              ) {
                await nextFrame();
                const nextSnapshot = rectSnapshot();
                if (nextSnapshot === lastSnapshot) {
                  stableFrames += 1;
                  if (stableFrames >= 2) return;
                } else {
                  stableFrames = 0;
                  lastSnapshot = nextSnapshot;
                }
              }
            };

            async function waitForFirstSectionVisualSettled() {
              await waitForLoaderAndMotionActivation();
              await nextFrames(2);
              const hadAnimationApi = await waitForRunningFiniteAnimations();
              if (!hadAnimationApi) {
                await waitForComputedFiniteMotionFallback();
              }
              await waitForStableLayout();
            }

            await waitForFirstSectionVisualSettled();
              },
              motionSettleBudgetMs,
              SHARE_IMAGE_EFFECT_SETTLE_BUFFER_MS,
              SHARE_IMAGE_LAYOUT_STABLE_MAX_MS,
              parseCssTimeListForShareRenderer.toString(),
              resolveFiniteCssMotionWaitMsForShareRenderer.toString()
            )
        );
        assertNotTimedOut();
      }

      await runSubstage(
        SHARE_IMAGE_RENDER_SUBSTAGES.SETTLING_LAYOUT,
        {
          phase: "pre-screenshot-scroll-reset",
        },
        () =>
          page.evaluate(async () => {
            window.scrollTo(0, 0);
            if (document.scrollingElement) {
              document.scrollingElement.scrollTop = 0;
              document.scrollingElement.scrollLeft = 0;
            }
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve))
            );
          })
      );
      assertNotTimedOut();

      recordDiagnostics({
        screenshotReady: true,
        screenshotRemainingBeforeMs: getRemainingMs(),
        screenshotElapsedBeforeMs: getElapsedMs(),
        screenshotClipX: captureRegion.x,
        screenshotClipY: captureRegion.y,
        screenshotClipWidth: captureRegion.width,
        screenshotClipHeight: captureRegion.height,
        screenshotClipAreaPx: captureRegion.width * captureRegion.height,
      });
      const rawScreenshot = await runSubstage(
        SHARE_IMAGE_RENDER_SUBSTAGES.CAPTURING_SCREENSHOT,
        {
          screenshotRemainingBeforeMs: getRemainingMs(),
          clipWidth: captureRegion.width,
          clipHeight: captureRegion.height,
          clipX: captureRegion.x,
          clipY: captureRegion.y,
          clipAreaPx: captureRegion.width * captureRegion.height,
          captureBeyondViewport: true,
        },
        () =>
          page.screenshot({
            type: "jpeg",
            quality,
            fullPage: false,
            clip: captureRegion,
            captureBeyondViewport: true,
          }),
        (screenshot) => ({
          screenshotBytes: Buffer.isBuffer(screenshot)
            ? screenshot.length
            : Buffer.byteLength(screenshot || ""),
        })
      );

      return Buffer.isBuffer(rawScreenshot)
        ? rawScreenshot
        : Buffer.from(rawScreenshot);
    } finally {
      await closeResources();
    }
  };

  if (delayMs > 0) {
    await sleep(delayMs);
  }

  renderStartedAtMs = Date.now();
  const capturePromise = capture();
  capturePromise.catch(() => undefined);

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      failSubstage(createRendererTimeoutError(), {
        timedOut: true,
      });
      closeResources().catch(() => undefined);
      reject(createRendererTimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([capturePromise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
    if (!timedOut) {
      await closeResources();
    }
  }
}
