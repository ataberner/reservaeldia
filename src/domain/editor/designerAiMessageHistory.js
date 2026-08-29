export const DESIGNER_AI_IN_MEMORY_MESSAGE_LIMIT = 30;
export const DESIGNER_AI_CALLABLE_RECENT_TURN_LIMIT = 6;

export function normalizeDesignerAiMessageHistory(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.content)
    .slice(-DESIGNER_AI_IN_MEMORY_MESSAGE_LIMIT);
}

export function appendDesignerAiMessageHistory(current, ...messages) {
  return normalizeDesignerAiMessageHistory([
    ...(Array.isArray(current) ? current : []),
    ...messages,
  ]);
}

export function selectDesignerAiRecentTurns(messages) {
  return normalizeDesignerAiMessageHistory(messages)
    .slice(-DESIGNER_AI_CALLABLE_RECENT_TURN_LIMIT)
    .map((turn) => ({
      role: turn?.role,
      content: turn?.content,
    }));
}
