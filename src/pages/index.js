// pages/index.js (Next.js + JSX adaptado)

import Head from 'next/head';
import { useState, useEffect } from 'react';
import LoginModal from '@/lib/components/LoginModal';
import RegisterModal from '@/lib/components/RegisterModal';
import AppHeader from '@/components/appHeader/AppHeader';
import LandingFeatureDetails from '@/components/landing/LandingFeatureDetails';
import LandingFooter from '@/components/landing/LandingFooter';
import LandingHero from '@/components/landing/LandingHero';
import LandingHowItWorks from '@/components/landing/LandingHowItWorks';
import LandingPricing from '@/components/landing/LandingPricing';
import LandingShareSection from '@/components/landing/LandingShareSection';
import LandingTemplateShowcase from '@/components/landing/LandingTemplateShowcase';
import landingStyles from './index.module.css';
import { getRedirectResult, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebase";
import { useRouter } from "next/router";
import {
  clearPendingLandingTemplateSelection,
  savePendingLandingTemplateSelection,
} from "@/domain/templates/pendingLandingTemplateSelection";
import {
  clearGoogleRedirectPending,
  formatGoogleAuthDebugContext,
  getGoogleAuthDebugContext,
  hasGoogleRedirectPending,
  isLikelyGoogleReturnNavigation,
} from "@/lib/auth/googleRedirectFlow";

async function waitForAuthUser(timeoutMs = 3500) {
  if (auth.currentUser) return auth.currentUser;

  if (typeof auth.authStateReady === "function") {
    try {
      await auth.authStateReady();
      if (auth.currentUser) return auth.currentUser;
    } catch {
      // noop
    }
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = (user) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(user || null);
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        finish(user);
      }
    });

    const timer = setTimeout(() => {
      finish(auth.currentUser || null);
    }, timeoutMs);
  });
}

async function resolveRedirectUser({ expectRedirect = false } = {}) {
  const firstResult = await getRedirectResult(auth);
  if (firstResult?.user) return firstResult.user;

  if (auth.currentUser) return auth.currentUser;

  const delayedUser = await waitForAuthUser(expectRedirect ? 8000 : 2000);
  if (delayedUser) return delayedUser;

  if (!expectRedirect) {
    return auth.currentUser || null;
  }

  const secondResult = await getRedirectResult(auth);
  return secondResult?.user || auth.currentUser || null;
}

function getAuthNoticeMessage(code) {
  if (code === "email-not-verified") {
    return "Necesitas verificar tu correo antes de entrar al dashboard. Revisa tu bandeja y spam.";
  }

  if (code === "profile-check-failed") {
    return "No pudimos validar tu perfil. Intenta iniciar sesion nuevamente.";
  }

  return "";
}

const LANDING_TEMPLATES_ANCHOR = "#plantillas";
const LANDING_SITE_URL = "https://reservaeldia.com.ar";
const LANDING_CANONICAL_URL = `${LANDING_SITE_URL}/`;
const LANDING_BRAND_NAME = "Reserva el D\u00eda";
const LANDING_TITLE = "Invitaciones digitales para casamientos | Reserva el D\u00eda";
const LANDING_DESCRIPTION =
  "Cre\u00e1 tu invitaci\u00f3n digital de casamiento, compartila por WhatsApp y gestion\u00e1 confirmaciones, invitados, regalos, mapas y fotos desde un solo link.";
const LANDING_SHARE_IMAGE_URL = `${LANDING_SITE_URL}/assets/img/default-share.jpg`;
const LANDING_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${LANDING_SITE_URL}/#organization`,
      name: LANDING_BRAND_NAME,
      url: LANDING_CANONICAL_URL,
      logo: {
        "@type": "ImageObject",
        url: `${LANDING_SITE_URL}/assets/img/logo-full.png`,
      },
    },
    {
      "@type": "WebSite",
      "@id": `${LANDING_SITE_URL}/#website`,
      name: LANDING_BRAND_NAME,
      url: LANDING_CANONICAL_URL,
      inLanguage: "es-AR",
      publisher: {
        "@id": `${LANDING_SITE_URL}/#organization`,
      },
    },
  ],
};

