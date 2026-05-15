import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import styles from "./AppHeader.module.css";

function joinClassNames(...values) {
  return values.filter(Boolean).join(" ");
}

function getActionClassName(action) {
  const tone = action?.tone;
  const actionClassName =
    {
      landingLogin: styles.actionLandingLogin,
      landingCreateInvitation: styles.actionLandingCreateInvitation,
      myInvitations: styles.actionMyInvitations,
    }[action?.variant] || "";
  if (tone === "primary") return joinClassNames(styles.actionPrimary, actionClassName);
  if (tone === "active") return joinClassNames(styles.actionActive, actionClassName);
  if (tone === "danger") return joinClassNames(styles.actionDanger, actionClassName);
  return joinClassNames(styles.actionSecondary, actionClassName);
}

function getDefaultCenterNavItems(isAuthenticated) {
  return [
    {
      key: "templates",
      label: isAuthenticated ? "Plantillas" : "Invitaciones",
      href: isAuthenticated
        ? "/dashboard#dashboard-home-template-collections"
        : "#invitaciones",
    },
    {
      key: "how-it-works",
      label: "Cómo funciona",
      href: isAuthenticated ? "/#como-funciona" : "#como-funciona",
    },
    {
      key: "pricing",
      label: "Precios",
      href: isAuthenticated ? "/#precios" : "#precios",
    },
  ];
}

function AppHeaderAction({ action, onAfterClick }) {
  if (!action || typeof action !== "object") return null;

  const handleClick = (event) => {
    if (action.disabled) return;
    if (typeof action.onClick === "function") {
      action.onClick(event);
    }
    onAfterClick?.();
  };

  return (
    <button
      type="button"
      className={joinClassNames(styles.action, getActionClassName(action))}
      onClick={handleClick}
      disabled={action.disabled}
      title={action.title || action.label}
    >
      {action.icon ? <span className={styles.actionIcon}>{action.icon}</span> : null}
      <span>{action.label}</span>
    </button>
  );
}

export default function AppHeader({
  variant = "landing",
  placement = "embedded",
  logo,
  navItems = [],
  actions = [],
  userMenu = null,
  isAuthenticated = null,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountRef = useRef(null);
  const isLanding = variant === "landing";
  const resolvedIsAuthenticated = isAuthenticated ?? Boolean(userMenu);
  const centerNavItems =
    navItems.length > 0
      ? navItems
      : getDefaultCenterNavItems(resolvedIsAuthenticated);
  const hasMobileDrawer =
    isLanding && (centerNavItems.length > 0 || actions.length > 0);
  const brandHref = logo?.href || "/";
  const brandLabel = "Reserva el Día";

  useEffect(() => {
    if (!accountMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (accountRef.current && !accountRef.current.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [accountMenuOpen]);

  const closeTransientMenus = () => {
    setMobileMenuOpen(false);
    setAccountMenuOpen(false);
  };

  const renderCenterNavItems = (className) => (
    <nav className={className} aria-label="Navegacion principal">
      {centerNavItems.map((item) => (
        <a
          key={item.key || `${item.href}-${item.label}`}
          href={item.href}
          className={styles.centerNavButton}
          onClick={closeTransientMenus}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );

  const renderActions = (className) => (
    <div className={className}>
      {actions.map((action) => (
        <AppHeaderAction
          key={action.key || action.label}
          action={action}
          onAfterClick={closeTransientMenus}
        />
      ))}
    </div>
  );

  return (
    <header
      className={joinClassNames(
        styles.root,
        isLanding ? styles.landing : styles.dashboard,
        placement === "fixed" ? styles.fixed : styles.embedded
      )}
    >
      <div className={styles.inner}>
        <Link
          href={brandHref}
          className={styles.logoLink}
          onClick={closeTransientMenus}
          aria-label={brandLabel}
        >
          <span className={styles.brandText}>Reserva el Día</span>
        </Link>

        {renderCenterNavItems(styles.centerNav)}

        <div className={styles.rightCluster}>
          {!isLanding
            ? renderActions(styles.dashboardActions)
            : renderActions(styles.desktopActions)}

          {userMenu ? (
            <div className={styles.account} ref={accountRef}>
              <button
                type="button"
                className={joinClassNames(
                  styles.accountButton,
                  accountMenuOpen ? styles.accountButtonOpen : ""
                )}
                onClick={() => setAccountMenuOpen((previous) => !previous)}
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                aria-label="Abrir menu de usuario"
              >
                {userMenu.avatarUrl ? (
                  <img
                    src={userMenu.avatarUrl}
                    alt="Foto de perfil"
                    className={styles.avatarImage}
                  />
                ) : (
                  <span className={styles.avatarFallback}>{userMenu.initials || "U"}</span>
                )}
                <ChevronDown
                  className={joinClassNames(
                    styles.accountChevron,
                    accountMenuOpen ? styles.accountChevronOpen : ""
                  )}
                  size={14}
                />
              </button>

              {accountMenuOpen ? (
                <div className={styles.accountMenu} role="menu">
                  <div className={styles.accountSummary}>
                    <p className={styles.accountLabel}>Cuenta</p>
                    <div className={styles.accountIdentity}>
                      {userMenu.avatarUrl ? (
                        <img
                          src={userMenu.avatarUrl}
                          alt="Foto de perfil"
                          className={styles.summaryAvatar}
                        />
                      ) : (
                        <span className={styles.summaryAvatarFallback}>
                          {userMenu.initials || "U"}
                        </span>
                      )}
                      <div className={styles.accountText}>
                        <p className={styles.accountName} title={userMenu.name}>
                          {userMenu.name || "Usuario"}
                        </p>
                        <p className={styles.accountEmail} title={userMenu.email}>
                          {userMenu.email || "Sin email"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className={styles.menuItems}>
                    {(userMenu.items || []).map((item) => (
                      <button
                        key={item.key || item.label}
                        type="button"
                        className={joinClassNames(
                          styles.menuItem,
                          item.tone === "danger" ? styles.menuItemDanger : ""
                        )}
                        onClick={() => {
                          item.onClick?.();
                          closeTransientMenus();
                        }}
                        role="menuitem"
                      >
                        {item.icon ? <span className={styles.menuItemIcon}>{item.icon}</span> : null}
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {hasMobileDrawer ? (
            <button
              type="button"
              className={styles.mobileToggle}
              onClick={() => setMobileMenuOpen((previous) => !previous)}
              aria-label={mobileMenuOpen ? "Cerrar menu" : "Abrir menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          ) : null}
        </div>
      </div>

      {hasMobileDrawer && mobileMenuOpen ? (
        <div className={styles.mobilePanel}>
          {renderCenterNavItems(styles.mobileCenterNav)}
          {renderActions(styles.mobileActions)}
        </div>
      ) : null}
    </header>
  );
}
