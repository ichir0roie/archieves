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
  announcements: {
    title: t.announcement,
    empty: "No news",
  },
};
