import {
  borderColorPallet,
  scoreToStr,
} from "@/modules/data/score/scoreFunctions";

interface Props {
  value: number;
}

export default function RoundPointValue(props: Props) {
  const classNameElems = new Array<string>();
  classNameElems.push(
    "flex items-center justify-center w-10 h-10 rounded-full border-3"
  );
  const color = borderColorPallet(props.value);
  classNameElems.push(`${color}`);

  return (
    <div className={classNameElems.join(" ")}>
      <span className="text-sm font-semibold text-black">
        {scoreToStr(props.value)}
      </span>
    </div>
  );
}
