// components/MiniToolbar.jsx
import Image from "next/image";

export default function MiniToolbar({
  visible,
  sidebarAbierta,
  onAgregarTexto,
  onAgregarImagen,
  onAgregarForma,
  cerrarSidebar,
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
      <button
          onClick={(e) => {
          onAgregarTexto(e);
          cerrarSidebar?.();
        }}
        className="flex items-center gap-2 text-white text-sm"
      >
        <div className="w-8 h-8 flex-shrink-0 flex items-center justify-start pl-0 ml-[-4px]">
        <Image src="/icons/texto.png" width={32} height={32} alt="Texto" />
        </div>
        {sidebarAbierta && <span>Añadir una caja de texto</span>}
      </button>

      <button
        onClick={(e) => {
          onAgregarForma(e);
        }}
        className="flex items-center gap-2 text-white text-sm"
      >
        <div className="w-8 h-8 flex-shrink-0 flex items-center justify-start pl-0 ml-[-4px]">
        <Image src="/icons/forma.png" width={32} height={32} alt="Forma" />
        </div>
        {sidebarAbierta && <span>Añadir una forma</span>}
      </button>
      {mostrarPanelFormas && PanelDeFormasComponent}

      <button
        onClick={(e) => {
          onAgregarImagen(e);
        }}
        className="flex items-center gap-2 text-white text-sm"
      >
        <div className="w-8 h-8 flex-shrink-0 flex items-center justify-start pl-0 ml-[-4px]">
        <Image src="/icons/imagen.png" width={32} height={32} alt="Imagen" />
        </div>
        {sidebarAbierta && (
                <span>
                    {galeriaAbierta ? "Ocultar imágenes ⬆️" : "Añadir una imagen ⬇️"}
                </span>
                )}

      </button>
    </div>
  );
}
