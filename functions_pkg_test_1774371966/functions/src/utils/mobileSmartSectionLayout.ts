// functions/src/utils/mobileSmartSectionLayout.ts
import { MobileSmartLayoutOptions } from "./mobileSmartLayout";
import { normalizeConfig, buildScript } from "./mobileSmartLayout";

export function buildMobileSmartSectionLayoutScript(opts: MobileSmartLayoutOptions): string {
  const cfg = normalizeConfig(opts);
  return buildScript(cfg);
}
