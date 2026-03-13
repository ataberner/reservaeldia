import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";

const USERS_PAGE_SIZE = 100;

function getErrorMessage(error, fallback) {
  const message =
    error?.message ||
    error?.details?.message ||
    error?.details ||
    fallback;

  return typeof message === "string" ? message : fallback;
}

function formatBirthDate(value) {
  if (typeof value !== "string" || !value.trim()) return "Sin fecha";
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  const [year, month, day] = parts;
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatDateTime(value) {
  if (typeof value !== "string" || !value.trim()) return "Sin fecha";

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function buildPublicInvitationUrl(publicSlug) {
  const safeSlug = typeof publicSlug === "string" ? publicSlug.trim() : "";
  if (!safeSlug) return "";
  return `https://reservaeldia.com.ar/i/${encodeURIComponent(safeSlug)}`;
}

function getFullName(item) {
  const nombreCompleto = (item?.nombreCompleto || "").trim();
  if (nombreCompleto) return nombreCompleto;

  const nombre = (item?.nombre || "").trim();
  const apellido = (item?.apellido || "").trim();
  const builtName = [nombre, apellido].filter(Boolean).join(" ").trim();
  if (builtName) return builtName;

  const displayName = (item?.displayName || "").trim();
  if (displayName) return displayName;

  return "Sin nombre";
}

function getMetrics(item) {
  const metrics = item?.metrics && typeof item.metrics === "object" ? item.metrics : {};
  return {
    drafts: Number(metrics.drafts || 0),
    publishedActive: Number(metrics.publishedActive || 0),
    publishedPaused: Number(metrics.publishedPaused || 0),
    publishedExpired: Number(metrics.publishedExpired || 0),
    approvedPayments: Number(metrics.approvedPayments || 0),
    revenueTotalArs: Number(metrics.revenueTotalArs || 0),
    firstApprovedPaymentAt:
      typeof metrics.firstApprovedPaymentAt === "string" ? metrics.firstApprovedPaymentAt : null,
  };
}

function RoleBadge({ isSuperAdmin, adminClaim }) {
  if (isSuperAdmin) {
    return (
      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
        Superadmin
      </span>
    );
  }

  if (adminClaim) {
    return (
      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800">
        Admin
      </span>
    );
  }

  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
      Usuario
    </span>
  );
}

function MetricPill({ label, value, tone = "slate" }) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "blue"
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em]">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function PublicationStatusBadge({ status }) {
  const config =
    status === "active"
      ? {
          label: "Activa",
          className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        }
      : status === "paused"
      ? {
          label: "Pausada",
          className: "border-amber-200 bg-amber-50 text-amber-700",
        }
      : {
          label: "Vencida",
          className: "border-slate-300 bg-slate-100 text-slate-700",
        };

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function DraftDetailList({ ownerUid, drafts }) {
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
        No hay borradores para mostrar.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="divide-y divide-slate-200">
        {drafts.map((draft) => {
          const href = `/dashboard?slug=${encodeURIComponent(
            draft.slug
          )}&adminView=1&ownerUid=${encodeURIComponent(ownerUid)}`;

          return (
            <div
              key={draft.slug}
              className="flex flex-col gap-3 bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {draft.nombre || draft.slug}
                  </p>
                  {draft.isLegacy ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      Legacy
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      Compatible
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">Slug: {draft.slug}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Ultima edicion: {formatDateTime(draft.lastUpdatedAt)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {draft.canOpenCanvas ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                  >
                    Ver canvas
                  </a>
                ) : (
                  <span className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-medium text-slate-500">
                    Sin canvas
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PublicationDetailList({ publications }) {
  if (!Array.isArray(publications) || publications.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
        No hay invitaciones publicadas para mostrar.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="divide-y divide-slate-200">
        {publications.map((publication) => {
          const publicUrl = buildPublicInvitationUrl(publication.publicSlug);

          return (
            <div
              key={`${publication.publicSlug}-${publication.status}`}
              className="flex flex-col gap-3 bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {publication.nombre || publication.publicSlug}
                  </p>
                  <PublicationStatusBadge status={publication.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Slug publico: {publication.publicSlug}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>Publicada: {formatDateTime(publication.publishedAt)}</span>
                  <span>Vence: {formatDateTime(publication.expiresAt)}</span>
                </div>
                {publicUrl ? (
                  <p className="mt-2 break-all text-xs text-slate-600">
                    Enlace publico:{" "}
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-2 transition hover:text-indigo-900"
                    >
                      {publicUrl}
                    </a>
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function UsersDirectoryManager() {
  const statsCallable = useMemo(() => httpsCallable(functions, "getUsersStats"), []);
  const pageCallable = useMemo(
    () => httpsCallable(functions, "listUsersDirectory"),
    []
  );
  const detailCallable = useMemo(
    () => httpsCallable(functions, "getUserDirectoryDetail"),
    []
  );

  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState("");

  const [users, setUsers] = useState([]);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [pageError, setPageError] = useState("");
  const [firstPageLoaded, setFirstPageLoaded] = useState(false);
  const loadingPageRef = useRef(false);

  const [search, setSearch] = useState("");
  const [openDetailUid, setOpenDetailUid] = useState(null);
  const [detailMap, setDetailMap] = useState({});
  const [detailErrorMap, setDetailErrorMap] = useState({});
  const [loadingDetailUid, setLoadingDetailUid] = useState("");

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    setStatsError("");

    try {
      const result = await statsCallable({});
      setStats(result?.data || {});
    } catch (error) {
      console.error("Error cargando estadisticas de usuarios:", error);
      setStatsError(
        getErrorMessage(error, "No se pudieron cargar las estadisticas")
      );
    } finally {
      setLoadingStats(false);
    }
  }, [statsCallable]);

  const loadUsersPage = useCallback(
    async ({ reset = false, token = null } = {}) => {
      if (loadingPageRef.current) return;
      loadingPageRef.current = true;

      setLoadingPage(true);
      setPageError("");

      try {
        const tokenToUse = reset ? null : token;
        const result = await pageCallable({
          pageSize: USERS_PAGE_SIZE,
          pageToken: tokenToUse,
        });

        const data = result?.data || {};
        const items = Array.isArray(data.items) ? data.items : [];

        setUsers((prev) => (reset ? items : [...prev, ...items]));
        setNextPageToken(data.nextPageToken || null);

        if (reset) {
          setOpenDetailUid(null);
          setDetailMap({});
          setDetailErrorMap({});
        }
      } catch (error) {
        console.error("Error cargando usuarios:", error);
        setPageError(getErrorMessage(error, "No se pudo cargar el listado"));
      } finally {
        loadingPageRef.current = false;
        setLoadingPage(false);
        setFirstPageLoaded(true);
      }
    },
    [pageCallable]
  );

  const loadUserDetail = useCallback(
    async (uid) => {
      if (!uid) return;

      setLoadingDetailUid(uid);
      setDetailErrorMap((prev) => ({ ...prev, [uid]: "" }));

      try {
        const result = await detailCallable({ uid });
        const data = result?.data || {};

        setDetailMap((prev) => ({
          ...prev,
          [uid]: {
            user: data.user || null,
            metrics: data.metrics || {},
            drafts: Array.isArray(data.drafts) ? data.drafts : [],
            publications: Array.isArray(data.publications) ? data.publications : [],
          },
        }));
      } catch (error) {
        console.error("Error cargando detalle de usuario:", error);
        setDetailErrorMap((prev) => ({
          ...prev,
          [uid]: getErrorMessage(error, "No se pudo cargar el detalle"),
        }));
      } finally {
        setLoadingDetailUid("");
      }
    },
    [detailCallable]
  );

  useEffect(() => {
    loadStats();
    loadUsersPage({ reset: true });
  }, [loadStats, loadUsersPage]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;

    return users.filter((item) => {
      const email = (item.email || "").toLowerCase();
      const uid = (item.uid || "").toLowerCase();
      const name = (item.displayName || "").toLowerCase();
      const nombre = (item.nombre || "").toLowerCase();
      const apellido = (item.apellido || "").toLowerCase();
      const nombreCompleto = (item.nombreCompleto || "").toLowerCase();
      return (
        email.includes(q) ||
        uid.includes(q) ||
        name.includes(q) ||
        nombre.includes(q) ||
        apellido.includes(q) ||
        nombreCompleto.includes(q)
      );
    });
  }, [search, users]);

  const toggleDetail = useCallback(
    async (uid) => {
      if (!uid) return;
      if (openDetailUid === uid) {
        setOpenDetailUid(null);
        return;
      }

      setOpenDetailUid(uid);
      if (!detailMap[uid]) {
        await loadUserDetail(uid);
      }
    },
    [detailMap, loadUserDetail, openDetailUid]
  );

  return (
    <section className="mx-auto w-full max-w-6xl py-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gestion de usuarios</h1>
          <p className="mt-1 text-sm text-slate-600">
            Vista dedicada de superadmin con metricas y detalle inline por usuario.
          </p>
        </div>
        <a
          href="/dashboard"
          className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Volver al dashboard
        </a>
      </header>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">
            Estadisticas globales
          </h2>

          {loadingStats && (
            <p className="mt-2 text-sm text-slate-500">Cargando estadisticas...</p>
          )}

          {statsError && (
            <p className="mt-2 text-sm text-rose-600">{statsError}</p>
          )}

          {!loadingStats && !statsError && stats && (
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Cantidad total</p>
                <p className="mt-1 text-lg font-semibold text-slate-800">
                  {stats.totalUsers ?? 0}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Admins (claim)</p>
                <p className="mt-1 text-lg font-semibold text-slate-800">
                  {stats.totalAdmins ?? 0}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Superadmins</p>
                <p className="mt-1 text-lg font-semibold text-slate-800">
                  {stats.totalSuperAdmins ?? 0}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Deshabilitados</p>
                <p className="mt-1 text-lg font-semibold text-slate-800">
                  {stats.totalDisabled ?? 0}
                </p>
              </div>
            </div>
          )}

          {stats?.truncated === true && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Las estadisticas son parciales por limite de escaneo (
              {stats.scannedUsers || 0} usuarios).
            </p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                Directorio de usuarios
              </h2>
              <p className="text-xs text-slate-500">
                Mostrando {users.length} usuarios cargados
                {stats?.totalUsers ? ` de ${stats.totalUsers}` : ""}.
              </p>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por email, nombre, apellido o UID"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none lg:w-80"
            />
          </div>

          {pageError && <p className="mb-3 text-sm text-rose-600">{pageError}</p>}

          {!firstPageLoaded && loadingPage && (
            <p className="text-sm text-slate-500">Cargando usuarios...</p>
          )}

          {firstPageLoaded && filteredUsers.length === 0 && (
            <p className="text-sm text-slate-500">No hay usuarios para mostrar.</p>
          )}

          {filteredUsers.length > 0 && (
            <div className="space-y-3">
              {filteredUsers.map((item) => {
                const metrics = getMetrics(item);
                const isDetailOpen = openDetailUid === item.uid;
                const detail = detailMap[item.uid] || null;
                const detailError = detailErrorMap[item.uid] || "";
                const loadingDetail = loadingDetailUid === item.uid;

                return (
                  <article
                    key={item.uid}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    <div className="flex flex-col gap-4 px-4 py-4">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-800">
                              {item.email || "(sin email)"}
                            </p>
                            <RoleBadge
                              isSuperAdmin={item.isSuperAdmin}
                              adminClaim={item.adminClaim}
                            />
                            {item.profileComplete !== true && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                Perfil incompleto
                              </span>
                            )}
                            {item.disabled && (
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                                Deshabilitado
                              </span>
                            )}
                          </div>

                          <p className="mt-1 text-sm text-slate-600">
                            {getFullName(item)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span>Apellido: {item.apellido || "-"}</span>
                            <span>
                              Fecha nacimiento: {formatBirthDate(item.fechaNacimiento)}
                            </span>
                            <span>UID: {item.uid}</span>
                          </div>
                        </div>

                        <div className="flex items-start justify-end">
                          <button
                            type="button"
                            onClick={() => toggleDetail(item.uid)}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                          >
                            {isDetailOpen ? "Ocultar detalle" : "Ver detalle"}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                        <MetricPill label="Borradores" value={metrics.drafts} />
                        <MetricPill
                          label="Activas"
                          value={metrics.publishedActive}
                          tone="emerald"
                        />
                        <MetricPill
                          label="Pausadas"
                          value={metrics.publishedPaused}
                          tone="amber"
                        />
                        <MetricPill
                          label="Vencidas"
                          value={metrics.publishedExpired}
                          tone="rose"
                        />
                        <MetricPill
                          label="Pagos reales"
                          value={metrics.approvedPayments}
                          tone="blue"
                        />
                        <MetricPill
                          label="Ingresos reales"
                          value={formatCurrency(metrics.revenueTotalArs)}
                          tone="emerald"
                        />
                      </div>
                    </div>

                    {isDetailOpen && (
                      <div className="border-t border-slate-200 bg-slate-50 px-4 py-4">
                        {loadingDetail && !detail && (
                          <p className="text-sm text-slate-500">
                            Cargando detalle del usuario...
                          </p>
                        )}

                        {detailError && (
                          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {detailError}
                          </p>
                        )}

                        {detail && (
                          <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                              <MetricPill
                                label="Borradores"
                                value={getMetrics(detail.user || detail).drafts}
                              />
                              <MetricPill
                                label="Activas"
                                value={getMetrics(detail.user || detail).publishedActive}
                                tone="emerald"
                              />
                              <MetricPill
                                label="Pausadas"
                                value={getMetrics(detail.user || detail).publishedPaused}
                                tone="amber"
                              />
                              <MetricPill
                                label="Vencidas"
                                value={getMetrics(detail.user || detail).publishedExpired}
                                tone="rose"
                              />
                              <MetricPill
                                label="Pagos reales"
                                value={getMetrics(detail.user || detail).approvedPayments}
                                tone="blue"
                              />
                              <MetricPill
                                label="Ingresos reales"
                                value={formatCurrency(getMetrics(detail.user || detail).revenueTotalArs)}
                                tone="emerald"
                              />
                            </div>

                            <p className="text-xs text-slate-500">
                              Primer pago aprobado:{" "}
                              {formatDateTime(getMetrics(detail.user || detail).firstApprovedPaymentAt)}
                            </p>

                            <div className="space-y-2">
                              <div>
                                <h3 className="text-sm font-semibold text-slate-800">
                                  Borradores
                                </h3>
                                <p className="text-xs text-slate-500">
                                  Lista simple de borradores del usuario.
                                </p>
                              </div>
                              <DraftDetailList ownerUid={item.uid} drafts={detail.drafts} />
                            </div>

                            <div className="space-y-2">
                              <div>
                                <h3 className="text-sm font-semibold text-slate-800">
                                  Publicadas
                                </h3>
                                <p className="text-xs text-slate-500">
                                  Invitaciones activas, pausadas y vencidas del usuario.
                                </p>
                              </div>
                              <PublicationDetailList publications={detail.publications} />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            {nextPageToken && (
              <button
                type="button"
                onClick={() => loadUsersPage({ token: nextPageToken })}
                disabled={loadingPage}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingPage ? "Cargando..." : "Cargar mas usuarios"}
              </button>
            )}

            {!nextPageToken && firstPageLoaded && (
              <span className="text-xs text-slate-500">
                Ya se cargaron todos los usuarios.
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
