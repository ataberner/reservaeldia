const SHARE_IMAGE_WIDTH = 1200;
const SHARE_IMAGE_HEIGHT = 630;
const SHARE_IMAGE_QUALITY = 85;
const SHARE_IMAGE_TIMEOUT_MS = 7000;
const SHARE_IMAGE_EFFECT_SETTLE_MAX_MS = 3500;
const SHARE_IMAGE_EFFECT_SETTLE_BUFFER_MS = 350;
const SHARE_IMAGE_LAYOUT_STABLE_MAX_MS = 450;

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

export type CaptureFirstSectionShareImageParams = {
  html: string;
  width?: number;
  height?: number;
  quality?: number;
  timeoutMs?: number;
  delayMs?: number;
  effectSettleMaxMs?: number;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      Math.max(0, timeoutMs - 500)
    )
  );

  let browser: BrowserLike | null = null;
  let page: any | null = null;
  let closingResources: Promise<void> | null = null;
  let timeout: NodeJS.Timeout | null = null;
  let timedOut = false;

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
      const runtime = deps.loadBrowserRuntime
        ? await deps.loadBrowserRuntime()
        : loadBrowserRuntime();
      assertNotTimedOut();
      const executablePath = await resolveExecutablePath(runtime.chromium);
      assertNotTimedOut();

      browser = await runtime.puppeteer.launch({
        executablePath,
        args: runtime.chromium.args || [],
        headless: runtime.chromium.headless ?? "shell",
        defaultViewport: {
          width,
          height,
          deviceScaleFactor: 1,
        },
        timeout: timeoutMs,
      });
      assertNotTimedOut();
      page = await browser.newPage();
      assertNotTimedOut();

      if (typeof page.setDefaultTimeout === "function") {
        page.setDefaultTimeout(timeoutMs);
      }
      if (typeof page.setDefaultNavigationTimeout === "function") {
        page.setDefaultNavigationTimeout(timeoutMs);
      }

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
      assertNotTimedOut();
      await page.waitForFunction(
        () => document.readyState === "complete",
        { timeout: timeoutMs }
      );
      assertNotTimedOut();
      await page.evaluate(async () => {
        const documentWithFonts = document as {
          fonts?: { ready?: Promise<unknown> };
          images: Iterable<any>;
          readyState: string;
        };

        if (documentWithFonts.fonts?.ready) {
          await documentWithFonts.fonts.ready.catch(() => undefined);
        }

        await Promise.all(
          Array.from(document.images).map((image) => {
            const safeImage = image as any;
            if (safeImage.complete) return true;
            return new Promise((resolve) => {
              safeImage.addEventListener("load", resolve, { once: true });
              safeImage.addEventListener("error", resolve, { once: true });
            });
          })
        );

        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
      });
      assertNotTimedOut();

      const captureRegion = await page.evaluate(
        async (targetWidth: number, targetHeight: number) => {
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
          firstSection.style.minHeight = `${Math.max(
            Math.ceil(initialRect.height),
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
          const clipX = Math.max(0, Math.floor(rect.left + window.scrollX));
          const clipY = Math.max(0, Math.floor(rect.top + window.scrollY));

          document.body.style.minWidth = `${clipX + targetWidth}px`;
          document.body.style.minHeight = `${clipY + targetHeight}px`;
          document.documentElement.style.minHeight = `${clipY + targetHeight}px`;
          window.scrollTo(0, 0);

          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          );

          return {
            x: clipX,
            y: clipY,
            width: targetWidth,
            height: targetHeight,
          };
        },
        width,
        height
      );
      assertNotTimedOut();

      if (!captureRegion) {
        throw new Error("missing-first-section");
      }

      if (effectSettleMaxMs > 0) {
        await page.evaluate(
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
            const waitWithinBudget = async (promise: Promise<unknown>, ms: number) =>
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
          effectSettleMaxMs,
          SHARE_IMAGE_EFFECT_SETTLE_BUFFER_MS,
          SHARE_IMAGE_LAYOUT_STABLE_MAX_MS,
          parseCssTimeListForShareRenderer.toString(),
          resolveFiniteCssMotionWaitMsForShareRenderer.toString()
        );
        assertNotTimedOut();
      }

      await page.evaluate(async () => {
        window.scrollTo(0, 0);
        if (document.scrollingElement) {
          document.scrollingElement.scrollTop = 0;
          document.scrollingElement.scrollLeft = 0;
        }
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
      });
      assertNotTimedOut();

      const rawScreenshot = await page.screenshot({
        type: "jpeg",
        quality,
        fullPage: false,
        clip: captureRegion,
        captureBeyondViewport: true,
      });

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

  const capturePromise = capture();
  capturePromise.catch(() => undefined);

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      closeResources().then(
        () => reject(createRendererTimeoutError()),
        () => reject(createRendererTimeoutError())
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([capturePromise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
    await closeResources();
  }
}
