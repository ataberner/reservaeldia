import { Button } from "react-email";
import { emailTheme } from "../theme";

export function EmailButton({ href, children }: { href: string; children: string }) {
  return (
    <Button href={href} style={{
      backgroundColor: emailTheme.brand,
      color: emailTheme.surface,
      fontFamily: emailTheme.fontFamily,
      fontSize: 16,
      fontWeight: 700,
      lineHeight: "24px",
      padding: "14px 24px",
      textAlign: "center",
      textDecoration: "none",
    }}>
      {children}
    </Button>
  );
}
