import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { createProviderDirectoryFixtures } from "./providerDirectoryFixtures.mjs";
import { operator, ordinary, publishableDraft } from "./providerBetaFixtures.mjs";

const require = createRequire(import.meta.url);
export const SEARCH_ROW_COUNT = 3205;
export const SEARCH_TARGET = "Álamo Final · prueba sintética";
export const SEARCH_GROUP = "Grupo paginado sintético";
export const searchId = index => `000_admin_search_${String(index).padStart(5, "0")}`;

// Only wraps the injected test database. No SDK/global monkeypatch or production
// telemetry is installed. Received documents include unread batch overfetch.
export function measuredDatabase(db, metrics) {
  const wrap = value => new Proxy(value, { get(target, key) {
    if (key === "get") return async (...args) => {
      const started = performance.now();
      const result = await target.get(...args);
      if (Array.isArray(result.docs)) {
        metrics.queries += 1; metrics.received += result.size;
        metrics.batches.push({ received: result.size, elapsedMs: performance.now() - started });
      } else metrics.documentReads += 1;
      return result;
    };
    const field = Reflect.get(target, key, target);
    if (typeof field !== "function") return field;
    return (...args) => {
      const result = field.apply(target, args);
      return result && typeof result.get === "function" ? wrap(result) : result;
    };
  } });
  return wrap(db);
}

export async function createProviderAdminSearchFixtures() {
  const fixture = await createProviderDirectoryFixtures({ privateEnabled: false });
  const model = require("../../functions/lib/providers/betaModel.js");
  const providers = require("../../functions/lib/providers/index.js");
  const { adminProvidersHandler } = require("../../functions/lib/providers/betaService.js");
  const now = new Date("2026-10-25T12:00:00Z");
  const draft = model.normalizeProviderDraft({ ...publishableDraft, categoriaPrincipalId: "salones-fiestas", cobertura: [] }, undefined, now);
  let approved = model.createProviderBetaDocument(draft, "synthetic-template", operator.uid, now, "SEARCH-PRIVATE-INTERNAL");
  approved = model.transitionProviderBeta(approved, { operation: "submit", expectedRevision: approved.beta.revision }, operator.uid, now).document;
  approved = model.transitionProviderBeta(approved, { operation: "approve", expectedRevision: approved.beta.revision, reviewRevision: approved.revisionPendiente.revision }, operator.uid, now).document;
  const record = { categoria: "salones-fiestas", nombre: "Legado sintético", pagina: "https://www.portalcasamientos.com.ar/salones-fiestas/local-synthetic-abc123/", sitio_web: "", telefono: "", email: "legacy@example.test", direccion: "", calle: "", localidad: "La Plata", provincia: "Buenos Aires", codigo_postal: "", pais: "AR", tipo_schema: "EventVenue", fuente_extraccion: "synthetic" };
  const sourceFile = providers.parseProviderSourceFile({ version: 9, createdAt: now.toISOString(), reason: "synthetic", origin: "https://www.portalcasamientos.com.ar", providerUrls: [], results: [record] });
  const legacy = providers.mapPortalProviderRecord(record, { sourceFile, sourceFileName: "synthetic-search.json" }).document;
  const ids = [], dataset = [];
  async function seed(start, end) {
    for (let offset = start; offset < end; offset += 400) {
      const batch = fixture.db.batch();
      for (let index = offset; index < Math.min(end, offset + 400); index += 1) {
        const id = searchId(index);
        const data = structuredClone(index % 2 ? legacy : approved);
        data.nombre = index >= 2000 && index <= 3000 && index % 50 === 0 ? `${SEARCH_GROUP} ${index}` : `Ficha sintética ${String(index).padStart(5, "0")}`;
        data.contacto.email = `entry-${index}@example.test`;
        data.contacto.emailsAlternativos = [];
        if ([499, 500, 501, 2999, 3000].includes(index)) data.contacto.emailsAlternativos = [`frontera-${index}@example.test`];
        if (index === 3203) data.nombre = "Legado extremo sintético";
        if (index === 3204) {
          data.nombre = SEARCH_TARGET; data.contacto.email = "target@example.test";
          data.contacto.emailsAlternativos = ["alias-target@example.test"];
          data.propietario.userId = ordinary.uid;
        }
        if (data.aprobada) data.aprobada.contenido.nombre = data.nombre;
        batch.create(fixture.db.doc(`proveedores/${id}`), data);
        ids.push(id); fixture.providerIds.add(id);
        dataset.push([id, data.schemaVersion, data.nombre, data.contacto.email, data.contacto.emailsAlternativos]);
      }
      await batch.commit();
    }
  }
  async function remove(idsToRemove) {
    for (let offset = 0; offset < idsToRemove.length; offset += 400) {
      const batch = fixture.db.batch();
      for (const id of idsToRemove.slice(offset, offset + 400)) batch.delete(fixture.db.doc(`proveedores/${id}`));
      await batch.commit();
      for (const id of idsToRemove.slice(offset, offset + 400)) fixture.providerIds.delete(id);
    }
  }
  try { await seed(0, SEARCH_ROW_COUNT); }
  catch (error) { await remove(ids); await fixture.cleanup(); throw error; }
  const datasetHash = createHash("sha256").update(JSON.stringify(dataset)).digest("hex");
  async function measuredList(filters = {}) {
    const metrics = { queries: 0, received: 0, documentReads: 0, batches: [] };
    const started = performance.now();
    try {
      const result = await adminProvidersHandler({ auth: { uid: operator.uid }, data: { operation: "list", ...filters } }, measuredDatabase(fixture.db, metrics));
      metrics.examined = result.scanned; metrics.elapsedMs = performance.now() - started;
      return { result, metrics };
    } catch (error) { error.testMetrics = { ...metrics, elapsedMs: performance.now() - started }; throw error; }
  }
  async function withBudgetOverflow(run) {
    const start = ids.length;
    await seed(SEARCH_ROW_COUNT, 5001);
    const extra = ids.slice(start);
    try { return await run(); } finally { await remove(extra); ids.splice(start); }
  }
  return { ...fixture, ids, datasetHash, measuredList, withBudgetOverflow,
    cleanup: async () => { await remove(ids); await fixture.cleanup(); } };
}
