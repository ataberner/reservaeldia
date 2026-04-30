import test from "node:test";
import assert from "node:assert/strict";

import {
  MOBILE_GEOMETRY_PARITY_DEFAULT_TOLERANCE_PX,
  MOBILE_GEOMETRY_PARITY_VIEWPORTS,
  collectMobileGeometrySnapshotFromDocument,
  createSyntheticGeometrySnapshot,
  diffMobileGeometrySnapshots,
} from "./previewPublishMobileGeometryParity.mjs";

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
    const {
      buildPreviewFrameSrcDoc,
    } = await import("../src/components/preview/previewFrameRuntime.js");

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
