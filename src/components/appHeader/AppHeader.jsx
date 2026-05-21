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

function getMobileNavLabel(item) {
  if (item?.key === "templates") return "Plantillas";
  return item?.label || "";
}

function getMobileMyInvitationsAction(actions) {
  return actions.find((action) => {
    const key = String(action?.key || "").toLowerCase();
    const variant = String(action?.variant || "").toLowerCase();
    const label = String(action?.label || "").toLowerCase();
    return (
      variant === "myinvitations" ||
      key.includes("my-invitation") ||
      label.includes("mis invitaciones")
    );
  });
}

function getMobileAuthAction(actions, variantName) {
  return actions.find((action) => action?.variant === variantName);
}

function getMobileLogoutItem(userMenu) {
  return (userMenu?.items || []).find((item) => {
    const key = String(item?.key || "").toLowerCase();
    const label = String(item?.label || "").toLowerCase();
    return item?.tone === "danger" || key === "logout" || label.includes("cerrar");
  });
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
        : "#plantillas",
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

function AppHeaderMobileAuthActions({ actions, onAfterClick }) {
  const loginAction = getMobileAuthAction(actions, "landingLogin");
  const createAccountAction = getMobileAuthAction(
    actions,
    "landingCreateInvitation"
  );

  if (!loginAction && !createAccountAction) return null;

  const handleActionClick = (action) => (event) => {
    if (action?.disabled) return;
    action?.onClick?.(event);
    onAfterClick?.();
  };

  return (
    <div className={styles.mobileAuthPanel}>
      <div className={styles.mobileDivider} aria-hidden="true" />

      {loginAction ? (
        <button
          type="button"
          className={styles.mobileAuthSecondaryAction}
          onClick={handleActionClick(loginAction)}
          disabled={loginAction.disabled}
        >
          Iniciar sesion
        </button>
      ) : null}

      {createAccountAction ? (
        <button
          type="button"
          className={styles.mobileAuthPrimaryAction}
          onClick={handleActionClick(createAccountAction)}
          disabled={createAccountAction.disabled}
        >
          Crear cuenta
        </button>
      ) : null}
    </div>
  );
}

function AppHeaderMobileAccount({ actions, userMenu, onAfterClick }) {
  if (!userMenu) return null;

  const myInvitationsAction = getMobileMyInvitationsAction(actions);
  const logoutItem = getMobileLogoutItem(userMenu);

  const handleMyInvitationsClick = (event) => {
    if (myInvitationsAction?.disabled) return;
    if (typeof myInvitationsAction?.onClick === "function") {
      myInvitationsAction.onClick(event);
    }
    onAfterClick?.();
  };

  const handleLogoutClick = () => {
    logoutItem?.onClick?.();
    onAfterClick?.();
  };

  return (
    <div className={styles.mobileAccountPanel}>
      <div className={styles.mobileDivider} aria-hidden="true" />

      <div className={styles.mobileAccountIdentity}>
        <p className={styles.mobileAccountEmail} title={userMenu.email}>
          {userMenu.email || "Sin email"}
        </p>
        {userMenu.avatarUrl ? (
          <img
            src={userMenu.avatarUrl}
            alt="Foto de perfil"
            className={styles.mobileAvatarImage}
          />
        ) : (
          <span className={styles.mobileAvatarFallback}>
            {userMenu.initials || "U"}
          </span>
        )}
      </div>

      {myInvitationsAction ? (
        <button
          type="button"
          className={styles.mobileAccountPrimaryAction}
          onClick={handleMyInvitationsClick}
          disabled={myInvitationsAction.disabled}
        >
          {myInvitationsAction.label || "Mis invitaciones"}
        </button>
      ) : (
        <Link
          href="/dashboard"
          className={styles.mobileAccountPrimaryAction}
          onClick={onAfterClick}
        >
          Mis invitaciones
        </Link>
      )}

      {logoutItem ? (
        <button
          type="button"
          className={styles.mobileLogoutAction}
          onClick={handleLogoutClick}
        >
          {logoutItem.label || "Cerrar sesion"}
        </button>
      ) : null}
    </div>
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
  const mobilePanelRef = useRef(null);
  const mobileToggleRef = useRef(null);
  const isLanding = variant === "landing";
  const resolvedIsAuthenticated = isAuthenticated ?? Boolean(userMenu);
  const centerNavItems =
    navItems.length > 0
      ? navItems
      : getDefaultCenterNavItems(resolvedIsAuthenticated);
  const hasMobileDrawer =
    (isLanding || Boolean(userMenu)) &&
    (centerNavItems.length > 0 || Boolean(userMenu));
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

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (
        mobilePanelRef.current?.contains(target) ||
        mobileToggleRef.current?.contains(target)
      ) {
        return;
      }
      setMobileMenuOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const closeTransientMenus = () => {
    setMobileMenuOpen(false);
    setAccountMenuOpen(false);
  };

  const renderCenterNavItems = (className, { mobile = false } = {}) => (
    <nav className={className} aria-label="Navegacion principal">
      {centerNavItems.map((item) => (
        <a
          key={item.key || `${item.href}-${item.label}`}
          href={item.href}
          className={styles.centerNavButton}
          onClick={closeTransientMenus}
        >
          {mobile ? getMobileNavLabel(item) : item.label}
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
              ref={mobileToggleRef}
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
        <div
          ref={mobilePanelRef}
          className={styles.mobilePanel}
          aria-label="Menu mobile"
        >
          {renderCenterNavItems(styles.mobileCenterNav, { mobile: true })}
          <AppHeaderMobileAccount
            actions={actions}
            userMenu={userMenu}
            onAfterClick={closeTransientMenus}
          />
          {!userMenu ? (
            <AppHeaderMobileAuthActions
              actions={actions}
              onAfterClick={closeTransientMenus}
            />
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
