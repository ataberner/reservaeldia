// Executable matrix. A = accepted obligation, C = current behavior, Q = proposal.
// IDs are stable; placeholders expand only to synthetic session identifiers.
export const authorities = {
  A1: "docs/architecture/ARCHITECTURE_GUIDELINES.md#43-security-first (ownership)",
  A2: "docs/contracts/CHECKOUT_PUBLICATION_LIFECYCLE_CONTRACT.md (backend publication / visit authority)",
  A3: "docs/architecture/PROVIDER_DATA_MODEL.md#7-security-and-public-projection-decision (non-admin writes forbidden)",
  A4: "docs/architecture/DATA_MODEL.md#countdownpresets (administrative draft; immutable published versions)",
  C1: "firestore.rules / storage.rules (observed, not policy acceptance)",
  C2: "functions/src/auth/adminAuth.ts (observed, not policy acceptance)",
  Q1: "docs/contracts/SECURITY_CONTRACT.md#q1-proposal (proposed; Q1 unresolved)",
};

export const identities = {
  anonymous: null,
  A: { sub: "{A}" }, B: { sub: "{B}" },
  admin: { sub: "{ADMIN}", admin: true },
  superclaim: { sub: "{ADMIN}", superadmin: true },
  role: { sub: "{ADMIN}", role: "admin" },
  stringAdmin: { sub: "{ADMIN}", admin: "true" },
  serverSuper: { sub: "{SUPER}" },
  canonicalAdmin: { sub: "{ADMIN}", red: { v: 1, rev: 1, role: "admin",
    capabilities: { catalogManage: true, templateEdit: true } } },
  canonicalSuper: { sub: "{ADMIN}", red: { v: 1, rev: 1, role: "superadmin", capabilities: {
    catalogManage: true, templateEdit: true, templatePublish: true, templateDelete: true,
    siteManage: true, pricingManage: true, analyticsReadExport: true, analyticsOperate: true,
    userSupport: true, designerAiUse: true, accessManage: true,
  } } },
};

export const cases = [];
function add(id, group, identity, store, resource, operation, expected, authority, extra = {}) {
  cases.push({ id, group, identity, store, resource, operation, expected, authority, ...extra });
}
const accept = (id, identity, resource, op, expected, extra = {}) =>
  add(id, "acceptance", identity, "firestore", resource, op, expected, "A1", extra);
const observed = (id, identity, store, resource, op, expected, extra = {}) =>
  add(id, "characterization", identity, store, resource, op, expected, "C1", extra);

// Per-case fixtures include BOTH owners for collection-query cases.
for (const [name, resource, queryResource] of [
  ["profile", "usuarios/{A}", "usuarios"],
  ["image", "usuarios/{A}/imagenes/{ID}", "usuarios/{A}/imagenes"],
  ["draft", "borradores/{ID}", "borradores"],
  ["publication", "publicadas/{ID}", "publicadas"],
  ["history", "publicadas_historial/{ID}", "publicadas_historial"],
]) {
  const base = { data: { userId: "{A}", marker: "synthetic-4b1" } };
  accept(`${name}-owner-get`, "A", resource, "get", "allow", base);
  accept(`${name}-cross-get`, "B", resource, "get", "deny", base);
  accept(`${name}-anonymous-get`, "anonymous", resource, "get", "deny", base);
  for (const op of ["create", "update", "delete"]) {
    accept(`${name}-cross-${op}`, "B", resource, op, "deny", base);
  }
  if (["draft", "publication", "history"].includes(name)) {
    const fixtures = [{ path: `${queryResource}/{ID}-a`, data: base.data },
      { path: `${queryResource}/{ID}-b`, data: { userId: "{B}", marker: "synthetic-4b1" } }];
    accept(`${name}-owner-list`, "A", queryResource, "list", "allow", { fixtures, filters: [["userId", "==", "{A}"]] });
    accept(`${name}-unfiltered-list`, "A", queryResource, "list", "deny", { fixtures });
    accept(`${name}-foreign-filter`, "A", queryResource, "list", "deny", { fixtures, filters: [["userId", "==", "{B}"]] });
  } else if (name === "image") {
    for (const identity of ["A", "B"]) accept(`image-${identity}-list`, identity, queryResource, "list", identity === "A" ? "allow" : "deny",
      { fixtures: [{ path: resource, data: base.data }] });
  } else accept("profile-unfiltered-list", "A", queryResource, "list", "deny", {
    fixtures: [{ path: "usuarios/{A}", data: base.data }, { path: "usuarios/{B}", data: { userId: "{B}" } }],
  });
}
for (const op of ["create", "update", "delete"]) {
  accept(`draft-owner-${op}`, "A", "borradores/{ID}", op, "allow");
  accept(`image-owner-${op}`, "A", "usuarios/{A}/imagenes/{ID}", op, "allow");
}
accept("draft-change-owner", "A", "borradores/{ID}", "update", "deny", { payload: { userId: "{B}" } });
accept("draft-remove-owner", "A", "borradores/{ID}", "removeOwner", "deny");
accept("draft-spoof-create", "A", "borradores/{ID}", "create", "deny", { payload: { userId: "{B}" } });
accept("publication-change-owner", "A", "publicadas/{ID}", "update", "deny", { payload: { userId: "{B}" } });
accept("history-change-owner", "A", "publicadas_historial/{ID}", "update", "deny", { payload: { userId: "{B}" } });
accept("profile-cross-owner-field", "B", "usuarios/{A}", "update", "deny", { payload: { userId: "{B}" } });

