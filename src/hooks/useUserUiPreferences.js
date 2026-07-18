import { useCallback, useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions as cloudFunctions } from "@/firebase";

export const DEFAULT_USER_UI_PREFERENCES = Object.freeze({
  assistantTourOptOut: false,
});

function normalizeUserUiPreferences(raw) {
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw.uiPreferences && typeof raw.uiPreferences === "object"
        ? raw.uiPreferences
        : raw
      : {};

  return {
    assistantTourOptOut: source?.assistantTourOptOut === true,
  };
}

export function useUserUiPreferences(userUid) {
  const [preferences, setPreferences] = useState(DEFAULT_USER_UI_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const getMyUiPreferencesCallable = useMemo(
    () => httpsCallable(cloudFunctions, "getMyUiPreferences"),
    []
  );
  const updateMyUiPreferencesCallable = useMemo(
    () => httpsCallable(cloudFunctions, "updateMyUiPreferences"),
    []
  );

  useEffect(() => {
    let mounted = true;

    if (!userUid) {
      setPreferences(DEFAULT_USER_UI_PREFERENCES);
      setLoaded(true);
      setError(null);
      return () => {
        mounted = false;
      };
    }

    setLoaded(false);
    setError(null);

    void (async () => {
      try {
        const result = await getMyUiPreferencesCallable({});
        if (!mounted) return;
        setPreferences(normalizeUserUiPreferences(result?.data));
      } catch (loadError) {
        console.error("Error cargando preferencias de interfaz:", loadError);
        if (!mounted) return;
        setPreferences(DEFAULT_USER_UI_PREFERENCES);
        setError(loadError);
      } finally {
        if (mounted) {
          setLoaded(true);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getMyUiPreferencesCallable, userUid]);

  const updatePreferences = useCallback(
    async (patch) => {
      const normalizedPatch = normalizeUserUiPreferences(patch);
      setSaving(true);
      setError(null);

      const previousPreferences = preferences;
      const nextPreferences = {
        ...preferences,
        ...normalizedPatch,
      };
      setPreferences(nextPreferences);

      try {
        const result = await updateMyUiPreferencesCallable(normalizedPatch);
        const savedPreferences = normalizeUserUiPreferences(result?.data);
        setPreferences(savedPreferences);
        return savedPreferences;
      } catch (updateError) {
        console.error("Error guardando preferencias de interfaz:", updateError);
        setPreferences(previousPreferences);
        setError(updateError);
        throw updateError;
      } finally {
        setSaving(false);
      }
    },
    [preferences, updateMyUiPreferencesCallable]
  );

  return {
    preferences,
    loaded,
    saving,
    error,
    updatePreferences,
  };
}

export default useUserUiPreferences;
