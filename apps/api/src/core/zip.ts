import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

/**
 * Mini uygulama paketleri için katı bir zip okuyucu ve yazıcı.
 *
 * Okuyucu yalnızca sıradan arşivleri kabul eder: şifresiz, tek parça, depolanmış ya da deflate ile
 * sıkıştırılmış, düz ASCII adlı dosyalar. Bunun dışındaki her şey (ZIP64, sembolik bağlantı,
 * üst üste binen veri, bildirilenden büyük açılan içerik…) reddedilir; arşivin açılmış boyutu,
 * tek bayt açılmadan önce sınırlanır.
 */

/** Arşivdeki tek dosya. */
export interface ZipEntry {
  path: string;
  data: Buffer;
}

export interface ZipLimits {
  /** Arşivdeki en çok dosya sayısı. */
  files: number;
  /** Açılmış dosyaların en büyük toplam boyutu (bayt). */
  totalBytes: number;
}

/** Arşiv kabul edilmediğinde fırlatılır; iletisi arşivi yükleyene gösterilir. */
export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

const END_SIGNATURE = 0x06054b50;
const END_SIZE = 22;
const CENTRAL_SIGNATURE = 0x02014b50;
const CENTRAL_SIZE = 46;
const LOCAL_SIGNATURE = 0x04034b50;
const LOCAL_SIZE = 30;
const MAX_COMMENT = 0xffff;

const METHOD_STORED = 0;
const METHOD_DEFLATED = 8;
/** Şifreleme (bit 0), yamalı veri (5), güçlü şifreleme (6), gizlenmiş başlıklar (13). */
const FORBIDDEN_FLAGS = 0x0001 | 0x0020 | 0x0040 | 0x2000;
const UNIX_HOST = 3;
const FILE_TYPE_MASK = 0o170000;
const REGULAR_FILE = 0o100000;
const DIRECTORY = 0o040000;
/** Arşivi "en az 2.0 sürümüyle açılır" diye işaretler: deflate için gereken en düşük sürüm. */
const VERSION = 20;
/** 1 Ocak 1980: zip biçiminin gösterebildiği en eski gün. Yazıcı her dosyaya bunu yazar. */
const FIXED_DATE = 0x0021;

interface CentralRecord {
  path: string;
  method: number;
  checksum: number;
  compressedSize: number;
  size: number;
  localOffset: number;
  name: Buffer;
}

/** Arşiv sonu kaydının konumu. Kayıt dosyanın tam sonunda bitmelidir. */
function findEnd(archive: Buffer): number {
  const lowest = Math.max(0, archive.length - END_SIZE - MAX_COMMENT);
  for (let offset = archive.length - END_SIZE; offset >= lowest; offset -= 1) {
    const isEnd =
      archive.readUInt32LE(offset) === END_SIGNATURE &&
      archive.readUInt16LE(offset + 20) === archive.length - offset - END_SIZE;
    if (isEnd) return offset;
  }
  throw new ZipError("Dosya bir zip arşivi değil.");
}

function readCentralDirectory(
  archive: Buffer,
  limits: ZipLimits,
): { records: CentralRecord[]; directoryOffset: number } {
  if (archive.length < END_SIZE) throw new ZipError("Dosya bir zip arşivi değil.");
  const end = findEnd(archive);
  const count = archive.readUInt16LE(end + 10);
  const directorySize = archive.readUInt32LE(end + 12);
  const directoryOffset = archive.readUInt32LE(end + 16);

  const multiPart =
    archive.readUInt16LE(end + 4) !== 0 ||
    archive.readUInt16LE(end + 6) !== 0 ||
    archive.readUInt16LE(end + 8) !== count;
  if (multiPart) throw new ZipError("Çok parçalı arşivler kabul edilmez.");
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new ZipError("ZIP64 arşivleri kabul edilmez.");
  }
  // Dizin tam arşiv sonu kaydında bitmelidir; arada ya da başta gizlenmiş veri kabul edilmez.
  if (directoryOffset + directorySize !== end) throw new ZipError("Arşivin yapısı tutarsız.");
  // Klasör kayıtları da sayıldığı için üst sınır dosya sınırının iki katıdır.
  if (count > limits.files * 2)
    throw new ZipError(`Arşivde en çok ${limits.files} dosya olabilir.`);

  const records: CentralRecord[] = [];
  const seen = new Set<string>();
  let total = 0;
  let offset = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (offset + CENTRAL_SIZE > end || archive.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new ZipError("Arşivin yapısı tutarsız.");
    }
    const madeBy = archive.readUInt16LE(offset + 4);
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const checksum = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const size = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const startDisk = archive.readUInt16LE(offset + 34);
    const mode = archive.readUInt32LE(offset + 38) >>> 16;
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + CENTRAL_SIZE, offset + CENTRAL_SIZE + nameLength);
    offset += CENTRAL_SIZE + nameLength + extraLength + commentLength;
    if (offset > end) throw new ZipError("Arşivin yapısı tutarsız.");

    if (!name.every((byte) => byte >= 0x20 && byte <= 0x7e)) {
      throw new ZipError("Dosya adlarında yalnızca ASCII karakterler kullanılabilir.");
    }
    const path = name.toString("latin1");
    if ((flags & FORBIDDEN_FLAGS) !== 0) throw new ZipError(`Şifreli dosya kabul edilmez: ${path}`);
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) {
      throw new ZipError("ZIP64 arşivleri kabul edilmez.");
    }
    if (startDisk !== 0) throw new ZipError("Çok parçalı arşivler kabul edilmez.");
    const fileType = madeBy >> 8 === UNIX_HOST ? mode & FILE_TYPE_MASK : 0;
    if (fileType !== 0 && fileType !== REGULAR_FILE && fileType !== DIRECTORY) {
      throw new ZipError(`Sembolik bağlantı ve özel dosyalar kabul edilmez: ${path}`);
    }
    if (path.endsWith("/")) {
      if (size !== 0) throw new ZipError(`Klasör kaydı veri içeremez: ${path}`);
      continue;
    }
    if (method !== METHOD_STORED && method !== METHOD_DEFLATED) {
      throw new ZipError(`Desteklenmeyen sıkıştırma yöntemi: ${path}`);
    }
    const folded = path.toLowerCase();
    if (seen.has(folded)) throw new ZipError(`Aynı dosya arşivde birden çok kez geçiyor: ${path}`);
    seen.add(folded);

    total += size;
    if (records.length >= limits.files) {
      throw new ZipError(`Arşivde en çok ${limits.files} dosya olabilir.`);
    }
    if (total > limits.totalBytes) throw new ZipError("Arşivin açılmış boyutu sınırı aşıyor.");
    records.push({ path, method, checksum, compressedSize, size, localOffset, name });
  }
  if (offset !== end) throw new ZipError("Arşivin yapısı tutarsız.");
  return { records, directoryOffset };
}

