// Multi-turn conversation state for morning ritual + evening tracker surveys.
// Keyed by chat_id. Survives inside the running process; resets on restart.
// Persisted lightweight state could be added later if we need cross-restart
// resume — for now, if the bot restarts mid-survey the user just waits for
// the next prompt.
const active = new Map();
export function startSurvey(survey) {
    active.set(survey.chatId, survey);
}
export function currentSurvey(chatId) {
    return active.get(chatId) ?? null;
}
export function advanceSurvey(chatId, patch) {
    const survey = active.get(chatId);
    if (!survey)
        return;
    Object.assign(survey.data, patch);
    survey.step += 1;
}
export function clearSurvey(chatId) {
    active.delete(chatId);
}
export function isSurveyActive(chatId) {
    return active.has(chatId);
}
//# sourceMappingURL=conversation-state.js.map