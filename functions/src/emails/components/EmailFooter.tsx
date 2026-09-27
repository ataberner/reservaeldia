import { Fragment, type ReactNode } from "react";
import { Link, Section, Text } from "react-email";
import { emailBrand, emailTheme } from "../theme";

export type EmailSocialLink = { label: string; href: string };

const defaultSocialLinks: readonly EmailSocialLink[] = [
  { label: "Instagram", href: "https://www.instagram.com/reservaeldia.ok/" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/reserva-el-d%C3%ADa/?viewAsMember=true" },
];

export function EmailFooter({ children, socialLinks = defaultSocialLinks }: {
  children?: ReactNode;
  socialLinks?: readonly EmailSocialLink[];
}) {
  return (
    <Section style={{ paddingTop: emailTheme.spacing.large, textAlign: "center" }}>
      <Text style={{ margin: "0 0 4px", color: emailTheme.muted, fontSize: 14, lineHeight: "22px" }}>
        {emailBrand.name}
      </Text>
      <Text style={{ margin: "0 0 8px", color: emailTheme.muted, fontSize: 14, lineHeight: "22px" }}>
        Invitaciones digitales para momentos que importan.
      </Text>
      <Link href={emailBrand.siteUrl} style={{ color: emailTheme.brand, fontSize: 14, lineHeight: "22px", textDecoration: "underline" }}>
        {emailBrand.siteLabel}
      </Link>
      {socialLinks.length > 0 && (
        <Text style={{ margin: "12px 0 0", fontSize: 14, lineHeight: "22px" }}>
          {socialLinks.map(({ label, href }, index) => (
            <Fragment key={href}>
              {index > 0 && " · "}
              <Link href={href} style={{ color: emailTheme.brand, textDecoration: "underline" }}>
                {label}
              </Link>
            </Fragment>
          ))}
        </Text>
      )}
      {/* Optional legal/preferences content belongs to the calling template. */}
      {children}
    </Section>
  );
}
