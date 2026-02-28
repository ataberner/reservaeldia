import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import useElementCatalog from "@/hooks/useElementCatalog";
import { fetchSvgPaths } from "@/utils/parseSvg";
import { normalizeQueryText } from "@/domain/elements/catalog";

function toMediaFormat(item) {
  const fromItem = String(item?.formato || "").trim().toLowerCase();
  if (fromItem) return fromItem === "jpeg" ? "jpg" : fromItem;

  const src = String(item?.src || "").toLowerCase();
  const stripped = src.split("?")[0].split("#")[0];
  const extension = stripped.split(".").pop() || "";
  if (!extension) return "png";
  return extension === "jpeg" ? "jpg" : extension;
}

function shapePreview(figura, sizeClass = "h-12 w-12") {
  const fill = "#1f2937";

  if (figura === "line") {
    return (
      <svg viewBox="0 0 100 100" className={sizeClass}>
        <line x1="14" y1="50" x2="86" y2="50" stroke={fill} strokeWidth="8" strokeLinecap="round" />
      </svg>
    );
  }

  if (figura === "heart") {
    return (
      <svg viewBox="0 0 100 100" className={sizeClass}>
        <path d="M50 84 C8 58 14 25 34 25 C42 25 47 30 50 36 C53 30 58 25 66 25 C86 25 92 58 50 84 Z" fill={fill} />
      </svg>
    );
  }

  const polygonMap = {
    triangle: "50,14 86,84 14,84",
    diamond: "50,10 90,50 50,90 10,50",
    star: "50,10 61,37 90,37 67,55 76,84 50,66 24,84 33,55 10,37 39,37",
    arrow: "10,34 58,34 58,14 90,50 58,86 58,66 10,66",
    pentagon: "50,10 88,38 74,84 26,84 12,38",
    hexagon: "28,12 72,12 92,50 72,88 28,88 8,50",
  };

  if (polygonMap[figura]) {
    return (
      <svg viewBox="0 0 100 100" className={sizeClass}>
        <polygon points={polygonMap[figura]} fill={fill} />
      </svg>
    );
  }

  if (figura === "circle") {
    return (
      <svg viewBox="0 0 100 100" className={sizeClass}>
        <circle cx="50" cy="50" r="34" fill={fill} />
      </svg>
    );
  }

  if (figura === "pill") {
    return (
      <svg viewBox="0 0 100 100" className={sizeClass}>
        <rect x="10" y="30" width="80" height="40" rx="20" fill={fill} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 100" className={sizeClass}>
      <rect x="18" y="18" width="64" height="64" fill={fill} />
    </svg>
  );
}

function useHorizontalScrollMeta(itemCount) {
  const scrollerRef = useRef(null);
  const [scrollMeta, setScrollMeta] = useState({ left: false, right: false });

  const updateScrollMeta = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      setScrollMeta((previous) => (
        previous.left || previous.right ? { left: false, right: false } : previous
      ));
      return;
    }

    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const left = maxScrollLeft > 2 && scroller.scrollLeft > 2;
    const right = maxScrollLeft > 2 && scroller.scrollLeft < maxScrollLeft - 2;
    setScrollMeta((previous) => (
      previous.left === left && previous.right === right ? previous : { left, right }
    ));
  }, []);

  const scrollByStep = useCallback((direction, step = 168) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ left: direction * step, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || itemCount === 0) {
      setScrollMeta({ left: false, right: false });
      return;
    }

    const handleScroll = () => updateScrollMeta();
    const handleResize = () => updateScrollMeta();
    scroller.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);
    const rafId = window.requestAnimationFrame(updateScrollMeta);

    return () => {
      scroller.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(rafId);
    };
  }, [itemCount, updateScrollMeta]);

  return {
    scrollerRef,
    scrollMeta,
    scrollByStep,
  };
}

