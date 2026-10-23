import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { gzipSync, brotliCompressSync, deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const {
  fetchGiftLinkHtml, isPublicGiftMetadataAddress, parsePublicGiftMetadataUrl, GIFT_METADATA_FETCH_LIMITS,
} = requireBuiltModule("lib/gifts/linkMetadataFetch.js");
const { extractGiftLinkMetadata, resolveGiftLinkMetadata } = requireBuiltModule("lib/gifts/linkMetadata.js");
const { createGiftMetadataUsageStore } = requireBuiltModule("lib/gifts/linkMetadataUsage.js");
const { getGiftLinkMetadataWithDependencies } = requireBuiltModule("lib/gifts/linkMetadataHandler.js");

const PRODUCT_URL = "https://shop.example.com/product/coffee";
const PUBLIC_ADDRESS = { address: "93.184.216.34", family: 4 };
const PUBLIC_LOOKUP = async () => [PUBLIC_ADDRESS];

function transportFixture(pages) {
  const calls = [];
  const responses = [];
  const request = (url, options, callback) => {
    const call = { url, options, destroyed: false };
    calls.push(call);
    const outgoing = new EventEmitter();
    outgoing.destroy = () => { call.destroyed = true; };
    outgoing.end = () => queueMicrotask(() => {
      const page = pages[calls.indexOf(call)];
      if (!page) { outgoing.emit("error", new Error("Synthetic transport failure")); return; }
      const incoming = new PassThrough();
      incoming.statusCode = page.status ?? 200;
      incoming.headers = { "content-type": "text/html; charset=utf-8", ...page.headers };
      responses.push(incoming);
      callback(incoming);
      if (page.hang) incoming.write(page.body || "<html>");
      else incoming.end(page.body || "");
    });
    return outgoing;
  };
  return { request, calls, responses };
}

test("URL policy rejects private, special, disguised IPs, credentials and unusual ports", () => {
  const unsafe = [
    "http://127.0.0.1", "http://2130706433", "http://0x7f000001", "http://0177.0.0.1",
    "http://10.1.1.1", "http://100.64.0.1", "http://169.254.169.254", "http://172.31.0.1",
    "http://192.168.0.1", "http://192.0.0.9", "http://192.0.2.1", "http://192.88.99.1",
    "http://198.19.0.1", "http://198.51.100.1", "http://203.0.113.1", "http://224.0.0.1", "http://255.255.255.255",
    "http://[::1]", "http://[::]", "http://[::ffff:127.0.0.1]", "http://[::ffff:7f00:1]",
    "http://[64:ff9b::a00:1]", "http://[2002:7f00:1::]", "http://[2001::1]", "http://[2001:db8::1]",
    "http://[3fff::1]", "http://[fe80::1]", "http://[fc00::1]", "http://[ff02::1]",
    "https://user:pass@shop.example.com", "https://shop.example.com:8080", "https://shop.example.com:80",
    "http://shop.example.com:443", "http://localhost.", "http://service.localhost", "http://service.local",
    "http://metadata.google.internal", "http://instance", "file:///private", "ftp://shop.example.com/x",
    "https://shop.example.com/\u0000secret", `https://shop.example.com/${"x".repeat(2048)}`,
  ];
  for (const url of unsafe) assert.throws(() => parsePublicGiftMetadataUrl(url), undefined, url);
  assert.equal(parsePublicGiftMetadataUrl(`${PRODUCT_URL}#details`).href, PRODUCT_URL);
  assert.equal(parsePublicGiftMetadataUrl("https://shop.example.com:443/x").port, "");
  for (const address of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "2001:4860:4860::8888"]) {
    assert.equal(isPublicGiftMetadataAddress(address), true, address);
  }
  for (const address of ["1.2.3.999", "::ffff:8.8.8.8", "fe80::1%eth0", "192.31.196.1", "2620:4f:8000::1"]) {
    assert.equal(isPublicGiftMetadataAddress(address), false, address);
  }
});

