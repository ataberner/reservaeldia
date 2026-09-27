import { render, toPlainText } from "react-email";
import { createElement } from "react";
import { emailTemplates, isEmailTemplateRequest } from "./templateRegistry";
import type { EmailTemplateDefinition } from "./templateRegistry";
import type { EmailTemplateRequest, RenderedEmail } from "./types";

async function renderTemplate<Data extends object>(
  definition: EmailTemplateDefinition<Data>, data: Data
): Promise<RenderedEmail> {
  const html = await render(createElement(definition.component, data));
  return { subject: definition.subject, html, text: toPlainText(html) };
}

function unsupportedTemplate(input: never): never {
  throw new Error(`Unsupported email template: ${input}`);
}

export async function renderEmail(
  input: EmailTemplateRequest
): Promise<RenderedEmail> {
  if (!isEmailTemplateRequest(input)) {
    throw new Error("Invalid email template data");
  }
  switch (input.template) {
    case "test": return renderTemplate(emailTemplates.test, input.data);
    case "welcome": return renderTemplate(emailTemplates.welcome, input.data);
    case "newUserNotification": return renderTemplate(emailTemplates.newUserNotification, input.data);
    default: return unsupportedTemplate(input);
  }
}
