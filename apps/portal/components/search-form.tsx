interface SearchFormProps {
  /** Ekran okuyucular ve yer tutucu için: neyin arandığı. */
  label: string;
  query: string;
}

/** Sayfayı `?q=` parametresiyle yeniden açan arama kutusu; JavaScript olmadan da çalışır. */
export function SearchForm({ label, query }: SearchFormProps) {
  return (
    <form className="search" role="search">
      <input type="search" name="q" defaultValue={query} placeholder={label} aria-label={label} />
      <button type="submit" className="button">
        Ara
      </button>
    </form>
  );
}
