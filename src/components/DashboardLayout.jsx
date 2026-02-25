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
  vista,
  onCambiarVista,
  ocultarSidebar = false,
  canManageSite,
  isSuperAdmin,
  loadingAdminAccess,
  lockMainScroll = false,
}) {
  useEffect(() => {
    corregirURLsInvalidas(); // Corrige URLs invalidas al entrar
  }, []);

  const headerHeight = "var(--dashboard-header-height, 52px)";
  const mainBaseClass = modoSelector
    ? "absolute left-0 right-0 bg-gray-50"
    : "flex-1 px-2 pb-2 pt-2 sm:px-4 sm:pb-4 sm:pt-3";
  const mainScrollClass = lockMainScroll ? "overflow-hidden" : "overflow-y-auto";
  const mainStyle = modoSelector
    ? {
        top: headerHeight,
        height: `calc(100vh - ${headerHeight})`,
        transform: "translateZ(0)",
        zIndex: 0,
      }
    : {
        marginTop: headerHeight,
        height: `calc(100vh - ${headerHeight})`,
      };

  if (lockMainScroll) {
    mainStyle.overscrollBehavior = "none";
    mainStyle.touchAction = "none";
  }

  return (
    <div className="relative flex h-screen bg-gray-100">
      {/* Barra superior */}
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
        vistaActual={vista}
        onCambiarVista={onCambiarVista}
        canManageSite={canManageSite}
        isSuperAdmin={isSuperAdmin}
        loadingAdminAccess={loadingAdminAccess}
      />

      {/* Sidebar */}
      {!ocultarSidebar && (
        <DashboardSidebar
          modoSelector={modoSelector}
          mostrarMiniToolbar={mostrarMiniToolbar}
          seccionActivaId={seccionActivaId}
        />
      )}

      {/* Area principal */}
      <main
        data-dashboard-scroll-root="true"
        className={`${mainBaseClass} ${mainScrollClass}`}
        style={mainStyle}
      >
        {children}
      </main>
    </div>
  );
}
