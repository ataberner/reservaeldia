import { useMemo } from "react";
import { buildDashboardHomeSections } from "@/domain/dashboard/homeModel";

export function useDashboardHomeSections({
  drafts,
  publications,
  templates,
  config,
}) {
  return useMemo(
    () =>
      buildDashboardHomeSections({
        drafts,
        publications,
        templates,
        config,
      }),
    [config, drafts, publications, templates]
  );
}
