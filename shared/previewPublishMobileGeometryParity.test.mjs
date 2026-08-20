import test from "node:test";
import assert from "node:assert/strict";

import {
  MOBILE_GEOMETRY_PARITY_DEFAULT_TOLERANCE_PX,
  MOBILE_GEOMETRY_PARITY_VIEWPORTS,
  collectMobileGeometrySnapshotFromDocument,
  createSyntheticGeometrySnapshot,
  diffMobileGeometrySnapshots,
} from "./previewPublishMobileGeometryParity.mjs";
import {
  buildPreviewFrameSrcDoc,
  buildScrollbarStyleText,
  PREVIEW_FRAME_SCROLL_AUTHORITIES,
} from "../src/components/preview/previewFrameRuntime.js";

const NOIR_SECTION_JUNCTION_FIXTURE = Object.freeze([
  { id: "seccion-1750939089837", orden: 0, altoModo: "fijo", altura: 662, fondo: "#2f3c61" },
  { id: "seccion-1774704812672", orden: 1, altoModo: "fijo", altura: 260, fondo: "#ccbb9f" },
  { id: "seccion-1774723116034", orden: 2, altoModo: "fijo", altura: 657, fondo: "#2f3c61" },
  { id: "seccion-1774724800758", orden: 3, altoModo: "fijo", altura: 488, fondo: "#cbbb9d" },
  { id: "seccion-1774725741189", orden: 4, altoModo: "fijo", altura: 737, fondo: "#2f3c62" },
  { id: "seccion-1774762340490", orden: 5, altoModo: "fijo", altura: 283, fondo: "#2f3c62" },
  { id: "seccion-1782824303195", orden: 6, altoModo: "fijo", altura: 178, fondo: "#ffffff" },
]);

const DARK_SECTION_IMAGE =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="503"%3E%3Crect width="800" height="503" fill="%23101014"/%3E%3C/svg%3E';

test("mobile geometry parity viewport set is explicit and stable", () => {
  assert.deepEqual(MOBILE_GEOMETRY_PARITY_VIEWPORTS, [
    { id: "mobile-390x844", width: 390, height: 844 },
    { id: "mobile-375x812", width: 375, height: 812 },
    { id: "mobile-414x896", width: 414, height: 896 },
  ]);
  assert.equal(MOBILE_GEOMETRY_PARITY_DEFAULT_TOLERANCE_PX, 2);
});

test("mobile geometry diff accepts small pixel tolerance", () => {
  const preview = createSyntheticGeometrySnapshot({
    scrollHeight: 900,
    sections: [
      { id: "section-1", modo: "fijo", rect: { left: 0, top: 0, width: 390, height: 300 } },
    ],
    objects: [
      {
        id: "object-1",
        sectionId: "section-1",
        lane: "content",
        rect: { left: 20, top: 40, width: 120, height: 44 },
      },
    ],
    groupChildren: [
      {
        id: "group-1:child-1",
        groupId: "group-1",
        childId: "child-1",
        relativeRect: { left: 8, top: 12, width: 80, height: 30 },
      },
    ],
  });
  const publish = createSyntheticGeometrySnapshot({
    scrollHeight: 901.5,
    sections: [
      { id: "section-1", modo: "fijo", rect: { left: 0, top: 0, width: 390, height: 301 } },
    ],
    objects: [
      {
        id: "object-1",
        sectionId: "section-1",
        lane: "content",
        rect: { left: 21, top: 40.5, width: 120, height: 44 },
      },
    ],
    groupChildren: [
      {
        id: "group-1:child-1",
        groupId: "group-1",
        childId: "child-1",
        relativeRect: { left: 8.5, top: 12, width: 80, height: 30 },
      },
    ],
  });

  assert.deepEqual(diffMobileGeometrySnapshots(preview, publish), []);
});

test("mobile geometry diff reports section, object, and group-child drift", () => {
  const preview = createSyntheticGeometrySnapshot({
    scrollHeight: 900,
    sections: [
      { id: "section-1", modo: "fijo", rect: { left: 0, top: 0, width: 390, height: 300 } },
    ],
    objects: [
      {
        id: "object-1",
        sectionId: "section-1",
        lane: "content",
        rect: { left: 20, top: 40, width: 120, height: 44 },
      },
    ],
    edgeDecorations: [
      {
        id: "section-1:top",
        sectionId: "section-1",
        slot: "top",
        rect: { left: 0, top: 0, width: 390, height: 60 },
      },
    ],
    groupChildren: [
      {
        id: "group-1:child-1",
        groupId: "group-1",
        childId: "child-1",
        relativeRect: { left: 8, top: 12, width: 80, height: 30 },
      },
    ],
  });
  const publish = createSyntheticGeometrySnapshot({
    scrollHeight: 940,
    sections: [
      { id: "section-1", modo: "fijo", rect: { left: 0, top: 0, width: 390, height: 330 } },
    ],
    objects: [
      {
        id: "object-1",
        sectionId: "section-1",
        lane: "content",
        rect: { left: 48, top: 40, width: 120, height: 44 },
      },
    ],
    edgeDecorations: [
      {
        id: "section-1:top",
        sectionId: "section-1",
        slot: "top",
        rect: { left: 0, top: 0, width: 360, height: 64 },
      },
    ],
    groupChildren: [
      {
        id: "group-1:child-1",
        groupId: "group-1",
        childId: "child-1",
        relativeRect: { left: 18, top: 12, width: 80, height: 30 },
      },
    ],
  });

  const paths = diffMobileGeometrySnapshots(preview, publish).map((diff) => diff.path);

  assert.equal(paths.includes("viewport.scrollHeight"), true);
  assert.equal(paths.includes("sections.section-1.height"), true);
  assert.equal(paths.includes("objects.object-1.left"), true);
  assert.equal(paths.includes("edgeDecorations.section-1:top.width"), true);
  assert.equal(paths.includes("edgeDecorations.section-1:top.height"), true);
  assert.equal(paths.includes("groupChildren.relative.group-1:child-1.left"), true);
});

