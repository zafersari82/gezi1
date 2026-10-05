import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

/** Sekiz köşeli yıldızın iç köşelerinin dış köşelere oranı: cos(45°) / cos(22,5°). */
const INNER_RATIO = 0.7654;
const POINTS = 16;

/** Merkezi verilen sekiz köşeli yıldızın çizim yolunu üretir. */
function starPath(centerX: number, centerY: number, outerRadius: number): string {
  const commands: string[] = [];
  for (let index = 0; index < POINTS; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : outerRadius * INNER_RATIO;
    const angle = (index * Math.PI) / 8;
    const x = (centerX + radius * Math.cos(angle)).toFixed(2);
    const y = (centerY + radius * Math.sin(angle)).toFixed(2);
    commands.push(`${index === 0 ? "M" : "L"}${x} ${y}`);
  }
  return `${commands.join(" ")} Z`;
}

interface LatticeProps {
  width: number;
  height: number;
  /** Bir yıldızın kapladığı karenin kenarı. */
  cell?: number;
  color: string;
  opacity?: number;
}

/**
 * Selçuklu ve İznik çinilerindeki "yıldız ve haç" örgüsü. Uçları birbirine değen sekiz köşeli
 * yıldızların arasında kalan boşluklar haç biçimini oluşturur. VADO'da yalnızca kimlik
 * anlarında kullanılır: karşılama ekranı ve QR kartı.
 */
export function Lattice({ width, height, cell = 44, color, opacity = 1 }: LatticeProps) {
  const columns = Math.ceil(width / cell) + 1;
  const rows = Math.ceil(height / cell) + 1;
  const stars: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      stars.push(starPath(column * cell, row * cell, cell / 2));
    }
  }

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} aria-hidden>
      <Svg width={width} height={height}>
        <Path
          d={stars.join(" ")}
          stroke={color}
          strokeWidth={1}
          strokeOpacity={opacity}
          fill="none"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // Süs katmanı: dokunmayı altındaki öğelere bırakır.
  layer: {
    pointerEvents: "none",
  },
});
