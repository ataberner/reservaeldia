const PRINCIPAL_ARN = /^arn:aws:(?:iam::[0-9]{12}:(?:root|(?:user|role)\/[A-Za-z0-9+=,.@_/-]+)|sts::[0-9]{12}:(?:assumed-role|federated-user)\/[A-Za-z0-9+=,.@_/-]+)$/;
const SES_RESOURCE_ARN = /^arn:aws:ses:[a-z]{2}-[a-z]+-[0-9]:[0-9]{12}:identity\/[A-Za-z0-9@._+-]+$/;
const AWS_ERROR_NAMES = new Set([
  "AccessDenied", "AccessDeniedException", "ForbiddenException",
  "UnrecognizedClientException", "InvalidSignatureException", "InvalidClientTokenId",
  "SignatureDoesNotMatch", "ExpiredToken", "ExpiredTokenException",
  "TimeoutError", "AbortError", "EmailSecretsMissing", "EmailExternalEffectBlocked",
]);
const IAM_REASONS = [
  ["with an explicit deny in an identity-based policy", "EXPLICIT_DENY_IDENTITY_POLICY"],
  ["with an explicit deny in a resource-based policy", "EXPLICIT_DENY_RESOURCE_POLICY"],
  ["with an explicit deny in a service control policy", "EXPLICIT_DENY_SCP"],
  ["with an explicit deny in a resource control policy", "EXPLICIT_DENY_RCP"],
  ["with an explicit deny in a permissions boundary", "EXPLICIT_DENY_BOUNDARY"],
  ["with an explicit deny in a session policy", "EXPLICIT_DENY_SESSION_POLICY"],
  ["with an explicit deny in a VPC endpoint policy", "EXPLICIT_DENY_VPC_ENDPOINT"],
  ["because no identity-based policy allows", "NO_ALLOW_IDENTITY_POLICY"],
  ["because no resource-based policy allows", "NO_ALLOW_RESOURCE_POLICY"],
  ["because no service control policy allows", "NO_ALLOW_SCP"],
  ["because no permissions boundary allows", "NO_ALLOW_BOUNDARY"],
  ["because no session policy allows", "NO_ALLOW_SESSION_POLICY"],
  ["because no VPC endpoint policy allows", "NO_ALLOW_VPC_ENDPOINT"],
] as const;

export type SafeAwsError = {
  errorName: string;
  httpStatus: number | null;
  requestId: string | null;
  principalArn: string | null;
  action: "ses:SendEmail" | null;
  resourceArn: string | null;
  iamReason: typeof IAM_REASONS[number][1] | "UNSPECIFIED";
};

// Never stringify an SDK error or read its request/response/headers/cause.
function dataProperty(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

function isAwsPrincipalArn(value: unknown): value is string {
  return typeof value === "string" && value.length <= 2048 &&
    !/[\r\n]/.test(value) && PRINCIPAL_ARN.test(value);
}

export function sanitizeAwsError(error: unknown): SafeAwsError {
  const name = dataProperty(error, "name");
  const metadata = dataProperty(error, "$metadata");
  const status = dataProperty(metadata, "httpStatusCode");
  const requestId = dataProperty(metadata, "requestId");
  const result: SafeAwsError = {
    errorName: typeof name === "string" && AWS_ERROR_NAMES.has(name) ? name : "UnknownAwsError",
    httpStatus: typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    // Keep only UUID request IDs. Unknown formats are deliberately omitted.
    requestId: typeof requestId === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestId) &&
      !/[\r\n]/.test(requestId) ? requestId : null,
    principalArn: null, action: null, resourceArn: null, iamReason: "UNSPECIFIED",
  };
  if (!["AccessDenied", "AccessDeniedException", "ForbiddenException"].includes(result.errorName)) return result;
  const message = dataProperty(error, "message");
  if (typeof message !== "string" || message.length > 8192 || /[\r\n]/.test(message)) return result;

  // Parse a narrow AWS denial grammar. Copy only validated ARN tokens and a
  // literal action; unknown prose (including policy ARNs) is never returned.
  const match = /^User:?[ ]+["'`]?([^\s"'`]+)["'`]?[ ]+is not authorized to perform:?[ ]+["'`]?(ses:SendEmail)["'`]?(?=[ .]|$)(.*)$/.exec(message);
  if (!match || !isAwsPrincipalArn(match[1])) return result;
  result.principalArn = match[1];
  result.action = "ses:SendEmail";
  const resource = /^[ ]+on resource:?[ ]+["'`]?([^\s"'`]+)["'`]?(?=[ .]|$)/.exec(match[3]);
  if (resource && resource[1].length <= 2048 && SES_RESOURCE_ARN.test(resource[1])) result.resourceArn = resource[1];
  for (const [phrase, reason] of IAM_REASONS) {
    if (match[3].includes(phrase)) { result.iamReason = reason; break; }
  }
  return result;
}
