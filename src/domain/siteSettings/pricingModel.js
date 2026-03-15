function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCurrency(value) {
  return normalizeText(value).toUpperCase() === "ARS" ? "ARS" : "ARS";
}

function toNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed);
}

function toNullableNonNegativeInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

export function normalizePricingConfig(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    publishPrice: toNonNegativeInteger(source.publishPrice, 0),
    updatePrice: toNonNegativeInteger(source.updatePrice, 0),
    currency: normalizeCurrency(source.currency),
    updatedAt: normalizeText(source.updatedAt) || null,
    updatedByUid: normalizeText(source.updatedByUid) || "",
    updatedByEmail: normalizeText(source.updatedByEmail) || "",
    version: Number.isFinite(Number(source.version))
      ? Math.max(0, Math.round(Number(source.version)))
      : 0,
    lastChangeReason: normalizeText(source.lastChangeReason) || null,
  };
}

export function normalizePricingHistoryItem(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    version: Number.isFinite(Number(source.version))
      ? Math.max(0, Math.round(Number(source.version)))
      : 0,
    previousPublishPrice: toNullableNonNegativeInteger(source.previousPublishPrice),
    previousUpdatePrice: toNullableNonNegativeInteger(source.previousUpdatePrice),
    newPublishPrice: toNonNegativeInteger(source.newPublishPrice, 0),
    newUpdatePrice: toNonNegativeInteger(source.newUpdatePrice, 0),
    changedAt: normalizeText(source.changedAt) || null,
    changedByUid: normalizeText(source.changedByUid) || "",
    changedByEmail: normalizeText(source.changedByEmail) || "",
    reason: normalizeText(source.reason) || null,
  };
}

export function createPricingFormState(config) {
  if (!config || typeof config !== "object") {
    return {
      publishPrice: "",
      updatePrice: "",
      currency: "ARS",
      changeReason: "",
    };
  }

  const normalized = normalizePricingConfig(config);
  return {
    publishPrice: String(normalized.publishPrice),
    updatePrice: String(normalized.updatePrice),
    currency: normalized.currency,
    changeReason: "",
  };
}

export function parsePricingAmountInput(value, label) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return {
      value: null,
      error: `Ingresa el precio de ${label}.`,
    };
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    return {
      value: null,
      error: `El precio de ${label} debe ser un entero mayor o igual a 0.`,
    };
  }

  return {
    value: parsed,
    error: "",
  };
}

export function parsePricingCurrencyInput(value) {
  const normalized = normalizeText(value).toUpperCase();
  if (!normalized) {
    return {
      value: "",
      error: "Selecciona una moneda.",
    };
  }

  if (normalized !== "ARS") {
    return {
      value: normalized,
      error: "Por ahora solo se admite ARS.",
    };
  }

  return {
    value: "ARS",
    error: "",
  };
}

export function normalizePricingReason(value) {
  return normalizeText(value).slice(0, 500);
}

export function buildPricingPendingChange(config, form) {
  if (!config || typeof config !== "object") return null;

  const normalizedConfig = normalizePricingConfig(config);
  const publishInput = parsePricingAmountInput(form?.publishPrice, "publicacion");
  const updateInput = parsePricingAmountInput(form?.updatePrice, "actualizacion");
  const currencyInput = parsePricingCurrencyInput(form?.currency);
  const reason = normalizePricingReason(form?.changeReason);
  const errors = [
    publishInput.error,
    updateInput.error,
    currencyInput.error,
    !reason ? "Ingresa el motivo del cambio." : "",
  ].filter(Boolean);

  const hasPriceChanges =
    publishInput.value !== null &&
    updateInput.value !== null &&
    (publishInput.value !== normalizedConfig.publishPrice ||
      updateInput.value !== normalizedConfig.updatePrice);
  const hasCurrencyChanges =
    currencyInput.value && currencyInput.value !== normalizedConfig.currency;

  return {
    previousPublishPrice: normalizedConfig.publishPrice,
    previousUpdatePrice: normalizedConfig.updatePrice,
    previousCurrency: normalizedConfig.currency,
    newPublishPrice: publishInput.value,
    newUpdatePrice: updateInput.value,
    newCurrency: currencyInput.value || normalizedConfig.currency,
    reason,
    errors,
    hasChanges: Boolean(hasPriceChanges || hasCurrencyChanges),
  };
}

export function formatPricingAmount(value, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: normalizeCurrency(currency),
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function formatPricingPreview(value, currency = "ARS") {
  const raw = String(value ?? "").trim();
  if (!raw) return "Ingresa un monto para ver la vista previa";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    return "Monto invalido";
  }
  return formatPricingAmount(parsed, currency);
}

export function formatPricingDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-AR");
}
