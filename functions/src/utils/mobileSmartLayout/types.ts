// functions/src/utils/mobileSmartLayout/types.ts
export type MobileSmartLayoutOptions = {
  enabled: boolean;

  minGapPx?: number;
  paddingTopPx?: number;
  paddingBottomPx?: number;
  maxGapPx?: number;

  onlyFixedSections?: boolean;
  onlyWhenReordered?: boolean;

  rowTolPx?: number;

  twoColSpreadRatio?: number;
  minPerColumn2?: number;

  threeColSpreadRatio?: number;
  minPerColumn3?: number;

  gapScale?: number;
};
