import { useCallback, useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";

function getErrorMessage(error, fallback) {
  const message =
    error?.message ||
    error?.details?.message ||
    error?.details ||
    fallback;

  return typeof message === "string" ? message : fallback;
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

export default function AdminUsersManager() {
  const listCallable = useMemo(() => httpsCallable(functions, "listAdminUsers"), []);
  const searchCallable = useMemo(
    () => httpsCallable(functions, "getAdminUserByEmail"),
    []
  );
  const setClaimCallable = useMemo(
    () => httpsCallable(functions, "setAdminClaim"),
    []
  );

  const [items, setItems] = useState([]);
  const [scannedUsers, setScannedUsers] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState("");

  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState("");
  const [searched, setSearched] = useState(false);

  const [updatingUid, setUpdatingUid] = useState(null);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const totalAdmins = useMemo(
    () => items.filter((item) => item.adminClaim && !item.isSuperAdmin).length,
    [items]
  );
  const totalSuperAdmins = useMemo(
    () => items.filter((item) => item.isSuperAdmin).length,
    [items]
  );

  const loadAdmins = useCallback(async () => {
    setLoadingList(true);
    setListError("");

    try {
      const result = await listCallable({});
      const data = result?.data || {};

      setItems(Array.isArray(data.items) ? data.items : []);
      setScannedUsers(Number.isFinite(data.scannedUsers) ? data.scannedUsers : 0);
      setTruncated(data.truncated === true);
    } catch (error) {
      console.error("Error listando admins:", error);
      setListError(getErrorMessage(error, "No se pudo cargar la lista de admins"));
    } finally {
      setLoadingList(false);
    }
  }, [listCallable]);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  const applyAdminClaim = useCallback(
    async (user, makeAdmin) => {
      if (!user?.uid) return;

      if (!makeAdmin && user.isSuperAdmin) {
        setActionError("No se puede quitar admin a un superadmin.");
        return;
      }

      setUpdatingUid(user.uid);
      setActionError("");
      setActionMessage("");

      try {
        await setClaimCallable({ uidTarget: user.uid, admin: makeAdmin });
        await loadAdmins();

        setSearchResult((prev) =>
          prev && prev.uid === user.uid ? { ...prev, adminClaim: makeAdmin } : prev
        );

        setActionMessage(
          makeAdmin
            ? "Permiso admin otorgado correctamente."
            : "Permiso admin removido correctamente."
        );
      } catch (error) {
        console.error("Error actualizando claim admin:", error);
        setActionError(
          getErrorMessage(error, "No se pudo actualizar el permiso admin")
        );
      } finally {
        setUpdatingUid(null);
      }
    },
    [loadAdmins, setClaimCallable]
  );

  const onSearch = async (e) => {
    e.preventDefault();

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setSearchError("Ingresa un email valido.");
      setSearchResult(null);
      setSearched(false);
      return;
    }

    setSearching(true);
    setSearchError("");
    setActionError("");
    setActionMessage("");

    try {
      const result = await searchCallable({ email: cleanEmail });
      const data = result?.data || {};

      if (data.found !== true || !data.user) {
        setSearchResult(null);
        setSearchError("No existe un usuario registrado con ese email.");
      } else {
        setSearchResult(data.user);
      }
      setSearched(true);
    } catch (error) {
      console.error("Error buscando usuario:", error);
      setSearchResult(null);
      setSearchError(getErrorMessage(error, "No se pudo buscar el usuario"));
      setSearched(true);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-gray-600">
          Buscar usuarios por email y asignar o quitar permisos admin.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Los superadmins detectados por UID estan protegidos y no son revocables.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <form onSubmit={onSearch} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@dominio.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={searching}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {searching ? "Buscando..." : "Buscar"}
          </button>
        </form>

        {searchError && <p className="mt-3 text-sm text-red-600">{searchError}</p>}

        {searched && searchResult && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-gray-800">
                {searchResult.email || "(sin email)"}
              </p>
              <RoleBadge
                isSuperAdmin={searchResult.isSuperAdmin}
                adminClaim={searchResult.adminClaim}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">UID: {searchResult.uid}</p>

            <div className="mt-3">
              {searchResult.isSuperAdmin ? (
                <p className="text-xs font-medium text-indigo-700">
                  Usuario protegido por rol superadmin.
                </p>
              ) : (
                <button
                  onClick={() =>
                    applyAdminClaim(searchResult, !searchResult.adminClaim)
                  }
                  disabled={updatingUid === searchResult.uid}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium text-white transition ${
                    searchResult.adminClaim
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-green-600 hover:bg-green-700"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {updatingUid === searchResult.uid
                    ? "Guardando..."
                    : searchResult.adminClaim
                    ? "Quitar admin"
                    : "Hacer admin"}
                </button>
              )}
            </div>
          </div>
        )}

        {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
        {actionMessage && (
          <p className="mt-3 text-sm text-green-700">{actionMessage}</p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span>Total admins: {totalAdmins}</span>
          <span>·</span>
          <span>Total superadmins: {totalSuperAdmins}</span>
          <span>·</span>
          <span>Usuarios escaneados: {scannedUsers}</span>
        </div>

        {truncated && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            La lista es parcial por limite de escaneo ({scannedUsers} usuarios).
          </p>
        )}

        {listError && <p className="text-sm text-red-600">{listError}</p>}
        {loadingList && <p className="text-sm text-gray-500">Cargando admins...</p>}

        {!loadingList && !listError && items.length === 0 && (
          <p className="text-sm text-gray-500">No hay admins configurados.</p>
        )}

        {!loadingList && !listError && items.length > 0 && (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.uid}
                className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-gray-800">
                      {item.email || "(sin email)"}
                    </p>
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
                  <p className="mt-1 text-xs text-gray-500">UID: {item.uid}</p>
                </div>

                <div className="sm:text-right">
                  {item.isSuperAdmin ? (
                    <span className="text-xs font-medium text-indigo-700">Protegido</span>
                  ) : (
                    <button
                      onClick={() => applyAdminClaim(item, !item.adminClaim)}
                      disabled={updatingUid === item.uid}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium text-white transition ${
                        item.adminClaim
                          ? "bg-red-600 hover:bg-red-700"
                          : "bg-green-600 hover:bg-green-700"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {updatingUid === item.uid
                        ? "Guardando..."
                        : item.adminClaim
                        ? "Quitar admin"
                        : "Hacer admin"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

