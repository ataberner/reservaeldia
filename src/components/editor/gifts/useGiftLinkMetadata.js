import { useCallback, useEffect, useReducer, useRef } from "react";
import { sanitizeGiftLinkUrl } from "../../../domain/gifts/config.js";
import { createGiftMetadataState, giftLinkMetadataReducer } from "./giftLinkMetadataState.js";

export default function useGiftLinkMetadata(config, loadLinkMetadata) {
  const [state, dispatch] = useReducer(giftLinkMetadataReducer, config, createGiftMetadataState);
  const active = useRef(true);
  const sequence = useRef(0);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const setDraft = useCallback((update) => dispatch({ type: "draft-update", update }), []);
  const changeLink = useCallback((id, changes) => dispatch({ type: "edit-link", id, changes }), []);
  const removeLink = useCallback((id) => dispatch({ type: "remove-link", id }), []);
  const cancelPending = useCallback(() => { active.current = false; }, []);
  const requestMetadata = useCallback((link) => {
    const url = sanitizeGiftLinkUrl(link.url);
    if (!active.current || typeof loadLinkMetadata !== "function" || !url || link.id === "legacy") return;
    const token = ++sequence.current;
    dispatch({ type: "metadata-start", id: link.id, url, token });
    Promise.resolve().then(() => active.current ? loadLinkMetadata(url) : { status: "unavailable" }).catch(() => ({ status: "unavailable" })).then((result) => {
      if (active.current) dispatch({ type: "metadata-complete", id: link.id, token, result });
    });
  }, [loadLinkMetadata]);

  return { draft: state.draft, setDraft, metadataStates: state.requests, changeLink, removeLink, requestMetadata, cancelPending };
}
