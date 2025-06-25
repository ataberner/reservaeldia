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
  
  return `<div class="objeto" style="
    top: ${top}%;
    left: ${left}%;
    width: ${w};
    height: 2px;
    background: ${fill};
    transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
  "></div>`;
}


    
case "triangle": {
  const radius = obj.radius || 60;
  
  // 🎯 CÁLCULO PRECISO: En Konva RegularPolygon con sides=3
  // Los vértices están en ángulos: 270°, 30°, 150° (empezando desde arriba)
  // Vértice superior: (0, -radius)
  // Vértices inferiores: (-radius*sin(60°), radius*cos(60°)) y (radius*sin(60°), radius*cos(60°))
  
  const sin60 = Math.sqrt(3) / 2; // ≈ 0.866
  const cos60 = 0.5;
  
  // Dimensiones reales del triángulo
  const triangleWidth = 2 * radius * sin60; // Ancho total
  const triangleHeight = radius * (1 + cos60); // Altura total (desde vértice superior hasta base)
  
  // El centro del triángulo está a 1/3 de la altura desde la base
  const centroidOffsetY = triangleHeight / 3;
  
  // En Konva, obj.y es el centro del triángulo
  // En HTML, necesitamos la esquina superior izquierda del contenedor
  const topContainer = obj.y - (triangleHeight - centroidOffsetY); // Desde centro hasta top del contenedor
  const leftContainer = obj.x - (triangleWidth / 2); // Desde centro hasta left del contenedor
  
  // Convertir a porcentajes
  const topTriangle = (topContainer / alturaSeccion) * 100;
  const leftTriangle = (leftContainer / 800) * 100;
  const widthPct = `${(triangleWidth / 800) * 100}%`;
  const heightPct = `${(triangleHeight / alturaSeccion) * 100}%`;

  return `<div class="objeto" style="
    top: ${topTriangle}%;
    left: ${leftTriangle}%;
    width: ${widthPct};
    height: ${heightPct};
    background: ${fill};
    clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
    transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
    transform-origin: center center;
  "></div>`;
}





        default:
          return "";
      }
    }

    return "";
  }).join("\n");
}
