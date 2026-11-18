"use client";

import ScoreEntryShell from "@/components/ScoreEntryShell";
import NumberPadInput from "@/components/NumberPadInput";
import PhotoCaptureInput from "@/components/PhotoCaptureInput";
import TargetCircleInput from "@/components/TargetCircleInput";

export default function Page() {
  return (
    <ScoreEntryShell
      renderInput={(props) => {
        // 写真モードの撮影は写真を撮るだけ。補正は的で入れ、写真を的に重ねる(TargetCircleInput)
        if (props.photo?.phase === "record") return <PhotoCaptureInput {...props} />;
        if (props.numberPad) return <NumberPadInput {...props} />;
        return <TargetCircleInput {...props} />;
      }}
    />
  );
}