/** Dosyanın arşivdeki sıkıştırılmış verisinin başladığı ve bittiği konum. */
function locateData(archive: Buffer, record: CentralRecord, directoryOffset: number) {
  const { localOffset, path } = record;
  if (
    localOffset + LOCAL_SIZE > directoryOffset ||
    archive.readUInt32LE(localOffset) !== LOCAL_SIGNATURE
  ) {
    throw new ZipError(`Arşivin yapısı tutarsız: ${path}`);
  }
  const nameLength = archive.readUInt16LE(localOffset + 26);
  const extraLength = archive.readUInt16LE(localOffset + 28);
  const name = archive.subarray(localOffset + LOCAL_SIZE, localOffset + LOCAL_SIZE + nameLength);
  const start = localOffset + LOCAL_SIZE + nameLength + extraLength;
  const end = start + record.compressedSize;
  // Yerel başlık dizindeki kayıtla aynı dosyayı anlatmalıdır; biri diğerinden farklı bir ad ya da
  // yöntem gösteriyorsa arşiv, farklı araçlara farklı içerik göstermek için hazırlanmıştır.
  const consistent =
    name.equals(record.name) &&
    archive.readUInt16LE(localOffset + 8) === record.method &&
    (archive.readUInt16LE(localOffset + 6) & FORBIDDEN_FLAGS) === 0 &&
    end <= directoryOffset;
  if (!consistent) throw new ZipError(`Arşivin yapısı tutarsız: ${path}`);
  return { start, end };
}

function extract(archive: Buffer, record: CentralRecord, start: number, end: number): Buffer {
  const compressed = archive.subarray(start, end);
  let data: Buffer;
  if (record.method === METHOD_STORED) {
    data = Buffer.from(compressed);
  } else {
    try {
      // Açılan veri bildirilen boyutu aşarsa açma işlemi yarıda kesilir (zip bombası).
      data = inflateRawSync(compressed, { maxOutputLength: Math.max(record.size, 1) });
    } catch {
      throw new ZipError(`Dosya açılamadı ya da bildirilen boyuttan büyük: ${record.path}`);
    }
  }
  if (data.length !== record.size || crc32(data) !== record.checksum) {
    throw new ZipError(`Dosya bozuk: ${record.path}`);
  }
  return data;
}

/** Arşivi doğrular ve içindeki dosyaları döndürür. Klasör kayıtları atlanır. */
export function readZip(archive: Buffer, limits: ZipLimits): ZipEntry[] {
  const { records, directoryOffset } = readCentralDirectory(archive, limits);
  const located = records
    .map((record) => ({ record, ...locateData(archive, record, directoryOffset) }))
    .sort((left, right) => left.record.localOffset - right.record.localOffset);

  // Aynı veriyi paylaşan kayıtlar, küçük bir arşivin çok büyük açılmasını sağlar.
  let previousEnd = 0;
  for (const { record, end } of located) {
    if (record.localOffset < previousEnd) {
      throw new ZipError(`Dosyalar arşivde üst üste biniyor: ${record.path}`);
    }
    previousEnd = end;
  }
  return located.map(({ record, start, end }) => ({
    path: record.path,
    data: extract(archive, record, start, end),
  }));
}

/**
 * Dosyaları zip arşivine yazar. Dosyalar yol sırasına dizilir ve tarihleri sabittir; aynı içerik
 * her çalıştırmada bayt bayt aynı arşivi verir.
 */
export function writeZip(entries: readonly ZipEntry[]): Buffer {
  const sorted = [...entries].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const { path, data } of sorted) {
    const name = Buffer.from(path, "latin1");
    const deflated = deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;

    const local = Buffer.alloc(LOCAL_SIZE);
    local.writeUInt32LE(LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(stored ? METHOD_STORED : METHOD_DEFLATED, 8);
    local.writeUInt16LE(FIXED_DATE, 12);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);

    const central = Buffer.alloc(CENTRAL_SIZE);
    central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    central.writeUInt16LE(VERSION, 4);
    // Yerel başlığın "gereken sürüm" alanından boyutlara kadarki bölümü dizinde aynen yinelenir.
    local.copy(central, 6, 4, LOCAL_SIZE);
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, body);
    centrals.push(central, name);
    offset += LOCAL_SIZE + name.length + body.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(END_SIZE);
  end.writeUInt32LE(END_SIGNATURE, 0);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
