// Music-only pilot access. Identity must come from Firebase Auth, never draft data.
function isMusicPilotUser({ uid, email, emailVerified } = {}) {
  return typeof uid === "string" && uid.trim().length > 0 &&
    emailVerified === true && typeof email === "string" &&
    email.trim().toLowerCase() === "jpeses@gmail.com";
}

module.exports = { isMusicPilotUser };
