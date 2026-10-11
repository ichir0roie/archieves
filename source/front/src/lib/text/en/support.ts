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
  announcements: {
    title: t.announcement,
    empty: "No news",
  },
};
