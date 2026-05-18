/* Data utilities: model parsing and type helpers.
   Config data is loaded from config/default.json at runtime. */

/* Fallback config embedded for file:// usage where fetch() fails */
var DEFAULT_CONFIG = {
  "model": {
    "schema_version": "1.1",
    "type_definitions": [
      { "type": "user" },
      { "type": "team", "relations": { "member": { "this": {} } }, "metadata": { "relations": { "member": { "directly_related_user_types": [{ "type": "user" }] } } } },
      { "type": "system", "relations": { "admin": { "this": {} } }, "metadata": { "relations": { "admin": { "directly_related_user_types": [{ "type": "user" }, { "type": "team", "relation": "member" }] } } } },
      { "type": "project", "relations": { "viewer": { "this": {} }, "editor": { "this": {} }, "admin": { "this": {} }, "view": { "union": { "child": [{ "computedUserset": { "relation": "viewer" } }, { "computedUserset": { "relation": "editor" } }, { "computedUserset": { "relation": "admin" } }] } }, "edit": { "union": { "child": [{ "computedUserset": { "relation": "editor" } }, { "computedUserset": { "relation": "admin" } }] } } }, "metadata": { "relations": { "viewer": { "directly_related_user_types": [{ "type": "user" }, { "type": "team", "relation": "member" }] }, "editor": { "directly_related_user_types": [{ "type": "user" }, { "type": "team", "relation": "member" }] }, "admin": { "directly_related_user_types": [{ "type": "user" }, { "type": "team", "relation": "member" }] } } } }
    ]
  },
  "tuples": [
    { "user": "user:root.user", "relation": "member", "object": "team:admin" },
    { "user": "user:new.bot", "relation": "member", "object": "team:platform" },
    { "user": "user:bob.smith", "relation": "member", "object": "team:admin" },
    { "user": "user:aly.smith", "relation": "member", "object": "team:delivery" },
    { "user": "team:admin#member", "relation": "admin", "object": "system:demo" },
    { "user": "team:admin#member", "relation": "admin", "object": "project:atlas" },
    { "user": "team:admin#member", "relation": "admin", "object": "project:bridge" },
    { "user": "team:platform#member", "relation": "editor", "object": "project:atlas" },
    { "user": "team:platform#member", "relation": "viewer", "object": "project:bridge" },
    { "user": "team:delivery#member", "relation": "viewer", "object": "project:atlas" },
    { "user": "team:delivery#member", "relation": "editor", "object": "project:bridge" }
  ]
};

/* Parse a single rewrite rule node into a child descriptor.
   Returns: { kind: 'direct'|'computed'|'tupleToUserset', relation?, tupleset?, computedUserset? } */
function parseRewriteNode(node) {
  if (node['this'] !== undefined) {
    return { kind: 'direct' };
  }
  if (node.computedUserset) {
    return { kind: 'computed', relation: node.computedUserset.relation };
  }
  if (node.tupleToUserset) {
    return {
      kind: 'tupleToUserset',
      tupleset: node.tupleToUserset.tupleset.relation,
      computedUserset: node.tupleToUserset.computedUserset.relation
    };
  }
  return null;
}

/* Parse the raw model JSON into a lookup structure.
   Returns: { typeName: { relations: { relName: { kind, allowedTypes, children } } } }
   Each relation has kind: 'direct'|'computed'|'tupleToUserset'|'union'
   For kind 'union', children is an array of child descriptors. */
function parseModel(raw) {
  var parsed = {};
  var defs = raw.type_definitions;
  for (var i = 0; i < defs.length; i++) {
    var def = defs[i];
    var typeName = def.type;
    var rels = {};

    if (def.relations) {
      var relNames = Object.keys(def.relations);
      for (var j = 0; j < relNames.length; j++) {
        var rName = relNames[j];
        var rDef = def.relations[rName];
        var rel = { kind: 'direct', allowedTypes: [], children: [] };

        if (rDef.union) {
          rel.kind = 'union';
          var children = rDef.union.child;
          for (var k = 0; k < children.length; k++) {
            var child = parseRewriteNode(children[k]);
            if (child) rel.children.push(child);
          }
        } else if (rDef.computedUserset) {
          rel.kind = 'computed';
          rel.computedRelation = rDef.computedUserset.relation;
        } else if (rDef.tupleToUserset) {
          rel.kind = 'tupleToUserset';
          rel.tupleset = rDef.tupleToUserset.tupleset.relation;
          rel.computedUserset = rDef.tupleToUserset.computedUserset.relation;
        }
        // else: rDef has 'this' -> kind stays 'direct'

        if (def.metadata && def.metadata.relations && def.metadata.relations[rName]) {
          var types = def.metadata.relations[rName].directly_related_user_types;
          if (types) {
            for (var t = 0; t < types.length; t++) {
              var entry = types[t];
              if (entry.relation) {
                rel.allowedTypes.push(entry.type + '#' + entry.relation);
              } else {
                rel.allowedTypes.push(entry.type);
              }
            }
          }
        }

        rels[rName] = rel;
      }
    }

    parsed[typeName] = { relations: rels };
  }
  return parsed;
}

function getTypeColor(typeName) {
  return ColorModes.getTypeColor(typeName);
}

function getTypeFromRef(ref) {
  var colonIdx = ref.indexOf(':');
  if (colonIdx === -1) return ref;
  return ref.substring(0, colonIdx);
}
