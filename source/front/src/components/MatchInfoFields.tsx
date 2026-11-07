"use client";

import Field from "@/components/Field";
import {
  MATCH_DESCRIPTION_MAX_LENGTH,
  MATCH_TITLE_MAX_LENGTH,
  type MatchInfo,
} from "@/lib/score/match";
import { useT } from "@/lib/text";

type Props = {
  info: MatchInfo;
  onChange: (info: MatchInfo) => void;
};

/** 試合のタイトル・内容の欄。試合を作る画面と、作った人が直すモーダルで使う */
export default function MatchInfoFields({ info, onChange }: Props) {
  const T = useT();
  return (
    <>
      <Field label={T.match.info.title}>
        {(id) => (
          <input
            id={id}
            type="text"
            className="MatchInfoTitle"
            placeholder={T.match.info.titlePlaceholder}
            value={info.title}
            maxLength={MATCH_TITLE_MAX_LENGTH}
            onChange={(e) => onChange({ ...info, title: e.target.value })}
          />
        )}
      </Field>
      <Field label={T.match.info.description}>
        {(id) => (
          <textarea
            id={id}
            className="MatchInfoDescription"
            placeholder={T.match.info.descriptionPlaceholder}
            value={info.description}
            maxLength={MATCH_DESCRIPTION_MAX_LENGTH}
            rows={6}
            onChange={(e) => onChange({ ...info, description: e.target.value })}
          />
        )}
      </Field>
    </>
  );
}
