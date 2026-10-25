import { useCallback, useEffect, useRef, useState } from "react";
import { providerAdminRequest } from "@/domain/providers/adminApi";
import { emptyProviderDraft, normalizeDraftForForm, providerErrorMessage, setDraftField } from "@/domain/providers/adminForm";

const EMPTY_FILTERS = { search: "", categoryId: "", city: "", publication: "", owner: "", pending: "" };

export default function useProviderAdmin() {
  const [access, setAccess] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [page, setPage] = useState(1);
  const [listStatus, setListStatus] = useState("loading");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // The last requested query owns retries and pagination, including failed reads.
  // Form inputs remain independent until the administrator submits a search.
  const listRequest = useRef({ filters: EMPTY_FILTERS, cursor: null, page: 1, cursors: [null] });
  const listChanged = useRef(false);
  const [provider, setProvider] = useState(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyProviderDraft);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);
  const [reviewedRevision, setReviewedRevision] = useState(null);
  const mounted = useRef(false);
  const requestId = useRef(0);

  const run = useCallback(async (operation) => {
    const id = ++requestId.current;
    setBusy(true); setError(""); setMessage("");
    try { return await operation(() => mounted.current && requestId.current === id); }
    catch (failure) { if (mounted.current && requestId.current === id) setError(providerErrorMessage(failure)); }
    finally { if (mounted.current && requestId.current === id) setBusy(false); }
  }, []);

  const loadList = useCallback(async (request = listRequest.current) => run(async (current) => {
    listRequest.current = request;
    setItems([]); setNextCursor(null); setPage(request.page); setListStatus("loading");
    const { pending, ...otherFilters } = request.filters;
    try {
      const result = await providerAdminRequest("list", { ...otherFilters, ...(pending ? { pending: pending === "true" } : {}), cursor: request.cursor, pageSize: 20 });
      if (!current()) return;
      setItems(result.items); setNextCursor(result.nextCursor); setListStatus("ready");
    } catch (failure) {
      if (current()) setListStatus("error");
      throw failure;
    }
  }), [run]);

  const initialize = useCallback(() => run(async (current) => {
      const result = await providerAdminRequest("access");
      if (!current()) return;
      setAccess(result);
      if (!result.enabled) return;
      const [nextCatalog, list] = await Promise.all([
        providerAdminRequest("catalog"), providerAdminRequest("list", { pageSize: 20 }),
      ]);
      if (!current()) return;
      setCatalog(nextCatalog); setItems(list.items); setNextCursor(list.nextCursor); setListStatus("ready");
    }), [run]);

  useEffect(() => {
    mounted.current = true;
    void initialize();
    return () => { mounted.current = false; requestId.current += 1; };
  }, [initialize]);

  function acceptProvider(result) {
    setProvider(result.provider); setCreating(false);
    setDraft(normalizeDraftForForm(result.provider.draft)); setNotes(result.provider.internalNotes || "");
    setPreview(null); setReviewedRevision(null);
  }
  const dirty = creating || Boolean(provider && (JSON.stringify(draft) !== JSON.stringify(normalizeDraftForForm(provider.draft)) || notes !== (provider.internalNotes || "")));
  useEffect(() => {
    if (!dirty) return undefined;
    const warnUnsaved = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warnUnsaved);
    return () => window.removeEventListener("beforeunload", warnUnsaved);
  }, [dirty]);
  const setField = (path, value) => setDraft((previous) => setDraftField(previous, path, value));
  function create() {
    setProvider(null); setCreating(true); setDraft(emptyProviderDraft()); setNotes("");
    setPreview(null); setReviewedRevision(null); setError(""); setMessage("");
  }
  async function open(id) {
    await run(async (current) => {
      const result = await providerAdminRequest("get", { id });
      if (current()) acceptProvider(result);
    });
  }
  async function save() {
    await run(async (current) => {
      const result = await providerAdminRequest(creating ? "create" : "save", { ...(provider ? { id: provider.id, expectedRevision: provider.revision, ...(provider.versionToken ? { expectedVersionToken: provider.versionToken } : {}) } : {}), draft, internalNotes: notes });
      if (!current()) return;
      listChanged.current = true;
      acceptProvider(result); setMessage("Borrador guardado. La versión aprobada se conserva.");
    });
  }
  async function transition(operation, reason = "") {
    await run(async (current) => {
      const result = await providerAdminRequest(operation, { id: provider.id, expectedRevision: provider.revision, ...(provider.versionToken ? { expectedVersionToken: provider.versionToken } : {}), ...(operation === "approve" ? { reviewRevision: reviewedRevision } : {}), reason });
      if (!current()) return;
      listChanged.current = true;
      acceptProvider(result);
      setMessage({ submit: "Revisión enviada. La versión aprobada anterior se conserva.", approve: "Revisión aprobada. El directorio público continúa desactivado.", requestChanges: "Correcciones solicitadas.", pause: "Ficha pausada.", archive: "Ficha archivada. El historial se conserva.", resume: "Ficha reactivada dentro de la beta privada." }[operation]);
    });
  }
  async function showPreview(version) {
    await run(async (current) => {
      const result = await providerAdminRequest("preview", { id: provider.id, version });
      if (!current()) return;
      setPreview({ ...result, version });
      if (version === "review") setReviewedRevision(result.revision);
    });
  }
  async function loadMoreHistory() {
    if (!provider?.historyCursor) return;
    await run(async (current) => {
      const result = await providerAdminRequest("history", { id: provider.id, cursor: provider.historyCursor, pageSize: 50 });
      if (!current()) return;
      setProvider((previous) => ({ ...previous, history: [...previous.history, ...result.items], historyCursor: result.nextCursor }));
    });
  }
  async function back() {
    setProvider(null); setCreating(false); setPreview(null); setError(""); setMessage("");
    const request = listRequest.current;
    setFilters(request.filters);
    const next = listChanged.current ? { ...request, cursor: null, page: 1, cursors: [null] } : request;
    listChanged.current = false;
    await loadList(next);
  }
  function search() {
    const nextFilters = { ...filters, search: filters.search.trim(), city: filters.city.trim() };
    setFilters(nextFilters);
    return loadList({ filters: nextFilters, cursor: null, page: 1, cursors: [null] });
  }
  function paginate(direction) {
    if (busy || listStatus !== "ready") return;
    const nextPage = page + direction;
    if (nextPage < 1 || (direction > 0 && !nextCursor)) return;
    const request = listRequest.current;
    const cursors = request.cursors.slice(0, direction > 0 ? nextPage : request.cursors.length);
    if (direction > 0) cursors[nextPage - 1] = nextCursor;
    return loadList({ ...request, cursor: cursors[nextPage - 1], page: nextPage, cursors });
  }
  function reload() {
    if (provider) return open(provider.id);
    if (!catalog) return initialize();
    setFilters(listRequest.current.filters);
    return loadList();
  }
  return { access, catalog, items, nextCursor, page, listStatus, filters, setFilters, provider, creating, draft, notes, setNotes, busy, error, setError, message, preview, reviewedRevision, dirty, setField, create, open, save, transition, showPreview, loadMoreHistory, back, search, paginate, reload };
}
