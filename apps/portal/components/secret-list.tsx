interface SecretListProps {
  title: string;
  /** Neden bir kez gösterildiği ve nasıl saklanacağı. */
  hint: string;
  secrets: string[];
}

/** Kurtarma kodu ya da geçici parola gibi yalnızca bir kez gösterilen değerler. */
export function SecretList({ title, hint, secrets }: SecretListProps) {
  return (
    <div className="secret" role="status">
      <h3>{title}</h3>
      <p className="hint">{hint}</p>
      <ul className="secret-values mono">
        {secrets.map((secret) => (
          <li key={secret}>{secret}</li>
        ))}
      </ul>
    </div>
  );
}
