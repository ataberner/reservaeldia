import type { ReactNode } from "react";
import { Section } from "react-email";
import { emailTheme } from "../theme";

export function EmailCard({ children }: { children: ReactNode }) {
  return (
    <Section style={{
      backgroundColor: emailTheme.surface,
      border: `1px solid ${emailTheme.border}`,
      borderTop: `4px solid ${emailTheme.brand}`,
      padding: emailTheme.spacing.large,
    }}>
      {children}
    </Section>
  );
}
