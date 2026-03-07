import {
  getTextMetrics as getTextMetricsShared,
  getNormalizedTextMetrics as getNormalizedTextMetricsShared,
  getCenteredTextPosition as getCenteredTextPositionShared,
} from "@/components/editor/textSystem/metricsLayout/services/textCenteringService";

export function getTextMetrics(config) {
  return getTextMetricsShared(config);
}

export function getNormalizedTextMetrics(config) {
  return getNormalizedTextMetricsShared(config);
}

export function getCenteredTextPosition(config) {
  return getCenteredTextPositionShared(config);
}