test("Noir section junction fixture keeps the consecutive dark baseline explicit", () => {
  assert.deepEqual(
    NOIR_SECTION_JUNCTION_FIXTURE.map(({ altoModo }) => altoModo),
    Array(NOIR_SECTION_JUNCTION_FIXTURE.length).fill("fijo")
  );
  assert.deepEqual(
    NOIR_SECTION_JUNCTION_FIXTURE.slice(4, 6).map(({ fondo }) => fondo),
    ["#2f3c62", "#2f3c62"]
  );

  assert.deepEqual(
    NOIR_SECTION_JUNCTION_FIXTURE.map(({ altura }) => altura),
    [662, 260, 657, 488, 737, 283, 178]
  );
});

test(
  "opt-in published mobile first touch stays on the native document root",
  {
    skip:
      process.env.PREVIEW_PUBLISH_MOBILE_GEOMETRY !== "1"
        ? "Set PREVIEW_PUBLISH_MOBILE_GEOMETRY=1 to run published mobile touch capture."
        : false,
  },
  async (t) => {
    const { default: puppeteer } = await import("puppeteer");
    const generatorModule = (
      await import("../functions/lib/utils/generarHTMLDesdeSecciones.js")
    ).default;
    const { generarHTMLDesdeSecciones } = generatorModule;
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
    t.after(async () => browser.close());

    const sections = [
      { id: "touch-hero", orden: 0, altoModo: "pantalla", altura: 500, fondo: "#f5f0ff" },
      { id: "touch-details", orden: 1, altoModo: "fijo", altura: 900, fondo: "#ffffff" },
      { id: "touch-gallery", orden: 2, altoModo: "fijo", altura: 900, fondo: "#efe7ff" },
    ];
    const objects = sections.flatMap((section, sectionIndex) => [
      {
        id: `${section.id}-title`,
        tipo: "texto",
        seccionId: section.id,
        x: 120,
        y: 90,
        width: 560,
        texto: `Section ${sectionIndex + 1}`,
        fontSize: 42,
        textAlign: "center",
        role: "title",
      },
      {
        id: `${section.id}-copy`,
        tipo: "texto",
        seccionId: section.id,
        x: 140,
        y: 260,
        width: 520,
        texto: "Representative published mobile content",
        fontSize: 26,
        textAlign: "center",
      },
    ]);
    const html = generarHTMLDesdeSecciones(sections, objects, null, {
      slug: "published-mobile-native-scroll",
    });

    async function dispatchTouchGesture(page) {
      const client = await page.createCDPSession();
      const x = Math.round(Number(page.viewport()?.width || 390) * 0.5);
      const viewportHeight = Number(page.viewport()?.height || 844);
      const startY = Math.round(viewportHeight * 0.78);
      const endY = Math.round(viewportHeight * 0.22);
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y: startY }],
      });
      for (let step = 1; step <= 8; step += 1) {
        const y = startY + ((endY - startY) * step) / 8;
        await client.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y }],
        });
        await new Promise((resolve) => setTimeout(resolve, 24));
      }
      await client.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await new Promise((resolve) => setTimeout(resolve, 240));
      await client.detach();
    }

    for (const viewport of MOBILE_GEOMETRY_PARITY_VIEWPORTS) {
      await t.test(viewport.id, async () => {
        const page = await browser.newPage();
        await page.setViewport({
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
        });
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          () => document.body?.getAttribute("data-loader-ready") === "1",
          { timeout: 15_000 }
        );

        const before = await page.evaluate(() => ({
          htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
          bodyOverflowY: getComputedStyle(document.body).overflowY,
          htmlScrollTop: document.documentElement.scrollTop,
          bodyScrollTop: document.body.scrollTop,
          scrollHeight: document.documentElement.scrollHeight,
          sectionHeights: Array.from(document.querySelectorAll(".sec")).map(
            (section) => Number(section.getBoundingClientRect().height.toFixed(2))
          ),
        }));

        await dispatchTouchGesture(page);

        const after = await page.evaluate(() => ({
          htmlScrollTop: document.documentElement.scrollTop,
          bodyScrollTop: document.body.scrollTop,
          scrollHeight: document.documentElement.scrollHeight,
          sectionHeights: Array.from(document.querySelectorAll(".sec")).map(
            (section) => Number(section.getBoundingClientRect().height.toFixed(2))
          ),
        }));

        assert.equal(before.htmlOverflowY, "auto", `${viewport.id}: HTML root overflow`);
        assert.equal(before.bodyOverflowY, "visible", `${viewport.id}: BODY overflow`);
        assert.ok(
          after.htmlScrollTop > 100,
          `${viewport.id}: first touch must move HTML, got ${after.htmlScrollTop}`
        );
        assert.equal(after.bodyScrollTop, 0, `${viewport.id}: BODY must not consume touch`);
        assert.equal(after.scrollHeight, before.scrollHeight, `${viewport.id}: stable scroll range`);
        assert.deepEqual(
          after.sectionHeights,
          before.sectionHeights,
          `${viewport.id}: touch must not mutate section geometry`
        );
        await page.close();
      });
    }
  }
);

