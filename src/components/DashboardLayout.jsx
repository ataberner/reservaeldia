// src/components/DashboardLayout.jsx
import { useState, useEffect } from "react";
import { FaBars, FaLock, FaLockOpen } from "react-icons/fa";
import Link from "next/link";
import { getFunctions, httpsCallable } from "firebase/functions";
import useImage from "use-image";
import MiniToolbar from "./MiniToolbar";
import GaleriaDeImagenes from "@/components/GaleriaDeImagenes";
import useUploaderDeImagen from "@/hooks/useUploaderDeImagen";
import useMisImagenes from "@/hooks/useMisImagenes";
import PanelDeFormas from "@/components/PanelDeFormas";


import { corregirURLsInvalidas } from "@/utils/corregirImagenes";







function escalarParaAncho(imgWidth, imgHeight, canvasWidth = 800) {
  const ratio = imgHeight / imgWidth;
  const width = canvasWidth;
  const height = width * ratio;
  
  return { width, height };
}


export default function DashboardLayout({ children, mostrarMiniToolbar }) {
  const [hoverSidebar, setHoverSidebar] = useState(false);
  const [fijadoSidebar, setFijadoSidebar] = useState(false);
    const [mostrarGaleria, setMostrarGaleria] = useState(false);
const [imagenesSeleccionadas, setImagenesSeleccionadas] = useState(0);
const [mostrarPanelFormas, setMostrarPanelFormas] = useState(false);
const [modoFormasCompleto, setModoFormasCompleto] = useState(false);

useEffect(() => {
  corregirURLsInvalidas(); // 🔧 Se ejecuta automáticamente al entrar
}, []);


const {
  imagenes,
  imagenesEnProceso,
  cargarImagenes,
  subirImagen,
  borrarImagen,
  hayMas,
  cargando,
} = useMisImagenes();

const { abrirSelector, componenteInput } = useUploaderDeImagen(subirImagen);



    useEffect(() => {
        const handleClickFuera = (e) => {
          const sidebar = document.querySelector("aside");
          if (!sidebar) return;

          if (!sidebar.contains(e.target) && !fijadoSidebar) {
            setHoverSidebar(false);
          }
        };

        document.addEventListener("mousedown", handleClickFuera);
        return () => document.removeEventListener("mousedown", handleClickFuera);
      }, [fijadoSidebar]);

  

  const ejecutarCrearPlantilla = async () => {
    const confirmar = confirm("¿Querés crear la plantilla?");
    if (!confirmar) return;

    const urlFondo = "https://firebasestorage.googleapis.com/v0/b/reservaeldia-7a440.firebasestorage.app/o/plantillas%2Fboda-clasica%2Fportadas%2Fportada.jpg?alt=media&token=d20172d1-974f-4ff8-b1d8-ce29af329b96";
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = urlFondo;

    img.onload = async () => {
      const { width, height } = escalarParaAncho(img.width, img.height);


      const fondo = {
        id: "fondo",
        tipo: "imagen",
        src: urlFondo,
        x: 0,
        y: 0,
        rotation: 0,
        esFondo: true
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
                fontSize: 20,
                color: "#773dbe",
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                fontFamily: "sans-serif",
                fontWeight: "normal",    // Controla negrita (bold)
                fontStyle: "normal",     // Controla cursiva (italic)
                textDecoration: "none",  // Controla subrayado (underline)
                textAlign: "left",       // Alineación del texto
                lineHeight: 1.2          // Espaciado entre líneas
              },
              {
                id: "nombres",
                tipo: "texto",
                texto: "Euge & Agus",
                x: 100,
                y: 280,
                fontSize: 24,
                color: "#333",
                scaleX: 1,
                scaleY: 1,
                fontFamily: "sans-serif",
                fontWeight: "normal",    // Controla negrita (bold)
                fontStyle: "normal",     // Controla cursiva (italic)
                textDecoration: "none",  // Controla subrayado (underline)
                textAlign: "left",       // Alineación del texto
                lineHeight: 1.2          // Espaciado entre líneas
              },
              {
              id: "hoja",
              tipo: "imagen",
              src: "https://firebasestorage.googleapis.com/v0/b/reservaeldia-7a440.firebasestorage.app/o/plantillas%2Fboda-clasica%2Fimg%2Fhoja-portada.png?alt=media&token=f7c2abf4-86f2-480a-9566-116f56435409",
              x: 100,
              y: 300,
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

const sidebarAbierta = fijadoSidebar || hoverSidebar;

  return (
    <div className="flex h-screen bg-gray-100">
      

              {/* Sidebar */}  

              {componenteInput} {/* input invisible que va a manejar la carga */}

              <aside
          onMouseEnter={() => setHoverSidebar(true)}
          onMouseLeave={() => {
  if (
    typeof window !== "undefined" &&
    (window.modoEdicionCanvas || imagenesSeleccionadas > 0)
  ) return;
  setHoverSidebar(false);
}}



          className={`bg-gradient-to-b from-purple-800 via-purple-900 to-purple-950 text-white transition-all duration-300 shadow-xl
    ${sidebarAbierta ? "w-80" : "w-16"} px-0 py-2 flex flex-col gap-2`}
        >


<div className="p-4 border-purple-700 flex flex-col gap-4">
  {/* Menú */}
  <div
    className="flex items-center justify-start h-12 cursor-pointer transition"
    onClick={() => setFijadoSidebar(!fijadoSidebar)}
  >
    <FaBars className="text-white text-xl flex-shrink-0" />
    {sidebarAbierta && (
      <>
        <span className="font-bold px-2">Menú</span>
        {fijadoSidebar ? (
          <FaLock className="text-white text-sm ml-1" title="Fijado" />
        ) : (
          <FaLockOpen className="text-white text-sm ml-1" title="No fijado" />
        )}
      </>
    )}
  </div>

  {/* Toolbar + Panel */}
  <div className="flex flex-col gap-2 w-full">
   {modoFormasCompleto ? (
  <>
     <button
      onClick={() => setModoFormasCompleto(false)}
      className="text-left text-sm text-white underline mb-2"
    >
      ← Formas
    </button>

    <div className="flex-1 overflow-y-auto pr-2">
      <PanelDeFormas
        abierto={true}
        sidebarAbierta={sidebarAbierta}
        onInsertarForma={(obj) => {
          window.dispatchEvent(new CustomEvent("insertar-imagen", { detail: obj }));
        }}
        onInsertarIcono={(obj) => {
          window.dispatchEvent(new CustomEvent("insertar-imagen", { detail: obj }));
        }}
      />
    </div>
  </>
) : (
  <MiniToolbar
    visible={mostrarMiniToolbar}
    sidebarAbierta={sidebarAbierta}
    onAgregarTexto={(e) => {
      e?.stopPropagation?.();
      window.dispatchEvent(new CustomEvent("agregar-cuadro-texto"));
    }}
    onAgregarForma={(e) => {
      e?.stopPropagation?.();
      setModoFormasCompleto(true); // 🟣 Entrar a modo "formulario completo"
    }}
    onAgregarImagen={() => setMostrarGaleria((prev) => !prev)}
    cerrarSidebar={!fijadoSidebar ? () => setHoverSidebar(false) : undefined}
    galeriaAbierta={mostrarGaleria}
    mostrarPanelFormas={false}
    PanelDeFormasComponent={null}
  />
)}

  




  
</div>



  {mostrarGaleria && (
    <div
      className="text-sm text-white overflow-hidden transition-all duration-300 ease-in-out"
      style={{
        maxHeight: "600px",
        opacity: 1,
        transition: "max-height 0.3s ease, opacity 0.3s ease",
      }}
    >
    <div className="flex flex-col items-start gap-2 transition-all duration-300">
        {/* Botón para subir imagen */}
        <button
          onClick={abrirSelector}
          className="bg-white text-purple-800 px-3 py-1 rounded hover:bg-purple-200 transition text-sm"
        >
          Subir imagen
        </button>


      {/* Galería */}
     <GaleriaDeImagenes
    imagenes={imagenes}
  imagenesEnProceso={imagenesEnProceso}
  cargarImagenes={cargarImagenes}
  borrarImagen={borrarImagen}
  hayMas={hayMas}
  cargando={cargando}
  onInsertar={(nuevo) => {
    window.dispatchEvent(new CustomEvent("insertar-imagen", { detail: nuevo }));
    setMostrarGaleria(false);
  }}
  onSeleccionadasChange={setImagenesSeleccionadas}
/>



      {/* Crear plantilla */}
      <button
        onClick={ejecutarCrearPlantilla}
        className="hover:underline"
      >
        ✨ Crear plantilla
      </button>

      {/* Borrar todos */}
      <button
        onClick={async () => {
          const confirmar = confirm("¿Seguro que querés borrar TODOS tus borradores?");
          if (!confirmar) return;

          try {
            const functions = getFunctions();
            const borrarTodos = httpsCallable(functions, "borrarTodosLosBorradores");
            await borrarTodos();
            alert("✅ Todos los borradores fueron eliminados.");
            window.location.reload();
          } catch (error) {
            console.error("❌ Error al borrar todos los borradores", error);
            alert("No se pudieron borrar los borradores.");
          }
        }}
        className="hover:underline"
      >
        🗑️ Borrar todos los borradores
      </button>
    </div>
  </div>
)}
</div>

        
      </aside>

      {/* Área principal */}
      <main className="flex-1 overflow-y-auto p-4">
        {children}
      </main>
    </div>
  );
}
