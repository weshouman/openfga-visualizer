/* FGA DSL to JSON model parser (client-side).
   Port of fga_parser.py. Converts .fga module files into the JSON
   authorization model format used by the visualizer. */

var FgaParser = (function () {

  function parseFgaFiles(fileContents, schemaVersion) {
    schemaVersion = schemaVersion || '1.1';
    var types = {};
    var typeOrder = [];

    for (var i = 0; i < fileContents.length; i++) {
      parseSingleFile(fileContents[i][1], types, typeOrder);
    }

    var typeDefs = [];
    for (var t = 0; t < typeOrder.length; t++) {
      var tname = typeOrder[t];
      var tdata = types[tname];
      var td = { type: tname };

      if (tdata.relOrder.length > 0) {
        td.relations = {};
        var metaRels = {};

        for (var r = 0; r < tdata.relOrder.length; r++) {
          var rname = tdata.relOrder[r];
          var rdef = tdata.relations[rname];
          td.relations[rname] = rdef.rewrite;

          if (rdef.allowedTypes.length > 0) {
            metaRels[rname] = {
              directly_related_user_types: rdef.allowedTypes
            };
          }
        }

        if (Object.keys(metaRels).length > 0) {
          td.metadata = { relations: metaRels };
        }
      }

      typeDefs.push(td);
    }

    return {
      schema_version: schemaVersion,
      type_definitions: typeDefs
    };
  }

  function parseSingleFile(text, types, typeOrder) {
    var lines = text.split('\n');
    var currentType = null;
    var inRelations = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();

      if (!line || line.indexOf('#') === 0 || line.indexOf('//') === 0) continue;
      if (line.indexOf('module ') === 0) continue;
      if (line.indexOf('condition ') === 0) continue;

      var typeMatch = line.match(/^(extend\s+)?type\s+(\w+)$/);
      if (typeMatch) {
        var tname = typeMatch[2];
        if (!types[tname]) {
          types[tname] = { relations: {}, relOrder: [] };
          typeOrder.push(tname);
        }
        currentType = tname;
        inRelations = false;
        continue;
      }

      if (line === 'relations') {
        inRelations = true;
        continue;
      }

      if (line.indexOf('define ') === 0 && inRelations && currentType) {
        parseDefine(line, types[currentType]);
        continue;
      }
    }
  }

  function parseDefine(line, typeData) {
    var m = line.match(/^define\s+(\w+)\s*:\s*(.+)$/);
    if (!m) return;

    var relName = m[1];
    var definition = m[2].trim();

    var allowedTypes = [];
    var rewriteParts = [];

    var directMatch = definition.match(/^\[([^\]]+)\](.*)$/);
    if (directMatch) {
      allowedTypes = parseTypeList(directMatch[1]);
      rewriteParts.push({ 'this': {} });

      var remainder = directMatch[2].trim();
      if (remainder.indexOf('or ') === 0) {
        remainder = remainder.substring(3);
      }
      if (remainder) {
        var parts = splitOr(remainder);
        for (var i = 0; i < parts.length; i++) {
          rewriteParts.push(parseRewritePart(parts[i]));
        }
      }
    } else {
      var parts2 = splitOr(definition);
      for (var j = 0; j < parts2.length; j++) {
        rewriteParts.push(parseRewritePart(parts2[j]));
      }
    }

    var rewrite;
    if (rewriteParts.length === 1) {
      rewrite = rewriteParts[0];
    } else {
      rewrite = { union: { child: rewriteParts } };
    }

    typeData.relations[relName] = {
      rewrite: rewrite,
      allowedTypes: allowedTypes
    };
    if (typeData.relOrder.indexOf(relName) === -1) {
      typeData.relOrder.push(relName);
    }
  }

  function splitOr(text) {
    var parts = [];
    var current = [];
    var depth = 0;
    var tokens = text.split(' ');
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var opens = (token.match(/\[/g) || []).length;
      var closes = (token.match(/\]/g) || []).length;
      depth += opens - closes;
      if (token === 'or' && depth === 0 && current.length > 0) {
        parts.push(current.join(' '));
        current = [];
      } else {
        current.push(token);
      }
    }
    if (current.length > 0) parts.push(current.join(' '));
    return parts;
  }

  function parseTypeList(typeListStr) {
    var result = [];
    var items = typeListStr.split(',');
    for (var i = 0; i < items.length; i++) {
      var item = items[i].trim();
      if (!item) continue;
      if (item.indexOf('#') !== -1) {
        var parts = item.split('#', 2);
        result.push({ type: parts[0].trim(), relation: parts[1].trim() });
      } else {
        result.push({ type: item });
      }
    }
    return result;
  }

  function parseRewritePart(part) {
    part = part.trim();

    var fromMatch = part.match(/^(\w+)\s+from\s+(\w+)$/);
    if (fromMatch) {
      return {
        tupleToUserset: {
          tupleset: { relation: fromMatch[2] },
          computedUserset: { relation: fromMatch[1] }
        }
      };
    }

    if (part.match(/^\w+$/)) {
      return { computedUserset: { relation: part } };
    }

    return { computedUserset: { relation: part } };
  }

  return { parseFgaFiles: parseFgaFiles };
})();
