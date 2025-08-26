// src/config/textPresets.js
/**
 * 🎨 Presets de combinaciones de texto
 * Reglas:
 *  - Si una línea NO tiene x/dx => participa del centrado por grupo (center/right).
 *  - Si una línea tiene x o dx  => NO participa del centrado; se posiciona con ese offset.
 *  - dy es desplazamiento vertical relativo a baseY del preset.
 * Sugerencia: dejá ambos renglones sin dx cuando querés que queden perfectamente centrados entre sí.
 */

export const TEXT_PRESETS = [
    {
        id: "clasico",
        nombre: "Clásico elegante",
        // podés ajustar baseX/baseY si querés una posición inicial distinta
        // baseX: 120,
        // baseY: 140,
        gapY: 8,
        objetos: [
            {
                tipo: "texto",
                texto: "¡Nos Casamos!",
                fontSize: 42,
                fontFamily: "Great Vibes, cursive",
                color: "#773dbe",
                fontWeight: "normal",
                align: "center", // ⬅️ sin dx: participa del centrado por grupo
                dy: 0,
            },
            {
                tipo: "texto",
                texto: "Euge & Agus",
                fontSize: 24,
                fontFamily: "Montserrat, sans-serif",
                color: "#333333",
                fontWeight: "600",
                align: "center", // ⬅️ sin dx: queda centrado respecto al de arriba
                dy: 46,          // ~42*1.1 aprox de separación vertical
            },
        ],
    },

    {
        id: "moderno",
        nombre: "Moderno minimalista",
        gapY: 10,
        objetos: [
            {
                tipo: "texto",
                texto: "Nuestra boda",
                fontSize: 32,
                fontFamily: "Poppins, sans-serif",
                color: "#000000",
                fontWeight: "700",
                align: "left",  // ⬅️ sin dx: arranca en baseX
                dy: 0,
            },
            {
                tipo: "texto",
                texto: "21 de Septiembre 2025",
                fontSize: 18,
                fontFamily: "Poppins, sans-serif",
                color: "#666666",
                fontWeight: "400",
                align: "left",
                dy: 38,         // ~32*1.1
            },
        ],
    },

    {
        id: "elegante",
        nombre: "Elegante dorado",
        gapY: 8,
        objetos: [
            {
                tipo: "texto",
                texto: "Euge & Agus",
                fontSize: 38,
                fontFamily: "Playfair Display, serif",
                color: "#b8860b",
                fontWeight: "700",
                align: "center", // ⬅️ sin dx: participa del centrado por grupo
                dy: 0,
            },
            {
                tipo: "texto",
                texto: "Recepción",
                fontSize: 20,
                fontFamily: "Montserrat, sans-serif",
                color: "#444444",
                fontWeight: "400",
                align: "center", // ⬅️ también sin dx: queda perfectamente centrado con el de arriba
                dy: 42,          // ~38*1.1
            },
        ],
    },

    {
        id: "minimal",
        nombre: "Minimal blanco y negro",
        objetos: [
            {
                tipo: "texto",
                texto: "Save the Date",
                fontSize: 28,
                fontFamily: "Helvetica, sans-serif",
                color: "#000000",
                fontWeight: "300",
                align: "center", // 1 sola línea: centrado simple
                dy: 0,
            },
        ],
    },

    {
        id: "romantico",
        nombre: "Romántico rosa",
        gapY: 6,
        objetos: [
            {
                tipo: "texto",
                texto: "Juntos por siempre",
                fontSize: 34,
                fontFamily: "Great Vibes, cursive",
                color: "#d6336c",
                fontWeight: "normal",
                align: "center",
                dy: 0,
            },
            {
                tipo: "texto",
                texto: "María & Juan",
                fontSize: 20,
                fontFamily: "Montserrat, sans-serif",
                color: "#555555",
                fontWeight: "500",
                align: "center",
                dy: 38,
            },
        ],
    },

    {
        id: "artdeco",
        nombre: "Art Deco dorado",
        gapY: 10,
        objetos: [
            {
                tipo: "texto",
                texto: "Gran Fiesta",
                fontSize: 36,
                fontFamily: "Cinzel, serif",
                color: "#c5a100",
                fontWeight: "700",
                align: "center",
                dy: 0,
            },
            {
                tipo: "texto",
                texto: "12 de Octubre",
                fontSize: 22,
                fontFamily: "Montserrat, sans-serif",
                color: "#333333",
                fontWeight: "400",
                align: "center",
                dy: 44,
            },
        ],
    },

    {
        id: "moderno-bold",
        nombre: "Moderno Bold",
        gapY: 12,
        objetos: [
            {
                tipo: "texto",
                texto: "Fiesta 2025",
                fontSize: 40,
                fontFamily: "Oswald, sans-serif",
                color: "#111111",
                fontWeight: "800",
                align: "left",
                dy: 0,
            },
            {
                tipo: "texto",
                texto: "Sábado por la noche",
                fontSize: 18,
                fontFamily: "Roboto, sans-serif",
                color: "#555555",
                fontWeight: "400",
                align: "left",
                dx: 12,
                dy: 46,
            },
        ],
    },

    {
        id: "rustico",
        nombre: "Rústico natural",
        gapY: 6,
        objetos: [
            {
                tipo: "texto",
                texto: "Celebramos el Amor",
                fontSize: 30,
                fontFamily: "Shadows Into Light, cursive",
                color: "#5c3d2e",
                fontWeight: "normal",
                align: "center",
                dy: 0,
            },
            {
                tipo: "texto",
                texto: "Camila & Pedro",
                fontSize: 22,
                fontFamily: "Merriweather, serif",
                color: "#2e2e2e",
                fontWeight: "600",
                align: "center",
                dy: 36,
            },
        ],
    },

    {
        id: "minimal-invertido",
        nombre: "Minimal invertido",
        objetos: [
            {
                tipo: "texto",
                texto: "Save the Date",
                fontSize: 26,
                fontFamily: "Helvetica, sans-serif",
                color: "#ffffff",
                fontWeight: "400",
                align: "center",
                dy: 0,
            },
            {
                tipo: "texto",
                texto: "Ana & Leo",
                fontSize: 18,
                fontFamily: "Montserrat, sans-serif",
                color: "#ffffff",
                fontWeight: "300",
                align: "center",
                dy: 32,
            },
        ],
    },

    {
        id: "vintage",
        nombre: "Vintage clásico",
        gapY: 8,
        objetos: [
            {
                tipo: "texto",
                texto: "Gran Baile",
                fontSize: 34,
                fontFamily: "Cormorant Garamond, serif",
                color: "#7d5a50",
                fontWeight: "700",
                align: "center",
                dy: 0,
            },
            {
                tipo: "texto",
                texto: "Entrada libre",
                fontSize: 20,
                fontFamily: "Lora, serif",
                color: "#555555",
                fontWeight: "400",
                align: "center",
                dy: 40,
            },
        ],
    },

    {
        id: "urbano",
        nombre: "Urbano",
        gapY: 10,
        objetos: [
            {
                tipo: "texto",
                texto: "Party Time",
                fontSize: 36,
                fontFamily: "Anton, sans-serif",
                color: "#ff0055",
                fontWeight: "900",
                align: "left",
                dy: 0,
            },
            {
                tipo: "texto",
                texto: "DJ Live Session",
                fontSize: 20,
                fontFamily: "Roboto Condensed, sans-serif",
                color: "#222222",
                fontWeight: "500",
                align: "left",
                dx: 20,
                dy: 44,
            },
        ],
    },

    {
        id: "acuarela",
        nombre: "Acuarela suave",
        gapY: 6,
        objetos: [
            {
                tipo: "texto",
                texto: "Clara & Martín",
                fontSize: 32,
                fontFamily: "Dancing Script, cursive",
                color: "#2d6a4f",
                fontWeight: "400",
                align: "center",
                dy: 0,
            },
            {
                tipo: "texto",
                texto: "Un día especial",
                fontSize: 18,
                fontFamily: "Raleway, sans-serif",
                color: "#40916c",
                fontWeight: "300",
                align: "center",
                dy: 36,
            },
        ],
    },

    {
        id: "elegante-negro",
        nombre: "Elegante en negro",
        objetos: [
            {
                tipo: "texto",
                texto: "Cena de Gala",
                fontSize: 34,
                fontFamily: "Playfair Display, serif",
                color: "#000000",
                fontWeight: "700",
                align: "center",
                dy: 0,
            },
            {
                tipo: "texto",
                texto: "Hotel Majestic",
                fontSize: 20,
                fontFamily: "Montserrat, sans-serif",
                color: "#000000",
                fontWeight: "400",
                align: "center",
                dy: 42,
            },
        ],
    },

    {
        id: "tipografico",
        nombre: "Tipográfico contrastado",
        gapY: 12,
        objetos: [
            {
                tipo: "texto",
                texto: "FIESTA",
                fontSize: 40,
                fontFamily: "Oswald, sans-serif",
                color: "#1d3557",
                fontWeight: "900",
                align: "center",
                dy: 0,
            },
            {
                tipo: "texto",
                texto: "2025",
                fontSize: 28,
                fontFamily: "Roboto, sans-serif",
                color: "#e63946",
                fontWeight: "700",
                align: "center",
                dy: 48,
            },
        ],
    },
];
