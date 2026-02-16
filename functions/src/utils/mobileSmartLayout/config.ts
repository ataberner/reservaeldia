// functions/src/utils/mobileSmartLayout/config.ts
import { MobileSmartLayoutOptions } from "./types";

export type NormalizedConfig = Required<Omit<MobileSmartLayoutOptions, "enabled">> & {
  enabled: boolean;
};

export function normalizeConfig(opts: MobileSmartLayoutOptions): NormalizedConfig {
  const fitMinScaleRaw = Number.isFinite(opts.fitMinScale) ? Number(opts.fitMinScale) : 0.88;
  const fitMaxScaleRaw = Number.isFinite(opts.fitMaxScale) ? Number(opts.fitMaxScale) : 1.16;
  const fitMinScale = Math.max(0.7, Math.min(1, fitMinScaleRaw));
  const fitMaxScale = Math.max(1, fitMaxScaleRaw);
  const fitTargetWidthRatioRaw = Number.isFinite(opts.fitTargetWidthRatio)
    ? Number(opts.fitTargetWidthRatio)
    : 0.94;
  const fitTargetWidthRatio = Math.max(0.75, Math.min(0.99, fitTargetWidthRatioRaw));
  const fitMinFillRatioRaw = Number.isFinite(opts.fitMinFillRatio)
    ? Number(opts.fitMinFillRatio)
    : 0.9;
  const fitMinFillRatio = Math.max(0.6, Math.min(fitTargetWidthRatio, fitMinFillRatioRaw));

  return {
    enabled: !!opts.enabled,

    minGapPx: Number.isFinite(opts.minGapPx) ? Number(opts.minGapPx) : 8,
    paddingTopPx: Number.isFinite(opts.paddingTopPx) ? Number(opts.paddingTopPx) : 0,
    paddingBottomPx: Number.isFinite(opts.paddingBottomPx) ? Number(opts.paddingBottomPx) : 12,
    maxGapPx: Number.isFinite(opts.maxGapPx) ? Number(opts.maxGapPx) : 22,

    onlyFixedSections: opts.onlyFixedSections !== false,
    onlyWhenReordered: opts.onlyWhenReordered !== false,

    rowTolPx: Number.isFinite(opts.rowTolPx) ? Number(opts.rowTolPx) : 28,

    twoColSpreadRatio: Number.isFinite(opts.twoColSpreadRatio) ? Number(opts.twoColSpreadRatio) : 0.18,
    minPerColumn2: Number.isFinite(opts.minPerColumn2) ? Number(opts.minPerColumn2) : 2,

    threeColSpreadRatio: Number.isFinite(opts.threeColSpreadRatio) ? Number(opts.threeColSpreadRatio) : 0.22,
    minPerColumn3: Number.isFinite(opts.minPerColumn3) ? Number(opts.minPerColumn3) : 2,

    gapScale: Number.isFinite(opts.gapScale) ? Number(opts.gapScale) : 0.6,
    fitMinScale,
    fitMaxScale,
    fitTargetWidthRatio,
    fitMinFillRatio,
  };
}
