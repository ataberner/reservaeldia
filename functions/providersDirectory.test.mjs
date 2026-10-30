import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const model = require("./lib/providers/directoryModel.js");
const beta = require("./lib/providers/betaModel.js");
const { approvedDirectoryImagePath } = require("./lib/providers/directoryMedia.js");
const { providerDirectoryHandler } = require("./lib/providers/directoryService.js");
const { DIRECTORY_REGIONS, matchesDirectoryRegion } = require("./lib/providers/directoryRegions.js");
const categories = [{ id: "foto-video", nombre: "Foto y video", tipo: "profesional", orden: 1 }, { id: "quintas", nombre: "Quintas", tipo: "lugar", orden: 2 }];
const now = new Date("2026-10-25T12:00:00Z");
function published(id = "prov_test", overrides = {}) {
  const draft = beta.normalizeProviderDraft({ nombre: "Estudio Ámbar", categoriaPrincipalId: "foto-video", descripcionCorta: "Fotografía documental", descripcion: "Equipo para casamientos", contacto: { email: "business@example.test" }, ubicacion: { ciudad: "La Plata", nivel1Nombre: "Buenos Aires" }, cobertura: ["Chascomús"], ...overrides });
  let document = beta.createProviderBetaDocument(draft, id, "synthetic-admin", now);
  document = beta.transitionProviderBeta(document, { operation: "submit", expectedRevision: 1 }, "synthetic-admin", now).document;
  document = beta.transitionProviderBeta(document, { operation: "approve", expectedRevision: 2, reviewRevision: 1 }, "synthetic-admin", now).document;
  return document;
}
const filters = overrides => model.normalizeDirectoryFilters({ kind: "profesional", ...overrides }, categories);
function recordsLoader(records) {
  const reads = [];
  return { reads, fetch: async (after, limit) => {
    reads.push({ after, limit });
    const offset = after ? records.findIndex(record => record.id === after) + 1 : 0;
    return { records: records.slice(offset, offset + limit), exhausted: records.length <= offset + limit };
  } };
}

