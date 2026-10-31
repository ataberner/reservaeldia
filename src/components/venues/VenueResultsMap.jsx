import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, MapPin, Minus, Plus, X } from "lucide-react";
import { ARGENTINA_MAP_VIEW, MAX_MAP_ZOOM, MIN_MAP_ZOOM, fitVenueMap, groupVenueMapPoints,
  mapProject, panMap, venueMapPoints } from "./venueMapModel";
import VenueMapBase from "./VenueMapBase";
import styles from "./VenueResultsMap.module.css";

export default function VenueResultsMap({ items = [], selectedId, onSelect, locationLabel = "Argentina" }) {
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState(ARGENTINA_MAP_VIEW);
  const [openGroup, setOpenGroup] = useState(null);
  const [tileError, setTileError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const points = useMemo(() => venueMapPoints(items), [items]);
  const groups = useMemo(() => groupVenueMapPoints(points, view.zoom), [points, view.zoom]);
  const pointsKey = points.map((point) => `${point.id}:${point.lat}:${point.lng}`).join("|");
  const pointsRef = useRef(points); pointsRef.current = points;

  useEffect(() => {
    const element = canvasRef.current;
    const resize = () => {
      const rect = element.getBoundingClientRect();
      setSize((previous) => previous.width === rect.width && previous.height === rect.height
        ? previous : { width: rect.width, height: rect.height });
    };
    resize();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(resize); observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    setView(fitVenueMap(pointsRef.current, size.width, size.height));
    setOpenGroup(null);
  }, [pointsKey, size.width, size.height]);

  useEffect(() => {
    const group = groups.find((entry) => entry.points.some((point) => point.id === selectedId));
    if (group) {
      setOpenGroup(group.key);
      setView((previous) => ({ ...previous, lat: group.lat, lng: group.lng }));
    }
  }, [selectedId, groups, size.width, size.height]);

  const center = mapProject(view, view.zoom);
  const activeGroup = groups.find((group) => group.key === openGroup);
  const missing = items.length - points.length;
  const zoom = (amount) => setView((previous) => ({ ...previous, zoom: Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, previous.zoom + amount)) }));
  const fit = () => { setView(fitVenueMap(points, size.width, size.height)); setOpenGroup(null); };
  const onKeyDown = (event) => {
    if (event.target !== event.currentTarget) return;
    const movements = { ArrowLeft: [-100, 0], ArrowRight: [100, 0], ArrowUp: [0, -100], ArrowDown: [0, 100] };
    if (movements[event.key]) { event.preventDefault(); setView((previous) => panMap(previous, ...movements[event.key])); }
    if (event.key === "+" || event.key === "=") { event.preventDefault(); zoom(1); }
    if (event.key === "-") { event.preventDefault(); zoom(-1); }
    if (event.key === "Escape") setOpenGroup(null);
  };
  const startDrag = (event) => {
    if (event.button !== 0 || event.target.closest("button, a, [data-map-overlay]")) return;
    dragRef.current = { x: event.clientX, y: event.clientY, view };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event) => {
    const drag = dragRef.current;
    if (drag) setView(panMap(drag.view, drag.x - event.clientX, drag.y - event.clientY));
  };
  const finishDrag = () => { dragRef.current = null; };

  return <section className={styles.root} aria-label="Mapa de los resultados">
    <div className={styles.canvas} ref={canvasRef} tabIndex={0}
      aria-label={`Mapa de ${locationLabel}. Usá las flechas para moverlo y los botones para acercar o alejar.`}
      onKeyDown={onKeyDown} onPointerDown={startDrag} onPointerMove={moveDrag}
      onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}>
      <VenueMapBase view={view} width={size.width} height={size.height} attempt={attempt} onError={() => setTileError(true)} />
      <button type="button" className={styles.fit} onClick={fit}><LocateFixed size={16} aria-hidden="true" />Ver esta página en el mapa</button>
      <div className={styles.markers}>
        {groups.map((group) => {
          const position = mapProject(group, view.zoom);
          const left = position.x - center.x + size.width / 2;
          const top = position.y - center.y + size.height / 2;
          if (left < -70 || left > size.width + 70 || top < 0 || top > size.height + 40) return null;
          const active = group.key === openGroup || group.points.some((point) => point.id === selectedId);
          return <button key={group.key} type="button" className={`${styles.marker} ${group.points.length > 1 ? styles.clusterMarker : ""} ${active ? styles.selected : ""}`}
            style={{ left, top }} aria-label={group.points.length > 1 ? `Ver ${group.points.length} lugares en ${group.sameLocation ? "esta ubicación" : "esta zona"}` : `Ver ${group.points[0].name} en el mapa`}
            title={group.points.map((point) => point.name).join(" · ")}
            aria-pressed={active} onClick={() => { setOpenGroup(group.key); onSelect?.(group.points[0].id); }}>
            <MapPin size={15} aria-hidden="true" />{group.points.length > 1 && <span className={styles.markerCount}>{group.points.length}</span>}<span className={styles.markerLabel}>{group.points.length > 1 ? `${group.points.length} lugares` : group.points[0].name}</span>
          </button>;
        })}
      </div>
      {activeGroup && <div className={styles.popup} data-map-overlay>
        <button type="button" className={styles.close} aria-label="Cerrar lugar en el mapa" onClick={() => setOpenGroup(null)}><X size={16} aria-hidden="true" /></button>
        {activeGroup.points.map((point) => <div className={styles.popupItem} key={point.id}>
          <strong>{point.name}</strong><p>{point.location}</p>
          <a href={`/proveedor/?id=${encodeURIComponent(point.id)}`}>Ver ficha <span aria-hidden="true">↗</span></a>
        </div>)}
      </div>}
      {!points.length && <div className={styles.empty} data-map-overlay role="status"><MapPin size={24} aria-hidden="true" /><strong>{items.length ? "Ubicaciones por confirmar" : "Explorá el mapa"}</strong><p>{items.length ? "Estos lugares todavía no tienen coordenadas verificadas. Podés ver sus datos en el listado." : "Los lugares con ubicación verificada aparecerán acá cuando haya resultados."}</p></div>}
      {tileError && <div className={styles.error} data-map-overlay role="status">No pudimos cargar parte del mapa.<button type="button" onClick={() => { setTileError(false); setAttempt((value) => value + 1); }}>Reintentar</button></div>}
      <div className={styles.zoom} aria-label="Zoom del mapa">
        <button type="button" aria-label="Acercar mapa" disabled={view.zoom >= MAX_MAP_ZOOM} onClick={() => zoom(1)}><Plus size={20} aria-hidden="true" /></button>
        <button type="button" aria-label="Alejar mapa" disabled={view.zoom <= MIN_MAP_ZOOM} onClick={() => zoom(-1)}><Minus size={20} aria-hidden="true" /></button>
      </div>
      <div className={styles.attribution}><a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>{" · "}<a href="https://www.openmaptiles.org" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a>{" · Datos de "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a></div>
    </div>
    <p className={styles.caption}>{points.length ? `${points.length} ${points.length === 1 ? "lugar ubicado" : "lugares ubicados"} de esta página.` : "Sólo ubicaciones verificadas."}{missing > 0 && points.length > 0 ? ` ${missing} sin coordenadas.` : ""}</p>
  </section>;
}
