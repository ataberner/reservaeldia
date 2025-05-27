// src/components/DashboardLayout.jsx
import { useState } from "react";
import { FaBars } from "react-icons/fa";
import Link from "next/link";
import { getFunctions, httpsCallable } from "firebase/functions";


function escalarProporcionadamente(imgWidth, imgHeight, canvasWidth = 800, canvasHeight = 1400) {
  const imgRatio = imgWidth / imgHeight;
  const canvasRatio = canvasWidth / canvasHeight;

  let width, height;
  if (imgRatio > canvasRatio) {
    // Imagen más ancha → limitar por altura
    height = canvasHeight;
    width = height * imgRatio;
  } else {
    // Imagen más alta → limitar por ancho
    width = canvasWidth;
    height = width / imgRatio;
  }

  return { width, height };
}


export default function DashboardLayout({ children }) {
  const [sidebarAbierta, setSidebarAbierta] = useState(true);

  const ejecutarCrearPlantilla = async () => {
    const confirmar = confirm("¿Querés crear la plantilla?");
    if (!confirmar) return;

    const urlFondo = "https://firebasestorage.googleapis.com/v0/b/reservaeldia-7a440.firebasestorage.app/o/plantillas%2Fboda-clasica%2Fportadas%2Fportada.jpg?alt=media&token=d20172d1-974f-4ff8-b1d8-ce29af329b96";
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = urlFondo;

    img.onload = async () => {
      const { width, height } = escalarProporcionadamente(img.width, img.height);

      const fondo = {
        id: "fondo",
        tipo: "imagen",
        src: urlFondo,
        x: 0,
        y: 0,
        width,
        height,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      };

      try {
        const functions = getFunctions();
        const crearPlantilla = httpsCallable(functions, "crearPlantilla");

        const res = await crearPlantilla({
          id: "Nueva plantilla creada",
          datos: {
            nombre: "Nueva Plantilla",
            tipo: "boda",
            editor: "konva",
            portada: "https://reservaeldia.com.ar/img/previews/boda-parallax.jpg",
            objetos: [
              fondo,
              {
                id: "titulo1",
                tipo: "texto",
                texto: "¡Nos Casamos!",
                x: 100,
                y: 200,
                fontSize: 48,
                color: "#773dbe",
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                fontFamily: "sans-serif"
              },
              {
                id: "nombres",
                tipo: "texto",
                texto: "Euge & Agus",
                x: 100,
                y: 280,
                fontSize: 64,
                color: "#333",
                scaleX: 1,
                scaleY: 1,
                fontFamily: "sans-serif"
              }
            ]
          }
        });

        console.log("✅ Plantilla creada:", res.data);
        alert("✅ Plantilla creada con éxito");
      } catch (error) {
        console.error("❌ Error al crear la plantilla:", error);
        alert("Ocurrió un error al crear la plantilla");
      }
    };
  };


  return (
    <div className="flex h-screen bg-gray-100">
      
      {/* Sidebar */}
      <aside className={`bg-purple-800 text-white transition-all duration-300 ${sidebarAbierta ? "w-64" : "w-16"} flex flex-col`}>
        <div className="flex items-center justify-between p-4 border-b border-purple-700">
          <button onClick={() => setSidebarAbierta(!sidebarAbierta)}>
            <FaBars className="text-white text-xl" />
          </button>
          {sidebarAbierta && <span className="ml-2 font-bold">Menú</span>}
        </div>
        {sidebarAbierta && (
          <nav className="p-4">
            <ul className="space-y-2">
              <li><Link href="/dashboard">DashboardDD</Link></li>
              <li>
              <button
                onClick={ejecutarCrearPlantilla}
                className="w-full text-left text-white hover:underline"
              >
                ✨ Crear plantilla
              </button>
            </li>

            </ul>
<Link
                href="#"
                onClick={async () => {
                  const confirmar = confirm("¿Seguro que querés borrar TODOS tus borradores?");
                  if (!confirmar) return;

                  try {
                    const functions = getFunctions();
                    const borrarTodos = httpsCallable(functions, "borrarTodosLosBorradores");
                    await borrarTodos();

                    alert("✅ Todos los borradores fueron eliminados.");
                    window.location.reload(); // recarga la vista
                  } catch (error) {
                    console.error("❌ Error al borrar todos los borradores", error);
                    alert("No se pudieron borrar los borradores.");
                  }
                }}
                style={{ textDecoration: 'none', color: 'white' }}
              >
                🗑️ Borrar todos los borradores
              </Link>
            </nav>
        )}
        
      </aside>

      {/* Área principal */}
      <main className="flex-1 overflow-y-auto p-4">
        {children}
      </main>
    </div>
  );
}