for (const sub of ["rsvps", "visits", "uniqueVisitors"]) {
  const resource = `publicadas/{ID}/${sub}/event`;
  const fixtures = [{ path: "publicadas/{ID}", data: { userId: "{A}" } }];
  accept(`${sub}-cross-get`, "B", resource, "get", "deny", { fixtures });
  accept(`${sub}-cross-update`, "B", resource, "update", "deny", { fixtures });
  if (sub === "rsvps") {
    accept("rsvps-owner-list", "A", "publicadas/{ID}/rsvps", "list", "allow", {
      fixtures: [...fixtures, { path: resource, data: { marker: "synthetic-4b1" } }],
    });
    accept("rsvps-cross-list", "B", "publicadas/{ID}/rsvps", "list", "deny", {
      fixtures: [...fixtures, { path: resource, data: { marker: "synthetic-4b1" } }],
    });
  } else for (const op of ["create", "update", "delete"]) {
    add(`${sub}-owner-${op}`, "acceptance", "A", "firestore", resource, op, "deny", "A2", { fixtures });
  }
}
for (const op of ["create", "update", "delete"]) {
  add(`publication-owner-${op}`, "acceptance", "A", "firestore", "publicadas/{ID}", op, "deny", "A2");
  add(`checkout-owner-${op}`, "acceptance", "A", "firestore", "publication_checkout_sessions/{ID}", op, "deny", "A2");
}
// The reference is recorded but is not itself authority for granting access to B.
observed("draft-foreign-publication-link", "A", "firestore", "borradores/{ID}", "update", "allow", {
  payload: { slugPublico: "{ID}-foreign" },
  fixtures: [{ path: "publicadas/{ID}-foreign", data: { userId: "{B}" } }],
});
observed("image-foreign-storage-reference", "A", "firestore", "usuarios/{A}/imagenes/{ID}", "create", "allow", {
  payload: { storagePath: "usuarios/{B}/imagenes/foreign.png" },
});
observed("draft-unmodeled-subcollection", "A", "firestore", "borradores/{ID}/private/child", "get", "deny");
observed("profile-self-role-field", "A", "firestore", "usuarios/{A}", "update", "allow", { payload: { admin: true } });
add("countdown-private-draft", "acceptance", "A", "firestore", "countdownPresets/{ID}", "get", "deny", "A4", {
  data: { activeVersion: 1, draft: { marker: "synthetic-administrative-draft" }, draftVersion: 2 },
});
for (const identity of ["A", "admin"]) for (const op of ["update", "delete"]) {
  add(`countdown-immutable-${identity}-${op}`, "acceptance", identity, "firestore", "countdownPresets/{ID}/versions/1", op, "deny", "A4");
}

const analytics = ["analyticsEvents", "analyticsUsers", "analyticsInvitations", "analyticsDaily", "analyticsWeekly",
  "analyticsMonthly", "analyticsTemplates", "analyticsCohorts", "analyticsJobs", "analyticsExports"];
