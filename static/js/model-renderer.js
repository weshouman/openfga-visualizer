/* Renders the authorization model as DSL-like type cards.
   Also provides highlightModelRelations() for check result highlighting. */

function renderChildNode(child) {
  if (child.kind === 'direct') return null; // rendered separately via allowedTypes
  if (child.kind === 'computed') {
    return '<span class="rel-ref">' + child.relation + '</span>';
  }
  if (child.kind === 'tupleToUserset') {
    return '<span class="rel-ref">' + child.computedUserset + '</span>' +
      ' <span class="keyword">from</span> ' +
      '<span class="rel-ref">' + child.tupleset + '</span>';
  }
  return null;
}

function renderUnionChildren(rel) {
  var parts = [];
  // Check if there are direct types in the union
  if (rel.allowedTypes.length > 0) {
    var typeRefs = [];
    for (var t = 0; t < rel.allowedTypes.length; t++) {
      typeRefs.push('<span class="type-ref">' + rel.allowedTypes[t] + '</span>');
    }
    parts.push('[' + typeRefs.join(', ') + ']');
  }
  for (var k = 0; k < rel.children.length; k++) {
    var rendered = renderChildNode(rel.children[k]);
    if (rendered) parts.push(rendered);
  }
  return parts.join(' <span class="keyword">or</span> ');
}

function renderModel(model, container) {
  container.innerHTML = '';
  var typeNames = Object.keys(model);

  for (var i = 0; i < typeNames.length; i++) {
    var typeName = typeNames[i];
    var typeDef = model[typeName];
    var color = getTypeColor(typeName);

    var card = document.createElement('div');
    card.className = 'type-card';
    card.setAttribute('data-type', typeName);

    var header = document.createElement('div');
    header.className = 'type-card-header color-' + color;
    header.innerHTML = '<span class="keyword">type</span> ' + typeName;
    card.appendChild(header);

    var relNames = Object.keys(typeDef.relations);
    if (relNames.length > 0) {
      var relSection = document.createElement('div');
      relSection.className = 'type-card-relations';

      var relLabel = document.createElement('div');
      relLabel.className = 'relations-label';
      relLabel.textContent = 'relations';
      relSection.appendChild(relLabel);

      for (var j = 0; j < relNames.length; j++) {
        var rName = relNames[j];
        var rel = typeDef.relations[rName];

        var line = document.createElement('div');
        line.className = 'relation-line';
        line.setAttribute('data-relation', rName);

        var html = '<span class="keyword">define</span> ';
        html += '<span class="rel-name">' + rName + '</span>';
        html += '<span class="rel-sep">:</span> ';

        if (rel.kind === 'union') {
          html += renderUnionChildren(rel);
        } else if (rel.kind === 'computed') {
          html += '<span class="rel-ref">' + rel.computedRelation + '</span>';
        } else if (rel.kind === 'tupleToUserset') {
          html += '<span class="rel-ref">' + rel.computedUserset + '</span>';
          html += ' <span class="keyword">from</span> ';
          html += '<span class="rel-ref">' + rel.tupleset + '</span>';
        } else if (rel.allowedTypes.length > 0) {
          var typeRefs = [];
          for (var t = 0; t < rel.allowedTypes.length; t++) {
            typeRefs.push('<span class="type-ref">' + rel.allowedTypes[t] + '</span>');
          }
          html += '[' + typeRefs.join(', ') + ']';
        }

        line.innerHTML = html;
        relSection.appendChild(line);
      }

      card.appendChild(relSection);
    }

    container.appendChild(card);
  }
}

/* Highlight model relations based on check result */
function highlightModelRelations(highlights) {
  // Clear existing highlights
  var cards = document.querySelectorAll('.type-card.highlighted');
  for (var i = 0; i < cards.length; i++) {
    cards[i].classList.remove('highlighted');
  }
  var lines = document.querySelectorAll('.relation-line.highlighted, .relation-line.highlight-direct, .relation-line.highlight-union, .relation-line.highlight-userset');
  for (var j = 0; j < lines.length; j++) {
    lines[j].classList.remove('highlighted', 'highlight-direct', 'highlight-union', 'highlight-userset');
  }

  if (!highlights || highlights.length === 0) return;

  for (var h = 0; h < highlights.length; h++) {
    var hl = highlights[h];
    var card = document.querySelector('.type-card[data-type="' + hl.type + '"]');
    if (card) {
      card.classList.add('highlighted');
      var line = card.querySelector('.relation-line[data-relation="' + hl.relation + '"]');
      if (line) {
        line.classList.add('highlighted');
        if (hl.reason === 'direct') {
          line.classList.add('highlight-direct');
        } else if (hl.reason === 'union') {
          line.classList.add('highlight-union');
        } else if (hl.reason === 'userset') {
          line.classList.add('highlight-userset');
        }
      }
    }
  }
}
