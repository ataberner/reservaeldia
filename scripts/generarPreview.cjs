// Retired legacy operator command. Its unauthenticated draft reader and public
// download-token upload cannot preserve the current private-preview boundary.
// Fail before importing SDKs, resolving ADC, launching a browser or doing I/O.
process.stderr.write(
  "Este comando legacy fue retirado: las vistas previas de borradores son privadas. " +
  "Usá la vista previa del dashboard/editor actual. No se generó ni publicó ningún archivo.\n"
);
process.exitCode = 1;