for (const collection of [...analytics, "iconos_audit", "iconos_usage_snapshots", "decoraciones_audit"]) {
  observed(`${collection}-overlap-read`, "A", "firestore", `${collection}/{ID}`, "get", "allow");
  observed(`${collection}-overlap-write`, "A", "firestore", `${collection}/{ID}`, "create", "allow");
}
for (const resource of ["analyticsDaily/{ID}/users/{B}", "analyticsWeekly/{ID}/templates/template", "analyticsCohorts/{ID}/periods/0",
  "countdownPresets/{ID}/versions/1", "countdownPresets/{ID}/operations/operation", "clientIssues/{ID}",
  "text_presets/{ID}", "plantillas_secciones/{ID}", "invitaciones/{ID}", "unmodeled_4b1/{ID}"]) {
  const countdown = resource.startsWith("countdownPresets/");
  observed(`fallback-${resource.split('/')[0]}-${resource.split('/')[2] || 'root'}`, "A", "firestore", resource, "update", countdown ? "deny" : "allow",
    countdown ? { expectationChange: { phase: "4B2B", authority: "A4", before: "allow" } } : {});
}
for (const collection of ["iconos", "iconos_archived", "decoraciones", "decoraciones_archived"]) {
  observed(`${collection}-ordinary-read`, "A", "firestore", `${collection}/{ID}`, "get", "allow");
  for (const op of ["create", "update", "delete"]) observed(`${collection}-ordinary-${op}`, "A", "firestore", `${collection}/{ID}`, op, "allow");
}
for (const resource of ["site_settings/{ID}", "site_settings/{ID}/history/1", "app_config/{ID}", "plantillas_tags/{ID}",
  "public_slug_reservations/{ID}", "publication_discount_codes/{ID}", "publication_discount_code_usage/{ID}"]) {
  observed(`exclusive-${resource.split('/')[0]}-${resource.split('/')[2] || 'root'}`, "admin", "firestore", resource, "update", "deny");
}
observed("template-auth-published-get", "A", "firestore", "plantillas/{ID}", "get", "allow", { data: { estado: "active", estadoEditorial: "publicada" } });
observed("template-anonymous-get", "anonymous", "firestore", "plantillas/{ID}", "get", "deny", { data: { estado: "active", estadoEditorial: "publicada" } });
observed("template-legacy-missing-gates", "A", "firestore", "plantillas/{ID}", "get", "allow");
observed("template-unpublished-get", "A", "firestore", "plantillas/{ID}", "get", "deny", { data: { estadoEditorial: "borrador" } });
observed("template-admin-write", "admin", "firestore", "plantillas/{ID}", "update", "deny");
observed("catalog-public-get", "anonymous", "firestore", "plantillas_catalog/{ID}", "get", "allow", { data: { estado: "active", estadoEditorial: "publicada" } });
observed("catalog-public-filtered-list", "anonymous", "firestore", "plantillas_catalog", "list", "allow", {
  filters: [["estado", "==", "active"], ["estadoEditorial", "==", "publicada"]],
  fixtures: [{ path: "plantillas_catalog/{ID}", data: { estado: "active", estadoEditorial: "publicada" } },
    { path: "plantillas_catalog/{ID}-hidden", data: { estado: "active", estadoEditorial: "borrador" } }],
});
observed("catalog-unfiltered-list", "anonymous", "firestore", "plantillas_catalog", "list", "deny", {
  fixtures: [{ path: "plantillas_catalog/{ID}", data: { estado: "active", estadoEditorial: "publicada" } }],
});

// Preserve the provider boundary, without executing provider tooling/handlers.
for (const resource of ["proveedores/{ID}", "categorias_proveedores/{ID}"]) for (const identity of ["anonymous", "A"]) {
  for (const op of ["create", "update", "delete"]) add(`provider-${resource.split('/')[0]}-${identity}-${op}`, "acceptance", identity, "firestore", resource, op, "deny", "A3");
}
observed("provider-public-tuple", "anonymous", "firestore", "proveedores/{ID}", "get", "allow", { data: { estado: "publicado", activo: true, visible: true } });
observed("provider-hidden", "A", "firestore", "proveedores/{ID}", "get", "deny", { data: { estado: "publicado", activo: true, visible: false } });
observed("provider-inactive", "anonymous", "firestore", "proveedores/{ID}", "get", "deny", { data: { estado: "publicado", activo: false, visible: true } });
observed("provider-subcollection", "A", "firestore", "proveedores/{ID}/internal/1", "get", "deny");
observed("provider-admin-malformed", "admin", "firestore", "proveedores/{ID}", "create", "deny");
observed("provider-category-public", "anonymous", "firestore", "categorias_proveedores/{ID}", "get", "allow", { data: { activa: true } });

