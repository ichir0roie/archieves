import { terms as t } from "./terms";

/** 設定画面(app/settings/page.tsx)。 */
export const settings = {
  title: t.settings,
  menuPosition: {
    title: "メニューボタンの位置",
    description: "メニューのボタンを置く画面の隅を選びます。選ぶまでは画面の幅に合わせて自動で決まります。",
    groupLabel: "メニューボタンの位置",
    topLeft: "左上",
    topRight: "右上",
    bottomLeft: "左下",
    bottomRight: "右下",
  },
  language: {
    title: "言語",
    description: "画面に出す言語を選びます。選んだ言語はこの端末に保存されます。",
    groupLabel: "言語",
    ja: "日本語",
    en: "English",
  },
  links: {
    title: "アカウント",
    profileSettings: `${t.profile}${t.settings}`,
  },
  export: {
    title: t.export,
    description: `自分の${t.record}を SQLite のファイル (.db) でダウンロードします。表と列の説明もファイルの中に入っているので、他のアプリや AI でも読めます。この画面の${t.import}で取り込み直せます。`,
    submit: "ダウンロード (.db)",
    exporting: "作成中...",
  },
};
