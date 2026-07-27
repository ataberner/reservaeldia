#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  loadProviderContract,
} = require("./analyzeProviderJson.cjs");
const enrichment = require("./enrichProviders.cjs");
const {
  runMassEnrichment,
} = require("./providerEnrichmentBulk.cjs");
const {
  extractProviderPage,
} = require("./providerEnrichmentPage.cjs");
const {
  removeTemporaryDirectory,
} = require("./providerEnrichmentImages.cjs");

function parseArgs(argv) {
  return Object.fromEntries(
    argv.map((entry) => {
      const separator = entry.indexOf("=");
      if (!entry.startsWith("--") || separator < 0) {
        throw new Error(`Argumento inválido: ${entry}`);
      }
      return [
        entry.slice(2, separator),
        entry.slice(separator + 1),
      ];
    })
  );
}

function providerHtml(pageUrl) {
  const slug = new URL(pageUrl).pathname
    .split("/")
    .filter(Boolean)
    .at(-1);
  return `<!doctype html>
<html>
  <head>
    <meta property="og:description" content="Descripción literal del proveedor ${slug} para la prueba de recuperación en emuladores." />
    <meta property="og:image" content="https://cdn.example.test/${slug}-cover.jpg" />
  </head>
  <body>
    <section data-gallery-display>
      <button>Galería (1)</button>
      <a data-gallery-item data-index="0" href="https://cdn.example.test/${slug}-gallery.jpg">
        <img src="https://cdn.example.test/${slug}-gallery-300x200.jpg" />
      </a>
      <script type="application/json" data-gallery-all-images>
        [{"url":"https://cdn.example.test/${slug}-gallery.jpg","lightbox_url":"https://cdn.example.test/${slug}-gallery.jpg"}]
      </script>
      <span data-lightbox-counter>1 / 1</span>
    </section>
  </body>
</html>`;
}

function fakeImage(candidate, index, temporaryDirectory) {
  const buffer = Buffer.from(
    `emulator-image:${candidate.url}`,
    "utf8"
  );
  const hashSha256 = crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
  const temporaryPath = path.join(
    temporaryDirectory,
    `${index}-${hashSha256.slice(0, 12)}.jpg`
  );
  fs.writeFileSync(temporaryPath, buffer);
  return {
    ...candidate,
    finalUrl: candidate.url,
    buffer,
    temporaryPath,
    hashSha256,
    mimeType: "image/jpeg",
    extension: "jpg",
    width: 1200,
    height: 800,
    bytes: buffer.length,
    retries: 0,
  };
}

async function main() {
  const values = parseArgs(process.argv.slice(2));
  const projectId = values.project;
  const statePath = path.resolve(values.state);
  const reportPath = path.resolve(values.report);
  const logPath = path.resolve(values.log);
  const temporaryRoot = path.resolve(values["temp-root"]);
  const crashAfter = Number(values["crash-after"] || 0);
  const recoverPid = values["recover-pid"] || "";
  fs.mkdirSync(temporaryRoot, { recursive: true });

  const runtime =
    enrichment.createFirebaseRuntimeForEmulator({
      projectId,
      storageBucket: `${projectId}.appspot.com`,
      appName: `provider-enrichment-worker-${process.pid}`,
    });
  const contract = loadProviderContract();
  let finished = 0;
  try {
    await runMassEnrichment({
      args: {
        apply: true,
        force: false,
        completeGallery: true,
        debugLocal: false,
        maxGalleryImages: 100,
        providerId: "",
        category: "",
        limit: 100,
        concurrency: 1,
        resumeState: statePath,
        dryRunState: "",
        log: logPath,
        requestDelayMs: 0,
        maxRetries: 0,
        timeoutMs: 1000,
        stopAfterErrors: 10,
        pauseOn429: false,
        recoverStaleLock: Boolean(recoverPid),
        confirmStaleLock: recoverPid,
        project: projectId,
        confirmProject: projectId,
        credentials: "emulator-only",
        report: reportPath,
      },
      runtime,
      contract,
      enrichSingleProvider: enrichment.enrichSingleProvider,
      providerEnrichmentFingerprint:
        enrichment.providerEnrichmentFingerprint,
      dependencies: {
        installProcessHandlers: false,
        interactiveDashboard: false,
        pageFetcher: async ({ url }) => {
          const html = providerHtml(url);
          return {
            html,
            finalUrl: url,
            bytes: Buffer.byteLength(html),
            status: 200,
            retries: 0,
          };
        },
        pageExtractor: extractProviderPage,
        imageDownloader: async ({
          candidate,
          index,
          temporaryDirectory,
        }) =>
          fakeImage(
            candidate,
            index,
            temporaryDirectory
          ),
        temporaryDirectoryFactory() {
          return fs.mkdtempSync(
            path.join(temporaryRoot, "provider-")
          );
        },
        temporaryDirectoryRemover:
          removeTemporaryDirectory,
        async afterProviderFinished() {
          finished += 1;
          if (crashAfter > 0 && finished >= crashAfter) {
            process.exit(77);
          }
        },
      },
    });
  } finally {
    await runtime.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
