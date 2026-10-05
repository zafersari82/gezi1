import type { FormState } from "@/lib/form-state";

interface FormFeedbackProps {
  state: FormState<unknown>;
  /** İşlem başarıyla tamamlandığında gösterilen kısa ileti. */
  saved: string;
}

/** Bir formun son gönderiminin sonucu: hata, hatanın ayrıntıları ya da başarı iletisi. */
export function FormFeedback({ state, saved }: FormFeedbackProps) {
  const problems = state.problems ?? [];
  return (
    <div className="feedback" aria-live="polite">
      {state.error !== null && <p className="form-error">{state.error}</p>}
      {state.saved && <p className="form-saved">{saved}</p>}
      {problems.length > 0 && (
        <ul className="problems">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
