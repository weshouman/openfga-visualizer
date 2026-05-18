/* Client-side OpenFGA check engine.
   Evaluates access checks by traversing tuples and the authorization model.
   Returns modelHighlights for highlighting relevant relations in the model panel. */

function createCheckEngine(model, tuples) {
  var DENIED = { allowed: false, path: [], tupleIndices: [], modelHighlights: [] };

  function findDirectTuple(user, relation, object) {
    for (var i = 0; i < tuples.length; i++) {
      var t = tuples[i];
      if (t.user === user && t.relation === relation && t.object === object) {
        return i;
      }
    }
    return -1;
  }

  /* Find all tuples where the given relation points from object to some target.
     Used for tupleToUserset: e.g. find what "parent" of document:roadmap is. */
  function findTupleTargets(relation, object) {
    var targets = [];
    for (var i = 0; i < tuples.length; i++) {
      var t = tuples[i];
      if (t.relation === relation && t.object === object) {
        targets.push({ target: t.user, index: i });
      }
    }
    return targets;
  }

  /* Find all groups/teams the user is a member of (any relation). */
  function findUsersets(userStr) {
    var results = [];
    for (var i = 0; i < tuples.length; i++) {
      var t = tuples[i];
      if (t.user === userStr) {
        results.push({ object: t.object, relation: t.relation, index: i });
      }
    }
    return results;
  }

  /* Try to resolve a direct tuple match, including userset expansion.
     e.g. user:bob -> team:x#member -> tuple(team:x#member, relation, object) */
  function checkDirect(userStr, relation, objectStr, objectType, depth) {
    // Direct tuple match
    var directIdx = findDirectTuple(userStr, relation, objectStr);
    if (directIdx !== -1) {
      return {
        allowed: true,
        path: [{ kind: 'direct', text: userStr + ' is ' + relation + ' of ' + objectStr }],
        tupleIndices: [directIdx],
        modelHighlights: [{ type: objectType, relation: relation, reason: 'direct' }]
      };
    }

    // Expand via userset: user:X is member of group:Y, and group:Y#member has the tuple
    if (userStr.indexOf('#') === -1) {
      var usersets = findUsersets(userStr);
      for (var m = 0; m < usersets.length; m++) {
        var ref = usersets[m].object + '#' + usersets[m].relation;
        var refIdx = findDirectTuple(ref, relation, objectStr);
        if (refIdx !== -1) {
          var refType = getTypeFromRef(usersets[m].object);
          return {
            allowed: true,
            path: [
              { kind: 'team', text: userStr + ' is ' + usersets[m].relation + ' of ' + usersets[m].object },
              { kind: 'direct', text: ref + ' is ' + relation + ' of ' + objectStr }
            ],
            tupleIndices: [usersets[m].index, refIdx],
            modelHighlights: [
              { type: refType, relation: usersets[m].relation, reason: 'userset' },
              { type: objectType, relation: relation, reason: 'direct' }
            ]
          };
        }
      }
    }

    return null;
  }

  /* Resolve a tupleToUserset: e.g. "editor from parent" on document:roadmap
     means: find parent of document:roadmap (folder:engineering),
     then check if user is editor of folder:engineering. */
  function checkTupleToUserset(userStr, tupleset, computedRel, objectStr, objectType, relation, depth) {
    var targets = findTupleTargets(tupleset, objectStr);
    for (var i = 0; i < targets.length; i++) {
      var target = targets[i].target;
      var sub = check(userStr, computedRel, target, depth + 1);
      if (sub.allowed) {
        sub.path.push({
          kind: 'team',
          text: computedRel + ' from ' + tupleset + ': ' + objectStr + ' -> ' + target
        });
        sub.tupleIndices.push(targets[i].index);
        sub.modelHighlights.push({ type: objectType, relation: relation, reason: 'userset' });
        return sub;
      }
    }
    return null;
  }

  /* Evaluate a single union child descriptor against the query. */
  function checkChild(child, userStr, relation, objectStr, objectType, depth) {
    if (child.kind === 'direct') {
      return checkDirect(userStr, relation, objectStr, objectType, depth);
    }
    if (child.kind === 'computed') {
      var sub = check(userStr, child.relation, objectStr, depth + 1);
      if (sub.allowed) {
        sub.modelHighlights.push({ type: objectType, relation: child.relation, reason: 'direct' });
        return sub;
      }
      return null;
    }
    if (child.kind === 'tupleToUserset') {
      return checkTupleToUserset(
        userStr, child.tupleset, child.computedUserset,
        objectStr, objectType, relation, depth
      );
    }
    return null;
  }

  function check(userStr, relation, objectStr, depth) {
    if (depth === undefined) depth = 0;
    if (depth > 15) return DENIED;

    var objectType = getTypeFromRef(objectStr);
    var typeDef = model[objectType];

    if (!typeDef || !typeDef.relations[relation]) {
      return DENIED;
    }

    var relDef = typeDef.relations[relation];

    // Union: try each child
    if (relDef.kind === 'union') {
      for (var c = 0; c < relDef.children.length; c++) {
        var result = checkChild(relDef.children[c], userStr, relation, objectStr, objectType, depth);
        if (result && result.allowed) {
          result.modelHighlights.push({ type: objectType, relation: relation, reason: 'union' });
          return result;
        }
      }
      return DENIED;
    }

    // Computed userset: e.g. can_share -> owner
    if (relDef.kind === 'computed') {
      var sub = check(userStr, relDef.computedRelation, objectStr, depth + 1);
      if (sub.allowed) {
        sub.path.push({
          kind: 'union',
          text: relation + ' resolves via ' + relDef.computedRelation
        });
        sub.modelHighlights.push({ type: objectType, relation: relation, reason: 'union' });
        return sub;
      }
      return DENIED;
    }

    // TupleToUserset at top level
    if (relDef.kind === 'tupleToUserset') {
      var ttu = checkTupleToUserset(
        userStr, relDef.tupleset, relDef.computedUserset,
        objectStr, objectType, relation, depth
      );
      if (ttu) return ttu;
      return DENIED;
    }

    // Direct: check direct tuple + userset expansion
    var direct = checkDirect(userStr, relation, objectStr, objectType, depth);
    if (direct) return direct;

    return DENIED;
  }

  return { check: check };
}
