export const INVITATION_TYPES = Object.freeze([
  "boda",
  "quince",
  "cumple",
  "empresarial",
  "general",
]);

const ALIASES = new Map([
  ["boda", "boda"],
  ["wedding", "boda"],
  ["xv", "quince"],
  ["xv-anos", "quince"],
  ["quince", "quince"],
  ["quinceanera", "quince"],
  ["cumple", "cumple"],
  ["cumpleanos", "cumple"],
  ["cumpleano", "cumple"],
  ["birthday", "cumple"],
  ["empresarial", "empresarial"],
  ["corporativo", "empresarial"],
  ["empresa", "empresarial"],
  ["general", "general"],
]);

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeInvitationType(value) {
  const token = normalizeToken(value);
  if (!token) return "general";
  return ALIASES.get(token) || "general";
}

export function buildInvitationTypeLabel(value) {
  const normalized = normalizeInvitationType(value);
  if (normalized === "boda") return "Boda";
  if (normalized === "quince") return "XV";
  if (normalized === "cumple") return "Cumple";
  if (normalized === "empresarial") return "Empresarial";
  return "General";
}