for (const resource of ["usuarios/{A}/imagenes/{ID}.png", "usuarios/{A}/thumbnails/{ID}.webp", "thumbnails_borradores/{A}/{ID}.webp"]) {
  const family = resource.includes("/thumbnails/") ? "user-thumbnail" : resource.split('/')[0];
  for (const identity of ["A", "B", "anonymous"]) for (const op of ["get", "create", "update", "delete"]) {
    add(`storage-${family}-${identity}-${op}`, "acceptance", identity, "storage", resource, op, identity === "A" ? "allow" : "deny", "A1");
  }
  for (const identity of ["A", "B"]) add(`storage-${family}-${identity}-list`, "acceptance", identity, "storage",
    resource.slice(0, resource.lastIndexOf('/')), "list", identity === "A" ? "allow" : "deny", "A1", { objectFixture: resource });
}
for (const file of ["index.html", "share.jpg"]) for (const identity of ["A", "B", "admin"]) for (const op of ["create", "update", "delete"]) {
  add(`published-${file}-${identity}-${op}`, "acceptance", identity, "storage", `publicadas/{ID}/${file}`, op, "deny", "A2", {
    fixtures: [{ path: "publicadas/{ID}", data: { userId: "{A}", estado: "publicada" } }],
  });
}
observed("published-anonymous-sdk-get", "anonymous", "storage", "publicadas/{ID}/index.html", "get", "deny");
for (const prefix of ["iconos", "iconos_archived", "decoraciones/originals", "decoraciones/thumbnails", "plantillas/{ID}/assets",
  "plantillas_secciones", "public", "previews/plantillas", "user_uploads/{A}", "borradores/{ID}",
  "assets/countdown/staging/{ID}", "assets/countdown/frames/{ID}/operations/op", "analytics-exports/raw/2026/09"]) {
  const id = prefix.replaceAll('/', '-').replaceAll('{', '').replaceAll('}', '');
  for (const op of ["get", "update", "delete"]) {
    const restricted = prefix.startsWith("assets/countdown/") && (op !== "get" || prefix.includes("/staging/"));
    observed(`storage-fallback-${id}-${op}`, "B", "storage", `${prefix}/{ID}.png`, op, restricted ? "deny" : "allow",
      restricted ? { expectationChange: { phase: "4B2B", authority: "A4", before: "allow" } } : {});
  }
}
for (const identity of ["anonymous", "A"]) for (const op of ["create", "update", "delete"]) {
  add(`provider-storage-${identity}-${op}`, "acceptance", identity, "storage", "proveedores/{ID}/portada/portada-original.png", op, "deny", "A3");
}
for (const [id, data, expected] of [
  ["public", { estado: "publicado", activo: true, visible: true }, "allow"],
  ["hidden", { estado: "publicado", activo: true, visible: false }, "deny"],
]) observed(`provider-storage-${id}`, "anonymous", "storage", "proveedores/{ID}/portada/portada-original.png", "get", expected,
  { fixtures: [{ path: "proveedores/{ID}", data }] });
observed("provider-storage-admin-valid", "admin", "storage", "proveedores/{ID}/galeria/fixture.png", "create", "allow");
observed("provider-storage-admin-mime", "admin", "storage", "proveedores/{ID}/galeria/fixture.png", "create", "deny", { contentType: "text/plain" });
observed("provider-storage-admin-size", "admin", "storage", "proveedores/{ID}/galeria/fixture.png", "create", "deny", { byteLength: 15 * 1024 * 1024 + 1 });
observed("provider-storage-admin-path", "admin", "storage", "proveedores/{ID}/other/fixture.png", "create", "deny");

