import { normalizePublicSlug } from "../utils/publicSlug";
import { resolvePublicationLifecycleSnapshotFromData } from "./publicationLifecycle";
import {
  isCompliantPublishedShareImageBuffer,
  isCurrentGeneratedShareImageRequest,
  PUBLIC_INVITATION_ROBOTS_CONTENT,
  PUBLIC_SHARE_IMAGE_ROBOTS_CONTENT,
} from "./publishedShareImage";

type PublicDeliveryLogger = {
  warn?(message: string, context: Record<string, unknown>): void;
  error?(message: string, context: Record<string, unknown>): void;
};

export type PublicInvitationAccessResult =
  | { ok: true; publicationData: Record<string, unknown> }
  | { ok: false; status: number; message: string };

export type PublicDeliveryResponse = {
  status: number;
  headers?: Record<string, string>;
  body: string | Buffer;
};

const PUBLIC_INVITATION_ROBOTS_HEADERS = Object.freeze({
  "X-Robots-Tag": PUBLIC_INVITATION_ROBOTS_CONTENT,
});
const PUBLIC_INVITATION_HTML_HEADERS = Object.freeze({
  "Content-Type": "text/html; charset=utf-8",
  "X-Robots-Tag": PUBLIC_INVITATION_ROBOTS_CONTENT,
});
const PUBLIC_SHARE_IMAGE_ROBOTS_HEADERS = Object.freeze({
  "X-Robots-Tag": PUBLIC_SHARE_IMAGE_ROBOTS_CONTENT,
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "");
}

export async function resolvePublicInvitationAccessFlow(params: {
  slug: string;
  loadPublicationData(slug: string): Promise<Record<string, unknown> | null>;
  finalizeExpiredPublication(input: {
    slug: string;
    reason: string;
  }): Promise<unknown>;
  logger?: PublicDeliveryLogger;
}): Promise<PublicInvitationAccessResult> {
  const { slug, loadPublicationData, finalizeExpiredPublication, logger } = params;

  try {
    const publicationData = await loadPublicationData(slug);
    if (!publicationData) {
      return { ok: false, status: 404, message: "Invitacion publicada no encontrada" };
    }

    const lifecycleSnapshot = resolvePublicationLifecycleSnapshotFromData(publicationData);
    if (
      !lifecycleSnapshot.rawPublicState ||
      !lifecycleSnapshot.isPubliclyAccessibleByState
    ) {
      return { ok: false, status: 404, message: "Invitacion no disponible" };
    }

    if (lifecycleSnapshot.isExpired) {
      try {
        await finalizeExpiredPublication({
          slug,
          reason: "expired-public-slug-request",
        });
      } catch (finalizeError) {
        logger?.warn?.("No se pudo finalizar una publicacion vencida en acceso por slug", {
          slug,
          error: getErrorMessage(finalizeError),
        });
      }
      return { ok: false, status: 404, message: "Invitacion no disponible" };
    }

    return { ok: true, publicationData };
  } catch (error) {
    logger?.error?.("Error resolviendo invitacion publica por slug", {
      slug,
      error: getErrorMessage(error),
    });
    return { ok: false, status: 500, message: "No se pudo cargar la invitacion" };
  }
}

export function resolveRequestedShareVersion(value: unknown): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