test("private directory gate is strict and independent of panel and public delivery", () => {
  for (const value of [undefined, null, {}, { privateDirectoryEnabled: "true" }, { panelEnabled: true, directoryEnabled: true }]) assert.equal(beta.providerBetaControls(value).privateDirectoryEnabled, false);
  assert.deepEqual(beta.providerBetaControls({ privateDirectoryEnabled: true }), { panelEnabled: false, privateDirectoryEnabled: true, onboardingEnabled: false, directoryEnabled: false });
});
test("only current eligible approved snapshots are delivered while visible remains false", () => {
  const document = published();
  assert.equal(document.visible, false);
  assert.ok(model.approvedDirectoryProvider("prov_test", document, categories));
  for (const change of [{ estado: "pausado" }, { estado: "eliminado" }, { estado: "borrador" }, { activo: false }, { aprobada: null }, { validacion: { estado: "suspendido" } }]) assert.equal(model.approvedDirectoryProvider("prov_test", { ...document, ...change }, categories), null);
  assert.equal(model.approvedDirectoryProvider("prov_test", document, []), null, "Inactive or unknown current category denies delivery");
  assert.equal(model.approvedDirectoryProvider("prov_test", { ...document, aprobada: { revision: 1, contenido: {} } }, categories), null);
});
test("filters use approved name/location/coverage only; editable and internal values never match", () => {
  const document = published();
  document.nombre = "DRAFT_SENTINEL"; document.ubicacion.ciudad = "DRAFT_CITY"; document.beta.notasInternas = "PRIVATE_SENTINEL";
  const provider = model.approvedDirectoryProvider("prov_test", document, categories);
  assert.equal(model.matchesDirectoryFilters(provider, filters({ search: "ámbar" })), true);
  assert.equal(model.matchesDirectoryFilters(provider, filters({ search: "fotografia" })), true);
  assert.equal(model.matchesDirectoryFilters(provider, filters({ location: "chascomus" })), true);
  for (const search of ["DRAFT_SENTINEL", "PRIVATE_SENTINEL", "business@example.test"]) assert.equal(model.matchesDirectoryFilters(provider, filters({ search })), false);
  assert.equal(model.matchesDirectoryFilters(provider, filters({ location: "DRAFT_CITY" })), false);
  assert.throws(() => filters({ categoryId: "quintas" }), { code: "invalid-argument" });
});
test("card/detail descriptors never contain paths, actor, source URLs or internal metadata", () => {
  const document = published();
  const image = { id: "img_approved", tipo: "portada", storagePath: "proveedores/prov_test/media/img_approved.webp", alt: "Imagen sintética", orden: 0, ancho: 10, alto: 10, mimeType: "image/webp", urlOriginal: "PRIVATE_SENTINEL", internalNotes: "PRIVATE_SENTINEL" };
  document.aprobada.contenido.imagenes.portada = image;
  document.aprobada.contenido.internalNotes = "PRIVATE_SENTINEL";
  document.aprobada.contenido.contratacion.internalNotes = "PRIVATE_SENTINEL";
  document.aprobada.contenido.precio.internalNotes = "PRIVATE_SENTINEL";
  const provider = model.approvedDirectoryProvider("prov_test", document, categories);
  for (const dto of [model.directoryContent(provider.content), model.directorySummary(provider)]) assert.doesNotMatch(JSON.stringify(dto), /PRIVATE_SENTINEL|storagePath|urlOriginal|aprobadaPor|propietario/);
  assert.equal(model.directorySummary(provider).portada.id, image.id);
});
test("capacity filters require an approved confirmed venue maximum and participate in cursors", () => {
  const query = model.normalizeDirectoryFilters({ kind: "lugar", minCapacity: 120 }, categories);
  const document = published("prov_venue", { categoriaPrincipalId: "quintas", espacio: { capacidadMaxima: 140 } });
  document.espacio.capacidadMaxima = 300;
  const provider = model.approvedDirectoryProvider("prov_venue", document, categories);
  assert.equal(model.matchesDirectoryFilters(provider, query), true);
  assert.equal(model.matchesDirectoryFilters(provider, { ...query, minCapacity: 200 }), false, "Editable capacity cannot match");
  provider.content.espacio.capacidadMaxima = null;
  assert.equal(model.matchesDirectoryFilters(provider, query), false);
  assert.equal(model.matchesDirectoryFilters(provider, { ...query, minCapacity: null }), true);
  const cursor = model.encodeDirectoryCursor("prov_venue", query);
  assert.throws(() => model.decodeDirectoryCursor(cursor, { ...query, minCapacity: 121 }), { code: "invalid-argument" });
  for (const minCapacity of [0, -1, 1.5, 100001, "120"]) assert.throws(() => model.normalizeDirectoryFilters({ kind: "lugar", minCapacity }, categories), { code: "invalid-argument" });
  assert.throws(() => filters({ minCapacity: 120 }), { code: "invalid-argument" });
});

test("venue region catalog contains CABA, three GBA search zones and every Argentine province", () => {
  assert.equal(new Set(DIRECTORY_REGIONS.map(region => region.id)).size, 28);
  assert.equal(DIRECTORY_REGIONS.filter(region => region.group === "Provincias").length, 23);
  for (const id of ["ar", "caba", "gba-norte", "gba-oeste", "gba-sur", "provincia:AR-B", "provincia:AR-V", "provincia:AR-X"])
    assert.ok(DIRECTORY_REGIONS.some(region => region.id === id));
  assert.ok(DIRECTORY_REGIONS.every(region => typeof region.nombre === "string" && region.nombre && typeof region.group === "string"));
});

