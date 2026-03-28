type UnknownRecord = Record<string, unknown>;

type ConfigSnapshotLike = {
  exists: boolean;
  data(): UnknownRecord | undefined;
};

export type PublicationCheckoutConfig = {
  enabled: boolean;
  slugReservationTtlMinutes: number;
  enforcePayment: boolean;
};

export const CHECKOUT_CONFIG_DOC_PATH = "app_config/publicationPayments";

export const DEFAULT_PAYMENT_CONFIG: PublicationCheckoutConfig = {
  enabled: true,
  slugReservationTtlMinutes: 20,
  enforcePayment: true,
};

export function getPublicationConfigFromData(
  data: UnknownRecord
): PublicationCheckoutConfig {
  const enabled =
    typeof data.enabled === "boolean"
      ? data.enabled
      : DEFAULT_PAYMENT_CONFIG.enabled;
  const slugReservationTtlMinutes = Number.isFinite(
    Number(data.slugReservationTtlMinutes)
  )
    ? Math.max(5, Math.round(Number(data.slugReservationTtlMinutes)))
    : DEFAULT_PAYMENT_CONFIG.slugReservationTtlMinutes;
  const enforcePayment =
    typeof data.enforcePayment === "boolean"
      ? data.enforcePayment
      : DEFAULT_PAYMENT_CONFIG.enforcePayment;

  return {
    enabled,
    slugReservationTtlMinutes,
    enforcePayment,
  };
}

export async function getPublicationPaymentConfig(params: {
  loadConfigDoc(): Promise<ConfigSnapshotLike>;
}): Promise<PublicationCheckoutConfig> {
  const snap = await params.loadConfigDoc();
  if (!snap.exists) {
    return DEFAULT_PAYMENT_CONFIG;
  }

  const data = (snap.data() || {}) as UnknownRecord;
  return getPublicationConfigFromData(data);
}
