/** Sekiz köşeli yıldızın iç köşelerinin dış köşelere oranı: cos(45°) / cos(22,5°). */
const INNER_RATIO = 0.7654;
const POINTS = 16;
const CELL = 44;

/** Merkezi kendi karesinin ortasında duran sekiz köşeli yıldızın çizim yolu. */
function starPath(): string {
  const center = CELL / 2;
  const commands: string[] = [];
  for (let index = 0; index < POINTS; index += 1) {
    const radius = index % 2 === 0 ? center : center * INNER_RATIO;
    const angle = (index * Math.PI) / 8;
    const x = (center + radius * Math.cos(angle)).toFixed(2);
    const y = (center + radius * Math.sin(angle)).toFixed(2);
    commands.push(`${index === 0 ? "M" : "L"}${x} ${y}`);
  }
  return `${commands.join(" ")} Z`;
}

/**
 * Selçuklu ve İznik çinilerindeki "yıldız ve haç" örgüsü; mobil uygulamadaki karşılama ekranı ve
 * QR kartıyla aynı motif. Panelde yalnızca marka alanının zemininde kullanılır.
 */
export function Lattice() {
  return (
    <svg className="lattice" aria-hidden="true">
      <defs>
        <pattern id="lattice" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
          <path d={starPath()} fill="none" stroke="currentColor" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#lattice)" />
    </svg>
  );
}
