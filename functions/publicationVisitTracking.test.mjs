import test from "node:test";
import assert from "node:assert/strict";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const {
  PUBLIC_VISITOR_COOKIE_NAME,
  PUBLIC_VISIT_MEASUREMENT_SCHEMA_VERSION,
  PUBLIC_VISIT_RUNTIME_MARKER,
  buildPublicVisitorCookieHeader,
  buildPublicVisitEventId,
  createPublicVisitToken,
  hashPublicVisitorForSlug,
  injectPublicVisitRuntime,
  readPublicationVisitCounts,
  recordPublicVisitAtomically,
  resolvePublicVisitorIdentity,
  verifyPublicVisitToken,
} = requireBuiltModule("lib/payments/publicationVisitTracking.js");

const SECRET = "visit-secret-with-at-least-thirty-two-characters";
const VISITOR_ONE = "visitor_token_1234567890";
const VISITOR_TWO = "visitor_token_abcdefghij";

test("public visitor identity uses the Firebase Hosting forwarded cookie and reuses it", () => {
  const reused = resolvePublicVisitorIdentity({
    cookieHeader: `other=one; __session=${VISITOR_ONE}; final=two`,
  });
  const created = resolvePublicVisitorIdentity({
    cookieHeader: "red_public_visitor_v1=invalid",
    generateVisitorId: () => VISITOR_TWO,
  });

  assert.equal(PUBLIC_VISITOR_COOKIE_NAME, "__session");
  assert.deepEqual(reused, { visitorId: VISITOR_ONE, isNew: false });
  assert.deepEqual(created, { visitorId: VISITOR_TWO, isNew: true });
  const cookieHeader = buildPublicVisitorCookieHeader({
    visitorId: VISITOR_ONE,
    secure: true,
  });
  assert.equal(
    cookieHeader,
    `__session=${VISITOR_ONE}; Path=/i; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure`
  );
  assert.deepEqual(
    resolvePublicVisitorIdentity({ cookieHeader: cookieHeader.split(";")[0] }),
    { visitorId: VISITOR_ONE, isNew: false }
  );
});

