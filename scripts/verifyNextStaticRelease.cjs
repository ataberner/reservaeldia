const fs = require("node:fs");
const path = require("node:path");

function listFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const files = [];
  const visit = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      if (entry.isFile()) files.push(absolutePath);
    }
  };
  visit(rootDir);
  return files.sort();
}

function readLocalRelease(rootDir = process.cwd()) {
  const root = path.resolve(rootDir);
  const outputRoot = path.join(root, "out");
  const staticRoot = path.join(outputRoot, "_next", "static");
  const buildIdFile = path.join(root, ".next", "BUILD_ID");
  if (!fs.existsSync(buildIdFile) || !fs.existsSync(staticRoot)) {
    throw new Error("Run the production Next.js build before release verification.");
  }

  const buildId = fs.readFileSync(buildIdFile, "utf8").trim();
  const dashboardHtmlFile = path.join(outputRoot, "dashboard", "index.html");
  if (!fs.existsSync(dashboardHtmlFile)) {
    throw new Error("Dashboard export is missing from out/dashboard/index.html.");
  }

  const dashboardHtml = fs.readFileSync(dashboardHtmlFile, "utf8");
  if (!dashboardHtml.includes(`"buildId":"${buildId}"`)) {
    throw new Error("Dashboard HTML and .next/BUILD_ID do not describe the same build.");
  }

  const assetPaths = new Set();
  for (const htmlFile of listFiles(outputRoot).filter((file) =>
    file.endsWith(".html")
  )) {
    const html = fs.readFileSync(htmlFile, "utf8");
    for (const match of html.matchAll(
      /(?:src|href)="(\/_next\/static\/[^"?]+)(?:\?[^"]*)?"/g
    )) {
      assetPaths.add(match[1]);
    }
  }

  for (const assetPath of assetPaths) {
    const localPath = path.join(outputRoot, ...assetPath.split("/").filter(Boolean));
    if (!fs.existsSync(localPath)) {
      throw new Error(`HTML references a missing Next.js asset: ${assetPath}`);
    }
  }

  const buildManifestPath = path.join(
    staticRoot,
    buildId,
    "_buildManifest.js"
  );
  if (!fs.existsSync(buildManifestPath)) {
    throw new Error(`Current build manifest is missing: ${buildManifestPath}`);
  }

  const buildManifestFiles = listFiles(staticRoot).filter(
    (filePath) => path.basename(filePath) === "_buildManifest.js"
  );
  let buildManifestAssetCount = 0;
  for (const manifestFile of buildManifestFiles) {
    const manifestSource = fs.readFileSync(manifestFile, "utf8");
    const manifestAssets = new Set(
      Array.from(
        manifestSource.matchAll(/static\/(?:chunks|css)\/[A-Za-z0-9_./-]+/g),
        (match) => match[0]
      )
    );
    for (const manifestAsset of manifestAssets) {
      const localPath = path.join(
        outputRoot,
        "_next",
        ...manifestAsset.split("/")
      );
      if (!fs.existsSync(localPath)) {
        throw new Error(
          `Retained build manifest references a missing asset: ${manifestAsset}`
        );
      }
      buildManifestAssetCount += 1;
    }
  }

  return {
    buildId,
    dashboardHtml,
    outputRoot,
    staticRoot,
    staticFiles: listFiles(staticRoot),
    htmlAssetCount: assetPaths.size,
    buildManifestCount: buildManifestFiles.length,
    buildManifestAssetCount,
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithNoCache(url, options = {}) {
  return fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      "cache-control": "no-cache",
      ...(options.headers || {}),
    },
  });
}

async function verifyRemoteRelease(origin, localRelease) {
  const normalizedOrigin = String(origin || "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(normalizedOrigin)) {
    throw new Error(`Invalid verification origin: ${origin}`);
  }

  let dashboardResponse;
  let remoteHtml = "";
  for (const delayMs of [0, 2000, 5000, 10000]) {
    if (delayMs) await sleep(delayMs);
    dashboardResponse = await fetchWithNoCache(
      `${normalizedOrigin}/dashboard/?release-check=${encodeURIComponent(
        localRelease.buildId
      )}`
    );
    remoteHtml = await dashboardResponse.text();
    if (
      dashboardResponse.ok &&
      remoteHtml.includes(`"buildId":"${localRelease.buildId}"`)
    ) {
      break;
    }
  }

  if (!dashboardResponse?.ok) {
    throw new Error(
      `Production dashboard returned ${dashboardResponse?.status || "no response"}.`
    );
  }
  if (!remoteHtml.includes(`"buildId":"${localRelease.buildId}"`)) {
    throw new Error(
      `Production dashboard does not expose the deployed buildId ${localRelease.buildId}.`
    );
  }

  const dashboardCacheControl =
    dashboardResponse.headers.get("cache-control") || "";
  if (!/no-cache|no-store/i.test(dashboardCacheControl)) {
    throw new Error(
      `Dashboard HTML is missing no-cache/no-store: ${dashboardCacheControl}`
    );
  }

  const failures = [];
  const staticFiles = localRelease.staticFiles;
  const concurrency = 8;
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < staticFiles.length) {
      const filePath = staticFiles[cursor];
      cursor += 1;
      const relativePath = path
        .relative(localRelease.outputRoot, filePath)
        .split(path.sep)
        .join("/");
      const response = await fetchWithNoCache(
        `${normalizedOrigin}/${encodeURI(relativePath)}`,
        { method: "HEAD" }
      );
      const cacheControl = response.headers.get("cache-control") || "";
      if (!response.ok || !/immutable/i.test(cacheControl)) {
        failures.push({
          relativePath,
          status: response.status,
          cacheControl,
        });
      }
    }
  });
  await Promise.all(workers);

  if (failures.length > 0) {
    throw new Error(
      `Production static verification failed: ${JSON.stringify(
        failures.slice(0, 8)
      )}`
    );
  }

  return {
    buildId: localRelease.buildId,
    checkedStaticFiles: staticFiles.length,
  };
}

async function runCli() {
  const originIndex = process.argv.indexOf("--origin");
  const origin = originIndex >= 0 ? process.argv[originIndex + 1] : "";
  const localRelease = readLocalRelease();
  console.log(
    `[next-release-check] local buildId=${localRelease.buildId} htmlAssets=${localRelease.htmlAssetCount} manifests=${localRelease.buildManifestCount} manifestAssets=${localRelease.buildManifestAssetCount} staticFiles=${localRelease.staticFiles.length}`
  );

  if (origin) {
    const result = await verifyRemoteRelease(origin, localRelease);
    console.log(
      `[next-release-check] remote buildId=${result.buildId} staticFiles=${result.checkedStaticFiles}`
    );
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  readLocalRelease,
  verifyRemoteRelease,
};
