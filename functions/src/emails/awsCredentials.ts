import { awsSesAccessKeyId, awsSesSecretAccessKey } from "./config";

// Explicit, lazy credentials for the email transport; no default AWS chain or
// reads at module load. A temporary-credentials provider can replace this later.
export async function resolveEmailAwsCredentials() {
  const accessKeyId = awsSesAccessKeyId.value();
  const secretAccessKey = awsSesSecretAccessKey.value();
  if (!accessKeyId || !secretAccessKey) {
    throw Object.assign(new Error("Email secrets unavailable"), {
      name: "EmailSecretsMissing",
    });
  }
  return { accessKeyId, secretAccessKey };
}
