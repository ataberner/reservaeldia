export function escapeHTML(texto: string = ""): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function generarHTMLDesdeObjetos(
  objetos: any[],
  secciones: { id: string; altura: number }[]
): string {

  const mapaAltura = Object.fromEntries(secciones.map(s => [s.id, s.altura]));

  return objetos.map((obj) => {
    const left = (obj.x / 800) * 100;
    const alturaSeccion = mapaAltura[obj.seccionId];
    const top = (obj.y / mapaAltura[obj.seccionId]) * 100;


    const width = obj.width ? `${(obj.width / 800) * 100}%` : "auto";
    const height = obj.height ? `${(obj.height / alturaSeccion) * 100}%` : "auto";
    const fontSize = obj.fontSize ? `${(obj.fontSize)}px` : "inherit";


    const rotacion = obj.rotation ?? 0;
    const scaleX = obj.scaleX ?? 1;
    const scaleY = obj.scaleY ?? 1;

    if (obj.tipo === "texto") {
      return `<div class="objeto" style="
        top: ${top}%;
        left: ${left}%;
        font-size: ${fontSize};
        color: ${obj.color || "#000"};
        font-family: ${obj.fontFamily || "inherit"};
        transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
        max-width: ${width};
      ">${escapeHTML(obj.texto)}</div>`;
    }

    if (obj.tipo === "imagen" || obj.tipo === "icono") {
      return `<img class="objeto" src="${obj.src}" style="
        top: ${top}%;
        left: ${left}%;
        width: ${width};
        height: ${height};
        transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
        object-fit: contain;
      " />`;
    }

    if (obj.tipo === "icono-svg" && obj.d) {
      return `<svg class="objeto" viewBox="0 0 100 100" style="
        top: ${top}%;
        left: ${left}%;
        width: ${width};
        height: ${height};
        transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
        fill: ${obj.color || "#000"};
      ">
        <path d="${obj.d}" />
      </svg>`;
    }

    if (obj.tipo === "forma") {
      const fill = obj.color || "#000";
      const figura = obj.figura;

      switch (figura) {
        case "rect": {
          const w = `${(obj.width ?? 100) / 800 * 100}%`;
          const h = `${(obj.height ?? 100) / alturaSeccion * 100}%`;

          return `<div class="objeto" style="
            top: ${top}%;
            left: ${left}%;
            width: ${w};
            height: ${h};
            background: ${fill};
            transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
          "></div>`;
        }

        case "circle": {
            const radius = obj.radius ?? 50;
            const diameter = radius * 2;
            const topCircle = ((obj.y - radius) / alturaSeccion) * 100;
            const leftCircle = ((obj.x - radius) / 800) * 100;
            const widthPct = `${(diameter / 800) * 100}%`;
            const heightPct = `${(diameter / alturaSeccion) * 100}%`;

            return `<div class="objeto" style="
              top: ${topCircle}%;
              left: ${leftCircle}%;
              width: ${widthPct};
              height: ${heightPct};
              border-radius: 50%;
              background: ${fill};
              transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
              transform-origin: center center;
            "></div>`;
          }


        case "line": {
          const w = `${(obj.width ?? 100) / 800 * 100}%`;
          const h = `${(obj.height ?? 4) / alturaSeccion * 100}%`;

          return `<div class="objeto" style="
            top: ${top}%;
            left: ${left}%;
            width: ${w};
            height: ${h};
            background: ${fill};
            transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
          "></div>`;
        }


    
 case "triangle": {
  const base = obj.base ?? 120;
  const heightTri = (base * Math.sqrt(3)) / 2;

  // 🔧 Ajuste visual leve: bajamos 2% y achicamos 5% verticalmente
// Ajustes visuales
  const ajusteAlto = 0.9;
  const ajusteAncho = 0.9;
  const correccionTop = 5; // en %

  const topTriangle = ((obj.y - (heightTri * ajusteAlto) / 2) / alturaSeccion) * 100 + correccionTop;
  const leftTriangle = ((obj.x - (base * ajusteAncho) / 2) / 800) * 100;

  const widthPct = `${((base * ajusteAncho) / 800) * 100}%`;
  const heightPct = `${((heightTri * ajusteAlto) / alturaSeccion) * 100}%`;

  return `<div class="objeto" style="
    top: ${topTriangle}%;
    left: ${leftTriangle}%;
    width: ${widthPct};
    height: ${heightPct};
    background: ${fill};
    clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
    transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
    transform-origin: center center;
    backface-visibility: hidden;
    transform-style: preserve-3d;
  "></div>`;
}





        default:
          return "";
      }
    }

    return "";
  }).join("\n");
}
