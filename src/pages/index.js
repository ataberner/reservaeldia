// pages/index.js (Next.js + JSX adaptado)

import Head from 'next/head';
import { useState, useEffect, useCallback, useRef } from 'react';
import DashboardHomeStartupLoader from '@/components/dashboard/home/DashboardHomeStartupLoader';
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
import { observeLandingAuth } from "@/lib/auth/landingAuthSession";
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
import {
  LANDING_BRAND_NAME,
  LANDING_CANONICAL_URL,
  LANDING_DESCRIPTION,
  LANDING_HERO_IMAGE_PRELOAD_URL,
  LANDING_SHARE_IMAGE_URL,
  LANDING_STRUCTURED_DATA,
  LANDING_TEMPLATES_ANCHOR,
  LANDING_TITLE,
  serializeLandingStructuredData,
} from "@/domain/seo/landingMetadata";

function getAuthNoticeMessage(code) {
  if (code === "email-not-verified") {
    return "Necesitas verificar tu correo antes de entrar al dashboard. Revisa tu bandeja y spam.";
  }

  if (code === "profile-check-failed") {
    return "No pudimos validar tu perfil. Intenta iniciar sesion nuevamente.";
  }

  return "";
}

export default function Home() {
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  const [isAuthTransitioning, setIsAuthTransitioning] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const navigationStartedRef = useRef(false);
  const mountedRef = useRef(false);
  const router = useRouter();
  const enterDashboard = useCallback(() => {
    if (!mountedRef.current || navigationStartedRef.current) return;
    navigationStartedRef.current = true;
    setIsAuthTransitioning(true);
    setIsGuest(false);
    setAuthNotice("");
    setShowLogin(false);
    setShowRegister(false);
    void router.replace("/dashboard").catch(() => {
      if (!mountedRef.current) return;
      navigationStartedRef.current = false;
      setIsAuthTransitioning(false);
      setAuthNotice("No pudimos abrir tu espacio. Intenta ingresar nuevamente.");
    });
  }, [router]);
  const showGoogleAuthDebugLogo =
    typeof authNotice === "string" && authNotice.includes("[debug:");
  const handleUseLandingTemplate = (template) => {
    const selection = savePendingLandingTemplateSelection(template);
    if (auth.currentUser && selection?.templateId) {
      enterDashboard();
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
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search || "");
    const noticeCode = params.get("authNotice");
    const noticeMessage = getAuthNoticeMessage(noticeCode);
    const emailVerified = params.get("emailVerified");
    const authAction = params.get("auth");

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

    if (authAction === "login" || authAction === "register") {
      clearPendingLandingTemplateSelection();
      setShowLogin(authAction === "login");
      setShowRegister(authAction === "register");
      shouldCleanUrl = true;
    }

    if (!shouldCleanUrl) return;

    params.delete("authNotice");
    params.delete("emailVerified");
    params.delete("auth");
    const cleanQuery = params.toString();
    const cleanUrl = `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", cleanUrl);
  }, []);


  useEffect(() => {
    mountedRef.current = true;
    const expectRedirect = hasGoogleRedirectPending() || isLikelyGoogleReturnNavigation();
    if (expectRedirect) setIsAuthTransitioning(true);
    const unsubscribe = observeLandingAuth({
      auth,
      onAuthStateChanged,
      getRedirectResult,
      expectRedirect,
      onAuthenticated: () => {
        if (expectRedirect) clearGoogleRedirectPending();
        enterDashboard();
      },
      onGuest: () => setIsGuest(true),
      onError: (error) => {
        const debugLabel = formatGoogleAuthDebugContext(getGoogleAuthDebugContext());
        if (expectRedirect) clearGoogleRedirectPending();
        setAuthNotice(expectRedirect
          ? `No pudimos completar el ingreso con Google. Intenta nuevamente. [debug: ${error?.message === "google-redirect-no-user" ? "no-user" : "redirect-exception"}; ${debugLabel}]`
          : "No pudimos comprobar tu sesion. Intenta ingresar nuevamente.");
        setShowLogin(true);
        setIsAuthTransitioning(false);
        setIsGuest(!auth.currentUser);
      },
    });
    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [enterDashboard]);


  return (
    <>
      <Head>
        <title>{LANDING_TITLE}</title>
        <meta name="description" content={LANDING_DESCRIPTION} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={LANDING_CANONICAL_URL} />
        <link rel="preload" as="image" href={LANDING_HERO_IMAGE_PRELOAD_URL} />
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
            __html: serializeLandingStructuredData(LANDING_STRUCTURED_DATA),
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
        <DashboardHomeStartupLoader fullScreen />
      )}

      <div
        hidden={isAuthTransitioning}
        inert={isAuthTransitioning ? true : undefined}
        aria-hidden={isAuthTransitioning ? "true" : undefined}
      >
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
        enabled={isGuest && !isAuthTransitioning}
        onUseTemplate={handleUseLandingTemplate}
      />

      <LandingHowItWorks />

      <LandingPricing />

      <LandingShareSection ctaHref={LANDING_TEMPLATES_ANCHOR} />

      <LandingFooter />

      </main>
      </div>

      {showLogin && !isAuthTransitioning && (
        <LoginModal
          onAuthenticated={enterDashboard}
          onClose={handleCloseAuthModal}
          onAuthNotice={(message) => setAuthNotice(message)}
          onGoToRegister={() => {
            setShowLogin(false);
            setShowRegister(true);
          }}
        />
      )}

      {showRegister && !isAuthTransitioning && (
        <RegisterModal
          onAuthenticated={enterDashboard}
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
