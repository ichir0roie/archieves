"use client";

import Segment from "@/components/Segment";
import type { Visibility } from "@/lib/api";
import { useT } from "@/lib/text";

const VISIBILITIES: ReadonlyArray<Visibility> = [
  "private",
  "organization",
  "public",
];

type Props = {
  profileVisibility: Visibility;
  rankingVisibility: Visibility;
  scoreVisibility: Visibility;
  diaryVisibility: Visibility;
  onChangeProfileVisibility: (visibility: Visibility) => void;
  onChangeRankingVisibility: (visibility: Visibility) => void;
  onChangeScoreVisibility: (visibility: Visibility) => void;
  onChangeDiaryVisibility: (visibility: Visibility) => void;
  disabled?: boolean;
};

/** プロフィール・ランキング・スコア・日記の公開範囲を選ぶ欄と、その説明。プロフィールの設定の画面で使う */
export default function VisibilityFields(props: Props) {
  const T = useT();
  const options = VISIBILITIES.map((visibility) => ({
    value: visibility,
    label: T.profile.settings.visibility[visibility],
  }));

  return (
    <>
      <div className="field">
        <span className="field-label">{T.profile.settings.profileVisibility}</span>
        <Segment
          options={options}
          value={props.profileVisibility}
          onChange={props.onChangeProfileVisibility}
          label={T.profile.settings.profileVisibility}
          disabled={props.disabled}
        />
      </div>
      <div className="field">
        <span className="field-label">{T.profile.settings.rankingVisibility}</span>
        <Segment
          options={options}
          value={props.rankingVisibility}
          onChange={props.onChangeRankingVisibility}
          label={T.profile.settings.rankingVisibility}
          disabled={props.disabled}
        />
      </div>
      <div className="field">
        <span className="field-label">{T.profile.settings.scoreVisibility}</span>
        <Segment
          options={options}
          value={props.scoreVisibility}
          onChange={props.onChangeScoreVisibility}
          label={T.profile.settings.scoreVisibility}
          disabled={props.disabled}
        />
      </div>
      <div className="field">
        <span className="field-label">{T.profile.settings.diaryVisibility}</span>
        <Segment
          options={options}
          value={props.diaryVisibility}
          onChange={props.onChangeDiaryVisibility}
          label={T.profile.settings.diaryVisibility}
          disabled={props.disabled}
        />
      </div>
      <p className="muted small">{T.profile.settings.visibilityHint}</p>
    </>
  );
}
