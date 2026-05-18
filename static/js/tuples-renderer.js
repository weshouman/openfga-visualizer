/* Renders relationship tuples grouped by object type.
   Group order is derived dynamically from the data. */

function renderTuples(tuples, container, countEl) {
  container.innerHTML = '';
  if (countEl) {
    countEl.textContent = tuples.length + ' tuples';
  }

  var groups = {};
  var groupOrder = [];
  for (var i = 0; i < tuples.length; i++) {
    var t = tuples[i];
    var objType = getTypeFromRef(t.object);
    if (!groups[objType]) {
      groups[objType] = [];
      groupOrder.push(objType);
    }
    groups[objType].push({ tuple: t, index: i });
  }

  // Sort group order alphabetically for stability
  groupOrder.sort();

  for (var g = 0; g < groupOrder.length; g++) {
    var gName = groupOrder[g];
    var items = groups[gName];
    if (!items) continue;

    var group = document.createElement('div');
    group.className = 'tuple-group';

    var groupLabel = document.createElement('div');
    groupLabel.className = 'tuple-group-label color-' + getTypeColor(gName);
    groupLabel.textContent = gName;
    group.appendChild(groupLabel);

    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      var row = document.createElement('div');
      row.className = 'tuple-row';
      row.setAttribute('data-tuple-index', item.index);

      var userColor = ColorModes.getTupleUserColor(item.tuple);
      var objColor = ColorModes.getTupleObjectColor(item.tuple);

      row.innerHTML =
        '<span class="tuple-user color-' + userColor + '">' + item.tuple.user + '</span>' +
        '<span class="tuple-verb"> is a </span>' +
        '<span class="tuple-relation">' + item.tuple.relation + '</span>' +
        '<span class="tuple-verb"> of </span>' +
        '<span class="tuple-object color-' + objColor + '">' + item.tuple.object + '</span>';

      group.appendChild(row);
    }

    container.appendChild(group);
  }
}

function highlightTuples(tupleIndices) {
  var rows = document.querySelectorAll('.tuple-row');
  for (var i = 0; i < rows.length; i++) {
    rows[i].classList.remove('highlighted');
  }
  for (var j = 0; j < tupleIndices.length; j++) {
    var row = document.querySelector('.tuple-row[data-tuple-index="' + tupleIndices[j] + '"]');
    if (row) {
      row.classList.add('highlighted');
    }
  }
}
