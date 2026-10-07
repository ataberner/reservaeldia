import { useCallback, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { createDashboardAuthRecovery } from "@/lib/auth/dashboardAuthRecovery";
import { isTransientDashboardReadError } from "@/domain/dashboard/readRecovery";
import {
  applyDashboardPublicationTransition,
  assembleDashboardPublicationItems,
  loadUserPublicationSourceRecords,
} from "@/domain/publications/dashboardList";

const HOME_PUBLICATIONS_LIMIT = 10;

export function useDashboardPublications({ userUid, startupRecoveryGeneration = 0 }) {
  const [publications, setPublications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recoveryState, setRecoveryState] = useState("idle");
  const [resolvedScope, setResolvedScope] = useState(null);
  const scope = JSON.stringify([userUid, startupRecoveryGeneration]);

  useEffect(() => {
    let mounted = true;
    let recovery;

    const loadPublications = async () => {
      if (!userUid) {
        if (!mounted) return;
        setPublications([]);
        setLoading(false);
        setError("");
        setRecoveryState("idle");
        setResolvedScope(scope);
        return;
      }

      setLoading(true);
      setError("");
      setRecoveryState("idle");

      try {
        recovery = createDashboardAuthRecovery({
          task: async () => {
            const records = await loadUserPublicationSourceRecords({
              userUid,
              limit: HOME_PUBLICATIONS_LIMIT,
              source: "server",
            });
            return assembleDashboardPublicationItems(records, {
              limit: HOME_PUBLICATIONS_LIMIT,
              readDraftBySlug: async (draftSlug) =>
                getDoc(doc(db, "borradores", draftSlug)),
            });
          },
          shouldRetry: isTransientDashboardReadError,
          isCurrent: () => mounted,
          onStateChange: setRecoveryState,
        });
        const outcome = await recovery.promise;
        if (!mounted || outcome.status !== "success") return;
        setPublications(outcome.value);
      } catch (loadError) {
        if (!mounted) return;
        setPublications([]);
        setError(loadError?.message || "No se pudieron cargar tus publicaciones.");
      } finally {
        if (mounted) {
          setLoading(false);
          setResolvedScope(scope);
          setRecoveryState("idle");
        }
      }
    };

    void loadPublications();

    return () => {
      mounted = false;
      recovery?.cancel();
    };
  }, [userUid, startupRecoveryGeneration, scope]);

  const applyPublicationTransition = useCallback((transition) => {
    setPublications((current) =>
      applyDashboardPublicationTransition(current, transition)
    );
  }, []);

  return {
    publications: resolvedScope === scope ? publications : [],
    loading: loading || resolvedScope !== scope,
    error,
    recoveryState,
    applyPublicationTransition,
  };
}