test("visitor hashes are stable within one publication and isolated between slugs", () => {
  const first = hashPublicVisitorForSlug("boda-ana", VISITOR_ONE);
  assert.equal(first, hashPublicVisitorForSlug("boda-ana", VISITOR_ONE));
  assert.notEqual(first, hashPublicVisitorForSlug("boda-luz", VISITOR_ONE));
  assert.notEqual(first, hashPublicVisitorForSlug("boda-ana", VISITOR_TWO));
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("signed visit tokens bind slug and visitor and reject tampering or expiration", () => {
  const nowMs = Date.parse("2026-08-17T12:00:00.000Z");
  const visitorHash = hashPublicVisitorForSlug("boda-ana", VISITOR_ONE);
  const token = createPublicVisitToken({
    slug: "boda-ana",
    visitorHash,
    secret: SECRET,
    nowMs,
    nonce: "page_load_12345678901",
  });

  const verified = verifyPublicVisitToken({
    token,
    slug: "boda-ana",
    visitorHash,
    secret: SECRET,
    nowMs: nowMs + 1000,
  });
  assert.equal(verified?.nonce, "page_load_12345678901");
  assert.equal(
    verifyPublicVisitToken({
      token: `${token}x`,
      slug: "boda-ana",
      visitorHash,
      secret: SECRET,
      nowMs,
    }),
    null
  );
  assert.equal(
    verifyPublicVisitToken({
      token,
      slug: "otra-boda",
      visitorHash,
      secret: SECRET,
      nowMs,
    }),
    null
  );
  assert.equal(
    verifyPublicVisitToken({
      token,
      slug: "boda-ana",
      visitorHash,
      secret: SECRET,
      nowMs: nowMs + 11 * 60 * 1000,
    }),
    null
  );
});

test("public delivery runtime injects once before body and waits for visible DOM", () => {
  const html = "<!doctype html><html><body><main>Invitacion</main></body></html>";
  const injected = injectPublicVisitRuntime(html, "signed-token");
  const injectedTwice = injectPublicVisitRuntime(injected, "another-token");

  assert.match(injected, new RegExp(PUBLIC_VISIT_RUNTIME_MARKER));
  assert.match(injected, /document\.visibilityState === "visible"/);
  assert.match(injected, /credentials: "same-origin"/);
  assert.ok(injected.indexOf(PUBLIC_VISIT_RUNTIME_MARKER) < injected.indexOf("</body>"));
  assert.equal(injectedTwice, injected);
});

function createReference(path, state) {
  return {
    path,
    collection(name) {
      const countMatching = (predicate = () => true) => ({
        async get() {
          const prefix = `${path}/${name}/`;
          const count = Array.from(state.entries()).filter(
            ([key, data]) => key.startsWith(prefix) && predicate(data)
          ).length;
          return { data: () => ({ count }) };
        },
      });
      return {
        doc(id) {
          return createReference(`${path}/${name}/${id}`, state);
        },
        count() {
          return countMatching();
        },
        where(fieldPath, operator, expectedValue) {
          assert.equal(operator, "==");
          return {
            count() {
              return countMatching((data) => data?.[fieldPath] === expectedValue);
            },
          };
        },
      };
    },
  };
}

function createTransactionHarness(publicationData) {
  const state = new Map([["publicadas/boda-ana", publicationData]]);
  const publicationRef = createReference("publicadas/boda-ana", state);

  return {
    state,
    publicationRef,
    async runTransaction(callback) {
      const pending = [];
      const result = await callback({
        async get(ref) {
          const value = state.get(ref.path);
          return {
            exists: typeof value !== "undefined",
            data: () => value,
          };
        },
        create(ref, data) {
          pending.push([ref.path, data]);
        },
      });
      pending.forEach(([path, data]) => state.set(path, data));
      return result;
    },
  };
}

test("first load, reload, and another browser produce 3 total and 2 unique visits", async () => {
  const harness = createTransactionHarness({
    estado: "publicada_activa",
    publicadaAt: "2026-08-01T00:00:00.000Z",
    venceAt: "2027-08-01T00:00:00.000Z",
  });
  const visitorHash = hashPublicVisitorForSlug("boda-ana", VISITOR_ONE);
  const firstEventId = buildPublicVisitEventId("boda-ana", "page_load_12345678901");
  const secondEventId = buildPublicVisitEventId("boda-ana", "page_load_abcdefghijk");
  const thirdEventId = buildPublicVisitEventId("boda-ana", "page_load_otherbrowse1");
  const common = {
    runTransaction: harness.runTransaction,
    publicationRef: harness.publicationRef,
    visitorHash,
    createdAtValue: "server-time",
  };

  harness.state.set("publicadas/boda-ana/visits/legacy-event", {
    schemaVersion: 1,
  });
  harness.state.set("publicadas/boda-ana/uniqueVisitors/legacy-visitor", {
    schemaVersion: 1,
  });

  assert.equal(
    await recordPublicVisitAtomically({ ...common, eventId: firstEventId }),
    "created"
  );
  assert.equal(
    await recordPublicVisitAtomically({ ...common, eventId: firstEventId }),
    "duplicate"
  );
  assert.equal(
    await recordPublicVisitAtomically({ ...common, eventId: secondEventId }),
    "created"
  );
  assert.equal(
    await recordPublicVisitAtomically({
      ...common,
      eventId: thirdEventId,
      visitorHash: hashPublicVisitorForSlug("boda-ana", VISITOR_TWO),
    }),
    "created"
  );

  assert.deepEqual(await readPublicationVisitCounts(harness.publicationRef), {
    totalVisits: 3,
    uniqueVisits: 2,
  });
  assert.equal(PUBLIC_VISIT_MEASUREMENT_SCHEMA_VERSION, 2);
});

test("visit transaction refuses inaccessible publications without writing children", async () => {
  const harness = createTransactionHarness({ estado: "publicada_pausada" });
  const result = await recordPublicVisitAtomically({
    runTransaction: harness.runTransaction,
    publicationRef: harness.publicationRef,
    eventId: "event-id",
    visitorHash: hashPublicVisitorForSlug("boda-ana", VISITOR_ONE),
    createdAtValue: "server-time",
  });

  assert.equal(result, "unavailable");
  assert.equal(harness.state.size, 1);
});
