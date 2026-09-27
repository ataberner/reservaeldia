import type { ReactNode } from "react";
import { Body, Container, Head, Html, Preview, Section } from "react-email";
import { emailTheme } from "../theme";
import { EmailCard } from "./EmailCard";
import { EmailFooter } from "./EmailFooter";
import { EmailHeader } from "./EmailHeader";

export function EmailLayout({ preview, children, footer }: {
  preview: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Html lang="es">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Preview>{preview}</Preview>
      <Body lang="es" style={{
        margin: 0,
        padding: 0,
        backgroundColor: emailTheme.background,
        color: emailTheme.text,
        fontFamily: emailTheme.fontFamily,
      }}>
        {/* Fixed outer table prevents the 600px fallback from widening mobile
            viewports; maxWidth shrinks the inner table in fluid clients. */}
        <Section style={{ padding: "32px 16px", tableLayout: "fixed" }}>
          <Container width={emailTheme.maxWidth} style={{ width: emailTheme.maxWidth, maxWidth: "100%" }}>
            <EmailHeader />
            <EmailCard>{children}</EmailCard>
            <EmailFooter>{footer}</EmailFooter>
          </Container>
        </Section>
      </Body>
    </Html>
  );
}