test(
  "opt-in scaled iframe capture keeps section junctions covered without geometry drift",
  {
    skip:
      process.env.PREVIEW_PUBLISH_MOBILE_GEOMETRY !== "1"
        ? "Set PREVIEW_PUBLISH_MOBILE_GEOMETRY=1 to run scaled iframe seam capture."
        : false,
  },
  async (t) => {
    const { default: puppeteer } = await import("puppeteer");
    const { default: sharp } = await import("sharp");
    const { installFirebaseStorageMock } = await import(
      "../functions/testUtils/firebaseStorageMock.mjs"
    );
    const publicationPublishValidationModule = (
      await import("../functions/lib/payments/publicationPublishValidation.js")
    ).default;
    const {
      generateHtmlFromPreparedRenderPayload,
      prepareRenderPayload,
    } = publicationPublishValidationModule;
    const storageMock = installFirebaseStorageMock({
      defaultBucketName: "preview-publish-geometry.appspot.com",
      files: {},
    });
    t.after(() => storageMock.restore());
    const browser = await puppeteer.launch({
      headless: "shell",
      timeout: 60_000,
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
    t.after(async () => browser.close());

    const viewports = [
      { id: "desktop-1280x820", width: 1280, height: 820, previewViewport: "desktop" },
      { id: "mobile-390x844", width: 390, height: 844, previewViewport: "mobile" },
    ];
    const scaleCases = [
      { scale: 0.32, devicePixelRatio: 1 },
      { scale: 0.53, devicePixelRatio: 1 },
      { scale: 0.53, devicePixelRatio: 2 },
      { scale: 0.9, devicePixelRatio: 2 },
    ];
    const waveScaleCases = [
      { scale: 0.32, devicePixelRatio: 1 },
      { scale: 0.32, devicePixelRatio: 2 },
      { scale: 0.53, devicePixelRatio: 1 },
      { scale: 0.53, devicePixelRatio: 2 },
      { scale: 0.9, devicePixelRatio: 1 },
      { scale: 0.9, devicePixelRatio: 2 },
    ];
    const junctionCases = [
      {
        id: "noir-consecutive-dark",
        sections: NOIR_SECTION_JUNCTION_FIXTURE,
        boundaryIndex: 4,
        expectedMaxChannel: 0x62,
      },
      {
        id: "consecutive-dark",
        sections: [
          { id: "dark-a", orden: 0, altoModo: "fijo", altura: 503, fondo: "#101014" },
          { id: "dark-b", orden: 1, altoModo: "fijo", altura: 497, fondo: "#101014" },
        ],
        boundaryIndex: 0,
        expectedMaxChannel: 0x14,
      },
      {
        id: "light-to-dark",
        sections: [
          { id: "light-a", orden: 0, altoModo: "fijo", altura: 503, fondo: "#ccbb9f" },
          { id: "dark-b", orden: 1, altoModo: "fijo", altura: 497, fondo: "#2f3c61" },
        ],
        boundaryIndex: 0,
        expectedMaxChannel: 0xcc,
      },
      {
        id: "consecutive-image-backgrounds",
        sections: [
          {
            id: "image-a",
            orden: 0,
            altoModo: "fijo",
            altura: 503,
            fondo: "#ffffff",
            fondoTipo: "imagen",
            fondoImagen: DARK_SECTION_IMAGE,
            decoracionesFondo: { parallax: "dynamic", items: [] },
          },
          {
            id: "image-b",
            orden: 1,
            altoModo: "fijo",
            altura: 497,
            fondo: "#ffffff",
            fondoTipo: "imagen",
            fondoImagen: DARK_SECTION_IMAGE,
            decoracionesFondo: { parallax: "dynamic", items: [] },
          },
        ],
        boundaryIndex: 0,
        expectedMaxChannel: null,
      },
    ];
    const waveJunctionCases = [
      "wave-soft",
      "wave-wide",
      "wave-double",
      "wave-asymmetric",
    ].flatMap((presetId) =>
      ["top", "bottom", "both"].map((placement) => ({
        id: `${presetId}-${placement}`,
        presetId,
        placement,
        boundaryIndex: 0,
        expectedBoundaryRgb:
          placement === "bottom" ? [38, 53, 111] : [246, 209, 231],
        sections: [
          {
            id: "wave-first",
            orden: 0,
            altoModo: "fijo",
            altura: 503,
            fondo: "#f6d1e7",
            divisores: {
              top: "none",
              bottom:
                placement === "bottom" || placement === "both"
                  ? presetId
                  : "none",
              height: 84,
            },
          },
          {
            id: "wave-second",
            orden: 1,
            altoModo: "fijo",
            altura: 497,
            fondo: "#26356f",
            divisores: {
              top:
                placement === "top" || placement === "both"
                  ? presetId
                  : "none",
              bottom: "none",
              height: 68,
            },
          },
        ],
      }))
    );
    const desktopImageWaveJunctionCase = {
      id: "wave-soft-bottom-image-background",
      presetId: "wave-soft",
      placement: "bottom",
      boundaryIndex: 0,
      expectedBoundaryRgb: [38, 53, 111],
      sections: [
        {
          id: "wave-image-first",
          orden: 0,
          altoModo: "fijo",
          altura: 503,
          fondo: "#f6d1e7",
          fondoTipo: "imagen",
          fondoImagen: DARK_SECTION_IMAGE,
          divisores: {
            top: "none",
            bottom: "wave-soft",
            height: 84,
          },
        },
        {
          id: "wave-image-second",
          orden: 1,
          altoModo: "fijo",
          altura: 497,
          fondo: "#26356f",
        },
      ],
    };

    async function settleInvitation(target) {
      await target.evaluate(async () => {
        document.querySelectorAll('[id*="load"]').forEach((node) => node.remove());
        if (document.body) {
          document.body.dataset.loaderReady = "1";
        }
        const invitation = document.querySelector(".inv");
        invitation?.style.setProperty("animation", "none", "important");
        invitation?.style.setProperty("opacity", "1", "important");
        invitation?.style.setProperty("transition", "none", "important");
        document.querySelectorAll("*").forEach((node) => {
          node.style?.setProperty("animation-duration", "0s", "important");
          node.style?.setProperty("transition", "none", "important");
        });
        await new Promise((resolve) => setTimeout(resolve, 250));
        await Promise.all(
          Array.from(document.images || []).map((image) => {
            if (image.complete) return Promise.resolve();
            return new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true });
              image.addEventListener("error", resolve, { once: true });
            });
          })
        );
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
      });
    }

    async function readJunctionMaxChannel({
      page,
      boundaryY,
      viewportWidth,
      scale,
      devicePixelRatio,
      offset = 0,
    }) {
      const screenshot = await page.screenshot({ type: "png" });
      const { data, info } = await sharp(screenshot)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const x = Math.round(
        (offset + (viewportWidth * scale) / 2) * devicePixelRatio
      );
      const centerY = (offset + boundaryY * scale) * devicePixelRatio;
      let maxChannel = 0;

      for (
        let y = Math.floor(centerY) - 2;
        y <= Math.ceil(centerY) + 2;
        y += 1
      ) {
        const index = (y * info.width + x) * info.channels;
        maxChannel = Math.max(
          maxChannel,
          data[index],
          data[index + 1],
          data[index + 2]
        );
      }

      return maxChannel;
    }

    async function readJunctionBandDeviation({
      page,
      boundaryY,
      viewportWidth,
      scale,
      devicePixelRatio,
      expectedRgb,
      offset = 0,
    }) {
      const screenshot = await page.screenshot({ type: "png" });
      const { data, info } = await sharp(screenshot)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const startX = Math.max(
        0,
        Math.ceil((offset + 4 * scale) * devicePixelRatio)
      );
      const endX = Math.min(
        info.width - 1,
        Math.floor(
          (offset + (viewportWidth - 4) * scale) * devicePixelRatio
        )
      );
      const boundaryPhysicalY =
        (offset + boundaryY * scale) * devicePixelRatio;
      let maxUnexpectedCoverageRatio = 0;
      let maxChannelDeviation = 0;

      for (
        let y = Math.floor(boundaryPhysicalY) - 1;
        y <= Math.ceil(boundaryPhysicalY) + 1;
        y += 1
      ) {
        let unexpectedPixels = 0;
        let rowPixels = 0;
        for (let x = startX; x <= endX; x += 1) {
          const index = (y * info.width + x) * info.channels;
          const deviation = Math.max(
            Math.abs(data[index] - expectedRgb[0]),
            Math.abs(data[index + 1] - expectedRgb[1]),
            Math.abs(data[index + 2] - expectedRgb[2])
          );
          maxChannelDeviation = Math.max(maxChannelDeviation, deviation);
          if (deviation > 8) unexpectedPixels += 1;
          rowPixels += 1;
        }
        maxUnexpectedCoverageRatio = Math.max(
          maxUnexpectedCoverageRatio,
          rowPixels > 0 ? unexpectedPixels / rowPixels : 0
        );
      }

      return {
        maxChannelDeviation,
        maxUnexpectedCoverageRatio,
      };
    }

    async function readDividerSideBandDeviation({
      page,
      dividerRect,
      viewportWidth,
      scale,
      devicePixelRatio,
      expectedRgb,
      slot,
      offset = 0,
    }) {
      const screenshot = await page.screenshot({ type: "png" });
      const { data, info } = await sharp(screenshot)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const dividerTop = offset + Number(dividerRect?.top || 0) * scale;
      const dividerHeight = Math.max(0, Number(dividerRect?.height || 0) * scale);
      const solidBandTop =
        slot === "top"
          ? dividerTop + dividerHeight * 0.05
          : dividerTop + dividerHeight * 0.8;
      const solidBandBottom =
        slot === "top"
          ? dividerTop + dividerHeight * 0.2
          : dividerTop + dividerHeight * 0.95;
      const startY = Math.max(
        0,
        Math.ceil(solidBandTop * devicePixelRatio)
      );
      const endY = Math.min(
        info.height - 1,
        Math.floor(solidBandBottom * devicePixelRatio)
      );
      const leftX = Math.ceil(offset * devicePixelRatio);
      const rightX = Math.min(
        info.width - 1,
        Math.floor(
          (offset + viewportWidth * scale) * devicePixelRatio
        ) - 1
      );
      const sampleColumns = [
        leftX,
        Math.min(info.width - 1, leftX + 1),
        Math.max(0, rightX - 1),
        rightX,
      ];
      let unexpectedPixels = 0;
      let sampledPixels = 0;
      let maxChannelDeviation = 0;

      for (let y = startY; y <= endY; y += 1) {
        for (const x of sampleColumns) {
          const index = (y * info.width + x) * info.channels;
          const deviation = Math.max(
            Math.abs(data[index] - expectedRgb[0]),
            Math.abs(data[index + 1] - expectedRgb[1]),
            Math.abs(data[index + 2] - expectedRgb[2])
          );
          maxChannelDeviation = Math.max(maxChannelDeviation, deviation);
          if (deviation > 8) unexpectedPixels += 1;
          sampledPixels += 1;
        }
      }

      return {
        maxChannelDeviation,
        unexpectedCoverageRatio:
          sampledPixels > 0 ? unexpectedPixels / sampledPixels : 0,
      };
    }

    async function capturePublish(
      html,
      viewport,
      devicePixelRatio,
      boundaryIndex,
      expectedBoundaryRgb = null
    ) {
      const page = await browser.newPage();
      await page.setViewport({
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: devicePixelRatio,
        isMobile: viewport.previewViewport === "mobile",
      });
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await settleInvitation(page);
      const snapshot = await page.evaluate(
        collectMobileGeometrySnapshotFromDocument
      );
      const boundaryBottom = Number(
        snapshot.sections?.[boundaryIndex]?.rect?.bottom || 0
      );
      const maxScroll = await page.evaluate(
        () =>
          Math.max(
            0,
            Number(document.documentElement.scrollHeight || 0) -
              Number(window.innerHeight || 0)
          )
      );
      const requestedScroll = Math.max(
        0,
        Math.min(maxScroll, boundaryBottom - viewport.height / 2)
      );
      await page.evaluate((top) => window.scrollTo(0, top), requestedScroll);
      const scrollTop = await page.evaluate(() => window.scrollY || 0);
      const maxChannel = await readJunctionMaxChannel({
        page,
        boundaryY: boundaryBottom - scrollTop,
        viewportWidth: viewport.width,
        scale: 1,
        devicePixelRatio,
      });
      const boundaryBand = expectedBoundaryRgb
        ? await readJunctionBandDeviation({
            page,
            boundaryY: boundaryBottom - scrollTop,
            viewportWidth: viewport.width,
            scale: 1,
            devicePixelRatio,
            expectedRgb: expectedBoundaryRgb,
          })
        : null;
      await page.close();
      return { boundaryBand, maxChannel, snapshot };
    }

    async function capturePreview(
      html,
      viewport,
      { scale, devicePixelRatio },
      boundaryIndex,
      expectedBoundaryRgb = null,
      dividerSlot = ""
    ) {
      const page = await browser.newPage();
      const offset = 8;
      await page.setViewport({
        width: Math.ceil(viewport.width * scale) + offset * 2,
        height: Math.ceil(viewport.height * scale) + offset * 2,
        deviceScaleFactor: devicePixelRatio,
        isMobile: viewport.previewViewport === "mobile",
      });
      await page.setContent(
        `<meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          html,body{margin:0;background:#f6f2fb}
          #clip{position:absolute;left:${offset}px;top:${offset}px;width:${Math.ceil(
            viewport.width * scale
          )}px;height:${Math.ceil(
            viewport.height * scale
          )}px;overflow:hidden}
          #logical{width:${viewport.width}px;height:${
            viewport.height
          }px;zoom:${scale}}
          #preview{display:block;width:${viewport.width}px;height:${
            viewport.height
          }px;border:0}
        </style>
        <div id="clip"><div id="logical"><iframe id="preview"></iframe></div></div>`,
        { waitUntil: "domcontentloaded" }
      );

      const isMobilePreview = viewport.previewViewport === "mobile";
      const scrollAuthority = isMobilePreview
        ? PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY
        : PREVIEW_FRAME_SCROLL_AUTHORITIES.DOCUMENT;
      let srcDoc = buildPreviewFrameSrcDoc(html, {
        previewViewport: viewport.previewViewport,
        layoutMode: "parity",
        previewSurface: isMobilePreview
          ? "mobile-preview-paired"
          : "desktop-preview-paired",
        scrollAuthority,
      });
      const previewRuntimeStyle = buildScrollbarStyleText({
        parityMobileScrollRoot: isMobilePreview,
        scrollAuthority,
      });
      srcDoc = srcDoc.replace(
        /<\/head>/i,
        `<style>${previewRuntimeStyle}</style></head>`
      );

      await page.$eval("#preview", (iframe, value) => {
        iframe.srcdoc = value;
      }, srcDoc);
      await page.waitForFunction(
        () =>
          document.querySelector("#preview")?.contentDocument?.querySelectorAll(
            ".sec"
          ).length > 1
      );
      const frame = await (await page.$("#preview")).contentFrame();
      await settleInvitation(frame);
      await frame.evaluate(() => {
        document.documentElement?.setAttribute(
          "data-preview-raster-scale",
          "scaled"
        );
        document.body?.setAttribute("data-preview-raster-scale", "scaled");
        return new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
      });
      const snapshot = await frame.evaluate(
        collectMobileGeometrySnapshotFromDocument
      );
      const boundaryBottom = Number(
        snapshot.sections?.[boundaryIndex]?.rect?.bottom || 0
      );
      const maxScroll = await frame.evaluate(() => {
        const root =
          document.documentElement?.getAttribute(
            "data-preview-scroll-authority"
          ) === "body"
            ? document.body
            : document.scrollingElement ||
              document.documentElement ||
              document.body;
        return Math.max(
          0,
          Number(root?.scrollHeight || 0) -
            Number(root?.clientHeight || window.innerHeight || 0)
        );
      });
      const requestedScroll = Math.max(
        0,
        Math.min(maxScroll, boundaryBottom - viewport.height / 2)
      );
      const scrollTop = await frame.evaluate((top) => {
        const root =
          document.documentElement?.getAttribute(
            "data-preview-scroll-authority"
          ) === "body"
            ? document.body
            : document.scrollingElement ||
              document.documentElement ||
              document.body;
        if (root) root.scrollTop = top;
        return Number(root?.scrollTop || 0);
      }, requestedScroll);
      const dividerRect = dividerSlot
        ? await frame.evaluate((slot) => {
            const node = document.querySelector(`.sec-divider--${slot}`);
            if (!node) return null;
            const rect = node.getBoundingClientRect();
            return {
              top: rect.top,
              height: rect.height,
            };
          }, dividerSlot)
        : null;
      const maxChannel = await readJunctionMaxChannel({
        page,
        boundaryY: boundaryBottom - scrollTop,
        viewportWidth: viewport.width,
        scale,
        devicePixelRatio,
        offset,
      });
      const boundaryBand = expectedBoundaryRgb
        ? await readJunctionBandDeviation({
            page,
            boundaryY: boundaryBottom - scrollTop,
            viewportWidth: viewport.width,
            scale,
            devicePixelRatio,
            expectedRgb: expectedBoundaryRgb,
            offset,
          })
        : null;
      const dividerSideBand = expectedBoundaryRgb && dividerRect && dividerSlot
        ? await readDividerSideBandDeviation({
            page,
            dividerRect,
            viewportWidth: viewport.width,
            scale,
            devicePixelRatio,
            expectedRgb: expectedBoundaryRgb,
            slot: dividerSlot,
            offset,
          })
        : null;
      await page.close();
      return { boundaryBand, dividerSideBand, maxChannel, snapshot };
    }

    for (const fixture of junctionCases) {
      await t.test(fixture.id, async () => {
        const prepared = await prepareRenderPayload({
          secciones: fixture.sections,
          objetos: [],
        });
        const previewHtml = generateHtmlFromPreparedRenderPayload(prepared, {
          slug: `${fixture.id}-preview`,
          isPreview: true,
        });
        const publishHtml = generateHtmlFromPreparedRenderPayload(prepared, {
          slug: `${fixture.id}-publish`,
        });

        for (const viewport of viewports) {
          const publishByDpr = new Map();
          for (const devicePixelRatio of [1, 2]) {
            publishByDpr.set(
              devicePixelRatio,
              await capturePublish(
                publishHtml,
                viewport,
                devicePixelRatio,
                fixture.boundaryIndex
              )
            );
          }

          for (const scaleCase of scaleCases) {
            const preview = await capturePreview(
              previewHtml,
              viewport,
              scaleCase,
              fixture.boundaryIndex
            );
            const publish = publishByDpr.get(scaleCase.devicePixelRatio);
            assert.deepEqual(
              diffMobileGeometrySnapshots(
                preview.snapshot,
                publish.snapshot
              ),
              [],
              `${fixture.id} ${viewport.id} scale=${scaleCase.scale} dpr=${scaleCase.devicePixelRatio}`
            );
            const allowedMax = Math.max(
              Number(fixture.expectedMaxChannel || 0) + 6,
              Number(publish.maxChannel || 0) + 4
            );
            assert.ok(
              preview.maxChannel <= allowedMax,
              `${fixture.id} ${viewport.id} scale=${scaleCase.scale} dpr=${scaleCase.devicePixelRatio}: junction max ${preview.maxChannel}, allowed ${allowedMax}`
            );
          }
        }
      });
    }

    const mobileViewport = viewports.find(
      (viewport) => viewport.previewViewport === "mobile"
    );
    assert.ok(mobileViewport);

    for (const fixture of waveJunctionCases) {
      await t.test(`wave-${fixture.id}`, async () => {
        const prepared = await prepareRenderPayload({
          secciones: fixture.sections,
          objetos: [],
        });
        const previewHtml = generateHtmlFromPreparedRenderPayload(prepared, {
          slug: `${fixture.id}-preview`,
          isPreview: true,
        });
        const publishHtml = generateHtmlFromPreparedRenderPayload(prepared, {
          slug: `${fixture.id}-publish`,
        });
        const publishByDpr = new Map();

        for (const devicePixelRatio of [1, 2]) {
          const publish = await capturePublish(
            publishHtml,
            mobileViewport,
            devicePixelRatio,
            fixture.boundaryIndex,
            fixture.expectedBoundaryRgb
          );
          assert.ok(
            publish.boundaryBand.maxUnexpectedCoverageRatio <= 0.01,
            `${fixture.id} publish dpr=${devicePixelRatio}: unexpected full-width boundary coverage ${publish.boundaryBand.maxUnexpectedCoverageRatio}, max channel deviation ${publish.boundaryBand.maxChannelDeviation}`
          );
          publishByDpr.set(devicePixelRatio, publish);
        }

        for (const scaleCase of waveScaleCases) {
          const preview = await capturePreview(
            previewHtml,
            mobileViewport,
            scaleCase,
            fixture.boundaryIndex,
            fixture.expectedBoundaryRgb
          );
          const publish = publishByDpr.get(scaleCase.devicePixelRatio);
          assert.deepEqual(
            diffMobileGeometrySnapshots(preview.snapshot, publish.snapshot),
            [],
            `${fixture.id} mobile scale=${scaleCase.scale} dpr=${scaleCase.devicePixelRatio}`
          );
          assert.ok(
            preview.boundaryBand.maxUnexpectedCoverageRatio < 0.5,
            `${fixture.id} mobile scale=${scaleCase.scale} dpr=${scaleCase.devicePixelRatio}: unexpected full-width boundary coverage ${preview.boundaryBand.maxUnexpectedCoverageRatio}, publish ${publish.boundaryBand.maxUnexpectedCoverageRatio}, max channel deviation ${preview.boundaryBand.maxChannelDeviation}`
          );
        }
      });
    }

    await t.test("desktop-image-background-wave", async () => {
      const fixture = desktopImageWaveJunctionCase;
      const desktopViewport = viewports.find(
        (viewport) => viewport.previewViewport === "desktop"
      );
      assert.ok(desktopViewport);
      const prepared = await prepareRenderPayload({
        secciones: fixture.sections,
        objetos: [],
      });
      const previewHtml = generateHtmlFromPreparedRenderPayload(prepared, {
        slug: `${fixture.id}-preview`,
        isPreview: true,
      });
      const publishHtml = generateHtmlFromPreparedRenderPayload(prepared, {
        slug: `${fixture.id}-publish`,
      });
      const publishByDpr = new Map();

      for (const devicePixelRatio of [1, 2]) {
        publishByDpr.set(
          devicePixelRatio,
          await capturePublish(
            publishHtml,
            desktopViewport,
            devicePixelRatio,
            fixture.boundaryIndex,
            fixture.expectedBoundaryRgb
          )
        );
      }

      for (const scaleCase of waveScaleCases) {
        const preview = await capturePreview(
          previewHtml,
          desktopViewport,
          scaleCase,
          fixture.boundaryIndex,
          fixture.expectedBoundaryRgb,
          fixture.placement
        );
        const publish = publishByDpr.get(scaleCase.devicePixelRatio);
        assert.deepEqual(
          diffMobileGeometrySnapshots(preview.snapshot, publish.snapshot),
          [],
          `${fixture.id} desktop scale=${scaleCase.scale} dpr=${scaleCase.devicePixelRatio}`
        );
        assert.ok(
          preview.boundaryBand.maxUnexpectedCoverageRatio < 0.5,
          `${fixture.id} desktop scale=${scaleCase.scale} dpr=${scaleCase.devicePixelRatio}: unexpected horizontal boundary coverage ${preview.boundaryBand.maxUnexpectedCoverageRatio}, publish ${publish.boundaryBand.maxUnexpectedCoverageRatio}`
        );
        assert.ok(
          preview.dividerSideBand.unexpectedCoverageRatio <= 0.1,
          `${fixture.id} desktop scale=${scaleCase.scale} dpr=${scaleCase.devicePixelRatio}: unexpected side coverage ${preview.dividerSideBand.unexpectedCoverageRatio}, max channel deviation ${preview.dividerSideBand.maxChannelDeviation}`
        );
      }
    });
  }
);

