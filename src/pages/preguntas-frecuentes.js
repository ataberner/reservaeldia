import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import AppHeader from "@/components/appHeader/AppHeader";
import LandingFooter from "@/components/landing/LandingFooter";
import { FAQ_ITEMS, FAQ_SECTIONS } from "@/domain/seo/faqContent";
import {
  FAQ_CANONICAL_URL,
  FAQ_DESCRIPTION,
  FAQ_SHARE_IMAGE_URL,
  FAQ_STRUCTURED_DATA,
  FAQ_TITLE,
  serializeFaqStructuredData,
} from "@/domain/seo/faqMetadata";
import styles from "./preguntas-frecuentes.module.css";

const FAQ_HEADER_NAV_ITEMS = [
  { key: "templates", label: "Invitaciones", href: "/#plantillas" },
  { key: "how-it-works", label: "Cómo funciona", href: "/#como-funciona" },
  { key: "pricing", label: "Precios", href: "/#precios" },
  {
    key: "faq",
    label: "Preguntas frecuentes",
    href: "/preguntas-frecuentes/",
    current: true,
  },
];

const FAQ_HEADER_ACTIONS = [
  {
    key: "login",
    label: "Ingresar",
    href: "/?auth=login",
    tone: "secondary",
    variant: "landingLogin",
  },
  {
    key: "create-invitation",
    label: "Crear invitación",
    href: "/?auth=register",
    tone: "primary",
    variant: "landingCreateInvitation",
  },
];

const FAQ_FOOTER_NAV_ITEMS = [
  { label: "Inicio", href: "/" },
  { label: "Invitaciones", href: "/#plantillas" },
  { label: "Preguntas Frecuentes", href: "/preguntas-frecuentes/" },
  { label: "Cómo funciona", href: "/#como-funciona" },
  {
    label: "Contacto",
    href: "/preguntas-frecuentes/#contactar-equipo-reserva-el-dia",
  },
];

function FaqAnswer({ item }) {
  if (!item.email || !item.answer.includes(item.email)) {
    return item.answer;
  }

  const [beforeEmail, afterEmail] = item.answer.split(item.email);
  return (
    <>
      {beforeEmail}
      <a className={styles.answerLink} href={`mailto:${item.email}`}>
        {item.email}
      </a>
      {afterEmail}
    </>
  );
}

function FaqAccordionItem({ item, isOpen, onToggle }) {
  const questionId = `faq-question-${item.id}`;
  const answerId = `faq-answer-${item.id}`;

  return (
    <article
      id={item.id}
      className={`${styles.accordionItem} ${
        isOpen ? styles.accordionItemOpen : ""
      }`}
    >
      <h3 className={styles.questionHeading}>
        <button
          id={questionId}
          type="button"
          className={styles.questionButton}
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={answerId}
        >
          <span>{item.question}</span>
          <span className={styles.questionIcon} aria-hidden="true">
            <ChevronDown size={22} strokeWidth={1.8} />
          </span>
        </button>
      </h3>

      <div
        id={answerId}
        className={`${styles.answerGrid} ${
          isOpen ? styles.answerGridOpen : ""
        }`}
        role="region"
        aria-labelledby={questionId}
        aria-hidden={!isOpen}
      >
        <div className={styles.answerClip}>
          <p className={styles.answer}>
            <FaqAnswer item={item} />
          </p>
        </div>
      </div>
    </article>
  );
}

