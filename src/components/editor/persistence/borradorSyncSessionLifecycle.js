import { normalizeEditorSession } from "../../../domain/drafts/session.js";

function buildSessionKey(session, slug = "") {
  const normalized = normalizeEditorSession(session, slug);
  return `${normalized.kind}:${normalized.id}`;
}

function matchesToken(left, right) {
  return Boolean(
    left &&
      right &&
      left.sessionKey === right.sessionKey &&
      left.loadRevision === right.loadRevision
  );
}

export function createBorradorSyncSessionLifecycle() {
  let activeSessionKey = "";
  let loadRevision = 0;
  let hydratedToken = null;

  const observeSession = ({ session, slug = "" } = {}) => {
    const sessionKey = buildSessionKey(session, slug);
    if (sessionKey !== activeSessionKey) {
      activeSessionKey = sessionKey;
      loadRevision += 1;
      hydratedToken = null;
    }

    return {
      sessionKey: activeSessionKey,
      loadRevision,
    };
  };

  const beginLoad = ({ session, slug = "" } = {}) => {
    const observed = observeSession({ session, slug });
    loadRevision += 1;
    hydratedToken = null;
    return {
      sessionKey: observed.sessionKey,
      loadRevision,
    };
  };

  const completeLoad = (token) => {
    const currentToken = {
      sessionKey: activeSessionKey,
      loadRevision,
    };
    if (!matchesToken(token, currentToken)) return false;
    hydratedToken = currentToken;
    return true;
  };

  const capturePersistIntent = ({ session, slug = "" } = {}) => {
    const observed = observeSession({ session, slug });
    return {
      sessionKey: observed.sessionKey,
      loadRevision: observed.loadRevision,
    };
  };

  const getPersistBlockReason = (intent, { session, slug = "" } = {}) => {
    const current = observeSession({ session, slug });
    if (!intent || intent.sessionKey !== current.sessionKey) {
      return "session-changed";
    }
    if (intent.loadRevision !== current.loadRevision) {
      return "session-load-changed";
    }
    if (!matchesToken(hydratedToken, current)) {
      return "draft-not-loaded";
    }
    return null;
  };

  return {
    observeSession,
    beginLoad,
    completeLoad,
    capturePersistIntent,
    getPersistBlockReason,
  };
}
