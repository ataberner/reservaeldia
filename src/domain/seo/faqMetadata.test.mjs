import test from "node:test";
import assert from "node:assert/strict";

import { FAQ_ITEMS, FAQ_SECTIONS } from "./faqContent.js";
import {
  FAQ_CANONICAL_URL,
  FAQ_DESCRIPTION,
  FAQ_TITLE,
  buildFaqStructuredData,
  serializeFaqStructuredData,
} from "./faqMetadata.js";

test("FAQ content keeps stable categories, unique ids, and concise complete answers", () => {
  assert.equal(FAQ_SECTIONS.length, 7);
  assert.equal(FAQ_ITEMS.length, 19);

  const ids = new Set(FAQ_ITEMS.map((item) => item.id));
  assert.equal(ids.size, FAQ_ITEMS.length);

  FAQ_ITEMS.forEach((item) => {
    const wordCount = item.answer.trim().split(/\s+/).length;
    assert.match(item.question, /^¿.+\?$/);
    assert.ok(wordCount >= 40, `${item.id} has only ${wordCount} words`);
    assert.ok(wordCount <= 120, `${item.id} has ${wordCount} words`);
  });
});

test("FAQ contact answer keeps the approved email in visible and structured content", () => {
  const contactItem = FAQ_ITEMS.find(
    (item) => item.id === "contactar-equipo-reserva-el-dia"
  );

  assert.equal(contactItem.question, "¿Cómo puedo contactar al equipo de Reserva el Día?");
  assert.equal(contactItem.email, "hola@reservaeldia.com.ar");
  assert.match(contactItem.answer, /hola@reservaeldia\.com\.ar/);

  const structuredData = buildFaqStructuredData();
  const contactEntity = structuredData.mainEntity.find(
    (entity) => entity.name === contactItem.question
  );
  assert.equal(contactEntity.acceptedAnswer.text, contactItem.answer);
});

test("FAQ structured data is generated from the visible question authority", () => {
  const structuredData = buildFaqStructuredData();

  assert.equal(structuredData["@context"], "https://schema.org");
  assert.equal(structuredData["@type"], "FAQPage");
  assert.equal(structuredData.url, FAQ_CANONICAL_URL);
  assert.equal(structuredData.name, FAQ_TITLE);
  assert.equal(structuredData.description, FAQ_DESCRIPTION);
  assert.equal(structuredData.mainEntity.length, FAQ_ITEMS.length);

  structuredData.mainEntity.forEach((entity, index) => {
    assert.equal(entity["@type"], "Question");
    assert.equal(entity.name, FAQ_ITEMS[index].question);
    assert.equal(entity.acceptedAnswer["@type"], "Answer");
    assert.equal(entity.acceptedAnswer.text, FAQ_ITEMS[index].answer);
  });
});

test("FAQ structured data serializes as safe valid JSON-LD", () => {
  const structuredData = buildFaqStructuredData([
    {
      question: "¿Puedo usar <script>?",
      answer: "El contenido se serializa sin cerrar el elemento script.",
    },
  ]);
  const serialized = serializeFaqStructuredData(structuredData);

  assert.doesNotMatch(serialized, /<script>/);
  assert.deepEqual(JSON.parse(serialized), structuredData);
});
