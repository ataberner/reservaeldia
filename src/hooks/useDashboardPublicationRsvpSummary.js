import { useEffect, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/firebase";
import {
  adaptRsvpResponse,
  computeAttendanceResponseSummary,
} from "@/domain/rsvp/publicadas";

const EMPTY_SUMMARY = Object.freeze({
  attendingResponses: 0,
  declinedResponses: 0,
});

function normalizeText(value) {
  return String(value || "").trim();
}

function resolveActivePublicationSlug(publication) {
  if (publication?.source !== "active" || publication?.isActive !== true) {
    return "";
  }
  return normalizeText(publication.publicSlug || publication.id);
}

export function useDashboardPublicationRsvpSummary({ publication } = {}) {
  const publicationSlug = resolveActivePublicationSlug(publication);
  const rsvpConfig =
    publication?.raw?.rsvp && typeof publication.raw.rsvp === "object"
      ? publication.raw.rsvp
      : null;
  const [state, setState] = useState({
    ready: false,
    error: "",
    ...EMPTY_SUMMARY,
  });

  useEffect(() => {
    if (!publicationSlug) {
      setState({
        ready: false,
        error: "",
        ...EMPTY_SUMMARY,
      });
      return undefined;
    }

    setState({
      ready: false,
      error: "",
      ...EMPTY_SUMMARY,
    });

    const rsvpsQuery = query(
      collection(db, "publicadas", publicationSlug, "rsvps")
    );

    const unsubscribe = onSnapshot(
      rsvpsQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((docItem) =>
          adaptRsvpResponse(
            {
              id: docItem.id,
              ...(docItem.data() || {}),
            },
            rsvpConfig
          )
        );
        setState({
          ready: true,
          error: "",
          ...computeAttendanceResponseSummary(rows),
        });
      },
      (snapshotError) => {
        setState({
          ready: false,
          error:
            snapshotError?.message ||
            "No se pudieron cargar las respuestas RSVP.",
          ...EMPTY_SUMMARY,
        });
      }
    );

    return () => unsubscribe();
  }, [publicationSlug, rsvpConfig]);

  return state;
}
