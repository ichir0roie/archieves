"use client";

import ScoreEntryShell from "@/components/ScoreEntryShell";
import TargetCircleInput from "@/components/TargetCircleInput";

export default function Page() {
  return <ScoreEntryShell renderInput={(props) => <TargetCircleInput {...props} />} />;
}
