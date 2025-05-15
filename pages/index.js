// pages/index.js (Next.js + JSX adaptado)

import Head from 'next/head';
import { useState } from 'react';
import LoginModal from '@/components/LoginModal';
import RegisterModal from '@/components/RegisterModal'; 
import Link from 'next/link';





export default function Home() {
  const [showLogin, setShowLogin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showRegister, setShowRegister] = useState(false);



  return (
    <>
      <Head>
        <title>Invitaciones Digitales para Bodas | Reserva el Día</title>
        <meta name="description" content="Crea y personaliza invitaciones digitales para bodas de manera fácil y rápida. ¡Diseños únicos y elegantes para tu casamiento!" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <header className="navbar navbar-expand-lg navbar-light bg-light fixed-top py-3">
        <div className="container">
          <Link href="/">
            <a className="navbar-brand"><img src="/assets/img/logo.png" alt="Reserva el Día - Invitaciones Digitales" width="200" /></a>
          </Link>
          <button className="navbar-toggler" type="button" onClick={() => setMenuOpen(!menuOpen)}  aria-label="Toggle navigation">

            <span className="navbar-toggler-icon"></span>
          </button>
          
          <div className={`navbar-collapse ${menuOpen ? 'show' : ''}`} id="navbarNav">

            <ul className="navbar-nav ms-auto me-0">
              <li className="nav-item"><Link href="#hero" onClick={() => setMenuOpen(false)}><a className="nav-link" >Inicio</a></Link></li>
              <li className="nav-item"><Link href="#funcionalidades" onClick={() => setMenuOpen(false)}><a className="nav-link" >Funcionalidades</a></Link></li>
              <li className="nav-item"><Link href="#como-funciona" onClick={() => setMenuOpen(false)}><a className="nav-link" >Cómo Funciona</a></Link></li>
              <li className="nav-item"><Link href="#precios" onClick={() => setMenuOpen(false)}><a className="nav-link" >Precios</a></Link></li>
            </ul>
          </div>
          <div className="d-flex gap-2 ms-lg-3 mt-3 mt-lg-0">
          <button className="btn btn-iniciar-sesion" onClick={() => setShowLogin(true)}>
            Iniciar sesión
          </button>
          <button href="/registrarse" className="btn btn-registrarme"onClick={() => setShowRegister(true)}
  style={{ cursor: 'pointer' }}>Registrarme
          </button>
        </div>

        </div>
      </header>

      {/* Hero principal */}
      <section className="hero" style={{ backgroundImage: "url(/assets/img/portada1.webp)", backgroundSize: 'cover', height: '100vh', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div className="hero-content">
          <h1>Invitaciones Digitales para Bodas</h1>
          <h3>Tu boda comienza con la invitación perfecta.</h3>
          <p>Crea invitaciones digitales únicas y personalizadas en segundos.<br />Envía tu enlace y comparte la emoción con tus seres queridos.<br />¡Conocé nuestros modelos ahora!</p>
          <Link href="#invitaciones"><a className="btn btn-primary">Ver Invitaciones</a></Link>
        </div>
      </section>


<section id="invitaciones" className="container-fluid py-4">
        <h2 className="text-center">Diseños de invitaciones digitales</h2>
        <div className="container">
            <div className="row align-items-center">
                {/* Imagen más ancha a la izquierda*/}
                <div className="col-12 col-md-6 text-center">
                    <img src="assets/img/Invitación modelo pc + iphone.png" alt="Ejemplo de invitación digital en computadora y teléfono móvil" className="img-fluid w-100" loading="lazy"/>
                </div>
                {/*Contenedor de los dos ítems alineados a la derecha*/}
                <div className="col-12 col-md-6 d-flex justify-content-center">
                    <div className="d-flex gap-4">
                        {/* Item 2*/}
                        <div classna="text-center">
                            <Link href="invitaciones/Clasica/index.html">
                                <a><img src="assets/img/celu2.png" alt="Ejemplo de invitación digital clásica" className="img-fluid" loading="lazy"/>
                                <p>Clásica</p></a>
                            </Link>
                        </div>
                        {/* Item 3 */}
                        <div className="text-center">
                            <Link href="invitaciones/foto-premium/index.html">
                                <a><img src="assets/img/celu3.png" alt="Ejemplo de invitación digital premium" className="img-fluid" loading="lazy"/>
                                <p>Premium</p></a>
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
      <h3>1. Elige tu Diseño</h3>
      <p>Selecciona una de nuestras invitaciones digitales personalizadas según el estilo de tu evento.</p>
    </div>
    <div className="step">
      <div className="icon">🖌️</div>
      <h3>2. Personaliza tu Estilo</h3>
      <p>Modifica la paleta de colores, cambia las fotos y ajusta el texto a tu gusto.</p>
    </div>
    <div className="step">
      <div className="icon">⚙️</div>
      <h3>3. Selecciona Funcionalidades</h3>
      <p>Elige qué funciones deseas incluir, como RSVP, mapa de ubicación o lista de regalos.</p>
    </div>
    <div className="step">
      <div className="icon">📩</div>
      <h3>4. Envía y Comparte</h3>
      <p>Comparte tu invitación con amigos y familiares a través de WhatsApp, correo o redes sociales.</p>
    </div>
  </div>
</section>

<section id="precios" className="pricing">
  <h2>Nuestros Planes</h2>
  <div className="pricing-container">
    {/* Plan Estándar */}
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
      <Link
        href="https://wa.me/5491153119126?text=¡¡Hola!!Estoy%20interesado%20en%20la%20*invitaci%C3%B3n%20cl%C3%A1sica*%20para%20un%20casamiento..."
        target="_blank"
        rel="noopener noreferrer"
      >
        <a><button>Elegir Plan</button></a>
      </Link>
    </div>

    {/* Plan Premium */}
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
      <Link
        href="https://wa.me/5491153119126?text=¡¡Hola!!Estoy%20interesado%20en%20la%20*invitaci%C3%B3n%20premium*%20para%20un%20casamiento..."
        target="_blank"
        rel="noopener noreferrer"
      >
        <a><button>Elegir Plan</button></a>
      </Link>
    </div>
  </div>
</section>


<section id="crear-invitacion" className="py-5 bg-light">
  <div className="container text-center">
    <h2>Creá tu invitación ahora</h2>
    <p>Completá los datos y generá tu invitación antes de pagar</p>
    <Link href="/crear.html">
      <a className="btn btn-success btn-lg mt-3">Comenzar</a>
    </Link>
  </div>
</section>


      <footer className="text-center py-4">
        <p>&copy; 2025 Reserva el Día - Todos los derechos reservados</p>
      </footer>

    {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    {showRegister && <RegisterModal onClose={() => setShowRegister(false)} />}


    </>
  );
}