test("DNS answers are all validated and the socket lookup uses only the approved address", async () => {
  const fixture = transportFixture([{ body: "<title>Cafetera</title>" }]);
  let lookups = 0;
  const result = await fetchGiftLinkHtml(PRODUCT_URL, {
    lookup: async () => { lookups++; return [PUBLIC_ADDRESS]; }, request: fixture.request,
  });
  assert.equal(result.html, "<title>Cafetera</title>");
  assert.equal(lookups, 1);
  const { url, options } = fixture.calls[0];
  assert.equal(url.hostname, "shop.example.com", "original host preserved for Host/SNI/certificate validation");
  assert.equal(options.agent, false);
  assert.equal(options.headers.Cookie, undefined);
  assert.equal(options.headers.Authorization, undefined);
  assert.equal(options.rejectUnauthorized, undefined, "TLS certificate verification is not disabled");
  options.lookup(url.hostname, {}, (error, address, family) => {
    assert.equal(error, null); assert.equal(address, PUBLIC_ADDRESS.address); assert.equal(family, 4);
  });
  options.lookup(url.hostname, { all: true }, (error, addresses) => {
    assert.equal(error, null); assert.deepEqual(addresses, [PUBLIC_ADDRESS]);
  });
  assert.equal(lookups, 1, "socket lookup cannot perform a second DNS resolution/rebinding");
  assert.equal(fixture.calls[0].destroyed, true);

  for (const answers of [[], [PUBLIC_ADDRESS, { address: "10.0.0.1", family: 4 }], [{ address: "8.8.8.8", family: 6 }]]) {
    const blocked = transportFixture([{ body: "must never be read" }]);
    await assert.rejects(fetchGiftLinkHtml(PRODUCT_URL, { lookup: async () => answers, request: blocked.request }));
    assert.equal(blocked.calls.length, 0);
  }
});

test("each redirect is validated, independently resolved and bounded to three redirects", async () => {
  const fixture = transportFixture([
    { status: 302, headers: { location: "https://other.example.com/item" } },
    { status: 301, headers: { location: "/item/final" } },
    { body: "<title>Producto final</title>" },
  ]);
  const hosts = [];
  const result = await fetchGiftLinkHtml(PRODUCT_URL, {
    lookup: async (host) => { hosts.push(host); return [PUBLIC_ADDRESS]; }, request: fixture.request,
  });
  assert.deepEqual(hosts, ["shop.example.com", "other.example.com", "other.example.com"]);
  assert.equal(result.finalUrl, "https://other.example.com/item/final");
  assert.equal(fixture.calls.every((call) => call.destroyed), true);
  for (const location of ["http://169.254.169.254/latest/meta-data", "http://metadata.google.internal/", "file:///etc/passwd", "http://[::ffff:a00:1]/"]) {
    const blocked = transportFixture([{ status: 302, headers: { location } }]);
    await assert.rejects(fetchGiftLinkHtml(PRODUCT_URL, { lookup: PUBLIC_LOOKUP, request: blocked.request }));
    assert.equal(blocked.calls.length, 1);
  }
  const rebound = transportFixture([{ status: 302, headers: { location: PRODUCT_URL } }]);
  let lookupCount = 0;
  await assert.rejects(fetchGiftLinkHtml(PRODUCT_URL, {
    lookup: async () => ++lookupCount === 1 ? [PUBLIC_ADDRESS] : [{ address: "10.0.0.1", family: 4 }], request: rebound.request,
  }));
  assert.equal(rebound.calls.length, 1);
  const loop = transportFixture(Array.from({ length: 5 }, () => ({ status: 302, headers: { location: PRODUCT_URL } })));
  await assert.rejects(fetchGiftLinkHtml(PRODUCT_URL, { lookup: PUBLIC_LOOKUP, request: loop.request }));
  assert.equal(loop.calls.length, 4);
});

