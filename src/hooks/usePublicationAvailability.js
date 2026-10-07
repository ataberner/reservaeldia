import { useEffect, useRef, useState } from "react";
import { parseSlugFromPublicUrl } from "../lib/publicSlug.js";
import {
  subscribeToPublicationStatus,
  transitionPublishedInvitationState,
} from "../domain/publications/service.js";

const AVAILABILITY_READ_TIMEOUT_MS = 10_000;

export default function usePublicationAvailability(publicUrl) {
  const slug = parseSlugFromPublicUrl(publicUrl);
  const [snapshot, setSnapshot] = useState(null);
  const [readAttempt, setReadAttempt] = useState(0);
  const [resumeState, setResumeState] = useState(null);
  const activeRequest = useRef(null);

  useEffect(() => {
    const request = { resuming: false };
    activeRequest.current = request;
    setSnapshot(null);
    setResumeState(null);
    if (!slug) return undefined;

    const isCurrent = () => activeRequest.current === request;
    let readTimeout;
    const onError = () => {
      clearTimeout(readTimeout);
      if (isCurrent()) setSnapshot({ slug, error: true, status: null });
    };
    readTimeout = setTimeout(onError, AVAILABILITY_READ_TIMEOUT_MS);
    let unsubscribe;
    try {
      unsubscribe = subscribeToPublicationStatus({
        slug,
        onChange: (status) => {
          clearTimeout(readTimeout);
          if (isCurrent()) setSnapshot({ slug, error: false, status });
        },
        onError,
      });
    } catch {
      onError();
    }

    return () => {
      activeRequest.current = null;
      clearTimeout(readTimeout);
      unsubscribe?.();
    };
  }, [slug, readAttempt]);

  const currentSnapshot = snapshot?.slug === slug ? snapshot : null;
  const currentResume = resumeState?.slug === slug ? resumeState : null;

  const resume = async () => {
    const request = activeRequest.current;
    if (!currentSnapshot?.status?.isPaused || !request || request.resuming) return;
    request.resuming = true;
    setResumeState({ slug, pending: true, error: "" });
    try {
      await transitionPublishedInvitationState({ slug, action: "resume" });
      if (activeRequest.current === request) {
        // Re-read the current backend state before advertising the public link.
        setReadAttempt((attempt) => attempt + 1);
      }
    } catch (error) {
      if (activeRequest.current === request) {
        request.resuming = false;
        setResumeState({
          slug,
          pending: false,
          error: error?.message || "No se pudo reanudar la invitacion. Intenta nuevamente.",
        });
      }
    }
  };

  return {
    loading: Boolean(slug) && !currentSnapshot,
    readError: Boolean(currentSnapshot?.error),
    status: currentSnapshot?.status || null,
    resuming: Boolean(currentResume?.pending),
    resumeError: currentResume?.error || "",
    resume,
    retryRead: () => setReadAttempt((attempt) => attempt + 1),
  };
}
