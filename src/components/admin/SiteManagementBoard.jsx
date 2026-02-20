import { useState } from "react";
import AdminUsersManager from "@/components/admin/AdminUsersManager";
import UsersDirectoryManager from "@/components/admin/UsersDirectoryManager";

export default function SiteManagementBoard({
  canManageSite,
  isSuperAdmin,
  loadingAdminAccess,
}) {
  const [openPanel, setOpenPanel] = useState(null);
  const isAdminsOpen = openPanel === "admins";
  const isUsersOpen = openPanel === "users";
  const canAccessSiteManagement = canManageSite === true;

  const togglePanel = (panelKey) => {
    setOpenPanel((prev) => (prev === panelKey ? null : panelKey));
  };

  return (
    <section className="mx-auto w-full max-w-6xl py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Tablero de gestion</h1>
        <p className="mt-1 text-sm text-gray-600">
          Espacio de administracion interna del sitio.
        </p>
      </header>

      {loadingAdminAccess && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
          Validando permisos...
        </div>
      )}

      {!loadingAdminAccess && !canAccessSiteManagement && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          No tenes permisos para acceder a este tablero.
        </div>
      )}

      {!loadingAdminAccess && canAccessSiteManagement && (
        <div className="space-y-4">
          <article className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-sky-50 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-indigo-900">
                  Gestionar iconos
                </h2>
                <p className="mt-1 text-sm text-indigo-700">
                  Acceso al panel de iconos para editar categoria, keywords y destacados.
                </p>
                <p className="mt-2 text-xs text-indigo-700">
                  Ruta: https://reservaeldia.com.ar/admin/iconos/
                </p>
              </div>
              <a
                href="/admin/iconos/"
                className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                Abrir panel de iconos
              </a>
            </div>
          </article>

          {isSuperAdmin && (
            <>
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

              <div
                className={`rounded-xl p-[1px] transition-all ${
                  isUsersOpen
                    ? "bg-gradient-to-r from-emerald-500 to-cyan-500 shadow-md"
                    : "border border-gray-200 bg-white shadow-sm"
                }`}
              >
                <button
                  type="button"
                  onClick={() => togglePanel("users")}
                  className={`flex w-full items-center justify-between gap-4 rounded-[11px] px-4 py-3 text-left transition-all ${
                    isUsersOpen
                      ? "bg-gradient-to-r from-emerald-50 to-cyan-50"
                      : "bg-white hover:bg-gray-50"
                  }`}
                >
                  <div>
                    <h2
                      className={`text-lg font-semibold ${
                        isUsersOpen ? "text-emerald-900" : "text-gray-800"
                      }`}
                    >
                      Administrar usuarios
                    </h2>
                    <p
                      className={`mt-1 text-sm ${
                        isUsersOpen ? "text-emerald-700" : "text-gray-600"
                      }`}
                    >
                      Estadisticas globales y listado paginado de usuarios.
                    </p>
                    {isUsersOpen && (
                      <span className="mt-2 inline-flex rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Seccion abierta
                      </span>
                    )}
                  </div>
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                      isUsersOpen
                        ? "bg-emerald-600 text-white"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {isUsersOpen ? "^" : "v"}
                  </span>
                </button>
              </div>

              {isUsersOpen && <UsersDirectoryManager />}
            </>
          )}

          {!isSuperAdmin && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800 shadow-sm">
              Tu rol permite gestionar iconos. La administracion de usuarios y admins esta reservada para superadmin.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
