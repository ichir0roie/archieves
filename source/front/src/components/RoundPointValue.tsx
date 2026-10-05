import {
  borderColorPallet,
  scoreToStr,
} from "@/lib/score/scoreFunctions";

interface Props {
  /** The ring this arrow landed in, or null for an arrow not yet shot. */
  value: number | null;
}

export default function RoundPointValue(props: Props) {
  if (props.value === null) {
    return (
      <div className="ArrowSlot flex aspect-square w-full items-center justify-center rounded-full border-2 border-dashed border-slate-200" />
    );
  }

  return (
    <div
      className={`ArrowSlot ArrowValue flex aspect-square w-full items-center justify-center rounded-full border-3 ${borderColorPallet(props.value)}`}
    >
      <span className="text-sm font-semibold text-black">
        {scoreToStr(props.value)}
      </span>
    </div>
  );
}
