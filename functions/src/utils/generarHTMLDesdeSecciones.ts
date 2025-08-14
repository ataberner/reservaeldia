import { calcularTopPorSeccion } from "./calcularTopPorSeccion";
import { generarHTMLDesdeObjetos } from "./generarHTMLDesdeObjetos";
import { CANVAS_BASE } from "../models/dimensionesBase";
import { generarModalRSVPHTML, type RSVPConfig as ModalConfig } from "./generarModalRSVP";


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

type GenerarHTMLOpciones = {
  slug?: string;
};


export function generarHTMLDesdeSecciones(
  secciones: any[],
  objetos: any[],
  rsvp?: ModalConfig,
  opciones?: GenerarHTMLOpciones,       
  opts?: { slug?: string }    
): string {

  const slug = opciones?.slug ?? ""; // <- define slug (vacío si no viene)

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

// ✅ Ver si el canvas tiene un botón RSVP
const hayRSVPEnCanvas = objetos?.some(o => o.tipo === "rsvp-boton");
// Solo mostrar si en el canvas hay botón RSVP
const botonRSVP = hayRSVPEnCanvas
  ? "" // 👈 ya se generará dentro del contenido de la sección por generarHTMLDesdeObjetos
  : "";

// El modal solo se inyecta si hay botón RSVP en canvas
const modalRSVP = hayRSVPEnCanvas && rsvp?.enabled
  ? generarModalRSVPHTML(rsvp)
  : "";
 



  return `
<!DOCTYPE html>
<html lang="es"${slug ? ` data-slug="${slug}"` : ""}>
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

 ${botonRSVP}
 ${modalRSVP}
 
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