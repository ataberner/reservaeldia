import { calcularTopPorSeccion } from "./calcularTopPorSeccion";
import { generarHTMLDesdeObjetos } from "./generarHTMLDesdeObjetos";
import { CANVAS_BASE } from "../models/dimensionesBase";

export function generarHTMLDesdeSecciones(secciones: any[], objetos: any[]): string {
  const alturaTotal = secciones.reduce((acc, s) => acc + s.altura, 0);
  const topPorSeccion = calcularTopPorSeccion(secciones);

  const htmlSecciones = secciones.map((seccion, index) => {
    const offsetTop = topPorSeccion[seccion.id];
    
    // Calcular posición y altura como porcentajes del total
    const topPercent = (offsetTop / alturaTotal) * 100;
    const heightPercent = (seccion.altura / alturaTotal) * 100;

    const contenido = generarHTMLDesdeObjetos(
      objetos.filter((o) => o.seccionId === seccion.id),
      secciones 
    );

    return `
      <div class="seccion" style="
        top: ${topPercent}%;
        height: ${heightPercent}%;
        width: 100%;
        background: ${seccion.fondo || "transparent"};
      ">
        ${contenido}
      </div>
    `;
  }).join("\n");

return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Invitación</title>
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
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }

    .objeto {
      position: absolute;
      transform-origin: top left;
    }
  </style>
</head>
<body>
  <div class="canvas-container">
    <div class="canvas">
      ${htmlSecciones}
    </div>
  </div>

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