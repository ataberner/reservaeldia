import { argentinaProvince, argentinaProvinces, normalizeSearchText } from "./normalization";
import { DIRECTORY_GBA_LOCALITIES } from "./directoryRegionLocalities";

export type DirectoryRegion = { id: string; nombre: string; group: string };
export const DIRECTORY_REGIONS: readonly DirectoryRegion[] = Object.freeze([
  { id: "ar", nombre: "Toda Argentina", group: "Argentina" },
  { id: "caba", nombre: "CABA", group: "Buenos Aires y alrededores" },
  { id: "gba-norte", nombre: "Gran Buenos Aires · Zona norte", group: "Buenos Aires y alrededores" },
  { id: "gba-oeste", nombre: "Gran Buenos Aires · Zona oeste", group: "Buenos Aires y alrededores" },
  { id: "gba-sur", nombre: "Gran Buenos Aires · Zona sur", group: "Buenos Aires y alrededores" },
  ...argentinaProvinces().filter(province => province.tipo === "provincia")
    .map(province => ({ id: `provincia:${province.codigo}`, nombre: province.nombre.replace(/^Provincia de /, ""), group: "Provincias" }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
]);

const regions = new Set(DIRECTORY_REGIONS.map(region => region.id));
const gbaByLocality = new Map(Object.entries(DIRECTORY_GBA_LOCALITIES)
  .flatMap(([region, names]) => names.map(name => [normalizeSearchText(name), region] as const)));

export function directoryRegionExists(id: string): boolean { return regions.has(id); }

/** Read-only search grouping of approved locality/province, never geocoding or a persisted claim. */
export function matchesDirectoryRegion(location: Record<string, unknown>, regionId: string): boolean {
  if (!regionId) return true; // The existing professional/legacy free-text contract remains intact.
  const countryCode = normalizeSearchText(location.paisCodigo);
  const countryName = normalizeSearchText(location.pais);
  const country = countryCode || countryName;
  if (country && !["ar", "argentina", "republica argentina"].includes(country)) return false;
  // An explicit contradictory country is not overridden by a province homonym.
  if (countryName && !["ar", "argentina", "republica argentina"].includes(countryName)) return false;
  const province = argentinaProvince(location.provincia);
  if (!country && !province) return false;
  if (regionId === "ar") return true;
  if (regionId === "caba") return province?.codigo === "AR-C";
  if (regionId.startsWith("provincia:")) return province?.codigo === regionId.slice("provincia:".length);
  return province?.codigo === "AR-B" && gbaByLocality.get(normalizeSearchText(location.ciudad)) === regionId;
}
