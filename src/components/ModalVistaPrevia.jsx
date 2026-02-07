import { useState, useEffect, useRef } from 'react';
import { X, RotateCcw, Home, Lock, Star, MoreHorizontal } from 'lucide-react';


export default function ModalVistaPrevia({ visible, onClose, htmlContent, slug }) {
  const [dispositivoActual, setDispositivoActual] = useState('desktop'); // 'desktop' o 'mobile'
  const [iframeKey, setIframeKey] = useState(0);
  const prevDeviceRef = useRef(dispositivoActual);

  useEffect(() => {
    const prev = prevDeviceRef.current;

    // ✅ Solo recargar cuando volvés a escritorio desde móvil
    if (prev === "mobile" && dispositivoActual === "desktop") {
      setIframeKey((k) => k + 1);
    }

    prevDeviceRef.current = dispositivoActual;
  }, [dispositivoActual]);



  const iframeRef = useRef(null);

  useEffect(() => {
    if (!visible) return;

    // Espera 2 frames para que el layout del modal/iframe esté estable
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          iframeRef.current?.contentWindow?.postMessage(
            { type: "RED_RECOMPUTE_LAYOUT" },
            "*"
          );
        } catch { }
      });
    });
  }, [dispositivoActual, visible]);

  useEffect(() => {
    if (visible) setIframeKey((k) => k + 1);
  }, [visible]);


  // 🔥 NUEVO: Manejar tecla ESC
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && visible) {
        onClose();
      }
    };

    if (visible) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevenir scroll del body cuando el modal está abierto
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [visible, onClose]);

  if (!visible) return null;

  const urlSimulada = `https://reservaeldia.com.ar/i/${slug}`;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      {/* Botón Cerrar - Esquina superior izquierda */}
      <button
        onClick={onClose}
        className="absolute top-6 left-6 z-[10000] bg-white/10 hover:bg-white/20 text-white backdrop-blur-md rounded-full p-3 transition-all duration-200 group"
      >
        <X className="w-6 h-6" />
        <span className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-black/80 text-white text-sm px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          Cerrar vista previa (ESC)
        </span>
      </button>

      {/* Selector de dispositivo - Esquina superior derecha */}
      <div className="absolute top-6 right-6 z-[10000] flex gap-2">
        <button
          onClick={() => setDispositivoActual('desktop')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${dispositivoActual === 'desktop'
            ? 'bg-white text-gray-900 shadow-lg'
            : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-md'
            }`}
        >
          🖥️ Escritorio
        </button>
        <button
          onClick={() => setDispositivoActual('mobile')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${dispositivoActual === 'mobile'
            ? 'bg-white text-gray-900 shadow-lg'
            : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-md'
            }`}
        >
          📱 Móvil
        </button>
      </div>

      {/* Ventana del navegador */}
      <div
        className={`bg-white rounded-xl shadow-2xl overflow-hidden transition-[opacity,transform] duration-200 ${dispositivoActual === 'desktop'
          ? 'w-full max-w-6xl h-[85vh]'
          : 'w-full max-w-sm h-[85vh]'
          }`}
      >

        {/* Barra de título del navegador */}
        <div className={`bg-gray-100 border-b border-gray-200 transition-all ${dispositivoActual === 'mobile' ? 'px-2 py-2' : 'px-4 py-3'
          }`}>
          {/* Botones de control (semáforo) */}
          <div className={`flex items-center gap-2 ${dispositivoActual === 'mobile' ? 'mb-2' : 'mb-3'
            }`}>
            <div className={`rounded-full bg-red-500 ${dispositivoActual === 'mobile' ? 'w-2.5 h-2.5' : 'w-3 h-3'
              }`}></div>
            <div className={`rounded-full bg-yellow-500 ${dispositivoActual === 'mobile' ? 'w-2.5 h-2.5' : 'w-3 h-3'
              }`}></div>
            <div className={`rounded-full bg-green-500 ${dispositivoActual === 'mobile' ? 'w-2.5 h-2.5' : 'w-3 h-3'
              }`}></div>
          </div>

          {/* Barra de navegación */}
          <div className={`flex items-center ${dispositivoActual === 'mobile' ? 'gap-1' : 'gap-3'
            }`}>
            {/* Botones de navegación - Ocultos en móvil */}
            {dispositivoActual === 'desktop' && (
              <div className="flex gap-1">
                <button className="p-1.5 rounded hover:bg-gray-200 transition-colors">
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button className="p-1.5 rounded hover:bg-gray-200 transition-colors">
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button className="p-1.5 rounded hover:bg-gray-200 transition-colors">
                  <RotateCcw className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            )}

            {/* Botón hamburguesa solo en móvil */}
            {dispositivoActual === 'mobile' && (
              <button className="p-1 rounded hover:bg-gray-200 transition-colors">
                <MoreHorizontal className="w-3 h-3 text-gray-600" />
              </button>
            )}

            {/* Barra de URL */}
            <div className={`flex-1 bg-white rounded-lg flex items-center gap-1 border ${dispositivoActual === 'mobile' ? 'px-2 py-1' : 'px-4 py-2'
              }`}>
              <Lock className={`text-green-600 ${dispositivoActual === 'mobile' ? 'w-3 h-3' : 'w-4 h-4'
                }`} />
              <span className={`text-gray-700 truncate flex-1 ${dispositivoActual === 'mobile' ? 'text-xs' : 'text-sm'
                }`}>
                {dispositivoActual === 'mobile'
                  ? 'reservaeldia.com.ar/i/...'  // URL acortada para móvil
                  : urlSimulada
                }
              </span>
              {dispositivoActual === 'desktop' && (
                <Star className="w-4 h-4 text-gray-400" />
              )}
            </div>

            {/* Menú de opciones - Solo en desktop */}
            {dispositivoActual === 'desktop' && (
              <button className="p-1.5 rounded hover:bg-gray-200 transition-colors">
                <MoreHorizontal className="w-4 h-4 text-gray-600" />
              </button>
            )}
          </div>
        </div>

        {/* Área de contenido del navegador */}
        <div className="bg-white flex-1 relative overflow-hidden" style={{
          height: dispositivoActual === 'mobile' ? 'calc(100% - 60px)' : 'calc(100% - 80px)'
        }}>
          {htmlContent ? (
            <iframe
              key={iframeKey}
              ref={iframeRef}
              srcDoc={htmlContent}
              className="w-full h-full border-none"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                display: 'block'
              }}
              sandbox="allow-scripts allow-same-origin"
              title="Vista previa de la invitación"
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-50">
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <p className="text-gray-500 text-sm">Cargando vista previa...</p>
              </div>
            </div>
          )}

          {/* Indicador de carga */}
          {!htmlContent && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-gray-600">Generando vista previa...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Información del dispositivo (solo móvil) */}
      {dispositivoActual === 'mobile' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md text-white px-4 py-2 rounded-lg text-sm">
          📱 Vista móvil • 375px de ancho
        </div>
      )}
    </div>
  );
}