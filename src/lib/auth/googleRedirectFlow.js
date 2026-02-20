const GOOGLE_REDIRECT_PENDING_KEY = "google_auth_redirect_pending";
const GOOGLE_REDIRECT_PENDING_LOCAL_KEY = "google_auth_redirect_pending_local";
const GOOGLE_REDIRECT_PENDING_MAX_AGE_MS = 15 * 60 * 1000;

function isMobileBrowser() {
  if (typeof window === "undefined") return false;

  if (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) {
    return true;
  }

  const userAgent = String(window.navigator?.userAgent || "").toLowerCase();
  return /(android|iphone|ipad|ipod|mobile|silk|kindle|opera mini|iemobile|webos)/i.test(userAgent);
}

function isStandaloneDisplayMode() {
  if (typeof window === "undefined") return false;
  const standaloneNavigator = Boolean(window.navigator?.standalone);
  const standaloneMedia =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return standaloneNavigator || standaloneMedia;
}

export function isInAppBrowser() {
  if (typeof window === "undefined") return false;
  const userAgent = String(window.navigator?.userAgent || "");
  return /(FBAN|FBAV|Instagram|Line|wv\)|WebView)/i.test(userAgent);
}

export function shouldUseGoogleRedirect() {
  if (typeof window === "undefined") return false;
  if (isInAppBrowser()) return true;
  return isMobileBrowser();
}

function toBinaryFlag(value) {
  return value ? "1" : "0";
}

export function getGoogleAuthDebugContext() {
  if (typeof window === "undefined") {
    return {
      mode: "popup",
      mobile: false,
      standalone: false,
      inApp: false,
      pending: false,
      online: true,
    };
  }

  const mobile = isMobileBrowser();
  const standalone = isStandaloneDisplayMode();
  const inApp = isInAppBrowser();
  const pending = hasGoogleRedirectPending();
  const online =
    typeof window.navigator?.onLine === "boolean"
      ? window.navigator.onLine
      : true;

  return {
    mode: shouldUseGoogleRedirect() ? "redirect" : "popup",
    mobile,
    standalone,
    inApp,
    pending,
    online,
  };
}

export function formatGoogleAuthDebugContext(context) {
  if (!context) return "ctx=none";

  return `modo=${context.mode} mobile=${toBinaryFlag(context.mobile)} standalone=${toBinaryFlag(context.standalone)} inApp=${toBinaryFlag(context.inApp)} pending=${toBinaryFlag(context.pending)} online=${toBinaryFlag(context.online)}`;
}

function hasFreshTimestamp(rawValue) {
  if (!rawValue) return false;
  if (rawValue === "1") return true;

  const timestamp = Number(rawValue);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false;

  return Date.now() - timestamp <= GOOGLE_REDIRECT_PENDING_MAX_AGE_MS;
}

export function setGoogleRedirectPending() {
  if (typeof window === "undefined") return;
  const now = String(Date.now());
  try {
    window.sessionStorage.setItem(GOOGLE_REDIRECT_PENDING_KEY, now);
  } catch {
    // noop
  }
  try {
    window.localStorage.setItem(GOOGLE_REDIRECT_PENDING_LOCAL_KEY, now);
  } catch {
    // noop
  }
}

export function hasGoogleRedirectPending() {
  if (typeof window === "undefined") return false;

  try {
    const sessionRaw = window.sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_KEY);
    const localRaw = window.localStorage.getItem(GOOGLE_REDIRECT_PENDING_LOCAL_KEY);
    const pendingSession = hasFreshTimestamp(sessionRaw);
    const pendingLocal = hasFreshTimestamp(localRaw);

    if (!pendingSession && sessionRaw) {
      window.sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
    }
    if (!pendingLocal && localRaw) {
      window.localStorage.removeItem(GOOGLE_REDIRECT_PENDING_LOCAL_KEY);
    }

    return pendingSession || pendingLocal;
  } catch {
    return false;
  }
}

export function clearGoogleRedirectPending() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
  } catch {
    // noop
  }
  try {
    window.localStorage.removeItem(GOOGLE_REDIRECT_PENDING_LOCAL_KEY);
  } catch {
    // noop
  }
}

export function isLikelyGoogleReturnNavigation() {
  if (typeof document === "undefined") return false;
  const referrer = String(document.referrer || "");
  return /accounts\.google\.com|\/__\/auth\/handler|firebaseapp\.com\/__/i.test(referrer);
}
