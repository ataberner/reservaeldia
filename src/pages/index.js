// pages/index.js (Next.js + JSX adaptado)

import Head from 'next/head';
import { useState, useEffect } from 'react';
import LoginModal from '@/lib/components/LoginModal';
import RegisterModal from '@/lib/components/RegisterModal';
import Link from 'next/link';
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



export default function Home() {
  const [showLogin, setShowLogin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  const [isAuthTransitioning, setIsAuthTransitioning] = useState(false);
  const router = useRouter();
  const showGoogleAuthDebugLogo =
    typeof authNotice === "string" && authNotice.includes("[debug:");

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
      
      <header className="navbar navbar-expand-lg navbar-light bg-light fixed-top py-3">
        <div className="container">
          <Link href="/" className="navbar-brand">
            <img src="/assets/img/logo.png" alt="Reserva el Día - Invitaciones Digitales" width="200" />
          </Link>

          <button
            className="navbar-toggler"
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon"></span>
          </button>

          <div className={`navbar-collapse ${menuOpen ? "show" : ""}`} id="navbarNav">
            <ul className="navbar-nav ms-auto me-0">
              <li className="nav-item">
                <a href="#hero" className="nav-link" onClick={() => setMenuOpen(false)}>
                  Inicio
                </a>
              </li>
              <li className="nav-item">
                <a
                  href="#funcionalidades"
                  className="nav-link"
                  onClick={() => setMenuOpen(false)}
                >
                  Funcionalidades
                </a>
              </li>
              <li className="nav-item">
                <a
                  href="#como-funciona"
                  className="nav-link"
                  onClick={() => setMenuOpen(false)}
                >
                  Cómo Funciona
                </a>
              </li>
              <li className="nav-item">
                <a href="#precios" className="nav-link" onClick={() => setMenuOpen(false)}>
                  Precios
                </a>
              </li>
            </ul>

            <div className="d-flex gap-2 ms-lg-3 mt-3 mt-lg-0 justify-content-center">
              <button
                className="btn btn-iniciar-sesion"
                onClick={() => {
                  setShowLogin(true);
                  setMenuOpen(false);
                }}
              >
                Iniciar sesión
              </button>
              <button
                className="btn btn-registrarme"
                onClick={() => {
                  setShowRegister(true);
                  setMenuOpen(false);
                }}
              >
                Registrarme
              </button>
            </div>
          </div>
        </div>
      </header>

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
      <section className="hero" style={{ backgroundImage: "url(/assets/img/portada1.webp)", backgroundSize: 'cover', height: '100vh', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div className="hero-content">
          <h1>Invitaciones Digitales para Bodas</h1>
          <p>Tu invitación perfecta, diseñada a tu manera. En minutos.</p>
          <p>Creá una invitación digital única para tu evento.<br />Elegí una plantilla, personalizala visualmente y compartila con un solo click.<br />¡Conocé nuestros modelos ahora!</p>
          <button onClick={() => {
            setShowRegister(true);
            setMenuOpen(false);
          }}
            className="btn btn-primary">
            Crear mi invitación
          </button>
        </div>
      </section>


      <section id="invitaciones" className="container-fluid py-4">
        <h2 className="text-center">Diseños de invitaciones digitales</h2>
        <div className="container">
          <div className="row align-items-center">
            {/* Imagen más ancha a la izquierda*/}
            <div className="col-12 col-md-6 text-center">
              <img src="assets/img/Invitación modelo pc + iphone.png" alt="Ejemplo de invitación digital en computadora y teléfono móvil" className="img-fluid w-100" loading="lazy" />
            </div>
            {/*Contenedor de los dos ítems alineados a la derecha*/}
            <div className="col-12 col-md-6 d-flex justify-content-center">
              <div className="d-flex gap-4">
                {/* Item 2*/}
                <div className="text-center">
                  <Link href="#">
                    <img src="/assets/img/celu2.png" alt="Ejemplo de invitación digital clásica" className="img-fluid" loading="lazy" />

                  </Link>
                </div>
                {/* Item 3 */}
                <div className="text-center">
                  <Link href="#">
                    <img src="/assets/img/celu3.png" alt="Ejemplo de invitación digital premium" className="img-fluid" loading="lazy" />

                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>


      <section id="funcionalidades" className="funcionalidades">
        <h2>Funcionalidades de las Invitaciones Digitales</h2>
        <div className="container">
          <div className="row d-flex flex-wrap justify-content-center">
            {/* Item 1 */}
            <div className="col-6 col-md-3 mb-3">
              <div className="funcionalidad">
                <img src="/assets/img/iconos/rsvp-negro.png" alt="RSVP" loading="lazy" />
                <h5>RSVP</h5>
                <p>Tus invitados confirman con un clic.</p>
              </div>
            </div>

            {/* Item 2 */}
            <div className="col-6 col-md-3 mb-4">
              <div className="funcionalidad">
                <img src="/assets/img/iconos/ubicacion-negro.png" alt="Ubicación con mapa" loading="lazy" />
                <h5>Ubicación con mapa</h5>
                <p>Enlace directo a Google Maps.</p>
              </div>
            </div>

            {/* Item 3 */}
            <div className="col-6 col-md-3 mb-4">
              <div className="funcionalidad">
                <img src="/assets/img/iconos/dresscode-negro.png" alt="Código de vestimenta" loading="lazy" />
                <h5>Código de vestimenta</h5>
                <p>Indica el dress code del evento.</p>
              </div>
            </div>

            {/* Item 4 */}
            <div className="col-6 col-md-3 mb-4">
              <div className="funcionalidad">
                <img src="/assets/img/iconos/regalo-negro.png" alt="Lista de regalos" loading="lazy" />
                <h5>Lista de regalos</h5>
                <p>Comparte tu mesa de regalos.</p>
              </div>
            </div>

            {/* Item 5 */}
            <div className="col-6 col-md-3 mb-4">
              <div className="funcionalidad">
                <img src="/assets/img/iconos/menu-negro.png" alt="Selección de menú" loading="lazy" />
                <h5>Selección de menú</h5>
                <p>Tus invitados eligen su comida.</p>
              </div>
            </div>

            {/* Item 6 */}
            <div className="col-6 col-md-3 mb-4">
              <div className="funcionalidad">
                <img src="/assets/img/iconos/countdown-negro.png" alt="Cuenta regresiva" loading="lazy" />
                <h5>Cuenta regresiva</h5>
                <p>Días y horas hasta el evento.</p>
              </div>
            </div>

            {/* Item 7 */}
            <div className="col-6 col-md-3 mb-4">
              <div className="funcionalidad">
                <img src="/assets/img/iconos/redes-negro.png" alt="Integración con redes sociales" loading="lazy" />
                <h5>Redes sociales</h5>
                <p>Comparte tu invitación fácilmente.</p>
              </div>
            </div>

            {/* Item 8 */}
            <div className="col-6 col-md-3 mb-4">
              <div className="funcionalidad">
                <img src="/assets/img/iconos/fotos-negro.png" alt="Álbum de fotos" loading="lazy" />
                <h5>Álbum de fotos</h5>
                <p>Sube y comparte imágenes del evento.</p>
              </div>
            </div>
          </div>
        </div>
      </section>



      <section id="como-funciona" className="how-it-works">
        <h2>¿Cómo Funciona?</h2>
        <div className="steps-container">
          <div className="step">
            <div className="icon">🎨</div>
            <h3>1. Elegís una plantilla</h3>
            <p>Seleccioná un diseño base según tu evento (boda, cumpleaños, bautismo, etc.).</p>
          </div>
          <div className="step">
            <div className="icon">🖌️</div>
            <h3>2. La personalizás visualmente</h3>
            <p>Editá textos, colores, imágenes y todo el diseño.</p>
          </div>
          <div className="step">
            <div className="icon">⚙️</div>
            <h3>3. Selecciona Funcionalidades</h3>
            <p>Agregá la opcion para tus invitacods confirmen, vean la ubicación del evento o la lista de regalos.</p>
          </div>
          <div className="step">
            <div className="icon">📩</div>
            <h3>4. Envía y Comparte</h3>
            <p>Comparte tu invitación con amigos y familiares a través de WhatsApp, correo o redes sociales.</p>
          </div>
        </div>
      </section>

      {/*      <section id="precios" className="pricing">
        <h2>Nuestros Planes</h2>
        <div className="pricing-container">
          {/* Plan Estándar 
          <div className="pricing-card">
            <h3>Plan Estándar</h3>
            <p className="price">$24,900</p>
            <ul>
              <li>✅ Invitación digital ilimitada</li>
              <li>✅ Personalización de colores</li>
              <li>✅ Selección de funcionalidades</li>
              <li>✅ Galería de hasta 8 fotos</li>
              <li className="not-included">❌ Foto de portada</li>
              <li className="not-included">❌ RSVP</li>
              <li className="not-included">❌ Playlist para el evento</li>
              <li className="not-included">❌ Selección de menú</li>
            </ul>
            <a
              href="https://wa.me/5491153119126?text=¡¡Hola!!Estoy%20interesado%20en%20la%20*invitaci%C3%B3n%20cl%C3%A1sica*%20para%20un%20casamiento..."
              target="_blank"
              rel="noopener noreferrer">
              <button>Elegir Plan</button>
            </a>
          </div>

          {/* Plan Premium 
          <div className="pricing-card premium">
            <h3>Plan Premium</h3>
            <p className="price">$29,900</p>
            <ul>
              <li>✅ Invitación digital ilimitada</li>
              <li>✅ Personalización de colores</li>
              <li>✅ Selección de funcionalidades</li>
              <li>✅ Galería de hasta 8 fotos</li>
              <li className="highlight">📷 Foto de portada</li>
              <li className="highlight">✨ RSVP</li>
              <li className="highlight">🎵 Playlist para el evento</li>
              <li className="highlight">🍽️ Selección de menú</li>
            </ul>
            <a
              href="https://wa.me/5491153119126?text=¡¡Hola!!Estoy%20interesado%20en%20la%20*invitaci%C3%B3n%20premium*%20para%20un%20casamiento..."
              target="_blank"
              rel="noopener noreferrer">

              <button>Elegir Plan</button>
            </a>
          </div>
        </div>
      </section>*/}


      <section id="crear-invitacion" className="py-5 bg-light">
        <div className="container text-center">
          <h2>Creá tu invitación ahora</h2>

          <button
            className="btn btn-primary"
            onClick={() => {
              setShowRegister(true);
              setMenuOpen(false);
            }}
          >
            Registrarme
          </button>
        </div>
      </section>


      <footer className="text-center py-4">
        <p>&copy; 2025 Reserva el Día - Todos los derechos reservados</p>
      </footer>

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

