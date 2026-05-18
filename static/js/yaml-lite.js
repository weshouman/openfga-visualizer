/* Minimal YAML parser for OpenFGA tuple, test, and fga.mod files.
   Handles the subset of YAML used by OpenFGA projects:
   - Mappings (key: value)
   - Sequences (- item)
   - Strings (plain, single-quoted, double-quoted)
   - Booleans (true/false)
   - Numbers (integers)
   - Nested structures via indentation */

var YamlLite = (function () {

  function parse(text) {
    var lines = text.split('\n');
    var result = parseBlock(lines, 0, 0);
    return result.value;
  }

  function parseBlock(lines, start, minIndent) {
    if (start >= lines.length) return { value: null, next: start };

    // Skip blank lines and comments to find the first content line
    var i = start;
    while (i < lines.length) {
      var stripped = lines[i].replace(/\s+$/, '');
      if (stripped === '' || stripped.match(/^\s*#/)) { i++; continue; }
      break;
    }
    if (i >= lines.length) return { value: null, next: i };

    var indent = getIndent(lines[i]);
    if (indent < minIndent) return { value: null, next: i };

    // Detect: is this a sequence (starts with -)  or a mapping (key: value)?
    var content = lines[i].substring(indent);
    if (content.startsWith('- ') || content === '-') {
      return parseSequence(lines, i, indent);
    } else {
      return parseMapping(lines, i, indent);
    }
  }

  function parseSequence(lines, start, seqIndent) {
    var arr = [];
    var i = start;

    while (i < lines.length) {
      var stripped = lines[i].replace(/\s+$/, '');
      if (stripped === '' || stripped.match(/^\s*#/)) { i++; continue; }

      var indent = getIndent(lines[i]);
      if (indent < seqIndent) break;
      if (indent > seqIndent) break; // deeper indent means nested, handled inside item

      var content = lines[i].substring(indent);
      if (!content.startsWith('- ')) break; // no longer a sequence item

      var afterDash = content.substring(2);

      if (afterDash === '' || afterDash.match(/^\s*$/)) {
        // Bare dash: next indented block is the value
        i++;
        var nested = parseBlock(lines, i, indent + 1);
        arr.push(nested.value);
        i = nested.next;
      } else if (afterDash.indexOf(':') !== -1 && !isQuotedValue(afterDash)) {
        // Inline mapping after dash: - key: value
        // Collect all continuation lines at deeper indent as part of this mapping
        var mappingLines = [afterDash];
        var contentIndent = indent + 2; // the "- " shifts content by 2
        var j = i + 1;
        while (j < lines.length) {
          var ls = lines[j].replace(/\s+$/, '');
          if (ls === '' || ls.match(/^\s*#/)) { j++; continue; }
          var li = getIndent(lines[j]);
          if (li < contentIndent) break;
          mappingLines.push(lines[j].substring(contentIndent));
          j++;
        }
        var subResult = parseMappingFromLines(mappingLines);
        arr.push(subResult);
        i = j;
      } else {
        // Scalar value after dash
        arr.push(parseScalar(afterDash));
        i++;
      }
    }

    return { value: arr, next: i };
  }

  function parseMapping(lines, start, mapIndent) {
    var obj = {};
    var i = start;

    while (i < lines.length) {
      var stripped = lines[i].replace(/\s+$/, '');
      if (stripped === '' || stripped.match(/^\s*#/)) { i++; continue; }

      var indent = getIndent(lines[i]);
      if (indent < mapIndent) break;
      if (indent > mapIndent) break;

      var content = lines[i].substring(indent);
      var colonIdx = findColon(content);
      if (colonIdx === -1) { i++; continue; }

      var key = content.substring(0, colonIdx).trim();
      var valueStr = content.substring(colonIdx + 1).trim();

      if (valueStr === '' || valueStr === '') {
        // Value is on subsequent indented lines
        i++;
        var nested = parseBlock(lines, i, indent + 1);
        obj[key] = nested.value;
        i = nested.next;
      } else {
        obj[key] = parseScalar(valueStr);
        i++;
      }
    }

    return { value: obj, next: i };
  }

  function parseMappingFromLines(contentLines) {
    // Parse an array of already-dedented lines as a mapping
    var obj = {};
    var i = 0;

    while (i < contentLines.length) {
      var line = contentLines[i];
      if (line.trim() === '' || line.trim().startsWith('#')) { i++; continue; }

      var indent = getIndent(line);
      var content = line.substring(indent);
      var colonIdx = findColon(content);
      if (colonIdx === -1) { i++; continue; }

      var key = content.substring(0, colonIdx).trim();
      var valueStr = content.substring(colonIdx + 1).trim();

      if (valueStr === '') {
        // Collect indented sub-lines
        var subLines = [];
        var j = i + 1;
        while (j < contentLines.length) {
          var sl = contentLines[j];
          if (sl.trim() === '' || sl.trim().startsWith('#')) { j++; continue; }
          var si = getIndent(sl);
          if (si <= indent) break;
          subLines.push(sl);
          j++;
        }
        // Re-parse with full line context
        var fullLines = subLines.map(function (l) {
          return l; // already relative to content indent
        });
        var nested = parseBlock(fullLines, 0, indent + 1);
        obj[key] = nested.value;
        i = j;
      } else {
        obj[key] = parseScalar(valueStr);
        i++;
      }
    }

    return obj;
  }

  function parseScalar(str) {
    str = str.trim();

    // Remove inline comments (not inside quotes)
    if (str.indexOf('#') > 0 && str[0] !== '\'' && str[0] !== '"') {
      str = str.replace(/\s+#.*$/, '');
    }

    // Quoted strings
    if ((str[0] === '\'' && str[str.length - 1] === '\'') ||
        (str[0] === '"' && str[str.length - 1] === '"')) {
      return str.substring(1, str.length - 1);
    }

    // Booleans
    if (str === 'true') return true;
    if (str === 'false') return false;

    // Null
    if (str === 'null' || str === '~') return null;

    // Integers
    if (str.match(/^-?\d+$/)) return parseInt(str, 10);

    // Floats
    if (str.match(/^-?\d+\.\d+$/)) return parseFloat(str);

    // Inline sequence: [a, b, c]
    if (str[0] === '[' && str[str.length - 1] === ']') {
      var inner = str.substring(1, str.length - 1);
      if (inner.trim() === '') return [];
      return inner.split(',').map(function (s) { return parseScalar(s.trim()); });
    }

    // Plain string
    return str;
  }

  function getIndent(line) {
    var m = line.match(/^(\s*)/);
    return m ? m[1].length : 0;
  }

  function findColon(content) {
    // Find the first colon that is not inside quotes
    var inSingle = false;
    var inDouble = false;
    for (var i = 0; i < content.length; i++) {
      var c = content[i];
      if (c === '\'' && !inDouble) inSingle = !inSingle;
      else if (c === '"' && !inSingle) inDouble = !inDouble;
      else if (c === ':' && !inSingle && !inDouble) {
        // Must be followed by space, end of string, or nothing
        if (i + 1 >= content.length || content[i + 1] === ' ') {
          return i;
        }
      }
    }
    return -1;
  }

  function isQuotedValue(str) {
    var trimmed = str.trim();
    return (trimmed[0] === '\'' || trimmed[0] === '"');
  }

  return { parse: parse };
})();
