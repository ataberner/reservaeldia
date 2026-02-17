import { HttpsError, CallableRequest } from "firebase-functions/v2/https";


/**
 * ================================
 * Configuración de SUPERADMINS
 * ================================
 *
 * Variable de entorno esperada:
 * SUPERADMINS_UIDS="uid1,uid2,uid3"
 *
 * Ejemplo:
 * firebase functions:config:set superadmins.uids="AAA,BBB,CCC"
 * o usando process.env en producción.
 */
function parseUidList(raw: unknown): string[] {
    if (typeof raw !== "string") return [];

    return raw
        .split(",")
        .map((uid) => uid.trim())
        .filter(Boolean);
}

function getSuperAdminsFromCloudRuntimeConfig(): string[] {
    const rawConfig = process.env.CLOUD_RUNTIME_CONFIG;
    if (!rawConfig) return [];

    try {
        const parsed = JSON.parse(rawConfig) as any;
        return parseUidList(parsed?.superadmins?.uids);
    } catch {
        return [];
    }
}

export function getSuperAdminUids(): string[] {
    const fromEnv = parseUidList(process.env.SUPERADMINS_UIDS);
    const fromRuntimeConfig = getSuperAdminsFromCloudRuntimeConfig();

    return Array.from(new Set([...fromEnv, ...fromRuntimeConfig]));
}

/**
 * ================================
 * Helpers de autenticación
 * ================================
 */

export function requireAuth(request: CallableRequest<any>): string {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new HttpsError(
            "unauthenticated",
            "Usuario no autenticado"
        );
    }
    return uid;
}

/**
 * ================================
 * Superadmin (nivel máximo)
 * ================================
 */

export function isSuperAdmin(uid: string): boolean {
    const SUPERADMINS = getSuperAdminUids();
    return SUPERADMINS.includes(uid);
}


export function requireSuperAdmin(request: CallableRequest<any>): string {
    const uid = requireAuth(request);

    if (!isSuperAdmin(uid)) {
        throw new HttpsError(
            "permission-denied",
            "Solo superadmins pueden realizar esta acción"
        );
    }

    return uid;
}

/**
 * ================================
 * Admin (rol / claim)
 * ================================
 *
 * Modelo híbrido:
 * - superadmin siempre es admin
 * - admin puede venir por custom claim
 */
export function isAdmin(request: CallableRequest<any>): boolean {
    const token: any = request.auth?.token || {};
    const uid = request.auth?.uid;

    if (!uid) return false;

    // Superadmin implícitamente es admin
    if (isSuperAdmin(uid)) return true;

    // Claims explícitos
    if (token.admin === true) return true;
    // (Opcional) soporte por rol string, por si querés usarlo a futuro:
    // if (token.role === "admin") return true;

    return false;
}

export function requireAdmin(request: CallableRequest<any>): string {
    const uid = requireAuth(request);

    if (!isAdmin(request)) {
        throw new HttpsError(
            "permission-denied",
            "No tenés permisos de administrador"
        );
    }

    return uid;
}
