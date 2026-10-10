import { terms as t } from "./terms";

/** 意見箱(app/feedback/page.tsx)とお知らせ(components/Announcements.tsx)。 */
export const support = {
  feedback: {
    title: t.feedback,
    description: "ご意見・ご要望・不具合をお送りください。返信はこの画面に表示されます。",
    body: "内容",
    email: "返信先のメールアドレス",
    emailHint: "空のときはサインインしているアカウントのメールアドレスを使います。",
    submit: "送信",
    submitting: "送信中...",
    sent: "送信しました",
    history: "送った内容",
    empty: "まだ送った内容はありません",
    reply: "返信",
    noReply: "返信待ち",
  },
  announcements: {
    title: t.announcement,
    empty: `${t.announcement}はありません`,
  },
};
