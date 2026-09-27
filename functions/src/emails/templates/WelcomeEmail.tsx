import type { CSSProperties } from "react";
import { Section, Text } from "react-email";
import { EmailButton } from "../components/EmailButton";
import { EmailLayout } from "../components/EmailLayout";
import { welcomeContent } from "../content/welcome";
import { emailBrand, emailTheme } from "../theme";
import type { WelcomeEmailData } from "../types";

const paragraphStyle: CSSProperties = {
  margin: "0 0 16px",
  fontSize: 16,
  lineHeight: "26px",
  overflowWrap: "break-word",
};

export function WelcomeEmail({ name, dashboardUrl }: WelcomeEmailData) {
  return (
    <EmailLayout preview={welcomeContent.preheader}>
      <Text style={paragraphStyle}>
        {welcomeContent.greeting(name)}
      </Text>
      <Text style={paragraphStyle}>
        {welcomeContent.welcome}
      </Text>
      <Text style={paragraphStyle}>
        {welcomeContent.introduction}
      </Text>
      <Text style={paragraphStyle}>
        {welcomeContent.purpose}
      </Text>
      <Text style={paragraphStyle}>
        <strong>{welcomeContent.gettingStarted}</strong>
      </Text>
      <Text style={{ ...paragraphStyle, marginBottom: emailTheme.spacing.large }}>
        {welcomeContent.personalization}
      </Text>
      <Section style={{ marginBottom: emailTheme.spacing.large }}>
        <EmailButton href={dashboardUrl}>{welcomeContent.action}</EmailButton>
      </Section>
      <Text style={paragraphStyle}>
        {welcomeContent.replyInvitation}
      </Text>
      <Text style={paragraphStyle}>
        {welcomeContent.thanks}
      </Text>
      <Text style={paragraphStyle}>
        {welcomeContent.closing} <strong>{welcomeContent.closingEmphasis}</strong>
      </Text>
      <Text style={{ ...paragraphStyle, marginBottom: 0 }}>
        {welcomeContent.signatureName}<br />
        {welcomeContent.signatureRole}
      </Text>
    </EmailLayout>
  );
}

// Synthetic development data only; callers must supply their own dashboardUrl.
WelcomeEmail.PreviewProps = {
  name: "María",
  dashboardUrl: `${emailBrand.siteUrl}/dashboard`,
} satisfies WelcomeEmailData;

export default WelcomeEmail;