export default function Home() {
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  const [isAuthTransitioning, setIsAuthTransitioning] = useState(false);
  const router = useRouter();
  const showGoogleAuthDebugLogo =
    typeof authNotice === "string" && authNotice.includes("[debug:");
  const handleUseLandingTemplate = (template) => {
    const selection = savePendingLandingTemplateSelection(template);
    if (auth.currentUser && selection?.templateId) {
      setIsAuthTransitioning(true);
      setShowLogin(false);
      setShowRegister(false);
      router.replace("/dashboard");
      return;
    }

    setShowLogin(false);
    setShowRegister(true);
  };
  const handleOpenGenericLogin = () => {
    clearPendingLandingTemplateSelection();
    setShowRegister(false);
    setShowLogin(true);
  };
  const handleOpenGenericRegister = () => {
    clearPendingLandingTemplateSelection();
    setShowLogin(false);
    setShowRegister(true);
  };
  const handleCloseAuthModal = () => {
    if (!auth.currentUser) {
      clearPendingLandingTemplateSelection();
    }
    setShowLogin(false);
    setShowRegister(false);
  };

  useEffect(() => {
    if (auth.currentUser) {
      setIsAuthTransitioning(true);
      setShowLogin(false);
      setShowRegister(false);
      router.replace("/dashboard");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      setIsAuthTransitioning(true);
      setShowLogin(false);
      setShowRegister(false);
      router.replace("/dashboard");
    });

    return () => {
      unsubscribe();
    };
  }, [router]);


  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search || "");
    const noticeCode = params.get("authNotice");
    const noticeMessage = getAuthNoticeMessage(noticeCode);
    const emailVerified = params.get("emailVerified");

    let shouldCleanUrl = false;

    if (noticeMessage) {
      setAuthNotice(noticeMessage);
      shouldCleanUrl = true;
    }

    if (noticeCode === "email-not-verified" || emailVerified === "1") {
      setShowLogin(true);
    }

    if (emailVerified === "1") {
      setAuthNotice("Correo verificado. Ya puedes iniciar sesion.");
      shouldCleanUrl = true;
    }

    if (!shouldCleanUrl) return;

    params.delete("authNotice");
    params.delete("emailVerified");
    const cleanQuery = params.toString();
    const cleanUrl = `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", cleanUrl);
  }, []);


  useEffect(() => {
    let mounted = true;

    (async () => {
      const hadPendingRedirect = hasGoogleRedirectPending();
      const cameFromGoogleAuth = isLikelyGoogleReturnNavigation();
      const shouldExpectRedirect = hadPendingRedirect || cameFromGoogleAuth;
      if (shouldExpectRedirect) {
        setIsAuthTransitioning(true);
      }
      const redirectDebugContext = getGoogleAuthDebugContext();
      const redirectDebugLabel = formatGoogleAuthDebugContext(
        redirectDebugContext
      );

      try {
        const user = await resolveRedirectUser({
          expectRedirect: shouldExpectRedirect,
        });

        if (user && mounted) {
          setAuthNotice("");
          setShowLogin(false);
          setShowRegister(false);
          setIsAuthTransitioning(true);
          router.replace("/dashboard");
          return;
        }

        if (mounted && shouldExpectRedirect) {
          setAuthNotice(
            `No pudimos completar el ingreso con Google. Intenta nuevamente. [debug: no-user; pending=${hadPendingRedirect ? "1" : "0"}; ref=${cameFromGoogleAuth ? "1" : "0"}; ${redirectDebugLabel}]`
          );
          setShowLogin(true);
          setIsAuthTransitioning(false);
        }
      } catch (err) {
        console.error("Error en redirect Google:", {
          error: err,
          hadPendingRedirect,
          cameFromGoogleAuth,
          ...redirectDebugContext,
        });
        if (mounted && shouldExpectRedirect) {
          setAuthNotice(
            `No pudimos completar el ingreso con Google. Intenta nuevamente. [debug: redirect-exception; pending=${hadPendingRedirect ? "1" : "0"}; ref=${cameFromGoogleAuth ? "1" : "0"}; ${redirectDebugLabel}]`
          );
          setShowLogin(true);
          setIsAuthTransitioning(false);
        }
      } finally {
        if (shouldExpectRedirect) {
          clearGoogleRedirectPending();
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [router]);


  return (
    <>
      <Head>
        <title>{LANDING_TITLE}</title>
        <meta name="description" content={LANDING_DESCRIPTION} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={LANDING_CANONICAL_URL} />
        <link rel="preload" as="image" href="/assets/img/Imagen%20Hero.webp" />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="es_AR" />
        <meta property="og:site_name" content={LANDING_BRAND_NAME} />
        <meta property="og:title" content={LANDING_TITLE} />
        <meta property="og:description" content={LANDING_DESCRIPTION} />
        <meta property="og:url" content={LANDING_CANONICAL_URL} />
        <meta property="og:image" content={LANDING_SHARE_IMAGE_URL} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={LANDING_TITLE} />
        <meta name="twitter:description" content={LANDING_DESCRIPTION} />
        <meta name="twitter:image" content={LANDING_SHARE_IMAGE_URL} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(LANDING_STRUCTURED_DATA),
          }}
        />
        <link rel="preconnect" href="https://accounts.google.com" />
        <link rel="preconnect" href="https://apis.google.com" />
        <link rel="preconnect" href="https://www.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="//accounts.google.com" />
        <link rel="dns-prefetch" href="//apis.google.com" />
        <link rel="dns-prefetch" href="//www.gstatic.com" />
      </Head>

      {isAuthTransitioning && (
        <div className="auth-transition-overlay" role="status" aria-live="polite">
          <div className="auth-transition-card">
            <span className="auth-transition-spinner" aria-hidden="true" />
            <p>Iniciando sesion...</p>
          </div>
        </div>
      )}
      
      <AppHeader
        variant="landing"
        placement="fixed"
        logo={{
          href: "/",
        }}
        actions={[
          {
            key: "login",
            label: "Ingresar",
            tone: "secondary",
            variant: "landingLogin",
            onClick: handleOpenGenericLogin,
          },
          {
            key: "create-invitation",
            label: "Crear invitación",
            tone: "primary",
            variant: "landingCreateInvitation",
            onClick: handleOpenGenericRegister,
          },
        ]}
      />

      <main className={landingStyles.main}>
      {authNotice && (
        <div
          className={`auth-notice-banner ${showGoogleAuthDebugLogo ? "google-auth-failure-banner" : ""}`}
        >
          <span className="auth-notice-text">
            {showGoogleAuthDebugLogo && (
              <img
                src="/assets/img/google-auth-fail-logo.svg"
                alt="Diagnostico Google"
                className="google-auth-failure-logo"
              />
            )}
            <span>{authNotice}</span>
          </span>
          <button
            type="button"
            className="auth-notice-close"
            onClick={() => setAuthNotice("")}
            aria-label="Cerrar aviso"
          >
            x
          </button>
        </div>
      )}

      {/* Hero principal */}
      <LandingHero ctaHref={LANDING_TEMPLATES_ANCHOR} />

      <LandingFeatureDetails />

      <LandingTemplateShowcase
        tipo="boda"
        onUseTemplate={handleUseLandingTemplate}
      />

      <LandingHowItWorks />

      <LandingPricing />

      <LandingShareSection ctaHref={LANDING_TEMPLATES_ANCHOR} />

      <LandingFooter />

      </main>

      {showLogin && (
        <LoginModal
          onClose={handleCloseAuthModal}
          onAuthNotice={(message) => setAuthNotice(message)}
          onGoToRegister={() => {
            setShowLogin(false);
            setShowRegister(true);
          }}
        />
      )}

      {showRegister && (
        <RegisterModal
          onClose={handleCloseAuthModal}
          onAuthNotice={(message) => setAuthNotice(message)}
          onGoToLogin={() => {
            setShowRegister(false);
            setShowLogin(true);
          }}
        />
      )}



    </>
  );
}
