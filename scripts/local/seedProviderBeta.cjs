// Deliberately opt-in through runLocal providers-dev, never a remote seed.
async function main() {
  const { createProviderBetaFixtures } = await import("./providerBetaFixtures.mjs");
  const fixture = await createProviderBetaFixtures();
  console.log("Beta sintética local: local-provider-admin@example.test / Local-provider-only-1!; /admin/proveedores/. Directorio e incorporaciones cerrados.");
  await fixture.app.delete();
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
