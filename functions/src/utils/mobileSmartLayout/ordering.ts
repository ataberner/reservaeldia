// functions/src/utils/mobileSmartLayout/ordering.ts
export function jsOrderingBlock(): string {
  return `
  /**
   * Ordena CLUSTERS (no items) para lectura mobile.
   * Devuelve groups (array de columnas/grupos) y mode.
   *
   * - three: [colL, colC, colR]
   * - two:   [left, right]
   * - rows:  [out] (fila+left)
   * - one:   [sortedTop]
   */
  function orderClustersForMobile(clusters, rootW, CFG){
    if (!rootW || rootW <= 0) {
      var o = clusters.slice().sort(function(a,b){ return a.top - b.top; });
      return { groups: [o], mode: "one" };
    }

    // -------- 0) Intentar 3 columnas claras --------
    var t1 = rootW / 3;
    var t2 = (2 * rootW) / 3;

    var colL = [];
    var colC = [];
    var colR = [];

    for (var i=0;i<clusters.length;i++){
      var c = clusters[i];
      var x = c.cx;
      if (x < t1) colL.push(c);
      else if (x < t2) colC.push(c);
      else colR.push(c);
    }

    var looksThree =
      (colL.length >= CFG.MIN_PER_COL_3 && colC.length >= CFG.MIN_PER_COL_3 && colR.length >= CFG.MIN_PER_COL_3);
    mslLog("order:three:candidates", {
      rootW: rootW,
      total: clusters.length,
      colL: colL.length,
      colC: colC.length,
      colR: colR.length,
      minPerCol3: CFG.MIN_PER_COL_3
    });

    if (looksThree) {
      var cxs = [];
      for (var j=0;j<clusters.length;j++) cxs.push(clusters[j].cx);
      cxs.sort(function(a,b){ return a-b; });
      var p20 = percentile(cxs, 0.20);
      var p80 = percentile(cxs, 0.80);
      var spread = (p80 - p20);
      mslLog("order:three:spread", {
        p20: p20,
        p80: p80,
        spread: spread,
        minSpread: rootW * CFG.THREE_COL_SPREAD_RATIO,
        pass: spread >= rootW * CFG.THREE_COL_SPREAD_RATIO
      });
      if (spread < rootW * CFG.THREE_COL_SPREAD_RATIO) looksThree = false;
    }

    if (looksThree) {
      colL.sort(function(a,b){ return a.top - b.top; });
      colC.sort(function(a,b){ return a.top - b.top; });
      colR.sort(function(a,b){ return a.top - b.top; });
      return { groups: [colL, colC, colR], mode: "three" };
    }

    // -------- 1) Intentar 2 columnas claras --------
    var mid = rootW / 2;
    var left = [];
    var right = [];

    for (var k=0;k<clusters.length;k++){
      var c2 = clusters[k];
      if (c2.cx < mid) left.push(c2);
      else right.push(c2);
    }

    var looksTwo = (left.length >= CFG.MIN_PER_COL_2 && right.length >= CFG.MIN_PER_COL_2);
    mslLog("order:two:candidates", {
      rootW: rootW,
      total: clusters.length,
      left: left.length,
      right: right.length,
      minPerCol2: CFG.MIN_PER_COL_2
    });

    // Politica para pares (2 clusters):
    // - par de columnas reales => mode "two"
    // - resto de casos => mode "one" (fitCheck decide si reflowea)
    if (clusters.length === 2) {
      var cA = clusters[0];
      var cB = clusters[1];

      function pairStats(c){
        var text = 0;
        var non = 0;
        var force = 0;
        for (var q=0; q<c.items.length; q++) {
          var n = c.items[q].node;
          if ((n.getAttribute("data-mobile-center") || "") === "force") force++;
          if ((n.getAttribute("data-debug-texto") || "") === "1") text++;
          else non++;
        }
        return { text: text, non: non, force: force };
      }

      var sA = pairStats(cA);
      var sB = pairStats(cB);

      var topDelta = Math.abs((cA.top || 0) - (cB.top || 0));
      var xOverlap = Math.max(0, Math.min((cA.left + cA.width), (cB.left + cB.width)) - Math.max(cA.left, cB.left));
      var minWPair = Math.max(1, Math.min((cA.width || 0), (cB.width || 0)));
      var xOverlapRatio = xOverlap / minWPair;
      var sideBySide = topDelta <= (CFG.ROW_TOL * 1.5) && xOverlapRatio < 0.25;

      var anyForceCenter = (sA.force > 0 || sB.force > 0);
      var bothMixed = (sA.text > 0 && sA.non > 0 && sB.text > 0 && sB.non > 0);
      // Señal robusta de "par de columnas":
      // - están lado a lado y pasan split left/right
      // - y además no son simplemente 2 textos sueltos en una fila
      var hasColumnSignal =
        (sA.non > 0 || sB.non > 0) ||
        ((cA.items && cA.items.length > 1) || (cB.items && cB.items.length > 1));

      if (looksTwo && sideBySide && hasColumnSignal) {
        var leftPair = (cA.cx <= cB.cx) ? [cA] : [cB];
        var rightPair = (cA.cx <= cB.cx) ? [cB] : [cA];
        mslLog("order:two:pairPolicy", {
          mode: "two",
          reason: "pairColumns",
          topDelta: +topDelta.toFixed(1),
          xOverlapRatio: +xOverlapRatio.toFixed(3),
          hasColumnSignal: hasColumnSignal,
          bothMixed: bothMixed,
          anyForceCenter: anyForceCenter,
          lefts: [+(cA.left || 0).toFixed(1), +(cB.left || 0).toFixed(1)]
        });
        return { groups: [leftPair, rightPair], mode: "two" };
      }

      var pair = clusters.slice().sort(function(a,b){
        if (Math.abs(a.top - b.top) > 0.5) return a.top - b.top;
        return a.left - b.left;
      });
      mslLog("order:two:pairPolicy", {
        mode: "one",
        reason: anyForceCenter ? "forceCenterPair" : "pairDefault",
        topDelta: +topDelta.toFixed(1),
        xOverlapRatio: +xOverlapRatio.toFixed(3),
        sideBySide: sideBySide,
        bothMixed: bothMixed,
        anyForceCenter: anyForceCenter,
        tops: pair.map(function(c){ return +c.top.toFixed(1); }),
        lefts: pair.map(function(c){ return +c.left.toFixed(1); })
      });
      return { groups: [pair], mode: "one" };
    }
    if (looksTwo) {
      var cxs2 = [];
      for (var m=0;m<clusters.length;m++) cxs2.push(clusters[m].cx);
      cxs2.sort(function(a,b){ return a-b; });
      var p25 = percentile(cxs2, 0.25);
      var p75 = percentile(cxs2, 0.75);
      var spread2 = (p75 - p25);
      mslLog("order:two:spread", {
        p25: p25,
        p75: p75,
        spread: spread2,
        minSpread: rootW * CFG.TWO_COL_SPREAD_RATIO,
        pass: spread2 >= rootW * CFG.TWO_COL_SPREAD_RATIO
      });
      if (spread2 < rootW * CFG.TWO_COL_SPREAD_RATIO) looksTwo = false;
    }

    if (looksTwo) {
      left.sort(function(a,b){ return a.top - b.top; });
      right.sort(function(a,b){ return a.top - b.top; });
      return { groups: [left, right], mode: "two" };
    }

    // -------- 2) Guard tardio: una sola columna visual --------
    // Se evalua despues de two/three para evitar falsos "one" cuando hay
    // dos columnas reales con varios clusters.
    if (clusters.length >= 2) {
      var cxsOne = clusters.map(function(c){ return c.cx; }).sort(function(a,b){ return a-b; });
      var medianCx = percentile(cxsOne, 0.50);
      var maxDevCx = 0;
      for (var s=0; s<clusters.length; s++) {
        var dev = Math.abs((clusters[s].cx || 0) - medianCx);
        if (dev > maxDevCx) maxDevCx = dev;
      }

      var singleColMaxDev = rootW * 0.18;
      var looksOneCol = maxDevCx <= singleColMaxDev;
      mslLog("order:one:candidates", {
        rootW: rootW,
        total: clusters.length,
        medianCx: +medianCx.toFixed(1),
        maxDevCx: +maxDevCx.toFixed(1),
        maxAllowed: +singleColMaxDev.toFixed(1),
        pass: looksOneCol,
        stage: "postTwoThree"
      });

      if (looksOneCol) {
        var oneCol = clusters.slice().sort(function(a,b){ return a.top - b.top; });
        return { groups: [oneCol], mode: "one" };
      }
    }

    // -------- 3) Fallback: filas (top) y dentro por left --------
    var sorted = clusters.slice().sort(function(a,b){ return a.top - b.top; });

    var rows = [];
    for (var r=0;r<sorted.length;r++){
      var c3 = sorted[r];
      var placed = false;

      for (var rr=0; rr<rows.length; rr++){
        var row = rows[rr];
        if (Math.abs(c3.top - row.top) <= CFG.ROW_TOL){
          row.items.push(c3);
          row.top = (row.top * (row.items.length - 1) + c3.top) / row.items.length;
          placed = true;
          break;
        }
      }

      if (!placed) rows.push({ top: c3.top, items: [c3] });
    }

    rows.sort(function(a,b){ return a.top - b.top; });
    rows.forEach(function(row){
      row.items.sort(function(a,b){ return a.left - b.left; });
    });

    function clusterIsText(c){
      if (!c || !c.items || !c.items.length) return false;
      for (var i2=0; i2<c.items.length; i2++){
        if ((c.items[i2].node.getAttribute("data-debug-texto") || "") !== "1") return false;
      }
      return true;
    }

    var out = [];
    var didInterleave = false;
    // Caso especial: dos filas simetricas (ej. iconos arriba y textos abajo).
    // Reordenamos por columna: top1,bottom1,top2,bottom2,...
    if (rows.length === 2 && rows[0].items.length === rows[1].items.length && rows[0].items.length >= 2) {
      var topRow = rows[0].items.slice();
      var botRow = rows[1].items.slice();
      var topHasNonText = topRow.some(function(c){ return !clusterIsText(c); });
      var botMostlyText = botRow.filter(function(c){ return clusterIsText(c); }).length >= Math.ceil(botRow.length / 2);

      if (topHasNonText && botMostlyText) {
        var usedBottom = {};
        for (var tr=0; tr<topRow.length; tr++){
          var a = topRow[tr];
          out.push(a);

          var bestIdx = -1;
          var bestDist = Infinity;
          for (var br=0; br<botRow.length; br++){
            if (usedBottom[br]) continue;
            var b = botRow[br];
            var d = Math.abs((a.left || 0) - (b.left || 0));
            if (d < bestDist) {
              bestDist = d;
              bestIdx = br;
            }
          }
          if (bestIdx >= 0) {
            out.push(botRow[bestIdx]);
            usedBottom[bestIdx] = true;
          }
        }
        for (var br2=0; br2<botRow.length; br2++){
          if (!usedBottom[br2]) out.push(botRow[br2]);
        }
        didInterleave = true;
      }
    }

    if (!didInterleave) {
      rows.forEach(function(row){
        for (var z=0; z<row.items.length; z++) out.push(row.items[z]);
      });
    }
    mslLog("order:rows:fallback", {
      rows: rows.map(function(r){
        return {
          top: +r.top.toFixed(1),
          len: r.items.length,
          lefts: r.items.map(function(it){ return +it.left.toFixed(1); })
        };
      }),
      outLen: out.length,
      didInterleave: didInterleave
    });

    return { groups: [out], mode: "rows" };
  }
`.trim();
}
