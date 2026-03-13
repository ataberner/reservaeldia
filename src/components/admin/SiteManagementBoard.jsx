import { useState } from "react";
import AdminUsersManager from "@/components/admin/AdminUsersManager";
import DiscountCodesManager from "@/components/admin/DiscountCodesManager";
import BusinessAnalyticsBoard from "@/components/admin/BusinessAnalyticsBoard";

export default function SiteManagementBoard({
  isSuperAdmin,
  loadingAdminAccess,
}) {
  const [openPanel, setOpenPanel] = useState("analytics");
  const isAnalyticsOpen = openPanel === "analytics";
  const isAdminsOpen = openPanel === "admins";
  const isDiscountsOpen = openPanel === "discounts";
  const canAccessSiteManagement = isSuperAdmin === true;

  const togglePanel = (panelKey) => {
    setOpenPanel((prev) => (prev === panelKey ? null : panelKey));
  };

  return (
    <section className="mx-auto w-full max-w-6xl py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Gestion del sitio</h1>
        <p className="mt-1 text-sm text-gray-600">
          Espacio de administracion interna reservado para superadmin.
        </p>
      </header>

      {loadingAdminAccess && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
          Validando permisos...
        </div>
      )}

      {!loadingAdminAccess && !canAccessSiteManagement && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          Solo superadmin puede acceder a este tablero.
        </div>
      )}

      {!loadingAdminAccess && canAccessSiteManagement && (
        <div className="space-y-4">
          <div
            className={`rounded-xl p-[1px] transition-all ${
              isAnalyticsOpen
                ? "bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 shadow-md"
                : "border border-gray-200 bg-white shadow-sm"
            }`}
          >
            <button
              type="button"
              onClick={() => togglePanel("analytics")}
              className={`flex w-full items-center justify-between gap-4 rounded-[11px] px-4 py-3 text-left transition-all ${
                isAnalyticsOpen
                  ? "bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50"
                  : "bg-white hover:bg-gray-50"
              }`}
            >
              <div>
                <h2
                  className={`text-lg font-semibold ${
                    isAnalyticsOpen ? "text-emerald-900" : "text-gray-800"
                  }`}
                >
                  Analytics del negocio
                </h2>
                <p
                  className={`mt-1 text-sm ${
                    isAnalyticsOpen ? "text-emerald-700" : "text-gray-600"
                  }`}
                >
                  Activation Rate, TTFV e invitaciones publicadas con cohortes y ranking por plantilla.
                </p>
                {isAnalyticsOpen && (
                  <span className="mt-2 inline-flex rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    Seccion abierta
                  </span>
                )}
              </div>
              <span
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                  isAnalyticsOpen
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {isAnalyticsOpen ? "^" : "v"}
              </span>
            </button>
          </div>

          {isAnalyticsOpen && <BusinessAnalyticsBoard />}

          <div
            className={`rounded-xl p-[1px] transition-all ${
              isDiscountsOpen
                ? "bg-gradient-to-r from-amber-500 to-orange-500 shadow-md"
                : "border border-gray-200 bg-white shadow-sm"
            }`}
          >
            <button
              type="button"
              onClick={() => togglePanel("discounts")}
              className={`flex w-full items-center justify-between gap-4 rounded-[11px] px-4 py-3 text-left transition-all ${
                isDiscountsOpen
                  ? "bg-gradient-to-r from-amber-50 to-orange-50"
                  : "bg-white hover:bg-gray-50"
              }`}
            >
              <div>
                <h2
                  className={`text-lg font-semibold ${
                    isDiscountsOpen ? "text-amber-900" : "text-gray-800"
                  }`}
                >
                  Codigos de descuento
                </h2>
                <p
                  className={`mt-1 text-sm ${
                    isDiscountsOpen ? "text-amber-700" : "text-gray-600"
                  }`}
                >
                  Crear codigos, configurar descuentos y revisar usos.
                </p>
                {isDiscountsOpen && (
                  <span className="mt-2 inline-flex rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    Seccion abierta
                  </span>
                )}
              </div>
              <span
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                  isDiscountsOpen
                    ? "bg-amber-600 text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {isDiscountsOpen ? "^" : "v"}
              </span>
            </button>
          </div>

          {isDiscountsOpen && <DiscountCodesManager />}

          <div
            className={`rounded-xl p-[1px] transition-all ${
              isAdminsOpen
                ? "bg-gradient-to-r from-purple-500 to-indigo-500 shadow-md"
                : "border border-gray-200 bg-white shadow-sm"
            }`}
          >
            <button
              type="button"
              onClick={() => togglePanel("admins")}
              className={`flex w-full items-center justify-between gap-4 rounded-[11px] px-4 py-3 text-left transition-all ${
                isAdminsOpen
                  ? "bg-gradient-to-r from-purple-50 to-indigo-50"
                  : "bg-white hover:bg-gray-50"
              }`}
            >
              <div>
                <h2
                  className={`text-lg font-semibold ${
                    isAdminsOpen ? "text-purple-900" : "text-gray-800"
                  }`}
                >
                  Administrar admins
                </h2>
                <p
                  className={`mt-1 text-sm ${
                    isAdminsOpen ? "text-purple-700" : "text-gray-600"
                  }`}
                >
                  Alta, baja y control de permisos administrativos.
                </p>
                {isAdminsOpen && (
                  <span className="mt-2 inline-flex rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                    Seccion abierta
                  </span>
                )}
              </div>
              <span
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                  isAdminsOpen
                    ? "bg-purple-600 text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {isAdminsOpen ? "^" : "v"}
              </span>
            </button>
          </div>

          {isAdminsOpen && <AdminUsersManager />}

          <a
            href="/admin/usuarios"
            className="block rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-cyan-50 p-4 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-emerald-900">
                  Administrar usuarios
                </h2>
                <p className="mt-1 text-sm text-emerald-700">
                  Abrir la pagina dedicada con metricas por usuario y detalle inline.
                </p>
                <span className="mt-2 inline-flex rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  Pagina dedicada
                </span>
              </div>
              <span className="inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white">
                Abrir
              </span>
            </div>
          </a>
        </div>
      )}
    </section>
  );
}
