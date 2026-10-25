import { Search } from "lucide-react";
import { directoryCanFilter, EMPTY_DIRECTORY_FILTERS } from "@/domain/providers/directoryModel";
import ProviderDirectoryCard from "./ProviderDirectoryCard";
import styles from "./ProviderDirectory.module.css";

export function ProviderDirectoryStatus({ state, backToDirectory = false }) {
  if (state.status === "ready") return null;
  const messages = { loading: "Cargando directorio privado…", closed: "El directorio privado está cerrado en este momento.", forbidden: "Tu cuenta no tiene acceso a este directorio privado.", unavailable: "Esta ficha no está disponible en el directorio privado.", error: "No pudimos cargar el directorio. Volvé a intentar." };
  return <div className={styles.state} role={state.status === "error" ? "alert" : "status"}>
    <p>{state.busy && state.status !== "loading" ? "Actualizando directorio privado…" : state.message || messages[state.status]}</p>
    {!["loading", "forbidden"].includes(state.status) && <button type="button" className={styles.button} onClick={() => void state.reload()} disabled={state.busy}>Volver a intentar</button>}
    {state.status === "forbidden" && <a className={styles.button} href="/dashboard/">Volver a mis invitaciones</a>}
    {backToDirectory && ["invalid", "unavailable", "error"].includes(state.status) && <div className={styles.actions}><a href="/lugares/" className={styles.button}>Ver lugares</a><a href="/profesionales/" className={styles.button}>Ver profesionales</a></div>}
  </div>;
}

export function ProviderDirectoryFilters({ state, kind }) {
  const { filters, setFilters } = state;
  const update = (key, value) => setFilters((previous) => ({ ...previous, [key]: value }));
  return <form className={`${styles.filters} ${kind === "lugar" ? styles.venueFilters : ""}`} aria-label="Buscar en el directorio" onSubmit={(event) => { event.preventDefault(); void state.search(); }}>
    <label className={styles.field}><span>Nombre o descripción</span><input type="search" maxLength={120} value={filters.search} onChange={(event) => update("search", event.target.value)} /></label>
    <label className={styles.field}><span>Categoría</span><select value={filters.categoryId} onChange={(event) => update("categoryId", event.target.value)}><option value="">Todas las categorías</option>{state.catalog.categories.filter((category) => category.tipo === kind).map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></label>
    <label className={styles.field}><span>{kind === "lugar" ? "Localidad o provincia" : "Localidad o cobertura"}</span><input maxLength={120} value={filters.location} onChange={(event) => update("location", event.target.value)} /></label>
    {kind === "lugar" && <label className={styles.field}><span>Capacidad máxima desde</span><input type="number" min="1" max="100000" step="1" value={filters.minCapacity ?? ""} aria-describedby="capacity-filter-hint" onChange={(event) => update("minCapacity", event.target.value)} /></label>}
    <button type="submit" className={styles.primary} disabled={state.busy}><Search size={18} aria-hidden="true" />Buscar</button>
    {kind === "lugar" && <p id="capacity-filter-hint" className={styles.filterHint}>En personas. Al filtrar se muestran sólo lugares con capacidad máxima confirmada; no indica disponibilidad para una fecha.</p>}
  </form>;
}

export default function ProviderDirectoryResults({ state, kind }) {
  if (!state.catalog || state.status !== "ready") return <><ProviderDirectoryStatus state={state} />{directoryCanFilter(state) && <button className={styles.button} type="button" disabled={state.busy} onClick={() => void state.search(EMPTY_DIRECTORY_FILTERS)}>Limpiar filtros</button>}</>;
  return <div className={styles.results} aria-busy={state.busy}>
    {state.busy && <p className={styles.notice} role="status">Actualizando resultados…</p>}
    {!state.busy && !state.items.length && <div className={styles.state}>
      <h2>{state.nextCursor ? "Sin coincidencias en esta página" : "No encontramos fichas para esta búsqueda"}</h2>
      <p>{state.nextCursor ? "Podés continuar en la siguiente página." : "Probá otra categoría o ubicación. Sólo se muestran fichas aprobadas disponibles."}</p>
      <button className={styles.button} type="button" onClick={() => void state.search(EMPTY_DIRECTORY_FILTERS)}>Limpiar filtros</button>
    </div>}
    <div className={styles.grid}>{state.items.map((provider) => <ProviderDirectoryCard key={provider.id} provider={provider} catalog={state.catalog} kind={kind} />)}</div>
    <nav className={styles.pagination} aria-label="Páginas de resultados"><span>Página {state.page}</span><div className={styles.actions}><button type="button" className={styles.button} disabled={state.busy || state.page <= 1} onClick={() => void state.paginate(-1)}>Anterior</button><button type="button" className={styles.button} disabled={state.busy || !state.nextCursor} onClick={() => void state.paginate(1)}>Siguiente</button></div></nav>
  </div>;
}
