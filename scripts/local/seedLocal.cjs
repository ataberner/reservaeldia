const { ensureAdminApp } = require("../../functions/lib/firebaseAdmin.js");

async function main() {
  const app = ensureAdminApp();
  const uid = "local-developer";
  // Fresh session only. Never overwrite an imported or preexisting identity.
  await app.auth().createUser({ uid, email: "local-developer@example.test", password: "Local-only-4A!", emailVerified: true, displayName: "Persona Sintética" });
  await app.firestore().doc(`usuarios/${uid}`).create({ uid, email: "local-developer@example.test", nombre: "Persona", apellido: "Sintética", nombreCompleto: "Persona Sintética", fechaNacimiento: "1990-01-01", profileComplete: true });
  await app.firestore().doc("borradores/local-demo").create({ userId: uid, nombre: "Invitación local sintética", estado: "activo", objetos: [], secciones: [{ id: "local-section", orden: 0, altoModo: "fijo", altura: 600, fondo: "#ffffff" }], createdAt: new Date(), updatedAt: new Date() });
  console.log("Identidad sintética local: local-developer@example.test / Local-only-4A! (sin claims administrativos)");
  await app.delete();
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
