import React, { useEffect, useRef, useState } from "react";
import { LoaderCircle, MapPin, Search, X } from "lucide-react";
import { EVENT_DETAIL_FEATURES } from "@/domain/eventDetails/features";
import {
  createGooglePlacesSessionToken,
  fetchGooglePlaceDetailsFromPrediction,
  fetchGooglePlaceSuggestions,
  getGoogleMapsApiKey,
} from "@/domain/eventDetails/googlePlaces";
import { applyEventGooglePlaceSelection } from "@/domain/eventDetails/locationAuthoring";
import { getDesignerAiLocationPhaseLabel } from "@/domain/editor/designerAiLocationInteraction";

function normalizeText(value) {
  return String(value || "").trim();
}

export default function DesignerAiLocationControl({
  phase = "ceremony",
  eventMode = "single",
  initialQuery = "",
  onCancel,
  onSelectionApplied,
}) {
  const safePhase = phase === "party" ? "party" : "ceremony";
  const feature = safePhase === "party"
    ? EVENT_DETAIL_FEATURES.PARTY
    : EVENT_DETAIL_FEATURES.CEREMONY;
  const phaseLabel = getDesignerAiLocationPhaseLabel(safePhase, eventMode);
  const [query, setQuery] = useState(() => normalizeText(initialQuery));
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const requestSequenceRef = useRef(0);
  const sessionTokenRef = useRef(null);
  const hasGoogleMapsApiKey = Boolean(getGoogleMapsApiKey());

  useEffect(() => {
    inputRef.current?.focus?.();
  }, []);

  useEffect(() => {
    const normalizedQuery = normalizeText(query);
    const requestSequence = ++requestSequenceRef.current;
    if (!hasGoogleMapsApiKey || normalizedQuery.length < 3) {
      setSuggestions([]);
      setLoading(false);
      setError("");
      return undefined;
    }

    setLoading(true);
    setError("");
    const timerId = window.setTimeout(() => {
      void (async () => {
        try {
          if (!sessionTokenRef.current) {
            sessionTokenRef.current = await createGooglePlacesSessionToken();
          }
          const nextSuggestions = await fetchGooglePlaceSuggestions(
            normalizedQuery,
            sessionTokenRef.current
          );
          if (requestSequenceRef.current !== requestSequence) return;
          setSuggestions(nextSuggestions);
        } catch (suggestionError) {
          if (requestSequenceRef.current !== requestSequence) return;
          setSuggestions([]);
          setError(
            suggestionError instanceof Error
              ? suggestionError.message
              : "No se pudieron cargar sugerencias de Google Maps."
          );
        } finally {
          if (requestSequenceRef.current === requestSequence) setLoading(false);
        }
      })();
    }, 250);

    return () => window.clearTimeout(timerId);
  }, [hasGoogleMapsApiKey, query]);

  const handleSelect = async (suggestion) => {
    if (!suggestion?.prediction || selecting) return;
    setSelecting(true);
    setError("");
    try {
      const googlePlace = await fetchGooglePlaceDetailsFromPrediction(
        suggestion.prediction
      );
      const appliedLocation = await applyEventGooglePlaceSelection({
        targetWindow: window,
        feature,
        googlePlace,
      });
      sessionTokenRef.current = null;
      const verified = await onSelectionApplied?.(appliedLocation);
      if (verified === false) {
        throw new Error("El lugar se seleccionó, pero todavía no pude verificarlo en el borrador.");
      }
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "No se pudo seleccionar la ubicación de Google Maps."
      );
      setSelecting(false);
    }
  };

  return (
    <section
      className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-[#EFDBFF] bg-white p-3 text-left font-['DM_Sans',sans-serif] text-[#262626] shadow-none transition-none [&_h3]:[text-shadow:none] [&_p]:m-0 [&_p]:[text-shadow:none]"
      aria-label={`Buscar ubicación de ${phaseLabel} en Google Maps`}
      data-designer-ai-location-control={safePhase}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#262626]">
            Ubicación de {phaseLabel}
          </h3>
          <p className="mt-1 text-xs leading-5 text-[#625d60]">
            Buscá el lugar y elegí explícitamente el resultado correcto.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={selecting}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-xl border border-[#E5E5E5] bg-white px-2.5 text-[#625d60] transition-colors hover:bg-[#FAF5FF] hover:text-[#692B9A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EFDBFF] disabled:opacity-50"
          aria-label="Cerrar Google Maps y volver al chat"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs font-medium">Volver al chat</span>
        </button>
      </div>

      <label className="mt-3 block text-xs font-medium text-[#4f494c]" htmlFor={`designer-ai-place-${safePhase}`}>
        Buscar en Google Maps
      </label>
      <div className="relative mt-1.5 min-w-0">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[#81797d]" aria-hidden="true" />
        <input
          ref={inputRef}
          id={`designer-ai-place-${safePhase}`}
          type="search"
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={`designer-ai-place-results-${safePhase}`}
          aria-autocomplete="list"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={selecting}
          className="block min-h-11 w-full min-w-0 rounded-xl border border-[#d8d3d5] bg-[#FBF7F9] py-2.5 pl-9 pr-3 font-['Source_Sans_3',sans-serif] text-sm text-[#262626] outline-none placeholder:text-[#81797d] focus:border-[#692B9A] focus-visible:ring-2 focus-visible:ring-[#EFDBFF] disabled:bg-[#f2eff1]"
          placeholder="Nombre del lugar o dirección"
        />
      </div>

      {loading || selecting ? (
        <p className="mt-2 inline-flex items-center gap-2 text-xs text-[#625d60]" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin text-[#692B9A] motion-reduce:animate-none" aria-hidden="true" />
          {selecting ? "Guardando la ubicación seleccionada…" : "Buscando lugares…"}
        </p>
      ) : null}

      {suggestions.length > 0 && !selecting ? (
        <div
          id={`designer-ai-place-results-${safePhase}`}
          role="listbox"
          className="mt-2 min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden rounded-xl border border-[#E5E5E5] bg-white overscroll-contain"
        >
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => void handleSelect(suggestion)}
              className="flex min-h-11 w-full min-w-0 items-start gap-2 border-b border-[#eee9ec] px-3 py-2.5 text-left font-['Source_Sans_3',sans-serif] text-xs leading-5 text-[#262626] last:border-b-0 hover:bg-[#FAF5FF] focus:outline-none focus-visible:bg-[#FAF5FF] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#EFDBFF]"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#692B9A]" aria-hidden="true" />
              <span className="min-w-0 break-words">{suggestion.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {!hasGoogleMapsApiKey ? (
        <p className="mt-2 rounded-xl bg-[#FFF1C2] px-2.5 py-2 text-xs text-[#5b5100]">
          La búsqueda de Google Maps no está configurada. Podés cancelar y continuar con los datos manuales.
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 rounded-xl bg-[#FFDADA] px-2.5 py-2 text-xs text-[#8f1d18]" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
