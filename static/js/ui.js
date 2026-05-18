/* UI wiring: dropdowns, check button, result display, highlighting */

function initCheckUI(model, tuples, checkPanel) {
  var engine = createCheckEngine(model, tuples);

  var userSelect = document.getElementById('check-user');
  var relationSelect = document.getElementById('check-relation');
  var objectSelect = document.getElementById('check-object');
  var checkBtn = document.getElementById('check-btn');
  var resultDiv = document.getElementById('check-result');

  // Populate user dropdown: all user:X from tuples
  var users = [];
  var usersSeen = {};
  for (var i = 0; i < tuples.length; i++) {
    var u = tuples[i].user;
    if (u.startsWith('user:') && !usersSeen[u]) {
      users.push(u);
      usersSeen[u] = true;
    }
  }
  users.sort();
  populateSelect(userSelect, users);

  // Populate relation dropdown: all meaningful relations
  var relations = [];
  var relSeen = {};
  var typeNames = Object.keys(model);
  for (var t = 0; t < typeNames.length; t++) {
    var rels = Object.keys(model[typeNames[t]].relations);
    for (var r = 0; r < rels.length; r++) {
      if (!relSeen[rels[r]]) {
        relations.push(rels[r]);
        relSeen[rels[r]] = true;
      }
    }
  }
  relations.sort();
  populateSelect(relationSelect, relations);

  // Populate object dropdown: all distinct objects from tuples
  var objects = [];
  var objSeen = {};
  for (var j = 0; j < tuples.length; j++) {
    var obj = tuples[j].object;
    if (!objSeen[obj]) {
      objects.push(obj);
      objSeen[obj] = true;
    }
  }
  objects.sort();
  populateSelect(objectSelect, objects);

  // Set smart defaults: first user, prefer a computed relation (like 'view'), first object
  if (users.length > 0) {
    setSelectValue(userSelect, 'user:new.bot') || (userSelect.selectedIndex = 0);
  }
  // Prefer 'view' as it demonstrates union resolution
  if (!setSelectValue(relationSelect, 'view')) {
    relationSelect.selectedIndex = 0;
  }
  if (objects.length > 0) {
    setSelectValue(objectSelect, 'project:atlas') || (objectSelect.selectedIndex = 0);
  }

  // Replace the check button to remove old event listeners
  var newBtn = checkBtn.cloneNode(true);
  checkBtn.parentNode.replaceChild(newBtn, checkBtn);
  newBtn.addEventListener('click', function () {
    runCheck(engine);
  });

  // Run default check on load
  runCheck(engine);
}

function populateSelect(select, values) {
  select.innerHTML = '';
  for (var i = 0; i < values.length; i++) {
    var opt = document.createElement('option');
    opt.value = values[i];
    opt.textContent = values[i];
    select.appendChild(opt);
  }
}

function setSelectValue(select, value) {
  for (var i = 0; i < select.options.length; i++) {
    if (select.options[i].value === value) {
      select.selectedIndex = i;
      return true;
    }
  }
  return false;
}

function runCheck(engine) {
  var user = document.getElementById('check-user').value;
  var relation = document.getElementById('check-relation').value;
  var object = document.getElementById('check-object').value;
  var resultDiv = document.getElementById('check-result');

  if (!user || !relation || !object) {
    resultDiv.innerHTML = '';
    return;
  }

  var result = engine.check(user, relation, object);

  var html = '';

  if (result.allowed) {
    html += '<span class="result-badge allowed">Allowed</span>';
  } else {
    html += '<span class="result-badge denied">Denied</span>';
  }

  if (result.path.length > 0) {
    html += '<div class="result-path">';
    for (var i = 0; i < result.path.length; i++) {
      var step = result.path[i];
      var stepClass = 'path-step';
      if (step.kind === 'direct') stepClass += ' step-direct';
      else if (step.kind === 'team') stepClass += ' step-team';
      else if (step.kind === 'union') stepClass += ' step-union';
      html += '<div class="' + stepClass + '">' + escapeHtml(step.text) + '</div>';
    }
    html += '</div>';
  }

  resultDiv.innerHTML = html;

  // Highlight matching tuples, graph edges, and model relations
  highlightTuples(result.tupleIndices);
  highlightGraphEdges(result.tupleIndices);
  highlightModelRelations(result.modelHighlights);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
