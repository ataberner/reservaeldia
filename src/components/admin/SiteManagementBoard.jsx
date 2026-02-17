import AdminUsersManager from "@/components/admin/AdminUsersManager";

export default function SiteManagementBoard({
  canManageSite,
  isSuperAdmin,
  loadingAdminAccess,
}) {
  return (
    <section className="mx-auto w-full max-w-6xl py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Tablero de gestión</h1>
        <p className="mt-1 text-sm text-gray-600">
          Espacio de administración interna del sitio.
        </p>
      </header>

      {loadingAdminAccess && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
          Validando permisos...
        </div>
      )}

      {!loadingAdminAccess && !canManageSite && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          No tenés permisos para acceder a este tablero.
        </div>
      )}

      {!loadingAdminAccess && canManageSite && !isSuperAdmin && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
          Gestión de admins: solo disponible para superadmin.
        </div>
      )}

      {!loadingAdminAccess && canManageSite && isSuperAdmin && (
        <AdminUsersManager />
      )}
    </section>
  );
}

