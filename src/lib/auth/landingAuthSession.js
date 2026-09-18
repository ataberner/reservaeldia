// Coordinates the initial session and an optional Google return. Firebase remains
// the session authority; this observer only hands navigation to its caller once.
export function observeLandingAuth({
  auth,
  onAuthStateChanged,
  getRedirectResult,
  expectRedirect = false,
  onAuthenticated,
  onGuest,
  onError,
  redirectTimeoutMs = 8000,
}) {
  let active = true;
  let handedOff = false;
  let waitingForRedirect = expectRedirect;
  let retryTimer;

  const acceptUser = (user) => {
    if (!active || handedOff || !user) return false;
    handedOff = true;
    clearTimeout(retryTimer);
    onAuthenticated(user);
    return true;
  };

  const failRedirect = (error) => {
    if (!active || handedOff) return;
    waitingForRedirect = false;
    clearTimeout(retryTimer);
    onError(error);
  };

  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (!active || handedOff) return;
    if (user) acceptUser(user);
    else if (!waitingForRedirect) onGuest();
  }, failRedirect);

  if (!handedOff && !acceptUser(auth.currentUser) && expectRedirect) {
    const resolveRedirect = async (retry = false) => {
      try {
        const result = await getRedirectResult(auth);
        if (!active || handedOff) return;
        if (acceptUser(result?.user || auth.currentUser)) return;
        if (retry) {
          failRedirect(new Error("google-redirect-no-user"));
          return;
        }
        // A return can settle after getRedirectResult. Keep the session observer
        // alive and preserve the existing bounded second attempt for Google.
        retryTimer = setTimeout(() => void resolveRedirect(true), redirectTimeoutMs);
      } catch (error) {
        failRedirect(error);
      }
    };
    void resolveRedirect();
  }

  return () => {
    active = false;
    clearTimeout(retryTimer);
    unsubscribe();
  };
}
