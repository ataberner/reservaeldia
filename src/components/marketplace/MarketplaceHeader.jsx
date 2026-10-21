import { useRouter } from "next/router";
import AppHeader from "@/components/appHeader/AppHeader";

const NAVIGATION = [
  { key: "professionals", label: "Profesionales", href: "/profesionales/" },
  { key: "venues", label: "Lugares", href: "/lugares/" },
  { key: "invitations", label: "Invitaciones digitales", href: "/dashboard/" },
];

// The route supplies its already-authorized user. This adapter only presents
// the existing dashboard header; it owns no session, permissions or data reads.
export default function MarketplaceHeader({ user, current }) {
  const router = useRouter();
  const email = String(user?.email || "").trim();
  const name = String(user?.displayName || "").trim() || email.split("@")[0] || "Usuario";

  return (
    <div className="relative z-50 bg-white py-2">
      <AppHeader
        variant="dashboard"
        placement="embedded"
        logo={{ href: "/dashboard/" }}
        isAuthenticated
        navItems={NAVIGATION.map((item) => ({ ...item, current: item.key === current }))}
        actions={[
          {
            key: "my-invitations",
            label: "Mis invitaciones",
            variant: "myInvitations",
            tone: "secondary",
            onClick: () => router.push("/dashboard/"),
          },
        ]}
        userMenu={{
          name,
          email,
          initials: name.charAt(0).toUpperCase(),
          avatarUrl: user?.photoURL || "",
          items: [
            { key: "dashboard", label: "Mis invitaciones", href: "/dashboard/" },
          ],
        }}
      />
    </div>
  );
}
