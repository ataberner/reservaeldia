// Presentation adapters only. Persistence, publication validation and permissions
// belong to the provider backend; no client profile can supply authority here.
export function emptyProviderDraft() {
  return {
    nombre: "", categoriaPrincipalId: null, categoriaIds: [], descripcionCorta: "", descripcion: "",
    contacto: { whatsapp: null, email: null, telefonoOriginal: null, telefonoNormalizado: null, sitioWeb: null, emailsAlternativos: [] },
    redesSociales: { instagram: null, facebook: null, tiktok: null, youtube: null, pinterest: null, linkedin: null, linktree: null, otras: [] },
    ubicacion: { ciudad: null, nivel1Nombre: null, paisCodigo: null, paisNombre: null, direccionCompleta: null, coordenadas: null },
    imagenes: { portada: null, logo: null, galeria: [] }, cobertura: [], servicios: [],
    precio: { modalidad: "consultar", importe: null, moneda: null, unidad: null, actualizadoEn: null },
    contratacion: { anticipacion: "", incluye: "", duracion: "", reserva: "" },
    espacio: { capacidadMinima: null, capacidadMaxima: null, cubierto: null, aireLibre: null, caracteristicas: [], coordenadasVerificadas: false },
  };
}

export function normalizeDraftForForm(draft = {}) {
  const defaults = emptyProviderDraft();
  const result = { ...defaults, ...draft };
  for (const group of ["contacto", "redesSociales", "ubicacion", "imagenes", "precio", "contratacion", "espacio"]) {
    result[group] = { ...defaults[group], ...draft[group] };
  }
  return structuredClone(result);
}

export function setDraftField(draft, path, value) {
  const keys = path.split(".");
  const updated = structuredClone(draft);
  let target = updated;
  for (const key of keys.slice(0, -1)) target = target[key] || (target[key] = {});
  target[keys.at(-1)] = value;
  return updated;
}

export function moveGalleryImage(gallery, index, direction) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= gallery.length) return gallery;
  const result = [...gallery];
  [result[index], result[nextIndex]] = [result[nextIndex], result[index]];
  return result.map((image, order) => ({ ...image, orden: order }));
}

// Selection changes never delete bytes or alter a previously approved snapshot.
export function assignUploadedProviderImages(images, uploaded, role) {
  if (!["portada", "logo", "galeria"].includes(role)) throw new Error("Destino de imagen inválido.");
  if (!uploaded.length) return images;
  if (role !== "galeria") return { ...images, [role]: { ...uploaded[0], tipo: role, orden: 0 } };
  return { ...images, galeria: [...images.galeria, ...uploaded.map((image, index) => ({ ...image, tipo: "galeria", orden: images.galeria.length + index }))] };
}

export function removeProviderGalleryImage(images, id) {
  return { ...images, galeria: images.galeria.filter((image) => image.id !== id).map((image, index) => ({ ...image, orden: index })) };
}

export function parseOptionalNumber(value) {
  return value === "" ? null : Number(value);
}

export function providerErrorMessage(error) {
  if (String(error?.code || "").includes("aborted")) {
    return "Otra persona modificó esta ficha. Tus cambios siguen en pantalla. Copialos antes de recargar la versión actual.";
  }
  const labels = {
    nombre: "nombre comercial", descripcionCorta: "descripción breve", descripcion: "descripción completa",
    categoriaPrincipalId: "categoría principal", categoriaIds: "categorías", "ubicacion.ciudad": "localidad",
    "ubicacion.nivel1Nombre": "provincia", contacto: "WhatsApp o correo comercial", cobertura: "zonas de cobertura",
    servicios: "servicios", precio: "precio", espacio: "características del espacio", "ubicacion.coordenadas": "coordenadas",
  };
  const fields = Array.isArray(error?.details?.fields) ? [...new Set(error.details.fields)].map((field) => labels[field] || field) : [];
  const message = error?.message || "No pudimos completar la acción. Intentá nuevamente.";
  return fields.length ? `${message} Revisá: ${fields.join(", ")}.` : message;
}

export const publicationLabels = { borrador: "Borrador", publicada: "Publicada · acceso privado", pausada: "Pausada", archivada: "Archivada" };
export const reviewLabels = { sin_cambios: "Sin cambios pendientes", sin_cambios_pendientes: "Sin cambios pendientes", en_revision: "En revisión", requiere_correcciones: "Requiere correcciones" };

export function providerReviewLabel(status, hasPendingChanges) {
  return status === "sin_cambios" && hasPendingChanges ? "Cambios guardados sin enviar" : reviewLabels[status] || status;
}

export function formatProviderDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(date) : "Sin fecha";
}
