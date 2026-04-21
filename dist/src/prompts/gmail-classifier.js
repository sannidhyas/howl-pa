function compact(value, max = 300) {
    return value.replace(/\s+/g, ' ').trim().slice(0, max);
}
export function buildClassifierPrompt(input) {
    const hints = input.emailHints.trim();
    const hintsBlock = hints.length > 0
        ? `User-defined email hints:\n${hints}\n\n`
        : '';
    const emails = input.emails.map(email => {
        const labels = email.userLabels.length > 0 ? email.userLabels.join(', ') : '(none)';
        const recent = email.recentSubjects.length > 0
            ? email.recentSubjects.map(s => `    - ${compact(s, 140)}`).join('\n')
            : '    - (none)';
        return `- id: ${email.id}
  from: ${compact(email.sender, 160)}
  subject: ${compact(email.subject, 220)}
  user_labels: ${labels}
  sender_reputation: ${email.senderReputation}
  recent_subject_pattern:
${recent}
  snippet: ${compact(email.snippet, 360)}`;
    }).join('\n');
    return `${hintsBlock}You are scoring incoming email for a PhD researcher in Information Systems / trust in AI who is also building a venture.

Score each email for today's attention on a 1-5 importance scale:
1 = ignore or archive
2 = low priority, batch later
3 = useful but not urgent
4 = important and should be handled soon
5 = must-handle-today

Signals that raise importance:
- deadlines, meeting confirmations, schedule changes, calendar invites
- thesis advisor, committee, lab, university, fieldwork, publication, reviewer, or collaborator messages
- venture co-founder, investor, customer, partner, legal, contract, payment, or platform-risk messages
- personal notes from close people, actionable questions, unread replies in active threads

Signals that lower importance:
- newsletters, digests, mass mailing, marketing, promotions
- routine SaaS notifications, automated receipts without ambiguity
- lists or communities without direct action required

Treat user labels as high-signal user intent. Treat sender reputation as a prior, not a rule. Use recent subject pattern for thread context.

Output STRICT JSON array. One object per email in the same order. Keys:
  id - the email id I sent you
  importance - integer 1-5
  importance_reason - 5-12 words
  topic - optional, 1-3 words

NO prose, NO markdown fences. Just the JSON array.

Emails:
${emails}`;
}
//# sourceMappingURL=gmail-classifier.js.map