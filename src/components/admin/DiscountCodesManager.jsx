import { useCallback, useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";

const INITIAL_FORM = {
  code: "",
  active: true,
  type: "percentage",
  value: "10",
  appliesTo: "both",
  description: "",
  startsAt: "",
  endsAt: "",
  maxRedemptions: "",
};

function getErrorMessage(error, fallback) {
  const message =
    error?.message ||
    error?.details?.message ||
    error?.details ||
    fallback;

  return typeof message === "string" ? message : fallback;
}

function formatArs(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-AR");
}

function isoToLocalDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export default function DiscountCodesManager() {
  const listCodesCallable = useMemo(
    () => httpsCallable(functions, "listPublicationDiscountCodes"),
    []
  );
  const upsertCodeCallable = useMemo(
    () => httpsCallable(functions, "upsertPublicationDiscountCode"),
    []
  );
  const listUsageCallable = useMemo(
    () => httpsCallable(functions, "listPublicationDiscountCodeUsage"),
    []
  );

  const [form, setForm] = useState(INITIAL_FORM);
  const [codes, setCodes] = useState([]);
  const [summary, setSummary] = useState({
    totalCodes: 0,
    activeCodes: 0,
    totalRedemptions: 0,
  });
  const [selectedCode, setSelectedCode] = useState("");
  const [usage, setUsage] = useState({ code: "", totalUsed: 0, items: [] });

  const [loadingCodes, setLoadingCodes] = useState(false);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [saving, setSaving] = useState(false);

  const [listError, setListError] = useState("");
  const [usageError, setUsageError] = useState("");
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");

  const codesById = useMemo(() => {
    const map = new Map();
    codes.forEach((item) => {
      if (!item?.code) return;
      map.set(item.code, item);
    });
    return map;
  }, [codes]);

  const loadCodes = useCallback(async () => {
    setLoadingCodes(true);
    setListError("");

    try {
      const result = await listCodesCallable({});
      const data = result?.data || {};
      const items = Array.isArray(data.items) ? data.items : [];

      setCodes(items);
      setSummary({
        totalCodes: Number(data?.summary?.totalCodes || 0),
        activeCodes: Number(data?.summary?.activeCodes || 0),
        totalRedemptions: Number(data?.summary?.totalRedemptions || 0),
      });

      if (!selectedCode && items[0]?.code) {
        setSelectedCode(items[0].code);
      }
      if (selectedCode && !items.some((item) => item.code === selectedCode)) {
        setSelectedCode(items[0]?.code || "");
      }
    } catch (error) {
      setListError(getErrorMessage(error, "No se pudieron cargar los codigos."));
    } finally {
      setLoadingCodes(false);
    }
  }, [listCodesCallable, selectedCode]);

  const loadUsage = useCallback(
    async (code) => {
      if (!code) {
        setUsage({ code: "", totalUsed: 0, items: [] });
        return;
      }

      setLoadingUsage(true);
      setUsageError("");

      try {
        const result = await listUsageCallable({ code, limit: 80 });
        const data = result?.data || {};
        const totalUsed = Number(data.totalUsed || 0);
        setUsage({
          code,
          totalUsed,
          items: Array.isArray(data.items) ? data.items : [],
        });

        const previousCodeCount = Number(codesById.get(code)?.redemptionsCount || 0);
        if (previousCodeCount !== totalUsed) {
          setCodes((prev) =>
            prev.map((item) =>
              item.code === code ? { ...item, redemptionsCount: totalUsed } : item
            )
          );
          setSummary((prev) => ({
            ...prev,
            totalRedemptions: Math.max(
              0,
              Number(prev.totalRedemptions || 0) + (totalUsed - previousCodeCount)
            ),
          }));
        }
      } catch (error) {
        setUsageError(getErrorMessage(error, "No se pudo cargar el detalle de usos."));
      } finally {
        setLoadingUsage(false);
      }
    },
    [codesById, listUsageCallable]
  );

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  useEffect(() => {
    if (!selectedCode) return;
    loadUsage(selectedCode);
  }, [selectedCode, loadUsage]);

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setFormError("");
    setFormMessage("");
  };

  const loadFormFromCode = (item) => {
    if (!item?.code) return;
    setForm({
      code: String(item.code || ""),
      active: item.active !== false,
      type: item.type === "fixed" ? "fixed" : "percentage",
      value: String(item.value ?? ""),
      appliesTo: item.appliesTo || "both",
      description: String(item.description || ""),
      startsAt: isoToLocalDateTimeInput(item.startsAt),
      endsAt: isoToLocalDateTimeInput(item.endsAt),
      maxRedemptions:
        typeof item.maxRedemptions === "number" ? String(item.maxRedemptions) : "",
    });
    setSelectedCode(item.code);
    setFormMessage("");
    setFormError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");
    setFormMessage("");

    const code = String(form.code || "").trim().toUpperCase();
    if (!code) {
      setFormError("Ingresa un codigo.");
      return;
    }

    const value = Number(form.value);
    if (!Number.isFinite(value) || value <= 0) {
      setFormError("Ingresa un valor de descuento valido.");
      return;
    }

    if (form.type === "percentage" && value > 100) {
      setFormError("El descuento porcentual no puede superar 100.");
      return;
    }

    const maxRedemptionsValue = String(form.maxRedemptions || "").trim();
    const maxRedemptions =
      maxRedemptionsValue === "" ? null : Number(maxRedemptionsValue);

    if (
      maxRedemptions !== null &&
      (!Number.isFinite(maxRedemptions) || maxRedemptions < 0)
    ) {
      setFormError("El maximo de usos debe ser un numero mayor o igual a 0.");
      return;
    }

    setSaving(true);
    try {
      await upsertCodeCallable({
        code,
        active: Boolean(form.active),
        type: form.type === "fixed" ? "fixed" : "percentage",
        value: Math.round(value),
        appliesTo:
          form.appliesTo === "new" || form.appliesTo === "update"
            ? form.appliesTo
            : "both",
        description: String(form.description || "").trim() || null,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        maxRedemptions:
          maxRedemptions === null ? null : Math.round(Number(maxRedemptions)),
      });

      setFormMessage("Codigo guardado correctamente.");
      await loadCodes();
      setSelectedCode(code);
      await loadUsage(code);
    } catch (error) {
      setFormError(getErrorMessage(error, "No se pudo guardar el codigo."));
    } finally {
      setSaving(false);
    }
  };

  const selectedCodeItem = selectedCode ? codesById.get(selectedCode) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800">
          Resumen de codigos de descuento
        </h3>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Total codigos</p>
            <p className="mt-1 text-xl font-semibold text-gray-800">
              {summary.totalCodes}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Codigos activos</p>
            <p className="mt-1 text-xl font-semibold text-gray-800">
              {summary.activeCodes}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Usos totales</p>
            <p className="mt-1 text-xl font-semibold text-gray-800">
              {summary.totalRedemptions}
            </p>
          </div>
        </div>

        {listError && <p className="mt-3 text-sm text-red-600">{listError}</p>}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-800">
            Crear o editar codigo
          </h3>
          <button
            type="button"
            onClick={resetForm}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Nuevo
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Codigo
            </label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setField("code", e.target.value.toUpperCase())}
              placeholder="EJ: BODA10"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Aplica a
            </label>
            <select
              value={form.appliesTo}
              onChange={(e) => setField("appliesTo", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
            >
              <option value="both">Publicacion nueva y actualizacion</option>
              <option value="new">Solo publicacion nueva</option>
              <option value="update">Solo actualizacion</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Tipo de descuento
            </label>
            <select
              value={form.type}
              onChange={(e) => setField("type", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
            >
              <option value="percentage">Porcentaje</option>
              <option value="fixed">Monto fijo (ARS)</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Valor
            </label>
            <input
              type="number"
              min="1"
              max={form.type === "percentage" ? "100" : undefined}
              value={form.value}
              onChange={(e) => setField("value", e.target.value)}
              placeholder={form.type === "percentage" ? "10" : "2500"}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Maximo de usos
            </label>
            <input
              type="number"
              min="0"
              value={form.maxRedemptions}
              onChange={(e) => setField("maxRedemptions", e.target.value)}
              placeholder="Sin limite"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-6">
            <input
              id="discount-active"
              type="checkbox"
              checked={Boolean(form.active)}
              onChange={(e) => setField("active", e.target.checked)}
            />
            <label htmlFor="discount-active" className="text-sm text-gray-700">
              Codigo activo
            </label>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Vigencia desde
            </label>
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setField("startsAt", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Vigencia hasta
            </label>
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => setField("endsAt", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Descripcion
            </label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="Promo temporada, convenio, etc."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar codigo"}
            </button>
          </div>
        </form>

        {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
        {formMessage && <p className="mt-3 text-sm text-emerald-700">{formMessage}</p>}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800">Listado de codigos</h3>
        {loadingCodes ? (
          <p className="mt-3 text-sm text-gray-500">Cargando codigos...</p>
        ) : codes.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">Todavia no hay codigos creados.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Codigo</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Descuento</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Aplica</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Usos</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Estado</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {codes.map((item) => (
                  <tr key={item.code}>
                    <td className="px-3 py-2 font-medium text-gray-800">{item.code}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {item.type === "percentage"
                        ? `${item.value}%`
                        : formatArs(item.value)}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {item.appliesTo === "both"
                        ? "Nueva + actualizacion"
                        : item.appliesTo === "new"
                        ? "Solo nueva"
                        : "Solo actualizacion"}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {item.redemptionsCount}
                      {typeof item.maxRedemptions === "number" ? ` / ${item.maxRedemptions}` : ""}
                    </td>
                    <td className="px-3 py-2">
                      {item.active ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          Activo
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => loadFormFromCode(item)}
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedCode(item.code)}
                          className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                            selectedCode === item.code
                              ? "bg-purple-100 text-purple-700"
                              : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          Ver detalle
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800">
          Detalle de usos {selectedCodeItem ? `(${selectedCodeItem.code})` : ""}
        </h3>

        {!selectedCode ? (
          <p className="mt-3 text-sm text-gray-500">
            Selecciona un codigo para ver el detalle de usos.
          </p>
        ) : (
          <>
            <p className="mt-2 text-xs text-gray-600">
              Total de usos registrados:{" "}
              <span className="font-semibold text-gray-800">{usage.totalUsed}</span>
            </p>

            {loadingUsage && (
              <p className="mt-3 text-sm text-gray-500">Cargando detalle de usos...</p>
            )}

            {usageError && <p className="mt-3 text-sm text-red-600">{usageError}</p>}

            {!loadingUsage && !usageError && usage.items.length === 0 && (
              <p className="mt-3 text-sm text-gray-500">
                Aun no hay usos registrados para este codigo.
              </p>
            )}

            {!loadingUsage && !usageError && usage.items.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Fecha</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Operacion</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Borrador</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Publica</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Descuento</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Total</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Pago</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {usage.items.map((item) => (
                      <tr key={item.sessionId}>
                        <td className="px-3 py-2 text-gray-700">
                          {formatDateTime(item.approvedAt || item.createdAt)}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {item.operation === "new" ? "Nueva" : "Actualizacion"}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{item.draftSlug || "-"}</td>
                        <td className="px-3 py-2 text-gray-700">{item.publicSlug || "-"}</td>
                        <td className="px-3 py-2 text-gray-700">
                          {formatArs(item.discountAmountArs)}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{formatArs(item.amountArs)}</td>
                        <td className="px-3 py-2 text-gray-700">{item.paymentId || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
