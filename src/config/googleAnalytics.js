const GOOGLE_ANALYTICS_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

function normalizeMeasurementId(value) {
  return typeof value === "string" ? value.trim() : "";
}

export const googleAnalyticsMeasurementId = normalizeMeasurementId(
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
);

export const isGoogleAnalyticsEnabled =
  GOOGLE_ANALYTICS_MEASUREMENT_ID_PATTERN.test(googleAnalyticsMeasurementId);
