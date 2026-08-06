import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  bootstrapNextStaticHistory,
  extractWebpackRuntimeStaticPaths,
} = require("./bootstrapNextStaticHistory.cjs");

function createResponse(body, status = 200) {
  const bytes = Buffer.from(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return bytes.toString("utf8");
    },
    async arrayBuffer() {
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      );
    },
  };
}

test("first CI release bootstraps the live build and its lazy chunks", async () => {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "reservaeldia-static-bootstrap-")
  );
  const origin = "https://example.test";
  const dashboardHtml = [
    '<script src="/_next/static/chunks/webpack-live.js"></script>',
    '<script src="/_next/static/live-build/_buildManifest.js"></script>',
    '<script src="/_next/static/live-build/_ssgManifest.js"></script>',
    '<script id="__NEXT_DATA__" type="application/json">',
    '{"buildId":"live-build"}',
    "</script>",
  ].join("");
  const responses = new Map([
    [
      `${origin}/dashboard/?static-history-bootstrap=1`,
      createResponse(dashboardHtml),
    ],
    [
      `${origin}/_next/static/live-build/_buildManifest.js`,
      createResponse(
        'self.__BUILD_MANIFEST={"/dashboard":["static/chunks/pages/dashboard-live.js"]};'
      ),
    ],
    [
      `${origin}/_next/static/live-build/_ssgManifest.js`,
      createResponse("self.__SSG_MANIFEST=new Set"),
    ],
    [
      `${origin}/_next/static/chunks/webpack-live.js`,
      createResponse(
        'r.u=e=>169===e?"static/chunks/169-live.js":"static/chunks/"+e+"."+({264:"abc123"})[e]+".js",r.miniCssF=e=>{}'
      ),
    ],
    [
      `${origin}/_next/static/chunks/pages/dashboard-live.js`,
      createResponse("dashboard page"),
    ],
    [
      `${origin}/_next/static/chunks/264.abc123.js`,
      createResponse("lazy preview generator"),
    ],
  ]);

  try {
    fs.mkdirSync(path.join(rootDir, ".firebase"), { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, ".firebase", "hosting.b3V0.cache"),
      [
        "_next/static/obsolete/_buildManifest.js,1,hash",
      ].join("\n")
    );

    const calls = [];
    const result = await bootstrapNextStaticHistory({
      rootDir,
      origin,
      fetchImpl: async (url) => {
        calls.push(url);
        return responses.get(url) || createResponse("not found", 404);
      },
    });

    assert.equal(result.bootstrapped, true);
    assert.equal(result.releaseIds[0], "live-build");
    assert.equal(
      fs.readFileSync(
        path.join(
          rootDir,
          ".hosting-static-history",
          "releases",
          "live-build",
          "chunks",
          "264.abc123.js"
        ),
        "utf8"
      ),
      "lazy preview generator"
    );
    assert.ok(
      calls.includes(
        `${origin}/_next/static/chunks/pages/dashboard-live.js`
      )
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("webpack runtime inventory resolves normal, aliased, and literal lazy chunks", () => {
  const paths = extractWebpackRuntimeStaticPaths(
    'r.u=e=>169===e?"static/chunks/169-live.js":"static/chunks/"+(683===e?"named":e)+"."+({264:"abc123",683:"def456"})[e]+".js",r.miniCssF=e=>{}'
  );

  assert.deepEqual(Array.from(paths).sort(), [
    "/_next/static/chunks/169-live.js",
    "/_next/static/chunks/264.abc123.js",
    "/_next/static/chunks/named.def456.js",
  ]);
});