function HorizontalRail({
  scrollerRef,
  canScrollLeft,
  canScrollRight,
  onScrollLeft,
  onScrollRight,
  leftLabel,
  rightLabel,
  children,
}) {
  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex min-w-max gap-1.5 pr-2">{children}</div>
      </div>

      {canScrollLeft ? (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white via-white/90 to-transparent" />
          <button
            type="button"
            onClick={onScrollLeft}
            className="absolute left-0 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/70 text-slate-400 backdrop-blur-sm transition hover:bg-white hover:text-slate-600"
            aria-label={leftLabel}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </>
      ) : null}

      {canScrollRight ? (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white via-white/90 to-transparent" />
          <button
            type="button"
            onClick={onScrollRight}
            className="absolute right-0 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/70 text-slate-400 backdrop-blur-sm transition hover:bg-white hover:text-slate-600"
            aria-label={rightLabel}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </>
      ) : null}
    </div>
  );
}

function ShapeButton({ item, onInsert }) {
  return (
    <button
      type="button"
      onClick={() => onInsert(item)}
      className="group flex h-[84px] w-full items-center justify-center rounded-lg bg-transparent px-1 transition hover:-translate-y-[1px] hover:bg-slate-50"
      title={`Insertar ${item.label}`}
    >
      <div className="flex h-14 w-14 items-center justify-center text-slate-900">
        {shapePreview(item.figura)}
      </div>
    </button>
  );
}

function ShapeRailButton({ item, onInsert }) {
  return (
    <button
      type="button"
      onClick={() => onInsert(item)}
      className="shrink-0 flex h-[72px] w-[72px] items-center justify-center rounded-lg bg-transparent px-0.5 transition hover:-translate-y-[1px] hover:bg-slate-50"
      title={`Insertar ${item.label}`}
    >
      <div className="flex h-12 w-12 items-center justify-center text-slate-900">
        {shapePreview(item.figura, "h-11 w-11")}
      </div>
    </button>
  );
}

function IconRailButton({ item, onInsert }) {
  return (
    <button
      type="button"
      onClick={() => onInsert(item)}
      className="shrink-0 flex h-[72px] w-[72px] items-center justify-center rounded-lg bg-transparent px-0.5 transition hover:-translate-y-[1px] hover:bg-slate-50"
      title={`Insertar ${item.label}`}
    >
      <div className="h-12 w-12 p-1">
        <div
          className="h-full w-full rounded bg-center bg-no-repeat bg-contain"
          style={{ backgroundImage: `url(${item.src})` }}
        />
      </div>
    </button>
  );
}

function MediaButton({ item, onInsert }) {
  return (
    <button
      type="button"
      onClick={() => onInsert(item)}
      className="group flex h-[84px] w-full items-center justify-center rounded-lg bg-transparent px-1 transition hover:-translate-y-[1px] hover:bg-slate-50"
      title={`Insertar ${item.label}`}
    >
      <div className="h-14 w-14 p-1">
        <div
          className="h-full w-full rounded bg-center bg-no-repeat bg-contain"
          style={{ backgroundImage: `url(${item.src})` }}
        />
      </div>
    </button>
  );
}

function RecentButton({ item, onInsertShape, onInsertMedia }) {
  const isShape = item.kind === "shape";
  return (
    <button
      type="button"
      onClick={() => (isShape ? onInsertShape(item) : onInsertMedia(item))}
      className="shrink-0 flex h-[64px] w-[64px] items-center justify-center rounded-lg bg-transparent px-0.5 transition hover:-translate-y-[1px] hover:bg-slate-50"
      title={`Insertar ${item.label}`}
    >
      {isShape ? (
        <div className="flex h-11 w-11 items-center justify-center">
          {shapePreview(item.figura, "h-10 w-10")}
        </div>
      ) : (
        <div className="h-11 w-11 p-1">
          <div
            className="h-full w-full rounded bg-center bg-no-repeat bg-contain"
            style={{ backgroundImage: `url(${item.src})` }}
          />
        </div>
      )}
    </button>
  );
}

function AccordionSection({ title, open, onToggle, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="text-xs font-semibold text-slate-800">{title}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-600" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-600" />
        )}
      </button>
      {open ? <div className="border-t border-slate-100 px-3 pb-3 pt-2">{children}</div> : null}
    </section>
  );
}

function EmptyHint({ query }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
      {query ? "Sin resultados." : "No hay elementos disponibles."}
    </div>
  );
}

