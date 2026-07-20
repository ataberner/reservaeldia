export type UserUiPreferencesWritePatch = {
  assistantTourOptOut?: boolean;
};

type BuildUserUiPreferencesMergePayloadOptions = {
  patch: UserUiPreferencesWritePatch;
  updatedAtValue: unknown;
};

export function buildUserUiPreferencesMergePayload({
  patch,
  updatedAtValue,
}: BuildUserUiPreferencesMergePayloadOptions): Record<string, unknown> {
  const uiPreferences: Record<string, unknown> = {
    updatedAt: updatedAtValue,
  };

  if (patch.assistantTourOptOut !== undefined) {
    uiPreferences.assistantTourOptOut = patch.assistantTourOptOut;
  }

  return {
    updatedAt: updatedAtValue,
    uiPreferences,
  };
}
