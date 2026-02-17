import { useEffect, useRef, useState } from "react";
import { collection, getDocs, updateDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/router";
import { db } from "@/firebase";
import SubirIcono from "@/components/SubirIcono";
import { useAdminAccess } from "@/hooks/useAdminAccess";

function getExtensionFromIcon(icono) {
  const raw = (icono?.nombre || icono?.url || "").toString();
  const clean = raw.split("?")[0].split("#")[0].toLowerCase();
  const ext = clean.split(".").pop();

  if (ext === "jpeg") return "jpg";
  return ext || "unknown";
}

export default function AdminIconos() {
  const router = useRouter();
  const redirectingRef = useRef(false);

  const [authUser, setAuthUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [iconos, setIconos] = useState([]);
  const [verSoloPopulares, setVerSoloPopulares] = useState(false);
  const [filtroFormato, setFiltroFormato] = useState("todos");

  const { loadingAdminAccess, canManageSite } = useAdminAccess(authUser);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user || null);
      setCheckingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (checkingAuth || loadingAdminAccess) return;
    if (authUser && canManageSite) return;
    if (redirectingRef.current) return;

    redirectingRef.current = true;
    alert("No tenes permisos para acceder a esta seccion.");
    router.replace("/dashboard");
  }, [authUser, canManageSite, checkingAuth, loadingAdminAccess, router]);

  useEffect(() => {
    if (checkingAuth || loadingAdminAccess) return;
    if (!authUser || !canManageSite) return;

    const fetchIconos = async () => {
      try {
        const snap = await getDocs(collection(db, "iconos"));
        const data = snap.docs.map((d) => {
          const base = {
            id: d.id,
            ref: d.ref,
            ...d.data(),
            categoriaTemp: d.data().categoria || "",
            keywordsTemp: (d.data().keywords || []).join(", "),
            popularTemp: d.data().popular || false,
            guardando: false,
            mensaje: null,
          };

          return {
            ...base,
            formato: getExtensionFromIcon(base),
          };
        });

        setIconos(data);
      } catch (error) {
        console.error("Error al traer iconos:", error);
      }
    };

    fetchIconos();
  }, [authUser, canManageSite, checkingAuth, loadingAdminAccess]);

  const guardarCambios = async (id) => {
    setIconos((prev) =>
      prev.map((i) => (i.id === id ? { ...i, guardando: true, mensaje: null } : i))
    );

    const icono = iconos.find((i) => i.id === id);
    if (!icono?.ref) {
      setIconos((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, guardando: false, mensaje: "No se encontro el documento" } : i
        )
      );
      return;
    }

    try {
      await updateDoc(icono.ref, {
        categoria: (icono.categoriaTemp || "").trim(),
        popular: !!icono.popularTemp,
        keywords: (icono.keywordsTemp || "")
          .split(",")
          .map((k) => k.trim())
          .filter((k) => k.length > 0),
      });

      setIconos((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, guardando: false, mensaje: "Guardado correctamente" } : i
        )
      );
    } catch (error) {
      console.error(error);
      setIconos((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, guardando: false, mensaje: "Error al guardar" } : i
        )
      );
    }
  };

  const iconosFiltrados = iconos
    .filter((icono) => (!verSoloPopulares ? true : !!icono.popularTemp))
    .filter((icono) => {
      if (filtroFormato === "todos") return true;
      const ext = (icono.formato || getExtensionFromIcon(icono)).toLowerCase();
      return ext === filtroFormato;
    });

  if (checkingAuth || loadingAdminAccess) {
    return <p className="p-6 text-sm text-gray-600">Validando permisos...</p>;
  }

  if (!authUser || !canManageSite) {
    return <p className="p-6 text-sm text-gray-600">Redirigiendo...</p>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <SubirIcono />

      <h1 className="mb-2 text-2xl font-bold">Configuracion de iconos</h1>
      <p className="mb-4 text-sm text-gray-600">
        Total: {iconos.length} · Mostrando: {iconosFiltrados.length}
      </p>

      <div className="sticky top-0 z-10 mb-4 border-b bg-gray-50 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setVerSoloPopulares((v) => !v)}
            className="rounded bg-purple-100 px-3 py-1 text-sm text-purple-800 transition hover:bg-purple-200"
          >
            {verSoloPopulares ? "Ver todos" : "Ver solo populares"}
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Formato:</span>
            <select
              value={filtroFormato}
              onChange={(e) => setFiltroFormato(e.target.value)}
              className="rounded border bg-white px-3 py-1 text-sm"
            >
              <option value="todos">Todos</option>
              <option value="svg">SVG</option>
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
              <option value="webp">WEBP</option>
              <option value="gif">GIF</option>
              <option value="unknown">Otros</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
        {iconosFiltrados.map((icono) => (
          <div key={icono.id} className="flex items-start gap-4 rounded bg-white p-4 shadow">
            <img
              src={icono.url}
              alt={`icono-${icono.id}`}
              className="h-20 w-20 rounded bg-gray-100 object-contain"
            />

            <div className="flex-1 space-y-2 text-sm">
              <p className="text-gray-600">
                <strong>ID:</strong> {icono.id}
              </p>

              <p className="text-gray-600">
                <strong>Formato:</strong>{" "}
                {(icono.formato || getExtensionFromIcon(icono)).toUpperCase()}
              </p>

              <div>
                <label className="font-semibold">Categoria:</label>
                <input
                  type="text"
                  className="w-full rounded border px-2 py-1"
                  value={icono.categoriaTemp}
                  onChange={(e) =>
                    setIconos((prev) =>
                      prev.map((i) =>
                        i.id === icono.id ? { ...i, categoriaTemp: e.target.value } : i
                      )
                    )
                  }
                />
              </div>

              <div>
                <label className="font-semibold">Keywords (coma separadas):</label>
                <input
                  type="text"
                  className="w-full rounded border px-2 py-1"
                  value={icono.keywordsTemp}
                  onChange={(e) =>
                    setIconos((prev) =>
                      prev.map((i) =>
                        i.id === icono.id ? { ...i, keywordsTemp: e.target.value } : i
                      )
                    )
                  }
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!icono.popularTemp}
                  onChange={(e) =>
                    setIconos((prev) =>
                      prev.map((i) =>
                        i.id === icono.id ? { ...i, popularTemp: e.target.checked } : i
                      )
                    )
                  }
                />
                Popular
              </label>

              <button
                className="rounded bg-purple-600 px-4 py-1 text-white hover:bg-purple-700 disabled:opacity-50"
                disabled={!!icono.guardando}
                onClick={() => guardarCambios(icono.id)}
              >
                {icono.guardando ? "Guardando..." : "Guardar cambios"}
              </button>

              {icono.mensaje && <p className="mt-1 text-xs text-gray-500">{icono.mensaje}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

