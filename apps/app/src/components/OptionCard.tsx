import type { ReactNode } from "react";

// The image-card used across the quiz and space screens. `square` switches the
// image area to a 1:1 box (Figma room-type cards); `desc` is optional (room
// cards have a title only). Dark ring + check when selected.
export function OptionCard({
  selected,
  onClick,
  title,
  desc,
  square,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  desc?: string;
  square?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      className={`opt${square ? " square" : ""}${selected ? " sel" : ""}`}
      onClick={onClick}
      type="button"
    >
      {selected && <span className="chk">✓</span>}
      <div className="pic">{children}</div>
      <div className="meta">
        <div className="t">{title}</div>
        {desc && <div className="d">{desc}</div>}
      </div>
    </button>
  );
}
