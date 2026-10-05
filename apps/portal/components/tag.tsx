import type { Tone } from "@/lib/format";

export function Tag({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`tag tag-${tone}`}>{label}</span>;
}
