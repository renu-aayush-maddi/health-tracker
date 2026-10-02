// Identifies uploads by their leading "magic" bytes rather than trusting the file name or the
// browser-declared type, so a renamed executable can't be stored as a "PDF".

const startsWith = (buffer, bytes, offset = 0) =>
  bytes.every((byte, i) => buffer[offset + i] === byte);
const ascii = (buffer, start, end) => buffer.subarray(start, end).toString('latin1');

const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

/** Returns one of the supported MIME types, or null if the content isn't recognized. */
export function detectFileType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP') return 'image/webp';
  if (ascii(buffer, 4, 8) === 'ftyp' && HEIF_BRANDS.has(ascii(buffer, 8, 12))) return 'image/heic';
  if (ascii(buffer, 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}
