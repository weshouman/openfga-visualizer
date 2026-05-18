/* Color mode system: type, relation, or user-based coloring */

var ColorModes = (function () {
  var PALETTE = ['amber', 'teal', 'rose', 'blue', 'purple', 'orange', 'lime', 'green'];

  var HEX_MAP = {
    amber:  '#c9a96e',
    teal:   '#5fc4d4',
    rose:   '#c97a6f',
    blue:   '#6ea0c9',
    purple: '#a06ec9',
    orange: '#c98a6e',
    lime:   '#a0c96e',
    green:  '#6ec98a'
  };

  var current = 'type';
  var typeColors = {};
  var relationColors = {};
  var userColors = {};

  function buildPalette(model, tuples) {
    typeColors = {};
    relationColors = {};
    userColors = {};

    // Assign colors to types
    var typeNames = Object.keys(model);
    for (var i = 0; i < typeNames.length; i++) {
      typeColors[typeNames[i]] = PALETTE[i % PALETTE.length];
    }

    // Assign colors to relations
    var relSeen = {};
    var relIdx = 0;
    for (var t = 0; t < typeNames.length; t++) {
      var rels = Object.keys(model[typeNames[t]].relations);
      for (var r = 0; r < rels.length; r++) {
        if (!relSeen[rels[r]]) {
          relSeen[rels[r]] = true;
          relationColors[rels[r]] = PALETTE[relIdx % PALETTE.length];
          relIdx++;
        }
      }
    }

    // Assign colors to user entities
    var userSeen = {};
    var userIdx = 0;
    for (var j = 0; j < tuples.length; j++) {
      var u = tuples[j].user;
      if (u.indexOf(':') !== -1 && u.indexOf('#') === -1 && !userSeen[u]) {
        userSeen[u] = true;
        userColors[u] = PALETTE[userIdx % PALETTE.length];
        userIdx++;
      }
    }
  }

  function getTypeColor(typeName) {
    return typeColors[typeName] || 'amber';
  }

  function getRelationColor(relationName) {
    return relationColors[relationName] || 'amber';
  }

  function getUserColor(userKey) {
    return userColors[userKey] || 'amber';
  }

  function getNodeColor(entityKey) {
    if (current === 'user') {
      if (entityKey.indexOf('#') === -1 && entityKey.startsWith('user:')) {
        return getUserColor(entityKey);
      }
      return 'amber';
    }
    var typeName = getTypeFromRef(entityKey);
    return getTypeColor(typeName);
  }

  function getNodeColorHex(entityKey) {
    return HEX_MAP[getNodeColor(entityKey)] || HEX_MAP.amber;
  }

  function getEdgeColor(tuple) {
    if (current === 'relation') {
      return HEX_MAP[getRelationColor(tuple.relation)] || HEX_MAP.amber;
    }
    if (current === 'user') {
      var userKey = tuple.user;
      if (userKey.indexOf('#') !== -1) {
        userKey = userKey.substring(0, userKey.indexOf('#'));
      }
      if (userKey.startsWith('user:')) {
        return HEX_MAP[getUserColor(userKey)] || HEX_MAP.amber;
      }
      return HEX_MAP.amber;
    }
    // Default: color by target type
    var objType = getTypeFromRef(tuple.object);
    return HEX_MAP[getTypeColor(objType)] || HEX_MAP.amber;
  }

  function getEdgeLabelColor(tuple) {
    return getEdgeColor(tuple);
  }

  function getTupleUserColor(tuple) {
    if (current === 'user') {
      var userKey = tuple.user;
      if (userKey.indexOf('#') !== -1) {
        userKey = userKey.substring(0, userKey.indexOf('#'));
      }
      return getUserColor(userKey.startsWith('user:') ? userKey : getTypeFromRef(userKey));
    }
    if (current === 'relation') {
      return getRelationColor(tuple.relation);
    }
    return getTypeColor(getTypeFromRef(tuple.user));
  }

  function getTupleObjectColor(tuple) {
    if (current === 'relation') {
      return getRelationColor(tuple.relation);
    }
    return getTypeColor(getTypeFromRef(tuple.object));
  }

  function setMode(mode) {
    current = mode;
  }

  function getMode() {
    return current;
  }

  return {
    buildPalette: buildPalette,
    getTypeColor: getTypeColor,
    getRelationColor: getRelationColor,
    getUserColor: getUserColor,
    getNodeColor: getNodeColor,
    getNodeColorHex: getNodeColorHex,
    getEdgeColor: getEdgeColor,
    getEdgeLabelColor: getEdgeLabelColor,
    getTupleUserColor: getTupleUserColor,
    getTupleObjectColor: getTupleObjectColor,
    setMode: setMode,
    getMode: getMode,
    HEX_MAP: HEX_MAP
  };
})();
