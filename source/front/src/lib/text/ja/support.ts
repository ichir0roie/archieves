import { terms as t } from "./terms";

/** 意見箱(app/feedback/page.tsx)、意見箱の確認(app/admin/feedbacks/page.tsx)とお知らせ(app/announcements/page.tsx)。 */
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
  adminFeedback: {
    title: `${t.feedback}の確認`,
    description: "利用者から届いた意見です。新しい順に並びます。",
    empty: "まだ意見は届いていません",
    count: (n: number) => `${n} 件`,
    email: "返信先",
    noEmail: "返信先なし",
    userId: (id: number) => ` (id ${id})`,
    replied: "返信済み",
    reply: "返信",
    replyHint: "送った人の意見箱の画面に表示されます。",
    submitReply: "返信する",
    updateReply: "返信を直す",
    editReply: "直す",
    cancel: "やめる",
    submitting: "送信中...",
  },
  /** 管理者が片付けるものの件数。ホームのボタンと意見の確認ページに出す */
  pending: {
    badge: (n: number) => `未対応 ${n} 件`,
    summary: (feedbacks: number, errors: number) =>
      `未回答の意見 ${feedbacks} 件・未対応のエラー ${errors} 件`,
    errorReportsLink: "エラーの確認へ",
  },
  adminErrorReports: {
    title: "エラーの確認",
    description: "画面で起きたエラー(無いページ・API のエラー)です。未対応を先に、新しい順に並びます。",
    empty: "エラーは届いていません",
    unresolvedCount: (n: number) => `未対応 ${n} 件`,
    kind: {
      page: "無いページ",
      api: "API",
    },
    unregistered: "登録の前の利用者",
    userId: (id: number) => ` (id ${id})`,
    resolve: "対応済みにする",
    resolving: "送信中...",
    resolved: "対応済み",
  },
  announcements: {
    title: t.announcement,
    empty: `${t.announcement}はありません`,
  },
};
