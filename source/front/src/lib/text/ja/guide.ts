import { terms as t } from "./terms";

/** 使い方(app/guide/page.tsx)。節ごとに見出しと箇条書きの文を並べる */
export const guide = {
  title: "使い方",
  sections: [
    {
      title: "ホーム画面に追加(インストール)",
      items: [
        "iPhone・iPad: Safari でこのアプリを開き、共有ボタンから「ホーム画面に追加」を選びます",
        "Android: Chrome のメニューから「アプリをインストール」または「ホーム画面に追加」を選びます",
        "パソコン: Chrome・Edge のアドレスバーにあるインストールのアイコンを押します",
        "ホーム画面から開くとブラウザの枠が消え、ふつうのアプリと同じように全画面で使えます",
      ],
    },
    {
      title: `${t.record}する`,
      items: [
        `${t.home}の「${t.game}開始」で、${t.bowType}・${t.distance}・${t.targetType}・${t.arrow}の本数を選んで始めます`,
        `的で入力: ${t.arrow}の当たった所を押します。押しているあいだは指の上にズームが出るので、指を動かして狙い、離すと${t.record}します`,
        `数字だけで入力: ${t.game}設定で「数字だけで入力する」に印を付けると、数字のボタンで点数だけを入れます(${t.arrow}の位置は${t.record}しません)`,
        `入力中の${t.record}は端末に置き、「終了」でまとめて保存します。途中で閉じても、${t.home}の「入力中の${t.game}を続ける」から戻れます`,
        `過去の日付の${t.record}は、${t.scoreLog}の画面の「あとから入力」で付けられます`,
      ],
    },
    {
      title: "見返す",
      items: [
        `${t.scoreLog}: ${t.game}ごとの点数表と、${t.arrow}の当たった位置を見られます。${t.end}の行を押すと、その${t.end}の${t.arrow}だけを的に出します`,
        `${t.game}・${t.round}・${t.end}には、${t.comment}のアイコンから${t.comment}を書けます`,
        `${t.statistics}: 点数の推移や平均をグラフで追えます`,
        `${t.diary}: その日の調子や気づきを、${t.scoreLog}と並べて書き残せます`,
      ],
    },
    {
      title: "記録の持ち出し・AI",
      items: [
        `${t.settings}の「${t.export}」で、自分の${t.record}を SQLite のファイルでダウンロードできます`,
        `${t.settings}の「AI のトークン」で、Claude・ChatGPT などの AI に自分の${t.record}を読ませられます`,
      ],
    },
    {
      title: "困ったとき",
      items: [
        `分からないこと・不具合は、メニューの「${t.feedback}」から送ってください。返信はその画面に出ます`,
      ],
    },
  ],
};
