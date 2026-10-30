import { useCallback, useEffect, useRef, useState } from "react";
import { providerDirectoryRequest } from "@/domain/providers/directoryApi";
import { directoryErrorState, EMPTY_DIRECTORY_FILTERS } from "@/domain/providers/directoryModel";

// A view cache lasts only for this authorized account/mount. No browser storage,
// canonical provider reads or snapshots from another account enter this hook.
export default function useProviderDirectory({ kind, id, userUid, deferInitialList = false }) {
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  const [catalog, setCatalog] = useState(null);
  const [items, setItems] = useState([]);
  const [provider, setProvider] = useState(null);
  const [filters, setFilters] = useState({ ...EMPTY_DIRECTORY_FILTERS });
  const [query, setQuery] = useState({ ...EMPTY_DIRECTORY_FILTERS });
  const [cursors, setCursors] = useState([null]);
  const [page, setPage] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const requestRef = useRef(0);
  const searchedRef = useRef(false);
  const currentRef = useRef({ userUid, kind, id });
  currentRef.current = { userUid, kind, id };

  const clear = useCallback(() => { setItems([]); setProvider(null); setNextCursor(null); }, []);
  const fail = useCallback((error) => {
    clear(); const failure = directoryErrorState(error); setStatus(failure.status); setMessage(failure.message);
  }, [clear]);

  const load = useCallback(async ({ selectedQuery = query, cursor = cursors[page], initialize = false } = {}) => {
    const request = ++requestRef.current;
    const current = () => requestRef.current === request && currentRef.current.userUid === userUid;
    setBusy(true); setMessage(""); clear();
    if (initialize) { setStatus("loading"); setCatalog(null); }
    try {
      if (initialize) {
        const access = await providerDirectoryRequest("access");
        if (!current()) return;
        if (access.enabled !== true) { setStatus("closed"); return; }
        const nextCatalog = await providerDirectoryRequest("catalog");
        if (!current()) return;
        setCatalog(nextCatalog);
      }
      // The venue discovery view asks for a search before reading provider pages.
      if (kind && deferInitialList && !searchedRef.current) { setStatus("ready"); return; }
      if (!kind && !id) { setStatus("unavailable"); return; }
      const result = await providerDirectoryRequest(kind ? "list" : "get", kind
        ? { kind, ...selectedQuery, minCapacity: kind === "lugar" && selectedQuery.minCapacity ? Number(selectedQuery.minCapacity) : null, cursor, pageSize: 12 } : { id });
      if (!current()) return;
      if (kind) { setItems(result.items || []); setNextCursor(result.nextCursor || null); }
      else setProvider(result);
      setStatus("ready");
    } catch (error) { if (current()) fail(error); }
    finally { if (current()) setBusy(false); }
  }, [query, cursors, page, clear, fail, kind, id, userUid, deferInitialList]);
  const loadRef = useRef(load); loadRef.current = load;

  useEffect(() => {
    searchedRef.current = false;
    setPage(0); setCursors([null]); setQuery({ ...EMPTY_DIRECTORY_FILTERS }); setFilters({ ...EMPTY_DIRECTORY_FILTERS });
    void loadRef.current({ initialize: true, selectedQuery: EMPTY_DIRECTORY_FILTERS, cursor: null });
    return () => { requestRef.current += 1; };
  }, [userUid, kind, id, deferInitialList]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void loadRef.current({ initialize: true }); };
    const restored = (event) => { if (event.persisted) refresh(); };
    document.addEventListener("visibilitychange", refresh); window.addEventListener("pageshow", restored);
    return () => { document.removeEventListener("visibilitychange", refresh); window.removeEventListener("pageshow", restored); };
  }, []);

  async function search(next = filters) {
    const selectedQuery = { search: next.search.trim(), categoryId: next.categoryId, location: next.location.trim(), minCapacity: kind === "lugar" && next.minCapacity ? Number(next.minCapacity) : null };
    if (kind === "lugar" && next.regionId) selectedQuery.regionId = next.regionId;
    if (kind === "lugar" && next.guests) selectedQuery.guests = Number(next.guests);
    searchedRef.current = true;
    setFilters(selectedQuery); setQuery(selectedQuery); setPage(0); setCursors([null]);
    await load({ selectedQuery, cursor: null });
  }
  async function paginate(direction) {
    const target = page + direction;
    if (target < 0 || (direction > 0 && !nextCursor)) return;
    const cursor = direction > 0 ? nextCursor : cursors[target];
    if (direction > 0) setCursors((previous) => [...previous.slice(0, target), cursor]);
    setPage(target); await load({ cursor });
  }

  async function verifyContact() {
    const request = ++requestRef.current; setBusy(true); setMessage("");
    try {
      const result = await providerDirectoryRequest("get", { id });
      if (request !== requestRef.current || currentRef.current.userUid !== userUid) return null;
      setProvider(result);
      if (result.approvedRevision !== provider?.approvedRevision) {
        setMessage("La ficha se actualizó. Revisá los datos antes de volver a contactar."); return null;
      }
      return result.content.contacto;
    } catch (error) { if (request === requestRef.current) fail(error); return null; }
    finally { if (request === requestRef.current) setBusy(false); }
  }

  return { status, message, busy, catalog, items, provider, filters, appliedFilters: query, setFilters, page: page + 1, nextCursor, search, paginate, verifyContact,
    reload: () => load({ initialize: true }) };
}
