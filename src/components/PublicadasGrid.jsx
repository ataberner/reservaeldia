import { useEffect, useState } from "react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/firebase";

export default function PublicadasGrid({ usuario }) {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const fetchPublicadas = async () => {
      if (!usuario?.uid) {
        console.warn("🔶 PublicadasGrid: no hay usuario todavía (uid null).");
        setItems([]);
        setCargando(false);
        return;
      }

      console.log("🔎 PublicadasGrid: fetching con uid =", usuario.uid);

      setCargando(true);
      try {
        const q = query(
          collection(db, "publicadas"),
          where("userId", "==", usuario.uid),
          orderBy("publicadaEn", "desc")
        );

        const snap = await getDocs(q);
        console.log("📦 PublicadasGrid: snapshot.size =", snap.size);

        if (snap.size > 0) {
          const ids = snap.docs.map(d => d.id);
          console.log("🆔 PublicadasGrid: docIds =", ids);

          // Logueo resumido de cada doc para validar campos críticos
          const rows = snap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              userId: data.userId,
              slug: data.slug,
              publicadaEn: data.publicadaEn?.toDate
                ? data.publicadaEn.toDate().toISOString()
                : "(sin timestamp)",
              urlPublica: data.urlPublica ?? "(sin url)",
              nombre: data.nombre ?? "(sin nombre)",
            };
          });
          console.table(rows);
        }

        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setItems(docs);
      } catch (e) {
        // Errores comunes: índice faltante o permisos
        // @ts-ignore
        const code = e?.code;
        console.error("❌ PublicadasGrid: error en getDocs:", e);

        if (code === "failed-precondition") {
          console.error(
            "⚠️ Falta índice compuesto para (where userId ==, orderBy publicadaEn). " +
            "Crealo desde el link que te da Firestore en consola."
          );
        }
        if (code === "permission-denied") {
          console.error(
            "🚫 Permisos denegados. Revisá reglas de /publicadas y que cada doc tenga userId correcto."
          );
        }

        setItems([]);
      } finally {
        setCargando(false);
      }
    };

    console.log("🧭 PublicadasGrid useEffect disparado. uid =", usuario?.uid || "(null)");
    fetchPublicadas();
  }, [usuario?.uid]);

  if (cargando) return <p className="text-gray-500">Cargando tus invitaciones publicadas...</p>;

  if (!items.length) {
    console.warn("🪣 PublicadasGrid: sin items para uid =", usuario?.uid);
    return (
      <div className="text-center mt-12">
        <h2 className="text-xl font-bold mb-2">Tus invitaciones publicadas</h2>
        <p className="text-gray-500">Todavía no publicaste ninguna invitación.</p>
      </div>
    );
  }

  return (
    <div className="mt-12">
      <h2 className="text-xl font-bold mb-6 text-center">Tus invitaciones publicadas</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-6 justify-center">
        {items.map((it) => (
          <div
            key={it.id}
            className="bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
          >
            {/* Portada cuadrada */}
            <div className="aspect-square bg-gray-100 overflow-hidden">
              <img
                src={it.portada || "/placeholder.jpg"}
                alt={`Vista previa de ${it.nombre || it.slug || "Invitación"}`}
                className="w-full h-full object-cover object-top transition-transform duration-300 hover:scale-105"
              />
            </div>

            {/* Info */}
            <div className="p-2 text-center">
              <h3 className="text-xs sm:text-sm font-medium text-gray-700 truncate w-full">
                {it.nombre || it.slug || "Sin nombre"}
              </h3>

              <div className="mt-1 text-[11px] text-gray-500 space-y-0.5">
                {it.tipo && <p>Tipo: {it.tipo}</p>}
                {"invitadosCount" in it && <p>Invitados: {it.invitadosCount ?? 0}</p>}
                {it.publicadaEn?.toDate && (
                  <p>Publicada: {it.publicadaEn.toDate().toLocaleDateString()}</p>
                )}
              </div>

              <div className="flex gap-2 mt-2 justify-center">
                {it.urlPublica ? (
                  <>
                    <a
                      href={it.urlPublica}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-purple-600 text-white text-xs px-3 py-1.5 rounded-full hover:bg-purple-700 transition"
                    >
                      Ver
                    </a>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(it.urlPublica);
                          alert("✅ Link copiado");
                        } catch {
                          alert("No se pudo copiar el link");
                        }
                      }}
                      className="bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded-full hover:bg-gray-200 transition"
                    >
                      Copiar link
                    </button>
                  </>
                ) : (
                  <span className="text-[11px] text-gray-400">Sin URL pública</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
