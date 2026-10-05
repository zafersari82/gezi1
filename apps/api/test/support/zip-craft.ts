import { crc32, deflateRawSync } from "node:zlib";

/**
 * Sınamalar için elle zip arşivi kurar. Asıl yazıcının (`writeZip`) aksine her alan ayrı ayrı
 * bozulabilir: okuyucunun, kurallara uymayan arşivleri reddettiği bununla sınanır.
 */
export interface CraftedEntry {
  name: string | Buffer;
  /** Dosyanın açılmış içeriği. */
  data?: Buffer;
  /** 0: depolanmış, 8: deflate. Verilmezse depolanmış. */
  method?: number;
  /** Arşive yazılacak ham baytlar; verilmezse içerik `method`a göre hazırlanır. */
  body?: Buffer;
  flags?: number;
  /** Üst bayt arşivi üreten sistemi gösterir (3: Unix). */
  madeBy?: number;
  /** Unix dosya kipi (dış özniteliklerin üst 16 biti). */
  mode?: number;
  crc?: number;
  size?: number;
  compressedSize?: number;
  /** Yerel başlıkta dizindekinden farklı yazılacak alanlar. */
  local?: { name?: string; method?: number; flags?: number };
  /** Dizindeki "yerel başlığın konumu" alanı; verilmezse gerçek konum. */
  offset?: number;
  /** Yerel başlık ve veri yazılmaz; kayıt yalnızca dizinde bulunur. */
  directoryOnly?: boolean;
}

export interface CraftOptions {
  comment?: Buffer;
  /** Arşiv sonu kaydındaki kayıt sayısı; verilmezse gerçek sayı. */
  count?: number;
  disk?: number;
  /** Arşivin önüne ve arkasına eklenen fazladan baytlar. */
  prefix?: Buffer;
  suffix?: Buffer;
}

const nameOf = (name: string | Buffer) => (typeof name === "string" ? Buffer.from(name) : name);

export function craftZip(entries: readonly CraftedEntry[], options: CraftOptions = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const data = entry.data ?? Buffer.alloc(0);
    const method = entry.method ?? 0;
    const body = entry.body ?? (method === 8 ? deflateRawSync(data) : data);
    const name = nameOf(entry.name);
    const checksum = entry.crc ?? crc32(data);
    const size = entry.size ?? data.length;
    const compressedSize = entry.compressedSize ?? body.length;
    const flags = entry.flags ?? 0;

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.madeBy ?? 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressedSize, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((entry.mode ?? 0) << 16) >>> 0, 38);
    central.writeUInt32LE(entry.offset ?? offset, 42);
    centrals.push(central, name);
    if (entry.directoryOnly === true) continue;

    const localName = nameOf(entry.local?.name ?? name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.local?.flags ?? flags, 6);
    local.writeUInt16LE(entry.local?.method ?? method, 8);
    local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressedSize, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(localName.length, 26);
    locals.push(local, localName, body);
    offset += 30 + localName.length + body.length;
  }

  const directory = Buffer.concat(centrals);
  const comment = options.comment ?? Buffer.alloc(0);
  const count = options.count ?? entries.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(options.disk ?? 0, 4);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(comment.length, 20);

  return Buffer.concat([
    options.prefix ?? Buffer.alloc(0),
    ...locals,
    directory,
    end,
    comment,
    options.suffix ?? Buffer.alloc(0),
  ]);
}
