import { resolveCountdownFeatureFlags } from "../../shared/countdownPhase0Contract.js";

const countdownFeatureFlagEnvironment = {
  NEXT_PUBLIC_COUNTDOWN_NEW_RENDERER_ENABLED:
    process.env.NEXT_PUBLIC_COUNTDOWN_NEW_RENDERER_ENABLED,
  NEXT_PUBLIC_COUNTDOWN_NEW_LIFECYCLE_ENABLED:
    process.env.NEXT_PUBLIC_COUNTDOWN_NEW_LIFECYCLE_ENABLED,
  NEXT_PUBLIC_COUNTDOWN_NEW_CATALOG_ENABLED:
    process.env.NEXT_PUBLIC_COUNTDOWN_NEW_CATALOG_ENABLED,
  NEXT_PUBLIC_COUNTDOWN_NEW_TEMPORAL_SYSTEM_ENABLED:
    process.env.NEXT_PUBLIC_COUNTDOWN_NEW_TEMPORAL_SYSTEM_ENABLED,
};

export const countdownFeatureFlags = resolveCountdownFeatureFlags(
  countdownFeatureFlagEnvironment
);

export function getCountdownFeatureFlags() {
  return countdownFeatureFlags;
}
