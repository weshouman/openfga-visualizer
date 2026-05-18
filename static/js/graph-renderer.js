/* SVG layered graph renderer for relationship tuples.
   Uses computeGraphLayout() for dynamic node positioning
   and ColorModes for edge/node coloring. */

function renderGraph(model, tuples, container) {
  var layout = computeGraphLayout(model, tuples);
  var nodes = layout.nodes;
  var W = layout.width;
  var H = layout.height;
  var nodeW = layout.nodeW || 130;
  var nodeH = layout.nodeH || 30;

  function svgEl(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  var svg = svgEl('svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.id = 'relationship-graph';

  // Edges group (behind nodes)
  var edgesG = svgEl('g');
  edgesG.setAttribute('class', 'graph-edges');
  svg.appendChild(edgesG);

  // Nodes group
  var nodesG = svgEl('g');
  nodesG.setAttribute('class', 'graph-nodes');
  svg.appendChild(nodesG);

  // Draw edges
  for (var i = 0; i < tuples.length; i++) {
    var t = tuples[i];
    var fromKey = t.user;
    var toKey = t.object;

    // For team#member references, connect from the team node
    if (fromKey.indexOf('#') !== -1) {
      fromKey = fromKey.substring(0, fromKey.indexOf('#'));
    }

    var fromNode = nodes[fromKey];
    var toNode = nodes[toKey];
    if (!fromNode || !toNode) continue;

    var x1 = fromNode.x + nodeW;
    var y1 = fromNode.y + nodeH / 2;
    var x2 = toNode.x;
    var y2 = toNode.y + nodeH / 2;

    // Bezier control points
    var cx = (x1 + x2) / 2;
    var offset = (i % 3 - 1) * 8;

    var edgeColor = ColorModes.getEdgeColor(t);

    var path = svgEl('path');
    path.setAttribute('d',
      'M ' + x1 + ' ' + y1 +
      ' C ' + cx + ' ' + (y1 + offset) + ', ' + cx + ' ' + (y2 + offset) + ', ' + x2 + ' ' + y2
    );
    path.setAttribute('class', 'graph-edge');
    path.setAttribute('data-edge-index', i);
    path.setAttribute('data-from', fromKey);
    path.setAttribute('data-to', toKey);
    path.setAttribute('stroke', edgeColor);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-width', '1.5');
    edgesG.appendChild(path);

    // Edge label
    var mx = (x1 + x2) / 2;
    var my = (y1 + y2) / 2 + offset;
    var label = svgEl('text');
    label.setAttribute('x', mx);
    label.setAttribute('y', my - 6);
    label.setAttribute('class', 'graph-edge-label');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', edgeColor);
    label.textContent = t.relation;
    edgesG.appendChild(label);
  }

  // Draw nodes
  var nodeKeys = Object.keys(nodes);
  for (var n = 0; n < nodeKeys.length; n++) {
    var key = nodeKeys[n];
    var nd = nodes[key];
    var color = ColorModes.getNodeColorHex(key);

    var g = svgEl('g');
    g.setAttribute('class', 'graph-node');
    g.setAttribute('data-node', key);

    var rect = svgEl('rect');
    rect.setAttribute('x', nd.x);
    rect.setAttribute('y', nd.y);
    rect.setAttribute('width', nodeW);
    rect.setAttribute('height', nodeH);
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', '#2a2826');
    rect.setAttribute('stroke', color);
    rect.setAttribute('stroke-width', '1.5');
    g.appendChild(rect);

    var text = svgEl('text');
    text.setAttribute('x', nd.x + nodeW / 2);
    text.setAttribute('y', nd.y + nodeH / 2 + 4);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#f0ece4');
    text.setAttribute('class', 'graph-node-label');
    text.textContent = nd.label;
    g.appendChild(text);

    nodesG.appendChild(g);
  }

  container.innerHTML = '';
  container.appendChild(svg);
}

function highlightGraphEdges(tupleIndices) {
  var edges = document.querySelectorAll('.graph-edge');
  var labels = document.querySelectorAll('.graph-edge-label');
  var nodes = document.querySelectorAll('.graph-node');
  var edgesG = document.querySelector('.graph-edges');
  var nodesG = document.querySelector('.graph-nodes');

  // Clear all highlights
  for (var i = 0; i < edges.length; i++) edges[i].classList.remove('highlighted');
  for (var i = 0; i < labels.length; i++) labels[i].classList.remove('highlighted');
  for (var i = 0; i < nodes.length; i++) nodes[i].classList.remove('highlighted');

  var hasHighlight = tupleIndices && tupleIndices.length > 0;

  if (edgesG) edgesG.classList.toggle('has-highlight', hasHighlight);
  if (nodesG) nodesG.classList.toggle('has-highlight', hasHighlight);

  if (!hasHighlight) return;

  // Highlight matching edges and their labels, collect connected node keys
  var connectedNodes = {};
  for (var j = 0; j < tupleIndices.length; j++) {
    var idx = tupleIndices[j];
    var edge = document.querySelector('.graph-edge[data-edge-index="' + idx + '"]');
    if (edge) {
      edge.classList.add('highlighted');
      // The label follows the edge in DOM order (path then text)
      var label = edge.nextElementSibling;
      if (label && label.classList.contains('graph-edge-label')) {
        label.classList.add('highlighted');
      }
      // Collect connected nodes from data attributes
      var fromNode = edge.getAttribute('data-from');
      var toNode = edge.getAttribute('data-to');
      if (fromNode) connectedNodes[fromNode] = true;
      if (toNode) connectedNodes[toNode] = true;
    }
  }

  // Highlight connected nodes
  for (var n = 0; n < nodes.length; n++) {
    var nodeKey = nodes[n].getAttribute('data-node');
    if (connectedNodes[nodeKey]) {
      nodes[n].classList.add('highlighted');
    }
  }
}
