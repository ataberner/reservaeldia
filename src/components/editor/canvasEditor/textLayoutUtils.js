import Konva from "konva";

export function createTextLayoutUtils({
  fontManager,
  resolveKonvaFontStyle,
  textResizeDebug = () => {},
  getNodeById = () => null,
} = {}) {
  const obtenerMetricasTexto = (
    texto,
    {
      fontSize = 24,
      fontFamily = "sans-serif",
      fontWeight = "normal",
      fontStyle = "normal",
      lineHeight = 1.2,
      letterSpacing = 0,
    } = {}
  ) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      const fallbackSize = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 24;
      const safeText = String(texto ?? "");
      const spacingExtra = Math.max(0, safeText.length - 1) * (Number(letterSpacing) || 0);
      return {
        width: Math.max(20, safeText.length * (fallbackSize * 0.55) + spacingExtra),
        height: fallbackSize * lineHeight,
      };
    }

    const safeFontSize = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 24;
    const safeLineHeight = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 1.2;
    const safeFamily = String(fontFamily || "sans-serif");
    const fontForCanvas = safeFamily.includes(",")
      ? safeFamily
      : (/\s/.test(safeFamily) ? `"${safeFamily}"` : safeFamily);

    ctx.font = `${fontStyle || "normal"} ${fontWeight || "normal"} ${safeFontSize}px ${fontForCanvas}`;

    const rawText = String(texto ?? "");
    const safeText = rawText.replace(/[ \t]+$/gm, "");
    const lines = safeText.split(/\r?\n/);
    const safeLetterSpacing = Number.isFinite(Number(letterSpacing)) ? Number(letterSpacing) : 0;
    const maxLineWidth = Math.max(
      ...lines.map((line) => {
        const safeLine = String(line || "");
        const baseWidth = ctx.measureText(safeLine).width;
        const spacingExtra = Math.max(0, safeLine.length - 1) * safeLetterSpacing;
        return baseWidth + spacingExtra;
      }),
      20
    );

    return {
      width: maxLineWidth,
      height: safeFontSize * safeLineHeight * Math.max(lines.length, 1),
    };
  };

  const medirAnchoTextoKonva = (objTexto, textoObjetivo, fontSizeOverride = null) => {
    if (!objTexto || typeof window === "undefined") return null;

    try {
      const safeText = String(textoObjetivo ?? "").replace(/[ \t]+$/gm, "");
      const safeFontFamily = fontManager.isFontAvailable(objTexto.fontFamily)
        ? objTexto.fontFamily
        : "sans-serif";
      const safeFontSize =
        Number.isFinite(fontSizeOverride) && fontSizeOverride > 0
          ? fontSizeOverride
          : (Number.isFinite(objTexto.fontSize) && objTexto.fontSize > 0
            ? objTexto.fontSize
            : 24);
      const baseLineHeight =
        Number.isFinite(objTexto.lineHeight) && objTexto.lineHeight > 0
          ? objTexto.lineHeight
          : 1.2;
      const letterSpacing =
        Number.isFinite(Number(objTexto.letterSpacing)) ? Number(objTexto.letterSpacing) : 0;

      const probe = new Konva.Text({
        text: safeText,
        fontSize: safeFontSize,
        fontFamily: safeFontFamily,
        fontWeight: objTexto.fontWeight || "normal",
        fontStyle: resolveKonvaFontStyle(
          objTexto.fontStyle || "normal",
          objTexto.fontWeight || "normal"
        ),
        lineHeight: baseLineHeight * 0.92,
        letterSpacing,
        padding: 0,
        wrap: "none",
      });

      const width = Number(probe.getTextWidth?.() || 0);
      probe.destroy();

      return Number.isFinite(width) && width > 0 ? width : null;
    } catch {
      return null;
    }
  };

  const medirAltoTextoKonva = (objTexto, textoObjetivo, fontSizeOverride = null) => {
    if (!objTexto || typeof window === "undefined") return null;

    try {
      const safeText = String(textoObjetivo ?? "").replace(/[ \t]+$/gm, "");
      const safeFontFamily = fontManager.isFontAvailable(objTexto.fontFamily)
        ? objTexto.fontFamily
        : "sans-serif";
      const safeFontSize =
        Number.isFinite(fontSizeOverride) && fontSizeOverride > 0
          ? fontSizeOverride
          : (Number.isFinite(objTexto.fontSize) && objTexto.fontSize > 0
            ? objTexto.fontSize
            : 24);
      const baseLineHeight =
        Number.isFinite(objTexto.lineHeight) && objTexto.lineHeight > 0
          ? objTexto.lineHeight
          : 1.2;
      const letterSpacing =
        Number.isFinite(Number(objTexto.letterSpacing)) ? Number(objTexto.letterSpacing) : 0;

      const probe = new Konva.Text({
        text: safeText,
        fontSize: safeFontSize,
        fontFamily: safeFontFamily,
        fontWeight: objTexto.fontWeight || "normal",
        fontStyle: resolveKonvaFontStyle(
          objTexto.fontStyle || "normal",
          objTexto.fontWeight || "normal"
        ),
        lineHeight: baseLineHeight * 0.92,
        letterSpacing,
        padding: 0,
        wrap: "none",
      });

      const height = Number(probe.height?.() || 0);
      probe.destroy();

      return Number.isFinite(height) && height > 0 ? height : null;
    } catch {
      return null;
    }
  };

  const calcularXTextoCentradoPorTamano = (objTexto, nextFontSize) => {
    if (!objTexto || objTexto.tipo !== "texto") return Number.isFinite(objTexto?.x) ? objTexto.x : 0;

    const safeNextSize =
      Number.isFinite(nextFontSize) && nextFontSize > 0
        ? nextFontSize
        : (Number.isFinite(objTexto.fontSize) && objTexto.fontSize > 0 ? objTexto.fontSize : 24);

    const baseLineHeight =
      typeof objTexto.lineHeight === "number" && objTexto.lineHeight > 0
        ? objTexto.lineHeight
        : 1.2;
    const letterSpacing =
      Number.isFinite(Number(objTexto.letterSpacing)) ? Number(objTexto.letterSpacing) : 0;

    const previousMetrics = obtenerMetricasTexto(objTexto.texto, {
      fontSize: objTexto.fontSize,
      fontFamily: objTexto.fontFamily,
      fontWeight: objTexto.fontWeight,
      fontStyle: objTexto.fontStyle,
      lineHeight: baseLineHeight * 0.92,
      letterSpacing,
    });

    const nextMetrics = obtenerMetricasTexto(objTexto.texto, {
      fontSize: safeNextSize,
      fontFamily: objTexto.fontFamily,
      fontWeight: objTexto.fontWeight,
      fontStyle: objTexto.fontStyle,
      lineHeight: baseLineHeight * 0.92,
      letterSpacing,
    });

    const previousWidthFromKonva = medirAnchoTextoKonva(
      objTexto,
      objTexto.texto,
      objTexto.fontSize
    );
    const nextWidthFromKonva = medirAnchoTextoKonva(
      objTexto,
      objTexto.texto,
      safeNextSize
    );

    const previousWidth =
      Number.isFinite(previousWidthFromKonva) && previousWidthFromKonva > 0
        ? previousWidthFromKonva
        : previousMetrics.width;
    const nextWidth =
      Number.isFinite(nextWidthFromKonva) && nextWidthFromKonva > 0
        ? nextWidthFromKonva
        : nextMetrics.width;

    const currentX = Number.isFinite(objTexto.x) ? objTexto.x : 0;
    const centerX = currentX + (previousWidth / 2);
    return centerX - (nextWidth / 2);
  };

  const calcularXTextoDesdeCentro = (objTexto, nextFontSize, centerX) => {
    if (!objTexto || objTexto.tipo !== "texto") {
      return Number.isFinite(objTexto?.x) ? objTexto.x : 0;
    }

    const safeCenterX = Number(centerX);
    if (!Number.isFinite(safeCenterX)) {
      return calcularXTextoCentradoPorTamano(objTexto, nextFontSize);
    }

    const safeNextSize =
      Number.isFinite(nextFontSize) && nextFontSize > 0
        ? nextFontSize
        : (Number.isFinite(objTexto.fontSize) && objTexto.fontSize > 0 ? objTexto.fontSize : 24);
    const baseLineHeight =
      typeof objTexto.lineHeight === "number" && objTexto.lineHeight > 0
        ? objTexto.lineHeight
        : 1.2;
    const letterSpacing =
      Number.isFinite(Number(objTexto.letterSpacing)) ? Number(objTexto.letterSpacing) : 0;

    const nextMetrics = obtenerMetricasTexto(objTexto.texto, {
      fontSize: safeNextSize,
      fontFamily: objTexto.fontFamily,
      fontWeight: objTexto.fontWeight,
      fontStyle: objTexto.fontStyle,
      lineHeight: baseLineHeight * 0.92,
      letterSpacing,
    });
    const nextWidthFromKonva = medirAnchoTextoKonva(
      objTexto,
      objTexto.texto,
      safeNextSize
    );
    const nextWidth =
      Number.isFinite(nextWidthFromKonva) && nextWidthFromKonva > 0
        ? nextWidthFromKonva
        : nextMetrics.width;

    return safeCenterX - (nextWidth / 2);
  };

  const calcularYTextoDesdeCentro = (objTexto, nextFontSize, centerY) => {
    if (!objTexto || objTexto.tipo !== "texto") {
      return Number.isFinite(objTexto?.y) ? objTexto.y : 0;
    }

    const safeCenterY = Number(centerY);
    if (!Number.isFinite(safeCenterY)) {
      return Number.isFinite(objTexto.y) ? objTexto.y : 0;
    }

    const safeNextSize =
      Number.isFinite(nextFontSize) && nextFontSize > 0
        ? nextFontSize
        : (Number.isFinite(objTexto.fontSize) && objTexto.fontSize > 0 ? objTexto.fontSize : 24);
    const baseLineHeight =
      typeof objTexto.lineHeight === "number" && objTexto.lineHeight > 0
        ? objTexto.lineHeight
        : 1.2;
    const letterSpacing =
      Number.isFinite(Number(objTexto.letterSpacing)) ? Number(objTexto.letterSpacing) : 0;

    const nextMetrics = obtenerMetricasTexto(objTexto.texto, {
      fontSize: safeNextSize,
      fontFamily: objTexto.fontFamily,
      fontWeight: objTexto.fontWeight,
      fontStyle: objTexto.fontStyle,
      lineHeight: baseLineHeight * 0.92,
      letterSpacing,
    });
    const nextHeightFromKonva = medirAltoTextoKonva(
      objTexto,
      objTexto.texto,
      safeNextSize
    );
    const nextHeight =
      Number.isFinite(nextHeightFromKonva) && nextHeightFromKonva > 0
        ? nextHeightFromKonva
        : nextMetrics.height;

    return safeCenterY - (nextHeight / 2);
  };

  const calcularPosTextoDesdeCentro = (
    objTexto,
    nextFontSize,
    centerX,
    centerY,
    rotationDeg = 0
  ) => {
    if (!objTexto || objTexto.tipo !== "texto") {
      return {
        x: Number.isFinite(objTexto?.x) ? objTexto.x : 0,
        y: null,
      };
    }

    const safeNextSize =
      Number.isFinite(nextFontSize) && nextFontSize > 0
        ? nextFontSize
        : (Number.isFinite(objTexto.fontSize) && objTexto.fontSize > 0 ? objTexto.fontSize : 24);
    const safeCenterX = Number(centerX);
    const safeCenterY = Number(centerY);
    const safeRotation = Number(rotationDeg);
    const theta = (Number.isFinite(safeRotation) ? safeRotation : 0) * (Math.PI / 180);

    const baseLineHeight =
      typeof objTexto.lineHeight === "number" && objTexto.lineHeight > 0
        ? objTexto.lineHeight
        : 1.2;
    const letterSpacing =
      Number.isFinite(Number(objTexto.letterSpacing)) ? Number(objTexto.letterSpacing) : 0;

    const metrics = obtenerMetricasTexto(objTexto.texto, {
      fontSize: safeNextSize,
      fontFamily: objTexto.fontFamily,
      fontWeight: objTexto.fontWeight,
      fontStyle: objTexto.fontStyle,
      lineHeight: baseLineHeight * 0.92,
      letterSpacing,
    });
    const widthFromKonva = medirAnchoTextoKonva(
      objTexto,
      objTexto.texto,
      safeNextSize
    );
    const heightFromKonva = medirAltoTextoKonva(
      objTexto,
      objTexto.texto,
      safeNextSize
    );
    const width =
      Number.isFinite(widthFromKonva) && widthFromKonva > 0
        ? widthFromKonva
        : metrics.width;
    const height =
      Number.isFinite(heightFromKonva) && heightFromKonva > 0
        ? heightFromKonva
        : metrics.height;

    const halfW = width / 2;
    const halfH = height / 2;
    const centerOffsetX = (halfW * Math.cos(theta)) - (halfH * Math.sin(theta));
    const centerOffsetY = (halfW * Math.sin(theta)) + (halfH * Math.cos(theta));
    const fallbackX = calcularXTextoDesdeCentro(objTexto, safeNextSize, safeCenterX);
    const fallbackY = calcularYTextoDesdeCentro(objTexto, safeNextSize, safeCenterY);

    return {
      x: Number.isFinite(safeCenterX)
        ? safeCenterX - centerOffsetX
        : fallbackX,
      y: Number.isFinite(safeCenterY)
        ? safeCenterY - centerOffsetY
        : fallbackY,
      width,
      height,
    };
  };

  const ajustarFontSizeAAnchoVisual = (objTexto, proposedFontSize, targetVisualWidth) => {
    const safeProposed = Number(proposedFontSize);
    const safeTargetWidth = Number(targetVisualWidth);
    textResizeDebug("fit-width:start", {
      id: objTexto?.id ?? null,
      proposedFontSize: safeProposed,
      targetVisualWidth: safeTargetWidth,
      currentFontSize: objTexto?.fontSize ?? null,
    });
    if (!objTexto || objTexto.tipo !== "texto") {
      textResizeDebug("fit-width:skip-invalid-obj", { id: objTexto?.id ?? null });
      return Number.isFinite(safeProposed) && safeProposed > 0 ? safeProposed : 24;
    }
    if (!Number.isFinite(safeProposed) || safeProposed <= 0) {
      textResizeDebug("fit-width:skip-invalid-size", { id: objTexto?.id ?? null });
      return Number.isFinite(objTexto.fontSize) && objTexto.fontSize > 0 ? objTexto.fontSize : 24;
    }
    if (!Number.isFinite(safeTargetWidth) || safeTargetWidth <= 0) {
      textResizeDebug("fit-width:skip-invalid-width", { id: objTexto?.id ?? null });
      return safeProposed;
    }

    let nextSize = Math.max(6, safeProposed);

    for (let i = 0; i < 2; i += 1) {
      const measuredWidth = medirAnchoTextoKonva(
        objTexto,
        objTexto.texto,
        nextSize
      );
      if (!Number.isFinite(measuredWidth) || measuredWidth <= 0) {
        textResizeDebug("fit-width:break-no-measure", {
          id: objTexto?.id ?? null,
          iteration: i,
          measuredWidth,
        });
        break;
      }

      const ratio = safeTargetWidth / measuredWidth;
      if (!Number.isFinite(ratio) || ratio <= 0) {
        textResizeDebug("fit-width:break-invalid-ratio", {
          id: objTexto?.id ?? null,
          iteration: i,
          ratio,
          measuredWidth,
          targetVisualWidth: safeTargetWidth,
        });
        break;
      }

      const candidate = Math.max(6, nextSize * ratio);
      textResizeDebug("fit-width:iter", {
        id: objTexto?.id ?? null,
        iteration: i,
        measuredWidth,
        ratio,
        prevSize: nextSize,
        candidate,
      });
      if (Math.abs(candidate - nextSize) <= 0.01) {
        nextSize = candidate;
        break;
      }
      nextSize = candidate;
    }
    const finalSize = Number(nextSize.toFixed(3));
    textResizeDebug("fit-width:end", {
      id: objTexto?.id ?? null,
      finalSize,
      targetVisualWidth: safeTargetWidth,
    });
    return finalSize;
  };

  const obtenerCentroVisualTextoX = (objTexto, nodeOverride = null) => {
    if (!objTexto || objTexto.tipo !== "texto") return null;

    const currentX = Number.isFinite(objTexto.x) ? objTexto.x : 0;
    const nodeCandidate =
      nodeOverride || getNodeById(objTexto.id) || null;

    if (nodeCandidate && typeof nodeCandidate.getClientRect === "function") {
      try {
        const rect = nodeCandidate.getClientRect({
          skipTransform: false,
          skipShadow: true,
          skipStroke: true,
        });
        if (
          Number.isFinite(rect?.x) &&
          Number.isFinite(rect?.width) &&
          rect.width > 0
        ) {
          return rect.x + (rect.width / 2);
        }
      } catch {
        // fallback
      }
    }

    if (Number.isFinite(objTexto.width) && objTexto.width > 0) {
      return currentX + (objTexto.width / 2);
    }

    const baseLineHeight =
      typeof objTexto.lineHeight === "number" && objTexto.lineHeight > 0
        ? objTexto.lineHeight
        : 1.2;
    const letterSpacing =
      Number.isFinite(Number(objTexto.letterSpacing)) ? Number(objTexto.letterSpacing) : 0;
    const widthFromKonva = medirAnchoTextoKonva(objTexto, objTexto.texto);
    if (Number.isFinite(widthFromKonva) && widthFromKonva > 0) {
      return currentX + (widthFromKonva / 2);
    }

    const metrics = obtenerMetricasTexto(objTexto.texto, {
      fontSize: objTexto.fontSize,
      fontFamily: objTexto.fontFamily,
      fontWeight: objTexto.fontWeight,
      fontStyle: objTexto.fontStyle,
      lineHeight: baseLineHeight * 0.92,
      letterSpacing,
    });
    return currentX + (metrics.width / 2);
  };

  const calcularXTextoCentrado = (objTexto, textoObjetivo, centerXFijo = null) => {
    if (!objTexto || objTexto.tipo !== "texto") return Number.isFinite(objTexto?.x) ? objTexto.x : 0;

    const baseLineHeight =
      typeof objTexto.lineHeight === "number" && objTexto.lineHeight > 0
        ? objTexto.lineHeight
        : 1.2;
    const letterSpacing =
      Number.isFinite(Number(objTexto.letterSpacing)) ? Number(objTexto.letterSpacing) : 0;

    const previousMetrics = obtenerMetricasTexto(objTexto.texto, {
      fontSize: objTexto.fontSize,
      fontFamily: objTexto.fontFamily,
      fontWeight: objTexto.fontWeight,
      fontStyle: objTexto.fontStyle,
      lineHeight: baseLineHeight * 0.92,
      letterSpacing,
    });

    const nextMetrics = obtenerMetricasTexto(textoObjetivo, {
      fontSize: objTexto.fontSize,
      fontFamily: objTexto.fontFamily,
      fontWeight: objTexto.fontWeight,
      fontStyle: objTexto.fontStyle,
      lineHeight: baseLineHeight * 0.92,
      letterSpacing,
    });

    const previousWidthFromKonva = medirAnchoTextoKonva(objTexto, objTexto.texto);
    const nextWidthFromKonva = medirAnchoTextoKonva(objTexto, textoObjetivo);

    const previousWidth =
      Number.isFinite(previousWidthFromKonva) && previousWidthFromKonva > 0
        ? previousWidthFromKonva
        : previousMetrics.width;
    const nextWidth =
      Number.isFinite(nextWidthFromKonva) && nextWidthFromKonva > 0
        ? nextWidthFromKonva
        : nextMetrics.width;

    const safeCenterXFijo = Number(centerXFijo);
    if (Number.isFinite(safeCenterXFijo)) {
      return safeCenterXFijo - (nextWidth / 2);
    }

    const currentX = Number.isFinite(objTexto.x) ? objTexto.x : 0;
    const centerX = currentX + (previousWidth / 2);
    return centerX - (nextWidth / 2);
  };

  return {
    obtenerMetricasTexto,
    medirAnchoTextoKonva,
    medirAltoTextoKonva,
    calcularXTextoCentradoPorTamano,
    calcularXTextoDesdeCentro,
    calcularYTextoDesdeCentro,
    calcularPosTextoDesdeCentro,
    ajustarFontSizeAAnchoVisual,
    obtenerCentroVisualTextoX,
    calcularXTextoCentrado,
  };
}
