const { getOrderedQuestions, normalizeRsvpConfig } = require("./rsvpConfig.cjs");
const { addQuestionOption, moveQuestion, removeQuestionOption, setModalSettings,
  setQuestionLabel, setQuestionOptionLabel, setQuestionRequired, setQuestionType,
  toggleQuestionActive } = require("./rsvpEditorOps.cjs");
const { normalizeGiftConfig } = require("./giftsConfig.cjs");

function moveRsvpQuestionToPlacement(config, questionId, targetQuestionId, placement) {
  let next = config;
  const maxSteps = getOrderedQuestions(next).length + 1;
  for (let step = 0; step < maxSteps; step += 1) {
    const rows = getOrderedQuestions(next);
    const sourceIndex = rows.findIndex((question) => question.id === questionId);
    const targetIndex = rows.findIndex((question) => question.id === targetQuestionId);
    const desired = placement === "after" ? targetIndex + 1 : targetIndex;
    const adjustedDesired = sourceIndex < desired ? desired - 1 : desired;
    if (sourceIndex === adjustedDesired) return next;
    next = moveQuestion(next, questionId, sourceIndex < adjustedDesired ? "down" : "up");
  }
  return next;
}

function applyRsvpAction(config, action) {
  const args = action.arguments;
  switch (action.type) {
    case "rsvp.set_enabled":
      return normalizeRsvpConfig({ ...config, enabled: args.enabled }, { forceEnabled: false });
    case "rsvp.set_question_active":
      return toggleQuestionActive(config, args.questionId, args.active);
    case "rsvp.update_question": {
      let next = config;
      if (args.label !== null) next = setQuestionLabel(next, args.questionId, args.label);
      if (args.questionType !== null) next = setQuestionType(next, args.questionId, args.questionType);
      if (args.required !== null) next = setQuestionRequired(next, args.questionId, args.required);
      return next;
    }
    case "rsvp.move_question":
      return moveRsvpQuestionToPlacement(config, args.questionId, args.targetQuestionId, args.placement);
    case "rsvp.add_option": {
      const before = new Set(
        getOrderedQuestions(config).find((question) => question.id === args.questionId)?.options?.map((option) => option.id) || []
      );
      let next = addQuestionOption(config, args.questionId);
      const added = getOrderedQuestions(next)
        .find((question) => question.id === args.questionId)?.options
        ?.find((option) => !before.has(option.id));
      if (added) next = setQuestionOptionLabel(next, args.questionId, added.id, args.label);
      return next;
    }
    case "rsvp.rename_option":
      return setQuestionOptionLabel(config, args.questionId, args.optionId, args.label);
    case "rsvp.remove_option":
      return removeQuestionOption(config, args.questionId, args.optionId);
    case "rsvp.update_modal":
      return setModalSettings(config, Object.fromEntries(
        Object.entries({
          title: args.title,
          subtitle: args.subtitle,
          submitLabel: args.submitLabel,
          primaryColor: args.primaryColor,
        }).filter(([, value]) => value !== null)
      ));
    default:
      return config;
  }
}

function applyGiftAction(config, action) {
  const args = action.arguments;
  if (action.type === "gifts.set_enabled") {
    return normalizeGiftConfig({ ...config, enabled: args.enabled }, { forceEnabled: false });
  }
  if (action.type === "gifts.set_method") {
    const isLink = args.method === "giftListLink";
    const nextValue = args.value === null
      ? isLink
        ? config.giftListUrl
        : config.bank[args.method]
      : args.value;
    return normalizeGiftConfig({
      ...config,
      ...(isLink
        ? { giftListUrl: nextValue }
        : { bank: { ...config.bank, [args.method]: nextValue } }),
      visibility: { ...config.visibility, [args.method]: args.visible },
    }, { forceEnabled: false });
  }
  if (action.type === "gifts.set_intro_text") {
    return normalizeGiftConfig({ ...config, introText: args.text }, { forceEnabled: false });
  }
  return config;
}


function confirmedGiftMethods(snapshot) {
  return new Set(Object.keys(snapshot.values?.gifts?.methods || {}).filter((method) => {
    const leaf = snapshot.ledger.leaves.find((entry) => entry.id === `gifts.method.${method}.visible`);
    return snapshot.values.gifts.methods[method].visible === true &&
      ["resolved_from_user", "resolved_from_existing_user_data", "resolved_by_rule"].includes(leaf?.status) &&
      ["user_current_session", "existing_user_data"].includes(leaf?.provenance);
  }));
}

function applySelectedGiftAction(config, action, confirmed) {
  if (action.type === "gifts.set_method") {
    if (action.arguments.visible) confirmed.add(action.arguments.method);
    else confirmed.delete(action.arguments.method);
  }
  if (action.type === "gifts.set_method" || (action.type === "gifts.set_enabled" && action.arguments.enabled)) {
    config = { ...config, visibility: Object.fromEntries(Object.keys(config.visibility).map((method) => [method, confirmed.has(method)])) };
  }
  return applyGiftAction(config, action);
}

module.exports = { applyRsvpAction, applySelectedGiftAction, confirmedGiftMethods };
