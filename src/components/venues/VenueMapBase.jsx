import { useEffect, useRef } from "react";
import { MAX_MAP_ZOOM, MIN_MAP_ZOOM } from "./venueMapModel";
import { loadVenueMapRuntime } from "./venueMapRuntime";
import { VENUE_MAP_STYLE_URL, spanishVenueMapStyle, venueMapCamera, venueMapRequest } from "./venueMapStyle";
import styles from "./VenueResultsMap.module.css";

// Rendering adapter only. VenueResultsMap remains the sole camera/interaction
// owner, and private markers never enter MapLibre or the map provider requests.
export default function VenueMapBase({ view, width, height, attempt = 0, onError }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const latest = useRef({ view, onError });
  latest.current = { view, onError };
  const enabled = width > 0 && height > 0;

  useEffect(() => {
    if (!enabled) return undefined;
    const container = containerRef.current;
    const controller = new AbortController();
    let disposed = false;
    let map;
    const fail = () => { if (!disposed) latest.current.onError?.(); };
    async function mount() {
      try {
        const { url, ...request } = venueMapRequest(VENUE_MAP_STYLE_URL);
        const [runtime, response] = await Promise.all([
          loadVenueMapRuntime(),
          fetch(url, { ...request, signal: controller.signal }),
        ]);
        if (!response.ok) throw new Error("Venue map style unavailable");
        const style = spanishVenueMapStyle(await response.json());
        if (disposed) return;
        map = new runtime.Map({ container, style,
          ...venueMapCamera(latest.current.view),
          minZoom: MIN_MAP_ZOOM - 1, maxZoom: MAX_MAP_ZOOM - 1,
          interactive: false, attributionControl: false, logoControl: false,
          trackResize: false, renderWorldCopies: false, fadeDuration: 0,
          transformRequest: venueMapRequest,
        });
        mapRef.current = map;
        map.on("error", fail);
        map.getCanvas().setAttribute("tabindex", "-1");
      } catch (error) {
        controller.abort();
        if (!disposed && !map) container.replaceChildren();
        if (error?.name !== "AbortError") fail();
      }
    }
    mount();
    return () => {
      disposed = true;
      controller.abort();
      if (mapRef.current === map) mapRef.current = null;
      if (map) { map.off("error", fail); map.remove(); }
      else container.replaceChildren();
    };
  }, [enabled, attempt]);

  useEffect(() => { mapRef.current?.resize(); }, [width, height]);
  useEffect(() => { mapRef.current?.jumpTo(venueMapCamera(view)); }, [view.lat, view.lng, view.zoom]);

  return <div className={styles.base} ref={containerRef} aria-hidden="true" />;
}
