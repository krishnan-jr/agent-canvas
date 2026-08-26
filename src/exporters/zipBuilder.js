/**
 * Pure Node.js Standard ZIP Archive Generator (Dependency-free using node:zlib)
 */

import zlib from 'node:zlib';

function calculateCrc32(buffer) {
  if (typeof zlib.crc32 === 'function') {
    return zlib.crc32(buffer);
  }
  // Standard fallback CRC32 table
  let crc = 0 ^ (-1);
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

const CRC_TABLE = (() => {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    table[n] = c;
  }
  return table;
})();

export function createZipBuffer(files = []) {
  const localHeaders = [];
  const centralHeaders = [];
  let currentOffset = 0;

  for (const file of files) {
    const rawData = Buffer.from(file.content, 'utf-8');
    const compressedData = zlib.deflateRawSync(rawData);
    const crc = calculateCrc32(rawData);
    const filenameBuf = Buffer.from(file.path.replace(/^\//, ''), 'utf-8');

    const uncompressedSize = rawData.length;
    const compressedSize = compressedData.length;

    // --- Local File Header (30 bytes + filename length) ---
    const localHeader = Buffer.alloc(30 + filenameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4);         // Version needed (2.0)
    localHeader.writeUInt16LE(0, 6);          // General purpose bit flag
    localHeader.writeUInt16LE(8, 8);          // Compression method (Deflate)
    localHeader.writeUInt16LE(0, 10);         // Mod time
    localHeader.writeUInt16LE(0, 12);         // Mod date
    localHeader.writeUInt32LE(crc, 14);       // CRC32
    localHeader.writeUInt32LE(compressedSize, 18);   // Compressed size
    localHeader.writeUInt32LE(uncompressedSize, 22); // Uncompressed size
    localHeader.writeUInt16LE(filenameBuf.length, 26); // Filename length
    localHeader.writeUInt16LE(0, 28);         // Extra field length
    filenameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader);
    localHeaders.push(compressedData);

    // --- Central Directory Header (46 bytes + filename length) ---
    const centralHeader = Buffer.alloc(46 + filenameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signature
    centralHeader.writeUInt16LE(20, 4);          // Version made by
    centralHeader.writeUInt16LE(20, 6);          // Version needed
    centralHeader.writeUInt16LE(0, 8);           // Flags
    centralHeader.writeUInt16LE(8, 10);          // Compression method
    centralHeader.writeUInt16LE(0, 12);          // Mod time
    centralHeader.writeUInt16LE(0, 14);          // Mod date
    centralHeader.writeUInt32LE(crc, 16);        // CRC32
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(filenameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);          // Extra field len
    centralHeader.writeUInt16LE(0, 32);          // Comment len
    centralHeader.writeUInt16LE(0, 34);          // Disk start
    centralHeader.writeUInt16LE(0, 36);          // Internal attr
    centralHeader.writeUInt32LE(0, 38);          // External attr
    centralHeader.writeUInt32LE(currentOffset, 42); // Relative offset
    filenameBuf.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);

    currentOffset += localHeader.length + compressedData.length;
  }

  const centralDirOffset = currentOffset;
  const centralDirBuffer = Buffer.concat(centralHeaders);
  const centralDirSize = centralDirBuffer.length;

  // --- End of Central Directory Record (22 bytes) ---
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);          // Signature
  eocd.writeUInt16LE(0, 4);                   // Disk number
  eocd.writeUInt16LE(0, 6);                   // Disk with start of CD
  eocd.writeUInt16LE(files.length, 8);        // Total entries on this disk
  eocd.writeUInt16LE(files.length, 10);       // Total entries overall
  eocd.writeUInt32LE(centralDirSize, 12);     // Size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16);   // Offset of start of CD
  eocd.writeUInt16LE(0, 20);                  // Comment len

  return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
}

/**
 * Normalizes extracted ZIP file paths by stripping redundant top-level directory wrappers
 */
export function normalizeZipPaths(files = []) {
  if (!files || files.length === 0) return files;

  // Clean leading slashes or relative prefixes
  files.forEach(f => {
    f.file_path = f.file_path.replace(/^[./\\]+/, '').replace(/\\/g, '/');
  });

  const allParts = files.map(f => f.file_path.split('/').filter(Boolean));
  if (allParts.length > 0 && allParts.every(parts => parts.length > 1)) {
    const firstSegment = allParts[0][0];
    const allShareRoot = allParts.every(parts => parts[0] === firstSegment);
    if (allShareRoot) {
      files.forEach(f => {
        const parts = f.file_path.split('/').filter(Boolean);
        f.file_path = parts.slice(1).join('/');
      });
    }
  }

  return files;
}

