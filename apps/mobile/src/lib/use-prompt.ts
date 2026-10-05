import { useRef, useState } from "react";

export interface Prompt<Input, Result> {
  /** Yanıt bekleyen soru; yoksa `null`. Ekran bunu gösterilecek pencereye bağlar. */
  input: Input | null;
  /** Soruyu açar ve kullanıcının yanıtını bekler. */
  ask: (input: Input) => Promise<Result>;
  /** Kullanıcının yanıtını bildirir ve pencereyi kapatır. */
  answer: (result: Result) => void;
}

/**
 * Kullanıcıya bir pencereyle soru sorup yanıtını `await` ile beklemeyi sağlar
 * (izin onayı, ödeme onayı, QR okutma gibi akışlarda kullanılır).
 *
 * @param dismissed Yanıt beklenirken yeni bir soru açılırsa önceki sorunun alacağı sonuç.
 */
export function usePrompt<Input, Result>(dismissed: Result): Prompt<Input, Result> {
  const [input, setInput] = useState<Input | null>(null);
  const resolver = useRef<((result: Result) => void) | null>(null);

  return {
    input,
    ask(next) {
      resolver.current?.(dismissed);
      return new Promise<Result>((resolve) => {
        resolver.current = resolve;
        setInput(next);
      });
    },
    answer(result) {
      resolver.current?.(result);
      resolver.current = null;
      setInput(null);
    },
  };
}
