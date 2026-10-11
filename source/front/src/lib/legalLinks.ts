import type { Locale } from "@/lib/text";

// リポジトリを公開するので、本文は GitHub のファイルを正本にし、アプリはそこへリンクする。
// 本番は main から作るので、main にある(本番と同じ)版を指す
const REPOSITORY_FILES_URL = "https://github.com/ichir0roie/archieves/blob/main";

export function legalLinks(locale: Locale) {
  return {
    termsOfService: `${REPOSITORY_FILES_URL}/legal/terms.${locale}.md`,
    privacyPolicy: `${REPOSITORY_FILES_URL}/legal/privacy.${locale}.md`,
    license: `${REPOSITORY_FILES_URL}/LICENSE`,
  };
}