test("Argentine regions match approved province aliases without assuming countries from city names", () => {
  for (const province of ["CABA", "Capital Federal", "Ciudad Autónoma de Buenos Aires", "AR-C"])
    assert.equal(matchesDirectoryRegion({ provincia: province }, "caba"), true);
  assert.equal(matchesDirectoryRegion({ provincia: "  PROVINCIA DE CÓRDOBA  " }, "provincia:AR-X"), true);
  assert.equal(matchesDirectoryRegion({ provincia: "Buenos Aires" }, "ar"), true, "Legacy approved province can evidence Argentina when country is absent");
  assert.equal(matchesDirectoryRegion({ provincia: "Buenos Aires", paisCodigo: "UY" }, "ar"), false);
  assert.equal(matchesDirectoryRegion({ provincia: "Buenos Aires", paisCodigo: "AR", pais: "Uruguay" }, "ar"), false);
  assert.equal(matchesDirectoryRegion({ ciudad: "Córdoba" }, "ar"), false, "Ambiguous city alone cannot establish a country");
  assert.equal(matchesDirectoryRegion({ paisCodigo: "AR" }, "ar"), true);
  assert.equal(matchesDirectoryRegion({ provincia: "CABA" }, "provincia:AR-B"), false);
  assert.equal(matchesDirectoryRegion({ provincia: "Buenos Aires" }, "gba-norte"), false, "Province alone does not establish a search zone");
  assert.equal(matchesDirectoryRegion({ provincia: "constructor" }, "ar"), false, "Unknown names cannot borrow an inherited object property");
});

test("GBA search zones use the reviewed municipal/locality catalog and reject ambiguous or foreign homonyms", () => {
  const examples = {
    "gba-norte": ["Pilar", "Escobar", "Belén de Escobar", "Tigre", "Benavídez", "San Isidro", "Vicente López"],
    "gba-oeste": ["General Rodríguez", "Moreno", "Merlo", "Morón", "Caseros", "San Justo", "Marcos Paz"],
    "gba-sur": ["Ezeiza", "Monte Grande", "Adrogué", "Quilmes", "La Plata", "Berazategui", "San Vicente"],
  };
  for (const [region, cities] of Object.entries(examples)) for (const ciudad of cities) {
    assert.equal(matchesDirectoryRegion({ provincia: "Provincia de Buenos Aires", ciudad }, region), true, ciudad);
    assert.equal(matchesDirectoryRegion({ provincia: "Buenos Aires", ciudad: `  ${ciudad.toUpperCase()}  ` }, region), true, ciudad);
    for (const other of Object.keys(examples).filter(id => id !== region))
      assert.equal(matchesDirectoryRegion({ provincia: "Buenos Aires", ciudad }, other), false, `${ciudad} cannot enter ${other}`);
    assert.equal(matchesDirectoryRegion({ provincia: "Córdoba", ciudad }, region), false);
  }
  for (const ciudad of ["Malvinas Argentinas", "San José", "Loma Verde", "Manuel B. Gonnet", "Calle de Pilar", "Unknown"])
    for (const region of Object.keys(examples)) assert.equal(matchesDirectoryRegion({ provincia: "Buenos Aires", ciudad }, region), false, ciudad);
});

test("guests are compared to the confirmed approved range and never editable pending capacities", () => {
  const query = model.normalizeDirectoryFilters({ kind: "lugar", guests: 100, regionId: "gba-norte" }, categories);
  const document = published("prov_venue", { categoriaPrincipalId: "quintas", ubicacion: { ciudad: "Pilar", nivel1Nombre: "Buenos Aires" }, espacio: { capacidadMinima: 80, capacidadMaxima: 140 } });
  document.espacio.capacidadMaxima = 300;
  document.ubicacion.ciudad = "Morón";
  const provider = model.approvedDirectoryProvider("prov_venue", document, categories);
  assert.equal(model.matchesDirectoryFilters(provider, query), true);
  for (const guests of [79, 141]) assert.equal(model.matchesDirectoryFilters(provider, { ...query, guests }), false);
  for (const guests of [80, 140]) assert.equal(model.matchesDirectoryFilters(provider, { ...query, guests }), true);
  assert.equal(model.matchesDirectoryFilters(provider, { ...query, regionId: "gba-oeste" }), false);
  provider.content.espacio.capacidadMinima = null;
  assert.equal(model.matchesDirectoryFilters(provider, query), true, "An unknown minimum is not an invented restriction");
  provider.content.espacio.capacidadMaxima = null;
  assert.equal(model.matchesDirectoryFilters(provider, query), false, "An unknown maximum cannot promise sufficient capacity");
});

