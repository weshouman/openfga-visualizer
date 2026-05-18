/* Minimal zip reader for extracting text files from a zip Blob.
   Uses DecompressionStream for DEFLATE entries (modern browsers).
   Returns a Map of { path -> text content }. */

var ZipReader = (function () {

  function readBlob(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(new Uint8Array(reader.result)); };
      reader.onerror = function () { reject(new Error('Failed to read blob')); };
      reader.readAsArrayBuffer(blob);
    });
  }

  function readUint16(buf, offset) {
    return buf[offset] | (buf[offset + 1] << 8);
  }

  function readUint32(buf, offset) {
    return (buf[offset] | (buf[offset + 1] << 8) |
            (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0;
  }

  function decodeUTF8(buf, offset, length) {
    return new TextDecoder().decode(buf.slice(offset, offset + length));
  }

  /* Find the End of Central Directory record (last 22+ bytes of the file). */
  function findEOCD(buf) {
    // EOCD signature: 0x06054b50
    for (var i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
      if (buf[i] === 0x50 && buf[i + 1] === 0x4b &&
          buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
        return i;
      }
    }
    return -1;
  }

  /* Parse central directory entries. Returns array of file descriptors. */
  function parseCentralDirectory(buf, eocdOffset) {
    var cdOffset = readUint32(buf, eocdOffset + 16);
    var entryCount = readUint16(buf, eocdOffset + 10);
    var entries = [];
    var pos = cdOffset;

    for (var i = 0; i < entryCount; i++) {
      // Central directory header signature: 0x02014b50
      if (readUint32(buf, pos) !== 0x02014b50) break;

      var method = readUint16(buf, pos + 10);
      var compSize = readUint32(buf, pos + 20);
      var uncompSize = readUint32(buf, pos + 24);
      var nameLen = readUint16(buf, pos + 28);
      var extraLen = readUint16(buf, pos + 30);
      var commentLen = readUint16(buf, pos + 32);
      var localHeaderOffset = readUint32(buf, pos + 42);
      var name = decodeUTF8(buf, pos + 46, nameLen);

      entries.push({
        name: name,
        method: method,
        compressedSize: compSize,
        uncompressedSize: uncompSize,
        localHeaderOffset: localHeaderOffset,
      });

      pos += 46 + nameLen + extraLen + commentLen;
    }

    return entries;
  }

  /* Extract raw compressed data from a local file header. */
  function getEntryData(buf, entry) {
    var pos = entry.localHeaderOffset;
    // Local file header signature: 0x04034b50
    var nameLen = readUint16(buf, pos + 26);
    var extraLen = readUint16(buf, pos + 28);
    var dataStart = pos + 30 + nameLen + extraLen;
    return buf.slice(dataStart, dataStart + entry.compressedSize);
  }

  /* Decompress DEFLATE data using DecompressionStream. */
  function inflate(compressedData) {
    var ds = new DecompressionStream('deflate-raw');
    var writer = ds.writable.getWriter();
    writer.write(compressedData);
    writer.close();

    var reader = ds.readable.getReader();
    var chunks = [];

    return (function readChunk() {
      return reader.read().then(function (result) {
        if (result.done) {
          var totalLen = 0;
          for (var i = 0; i < chunks.length; i++) totalLen += chunks[i].length;
          var merged = new Uint8Array(totalLen);
          var offset = 0;
          for (var j = 0; j < chunks.length; j++) {
            merged.set(chunks[j], offset);
            offset += chunks[j].length;
          }
          return merged;
        }
        chunks.push(result.value);
        return readChunk();
      });
    })();
  }

  /* Extract all text files from a zip Blob.
     Returns: Promise<Map<string, string>> */
  function extractAll(blob) {
    return readBlob(blob).then(function (buf) {
      var eocd = findEOCD(buf);
      if (eocd === -1) throw new Error('Invalid zip: EOCD not found');

      var entries = parseCentralDirectory(buf, eocd);
      var files = {};
      var promises = [];

      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        // Skip directories
        if (entry.name.endsWith('/')) continue;

        if (entry.method === 0) {
          // Stored (no compression)
          var raw = getEntryData(buf, entry);
          files[entry.name] = new TextDecoder().decode(raw);
        } else if (entry.method === 8) {
          // Deflate
          (function (e) {
            var compressed = getEntryData(buf, e);
            promises.push(
              inflate(compressed).then(function (decompressed) {
                files[e.name] = new TextDecoder().decode(decompressed);
              })
            );
          })(entry);
        }
      }

      return Promise.all(promises).then(function () {
        return files;
      });
    });
  }

  return { extractAll: extractAll };
})();
