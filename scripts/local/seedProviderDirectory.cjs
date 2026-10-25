// Explicit demo-only opt-in; never a remote import, invitation or user seed.
async function main() {
  const { createProviderDirectoryFixtures, venueDraft, photographerDraft } = await import("./providerDirectoryFixtures.mjs");
  const fixture = await createProviderDirectoryFixtures();
  try {
    await fixture.create(venueDraft, { image: true });
    await fixture.create(photographerDraft);
    await fixture.closeClients();
    await fixture.app.delete();
    console.log("Directorio sintético privado: local-provider-admin@example.test / Local-provider-only-1!; /lugares/ y /profesionales/. Directorio público e incorporaciones cerrados.");
  } catch (error) { await fixture.cleanup(); throw error; }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