test("guest and regional parameters reject invalid inputs and bind continuation to the same search", () => {
  const query = model.normalizeDirectoryFilters({ kind: "lugar", guests: 120, regionId: "ar" }, categories);
  const cursor = model.encodeDirectoryCursor("prov_last", query);
  assert.equal(model.decodeDirectoryCursor(cursor, { ...query }), "prov_last");
  for (const changed of [{ guests: 121 }, { regionId: "caba" }]) assert.throws(() => model.decodeDirectoryCursor(cursor, { ...query, ...changed }), { code: "invalid-argument" });
  for (const guests of [0, -1, 1.5, 100001, "120", true]) assert.throws(() => model.normalizeDirectoryFilters({ kind: "lugar", guests }, categories), { code: "invalid-argument" });
  for (const regionId of ["london", "provincia:AR-C", {}, true]) assert.throws(() => model.normalizeDirectoryFilters({ kind: "lugar", regionId }, categories), { code: "invalid-argument" });
  assert.throws(() => filters({ guests: 120 }), { code: "invalid-argument" });
  assert.throws(() => filters({ regionId: "ar" }), { code: "invalid-argument" });
  const legacy = filters({ location: "Chascomús" });
  assert.equal(legacy.regionId, ""); assert.equal(legacy.guests, null);
});

test("continuation from the previous directory implementation stays valid without new venue criteria", () => {
  const legacy = { kind: "profesional", search: "ambar", location: "", categoryId: "", minCapacity: null, pageSize: 12 };
  const hash = createHash("sha256").update(JSON.stringify(legacy)).digest("hex");
  const cursor = Buffer.from(JSON.stringify({ version: 1, lastId: "prov_old", filters: hash })).toString("base64url");
  assert.equal(model.decodeDirectoryCursor(cursor, model.normalizeDirectoryFilters(legacy, categories)), "prov_old");
  const venue = { ...legacy, kind: "lugar", minCapacity: 100 };
  const venueCursor = Buffer.from(JSON.stringify({ version: 1, lastId: "prov_old", filters: createHash("sha256").update(JSON.stringify(venue)).digest("hex") })).toString("base64url");
  assert.equal(model.decodeDirectoryCursor(venueCursor, model.normalizeDirectoryFilters(venue, categories)), "prov_old");
  assert.throws(() => model.decodeDirectoryCursor(venueCursor, model.normalizeDirectoryFilters({ ...venue, regionId: "ar" }, categories)), { code: "invalid-argument" });
});

