/* Column-based auto-layout for the relationship graph.
   Classifies entities into columns (sources, intermediates, targets)
   and distributes them vertically. */

function computeGraphLayout(model, tuples) {
  var NODE_W = 130;
  var NODE_H = 30;
  var COL_GAP = 200;
  var ROW_GAP = 70;
  var PAD_X = 40;
  var PAD_Y = 40;

  // Collect all unique entities from tuples
  var entities = {};
  for (var i = 0; i < tuples.length; i++) {
    var t = tuples[i];
    var userKey = t.user;
    // Normalize team#member references to the team entity
    if (userKey.indexOf('#') !== -1) {
      userKey = userKey.substring(0, userKey.indexOf('#'));
    }
    if (!entities[userKey]) {
      entities[userKey] = { asSource: true, asTarget: false, type: getTypeFromRef(userKey) };
    } else {
      entities[userKey].asSource = true;
    }

    var objKey = t.object;
    if (!entities[objKey]) {
      entities[objKey] = { asSource: false, asTarget: true, type: getTypeFromRef(objKey) };
    } else {
      entities[objKey].asTarget = true;
    }
  }

  // Also add types from model that have no relations (like 'user' type)
  // if they appear as entities
  var typeNames = Object.keys(model);
  for (var ti = 0; ti < typeNames.length; ti++) {
    var tn = typeNames[ti];
    // Check if any entity of this type exists
    var found = false;
    var eKeys = Object.keys(entities);
    for (var ei = 0; ei < eKeys.length; ei++) {
      if (entities[eKeys[ei]].type === tn) { found = true; break; }
    }
    // If no entities for a type with no relations, skip it (e.g. 'user' type base)
  }

  // Classify into columns based on source/target roles
  // Column 0: pure sources (only appear as user, never as object)
  // Column 2: pure targets (only appear as object, never as source)
  // Column 1: intermediates (appear as both)
  var columns = [[], [], []];
  var entityKeys = Object.keys(entities);

  for (var k = 0; k < entityKeys.length; k++) {
    var key = entityKeys[k];
    var e = entities[key];
    if (e.asSource && !e.asTarget) {
      columns[0].push(key);
    } else if (!e.asSource && e.asTarget) {
      columns[2].push(key);
    } else {
      columns[1].push(key);
    }
  }

  // If middle column is empty but right column has items that are also sources,
  // redistribute: move items that are both source and target to middle
  if (columns[1].length === 0 && columns[2].length > 0) {
    var newRight = [];
    for (var r = 0; r < columns[2].length; r++) {
      var rKey = columns[2][r];
      if (entities[rKey].asSource) {
        columns[1].push(rKey);
      } else {
        newRight.push(rKey);
      }
    }
    columns[2] = newRight;
  }

  // Sort within columns alphabetically for stability
  for (var c = 0; c < columns.length; c++) {
    columns[c].sort();
  }

  // Remove empty columns
  var activeCols = [];
  for (var ac = 0; ac < columns.length; ac++) {
    if (columns[ac].length > 0) {
      activeCols.push(columns[ac]);
    }
  }

  // If only one column (degenerate case), just stack everything
  if (activeCols.length === 0) {
    return { nodes: {}, width: 300, height: 200 };
  }

  // Compute positions
  var maxRows = 0;
  for (var mc = 0; mc < activeCols.length; mc++) {
    if (activeCols[mc].length > maxRows) maxRows = activeCols[mc].length;
  }

  var width = PAD_X * 2 + (activeCols.length - 1) * COL_GAP + NODE_W;
  var height = PAD_Y * 2 + (maxRows - 1) * ROW_GAP + NODE_H;
  if (height < 200) height = 200;

  var nodes = {};
  for (var col = 0; col < activeCols.length; col++) {
    var colEntities = activeCols[col];
    var x = PAD_X + col * COL_GAP;
    var colHeight = (colEntities.length - 1) * ROW_GAP;
    var startY = PAD_Y + (height - PAD_Y * 2 - colHeight) / 2;
    if (startY < PAD_Y) startY = PAD_Y;

    for (var row = 0; row < colEntities.length; row++) {
      var eKey = colEntities[row];
      var label = eKey;
      // Shorten label: remove type prefix for user entities
      if (eKey.startsWith('user:')) {
        label = eKey.substring(5);
      }
      nodes[eKey] = {
        x: x,
        y: startY + row * ROW_GAP,
        label: label,
        type: entities[eKey].type
      };
    }
  }

  return { nodes: nodes, width: width, height: height, nodeW: NODE_W, nodeH: NODE_H };
}
