import { useCallback, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase";
import {
  applyDashboardPublicationTransition,
  assembleDashboardPublicationItems,
  loadUserPublicationSourceRecords,
} from "@/domain/publications/dashboardList";

const HOME_PUBLICATIONS_LIMIT = 10;

export function useDashboardPublications({ userUid }) {
  const [publications, setPublications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
  }, [userUid]);

  const applyPublicationTransition = useCallback((transition) => {
    setPublications((current) =>
      applyDashboardPublicationTransition(current, transition)
    );
  }, []);

  return {
    publications,
    loading,
    error,
    applyPublicationTransition,
  };
}