// Provider delete is excluded from fallback: it discriminates real admin helpers.
for (const identity of ["admin", "superclaim", "role", "stringAdmin", "serverSuper", "A"]) {
  const ruleAllows = ["admin", "superclaim", "role"].includes(identity);
  observed(`q1-${identity}-firestore`, identity, "firestore", "proveedores/{ID}", "delete", ruleAllows ? "allow" : "deny");
  observed(`q1-${identity}-storage`, identity, "storage", "proveedores/{ID}/galeria/fixture.png", "delete", ruleAllows ? "allow" : "deny");
  add(`q1-${identity}-backend-admin`, "characterization", identity, "backend-helper", "requireAdmin", "authorize",
    ["admin", "serverSuper"].includes(identity) ? "allow" : "deny", "C2");
  add(`q1-${identity}-backend-super`, "characterization", identity, "backend-helper", "requireSuperAdmin", "authorize",
    identity === "serverSuper" ? "allow" : "deny", "C2");
}
for (const identity of ["canonicalAdmin", "canonicalSuper", "superclaim", "role"]) {
  const canonical = identity.startsWith("canonical");
  const proposedState = canonical ? { fixtures: [{ path: "authorizationState/{ADMIN}", data: { generation: 1 } }] } : {};
  for (const store of ["firestore", "storage"]) add(`proposal-${identity}-${store}`, "proposal", identity, store,
    store === "firestore" ? "proveedores/{ID}" : "proveedores/{ID}/galeria/fixture.png", "delete", canonical ? "allow" : "deny", "Q1", proposedState);
  add(`proposal-${identity}-backend`, "proposal", identity, "backend-helper", "requireAdmin", "authorize", canonical ? "allow" : "deny", "Q1", proposedState);
}

// 4B2A regressions: accepted ownership/backend limits, no Q1 policy adoption.
for (const [name, resource] of [
  ["profile", "usuarios/{A}"], ["image", "usuarios/{A}/imagenes/{ID}"],
  ["draft", "borradores/{ID}"], ["publication", "publicadas/{ID}"],
  ["history", "publicadas_historial/{ID}"],
]) {
  for (const op of ["create", "update", "delete"]) accept(`4b2a-${name}-anonymous-${op}`, "anonymous", resource, op, "deny");
  for (const identity of ["admin", "superclaim", "role"]) {
    accept(`4b2a-${name}-${identity}-foreign-get`, identity, resource, "get", "deny");
  }
}
for (const [name, resource] of [["draft", "borradores/{ID}"], ["history", "publicadas_historial/{ID}"]]) {
  for (const [variant, payload] of [["foreign", { userId: "{B}" }], ["absent", {}], ["null", { userId: null }], ["number", { userId: 123 }]]) {
    accept(`4b2a-${name}-create-${variant}-owner`, "A", resource, "create", "deny", { payload });
  }
  accept(`4b2a-${name}-replace-without-owner`, "A", resource, "replace", "deny", { payload: { marker: "synthetic" } });
}
accept("4b2a-history-remove-owner", "A", "publicadas_historial/{ID}", "removeOwner", "deny");
accept("4b2a-publication-remove-owner", "A", "publicadas/{ID}", "removeOwner", "deny");

const parent = [{ path: "publicadas/{ID}", data: { userId: "{A}" } }];
for (const sub of ["rsvps", "visits", "uniqueVisitors"]) {
  const resource = `publicadas/{ID}/${sub}/event`;
  for (const identity of ["B", "anonymous", "admin"]) for (const op of ["get", "list", "create", "update", "delete"]) {
    accept(`4b2a-${sub}-${identity}-${op}`, identity, op === "list" ? `publicadas/{ID}/${sub}` : resource, op, "deny", {
      fixtures: op === "list" ? [...parent, { path: resource, data: { userId: "{B}" } }] : parent,
      // A child's userId cannot override the publication's owner.
      data: { userId: "{B}" }, payload: { userId: "{B}", marker: "synthetic" },
    });
  }
  accept(`4b2a-${sub}-orphan-get`, "A", resource, "get", "deny");
  accept(`4b2a-${sub}-nested-cross-get`, "B", `${resource}/nested/child`, "get", "deny", { fixtures: parent });
  if (sub === "rsvps") {
    accept("4b2a-rsvps-owner-get", "A", resource, "get", "allow", { fixtures: parent, data: { userId: "{B}" } });
    accept("4b2a-rsvps-group-query", "A", "rsvps", "list", "deny", {
      queryType: "group", fixtures: [...parent, { path: resource, data: { marker: "synthetic" } }],
    });
  } else {
    for (const op of ["get", "list"]) observed(`4b2a-${sub}-owner-raw-${op}`, "A", "firestore",
      op === "list" ? `publicadas/{ID}/${sub}` : resource, op, "allow", {
        fixtures: op === "list" ? [...parent, { path: resource, data: { marker: "synthetic" } }] : parent,
      });
    for (const op of ["create", "update", "delete"]) add(`4b2a-${sub}-nested-${op}`, "acceptance", "admin", "firestore",
      `${resource}/nested/child`, op, "deny", "A2", { fixtures: parent });
  }
}
for (const [name, resource] of [
  ["publication", "publicadas/{ID}"], ["visits", "publicadas/{ID}/visits/event"],
  ["uniqueVisitors", "publicadas/{ID}/uniqueVisitors/event"],
  ["checkout", "publication_checkout_sessions/{ID}"],
  ["checkout-child", "publication_checkout_sessions/{ID}/private/child"],
  ["reservation", "public_slug_reservations/{ID}"],
  ["discount", "publication_discount_codes/{ID}"],
  ["discount-usage", "publication_discount_code_usage/{ID}"],
]) for (const identity of ["admin", "superclaim", "role"]) for (const op of ["create", "update", "delete"]) {
  add(`4b2a-backend-${name}-${identity}-${op}`, "acceptance", identity, "firestore", resource, op, "deny", "A2", {
    data: { userId: "{ADMIN}", uid: "{ADMIN}" },
    fixtures: name === "publication" ? [] : [{ path: "publicadas/{ID}", data: { userId: "{ADMIN}" } }],
  });
}

