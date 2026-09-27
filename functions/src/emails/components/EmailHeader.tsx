import { Section, Text } from "react-email";
import { emailBrand, emailTheme } from "../theme";

export function EmailHeader() {
  return (
    <Section style={{ paddingBottom: emailTheme.spacing.large }}>
      {/* Temporary wordmark: no remote image or web-font dependency. Replace
          after the public PNG is verified; see the email runbook. */}
      <Text style={{
        margin: 0,
        color: emailTheme.brand,
        fontFamily: emailTheme.fontFamily,
        fontSize: 22,
        lineHeight: "30px",
        fontWeight: 700,
      }}>
        {emailBrand.name}
      </Text>
    </Section>
  );
}
