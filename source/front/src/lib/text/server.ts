/**
 * サーバーコンポーネント・route handler 用の文言。
 * index.ts と locale.ts は React の hook を持つので、サーバーからは読めない(読むとビルドが落ちる)。
 * サーバーには端末の言語(localStorage)が無いため、既定の言語(locale.ts の DEFAULT_LOCALE)の ja に固定する。
 */
import { texts } from "./ja";

export const T = texts;
