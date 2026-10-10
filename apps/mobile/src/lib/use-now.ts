import { useEffect, useState } from "react";

/**
 * Ekranda gösterilen "şimdi". Render sırasında `Date.now` çağrılmaz; değer verilen aralıkla
 * yenilenir. Süre ve "başladı mı" gibi kararlar sunucuda yeniden denetlenir.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}
