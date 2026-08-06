const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  resolvePaths,
  seedReleaseSnapshot,
} = require("./retainNextStaticAssets.cjs");

function extractHtmlStaticPaths(html) {
  return new Set(
    Array.from(
      String(html || "").matchAll(
        /(?:src|href)="(\/_next\/static\/[^"?]+)(?:\?[^"]*)?"/g
      ),
      (match) => match[1]
    )
  );
}

function extractBuildManifestStaticPaths(manifestSource) {
  return new Set(
    Array.from(
      String(manifestSource || "").matchAll(
        /static\/(?:chunks|css)\/[A-Za-z0-9_./-]+/g
      ),
      (match) => `/_next/${match[0]}`
    )
  );
}

function extractWebpackRuntimeStaticPaths(runtimeSource) {
  const source = String(runtimeSource || "");
  const resolverMatch = source.match(
    /\.u=e=>([\s\S]*?),[A-Za-z_$][\w$]*\.miniCssF=/
  );
  if (!resolverMatch?.[1]) return new Set();

  const resolverSource = resolverMatch[1];
  const assetPaths = new Set(
    Array.from(
      resolverSource.matchAll(/["'](static\/chunks\/[^"']+\.js)["']/g),
      (match) => `/_next/${match[1]}`
    )
  );
  const aliases = new Map(
    Array.from(
      resolverSource.matchAll(/(\d+)===e\?"([^"]+)":e/g),
      (match) => [match[1], match[2]]
    )
  );
  for (const match of resolverSource.matchAll(/(\d+):"([a-f0-9]+)"/g)) {
    const chunkId = match[1];
    const fileBase = aliases.get(chunkId) || chunkId;
    assetPaths.add(
      `/_next/static/chunks/${fileBase}.${match[2]}.js`
    );
  }
  return assetPaths;
}

function readFirebaseCacheStaticPaths(rootDir) {
  const cacheFile = path.join(
    rootDir,
    ".firebase",
    "hosting.b3V0.cache"
  );
  if (!fs.existsSync(cacheFile)) return new Set();

  const paths = new Set();
  for (const line of fs.readFileSync(cacheFile, "utf8").split(/\r?\n/)) {
    const assetPath = String(line.split(",", 1)[0] || "").trim();
    if (assetPath.startsWith("_next/static/")) {
      paths.add(`/${assetPath}`);
    }
  }
  return paths;
}

function readBuildIdFromHtml(html) {
  const match = String(html || "").match(/"buildId":"([^"]+)"/);
  if (!match?.[1]) {
    throw new Error("The live dashboard HTML does not expose a Next.js buildId.");
  }
  return match[1];
}

async function fetchText(fetchImpl, url) {
  const response = await fetchImpl(url, {
    cache: "no-store",
    headers: {
      "cache-control": "no-cache",
    },
  });
  if (!response.ok) {
    throw new Error(`Unable to read ${url}: HTTP ${response.status}`);
  }
  return response.text();
}

async function bootstrapNextStaticHistory({
  rootDir = process.cwd(),
  origin,
  fetchImpl = globalThis.fetch,
} = {}) {
  const root = path.resolve(rootDir);
  const paths = resolvePaths(root);
  if (fs.existsSync(paths.manifestFile)) {
    const manifest = JSON.parse(fs.readFileSync(paths.manifestFile, "utf8"));
    if (Array.isArray(manifest?.releaseIds) && manifest.releaseIds.length > 0) {
      return {
        bootstrapped: false,
        reason: "history-present",
        releaseIds: manifest.releaseIds,
        downloadedFiles: 0,
      };
    }
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("A Fetch API implementation is required for live bootstrap.");
  }

  const normalizedOrigin = String(origin || "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(normalizedOrigin)) {
    throw new Error(`Invalid bootstrap origin: ${origin}`);
  }

  const dashboardHtml = await fetchText(
    fetchImpl,
    `${normalizedOrigin}/dashboard/?static-history-bootstrap=1`
  );
  const buildId = readBuildIdFromHtml(dashboardHtml);
  const assetPaths = new Set([
    ...extractHtmlStaticPaths(dashboardHtml),
    ...readFirebaseCacheStaticPaths(root),
  ]);

  const buildManifestPath = Array.from(assetPaths).find((assetPath) =>
    assetPath.endsWith("/_buildManifest.js")
  );
  if (!buildManifestPath) {
    throw new Error("The live dashboard does not reference a build manifest.");
  }
  const buildManifestSource = await fetchText(
    fetchImpl,
    `${normalizedOrigin}${buildManifestPath}`
  );
  for (const assetPath of extractBuildManifestStaticPaths(buildManifestSource)) {
    assetPaths.add(assetPath);
  }

  const webpackRuntimePath = Array.from(assetPaths).find((assetPath) =>
    /\/chunks\/webpack-[^/]+\.js$/.test(assetPath)
  );
  if (!webpackRuntimePath) {
    throw new Error("The live dashboard does not reference a Webpack runtime.");
  }
  const webpackRuntimeSource = await fetchText(
    fetchImpl,
    `${normalizedOrigin}${webpackRuntimePath}`
  );
  for (const assetPath of extractWebpackRuntimeStaticPaths(
    webpackRuntimeSource
  )) {
    assetPaths.add(assetPath);
  }

  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "reservaeldia-live-static-")
  );
  let downloadedFiles = 0;
  let cursor = 0;
  const candidates = Array.from(assetPaths).sort();
  try {
    const workers = Array.from({ length: 8 }, async () => {
      while (cursor < candidates.length) {
        const assetPath = candidates[cursor];
        cursor += 1;
        const response = await fetchImpl(
          `${normalizedOrigin}${encodeURI(assetPath)}`,
          {
            cache: "no-store",
            headers: {
              "cache-control": "no-cache",
            },
          }
        );
        if (response.status === 404) continue;
        if (!response.ok) {
          throw new Error(
            `Unable to bootstrap ${assetPath}: HTTP ${response.status}`
          );
        }
        const relativePath = assetPath.replace(/^\/_next\/static\//, "");
        const targetPath = path.join(
          temporaryRoot,
          ...relativePath.split("/")
        );
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, Buffer.from(await response.arrayBuffer()));
        downloadedFiles += 1;
      }
    });
    await Promise.all(workers);

    if (
      downloadedFiles < 3 ||
      !fs.existsSync(path.join(temporaryRoot, buildId, "_buildManifest.js"))
    ) {
      throw new Error("The live Next.js asset bootstrap was incomplete.");
    }

    const result = seedReleaseSnapshot({
      rootDir: root,
      releaseId: buildId,
      sourceStaticRoot: temporaryRoot,
    });
    return {
      bootstrapped: result.seeded,
      reason: result.reason,
      releaseIds: result.releaseIds,
      downloadedFiles,
    };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

async function runCli() {
  const originIndex = process.argv.indexOf("--origin");
  const origin = originIndex >= 0 ? process.argv[originIndex + 1] : "";
  const result = await bootstrapNextStaticHistory({
    origin,
  });
  console.log(
    `[next-static-bootstrap] result=${result.reason} releases=${result.releaseIds.length} downloaded=${result.downloadedFiles}`
  );
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  bootstrapNextStaticHistory,
  extractBuildManifestStaticPaths,
  extractHtmlStaticPaths,
  extractWebpackRuntimeStaticPaths,
  readBuildIdFromHtml,
  readFirebaseCacheStaticPaths,
};
