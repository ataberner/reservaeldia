// src/components/DashboardLayout.jsx
import { useEffect } from "react";
import DashboardHeader from "./DashboardHeader";
import DashboardSidebar from "./DashboardSidebar";
import { corregirURLsInvalidas } from "@/utils/corregirImagenes";

export default function DashboardLayout({
  children,
  slugInvitacion,
  setSlugInvitacion,
  setModoEditor,
  zoom,
  toggleZoom,
  historialExternos,
  futurosExternos,
  generarVistaPrevia,
  usuario,
  mostrarMiniToolbar,
  seccionActivaId,
  modoSelector = false,
}) {
  useEffect(() => {
    corregirURLsInvalidas(); // 🔧 Corrige URLs inválidas al entrar
  }, []);

  return (
    <div className="flex h-screen bg-gray-100 relative">

      {/* 🔹 Barra superior */}
      <DashboardHeader
        slugInvitacion={slugInvitacion}
        setSlugInvitacion={setSlugInvitacion}
        setModoEditor={setModoEditor}
        zoom={zoom}
        toggleZoom={toggleZoom}
        historialExternos={historialExternos}
        futurosExternos={futurosExternos}
        generarVistaPrevia={generarVistaPrevia}
        usuario={usuario}
      />

      {/* 🔹 Sidebar */}
      <DashboardSidebar
        modoSelector={modoSelector}
        mostrarMiniToolbar={mostrarMiniToolbar}
        seccionActivaId={seccionActivaId}
      />

      {/* 🔹 Área principal */}
      <main
        className={
          modoSelector
            ? "absolute left-0 right-0 overflow-y-auto bg-gray-50"
            : "flex-1 overflow-y-auto p-4 pt-10"
        }
        style={
          modoSelector
            ? {
                top: "50px",
                height: "calc(100vh - 50px)",
                transform: "translateZ(0)",
                zIndex: 0,
              }
            : {}
        }
      >
        {children}
      </main>
    </div>
  );
}