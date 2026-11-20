// ============================================================================
// ZERO-DEPENDENCY STANDARD PKZIP (STORE + CRC-32) ARCHIVE BUILDER
// Produces spec-compliant .zip files readable in Windows Explorer, macOS Finder,
// Python zipfile, Info-ZIP unzip, and 7-Zip from browser or Node.js.
// ============================================================================

export interface ZipEntry {
  path: string;
  content: string | Uint8Array;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Encodes a single-byte Latin-1 (ISO-8859-1) string directly to raw bytes. */
export function encodeLatin1(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    bytes[i] = code <= 0xff ? code : 0x3f;
  }
  return bytes;
}

/** Prepends a raw binary header (e.g. QSPICE \xff\xd8\xff\xdb) to a Latin-1 payload. */
export function buildQspiceBinaryFile(latin1Body: string): Uint8Array {
  const prefix = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]);
  const body = encodeLatin1(latin1Body);
  const out = new Uint8Array(prefix.length + body.length);
  out.set(prefix, 0);
  out.set(body, prefix.length);
  return out;
}

function writeU16LE(buf: Uint8Array, offset: number, val: number) {
  buf[offset] = val & 0xff;
  buf[offset + 1] = (val >>> 8) & 0xff;
}

function writeU32LE(buf: Uint8Array, offset: number, val: number) {
  buf[offset] = val & 0xff;
  buf[offset + 1] = (val >>> 8) & 0xff;
  buf[offset + 2] = (val >>> 16) & 0xff;
  buf[offset + 3] = (val >>> 24) & 0xff;
}

export function buildZipArchive(entries: ZipEntry[]): Uint8Array {
  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  const prepared = entries.map((entry) => {
    const nameBytes = encodeUtf8(entry.path.replace(/^\/+/, ''));
    const dataBytes =
      typeof entry.content === 'string' ? encodeUtf8(entry.content) : entry.content;
    const crc = crc32(dataBytes);
    return { nameBytes, dataBytes, crc, offset: 0 };
  });

  let localTotal = 0;
  let centralTotal = 0;
  for (const item of prepared) {
    item.offset = localTotal;
    localTotal += 30 + item.nameBytes.length + item.dataBytes.length;
    centralTotal += 46 + item.nameBytes.length;
  }

  const eocdSize = 22;
  const out = new Uint8Array(localTotal + centralTotal + eocdSize);
  let pos = 0;

  // Local File Headers + File Data (compression method 0 = Store)
  for (const item of prepared) {
    writeU32LE(out, pos, 0x04034b50); // Local file header signature
    writeU16LE(out, pos + 4, 20); // Version needed to extract (2.0)
    writeU16LE(out, pos + 6, 0x0800); // General purpose bit flag (UTF-8 filename)
    writeU16LE(out, pos + 8, 0); // Compression method (0 = Store)
    writeU16LE(out, pos + 10, dosTime);
    writeU16LE(out, pos + 12, dosDate);
    writeU32LE(out, pos + 14, item.crc);
    writeU32LE(out, pos + 18, item.dataBytes.length);
    writeU32LE(out, pos + 22, item.dataBytes.length);
    writeU16LE(out, pos + 26, item.nameBytes.length);
    writeU16LE(out, pos + 28, 0); // Extra field length
    out.set(item.nameBytes, pos + 30);
    pos += 30 + item.nameBytes.length;
    out.set(item.dataBytes, pos);
    pos += item.dataBytes.length;
  }

  const centralOffset = pos;

  // Central Directory Headers
  for (const item of prepared) {
    writeU32LE(out, pos, 0x02014b50); // Central directory signature
    writeU16LE(out, pos + 4, 20); // Version made by
    writeU16LE(out, pos + 6, 20); // Version needed
    writeU16LE(out, pos + 8, 0x0800); // UTF-8 filename flag
    writeU16LE(out, pos + 10, 0); // Compression method
    writeU16LE(out, pos + 12, dosTime);
    writeU16LE(out, pos + 14, dosDate);
    writeU32LE(out, pos + 16, item.crc);
    writeU32LE(out, pos + 20, item.dataBytes.length);
    writeU32LE(out, pos + 24, item.dataBytes.length);
    writeU16LE(out, pos + 28, item.nameBytes.length);
    writeU16LE(out, pos + 30, 0); // Extra field len
    writeU16LE(out, pos + 32, 0); // File comment len
    writeU16LE(out, pos + 34, 0); // Disk number start
    writeU16LE(out, pos + 36, 0); // Internal attributes
    writeU32LE(out, pos + 38, 0); // External attributes
    writeU32LE(out, pos + 42, item.offset);
    out.set(item.nameBytes, pos + 46);
    pos += 46 + item.nameBytes.length;
  }

  // End of Central Directory Record (EOCD)
  writeU32LE(out, pos, 0x06054b50);
  writeU16LE(out, pos + 4, 0); // Disk number
  writeU16LE(out, pos + 6, 0); // Start disk
  writeU16LE(out, pos + 8, prepared.length);
  writeU16LE(out, pos + 10, prepared.length);
  writeU32LE(out, pos + 12, centralTotal);
  writeU32LE(out, pos + 16, centralOffset);
  writeU16LE(out, pos + 20, 0); // Comment length

  return out;
}