// Exact constraints of current dashboard/library consumers, including pagination.
for (const [name, resource, orderField, limitValue] of [
  ["publication", "publicadas", "publicadaEn", 1],
  ["history", "publicadas_historial", null, 1],
  ["image", "usuarios/{A}/imagenes", "fechaSubida", 12],
]) {
  const fixtures = [
    { path: `${resource}/{ID}-a`, data: { userId: "{A}", publicadaEn: 20, fechaSubida: 20 } },
    { path: `${resource}/{ID}-b`, data: { userId: name === "image" ? "{A}" : "{B}", publicadaEn: 10, fechaSubida: 10 } },
  ];
  const extra = { fixtures, filters: name === "image" ? [] : [["userId", "==", "{A}"]],
    order: orderField ? [[orderField, "desc"]] : [], limit: limitValue,
    expectedIds: name === "image" ? ["{ID}-a", "{ID}-b"] : ["{ID}-a"] };
  accept(`4b2a-${name}-consumer-query`, "A", resource, "list", "allow", extra);
  if (name === "image") accept("4b2a-image-consumer-next-page", "A", resource, "list", "allow", {
    ...extra, cursor: [20], expectedIds: ["{ID}-b"],
  });
}
// Retained permissions are characterizations, not newly accepted own writes.
for (const [name, resource, fixtures] of [
  ["profile", "usuarios/{A}", []], ["history", "publicadas_historial/{ID}", []],
  ["rsvps", "publicadas/{ID}/rsvps/event", parent],
]) for (const op of ["create", "update", "delete"]) observed(`4b2a-pending-${name}-owner-${op}`, "A", "firestore", resource, op, "allow", { fixtures });
for (const resource of ["usuarios/{A}/unmodeled/child", "publicadas/{ID}/unmodeled/child", "publicadas_historial/{ID}/unmodeled/child"]) {
  observed(`4b2a-residual-${resource.split('/')[0]}`, "B", "firestore", resource, "update", "allow");
}

for (const [name, prefix] of [
  ["images", "usuarios/{A}/imagenes"], ["thumbnails", "usuarios/{A}/thumbnails"],
  ["draft-thumbnails", "thumbnails_borradores/{A}"],
]) {
  for (const [level, resource] of [["prefix-object", prefix], ["nested", `${prefix}/nested/{ID}.png`]]) {
    for (const identity of ["A", "B", "admin", "anonymous"]) for (const op of ["get", "create", "update", "delete"]) {
      add(`4b2a-storage-${name}-${level}-${identity}-${op}`, "acceptance", identity, "storage", resource, op,
        identity === "A" ? "allow" : "deny", "A1");
    }
  }
  add(`4b2a-storage-${name}-anonymous-list`, "acceptance", "anonymous", "storage", prefix, "list", "deny", "A1", { objectFixture: `${prefix}/{ID}.png` });
}
for (const resource of ["usuarios", "usuarios/{A}", "thumbnails_borradores"]) {
  add(`4b2a-storage-root-list-${resource.replaceAll('/', '-')}`, "acceptance", "B", "storage", resource, "list", "deny", "A1", {
    objectFixture: resource.startsWith("usuarios") ? "usuarios/{A}/imagenes/{ID}.png" : "thumbnails_borradores/{A}/{ID}.webp",
  });
}
for (const [name, resource] of [["root", "publicadas"], ["slug", "publicadas/{ID}"],
  ["nested", "publicadas/{ID}/assets/nested/fixture.png"]]) {
  for (const identity of ["A", "admin", "superclaim", "role", "anonymous"]) for (const op of ["create", "update", "delete"]) {
    add(`4b2a-published-${name}-${identity}-${op}`, "acceptance", identity, "storage", resource, op, "deny", "A2");
  }
}
observed("4b2a-published-auth-sdk-get", "A", "storage", "publicadas/{ID}/index.html", "get", "allow");
for (const resource of ["usuarios/{A}/imagenes_legacy/{ID}.png", "usuarios/{A}/unmodeled/{ID}.png", "publicadas_legacy/{ID}.html"]) {
  observed(`4b2a-storage-residual-${resource.replaceAll('/', '-')}`, "B", "storage", resource, "update", "allow");
}

