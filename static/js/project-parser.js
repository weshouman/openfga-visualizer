/* Client-side project zip parser.
   Extracts an OpenFGA project zip, parses .fga modules, tuple YAML files,
   and test YAML files entirely in the browser. Port of app.py's
   _process_project_dir logic. */

var ProjectParser = (function () {

  /* Resolve a relative path like "../tuples/foo.yaml" from a base directory.
     basePath: "authz/tests" (directory), relPath: "../tuples/foo.yaml"
     returns: "authz/tuples/foo.yaml" */
  function resolvePath(basePath, relPath) {
    var parts = basePath.replace(/\/$/, '').split('/');
    var relParts = relPath.split('/');
    for (var i = 0; i < relParts.length; i++) {
      if (relParts[i] === '..') {
        parts.pop();
      } else if (relParts[i] !== '.' && relParts[i] !== '') {
        parts.push(relParts[i]);
      }
    }
    return parts.join('/');
  }

  /* Get the directory portion of a path. */
  function dirname(path) {
    var idx = path.lastIndexOf('/');
    return idx === -1 ? '' : path.substring(0, idx);
  }

  /* Get the filename without extension. */
  function stem(path) {
    var name = path.substring(path.lastIndexOf('/') + 1);
    var dotIdx = name.lastIndexOf('.');
    return dotIdx === -1 ? name : name.substring(0, dotIdx);
  }

  /* Check if a dict looks like a tuple entry. */
  function isTupleEntry(entry) {
    return entry && typeof entry === 'object' &&
      'user' in entry && 'relation' in entry && 'object' in entry;
  }

  /* Flatten the YAML check format into individual assertions. */
  function flattenChecks(checkList) {
    if (!checkList || !Array.isArray(checkList)) return [];
    var result = [];
    for (var i = 0; i < checkList.length; i++) {
      var entry = checkList[i];
      var user = entry.user || '';
      var obj = entry.object || '';
      var assertions = entry.assertions || {};
      var rels = Object.keys(assertions);
      for (var j = 0; j < rels.length; j++) {
        result.push({
          user: user,
          relation: rels[j],
          object: obj,
          expected: !!assertions[rels[j]]
        });
      }
    }
    return result;
  }

  /* Load tuples from referenced tuple_file/tuple_files paths. */
  function loadTestTuples(testData, authzDir, files) {
    var tuples = [];
    var refs = [];
    if (testData.tuple_file) refs.push(testData.tuple_file);
    if (testData.tuple_files) {
      for (var i = 0; i < testData.tuple_files.length; i++) {
        refs.push(testData.tuple_files[i]);
      }
    }

    for (var r = 0; r < refs.length; r++) {
      var resolvedPath = resolvePath(authzDir, refs[r]);
      var content = files[resolvedPath];
      if (!content) continue;
      try {
        var data = YamlLite.parse(content);
        if (Array.isArray(data)) {
          for (var j = 0; j < data.length; j++) {
            if (isTupleEntry(data[j])) {
              tuples.push({
                user: String(data[j].user),
                relation: String(data[j].relation),
                object: String(data[j].object)
              });
            }
          }
        }
      } catch (e) {
        // skip unparseable files
      }
    }
    return tuples;
  }

  /* Parse a project zip blob. Returns Promise<{model, tuples, tests, files}>. */
  function parseProjectZip(blob) {
    return ZipReader.extractAll(blob).then(function (files) {
      return processFiles(files);
    });
  }

  /* Process extracted files map into model + tuples + tests. */
  function processFiles(files) {
    var filePaths = Object.keys(files).sort();

    // Find fga.mod
    var fgaModPath = null;
    for (var i = 0; i < filePaths.length; i++) {
      if (filePaths[i].match(/(^|\/?)fga\.mod$/)) {
        fgaModPath = filePaths[i];
        break;
      }
    }

    var authzDir = fgaModPath ? dirname(fgaModPath) : '';
    var schemaVersion = '1.1';
    var fgaFiles = [];

    if (fgaModPath) {
      var modData = YamlLite.parse(files[fgaModPath]);
      schemaVersion = String((modData && modData.schema) || '1.1');
      var contents = (modData && modData.contents) || [];
      for (var c = 0; c < contents.length; c++) {
        var fgaPath = authzDir ? authzDir + '/' + contents[c] : contents[c];
        if (files[fgaPath]) {
          fgaFiles.push([contents[c], files[fgaPath]]);
        }
      }
    } else {
      // No fga.mod: collect all .fga files
      for (var f = 0; f < filePaths.length; f++) {
        if (filePaths[f].match(/\.fga$/)) {
          fgaFiles.push([filePaths[f], files[filePaths[f]]]);
        }
      }
    }

    // Parse model
    var model;
    if (fgaFiles.length > 0) {
      model = FgaParser.parseFgaFiles(fgaFiles, schemaVersion);
    } else {
      model = { schema_version: '1.1', type_definitions: [{ type: 'user' }] };
    }

    // Collect tuples from tuples/ directory
    var tuples = [];
    var tuplesPrefix = authzDir ? authzDir + '/tuples/' : 'tuples/';
    for (var tp = 0; tp < filePaths.length; tp++) {
      var tPath = filePaths[tp];
      if (tPath.indexOf(tuplesPrefix) === 0 && tPath.match(/\.ya?ml$/)) {
        try {
          var tData = YamlLite.parse(files[tPath]);
          if (Array.isArray(tData)) {
            for (var te = 0; te < tData.length; te++) {
              if (isTupleEntry(tData[te])) {
                tuples.push({
                  user: String(tData[te].user),
                  relation: String(tData[te].relation),
                  object: String(tData[te].object)
                });
              }
            }
          }
        } catch (e) {
          // skip
        }
      }
    }

    // Collect tests from tests/ directory
    var tests = [];
    var testsPrefix = authzDir ? authzDir + '/tests/' : 'tests/';
    for (var ts = 0; ts < filePaths.length; ts++) {
      var tsPath = filePaths[ts];
      if (tsPath.indexOf(testsPrefix) === 0 && tsPath.match(/\.ya?ml$/)) {
        try {
          var tsData = YamlLite.parse(files[tsPath]);
          if (tsData && typeof tsData === 'object' && tsData.tests) {
            var fileTuples = loadTestTuples(tsData, authzDir ? authzDir + '/tests' : 'tests', files);
            var testBlocks = tsData.tests;
            for (var tb = 0; tb < testBlocks.length; tb++) {
              var block = testBlocks[tb];
              var testName = tsData.name || stem(tsPath);
              var blockName = block.name || '';
              var fullName = testName;
              if (blockName) fullName += ' / ' + blockName;

              var blockTuples = [];
              if (block.tuples) {
                for (var bt = 0; bt < block.tuples.length; bt++) {
                  if (isTupleEntry(block.tuples[bt])) {
                    blockTuples.push({
                      user: String(block.tuples[bt].user),
                      relation: String(block.tuples[bt].relation),
                      object: String(block.tuples[bt].object)
                    });
                  }
                }
              }

              var checks = flattenChecks(block.check);
              tests.push({
                name: fullName,
                source: 'project',
                checks: checks,
                extraTuples: fileTuples.concat(blockTuples)
              });
            }
          }
        } catch (e) {
          // skip
        }
      }
    }

    return {
      model: model,
      tuples: tuples,
      tests: tests,
      files: filePaths
    };
  }

  return { parseProjectZip: parseProjectZip };
})();