export default function PreguntasFrecuentesPage() {
  const [openItems, setOpenItems] = useState(
    () => new Set([FAQ_SECTIONS[0].questions[0].id])
  );

  useEffect(() => {
    let scrollFrameId = 0;

    const openHashTarget = () => {
      const rawHash = window.location.hash.slice(1);
      if (!rawHash) return;

      let targetId = rawHash;
      try {
        targetId = decodeURIComponent(rawHash);
      } catch {
        return;
      }

      if (!FAQ_ITEMS.some((item) => item.id === targetId)) return;

      setOpenItems((currentItems) => {
        if (currentItems.has(targetId)) return currentItems;
        const nextItems = new Set(currentItems);
        nextItems.add(targetId);
        return nextItems;
      });

      window.cancelAnimationFrame(scrollFrameId);
      scrollFrameId = window.requestAnimationFrame(() => {
        const reduceMotion =
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.getElementById(targetId)?.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "start",
        });
      });
    };

    openHashTarget();
    window.addEventListener("hashchange", openHashTarget);
    return () => {
      window.removeEventListener("hashchange", openHashTarget);
      window.cancelAnimationFrame(scrollFrameId);
    };
  }, []);

  const toggleItem = (itemId) => {
    setOpenItems((currentItems) => {
      const nextItems = new Set(currentItems);
      if (nextItems.has(itemId)) {
        nextItems.delete(itemId);
      } else {
        nextItems.add(itemId);
      }
      return nextItems;
    });
  };

  return (
    <>
      <Head>
        <title>{FAQ_TITLE}</title>
        <meta name="description" content={FAQ_DESCRIPTION} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={FAQ_CANONICAL_URL} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="es_AR" />
        <meta property="og:site_name" content="Reserva el Día" />
        <meta property="og:title" content={FAQ_TITLE} />
        <meta property="og:description" content={FAQ_DESCRIPTION} />
        <meta property="og:url" content={FAQ_CANONICAL_URL} />
        <meta property="og:image" content={FAQ_SHARE_IMAGE_URL} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={FAQ_TITLE} />
        <meta name="twitter:description" content={FAQ_DESCRIPTION} />
        <meta name="twitter:image" content={FAQ_SHARE_IMAGE_URL} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeFaqStructuredData(FAQ_STRUCTURED_DATA),
          }}
        />
      </Head>

      <AppHeader
        variant="landing"
        placement="fixed"
        logo={{ href: "/" }}
        navItems={FAQ_HEADER_NAV_ITEMS}
        actions={FAQ_HEADER_ACTIONS}
      />

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="faq-page-title">
          <div className={styles.heroInner}>
            <p className={styles.eyebrow}>Estamos para ayudarte</p>
            <h1 id="faq-page-title" className={styles.heroTitle}>
              Preguntas frecuentes sobre{" "}
              <span className={styles.heroTitleGradient}>
                invitaciones digitales
              </span>
            </h1>
            <p className={styles.heroDescription}>
              Encontrá respuestas claras sobre cómo crear, personalizar,
              publicar y compartir tu invitación online, gestionar el RSVP y
              organizar la información de tu evento.
            </p>
          </div>
        </section>

        <div className={styles.faqContent}>
          {FAQ_SECTIONS.map((section, sectionIndex) => (
            <section
              key={section.id}
              className={styles.faqSection}
              aria-labelledby={`faq-section-${section.id}`}
            >
              <div className={styles.sectionIntroduction}>
                <p className={styles.sectionNumber} aria-hidden="true">
                  {String(sectionIndex + 1).padStart(2, "0")}
                </p>
                <h2
                  id={`faq-section-${section.id}`}
                  className={styles.sectionTitle}
                >
                  {section.title}
                </h2>
                <p className={styles.sectionDescription}>
                  {section.description}
                </p>
              </div>

              <div className={styles.accordion}>
                {section.questions.map((item) => (
                  <FaqAccordionItem
                    key={item.id}
                    item={item}
                    isOpen={openItems.has(item.id)}
                    onToggle={() => toggleItem(item.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className={styles.ctaSection} aria-labelledby="faq-cta-title">
          <div className={styles.ctaInner}>
            <p className={styles.ctaEyebrow}>Tu evento, en un solo link</p>
            <h2 id="faq-cta-title" className={styles.ctaTitle}>
              Creá una invitación tan única como tu celebración
            </h2>
            <p className={styles.ctaDescription}>
              Elegí una plantilla, personalizala y probá el resultado antes de
              publicar.
            </p>
            <Link href="/#plantillas" className={styles.ctaButton}>
              Ver invitaciones
              <ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <LandingFooter navItems={FAQ_FOOTER_NAV_ITEMS} />
      </main>
    </>
  );
}
