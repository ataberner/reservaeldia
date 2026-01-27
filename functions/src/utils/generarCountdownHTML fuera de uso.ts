// utils/generarCountdownHTML.ts
type CountdownObj = {
  id: string;
  tipo: "countdown";
  x: number; y: number; ancho: number; alto: number;
  seccionId: string;
  // props específicos
  targetISO: string;        // "2025-12-25T19:00:00-03:00"
  preset?: "pills" | "flip" | "minimal";
  fontFamily?: string;
  fontSize?: number;        // px
  colorTexto?: string;      // #111
  bg?: string | null;       // fondo del contenedor si aplica en preset
  radius?: number;          // border-radius px (para pills)
  letterSpacing?: number;   // opcional
  fontWeight?: number;      // 400..800
};

const safe = (v: any) => (v ?? "");

export function generarCountdownHTML(
  obj: CountdownObj,
  left: number,
  top: number,
  width: string,
  height: string
) {
  // contenedor con posición absoluta (NO tocamos el layout global)
  const fontFamily = safe(obj.fontFamily) || "Inter, system-ui, sans-serif";
  const fontSize = Number(obj.fontSize ?? 16);
  const color = safe(obj.colorTexto) || "#111";
  const bg = obj.bg ? `background:${obj.bg};` : "";
  const radius = Number(obj.radius ?? 8);
  const ls = Number.isFinite(obj.letterSpacing) ? `letter-spacing:${obj.letterSpacing}px;` : "";
  const fw = Number.isFinite(obj.fontWeight) ? `font-weight:${obj.fontWeight};` : "";

  // Nota: data-attrs para que el script global lo inicialice.
  // data-preset controla el “look” básico; el CSS mínimo lo agregamos inline aquí.
  const html = `
<div 
  id="${obj.id}"
  data-countdown 
  data-target="${safe(obj.targetISO)}" 
  data-preset="${safe(obj.preset) || "pills"}"
  style="
    position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;
    display:flex;align-items:center;justify-content:center;
    ${bg}
    border-radius:${radius}px;
    overflow:hidden;
    font-family:${fontFamily};
    color:${color};
    ${fw}
  "
>
  <div class="cd-row" style="
    width:100%;height:100%;
    display:flex;gap:8px;align-items:center;justify-content:center;
    font-size:${fontSize}px;${ls}
  ">
    <!-- Estructura inicial: el script reemplaza los valores cada segundo -->
    ${renderChip("Días")}
    ${renderChip("Horas")}
    ${renderChip("Min")}
    ${renderChip("Seg")}
  </div>
</div>
`.trim();

  return html;
}

function renderChip(label: string) {
  // Chip base. Para preset "pills" se ve con fondo suave mediante estilos inline del contenedor (bg)
  // y si es "minimal" o "flip", el script puede ajustar clases si querés más adelante.
  return `
  <div class="cd-chip" style="
    min-width:52px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:8px;
    display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.1;
    background:rgba(255,255,255,.8); backdrop-filter:saturate(1.1);
  ">
    <span class="cd-val" style="font-weight:700;">00</span>
    <span class="cd-lab" style="font-size:12px;color:#444;">${label}</span>
  </div>
  `.trim();
}