// 4B2B: A4 integrity/private state. Admin read variants remain characterization.
const countdownRoot = { estado: "published", activeVersion: 2, draftVersion: 9,
  draft: { nombre: "Synthetic administrative draft" } };
const a4 = (id, identity, store, resource, op, extra = {}) =>
  add(`4b2b-${id}`, "acceptance", identity, store, resource, op, "deny", "A4", extra);
for (const [name, resource] of [
  ["root", "countdownPresets/{ID}"], ["version", "countdownPresets/{ID}/versions/2"],
  ["version-child", "countdownPresets/{ID}/versions/2/internal/child"],
  ["operation", "countdownPresets/{ID}/operations/op"],
  ["operation-child", "countdownPresets/{ID}/operations/op/internal/child"],
]) {
  for (const identity of ["anonymous", "A", "B", "admin", "superclaim", "role"]) {
    for (const op of ["create", "replace", "update", "delete"]) a4(`${name}-${identity}-${op}`, identity, "firestore", resource, op, {
      data: name === "root" ? countdownRoot : { version: 2, type: "publish", status: "completed", result: { draft: countdownRoot.draft } },
      payload: { activeVersion: 999, draftVersion: 999, estado: "published", version: 2 },
    });
  }
  if (!name.startsWith("version")) for (const identity of ["anonymous", "A", "B"]) {
    a4(`${name}-${identity}-get`, identity, "firestore", resource, "get", { data: countdownRoot });
  }
}
for (const identity of ["anonymous", "A", "B"]) {
  for (const estado of ["draft", "published", "archived"]) {
    a4(`root-${estado}-${identity}-get`, identity, "firestore", "countdownPresets/{ID}", "get", { data: { ...countdownRoot, estado } });
  }
  for (const [name, resource, filters, fixture] of [
    ["root-list", "countdownPresets", [], "countdownPresets/{ID}"],
    ["published-query", "countdownPresets", [["estado", "==", "published"]], "countdownPresets/{ID}"],
    ["operation-list", "countdownPresets/{ID}/operations", [], "countdownPresets/{ID}/operations/op"],
  ]) a4(`${name}-${identity}`, identity, "firestore", resource, "list", { filters, fixtures: [{ path: fixture, data: countdownRoot }] });
}
for (const identity of ["admin", "superclaim", "role", "stringAdmin", "serverSuper", "canonicalSuper"]) {
  const expected = ["admin", "superclaim", "role"].includes(identity) ? "allow" : "deny";
  for (const [name, resource] of [["root", "countdownPresets/{ID}"], ["operation", "countdownPresets/{ID}/operations/op"]]) {
    observed(`4b2b-${name}-${identity}-read-variant`, identity, "firestore", resource, "get", expected, { data: countdownRoot });
  }
}
for (const identity of ["A", "anonymous", "admin"]) for (const op of ["get", "list"]) {
  observed(`4b2b-version-${identity}-${op}-retained`, identity, "firestore",
    op === "get" ? "countdownPresets/{ID}/versions/2" : "countdownPresets/{ID}/versions", op, identity === "anonymous" ? "deny" : "allow", {
      fixtures: [{ path: "countdownPresets/{ID}", data: { ...countdownRoot, estado: "archived", activeVersion: 0 } },
        ...(op === "list" ? [{ path: "countdownPresets/{ID}/versions/2", data: { version: 2 } }] : [])], data: { version: 2 },
    });
}
observed("4b2b-root-admin-list", "admin", "firestore", "countdownPresets", "list", "allow", {
  fixtures: [{ path: "countdownPresets/{ID}", data: countdownRoot }],
});

