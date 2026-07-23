import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(
  new URL("./preguntas-frecuentes.js", import.meta.url),
  "utf8"
);
const pageStyles = readFileSync(
  new URL("./preguntas-frecuentes.module.css", import.meta.url),
  "utf8"
);

test("FAQ page exposes one semantic heading hierarchy and accessible accordion controls", () => {
  assert.match(pageSource, /<h1[^>]*id="faq-page-title"/);
  assert.match(pageSource, /<h2[\s\S]*faq-section-/);
  assert.match(pageSource, /<h3 className=\{styles\.questionHeading\}>/);
  assert.match(pageSource, /aria-expanded=\{isOpen\}/);
  assert.match(pageSource, /aria-controls=\{answerId\}/);
  assert.match(pageSource, /role="region"/);
  assert.match(pageSource, /aria-labelledby=\{questionId\}/);
  assert.match(pageSource, /aria-hidden=\{!isOpen\}/);
});

test("FAQ page publishes canonical metadata and visible-content JSON-LD", () => {
  assert.match(pageSource, /<meta name="robots" content="index, follow" \/>/);
  assert.match(pageSource, /<link rel="canonical" href=\{FAQ_CANONICAL_URL\} \/>/);
  assert.match(pageSource, /serializeFaqStructuredData\(FAQ_STRUCTURED_DATA\)/);
  assert.match(pageSource, /\{FAQ_SECTIONS\.map\(/);
});

test("FAQ accordion animates without overriding reduced-motion preferences", () => {
  assert.match(
    pageStyles,
    /\.answerGrid\s*\{[\s\S]*grid-template-rows: 0fr;[\s\S]*transition: grid-template-rows 260ms ease;/
  );
  assert.match(
    pageStyles,
    /\.answerGridOpen\s*\{\s*grid-template-rows: 1fr;/
  );
  assert.match(
    pageStyles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.answerGrid[\s\S]*transition: none;/
  );
});

test("FAQ contact deep link opens its accordion item and exposes a mailto action", () => {
  assert.match(pageSource, /id=\{item\.id\}/);
  assert.match(pageSource, /href=\{`mailto:\$\{item\.email\}`\}/);
  assert.match(
    pageSource,
    /window\.location\.hash\.slice\(1\)[\s\S]*FAQ_ITEMS\.some[\s\S]*nextItems\.add\(targetId\)/
  );
  assert.match(pageSource, /window\.addEventListener\("hashchange", openHashTarget\)/);
  assert.match(pageSource, /window\.removeEventListener\("hashchange", openHashTarget\)/);
  assert.match(
    pageSource,
    /"\(prefers-reduced-motion: reduce\)"[\s\S]*behavior: reduceMotion \? "auto" : "smooth"/
  );
  assert.match(
    pageSource,
    /Contacto",[\s\S]*href: "\/preguntas-frecuentes\/#contactar-equipo-reserva-el-dia"/
  );
  assert.doesNotMatch(
    pageStyles,
    /\.main\s*\{[^}]*overflow:\s*hidden;/,
    "the page root must not trap fragment scrolling"
  );
});
