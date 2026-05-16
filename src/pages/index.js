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

export default function Home() {
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  const [isAuthTransitioning, setIsAuthTransitioning] = useState(false);
  const router = useRouter();
  const showGoogleAuthDebugLogo =
    typeof authNotice === "string" && authNotice.includes("[debug:");
  const handleUseLandingTemplate = () => {
    setShowLogin(false);
    setShowRegister(true);
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
        <title>Invitaciones Digitales para Bodas | Reserva el Día</title>
        <meta name="description" content="Crea y personaliza invitaciones digitales para bodas de manera fácil y rápida. ¡Diseños únicos y elegantes para tu casamiento!" />
        <meta name="robots" content="noindex, nofollow" /> {/* BORRAR ESTA LINEA CUANDO QUIERA MEJORAR EL SEO */}
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
            <p>Completando inicio de sesion...</p>
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
            onClick: () => setShowLogin(true),
          },
          {
            key: "create-invitation",
            label: "Crear invitación",
            tone: "primary",
            variant: "landingCreateInvitation",
            onClick: () => setShowRegister(true),
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
          onClose={() => setShowLogin(false)}
          onAuthNotice={(message) => setAuthNotice(message)}
          onGoToRegister={() => {
            setShowLogin(false);
            setShowRegister(true);
          }}
        />
      )}

      {showRegister && (
        <RegisterModal
          onClose={() => setShowRegister(false)}
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
