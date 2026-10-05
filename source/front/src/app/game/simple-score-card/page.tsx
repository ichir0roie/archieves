"use client";

import ScoreEntryShell from "@/components/ScoreEntryShell";
import SimpleScoreInput from "@/components/SimpleScoreInput";

export default function Page() {
  return (
    <ScoreEntryShell
      showEndView={false}
      renderInput={(props) => <SimpleScoreInput {...props} />}
    />
  );
}
