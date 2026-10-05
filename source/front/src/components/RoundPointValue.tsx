import { ringClass, scoreToStr } from "@/lib/score/scoreFunctions";

type Props = {
  /** 矢の当たった帯。まだ射っていない矢は null */
  value: number | null;
};

export default function RoundPointValue(props: Props) {
  if (props.value === null) {
    return <div className="ArrowSlot arrow-slot empty" />;
  }

  return (
    <div className={`ArrowSlot ArrowValue arrow-slot filled ${ringClass(props.value)}`}>
      {scoreToStr(props.value)}
    </div>
  );
}
