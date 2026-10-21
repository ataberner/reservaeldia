import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

function readRootFile(relativePath) {
  return readFileSync(join(ROOT_DIR, relativePath), "utf8");
}

test("robots.txt blocks only the design previews and their own assets", () => {
  const robots = readRootFile("public/robots.txt");

  assert.match(robots, /^User-agent: \*/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/reservaeldia\.com\.ar\/sitemap\.xml$/m);
  const disallowedPaths = [...robots.matchAll(/^Disallow:[ \t]*(\S+)[ \t]*$/gm)]
    .map((match) => match[1]);
  assert.deepEqual(disallowedPaths, [
    "/profesionales",
    "/assets/profesionales/",
    "/lugares",
    "/assets/lugares/",
  ]);
  assert.doesNotMatch(robots, /^Disallow:[ \t]*\/i(?:\/|[ \t]*$)/m);
});

test("static sitemap lists only indexable public pages", () => {
  const sitemap = readRootFile("public/sitemap.xml");

  assert.match(sitemap, /<loc>https:\/\/reservaeldia\.com\.ar\/<\/loc>/);
  assert.match(
    sitemap,
    /<loc>https:\/\/reservaeldia\.com\.ar\/preguntas-frecuentes\/<\/loc>/
  );
  assert.doesNotMatch(sitemap, /\/i\//);
  assert.doesNotMatch(
    sitemap,
    /\/dashboard|\/admin|\/boda|para-diseño|\/profesionales|\/lugares/
  );
});

test("firebase hosting marks private and legacy public surfaces as noindex", () => {
  const firebaseConfig = JSON.parse(readRootFile("firebase.json"));
  const headers = firebaseConfig.hosting.headers || [];

  function headerValueForSource(source, key) {
    const entry = headers.find((item) => item.source === source);
    const header = entry?.headers?.find((item) => item.key === key);
    return header?.value || "";
  }

  for (const source of [
    "/dashboard",
    "/dashboard/**",
    "/admin",
    "/admin/**",
    "/boda/**",
    "/para-diseño/**",
  ]) {
    assert.equal(headerValueForSource(source, "X-Robots-Tag"), "noindex, noarchive");
  }

  assert.equal(headerValueForSource("/404.html", "X-Robots-Tag"), "noindex");
  assert.equal(headerValueForSource("/assets/**/*.pdf", "X-Robots-Tag"), "noindex");

  for (const source of [
    "/profesionales",
    "/profesionales/**",
    "/assets/profesionales/**",
    "/lugares",
    "/lugares/**",
    "/assets/lugares/**",
  ]) {
    assert.equal(
      headerValueForSource(source, "X-Robots-Tag"),
      "noindex, nofollow, noarchive"
    );
  }
});