/**
 * Pure Node.js Standard ZIP Archive Extractor (Dependency-free using node:zlib)
 * Accurately parses Central Directory records to support archives with data descriptors (macOS Finder, zip, etc.)
 */
export function unzipArchive(buffer) {
  if (!buffer) return [];
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  if (buf.length < 22) {
    throw new Error('Invalid ZIP archive: File buffer is too small.');
  }

  // 1. Locate End of Central Directory (EOCD) signature: 0x06054b50
  let eocdOffset = -1;
  const maxSearch = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= maxSearch; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  const files = [];

  if (eocdOffset !== -1) {
    const totalEntries = buf.readUInt16LE(eocdOffset + 10);
    const cdSize = buf.readUInt32LE(eocdOffset + 12);
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);

    let currOffset = cdOffset;
    for (let i = 0; i < totalEntries && currOffset < eocdOffset; i++) {
      const sig = buf.readUInt32LE(currOffset);
      if (sig !== 0x02014b50) break;

      const compMethod = buf.readUInt16LE(currOffset + 10);
      const compSize = buf.readUInt32LE(currOffset + 20);
      const uncompSize = buf.readUInt32LE(currOffset + 24);
      const nameLen = buf.readUInt16LE(currOffset + 28);
      const extraLen = buf.readUInt16LE(currOffset + 30);
      const commentLen = buf.readUInt16LE(currOffset + 32);
      const localHeaderOffset = buf.readUInt32LE(currOffset + 42);

      const fileNameBuf = buf.subarray(currOffset + 46, currOffset + 46 + nameLen);
      const rawFileName = fileNameBuf.toString('utf-8');

      currOffset += 46 + nameLen + extraLen + commentLen;

      // Filter out directory entries and OS metadata
      const baseName = rawFileName.split('/').filter(Boolean).pop() || '';
      if (
        rawFileName.endsWith('/') ||
        rawFileName.includes('__MACOSX') ||
        baseName.startsWith('._') ||
        baseName === '.DS_Store' ||
        baseName === 'Thumbs.db'
      ) {
        continue;
      }

      if (localHeaderOffset + 30 > buf.length) continue;
      const localSig = buf.readUInt32LE(localHeaderOffset);
      if (localSig !== 0x04034b50) continue;

      const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;

      if (dataOffset + compSize > buf.length) continue;

      const compressedBytes = buf.subarray(dataOffset, dataOffset + compSize);
      let content = '';

      if (compMethod === 0) {
        // Stored (Uncompressed)
        content = compressedBytes.toString('utf-8');
      } else if (compMethod === 8) {
        // Deflated
        try {
          const decompressed = zlib.inflateRawSync(compressedBytes);
          content = decompressed.toString('utf-8');
        } catch (err) {
          console.warn(`[WARN] Failed to decompress zip entry "${rawFileName}":`, err.message);
          continue;
        }
      } else {
        console.warn(`[WARN] Unsupported compression method ${compMethod} for "${rawFileName}"`);
        continue;
      }

      files.push({
        file_path: rawFileName,
        content: content || ''
      });
    }
  } else {
    // Fallback: Scan local file headers if EOCD is absent
    let offset = 0;
    while (offset < buf.length - 30) {
      const sig = buf.readUInt32LE(offset);
      if (sig === 0x04034b50) {
        const compMethod = buf.readUInt16LE(offset + 8);
        const compSize = buf.readUInt32LE(offset + 18);
        const uncompSize = buf.readUInt32LE(offset + 22);
        const nameLen = buf.readUInt16LE(offset + 26);
        const extraLen = buf.readUInt16LE(offset + 28);

        const rawFileName = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf-8');
        const dataOffset = offset + 30 + nameLen + extraLen;

        const baseName = rawFileName.split('/').filter(Boolean).pop() || '';
        if (
          !rawFileName.endsWith('/') &&
          !rawFileName.includes('__MACOSX') &&
          !baseName.startsWith('._') &&
          baseName !== '.DS_Store' &&
          compSize > 0 &&
          dataOffset + compSize <= buf.length
        ) {
          const compressedBytes = buf.subarray(dataOffset, dataOffset + compSize);
          let content = '';
          if (compMethod === 0) {
            content = compressedBytes.toString('utf-8');
          } else if (compMethod === 8) {
            try {
              const decompressed = zlib.inflateRawSync(compressedBytes);
              content = decompressed.toString('utf-8');
            } catch (err) {
              console.warn(`[WARN] Fallback decompression failed for "${rawFileName}":`, err.message);
            }
          }

          files.push({
            file_path: rawFileName,
            content: content || ''
          });
        }

        offset = dataOffset + Math.max(compSize, 1);
      } else {
        offset++;
      }
    }
  }

  normalizeZipPaths(files);
  return files;
}
