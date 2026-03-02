export const INVITATION_TYPES = [
  "boda",
  "quince",
  "cumple",
  "empresarial",
  "general",
] as const;

export type InvitationType = (typeof INVITATION_TYPES)[number];

const ALIASES = new Map<string, InvitationType>([
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

function normalizeToken(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeInvitationType(value: unknown): InvitationType {
  const token = normalizeToken(value);
  if (!token) return "general";
  return ALIASES.get(token) || "general";
}

export function isInvitationType(value: unknown): value is InvitationType {
  return INVITATION_TYPES.includes(String(value || "") as InvitationType);
}
