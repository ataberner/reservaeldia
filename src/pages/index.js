// pages/index.js (Next.js + JSX adaptado)

import Head from 'next/head';
import { useState, useEffect } from 'react';
import LoginModal from '@/lib/components/LoginModal';
import RegisterModal from '@/lib/components/RegisterModal';
import AppHeader from '@/components/appHeader/AppHeader';
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

const HERO_CORNER_MARKERS = [
  [
    "top-left",
    `hero-corner hero-corner-top-left ${landingStyles.heroCorner} ${landingStyles.heroCornerTopLeft}`,
  ],
  [
    "top-right",
    `hero-corner hero-corner-top-right ${landingStyles.heroCorner} ${landingStyles.heroCornerTopRight}`,
  ],
  [
    "bottom-left",
    `hero-corner hero-corner-bottom-left ${landingStyles.heroCorner} ${landingStyles.heroCornerBottomLeft}`,
  ],
  [
    "bottom-right",
    `hero-corner hero-corner-bottom-right ${landingStyles.heroCorner} ${landingStyles.heroCornerBottomRight}`,
  ],
];

const FEATURE_DETAIL_CARDS = [
  {
    title: "Control de asistencia",
    description:
      "Llevá el registro de quién va, sus acompañantes, cuántas respuestas faltan en tiempo real.",
    imageSrc: "/assets/img/landing-funcionalidades/control-asistencia.jpg",
    imageAlt: "Detalle de una lista de invitados para organizar asistencias",
  },
  {
    title: "Logística y regalos",
    description:
      "Juntá la información clave: cuenta regresiva, mapas y tus datos bancarios integrados de forma sutil y directa.",
    imageSrc: "/assets/img/landing-funcionalidades/logistica-regalos.jpg",
    imageAlt: "Detalle de datos de logística y regalos para un casamiento",
  },
  {
    title: "Preguntas a medida",
    description:
      "Consultá sobre restricciones alimentarias o agregá preguntas específicas para organizar la logística.",
    imageSrc: "/assets/img/landing-funcionalidades/preguntas-a-medida.jpg",
    imageAlt: "Detalle de preguntas personalizadas para invitados",
  },
  {
    title: "Contá tu historia",
    description:
      "Personalizá la invitación sumando un álbum con las mejores fotos de la pareja.",
    imageSrc: "/assets/img/landing-funcionalidades/conta-tu-historia.jpg",
    imageAlt: "Pareja revisando fotos para contar su historia",
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    title: "Elegí un diseño",
    description:
      "Explorá nuestro catálogo y seleccioná la plantilla que mejor se adapte al estilo de tu casamiento.",
  },
  {
    title: "Personalizá los detalles",
    description:
      "Cargá tu información, sumá fotos y activá solo los módulos que necesites (mapas, regalos, preguntas de asistencia).",
  },
  {
    title: "Enviá",
    description:
      "Enviá la invitación por WhatsApp o correo de forma masiva o personalizada.",
  },
  {
    title: "Gestioná la asistencia",
    description:
      "Monitoreá las confirmaciones y organizá a tus invitados desde tu panel en tiempo real.",
  },
];



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
      <section className={`hero ${landingStyles.hero}`}>
        <div className={`hero-content ${landingStyles.heroContent}`}>
          {HERO_CORNER_MARKERS.map(([key, className]) => (
            <span key={key} className={className} aria-hidden="true" />
          ))}
          <h1 className={landingStyles.heroTitle}>
            Resolvé la{' '}
            <span className="landing-hero-title-gradient">
              invitación de tu
            </span>
            <br />
            <span className="landing-hero-title-gradient">
              casamiento
            </span>{' '}
            hoy
          </h1>
          <p className={landingStyles.heroSubtitle}>
            Tu invitación y la gestión de tus invitados en un solo link.<br />
            Creala y enviala por whatsapp o email en minutos.
          </p>
          <a className={`landing-hero-cta ${landingStyles.heroCta}`} href="#plantillas">
            Elegir diseño
          </a>
        </div>
      </section>


      <section
        className={landingStyles.featureDetails}
        aria-labelledby="landing-feature-details-title"
      >
        <div className={landingStyles.featureDetailsInner}>
          <h2
            id="landing-feature-details-title"
            className={landingStyles.featureDetailsTitle}
          >
            Más que una imagen, una{" "}
            <span className={landingStyles.featureDetailsTitleGradient}>
              herramienta
            </span>{" "}
            para tu casamiento
          </h2>

          <div className={landingStyles.featureDetailsGrid}>
            {FEATURE_DETAIL_CARDS.map((feature) => (
              <article key={feature.title} className={landingStyles.featureCard}>
                <img
                  src={feature.imageSrc}
                  alt={feature.imageAlt}
                  className={landingStyles.featureCardImage}
                  loading="lazy"
                />
                <div className={landingStyles.featureCardCopy}>
                  <h3 className={landingStyles.featureCardTitle}>{feature.title}</h3>
                  <p className={landingStyles.featureCardText}>
                    {feature.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>


      <LandingTemplateShowcase
        tipo="boda"
        onUseTemplate={handleUseLandingTemplate}
      />

      <section
        id="como-funciona"
        className={landingStyles.howItWorksSection}
        aria-label="Cómo funciona"
      >
        <div className={landingStyles.howItWorksInner}>
          <ol className={landingStyles.howItWorksGrid}>
            {HOW_IT_WORKS_STEPS.map((step, index) => (
              <li key={step.title} className={landingStyles.howItWorksStep}>
                <span className={landingStyles.howItWorksMarker} aria-hidden="true">
                  {index + 1}
                </span>
                <h3 className={landingStyles.howItWorksStepTitle}>
                  {step.title}
                </h3>
                <p className={landingStyles.howItWorksStepText}>
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>


      

      <footer className="text-center py-4">
        <p>&copy; 2026 Reserva el Día - Todos los derechos reservados</p>
      </footer>

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
