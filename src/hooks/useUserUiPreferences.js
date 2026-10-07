import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions as cloudFunctions } from "@/firebase";
import { createDashboardAuthRecovery } from "@/lib/auth/dashboardAuthRecovery";
import { isTransientDashboardReadError } from "@/domain/dashboard/readRecovery";

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

export function useUserUiPreferences(userUid, startupRecoveryGeneration = 0) {
  const currentUidRef = useRef(userUid);
  currentUidRef.current = userUid;
  const requestRef = useRef(0);
  const recoveryRef = useRef(null);
  const [preferences, setPreferences] = useState(DEFAULT_USER_UI_PREFERENCES);
  const [preferencesUid, setPreferencesUid] = useState(null);
  const [loadedGeneration, setLoadedGeneration] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [recoveryState, setRecoveryState] = useState("idle");

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
    const request = ++requestRef.current;
    const isCurrent = () => mounted && requestRef.current === request &&
      currentUidRef.current === userUid;
    setSaving(false);
    setRecoveryState("idle");

    if (!userUid) {
      setPreferences(DEFAULT_USER_UI_PREFERENCES);
      setPreferencesUid(userUid);
      setLoaded(true);
      setLoadedGeneration(startupRecoveryGeneration);
      setError(null);
      return () => {
        mounted = false;
        requestRef.current += 1;
      };
    }

    setLoaded(false);
    setError(null);

    void (async () => {
      try {
        const recovery = createDashboardAuthRecovery({
          task: () => getMyUiPreferencesCallable({}),
          shouldRetry: isTransientDashboardReadError,
          isCurrent,
          onStateChange: setRecoveryState,
        });
        recoveryRef.current = recovery;
        const outcome = await recovery.promise;
        if (!isCurrent() || outcome.status !== "success") return;
        const result = outcome.value;
        setPreferences(normalizeUserUiPreferences(result?.data));
        setPreferencesUid(userUid);
      } catch (loadError) {
        if (!isCurrent()) return;
        console.error("Error cargando preferencias de interfaz:", loadError);
        setPreferences(DEFAULT_USER_UI_PREFERENCES);
        setPreferencesUid(userUid);
        setError(loadError);
      } finally {
        if (isCurrent()) {
          setLoaded(true);
          setLoadedGeneration(startupRecoveryGeneration);
          setRecoveryState("idle");
        }
      }
    })();

    return () => {
      mounted = false;
      requestRef.current += 1;
      recoveryRef.current?.cancel();
    };
  }, [getMyUiPreferencesCallable, userUid, startupRecoveryGeneration]);

  const updatePreferences = useCallback(
    async (patch) => {
      recoveryRef.current?.cancel();
      const request = ++requestRef.current;
      const isCurrent = () => requestRef.current === request &&
        currentUidRef.current === userUid;
      const normalizedPatch = normalizeUserUiPreferences(patch);
      setSaving(true);
      setError(null);

      try {
        const result = await updateMyUiPreferencesCallable(normalizedPatch);
        const savedPreferences = normalizeUserUiPreferences(result?.data);
        if (isCurrent()) {
          setPreferences(savedPreferences);
          setPreferencesUid(userUid);
          setLoaded(true);
          setLoadedGeneration(startupRecoveryGeneration);
        }
        return savedPreferences;
      } catch (updateError) {
        console.error("Error guardando preferencias de interfaz:", updateError);
        if (isCurrent()) setError(updateError);
        throw updateError;
      } finally {
        if (isCurrent()) {
          setSaving(false);
          setRecoveryState("idle");
        }
      }
    },
    [updateMyUiPreferencesCallable, userUid, startupRecoveryGeneration]
  );

  return {
    preferences: preferencesUid === userUid ? preferences : DEFAULT_USER_UI_PREFERENCES,
    loaded: preferencesUid === userUid && loaded &&
      loadedGeneration === startupRecoveryGeneration,
    saving,
    error,
    recoveryState,
    updatePreferences,
  };
}

export default useUserUiPreferences;
