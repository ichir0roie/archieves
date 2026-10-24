"use client";

import ScoreEntryShell from "@/components/ScoreEntryShell";
import NumberPadInput from "@/components/NumberPadInput";
import TargetCircleInput from "@/components/TargetCircleInput";

export default function Page() {
  return (
    <ScoreEntryShell
      renderInput={(props) =>
        props.aimSettings.numberPad ? <NumberPadInput {...props} /> : <TargetCircleInput {...props} />
      }
    />
  );
}
