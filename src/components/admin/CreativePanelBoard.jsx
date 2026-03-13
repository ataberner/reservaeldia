function CreativePanelCard({ title, description, route, href, tone }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`group block rounded-xl border p-4 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${tone}`}
      title={`Abrir ${title} en una pestaña nueva`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm">{description}</p>
          <p className="mt-2 text-xs">Ruta: {route}</p>
        </div>
        <span className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition group-hover:bg-slate-800">
          Abrir
        </span>
      </div>
    </a>
  );
}

export default function CreativePanelBoard({
  canManageSite,
  loadingAdminAccess,
}) {
  const canAccessCreativePanel = canManageSite === true;

  return (
    <section className="mx-auto w-full max-w-6xl py-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Panel creativo</h1>
        </div>
        <a
          href="/dashboard"
          className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Volver al dashboard
        </a>
      </header>

      {loadingAdminAccess && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
          Validando permisos...
        </div>
      )}

      {!loadingAdminAccess && !canAccessCreativePanel && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          No tenes permisos para acceder a este panel.
        </div>
      )}

      {!loadingAdminAccess && canAccessCreativePanel && (
        <div className="space-y-4">
          <CreativePanelCard
            title="Gestionar iconos"
            description="Acceso al panel de iconos para editar categoria, keywords, estado y revalidaciones manuales."
            route="https://reservaeldia.com.ar/admin/iconos/"
            href="/admin/iconos/"
            tone="border-indigo-200 bg-gradient-to-r from-indigo-50 to-sky-50 text-indigo-900"
          />

          <CreativePanelCard
            title="Gestionar decoraciones"
            description="Acceso al panel de decoraciones para categorias, metadatos, estado y revalidaciones manuales."
            route="https://reservaeldia.com.ar/admin/decoraciones/"
            href="/admin/decoraciones/"
            tone="border-teal-200 bg-gradient-to-r from-teal-50 to-cyan-50 text-teal-900"
          />

          <CreativePanelCard
            title="Presets de texto"
            description="Gestion de presets simples y combinaciones para el menu Texto del editor."
            route="https://reservaeldia.com.ar/admin/presets-texto/"
            href="/admin/presets-texto/"
            tone="border-cyan-200 bg-gradient-to-r from-cyan-50 to-sky-50 text-cyan-900"
          />

          <CreativePanelCard
            title="Presets de countdown"
            description="Constructor y administracion de presets globales del countdown con CRUD completo y sincronizacion legacy."
            route="https://reservaeldia.com.ar/admin/countdown-presets/"
            href="/admin/countdown-presets/"
            tone="border-fuchsia-200 bg-gradient-to-r from-fuchsia-50 to-rose-50 text-fuchsia-900"
          />

          <CreativePanelCard
            title="Plantillas internas"
            description="Gestion editorial de plantillas base con estados y acceso directo al editor interno."
            route="https://reservaeldia.com.ar/admin/plantillas/"
            href="/admin/plantillas/"
            tone="border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-950"
          />
        </div>
      )}
    </section>
  );
}
