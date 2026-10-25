export const EMPTY_DIRECTORY_FILTERS = { search: "", categoryId: "", location: "", minCapacity: "" };

export function directoryLocation(location = {}) {
  return [location.ciudad, location.provincia, location.pais].filter(Boolean).join(", ");
}

export function directoryPrice(price) {
  if (price?.modalidad !== "desde" || !Number.isFinite(price.importe) || price.importe <= 0 ||
      !/^[A-Z]{3}$/.test(price.moneda || "") || !["evento", "persona", "hora", "unidad"].includes(price.unidad)) return "Consultar presupuesto";
  try { return `Desde ${new Intl.NumberFormat("es-AR", { style: "currency", currency: price.moneda }).format(price.importe)} por ${price.unidad}`; }
  catch { return "Consultar presupuesto"; }
}

export function directoryCapacity(space = {}) {
  const min = Number.isFinite(space.capacidadMinima) && space.capacidadMinima > 0 ? space.capacidadMinima : null;
  const max = Number.isFinite(space.capacidadMaxima) && space.capacidadMaxima > 0 ? space.capacidadMaxima : null;
  if (min && max) return min === max ? `${max} personas` : `${min}–${max} personas`;
  if (max) return `Hasta ${max} personas`;
  if (min) return `Desde ${min} personas`;
  return "Capacidad sin informar";
}

export function directoryContact(contact = {}, kind) {
  if (kind === "whatsapp") {
    const phone = String(contact.whatsapp || "").trim();
    if (!/^\+?[\d\s().-]+$/.test(phone)) return null;
    const digits = phone.replace(/\D/g, "");
    return /^\d{7,15}$/.test(digits) ? `https://wa.me/${digits}` : null;
  }
  const email = String(contact.email || "").trim();
  return kind === "email" && /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(email)
    ? `mailto:${encodeURIComponent(email)}` : null;
}

export function directoryWebUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

export function directoryPriceDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("es-AR").format(date) : null;
}

export function directoryErrorState(error) {
  const code = String(error?.code || "").replace(/^functions\//, "");
  if (["permission-denied", "unauthenticated"].includes(code)) return { status: "forbidden", message: "Tu cuenta no tiene acceso a este directorio privado." };
  if (code === "not-found") return { status: "unavailable", message: "Esta ficha no está disponible en el directorio privado." };
  if (code === "invalid-argument") return { status: "invalid", message: "La búsqueda o ficha solicitada no es válida. Revisá los datos o volvé al listado." };
  if (code === "failed-precondition") return { status: "closed", message: "El directorio privado está cerrado en este momento." };
  if (code === "resource-exhausted") return { status: "limit", message: "El directorio alcanzó el límite de la beta. Administración debe revisar el catálogo para continuar." };
  return { status: "error", message: "No pudimos cargar el directorio. Volvé a intentar." };
}

export function directoryCanFilter(state) {
  return Boolean(state.catalog && ["ready", "error", "limit", "invalid"].includes(state.status));
}
