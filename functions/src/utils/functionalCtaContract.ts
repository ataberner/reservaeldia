import { normalizeGiftConfig, type GiftsConfig } from "../gifts/config";
import { normalizeRsvpConfig, type RSVPConfig } from "../rsvp/config";

export type FunctionalCtaObjectType = "rsvp-boton" | "regalo-boton";

export type FunctionalCtaReason =
  | "no-button"
  | "ready"
  | "missing-root"
  | "disabled"
  | "no-usable-methods";

type FunctionalCtaBase<TConfig> = {
  buttonPresent: boolean;
  rootPresent: boolean;
  enabled: boolean | null;
  ready: boolean;
  unavailable: boolean;
  reason: FunctionalCtaReason;
  config: TConfig | null;
};

export type ResolvedRsvpCtaContract = FunctionalCtaBase<RSVPConfig>;

export type ResolvedGiftCtaContract = FunctionalCtaBase<GiftsConfig> & {
  hasUsableMethods: boolean;
};

export type FunctionalCtaContract = {
  rsvp: ResolvedRsvpCtaContract;
  gifts: ResolvedGiftCtaContract;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeType(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function hasButtonOfTypeInEntry(
  entry: unknown,
  targetType: FunctionalCtaObjectType
): boolean {
  if (!isRecord(entry)) return false;

  if (normalizeType(entry.tipo) === targetType) {
    return true;
  }

  if (normalizeType(entry.tipo) !== "grupo" || !Array.isArray(entry.children)) {
    return false;
  }

  return entry.children.some((child) => hasButtonOfTypeInEntry(child, targetType));
}

function hasButtonOfType(
  objects: unknown[],
  targetType: FunctionalCtaObjectType
): boolean {
  return Array.isArray(objects)
    ? objects.some((entry) => hasButtonOfTypeInEntry(entry, targetType))
    : false;
}

function hasUsableGiftMethods(config: GiftsConfig): boolean {
  if (!config.enabled) return false;

  const hasVisibleBankField = Object.entries(config.bank).some(([fieldKey, value]) => {
    if (!config.visibility[fieldKey as keyof GiftsConfig["visibility"]]) return false;
    return String(value || "").trim().length > 0;
  });

  return hasVisibleBankField || Boolean(config.visibility.giftListLink && config.giftListUrl);
}

export function normalizeFunctionalCtaObjectType(
  value: unknown
): FunctionalCtaObjectType | null {
  const normalized = normalizeType(value);
  if (normalized === "rsvp-boton" || normalized === "regalo-boton") {
    return normalized;
  }
  return null;
}

export function resolveFunctionalCtaContract(params: {
  objetos?: unknown[] | null;
  rsvpConfig?: unknown;
  giftsConfig?: unknown;
}): FunctionalCtaContract {
  const objetos = Array.isArray(params.objetos) ? params.objetos : [];

  const rsvpButtonPresent = hasButtonOfType(objetos, "rsvp-boton");
  const rsvpRootPresent = isRecord(params.rsvpConfig);
  const rsvpConfig = rsvpRootPresent ? normalizeRsvpConfig(params.rsvpConfig) : null;
  const rsvpEnabled = rsvpConfig ? rsvpConfig.enabled === true : null;

  const giftButtonPresent = hasButtonOfType(objetos, "regalo-boton");
  const giftRootPresent = isRecord(params.giftsConfig);
  const giftConfig = giftRootPresent ? normalizeGiftConfig(params.giftsConfig) : null;
  const giftEnabled = giftConfig ? giftConfig.enabled === true : null;
  const giftHasUsableMethods = giftConfig ? hasUsableGiftMethods(giftConfig) : false;

  const rsvp: ResolvedRsvpCtaContract = !rsvpButtonPresent
    ? {
        buttonPresent: false,
        rootPresent: rsvpRootPresent,
        enabled: rsvpEnabled,
        ready: false,
        unavailable: false,
        reason: "no-button",
        config: rsvpConfig,
      }
    : !rsvpRootPresent
      ? {
          buttonPresent: true,
          rootPresent: false,
          enabled: null,
          ready: false,
          unavailable: true,
          reason: "missing-root",
          config: null,
        }
      : rsvpEnabled !== true
        ? {
            buttonPresent: true,
            rootPresent: true,
            enabled: false,
            ready: false,
            unavailable: true,
            reason: "disabled",
            config: rsvpConfig,
          }
        : {
            buttonPresent: true,
            rootPresent: true,
            enabled: true,
            ready: true,
            unavailable: false,
            reason: "ready",
            config: rsvpConfig,
          };

  const gifts: ResolvedGiftCtaContract = !giftButtonPresent
    ? {
        buttonPresent: false,
        rootPresent: giftRootPresent,
        enabled: giftEnabled,
        ready: false,
        unavailable: false,
        reason: "no-button",
        config: giftConfig,
        hasUsableMethods: giftHasUsableMethods,
      }
    : !giftRootPresent
      ? {
          buttonPresent: true,
          rootPresent: false,
          enabled: null,
          ready: false,
          unavailable: true,
          reason: "missing-root",
          config: null,
          hasUsableMethods: false,
        }
      : giftEnabled !== true
        ? {
            buttonPresent: true,
            rootPresent: true,
            enabled: false,
            ready: false,
            unavailable: true,
            reason: "disabled",
            config: giftConfig,
            hasUsableMethods: false,
          }
        : !giftHasUsableMethods
          ? {
              buttonPresent: true,
              rootPresent: true,
              enabled: true,
              ready: false,
              unavailable: true,
              reason: "no-usable-methods",
              config: giftConfig,
              hasUsableMethods: false,
            }
          : {
              buttonPresent: true,
              rootPresent: true,
              enabled: true,
              ready: true,
              unavailable: false,
              reason: "ready",
              config: giftConfig,
              hasUsableMethods: true,
            };

  return {
    rsvp,
    gifts,
  };
}

export function getFunctionalCtaContractForObjectType(
  value: unknown,
  contract: FunctionalCtaContract | null | undefined
): ResolvedRsvpCtaContract | ResolvedGiftCtaContract | null {
  const objectType = normalizeFunctionalCtaObjectType(value);
  if (!objectType || !contract) return null;
  return objectType === "rsvp-boton" ? contract.rsvp : contract.gifts;
}
