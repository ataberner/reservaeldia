import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Hotel, Trees, Utensils, MapPin, Search, Map, LayoutGrid, SlidersHorizontal } from "lucide-react";
import MarketplaceHeader from "../marketplace/MarketplaceHeader";
import { directoryCanFilter } from "@/domain/providers/directoryModel";
import { ProviderDirectoryStatus } from "../marketplace/ProviderDirectoryResults";
import useProviderDirectory from "../marketplace/useProviderDirectory";
import VenueResultsMap from "./VenueResultsMap";
import VenueResultCard from "./VenueResultCard";
import VenueSearchForm from "./VenueSearchForm";
import styles from "./VenuesLanding.module.css";

const CATEGORY_ICONS = { "salones-fiestas": Building2, hoteles: Hotel, quintas: Trees, estancias: Trees, restaurantes: Utensils };

export default function VenuesLanding({ user }) {
  const state = useProviderDirectory({ kind: "lugar", userUid: user.uid, deferInitialList: true });
  const [searched, setSearched] = useState(false);
  const [mobileView, setMobileView] = useState("list");
  const [selectedId, setSelectedId] = useState(null);
  const formRef = useRef(null);
  const resultsRef = useRef(null);
  const categories = (state.catalog?.categories || []).filter((category) => category.tipo === "lugar");
  const regions = state.catalog?.regions || [];
  const region = regions.find((entry) => entry.id === state.appliedFilters.regionId);
  const canSearch = directoryCanFilter(state);
  const ready = state.status === "ready" && !state.busy;

  function search(event) {
    event.preventDefault();
    setSearched(true); setSelectedId(null);
    void state.search();
    requestAnimationFrame(() => resultsRef.current?.focus());
  }
  function chooseCategory(id) {
    state.setFilters((previous) => ({ ...previous, categoryId: id }));
    formRef.current?.querySelector("input[name='guests']")?.focus();
  }
  async function paginate(direction) {
    setSelectedId(null);
    await state.paginate(direction);
    resultsRef.current?.focus();
  }
  function selectOnMap(id) { setSelectedId(id); setMobileView("map"); }
  const visibleItems = state.status === "ready" ? state.items : [];

  return <>
    <MarketplaceHeader user={user} current="venues" />
    <main className={`${styles.root} ${searched ? styles.searchMode : ""}`}>
      {!searched ? <section className={styles.hero} aria-labelledby="venues-title">
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}><span />Lugares para casamientos</p>
          <h1 id="venues-title" className={styles.title}>El lugar donde empieza <span>su historia.</span></h1>
          <p className={styles.intro}>Un salón, una quinta, un rincón especial.<br />Encontrá ese lugar que se siente como ustedes.</p>
          <p className={styles.heroFootnote}><MapPin size={16} aria-hidden="true" />Celebraciones en toda Argentina</p>
        </div>
        <figure className={styles.heroImage}>
          <div className={styles.heroPhoto} role="img" aria-label="Ambientación ilustrativa de una celebración al aire libre" />
          <figcaption>Inspiración para tu celebración · Imagen ilustrativa</figcaption>
        </figure>
        <div className={styles.heroSearch}>
          {canSearch ? <VenueSearchForm state={state} categories={categories} regions={regions} onSubmit={search} formRef={formRef} /> : <ProviderDirectoryStatus state={state} />}
          <p className={styles.searchHint}>Sólo lugares con capacidad informada para tus invitados. La disponibilidad se consulta con cada lugar.</p>
        </div>
      </section> : <section className={styles.searchBand} aria-label="Tu búsqueda de lugares">
        <div className={styles.searchBandHeading}>
          <button type="button" className={styles.back} onClick={() => setSearched(false)}><ArrowLeft size={16} aria-hidden="true" />Volver al inicio</button>
          <span className={styles.privateLabel}>Beta privada · Superadmin</span>
        </div>
        {canSearch && <VenueSearchForm state={state} categories={categories} regions={regions} onSubmit={search} formRef={formRef} compact />}
      </section>}

      {!searched ? <section className={styles.explore} aria-labelledby="venues-explore">
        <div className={styles.exploreHeading}><div><p className={styles.eyebrow}>A su manera</p><h2 id="venues-explore">Cada historia tiene su lugar</h2></div><p>Elegí el estilo y empezá a imaginar el gran día.</p></div>
        <div className={styles.categoryGrid}>{categories.map((category) => {
          const Icon = CATEGORY_ICONS[category.id] || Building2;
          return <button key={category.id} type="button" className={styles.categoryChoice} onClick={() => chooseCategory(category.id)} disabled={!canSearch || state.busy} aria-pressed={state.filters.categoryId === category.id}>
            <Icon size={25} strokeWidth={1.5} aria-hidden="true" /><span>{category.nombre}</span><ArrowRight size={17} aria-hidden="true" />
          </button>;
        })}</div>
        <p className={styles.privateFootnote}>Beta privada para superadmin. Sólo se consultan fichas aprobadas.</p>
      </section> : <section className={styles.discovery} aria-label="Resultados de lugares">
        <div className={styles.resultsToolbar}>
          <div><h1 ref={resultsRef} tabIndex={-1} className={styles.resultsTitle}>Lugares {region && region.id !== "ar" ? `en ${region.nombre}` : "para tu casamiento"}</h1><p role="status" aria-live="polite">{state.busy ? "Buscando lugares para ustedes…" : ready ? `${state.items.length} ${state.items.length === 1 ? "lugar en esta página" : "lugares en esta página"}${state.appliedFilters.guests ? ` · Para ${state.appliedFilters.guests} invitados` : ""}` : "Revisá el estado de tu búsqueda"}</p></div>
          {canSearch && <label className={styles.nameSearch}><Search size={17} aria-hidden="true" /><span className={styles.srOnly}>Nombre o descripción</span><input type="search" form="venue-search" placeholder="Buscar por nombre" maxLength={120} value={state.filters.search} onChange={(event) => state.setFilters((previous) => ({ ...previous, search: event.target.value }))} /></label>}
          <div className={styles.mobileSwitch} aria-label="Vista de resultados"><button type="button" aria-pressed={mobileView === "list"} onClick={() => setMobileView("list")}><LayoutGrid size={16} aria-hidden="true" />Lista</button><button type="button" aria-pressed={mobileView === "map"} onClick={() => setMobileView("map")}><Map size={16} aria-hidden="true" />Mapa</button></div>
        </div>
        <div className={styles.resultsLayout}>
          <div className={`${styles.results} ${mobileView === "map" ? styles.hiddenOnMobile : ""}`} aria-busy={state.busy}>
            {state.status !== "ready" ? <ProviderDirectoryStatus state={state} /> : state.busy ? <div className={styles.loadingGrid} role="status" aria-label="Buscando lugares"><div /><div /><div /><div /></div> : !state.items.length ? <div className={styles.empty}><SlidersHorizontal size={28} aria-hidden="true" /><h2>Todavía no encontramos ese lugar</h2><p>Probá otra zona o tipo de lugar. Mostramos sólo fichas aprobadas con capacidad informada para la cantidad de invitados que elegiste.</p><button type="button" onClick={() => formRef.current?.querySelector("select")?.focus()}>Revisar mi búsqueda <ArrowRight size={16} aria-hidden="true" /></button></div> : <div className={styles.venueGrid}>{state.items.map((provider) => <VenueResultCard key={provider.id} provider={provider} categories={categories} selected={selectedId === provider.id} onSelect={selectOnMap} />)}</div>}
            {state.status === "ready" && <nav className={styles.pagination} aria-label="Páginas de resultados"><span>Página {state.page}</span><div><button type="button" disabled={state.busy || state.page <= 1} onClick={() => void paginate(-1)}>Anterior</button><button type="button" disabled={state.busy || !state.nextCursor} onClick={() => void paginate(1)}>Siguiente <ArrowRight size={15} aria-hidden="true" /></button></div></nav>}
          </div>
          <aside className={`${styles.mapColumn} ${mobileView === "list" ? styles.hiddenOnMobile : ""}`} aria-label="Mapa de los resultados">
            <VenueResultsMap items={visibleItems} selectedId={selectedId} onSelect={setSelectedId} locationLabel={region?.nombre || "Argentina"} />
            <p className={styles.mapHint}>El mapa muestra los lugares de esta página con coordenadas verificadas.</p>
          </aside>
        </div>
      </section>}
    </main>
  </>;
}