export async function resolvePublicInvitationHtmlResponse(params: {
  slugInput: unknown;
  loadPublicationData(slug: string): Promise<Record<string, unknown> | null>;
  finalizeExpiredPublication(input: {
    slug: string;
    reason: string;
  }): Promise<unknown>;
  readPublicHtmlArtifact(slug: string): Promise<Buffer | string | null>;
  logger?: PublicDeliveryLogger;
}): Promise<PublicDeliveryResponse> {
  const slug = normalizePublicSlug(params.slugInput);
  if (!slug) {
    return {
      status: 400,
      headers: PUBLIC_INVITATION_ROBOTS_HEADERS,
      body: "Falta el slug",
    };
  }

  const access = await resolvePublicInvitationAccessFlow({
    slug,
    loadPublicationData: params.loadPublicationData,
    finalizeExpiredPublication: params.finalizeExpiredPublication,
    logger: params.logger,
  });
  if (!access.ok) {
    return {
      status: access.status,
      headers: PUBLIC_INVITATION_ROBOTS_HEADERS,
      body: access.message,
    };
  }

  try {
    const content = await params.readPublicHtmlArtifact(slug);
    if (!content) {
      return {
        status: 404,
        headers: PUBLIC_INVITATION_ROBOTS_HEADERS,
        body: "Invitacion publicada no encontrada",
      };
    }

    return {
      status: 200,
      headers: PUBLIC_INVITATION_HTML_HEADERS,
      body: Buffer.isBuffer(content) ? content.toString() : String(content),
    };
  } catch (error) {
    params.logger?.error?.("Error descargando invitacion publica por slug", {
      slug,
      error: getErrorMessage(error),
    });
    return {
      status: 500,
      headers: PUBLIC_INVITATION_ROBOTS_HEADERS,
      body: "No se pudo cargar la invitacion",
    };
  }
}

export async function resolvePublicShareImageResponse(params: {
  slugInput: unknown;
  requestedVersionInput: unknown;
  loadPublicationData(slug: string): Promise<Record<string, unknown> | null>;
  finalizeExpiredPublication(input: {
    slug: string;
    reason: string;
  }): Promise<unknown>;
  readPublicShareImageArtifact(slug: string): Promise<Buffer | null>;
  isShareImageCompliant?(image: Buffer): Promise<boolean>;
  logger?: PublicDeliveryLogger;
}): Promise<PublicDeliveryResponse> {
  const slug = normalizePublicSlug(params.slugInput);
  if (!slug) {
    return {
      status: 400,
      headers: PUBLIC_SHARE_IMAGE_ROBOTS_HEADERS,
      body: "Falta el slug",
    };
  }

  const access = await resolvePublicInvitationAccessFlow({
    slug,
    loadPublicationData: params.loadPublicationData,
    finalizeExpiredPublication: params.finalizeExpiredPublication,
    logger: params.logger,
  });
  if (!access.ok) {
    return {
      status: access.status,
      headers: PUBLIC_SHARE_IMAGE_ROBOTS_HEADERS,
      body: access.message,
    };
  }

  try {
    const requestedVersion = resolveRequestedShareVersion(params.requestedVersionInput);
    if (
      !isCurrentGeneratedShareImageRequest({
        publicationData: access.publicationData,
        publicSlug: slug,
        requestedVersion,
      })
    ) {
      return {
        status: 404,
        headers: PUBLIC_SHARE_IMAGE_ROBOTS_HEADERS,
        body: "Imagen share no encontrada",
      };
    }

    const content = await params.readPublicShareImageArtifact(slug);
    if (!content) {
      return {
        status: 404,
        headers: PUBLIC_SHARE_IMAGE_ROBOTS_HEADERS,
        body: "Imagen share no encontrada",
      };
    }

    const isCompliant = await (params.isShareImageCompliant ||
      isCompliantPublishedShareImageBuffer)(content);
    if (!isCompliant) {
      params.logger?.warn?.("Imagen share publica no cumple dimensiones requeridas", {
        slug,
      });
      return {
        status: 404,
        headers: PUBLIC_SHARE_IMAGE_ROBOTS_HEADERS,
        body: "Imagen share no encontrada",
      };
    }

    return {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public,max-age=31536000,immutable",
        "X-Robots-Tag": PUBLIC_SHARE_IMAGE_ROBOTS_CONTENT,
      },
      body: content,
    };
  } catch (error) {
    params.logger?.error?.("Error resolviendo imagen share publica por slug", {
      slug,
      error: getErrorMessage(error),
    });
    return {
      status: 500,
      headers: PUBLIC_SHARE_IMAGE_ROBOTS_HEADERS,
      body: "No se pudo cargar la imagen share",
    };
  }
}
