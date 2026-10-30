import { Building2, Users, MapPin, Search, LoaderCircle } from "lucide-react";
import styles from "./VenuesLanding.module.css";

export default function VenueSearchForm({ state, categories, regions, onSubmit, formRef, compact = false }) {
  const update = (key, value) => state.setFilters((previous) => ({ ...previous, [key]: value }));
  const groups = [...new Set(regions.filter((entry) => entry.id !== "ar").map((entry) => entry.group))];
  return <form ref={formRef} id="venue-search" className={`${styles.searchForm} ${compact ? styles.compactForm : ""}`} aria-label="Encontrar un lugar para tu casamiento" onSubmit={onSubmit}>
    <label className={styles.searchField}><Building2 size={22} strokeWidth={1.6} aria-hidden="true" /><span><span className={styles.fieldLabel}>Tipo de lugar</span><select name="category" value={state.filters.categoryId} onChange={(event) => update("categoryId", event.target.value)}><option value="">Todos los lugares</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></span></label>
    <label className={styles.searchField}><Users size={22} strokeWidth={1.6} aria-hidden="true" /><span><span className={styles.fieldLabel}>Cantidad de invitados</span><input name="guests" type="number" required min="1" max="100000" step="1" inputMode="numeric" placeholder="¿Cuántos son?" value={state.filters.guests ?? ""} onChange={(event) => update("guests", event.target.value)} /></span></label>
    <label className={`${styles.searchField} ${styles.regionField}`}><MapPin size={22} strokeWidth={1.6} aria-hidden="true" /><span><span className={styles.fieldLabel}>¿Dónde querés celebrar?</span><select name="region" required value={state.filters.regionId || ""} onChange={(event) => update("regionId", event.target.value)}><option value="" disabled>Zona o provincia</option>{regions.filter((entry) => entry.id === "ar").map((entry) => <option key={entry.id} value={entry.id}>{entry.nombre}</option>)}{groups.map((group) => <optgroup label={group} key={group}>{regions.filter((entry) => entry.group === group && entry.id !== "ar").map((entry) => <option key={entry.id} value={entry.id}>{entry.nombre}</option>)}</optgroup>)}</select></span></label>
    <button className={styles.searchButton} type="submit" disabled={state.busy}>{state.busy ? <LoaderCircle size={20} className={styles.spinner} aria-hidden="true" /> : <Search size={20} aria-hidden="true" />}<span>{state.busy ? "Buscando…" : "Buscar lugares"}</span></button>
  </form>;
}
