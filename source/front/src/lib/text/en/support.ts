import type { support as ja } from "../ja/support";
import { terms as t } from "./terms";

export const support: typeof ja = {
  feedback: {
    title: t.feedback,
    description: "Send us your opinions, requests or bug reports. Replies appear on this screen.",
    body: "Message",
    email: "Email for replies",
    emailHint: "If empty, the email of the signed-in account is used.",
    submit: "Send",
    submitting: "Sending...",
    sent: "Sent",
    history: "Sent messages",
    empty: "No messages sent yet",
    reply: "Reply",
    noReply: "Awaiting reply",
  },
  adminFeedback: {
    title: "Review feedback",
    description: "Feedback sent by users, newest first.",
    empty: "No feedback yet",
    count: (n: number) => `${n} ${n === 1 ? "message" : "messages"}`,
    email: "Reply to",
    noEmail: "No reply address",
    userId: (id: number) => ` (id ${id})`,
    replied: "Replied",
    reply: "Reply",
    replyHint: "Shown on the sender's feedback screen.",
    submitReply: "Send reply",
    updateReply: "Update reply",
    editReply: "Edit",
    cancel: "Cancel",
    submitting: "Sending...",
  },
  pending: {
    badge: (n: number) => `${n} pending`,
    summary: (feedbacks: number, errors: number) =>
      `${feedbacks} unanswered feedback, ${errors} unresolved ${errors === 1 ? "error" : "errors"}`,
    errorReportsLink: "Review errors",
  },
  adminErrorReports: {
    title: "Review errors",
    description: "Errors that happened on screen (missing pages and API errors). Unresolved first, newest first.",
    empty: "No errors reported",
    unresolvedCount: (n: number) => `${n} unresolved`,
    kind: {
      page: "Missing page",
      api: "API",
    },
    unregistered: "Unregistered user",
    userId: (id: number) => ` (id ${id})`,
    resolve: "Mark as resolved",
    resolving: "Sending...",
    resolved: "Resolved",
  },
  announcements: {
    title: t.announcement,
    empty: "No news",
  },
};
