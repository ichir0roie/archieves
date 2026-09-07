"use client";

import ScoreEntryShell from "@/components/templates/score/ScoreEntryShell";
import SimpleScoreInput from "@/components/templates/score/scoreInput/SimpleScoreInput";

export default function Page() {
  return <ScoreEntryShell renderInput={(props) => <SimpleScoreInput {...props} />} />;
}
