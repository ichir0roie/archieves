/**
 * 画面に出す文言をすべてここに集める(T)。コンポーネントに文言を直に書かない。
 * 利用者は日本語で使うので、文言は日本語で書く。数などを差し込むものは関数にする。
 * db の値(利用者の名前・団体名など)はここに置かない。
 * 画面の領域ごとにファイルを分け、ここで一つにまとめる。
 */
import { common } from "./common";
import { game } from "./game";
import { home } from "./home";
import { profile } from "./profile";
import { stats } from "./stats";

export const T = {
  ...common,
  home,
  stats,
  game,
  profile,
} as const;