test("regional guest search fills pages across exclusions without duplicate or skipped approved matches", async () => {
  const approved = published("prov_venue", { categoriaPrincipalId: "quintas", ubicacion: { ciudad: "Pilar", nivel1Nombre: "Buenos Aires" }, espacio: { capacidadMinima: 80, capacidadMaxima: 150 } });
  const wrongArea = published("prov_other", { categoriaPrincipalId: "quintas", ubicacion: { ciudad: "Córdoba", nivel1Nombre: "Córdoba" }, espacio: { capacidadMaxima: 150 } });
  const query = model.normalizeDirectoryFilters({ kind: "lugar", regionId: "gba-norte", guests: 100, pageSize: 2 }, categories);
  const records = Array.from({ length: 920 }, (_, index) => ({ id: `prov_${String(index).padStart(5, "0")}`, data: index % 300 === 299 ? approved : wrongArea }));
  const loader = recordsLoader(records);
  const first = await model.scanDirectoryPage(loader.fetch, query, categories, null);
  const second = await model.scanDirectoryPage(loader.fetch, query, categories, first.nextCursor);
  assert.deepEqual([...first.items, ...second.items].map(item => item.id), ["prov_00299", "prov_00599", "prov_00899"]);
  assert.equal(first.hasMore, true); assert.equal(second.hasMore, false);
});
test("image selection is bound to the current approved revision and provider path", () => {
  const provider = { id: "prov_test", approvedRevision: 3, content: { imagenes: { portada: { id: "img_approved", storagePath: "proveedores/prov_test/media/img_approved.webp" }, galeria: [] } } };
  assert.equal(model.directoryContent(provider.content).imagenes.portada.id, "img_approved");
  assert.equal(approvedDirectoryImagePath(provider, "img_approved", "3"), "proveedores/prov_test/media/img_approved.webp");
  for (const [id, revision] of [["img_approved", "2"], ["img_pending", "3"], ["img_approved", "3.0"]]) assert.throws(() => approvedDirectoryImagePath(provider, id, revision), { code: "not-found" });
  provider.content.imagenes.portada.storagePath = "proveedores/another/media/img_approved.webp";
  assert.throws(() => approvedDirectoryImagePath(provider, "img_approved", "3"), { code: "not-found" });
});
test("cursor is bound to normalized filters, category, kind, and page size", () => {
  const original = filters({ search: "ÁMBAR", pageSize: 2 });
  const cursor = model.encodeDirectoryCursor("prov_last", original);
  assert.equal(model.decodeDirectoryCursor(cursor, filters({ search: "ambar", pageSize: 2 })), "prov_last");
  for (const changed of [filters({ search: "otro", pageSize: 2 }), filters({ search: "ambar", pageSize: 3 }), filters({ search: "ambar", categoryId: "foto-video", pageSize: 2 })]) assert.throws(() => model.decodeDirectoryCursor(cursor, changed), { code: "invalid-argument" });
  for (const invalid of ["not json", "e30", { lastId: "prov_last" }, "A".repeat(601)]) assert.throws(() => model.decodeDirectoryCursor(invalid, original), { code: "invalid-argument" });
});
test("pages fill across more than 500 exclusions and lookahead causes no duplicate or skipped match", async () => {
  const good = published();
  const records = Array.from({ length: 920 }, (_, index) => ({ id: `prov_${String(index).padStart(5, "0")}`, data: index % 300 === 299 ? good : { ...good, activo: false } }));
  const loader = recordsLoader(records), query = filters({ pageSize: 2 });
  const first = await model.scanDirectoryPage(loader.fetch, query, categories, null);
  assert.deepEqual(first.items.map(item => item.id), ["prov_00299", "prov_00599"]);
  assert.equal(first.hasMore, true);
  const second = await model.scanDirectoryPage(loader.fetch, query, categories, first.nextCursor);
  assert.deepEqual(second.items.map(item => item.id), ["prov_00899"]);
  assert.equal(second.hasMore, false); assert.equal(second.nextCursor, null);
  assert.ok(loader.reads.every(read => read.limit <= 100));
});
test("exact end gives a full final page and scan budget fails explicitly without a partial result", async () => {
  const data = published();
  const exact = recordsLoader(Array.from({ length: 24 }, (_, index) => ({ id: `p_${index}`, data })));
  const last = await model.scanDirectoryPage(exact.fetch, filters({ pageSize: 24 }), categories, null);
  assert.equal(last.items.length, 24); assert.equal(last.hasMore, false);
  const many = recordsLoader(Array.from({ length: 5001 }, (_, index) => ({ id: `prov_${index}`, data: { ...data, activo: false } })));
  await assert.rejects(() => model.scanDirectoryPage(many.fetch, filters(), categories, null), { code: "resource-exhausted" });
  assert.equal(many.reads.reduce((sum, item) => sum + item.limit, 0), 5000);
});
test("unauthenticated and ordinary/admin-claim users cannot invoke directory or read config", async () => {
  const db = { doc() { throw new Error("Unauthorized request read storage"); } };
  await assert.rejects(() => providerDirectoryHandler({ data: { operation: "access" } }, db), { code: "unauthenticated" });
  for (const token of [{}, { admin: true, superadmin: true }]) await assert.rejects(() => providerDirectoryHandler({ auth: { uid: "synthetic-not-superadmin", token }, data: { operation: "list", kind: "profesional" } }, db), { code: "permission-denied" });
});
