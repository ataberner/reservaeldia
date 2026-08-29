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
      className="w-full min-w-0 max-w-full rounded-xl border border-violet-200 bg-white p-3 text-left shadow-sm"
      aria-label={`Buscar ubicación de ${phaseLabel} en Google Maps`}
      data-designer-ai-location-control={safePhase}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">
            Ubicación de {phaseLabel}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Buscá el lugar y elegí explícitamente el resultado correcto.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={selecting}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-50"
          aria-label="Cancelar búsqueda en Google Maps"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <label className="mt-3 block text-xs font-medium text-slate-700" htmlFor={`designer-ai-place-${safePhase}`}>
        Buscar en Google Maps
      </label>
      <div className="relative mt-1.5 min-w-0">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true" />
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
          className="block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
          placeholder="Nombre del lugar o dirección"
        />
      </div>

      {loading || selecting ? (
        <p className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {selecting ? "Guardando la ubicación seleccionada…" : "Buscando lugares…"}
        </p>
      ) : null}

      {suggestions.length > 0 && !selecting ? (
        <div
          id={`designer-ai-place-results-${safePhase}`}
          role="listbox"
          className="mt-2 max-h-52 w-full min-w-0 overflow-y-auto overflow-x-hidden rounded-lg border border-slate-200 bg-white overscroll-contain"
        >
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => void handleSelect(suggestion)}
              className="flex min-h-11 w-full min-w-0 items-start gap-2 border-b border-slate-100 px-3 py-2.5 text-left text-xs leading-relaxed text-slate-800 last:border-b-0 hover:bg-violet-50 focus:outline-none focus-visible:bg-violet-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-300"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
              <span className="min-w-0 break-words">{suggestion.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {!hasGoogleMapsApiKey ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
          La búsqueda de Google Maps no está configurada. Podés cancelar y continuar con los datos manuales.
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-xs text-rose-800" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
