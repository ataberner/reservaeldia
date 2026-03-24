/* scripts/setAdminClaim.cjs */
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

async function main() {
  const uid = process.argv[2];
  const flag = process.argv[3] === "true";

  if (!uid) {
    console.error("Uso: node scripts/setAdminClaim.cjs <UID> <true|false>");
    process.exit(1);
  }

  await admin.auth().setCustomUserClaims(uid, { admin: flag });
  console.log(`✅ Claim admin=${flag} seteado para UID: ${uid}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
