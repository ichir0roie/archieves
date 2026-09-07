"use client";

import ScoreEntryShell from "@/components/templates/score/ScoreEntryShell";
import TargetCircleInput from "@/components/templates/score/scoreInput/TargetCircleInput";

export default function Page() {
  return <ScoreEntryShell renderInput={(props) => <TargetCircleInput {...props} />} />;
}
