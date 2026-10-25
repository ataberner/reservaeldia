import assert from "node:assert/strict";
import test from "node:test";
import { assignUploadedProviderImages, emptyProviderDraft, normalizeDraftForForm, setDraftField, moveGalleryImage, parseOptionalNumber, providerErrorMessage, providerReviewLabel, removeProviderGalleryImage } from "./adminForm.js";

test("form defaults preserve unknown venue values and do not fabricate contact or photos", () => {
  const draft = emptyProviderDraft();
  assert.equal(draft.espacio.capacidadMinima, null);
  assert.equal(draft.espacio.capacidadMaxima, null);
  assert.equal(draft.espacio.cubierto, null);
  assert.equal(draft.espacio.aireLibre, null);
  assert.equal(draft.imagenes.portada, null);
  assert.equal(draft.precio.modalidad, "consultar");
  assert.equal(draft.contacto.email, null);
  assert.deepEqual(draft.cobertura, []);
  assert.equal(parseOptionalNumber(""), null);
  assert.equal(parseOptionalNumber("120"), 120);
});

test("legacy adapters retain identifiers and existing evidence while edits stay immutable", () => {
  const legacy = { nombre: "Negocio sintético", ubicacion: { ciudad: "Rosario", direccionOriginal: "Evidencia privada" }, imagenes: { portada: { id: "old", storagePath: "proveedores/p/portada/old.jpg", tamanioBytes: 18000000 }, galeria: [] } };
  const form = normalizeDraftForForm(legacy);
  const edited = setDraftField(form, "ubicacion.ciudad", "Santa Fe");
  assert.equal(edited.ubicacion.direccionOriginal, "Evidencia privada");
  assert.equal(form.ubicacion.ciudad, "Rosario");
  assert.equal(legacy.ubicacion.ciudad, "Rosario");
  assert.equal(edited.imagenes.portada.tamanioBytes, 18000000);
  assert.equal(setDraftField(form, "ubicacion.coordenadas.latitud", -32).ubicacion.coordenadas.latitud, -32);
});

test("gallery reordering changes order only and does not mutate prior snapshots", () => {
  const gallery = [{ id: "a", orden: 0, storagePath: "private/a" }, { id: "b", orden: 1, storagePath: "private/b" }];
  const reordered = moveGalleryImage(gallery, 1, -1);
  assert.deepEqual(reordered.map(({ id, orden }) => [id, orden]), [["b", 0], ["a", 1]]);
  assert.equal(reordered[0].storagePath, "private/b");
  assert.deepEqual(gallery.map(({ id, orden }) => [id, orden]), [["a", 0], ["b", 1]]);
  assert.equal(moveGalleryImage(gallery, 0, -1), gallery);
});

test("direct logo upload stays independent from gallery and preserves previous cover/approved selection", () => {
  const oldCover = { id: "cover", storagePath: "private/cover.webp", tipo: "portada", orden: 0 };
  const approved = { portada: oldCover, logo: null, galeria: [] };
  const upload = { id: "logo", storagePath: "private/logo.webp", tipo: "galeria", orden: 7 };
  const selected = assignUploadedProviderImages(approved, [upload], "logo");
  assert.equal(selected.portada, oldCover);
  assert.deepEqual(selected.galeria, []);
  assert.deepEqual(selected.logo, { ...upload, tipo: "logo", orden: 0 });
  assert.equal(approved.logo, null);
  assert.equal(upload.tipo, "galeria");
  const newCover = assignUploadedProviderImages(selected, [{ id: "cover-new", storagePath: "private/new.webp" }], "portada");
  assert.equal(newCover.logo, selected.logo);
  assert.equal(approved.portada.id, "cover");
});

test("remove/reorder gallery preserves independent and shared role references without deleting approved images", () => {
  const first = { id: "a", storagePath: "private/a.webp", tipo: "galeria", orden: 0 };
  const second = { id: "b", storagePath: "private/b.webp", tipo: "galeria", orden: 1 };
  const approved = { portada: { ...first, tipo: "portada" }, logo: { ...first, tipo: "logo" }, galeria: [first, second] };
  const edited = removeProviderGalleryImage(approved, "a");
  assert.equal(edited.logo, approved.logo);
  assert.equal(edited.portada, approved.portada);
  assert.deepEqual(edited.galeria.map(({ id, orden }) => [id, orden]), [["b", 0]]);
  assert.equal(approved.galeria.length, 2);
  const restored = assignUploadedProviderImages(edited, [first], "galeria");
  assert.deepEqual(restored.galeria.map(({ id, orden }) => [id, orden]), [["b", 0], ["a", 1]]);
  const reordered = { ...restored, galeria: moveGalleryImage(restored.galeria, 1, -1) };
  assert.deepEqual(reordered.galeria.map(({ id, orden }) => [id, orden]), [["a", 0], ["b", 1]]);
  assert.equal(reordered.logo.storagePath, "private/a.webp");
  assert.throws(() => assignUploadedProviderImages(edited, [first], "unknown"));
});

test("concurrent rejection tells the editor how to preserve unsaved content", () => {
  assert.match(providerErrorMessage({ code: "functions/aborted" }), /Tus cambios siguen en pantalla/);
  assert.equal(providerErrorMessage({ message: "La beta está cerrada" }), "La beta está cerrada");
  assert.match(providerErrorMessage({ message: "Ficha incompleta", details: { fields: ["descripcionCorta", "ubicacion.ciudad"] } }), /descripción breve, localidad/);
});

test("Firebase transport failures show useful messages without inventing an internal error cause", () => {
  for (const prefix of ["", "functions/"]) {
    const internal = providerErrorMessage({ code: `${prefix}internal`, message: "internal" });
    assert.match(internal, /No pudimos completar la acción.*Volvé a intentarlo/);
    assert.doesNotMatch(internal, /internal|conexión|internet/i);
    const unavailable = providerErrorMessage({ code: `${prefix}unavailable`, message: "PRIVATE_UNAVAILABLE" });
    assert.match(unavailable, /servicio no está disponible.*Volvé a intentarlo/);
    assert.doesNotMatch(unavailable, /PRIVATE_/);
    const network = providerErrorMessage({ code: `${prefix}network-request-failed`, message: "PRIVATE_NETWORK" });
    assert.match(network, /comunicarnos con el servicio.*conexión.*intentarlo/);
    assert.doesNotMatch(network, /PRIVATE_/);
  }
});

test("saved edits awaiting submission are not mislabeled as no pending changes", () => {
  assert.equal(providerReviewLabel("sin_cambios", true), "Cambios guardados sin enviar");
  assert.equal(providerReviewLabel("sin_cambios", false), "Sin cambios pendientes");
  assert.equal(providerReviewLabel("en_revision", true), "En revisión");
});