test("content type, HTTP errors, response size and compressed/decompressed bytes are bounded", async () => {
  const html = "<title>Cafetera con café</title>";
  for (const [encoding, compress] of [["gzip", gzipSync], ["br", brotliCompressSync], ["deflate", deflateSync]]) {
    const fixture = transportFixture([{ headers: { "content-encoding": encoding }, body: compress(html) }]);
    const result = await fetchGiftLinkHtml(PRODUCT_URL, { lookup: PUBLIC_LOOKUP, request: fixture.request });
    assert.equal(result.html, html);
  }
  const tooLarge = "x".repeat(GIFT_METADATA_FETCH_LIMITS.maxBytes + 1);
  for (const page of [
    { status: 403 }, { headers: { "content-type": "application/json" } },
    { headers: { "content-length": String(tooLarge.length) } }, { body: tooLarge },
    { headers: { "content-encoding": "gzip" }, body: gzipSync(tooLarge) },
    { headers: { "content-encoding": "compress" }, body: "invalid" },
    { headers: { "content-encoding": "gzip" }, body: "not gzip" },
  ]) {
    const fixture = transportFixture([page]);
    await assert.rejects(fetchGiftLinkHtml(PRODUCT_URL, { lookup: PUBLIC_LOOKUP, request: fixture.request }));
    assert.equal(fixture.calls[0].destroyed, true);
    assert.equal(fixture.responses[0].destroyed, true);
  }
});

test("the total timeout covers DNS, redirects and a stalled body and releases streams", async () => {
  const unused = transportFixture([]);
  await assert.rejects(fetchGiftLinkHtml(PRODUCT_URL, {
    lookup: () => new Promise(() => {}), request: unused.request, timeoutMs: 15,
  }));
  assert.equal(unused.calls.length, 0);
  const stalled = transportFixture([{ hang: true }]);
  await assert.rejects(fetchGiftLinkHtml(PRODUCT_URL, { lookup: PUBLIC_LOOKUP, request: stalled.request, timeoutMs: 15 }));
  assert.equal(stalled.calls[0].destroyed, true);
  assert.equal(stalled.responses[0].destroyed, true);
  const redirect = transportFixture([{ status: 302, headers: { location: "/second" } }, { body: "late" }]);
  await assert.rejects(fetchGiftLinkHtml(PRODUCT_URL, {
    lookup: () => new Promise((resolve) => setTimeout(() => resolve([PUBLIC_ADDRESS]), 15)),
    request: redirect.request, timeoutMs: 25,
  }));
  assert.equal(redirect.calls.length, 1, "redirect does not reset the deadline");
});

test("OG and Twitter extract editable title/image, resolve images against the final URL and respect the canonical limit", async () => {
  const result = await extractGiftLinkMetadata(`<!doctype html><html><head>
    <base href="https://attacker.example.com/">
    <meta property="og:title" content="  Cafetera &amp; café   para dos  ">
    <meta property="og:image" content="../images/coffee.jpg">
    <meta name="twitter:title" content="Otro título"><title>La tienda</title>
    </head><body><script>document.querySelector('meta[property="og:title"]').setAttribute('content', 'Script must never run');</script><img src="http://127.0.0.1/secret"></body></html>`, PRODUCT_URL);
  assert.deepEqual(result, { title: "Cafetera & café para dos", imageUrl: "https://shop.example.com/images/coffee.jpg", status: "found" });
  const twitter = await extractGiftLinkMetadata(`<meta name="twitter:title" content="${"Título ".repeat(50)}"><meta name="twitter:image" content="//images.example.com/item.jpg">`, PRODUCT_URL);
  assert.equal(twitter.title.length, 120);
  assert.equal(twitter.imageUrl, "https://images.example.com/item.jpg");
  const secure = await extractGiftLinkMetadata('<meta property="og:image" content="http://images.example.com/item.jpg"><meta property="og:image:secure_url" content="https://images.example.com/item.jpg">', PRODUCT_URL);
  assert.deepEqual(secure, { title: "", imageUrl: "https://images.example.com/item.jpg", status: "found" });
});