const privateCountdownAssets = [
  ["staging", "assets/countdown/staging"],
  ["frame-draft", "assets/countdown/frames/{ID}/draft"],
  ["thumbnail-draft", "assets/countdown/thumbnails/{ID}/draft"],
];
for (const [name, prefix] of privateCountdownAssets) {
  for (const [level, resource] of [["prefix", prefix], ["nested-svg", `${prefix}/{ID}/op/attempt/frame.svg`], ["nested-png", `${prefix}/{ID}/op/attempt/thumbnail.png`]]) {
    for (const identity of ["anonymous", "A", "B", "admin", "superclaim", "role"]) {
      for (const op of ["create", "update", "delete"]) a4(`${name}-${level}-${identity}-${op}`, identity, "storage", resource, op);
      if (["anonymous", "A", "B"].includes(identity)) a4(`${name}-${level}-${identity}-get`, identity, "storage", resource, "get");
      else observed(`4b2b-${name}-${level}-${identity}-get`, identity, "storage", resource, "get", "allow");
    }
  }
  for (const identity of ["anonymous", "A", "B"]) a4(`${name}-${identity}-list`, identity, "storage", prefix, "list", { objectFixture: `${prefix}/{ID}.png` });
  observed(`4b2b-${name}-admin-list`, "admin", "storage", prefix, "list", "allow", { objectFixture: `${prefix}/{ID}.png` });
}
for (const family of ["frames", "thumbnails"]) {
  const prefix = `assets/countdown/${family}`;
  for (const [level, resource] of [["family", prefix], ["preset", `${prefix}/{ID}`],
    ["operation-prefix", `${prefix}/{ID}/operations`], ["operation", `${prefix}/{ID}/operations/op/attempt`],
    ["svg", `${prefix}/{ID}/operations/op/attempt/nested/frame.svg`], ["png", `${prefix}/{ID}/operations/op/attempt/nested/thumbnail.png`],
    ["legacy", `${prefix}/{ID}/frame.svg`]]) {
    for (const identity of ["anonymous", "A", "admin", "superclaim", "role"]) for (const op of ["create", "update", "delete"]) {
      a4(`${family}-${level}-${identity}-${op}`, identity, "storage", resource, op);
    }
    for (const identity of ["A", "anonymous"]) observed(`4b2b-${family}-${level}-${identity}-get`, identity, "storage", resource, "get", identity === "A" ? "allow" : "deny");
  }
  observed(`4b2b-${family}-published-list`, "A", "storage", `${prefix}/{ID}/operations`, "list", "allow", {
    objectFixture: `${prefix}/{ID}/operations/op/attempt/frame.svg`,
  });
}
for (const [name, resource, objectFixture] of [
  ["assets", "assets", "assets/countdown/staging/{ID}/secret.png"],
  ["countdown", "assets/countdown", "assets/countdown/staging/{ID}/secret.png"],
  ["frames", "assets/countdown/frames", "assets/countdown/frames/{ID}/draft/secret.svg"],
  ["frame-preset", "assets/countdown/frames/{ID}", "assets/countdown/frames/{ID}/draft/secret.svg"],
  ["thumbnails", "assets/countdown/thumbnails", "assets/countdown/thumbnails/{ID}/draft/secret.png"],
  ["thumbnail-preset", "assets/countdown/thumbnails/{ID}", "assets/countdown/thumbnails/{ID}/draft/secret.png"],
]) {
  for (const identity of ["anonymous", "A", "B"]) a4(`ancestor-${name}-${identity}-list`, identity, "storage", resource, "list", { objectFixture });
  observed(`4b2b-ancestor-${name}-admin-list`, "admin", "storage", resource, "list", "allow", { objectFixture });
}
// Sentinel boundaries: similar names and other namespaces must keep their scope.
for (const [name, resource] of [["other-assets", "assets/other-catalog/{ID}/file.png"],
  ["similar-name", "assets/countdown_legacy/{ID}.svg"], ["unmodeled-countdown", "assets/countdown/unmodeled/{ID}.png"],
  ["assets-object", "assets"], ["countdown-object", "assets/countdown"]]) {
  for (const op of ["get", "create", "update", "delete"]) observed(`4b2b-residual-${name}-${op}`, "A", "storage", resource, op, "allow");
}
observed("4b2b-other-assets-list", "A", "storage", "assets/other-catalog", "list", "allow", { objectFixture: "assets/other-catalog/{ID}/file.png" });

if (new Set(cases.map(c => c.id)).size !== cases.length) throw new Error("Duplicate Rules case ID");