export default function PanelDeFormas({ abierto, sidebarAbierta }) {
  const {
    shapeItems,
    libraryItems,
    popularItems,
    recentItems,
    query,
    setQuery,
    groupedResults,
    hasMore,
    loadMore,
    loading,
    error,
    registerRecent,
    getLibraryByKind,
  } = useElementCatalog();

  const [iconsOpen, setIconsOpen] = useState(false);
  const [gifsOpen, setGifsOpen] = useState(false);
  const [focusedLibrary, setFocusedLibrary] = useState("none");

  const normalizedQuery = normalizeQueryText(query);
  const searching = normalizedQuery.length > 0;

  const iconLibrary = useMemo(
    () => getLibraryByKind("icon", "all"),
    [getLibraryByKind]
  );
  const gifLibrary = useMemo(
    () => getLibraryByKind("gif", "all"),
    [getLibraryByKind]
  );

  const filteredPopular = useMemo(() => {
    const popularMedia = popularItems.filter((item) => item.kind === "icon" || item.kind === "gif");
    return popularMedia.slice(0, 18);
  }, [popularItems]);

  const filteredRecents = useMemo(() => recentItems.slice(0, 24), [recentItems]);
  const recentRail = useHorizontalScrollMeta(filteredRecents.length);
  const shapeRail = useHorizontalScrollMeta(shapeItems.length);
  const iconRail = useHorizontalScrollMeta(iconLibrary.length);

  const queryResults = useMemo(() => {
    if (!searching) return { shape: [], icon: [], gif: [] };
    return {
      shape: groupedResults.shape,
      icon: groupedResults.icon,
      gif: groupedResults.gif,
    };
  }, [groupedResults, searching]);

  const hasQueryResults = queryResults.shape.length || queryResults.icon.length || queryResults.gif.length;

  const dispatchInsert = useCallback((detail) => {
    window.dispatchEvent(new CustomEvent("insertar-elemento", { detail }));
  }, []);

  const insertShape = useCallback(
    (shapeItem) => {
      const figura = shapeItem?.figura || "rect";
      const base = {
        id: `forma-${Date.now().toString(36)}`,
        tipo: "forma",
        figura,
        color: shapeItem?.color || "#111827",
        texto: "",
        fontSize: 24,
        fontFamily: "sans-serif",
        fontWeight: "normal",
        fontStyle: "normal",
        colorTexto: "#111827",
        align: "center",
      };

      if (figura === "line") {
        base.points = [0, 0, 120, 0];
        base.strokeWidth = 3;
      } else if (figura === "circle") {
        base.radius = 50;
      } else if (figura === "triangle") {
        base.radius = 60;
      } else if (figura === "diamond") {
        base.width = 120;
        base.height = 120;
      } else if (figura === "star") {
        base.width = 120;
        base.height = 120;
      } else if (figura === "heart") {
        base.width = 120;
        base.height = 108;
      } else if (figura === "arrow") {
        base.width = 160;
        base.height = 90;
      } else if (figura === "pentagon") {
        base.width = 120;
        base.height = 120;
      } else if (figura === "hexagon") {
        base.width = 128;
        base.height = 112;
      } else if (figura === "pill") {
        base.width = 170;
        base.height = 72;
        base.cornerRadius = 36;
      }

      dispatchInsert(base);
      registerRecent({
        ...shapeItem,
        src: null,
        formato: null,
        insertedAt: Date.now(),
      });
    },
    [dispatchInsert, registerRecent]
  );

  const insertMedia = useCallback(
    async (item) => {
      const src = String(item?.src || "").trim();
      if (!src) return;

      const format = toMediaFormat(item);

      if (format === "svg") {
        try {
          const { paths, viewBox } = await fetchSvgPaths(src);
          if (Array.isArray(paths) && paths.length > 0) {
            dispatchInsert({
              id: `icono-${Date.now().toString(36)}`,
              tipo: "icono",
              formato: "svg",
              colorizable: true,
              color: "#773dbe",
              paths,
              url: src,
              viewBox: viewBox || null,
            });
            registerRecent({
              ...item,
              formato: "svg",
              insertedAt: Date.now(),
            });
            return;
          }
        } catch {
          // Fallback raster.
        }
      }

      const safeFormat = format || "png";
      dispatchInsert({
        id: `icono-${Date.now().toString(36)}`,
        tipo: "icono",
        formato: safeFormat,
        colorizable: false,
        url: src,
      });

      registerRecent({
        ...item,
        formato: safeFormat,
        insertedAt: Date.now(),
      });
    },
    [dispatchInsert, registerRecent]
  );

  if (!abierto || !sidebarAbierta) return null;

  if (focusedLibrary === "shapes") {
    return (
      <div className="w-full space-y-0 pb-0">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide leading-none text-slate-700">Formas</h3>
          <button
            type="button"
            onClick={() => setFocusedLibrary("none")}
            className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Volver
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2" aria-label="Formas en vista completa">
          {shapeItems.map((shape) => (
            <ShapeButton key={shape.id} item={shape} onInsert={insertShape} />
          ))}
        </div>
      </div>
    );
  }

  if (focusedLibrary === "icons") {
    return (
      <div className="w-full space-y-0 pb-0">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide leading-none text-slate-700">Iconos</h3>
          <button
            type="button"
            onClick={() => setFocusedLibrary("none")}
            className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Volver
          </button>
        </div>

        {iconLibrary.length > 0 ? (
          <div className="grid grid-cols-3 gap-2" aria-label="Iconos en vista completa">
            {iconLibrary.map((item) => (
              <MediaButton key={`${item.id}-${item.src}`} item={item} onInsert={insertMedia} />
            ))}
          </div>
        ) : (
          <EmptyHint />
        )}
      </div>
    );
  }

  if (focusedLibrary === "recents") {
    return (
      <div className="w-full space-y-0 pb-0">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide leading-none text-slate-700">Recientes</h3>
          <button
            type="button"
            onClick={() => setFocusedLibrary("none")}
            className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Volver
          </button>
        </div>

        {filteredRecents.length > 0 ? (
          <div className="grid grid-cols-3 gap-2" aria-label="Recientes en vista completa">
            {filteredRecents.map((item, index) => (
              <RecentButton
                key={`${item.id}-${item.src || item.figura || "recent"}-${index}`}
                item={item}
                onInsertShape={insertShape}
                onInsertMedia={insertMedia}
              />
            ))}
          </div>
        ) : (
          <EmptyHint />
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-0 pb-0">
      <div className="sticky top-0 z-20 bg-white pb-1">
        <label className="block rounded-xl border border-slate-300 bg-white p-1">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Busca formas, iconos o gifs"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-500"
          />
        </label>
      </div>

      {!searching && filteredRecents.length > 0 ? (
        <section className="space-y-0">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide leading-none text-slate-700">Recientes</h3>
            <button
              type="button"
              onClick={() => setFocusedLibrary("recents")}
              className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Ver mas
            </button>
          </div>

          <HorizontalRail
            scrollerRef={recentRail.scrollerRef}
            canScrollLeft={recentRail.scrollMeta.left}
            canScrollRight={recentRail.scrollMeta.right}
            onScrollLeft={() => recentRail.scrollByStep(-1)}
            onScrollRight={() => recentRail.scrollByStep(1)}
            leftLabel="Ver recientes anteriores"
            rightLabel="Ver recientes siguientes"
          >
            {filteredRecents.map((item, index) => (
              <RecentButton
                key={`${item.id}-${item.src || item.figura || "recent"}-${index}`}
                item={item}
                onInsertShape={insertShape}
                onInsertMedia={insertMedia}
              />
            ))}
          </HorizontalRail>
        </section>
      ) : null}

      {!searching ? (
        <section className="space-y-0">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide leading-none text-slate-700">Formas</h3>
            <button
              type="button"
              onClick={() => setFocusedLibrary("shapes")}
              className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Ver mas
            </button>
          </div>

          <HorizontalRail
            scrollerRef={shapeRail.scrollerRef}
            canScrollLeft={shapeRail.scrollMeta.left}
            canScrollRight={shapeRail.scrollMeta.right}
            onScrollLeft={() => shapeRail.scrollByStep(-1)}
            onScrollRight={() => shapeRail.scrollByStep(1)}
            leftLabel="Ver formas anteriores"
            rightLabel="Ver formas siguientes"
          >
            {shapeItems.map((shape) => (
              <ShapeRailButton key={shape.id} item={shape} onInsert={insertShape} />
            ))}
          </HorizontalRail>
        </section>
      ) : null}

      {!searching ? (
        <section className="space-y-0">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide leading-none text-slate-700">Iconos</h3>
            <button
              type="button"
              onClick={() => setFocusedLibrary("icons")}
              className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Ver mas
            </button>
          </div>

          {iconLibrary.length > 0 ? (
            <HorizontalRail
              scrollerRef={iconRail.scrollerRef}
              canScrollLeft={iconRail.scrollMeta.left}
              canScrollRight={iconRail.scrollMeta.right}
              onScrollLeft={() => iconRail.scrollByStep(-1)}
              onScrollRight={() => iconRail.scrollByStep(1)}
              leftLabel="Ver iconos anteriores"
              rightLabel="Ver iconos siguientes"
            >
              {iconLibrary.map((item) => (
                <IconRailButton key={`${item.id}-${item.src}`} item={item} onInsert={insertMedia} />
              ))}
            </HorizontalRail>
          ) : (
            <EmptyHint />
          )}
        </section>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          {error}
        </div>
      ) : null}

      {searching ? (
        <>
          {queryResults.shape.length > 0 ? (
            <div className="grid grid-cols-3 gap-2" aria-label="Resultados formas">
              {queryResults.shape.map((shape) => (
                <ShapeButton key={shape.id} item={shape} onInsert={insertShape} />
              ))}
            </div>
          ) : null}

          {queryResults.icon.length > 0 ? (
            <div className="grid grid-cols-3 gap-2" aria-label="Resultados iconos">
              {queryResults.icon.map((item) => (
                <MediaButton key={`${item.id}-${item.src}`} item={item} onInsert={insertMedia} />
              ))}
            </div>
          ) : null}

          {queryResults.gif.length > 0 ? (
            <div className="grid grid-cols-3 gap-2" aria-label="Resultados gifs">
              {queryResults.gif.map((item) => (
                <MediaButton key={`${item.id}-${item.src}`} item={item} onInsert={insertMedia} />
              ))}
            </div>
          ) : null}

          {!hasQueryResults ? <EmptyHint query={query} /> : null}
        </>
      ) : (
        <>
          {loading && libraryItems.length === 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={`loading-library-${idx}`}
                  className="h-[94px] rounded-xl border border-slate-200 bg-slate-100 animate-pulse"
                />
              ))}
            </div>
          ) : null}

          {filteredPopular.length > 0 ? (
            <div className="grid grid-cols-3 gap-2" aria-label="Populares">
              {filteredPopular.map((item) => (
                <MediaButton key={`${item.id}-${item.src}`} item={item} onInsert={insertMedia} />
              ))}
            </div>
          ) : loading ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={`loading-pop-${idx}`}
                  className="h-[94px] rounded-xl border border-slate-200 bg-slate-100 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <EmptyHint />
          )}

          <AccordionSection
            title={`Iconos (${iconLibrary.length})`}
            open={iconsOpen}
            onToggle={() => setIconsOpen((value) => !value)}
          >
            {iconLibrary.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {iconLibrary.map((item) => (
                  <MediaButton key={`${item.id}-${item.src}`} item={item} onInsert={insertMedia} />
                ))}
              </div>
            ) : (
              <EmptyHint />
            )}
          </AccordionSection>

          <AccordionSection
            title={`GIFs (${gifLibrary.length})`}
            open={gifsOpen}
            onToggle={() => setGifsOpen((value) => !value)}
          >
            {gifLibrary.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {gifLibrary.map((item) => (
                  <MediaButton key={`${item.id}-${item.src}`} item={item} onInsert={insertMedia} />
                ))}
              </div>
            ) : (
              <EmptyHint />
            )}
          </AccordionSection>

          {hasMore && (iconsOpen || gifsOpen) ? (
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Cargando..." : "Cargar mas elementos"}
            </button>
          ) : null}

          {!loading && iconLibrary.length === 0 && gifLibrary.length === 0 ? (
            <EmptyHint />
          ) : null}
        </>
      )}
    </div>
  );
}
