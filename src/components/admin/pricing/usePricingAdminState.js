import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildPricingPendingChange,
  createPricingFormState,
  normalizePricingConfig,
  normalizePricingHistoryItem,
} from "@/domain/siteSettings/pricingModel";
import {
  getPublicationPricing,
  listPublicationPricingHistory,
  updatePublicationPricing,
} from "@/domain/siteSettings/service";

const HISTORY_PAGE_SIZE = 20;

function getErrorMessage(error, fallback) {
  const message =
    error?.message ||
    error?.details?.message ||
    error?.details ||
    fallback;

  return typeof message === "string" ? message : fallback;
}

function isHistoryUnavailableError(error) {
  const code = String(error?.code || "").trim().toLowerCase();
  const message = String(error?.message || "").trim().toLowerCase();

  return (
    code.includes("unimplemented") ||
    code.includes("not-found") ||
    message.includes("unimplemented") ||
    message.includes("not-found")
  );
}

function normalizeHistoryState(result) {
  return {
    items: (Array.isArray(result?.items) ? result.items : []).map((item) =>
      normalizePricingHistoryItem(item)
    ),
    nextCursorVersion: result?.nextCursorVersion ?? null,
    unavailable: false,
    error: "",
  };
}

export default function usePricingAdminState() {
  const mountedRef = useRef(true);
  const configRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [config, setConfig] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [nextCursorVersion, setNextCursorVersion] = useState(null);
  const [form, setForm] = useState(() => createPricingFormState(null));
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const applyHistoryState = useCallback((state) => {
    setHistoryItems(state.items);
    setNextCursorVersion(state.nextCursorVersion);
    setHistoryUnavailable(state.unavailable === true);
    setHistoryError(state.error || "");
  }, []);

  const fetchPricingSnapshot = useCallback(async () => {
    const configResult = await getPublicationPricing();
    const normalizedConfig = normalizePricingConfig(configResult);

    try {
      const historyResult = await listPublicationPricingHistory({
        limit: HISTORY_PAGE_SIZE,
      });

      return {
        config: normalizedConfig,
        history: normalizeHistoryState(historyResult),
      };
    } catch (historyLoadError) {
      if (isHistoryUnavailableError(historyLoadError)) {
        return {
          config: normalizedConfig,
          history: {
            items: [],
            nextCursorVersion: null,
            unavailable: true,
            error: "",
          },
        };
      }

      return {
        config: normalizedConfig,
        history: {
          items: [],
          nextCursorVersion: null,
          unavailable: false,
          error: getErrorMessage(
            historyLoadError,
            "No se pudo cargar el historial de precios."
          ),
        },
      };
    }
  }, []);

  const reload = useCallback(
    async ({ showLoader = false, preserveMessages = false } = {}) => {
      if (showLoader) {
        setLoading(true);
      }
      if (!preserveMessages) {
        setError("");
        setSuccess("");
      }

      try {
        const snapshot = await fetchPricingSnapshot();
        if (!mountedRef.current) return;

        setConfig(snapshot.config);
        setForm(createPricingFormState(snapshot.config));
        applyHistoryState(snapshot.history);
      } catch (loadError) {
        if (!mountedRef.current) return;
        if (!configRef.current) {
          setConfig(null);
          applyHistoryState({
            items: [],
            nextCursorVersion: null,
            unavailable: false,
            error: "",
          });
        }
        setError(
          getErrorMessage(
            loadError,
            "No se pudo cargar la configuracion de precios."
          )
        );
      } finally {
        if (showLoader && mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [applyHistoryState, fetchPricingSnapshot]
  );

  useEffect(() => {
    mountedRef.current = true;
    void reload({ showLoader: true });

    return () => {
      mountedRef.current = false;
    };
  }, [reload]);

  const pendingChange = useMemo(
    () => buildPricingPendingChange(config, form),
    [config, form]
  );
  const initialForm = useMemo(() => createPricingFormState(config), [config]);
  const isDirty =
    form.publishPrice !== initialForm.publishPrice ||
    form.updatePrice !== initialForm.updatePrice ||
    form.currency !== initialForm.currency ||
    form.changeReason !== initialForm.changeReason;

  const canSave = Boolean(
    pendingChange && pendingChange.hasChanges && pendingChange.errors.length === 0
  );

  const setField = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
    setError("");
    setSuccess("");
  };

  const resetForm = () => {
    setForm(createPricingFormState(config));
    setError("");
    setSuccess("");
  };

  const openConfirm = () => {
    if (!pendingChange) return;
    if (pendingChange.errors.length > 0) {
      setError(pendingChange.errors[0]);
      return;
    }
    if (!pendingChange.hasChanges) {
      setError("Debes modificar al menos uno de los precios antes de guardar.");
      return;
    }
    setConfirmOpen(true);
    setError("");
  };

  const closeConfirm = () => {
    if (saving) return;
    setConfirmOpen(false);
  };

  const saveChanges = async () => {
    if (!config || !pendingChange || !canSave) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await updatePublicationPricing({
        publishPrice: pendingChange.newPublishPrice,
        updatePrice: pendingChange.newUpdatePrice,
        currency: pendingChange.newCurrency,
        expectedVersion: config.version,
        reason: pendingChange.reason,
      });

      await reload({ preserveMessages: true });
      if (!mountedRef.current) return;

      setConfirmOpen(false);
      setSuccess("Los precios se actualizaron correctamente.");
    } catch (saveError) {
      if (!mountedRef.current) return;
      setError(
        getErrorMessage(saveError, "No se pudo guardar la configuracion de precios.")
      );
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  };

  const loadMoreHistory = async () => {
    if (!nextCursorVersion || loadingMoreHistory || historyUnavailable) return;

    setLoadingMoreHistory(true);
    setHistoryError("");

    try {
      const result = await listPublicationPricingHistory({
        limit: HISTORY_PAGE_SIZE,
        cursorVersion: nextCursorVersion,
      });
      if (!mountedRef.current) return;

      const nextItems = (Array.isArray(result?.items) ? result.items : []).map((item) =>
        normalizePricingHistoryItem(item)
      );

      setHistoryItems((previous) => [...previous, ...nextItems]);
      setNextCursorVersion(result?.nextCursorVersion ?? null);
    } catch (loadError) {
      if (!mountedRef.current) return;
      setHistoryError(
        getErrorMessage(loadError, "No se pudo cargar mas historial de precios.")
      );
    } finally {
      if (mountedRef.current) {
        setLoadingMoreHistory(false);
      }
    }
  };

  return {
    loading,
    loadingMoreHistory,
    saving,
    error,
    success,
    historyError,
    historyUnavailable,
    config,
    form,
    historyItems,
    hasMoreHistory: Boolean(nextCursorVersion) && !historyUnavailable,
    confirmOpen,
    pendingChange,
    canSave,
    isDirty,
    validationMessage:
      pendingChange?.errors?.[0] ||
      (isDirty && !pendingChange?.hasChanges
        ? "Debes modificar al menos uno de los precios antes de guardar."
        : ""),
    setField,
    resetForm,
    reload,
    openConfirm,
    closeConfirm,
    saveChanges,
    loadMoreHistory,
  };
}