test("JSON-LD Product supports graph/arrays/ImageObject and stays bounded with malformed or deep input", async () => {
  const product = await extractGiftLinkMetadata(`<script type="application/ld+json">${JSON.stringify({
    "@graph": [{ "@type": "Organization", name: "No usar", image: "https://images.example.com/logo.png" }, {
      "@type": ["Thing", "Product"], name: "Juego de tazas", image: [{ "@type": "ImageObject", contentUrl: "/cups.jpg" }],
    }],
  })}</script>`, PRODUCT_URL);
  assert.deepEqual(product, { title: "Juego de tazas", imageUrl: "https://shop.example.com/cups.jpg", status: "found" });
  let deep = { "@type": "Product", name: "Must not be traversed" };
  for (let index = 0; index < 20; index++) deep = { child: deep };
  const bounded = await extractGiftLinkMetadata(`<script type="application/ld+json">{invalid}</script><script type="application/ld+json">${JSON.stringify(deep)}</script><title>Fallback</title>`, PRODUCT_URL);
  assert.equal(bounded.title, "Fallback");
  const excessive = await extractGiftLinkMetadata(`<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "x".repeat(70_000) })}</script>`, PRODUCT_URL);
  assert.equal(excessive.status, "empty");
});

test("empty pages, prohibited image URLs and Mercado Libre/Cloudflare challenges preserve manual fallback", async () => {
  for (const image of ["http://images.example.com/x.jpg", "javascript:alert(1)", "data:image/png;base64,xxx", "https://127.0.0.1/x", "https://images.local/x", "https://images.example.com:8443/x"]) {
    assert.deepEqual(await extractGiftLinkMetadata(`<meta property="og:image" content="${image}">`, PRODUCT_URL), { title: "", imageUrl: "", status: "empty" });
  }
  assert.equal((await extractGiftLinkMetadata("<html><body>No metadata</body></html>", PRODUCT_URL)).status, "empty");
  // Synthetic fixture reproducing the two markers observed in the public ML
  // verification response; no bypass, live requests or copied product data.
  const challenge = '<title>Mercado Libre</title><script src="https://http2.mlstatic.com/frontend-assets/suspicious-traffic-frontend/main.js"></script><div id="gz-account-verification-index"></div>';
  assert.deepEqual(await extractGiftLinkMetadata(challenge, PRODUCT_URL), { title: "", imageUrl: "", status: "unavailable" });
  assert.equal((await extractGiftLinkMetadata("<title>Just a moment...</title>", PRODUCT_URL)).status, "unavailable");
  assert.equal((await extractGiftLinkMetadata("<div>".repeat(10_001), PRODUCT_URL)).status, "unavailable");
  assert.equal((await extractGiftLinkMetadata("x".repeat(GIFT_METADATA_FETCH_LIMITS.maxBytes + 1), PRODUCT_URL)).status, "unavailable");
  assert.deepEqual(await resolveGiftLinkMetadata(PRODUCT_URL, async () => { throw new Error("private upstream diagnostics"); }), { title: "", imageUrl: "", status: "unavailable" });
});

function fakeUsageDb() {
  const records = new Map();
  let queue = Promise.resolve();
  const db = {
    doc: (path) => ({ path }),
    runTransaction(callback) {
      const work = queue.then(() => callback({
        get: async (ref) => ({ exists: records.has(ref.path), data: () => records.get(ref.path) }),
        set: (ref, data) => records.set(ref.path, data),
      }));
      queue = work.catch(() => {});
      return work;
    },
  };
  return { records, db };
}

