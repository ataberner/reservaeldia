import { useCallback, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase";
import {
  assembleDashboardPublicationItems,
  loadUserPublicationSourceRecords,
} from "@/domain/publications/dashboardList";

const HOME_PUBLICATIONS_LIMIT = 10;

export function useDashboardPublications({ userUid }) {
  const [publications, setPublications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let mounted = true;

    const loadPublications = async () => {
      if (!userUid) {
        if (!mounted) return;
        setPublications([]);
        setLoading(false);
        setError("");
        return;
      }

      setLoading(true);
      setError("");

      try {
        const records = await loadUserPublicationSourceRecords({
          userUid,
          limit: HOME_PUBLICATIONS_LIMIT,
        });
        const items = await assembleDashboardPublicationItems(records, {
          limit: HOME_PUBLICATIONS_LIMIT,
          readDraftBySlug: async (draftSlug) =>
            getDoc(doc(db, "borradores", draftSlug)),
        });

        if (!mounted) return;
        setPublications(items);
      } catch (loadError) {
        if (!mounted) return;
        setPublications([]);
        setError(loadError?.message || "No se pudieron cargar tus publicaciones.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadPublications();

    return () => {
      mounted = false;
    };
  }, [refreshTick, userUid]);

  const refresh = useCallback(() => {
    setRefreshTick((previous) => previous + 1);
  }, []);

  return {
    publications,
    loading,
    error,
    refresh,
  };
}