test(
  "opt-in browser capture compares generated mobile preview and publish geometry",
  {
    skip:
      process.env.PREVIEW_PUBLISH_MOBILE_GEOMETRY !== "1"
        ? "Set PREVIEW_PUBLISH_MOBILE_GEOMETRY=1 to run Puppeteer geometry parity capture."
        : false,
  },
  async (t) => {
    const { default: puppeteer } = await import("puppeteer");
    const publicationPublishValidationModule = (
      await import("../functions/lib/payments/publicationPublishValidation.js")
    ).default;
    const { installFirebaseStorageMock } = await import(
      "../functions/testUtils/firebaseStorageMock.mjs"
    );
    const {
      createPublishValidationImageDownloadBuffer,
    } = await import("./publicationPublishValidationFixtures.mjs");
    const {
      FIXTURE_PATHS,
    } = await import("./renderAssetContractFixtures.mjs");
    const {
      PREVIEW_PUBLISH_PARITY_DEFAULT_BUCKET,
    } = await import("./previewPublishParityFixtures.mjs");
    const {
      previewPublishVisualBaselineFixtures,
    } = await import("./previewPublishVisualBaselineFixtures.mjs");
    const storageMock = installFirebaseStorageMock({
      defaultBucketName: PREVIEW_PUBLISH_PARITY_DEFAULT_BUCKET,
      files: {
        [FIXTURE_PATHS.heroImage]: {
          downloadBuffer: createPublishValidationImageDownloadBuffer(),
        },
        [FIXTURE_PATHS.rasterIcon]: {},
        [FIXTURE_PATHS.galleryOne]: {},
        [FIXTURE_PATHS.galleryTwo]: {},
        [FIXTURE_PATHS.galleryThree]: {},
        [FIXTURE_PATHS.sectionBackground]: {},
        [FIXTURE_PATHS.decorTop]: {},
        [FIXTURE_PATHS.decorBottom]: {},
        [FIXTURE_PATHS.countdownFrame]: {},
      },
    });
    t.after(() => storageMock.restore());

    const {
      generateHtmlFromPreparedRenderPayload,
      prepareRenderPayload,
    } = publicationPublishValidationModule;
    const browser = await puppeteer.launch({ headless: "new" });
    t.after(async () => browser.close());

    async function waitForLayoutSettle(target) {
      await target.waitForFunction(() => document.readyState === "complete");
      await target.evaluate(async () => {
        if (document.fonts?.ready) {
          try {
            await document.fonts.ready;
          } catch (_error) {
            // noop
          }
        }
        await Promise.all(
          Array.from(document.images || []).map((image) => {
            if (image.complete) return Promise.resolve();
            return new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true });
              image.addEventListener("error", resolve, { once: true });
            });
          })
        );
        await new Promise((resolve) => setTimeout(resolve, 1950));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
    }

    async function capturePublishSnapshot(html, viewport) {
      const page = await browser.newPage();
      await page.setViewport({
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        isMobile: true,
      });
      await page.setContent(html, { waitUntil: "load" });
      await waitForLayoutSettle(page);
      const snapshot = await page.evaluate(collectMobileGeometrySnapshotFromDocument);
      await page.close();
      return snapshot;
    }

    async function capturePreviewSnapshot(html, viewport) {
      const page = await browser.newPage();
      await page.setViewport({
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        isMobile: true,
      });
      await page.setContent(
        `<iframe id="preview" sandbox="allow-scripts allow-same-origin" style="width:${viewport.width}px;height:${viewport.height}px;border:0;display:block"></iframe>`,
        { waitUntil: "load" }
      );
      const srcDoc = buildPreviewFrameSrcDoc(html, {
        previewViewport: "mobile",
        layoutMode: "parity",
      });
      await page.$eval("#preview", (iframe, value) => {
        iframe.srcdoc = value;
      }, srcDoc);
      const frameHandle = await page.$("#preview");
      const frame = await frameHandle.contentFrame();
      await waitForLayoutSettle(frame);
      const snapshot = await frame.evaluate(collectMobileGeometrySnapshotFromDocument);
      await page.close();
      return snapshot;
    }

    function assertObjectCenteredOnSection(snapshot, objectId, message) {
      const object = (snapshot?.objects || []).find((entry) => entry.id === objectId);
      assert.ok(object, `${message}: missing ${objectId}`);

      const section = (snapshot?.sections || []).find(
        (entry) => entry.id === object.sectionId
      );
      assert.ok(section, `${message}: missing section for ${objectId}`);

      const expectedCenter =
        Number(section.contentRect?.left || 0) + Number(section.contentRect?.width || 0) / 2;
      const actualCenter =
        Number(object.rect?.left || 0) + Number(object.rect?.width || 0) / 2;
      assert.ok(
        Math.abs(actualCenter - expectedCenter) <= 3,
        `${message}: ${objectId} center ${actualCenter.toFixed(2)} differs from section center ${expectedCenter.toFixed(2)}`
      );
    }

    for (const fixture of previewPublishVisualBaselineFixtures) {
      await t.test(fixture.id, async () => {
        const prepared = await prepareRenderPayload(fixture.publishDraft);
        const previewHtml = generateHtmlFromPreparedRenderPayload(prepared, {
          slug: "mobile-geometry-preview",
          isPreview: true,
        });
        const publishHtml = generateHtmlFromPreparedRenderPayload(prepared, {
          slug: "mobile-geometry-publish",
        });

        for (const viewport of MOBILE_GEOMETRY_PARITY_VIEWPORTS) {
          const previewSnapshot = await capturePreviewSnapshot(previewHtml, viewport);
          const publishSnapshot = await capturePublishSnapshot(publishHtml, viewport);
          const diffs = diffMobileGeometrySnapshots(previewSnapshot, publishSnapshot);
          assert.deepEqual(diffs, [], `${fixture.id} ${viewport.id}`);

          if (fixture.id === "fixed-reflow-title-visual-columns") {
            [
              "ceremony-icon",
              "ceremony-label",
              "ceremony-time",
              "ceremony-place",
              "party-icon",
              "party-label",
              "party-time",
              "party-place",
            ].forEach((objectId) => {
              assertObjectCenteredOnSection(
                previewSnapshot,
                objectId,
                `${fixture.id} preview ${viewport.id}`
              );
              assertObjectCenteredOnSection(
                publishSnapshot,
                objectId,
                `${fixture.id} publish ${viewport.id}`
              );
            });
          }
        }
      });
    }
  }
);
