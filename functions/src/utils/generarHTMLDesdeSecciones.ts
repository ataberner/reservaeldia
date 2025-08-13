import { calcularTopPorSeccion } from "./calcularTopPorSeccion";
import { generarHTMLDesdeObjetos } from "./generarHTMLDesdeObjetos";
import { CANVAS_BASE } from "../models/dimensionesBase";
type RSVPConfig = { enabled?: boolean };


const EXCLUDE_FONTS = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui",
  "Arial", "Helvetica", "Times", "Times New Roman", "Georgia", "Courier New"
]);

function buildGoogleFontsLink(fonts: string[]): string {
  const familias = fonts
    .map(f => f.replace(/['"]/g, "").split(",")[0].trim())   // "Great Vibes"
    .filter(n => n && !EXCLUDE_FONTS.has(n))
    .map(n => `family=${n.replace(/ /g, "+")}`)             // ← sin encodeURIComponent
    .join("&");

  if (!familias) return "";

  return `
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${familias}&display=swap" rel="stylesheet">`.trim();
}






export function generarHTMLDesdeSecciones(
  secciones: any[],
  objetos: any[],
  rsvp?: RSVPConfig,
  opts?: {
    slug?: string;
    firebaseConfig?: {
      apiKey: string;
      authDomain: string;
      projectId: string;
      appId: string;
      storageBucket?: string;
      messagingSenderId?: string;
      measurementId?: string;
    };
  }
): string {

  const alturaTotal = secciones.reduce((acc, s) => acc + s.altura, 0);

  // 🔍 Detectar familias que aparecen en objetos de texto
  const fuentesUsadas = [
    ...new Set(
      objetos
        .filter(o => o.tipo === "texto" && o.fontFamily)
        .map(o => o.fontFamily)          // puede venir "Poppins, sans-serif"
    ),
  ];

  const googleFontsLink = buildGoogleFontsLink(fuentesUsadas);

  const slugPublica = opts?.slug ?? "";
  const firebaseConfigJson = JSON.stringify(opts?.firebaseConfig || null);

  const topPorSeccion = calcularTopPorSeccion(secciones);

  const htmlSecciones = secciones.map((seccion, index) => {
    const offsetTop = topPorSeccion[seccion.id];
    const topPercent = (offsetTop / alturaTotal) * 100;
    const heightPercent = (seccion.altura / alturaTotal) * 100;


    const contenido = generarHTMLDesdeObjetos(
      objetos.filter((o) => o.seccionId === seccion.id),
      secciones
    );

    // 🧠 NUEVA LÓGICA: Detectar tipo de fondo
    const fondoValue = seccion.fondo || "transparent";
    const esImagenFondo = seccion.fondoTipo === "imagen" && seccion.fondoImagen;

    // 🎨 APLICAR ESTILOS CORRECTOS
    let estilosFondo = "";
    if (esImagenFondo) {
      // 🔥 VERIFICAR URL Y HACER PÚBLICA
      let imageUrl = seccion.fondoImagen;



      // Si es una URL de Firebase Storage, asegurarse que tenga el token público
      if (imageUrl && imageUrl.includes('firebasestorage.googleapis.com') && !imageUrl.includes('alt=media')) {
        imageUrl = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 'alt=media';
      }



      // Calcular posición basada en los offsets X e Y
      let backgroundPosition = 'center center';

      if (seccion.fondoImagenOffsetX !== undefined || seccion.fondoImagenOffsetY !== undefined) {
        const offsetX = seccion.fondoImagenOffsetX || 0;
        const offsetY = seccion.fondoImagenOffsetY || 0;



        // 🔥 CORREGIR CÁLCULO: Los offsets negativos mueven la imagen hacia arriba/izquierda
        // Los offsets positivos mueven la imagen hacia abajo/derecha
        const offsetXPercent = offsetX !== 0 ? `calc(50% - ${-offsetX}px)` : '50%';
        const offsetYPercent = offsetY !== 0 ? `calc(50% - ${-offsetY}px)` : '50%';

        backgroundPosition = `${offsetXPercent} ${offsetYPercent}`;


      }

      // 🔥 USAR COMILLAS SIMPLES PARA EVITAR CONFLICTOS
      estilosFondo = `background-image: url('${imageUrl}'); background-size: cover; background-position: ${backgroundPosition}; background-repeat: no-repeat;`;

    } else if (fondoValue.startsWith("http") || fondoValue.startsWith("data:") || fondoValue.startsWith("blob:")) {
      // Compatibilidad con el sistema anterior
      let imageUrl = fondoValue.replace('url(', '').replace(')', '');

      if (imageUrl.includes('firebasestorage.googleapis.com') && !imageUrl.includes('alt=media')) {
        imageUrl = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 'alt=media';
      }

      // 🔥 USAR COMILLAS SIMPLES PARA EVITAR CONFLICTOS
      estilosFondo = `background-image: url('${imageUrl}'); background-size: cover; background-position: center center; background-repeat: no-repeat;`;
    } else {
      estilosFondo = `background: ${fondoValue};`;
    }


    // 🎯 CONSTRUIR ESTILOS DE FORMA SEGURA
    const estilosSeccion = [
      `top: ${topPercent}%`,
      `height: ${heightPercent}%`,
      `width: 100%`,
      estilosFondo.replace(/\s+/g, ' ').trim()
    ].join('; ');


    return `
  <div class="seccion" style="${estilosSeccion}">
    ${contenido}
  </div>
`;
  }).join("\n");


  // modal HTML oculto listo para usar
const modalRSVP = `
<div id="modal-rsvp" aria-hidden="true" style="
  position: fixed; inset: 0; display: none;
  align-items: center; justify-content: center;
  background: rgba(0,0,0,.6); z-index: 9999;
">
  <div style="
    background: #fff; padding: 24px; border-radius: 12px;
    width: 92%; max-width: 420px; box-shadow: 0 12px 32px rgba(0,0,0,.25);
    font-family: Inter, system-ui, sans-serif; display: flex; flex-direction: column; gap: 12px;
  ">
    <h2 style="font-size: 20px; font-weight: 700;">Confirmar asistencia</h2>

    <label style="font-size: 12px; color: #555;">Nombre*</label>
    <input id="rsvp-nombre" data-rsvp-nombre placeholder="Tu nombre"
           style="padding: 10px; border: 1px solid #ddd; border-radius: 8px;" />

    <label style="font-size: 12px; color: #555;">Cantidad de asistentes</label>
    <input id="rsvp-cantidad" data-rsvp-cantidad type="number" min="1" value="1"
           style="padding: 10px; border: 1px solid #ddd; border-radius: 8px;" />

    <label style="font-size: 12px; color: #555;">Mensaje (opcional)</label>
    <input id="rsvp-mensaje" data-rsvp-mensaje placeholder="¿Querés dejar algún mensaje?"
           style="padding: 10px; border: 1px solid #ddd; border-radius: 8px;" />

    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
      <button data-rsvp-close
              style="padding:10px 12px; background:#eee; border:none; border-radius:8px;">Cancelar</button>
      <button id="rsvp-submit" data-rsvp-submit
              style="padding:10px 14px; background:#773dbe; color:#fff; border:none; border-radius:8px;">Enviar</button>
    </div>
  </div>
</div>
`;



// Forzá ON salvo que te lo pidan OFF (si lo necesitás para habilitar/deshabilitar el script)
const cfgRSVP: RSVPConfig = { enabled: true, ...(rsvp ?? {}) };

  // 🔌 Script inline para manejar el envío del RSVP en el HTML estático
const scriptRSVP = `
<script type="module">
  (async () => {
    const SLUG = ${JSON.stringify(slugPublica)};
    const CONFIG = ${firebaseConfigJson};

    console.log("[RSVP] Script embebido cargado", { slug: SLUG, hasConfig: !!CONFIG });
    if (!CONFIG) { console.error("[RSVP] Falta firebaseConfig"); return; }

    const [{ initializeApp }, { getFirestore, collection, addDoc, serverTimestamp }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"),
    ]);
    const app = initializeApp(CONFIG);
    const db  = getFirestore(app);

    // Referencias fijas (porque ahora sí existe el modal en el DOM)
    const modal        = document.getElementById("modal-rsvp");
    const inputNombre  = modal?.querySelector("#rsvp-nombre");
    const inputCantidad= modal?.querySelector("#rsvp-cantidad");
    const inputMensaje = modal?.querySelector("#rsvp-mensaje");
    const btnSubmit    = modal?.querySelector("#rsvp-submit");
    const btnClose     = modal?.querySelector("[data-rsvp-close]");

    // Botón que ya existe en tu HTML: #abrirModalRSVP (lo vi en tu dump de HTML)
    const abrirBtn = document.getElementById("abrirModalRSVP") 
                  || document.querySelector("[data-rsvp-open], [data-accion='abrir-rsvp']");

    const abrirModal = () => { if (modal) { modal.style.display = "flex"; modal.setAttribute("aria-hidden","false"); } };
    const cerrarModal = () => { if (modal) { modal.style.display = "none"; modal.setAttribute("aria-hidden","true"); } };

    abrirBtn?.addEventListener("click", (e) => { e.preventDefault?.(); abrirModal(); });
    btnClose?.addEventListener("click", cerrarModal);
    modal?.addEventListener("click", (e) => { if (e.target === modal) cerrarModal(); }); // click en overlay

    if (btnSubmit) {
      btnSubmit.addEventListener("click", async () => {
        try {
          const nombre   = (inputNombre?.value || "").trim();
          const cantidad = parseInt((inputCantidad?.value || "1"), 10) || 1;
          const mensaje  = (inputMensaje?.value || "").trim() || null;

          console.log("[RSVP] Enviando...", { nombre, cantidad, slug: SLUG });
          if (!nombre) { alert("Por favor, ingresá tu nombre."); return; }

          btnSubmit.disabled = true;

          const ref = await addDoc(collection(db, "publicadas", SLUG, "rsvps"), {
            nombre, cantidad, mensaje, slug: SLUG,
            createdAt: serverTimestamp(),
            userAgent: navigator.userAgent
          });

          console.log("[RSVP] Guardado OK:", ref.id);
          alert(\`¡Gracias por confirmar, \${nombre}!\`);
          cerrarModal();
        } catch (e) {
          console.error("[RSVP] Error guardando", e);
          alert("Hubo un error al guardar tu confirmación. Probá de nuevo.");
        } finally {
          btnSubmit.disabled = false;
        }
      });
    } else {
      console.warn("[RSVP] No se encontró #rsvp-submit dentro del modal.");
    }
  })();
</script>
`;



  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Invitación</title>
  ${googleFontsLink}
  <style>
    /* RESETEO COMPLETO PARA MÓVIL */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    html, body {
      width: 100%;
      max-width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      background: white;
      font-family: sans-serif;
      overflow-x: hidden; /* CRÍTICO: evita scroll horizontal */
    }

    .canvas-container {
      width: 100%;
      max-width: 100%;
      height: 100vh;
      display: block; /* NO FLEX para evitar problemas */
      background: white;
      padding: 0;
      margin: 0;
      overflow: hidden; /* CRÍTICO: contiene todo dentro */
    }

    .canvas {
      position: relative;
      width: ${CANVAS_BASE.ANCHO}px;
      height: ${alturaTotal}px;
      background: white;
      transform-origin: top left; /* CAMBIO CRÍTICO: top left en lugar de center */
      margin: 0 auto; /* Centrar horizontalmente */
      overflow: hidden;
    }

    .seccion {
      position: absolute;
      width: 100%;
      overflow: hidden;
    }

    .objeto {
      position: absolute;
      transform-origin: top left;
    }
  </style>
</head>
<body data-slug="${slugPublica}">
  <div class="canvas-container">
    <div class="canvas">
      ${htmlSecciones}
    </div>
  </div>

  ${modalRSVP}
   ${cfgRSVP.enabled ? scriptRSVP : ""}

  <script>
    function ajustarCanvas() {
      const canvas = document.querySelector(".canvas");
      const container = document.querySelector(".canvas-container");
      
      if (!canvas || !container) return;
      
      // USAR document.documentElement.clientWidth en lugar de window.innerWidth
      // Esto excluye las scrollbars del cálculo
      const anchoViewport = document.documentElement.clientWidth;
      const altoViewport = window.innerHeight;
      
      // Calcular factor de escala SIN considerar scrollbars
      let factorEscala = anchoViewport / ${CANVAS_BASE.ANCHO};
      
      // Limitar factor mínimo para legibilidad
      if (factorEscala < 0.2) {
        factorEscala = 0.2;
      }
      
      // APLICAR ESCALA CON ORIGEN ADAPTATIVO
      if (anchoViewport < 768) {
        // Móvil: origen top left para evitar overflow
        canvas.style.transform = \`scale(\${factorEscala})\`;
        canvas.style.transformOrigin = "top left";
        canvas.style.margin = "0";
      } else {
        // Desktop: origen top center para mantener centrado
        canvas.style.transform = \`scale(\${factorEscala})\`;
        canvas.style.transformOrigin = "top center";
        canvas.style.margin = "0 auto";
      }
      
      // Ajustar altura del contenedor
      const alturaEscalada = ${alturaTotal} * factorEscala;
      container.style.height = Math.max(alturaEscalada, altoViewport) + "px";
      
      console.log("📐 SOLUCIÓN VIEWPORT:", {
        clientWidth: anchoViewport,
        innerWidth: window.innerWidth,
        diferencia: window.innerWidth - anchoViewport,
        factorEscala: factorEscala.toFixed(4),
        canvasAncho: ${CANVAS_BASE.ANCHO},
        anchoFinal: (${CANVAS_BASE.ANCHO} * factorEscala).toFixed(0),
        deberiaSer: anchoViewport
      });
    }

    // Ejecutar múltiples veces para asegurar que funcione
    window.addEventListener("load", ajustarCanvas);
    window.addEventListener("resize", ajustarCanvas);
    window.addEventListener("orientationchange", () => {
      setTimeout(ajustarCanvas, 100); // Delay para orientation change
    });
    
    // Ejecutar inmediatamente
    ajustarCanvas();
    
    // Backup: ejecutar después de 500ms por si hay delays
    setTimeout(ajustarCanvas, 500);
  </script>
</body>
</html>
`;
}