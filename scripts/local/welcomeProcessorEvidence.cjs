const { stripVTControlCharacters } = require("node:util");

// CLI's captured USER output contains the processor's structured JSON. Ignore
// Auth notices, runtime lifecycle messages and text merely mentioning the event.
function welcomeProcessorEntries(source, uid) {
  const entries = [];
  for (const line of source.split(/\r?\n/)) {
    const match = stripVTControlCharacters(line).match(/^\s*>\s*(\{.*\})\s*$/);
    if (!match) continue;
    let entry;
    try { entry = JSON.parse(match[1]); } catch { continue; }
    if (entry.message === "welcome_registration" && entry.template === "welcome" && entry.userId === uid)
      entries.push(entry);
  }
  return entries;
}

function matchesWelcomeDelivery(entry, delivery) {
  return typeof delivery.sourceEventId === "string" && !!delivery.sourceEventId &&
    typeof delivery.correlationId === "string" && delivery.correlationId.startsWith("welcome-") &&
    entry.sourceEventId === delivery.sourceEventId && entry.correlationId === delivery.correlationId &&
    entry.mode === "disabled" && entry.state === "skipped" && entry.errorCode === "EMAIL_DISABLED" &&
    entry.attempts === 0 && entry.messageId === null;
}

module.exports = { welcomeProcessorEntries, matchesWelcomeDelivery };
