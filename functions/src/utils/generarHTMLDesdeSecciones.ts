import { calcularTopPorSeccion } from "./calcularTopPorSeccion";
import { generarHTMLDesdeObjetos } from "./generarHTMLDesdeObjetos";

export function generarHTMLDesdeSecciones(secciones: any[], objetos: any[]): string {
  const alturaTotal = secciones.reduce((acc, s) => acc + s.altura, 0);
  const topPorSeccion = calcularTopPorSeccion(secciones);

  const htmlSecciones = secciones.map((seccion, index) => {
    const offsetTop = topPorSeccion[seccion.id];

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
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invitación</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: white;
      font-family: sans-serif;
      width: 100%;
      height: 100%;
      overflow-x: hidden;
    }

    .canvas-container {
      width: 100%;
      display: flex;
      justify-content: center;
    }

    .canvas {
      position: relative;
      width: 100%;
      aspect-ratio: ${800 / alturaTotal};
      overflow: hidden;
      background: white;
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
    window.addEventListener("load", () => {
      const canvas = document.querySelector(".canvas");
      const height = canvas.offsetHeight;
      const width = canvas.offsetWidth;
      console.log("📐 Canvas real:", { width, height, aspectRatio: width / height });

      const objetos = document.querySelectorAll(".objeto");
      objetos.forEach((el, i) => {
        const bounds = el.getBoundingClientRect();
        console.log(\`🎯 Objeto \${i}:\`, {
          top: bounds.top.toFixed(2),
          height: bounds.height.toFixed(2),
          relTop: (bounds.top / height * 100).toFixed(2) + '%',
        });
      });
    });
  </script>
</body>
</html>
`;
}