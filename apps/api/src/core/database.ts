import pg from "pg";

// bigint sütunlar (sıra numaraları, sayımlar) 2^53 sınırının çok altında kaldığı için sayı olarak okunur.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

const FRAGMENT = Symbol("sql");

/** Parametreleri metinden ayrı tutulan SQL parçası. Yalnızca `sql` etiketiyle üretilir. */
export interface SqlFragment {
  readonly [FRAGMENT]: true;
  readonly strings: readonly string[];
  readonly values: readonly unknown[];
}

function isFragment(value: unknown): value is SqlFragment {
  return typeof value === "object" && value !== null && FRAGMENT in value;
}

/**
 * SQL sorgusu oluşturur. Araya yazılan her değer bağlı parametreye dönüşür,
 * böylece sorgu metnine kullanıcı verisi karışmaz. Başka bir `sql` parçası
 * araya yazılırsa sorguya eklenir.
 *
 *   sql`select * from users where id = ${id} ${onlyActive ? sql`and status = 'active'` : sql.empty}`
 */
export function sql(strings: TemplateStringsArray, ...values: unknown[]): SqlFragment {
  return { [FRAGMENT]: true, strings, values };
}

sql.empty = sql``;

/** Parçaları verilen ayraçla birleştirir. */
sql.join = (fragments: readonly SqlFragment[], separator: string): SqlFragment => {
  if (fragments.length === 0) return sql.empty;
  const strings = ["", ...fragments.slice(1).map(() => separator), ""];
  return { [FRAGMENT]: true, strings, values: fragments };
};

export function compile(query: SqlFragment): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const render = (fragment: SqlFragment): string =>
    fragment.strings.reduce((text, part, index) => {
      if (index >= fragment.values.length) return text + part;
      const value = fragment.values[index];
      if (isFragment(value)) return text + part + render(value);
      values.push(value);
      return `${text}${part}$${values.length}`;
    }, "");
  return { text: render(query), values };
}

export interface Database {
  /** Tüm satırları döndürür. */
  many: <Row extends pg.QueryResultRow>(query: SqlFragment) => Promise<Row[]>;
  /** İlk satırı döndürür; satır yoksa `null`. */
  maybeOne: <Row extends pg.QueryResultRow>(query: SqlFragment) => Promise<Row | null>;
  /** Tam bir satır bekler; satır yoksa hata fırlatır. */
  one: <Row extends pg.QueryResultRow>(query: SqlFragment) => Promise<Row>;
  /** Sorguyu çalıştırır ve etkilenen satır sayısını döndürür. */
  execute: (query: SqlFragment) => Promise<number>;
  /** İşlevi tek bir veritabanı işlemi içinde çalıştırır; hata olursa tüm değişiklikler geri alınır. */
  transaction: <T>(run: (tx: Database) => Promise<T>) => Promise<T>;
}

export interface DatabasePool extends Database {
  /**
   * Boşta bekleyen bir bağlantı koptuğunda çağrılır: veritabanı yeniden başlamış ya da ağ kesilmiştir.
   * Havuz kopan bağlantıyı atar ve sonraki sorguda yenisini açar; dinleyiciye yalnızca kayıt düşmek kalır.
   */
  onIdleError: (listener: (error: Error) => void) => void;
  close: () => Promise<void>;
}

interface Executor {
  query: <Row extends pg.QueryResultRow>(
    text: string,
    values: unknown[],
  ) => Promise<pg.QueryResult<Row>>;
}

function bind(executor: Executor, transaction: Database["transaction"]): Database {
  const run = <Row extends pg.QueryResultRow>(query: SqlFragment) => {
    const { text, values } = compile(query);
    return executor.query<Row>(text, values);
  };
  return {
    async many<Row extends pg.QueryResultRow>(query: SqlFragment) {
      return (await run<Row>(query)).rows;
    },
    async maybeOne<Row extends pg.QueryResultRow>(query: SqlFragment) {
      return (await run<Row>(query)).rows[0] ?? null;
    },
    async one<Row extends pg.QueryResultRow>(query: SqlFragment) {
      const row = (await run<Row>(query)).rows[0];
      if (row === undefined) throw new Error("Sorgu bir satır döndürmeliydi");
      return row;
    },
    async execute(query) {
      return (await run(query)).rowCount ?? 0;
    },
    transaction,
  };
}

export function createDatabase(connectionString: string, maxConnections = 20): DatabasePool {
  const pool = new pg.Pool({ connectionString, max: maxConnections });
  // Havuz, boştaki bir bağlantı koptuğunda "error" olayı yayar; dinleyicisi olmayan olay Node.js
  // sürecini sonlandırır. Bu dinleyici, kimse kayıt tutmadığında da sürecin ayakta kalmasını sağlar.
  pool.on("error", () => undefined);

  const transaction: Database["transaction"] = async (run) => {
    const client = await pool.connect();
    // İşlem içindeyken açılan iç işlem aynı bağlantıyı kullanır; ayrı bir kayıt noktası açılmaz.
    const tx: Database = bind(client, (inner) => inner(tx));
    // Bağlantı iki sorgu arasında koparsa istemci "error" olayı yayar; kopan bağlantı havuza dönmez.
    let broken = false;
    const markBroken = () => {
      broken = true;
    };
    client.on("error", markBroken);
    try {
      await client.query("begin");
      const result = await run(tx);
      await client.query("commit");
      return result;
    } catch (error) {
      // Geri alma da başarısız olursa bağlantı güvenilmezdir. İşlemi bozan asıl hata korunur.
      await client.query("rollback").catch(markBroken);
      throw error;
    } finally {
      client.removeListener("error", markBroken);
      client.release(broken);
    }
  };

  return {
    ...bind(pool, transaction),
    onIdleError: (listener) => {
      pool.on("error", listener);
    },
    close: () => pool.end(),
  };
}

/** PostgreSQL benzersizlik ihlali (23505) hatası mı? İsteğe bağlı olarak kısıt adına göre süzer. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!(error instanceof pg.DatabaseError) || error.code !== "23505") return false;
  return constraint === undefined || error.constraint === constraint;
}

/** PostgreSQL yabancı anahtar ihlali (23503) hatası mı? */
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof pg.DatabaseError && error.code === "23503";
}
