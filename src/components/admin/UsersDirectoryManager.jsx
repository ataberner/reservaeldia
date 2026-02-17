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

export default function UsersDirectoryManager() {
  const statsCallable = useMemo(() => httpsCallable(functions, "getUsersStats"), []);
  const pageCallable = useMemo(
    () => httpsCallable(functions, "listUsersDirectory"),
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800">
          Estadisticas de usuarios
        </h3>

        {loadingStats && (
          <p className="mt-2 text-sm text-gray-500">Cargando estadisticas...</p>
        )}

        {statsError && <p className="mt-2 text-sm text-red-600">{statsError}</p>}

        {!loadingStats && !statsError && stats && (
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Cantidad total</p>
              <p className="mt-1 text-lg font-semibold text-gray-800">
                {stats.totalUsers ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Admins (claim)</p>
              <p className="mt-1 text-lg font-semibold text-gray-800">
                {stats.totalAdmins ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Superadmins</p>
              <p className="mt-1 text-lg font-semibold text-gray-800">
                {stats.totalSuperAdmins ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Deshabilitados</p>
              <p className="mt-1 text-lg font-semibold text-gray-800">
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

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Listado de usuarios</h3>
            <p className="text-xs text-gray-500">
              Mostrando {users.length} usuarios cargados
              {stats?.totalUsers ? ` de ${stats.totalUsers}` : ""}.
            </p>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por email, nombre, apellido o UID"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none sm:w-80"
          />
        </div>

        {pageError && <p className="mb-3 text-sm text-red-600">{pageError}</p>}

        {!firstPageLoaded && loadingPage && (
          <p className="text-sm text-gray-500">Cargando usuarios...</p>
        )}

        {firstPageLoaded && filteredUsers.length === 0 && (
          <p className="text-sm text-gray-500">No hay usuarios para mostrar.</p>
        )}

        {filteredUsers.length > 0 && (
          <div className="max-h-[520px] overflow-y-auto rounded-lg border border-gray-200">
            <div className="divide-y divide-gray-200">
              {filteredUsers.map((item) => (
                <div
                  key={item.uid}
                  className="flex flex-col gap-2 bg-white px-3 py-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {item.email || "(sin email)"}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {getFullName(item)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                      <span>Apellido: {item.apellido || "-"}</span>
                      <span>Fecha nacimiento: {formatBirthDate(item.fechaNacimiento)}</span>
                      <span>UID: {item.uid}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {item.profileComplete !== true && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        Perfil incompleto
                      </span>
                    )}
                    <RoleBadge
                      isSuperAdmin={item.isSuperAdmin}
                      adminClaim={item.adminClaim}
                    />
                    {item.disabled && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        Deshabilitado
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          {nextPageToken && (
            <button
              type="button"
              onClick={() => loadUsersPage({ token: nextPageToken })}
              disabled={loadingPage}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingPage ? "Cargando..." : "Cargar mas usuarios"}
            </button>
          )}

          {!nextPageToken && firstPageLoaded && (
            <span className="text-xs text-gray-500">
              Ya se cargaron todos los usuarios.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
