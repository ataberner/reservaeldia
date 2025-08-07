// components/MiniToolbar.jsx
import Image from "next/image";

export default function MiniToolbar({
  visible,
  sidebarAbierta,
  onAgregarTexto,
  onAgregarImagen,
  onAgregarForma,
  cerrarSidebar,
  esFlotante,
  galeriaAbierta,
  mostrarPanelFormas,
  PanelDeFormasComponent,
}) {
  if (!visible) return null;

  return (
    <div
      className="flex flex-col gap-4"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* 🔹 Botón texto */}
      <button
        onClick={(e) => {
          onAgregarTexto(e);
          cerrarSidebar?.();
        }}
        className="flex items-center gap-2 text-black text-sm"
      >
        <div className="w-8 h-8 flex-shrink-0 flex items-center justify-start ml-[-4px]">
          <Image src="/icons/texto.png" width={32} height={32} alt="Texto" />
        </div>
        {esFlotante && <span>Añadir texto</span>}
      </button>

      {/* 🔹 Botón forma */}
      <button
        onClick={(e) => {
          onAgregarForma(e);
        }}
        className="flex items-center gap-2 text-black text-sm"
      >
        <div className="w-8 h-8 flex-shrink-0 flex items-center justify-start ml-[-4px]">
          <Image src="/icons/forma.png" width={32} height={32} alt="Forma" />
        </div>
        {esFlotante && <span>Añadir forma</span>}
      </button>

      {mostrarPanelFormas && PanelDeFormasComponent}

      {/* 🔹 Botón imagen */}
      <button
        onClick={(e) => {
          onAgregarImagen(e);
        }}
        className="flex items-center gap-2 text-black text-sm"
      >
        <div className="w-8 h-8 flex-shrink-0 flex items-center justify-start ml-[-4px]">
          <Image src="/icons/imagen.png" width={32} height={32} alt="Imagen" />
        </div>
        {esFlotante && <span>Abrir galería</span>}
      </button>
    </div>
  );
}