test("durable per-user quota is transactional, rolls windows and stores only hashed identity plus counters", async () => {
  const { db, records } = fakeUsageDb();
  let now = 86_400_000;
  const store = createGiftMetadataUsageStore(db, () => now);
  const results = await Promise.allSettled(Array.from({ length: 31 }, () => store.consume("synthetic-user")));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 30);
  assert.equal(results[30].reason.code, "resource-exhausted");
  const key = `giftLinkMetadataUsage/${createHash("sha256").update("synthetic-user").digest("hex")}`;
  assert.deepEqual(records.get(key), { schemaVersion: 1, minute: 1440, minuteCount: 30, day: 1, dayCount: 30, updatedAtMs: now });
  for (let batch = 0; batch < 6; batch++) {
    now += 60_000;
    const count = batch === 5 ? 20 : 30;
    for (let index = 0; index < count; index++) await store.consume("synthetic-user");
  }
  assert.equal(records.get(key).dayCount, 200);
  now += 60_000;
  await assert.rejects(store.consume("synthetic-user"), { code: "resource-exhausted" });
  await store.consume("second-user");
  now += 86_400_000;
  await store.consume("synthetic-user");
  assert.equal(records.get(key).dayCount, 1);
  assert.equal(records.get(key).minuteCount, 1);
  assert.equal(records.size, 2, "one document per UID, no per-link records");
});

test("quota failures and corrupt current records fail closed without leaking diagnostics", async () => {
  const failed = createGiftMetadataUsageStore({ doc: (path) => ({ path }), runTransaction: async () => { throw new Error("private firestore details"); } });
  await assert.rejects(failed.consume("synthetic-user"), (error) => error.code === "unavailable" && !error.message.includes("private"));
  const { db, records } = fakeUsageDb();
  records.set(`giftLinkMetadataUsage/${createHash("sha256").update("synthetic-user").digest("hex")}`, { schemaVersion: 1, minute: 0, day: 0, minuteCount: -1, dayCount: 0 });
  await assert.rejects(createGiftMetadataUsageStore(db, () => 1).consume("synthetic-user"), { code: "unavailable" });
});

test("authentication, App Check, URL validation and quota all run before any outbound request", async () => {
  const calls = [];
  const dependencies = {
    consume: async (uid) => calls.push(["quota", uid]),
    assertExternalAllowed: () => calls.push(["external"]),
    resolve: async (url) => { calls.push(["resolve", url]); return { title: "Tazas", imageUrl: "", status: "found" }; },
  };
  const valid = { auth: { uid: "synthetic-user" }, app: { appId: "synthetic-app" }, data: { url: PRODUCT_URL } };
  await assert.rejects(getGiftLinkMetadataWithDependencies({ ...valid, auth: undefined }, dependencies), { code: "unauthenticated" });
  await assert.rejects(getGiftLinkMetadataWithDependencies({ ...valid, app: undefined }, dependencies), { code: "failed-precondition" });
  for (const data of [null, [], {}, { url: "http://127.0.0.1" }, { url: PRODUCT_URL, headers: { Cookie: "private" } }]) {
    await assert.rejects(getGiftLinkMetadataWithDependencies({ ...valid, data }, dependencies), { code: "invalid-argument" });
  }
  assert.deepEqual(calls, []);
  await assert.rejects(getGiftLinkMetadataWithDependencies(valid, { ...dependencies, consume: async () => { throw new Error("quota denied"); } }));
  assert.deepEqual(calls, []);
  const result = await getGiftLinkMetadataWithDependencies(valid, dependencies);
  assert.deepEqual(result, { title: "Tazas", imageUrl: "", status: "found" });
  assert.deepEqual(calls, [["quota", "synthetic-user"], ["external"], ["resolve", PRODUCT_URL]]);
  await assert.rejects(getGiftLinkMetadataWithDependencies(valid, { ...dependencies, assertExternalAllowed: () => { throw new Error("local isolation blocks external services"); } }));
  assert.equal(calls.filter(([step]) => step === "resolve").length, 1);
});
