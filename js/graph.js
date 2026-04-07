// ── Node color config ──────────────────────────────────────────────────────
const NODE_COLORS = {
  js:      { background: '#F5E642', border: '#C8BB00', highlight: { background: '#FFF176', border: '#F9A825' } },
  ts:      { background: '#4287F5', border: '#1A5FCC', highlight: { background: '#82B1FF', border: '#2979FF' } },
  html:    { background: '#E67E22', border: '#CA6F1E', highlight: { background: '#FFCC80', border: '#EF6C00' } },
  css:     { background: '#9B59B6', border: '#7D3C98', highlight: { background: '#CE93D8', border: '#7B1FA2' } },
  md:      { background: '#2ECC71', border: '#1A9450', highlight: { background: '#A5D6A7', border: '#2E7D32' } },
  json:    { background: '#EC407A', border: '#C2185B', highlight: { background: '#F48FB1', border: '#AD1457' } },
  py:      { background: '#26C6DA', border: '#00838F', highlight: { background: '#80DEEA', border: '#006064' } },
  session: { background: '#FF6B35', border: '#E64A19', highlight: { background: '#FFAB91', border: '#BF360C' } },
  other:   { background: '#546E7A', border: '#37474F', highlight: { background: '#90A4AE', border: '#455A64' } },
};

const EDGE_COLORS = {
  'import':     { color: '#484f58', highlight: '#8b949e', hover: '#8b949e' },
  'claude-edit': { color: '#FF6B35', highlight: '#FF9A76', hover: '#FF9A76' },
};

let network = null;
let nodesDataset = null;
let edgesDataset = null;
let allGraphData = null;
let showAllFiles = false;
let selectedProject = 'all';

function toVisNode(node) {
  const color = NODE_COLORS[node.type] || NODE_COLORS.other;
  const isSession = node.type === 'session';
  const hasClaude = node.claudeEdits && node.claudeEdits.length > 0;

  return {
    id: node.id,
    label: node.label,
    title: buildNodeTooltip(node),
    color,
    shape: isSession ? 'star' : (hasClaude ? 'dot' : 'dot'),
    size: isSession ? 16 : (hasClaude ? 12 : 8),
    borderWidth: hasClaude ? 2 : 1,
    font: {
      size: isSession ? 9 : 10,
      color: '#c9d1d9',
      face: 'monospace',
    },
    _data: node,
  };
}

function buildNodeTooltip(node) {
  if (node.type === 'session') {
    return `<div style="background:#1c2128;padding:8px;border-radius:6px;font-size:11px;color:#e6edf3;max-width:200px">
      <b>Session</b><br>${node.sessionId}<br>
      <span style="color:#8b949e">${node.lastModified ? new Date(node.lastModified).toLocaleString('ko-KR') : ''}</span>
    </div>`;
  }
  return `<div style="background:#1c2128;padding:8px;border-radius:6px;font-size:11px;color:#e6edf3;max-width:250px">
    <b>${node.label}</b><br>
    <span style="color:#8b949e">${node.project}</span><br>
    <span style="color:#8b949e">${node.lastModified ? new Date(node.lastModified).toLocaleString('ko-KR') : ''}</span>
    ${node.claudeEdits && node.claudeEdits.length > 0 ? `<br><span style="color:#FF6B35">Claude 편집 ${node.claudeEdits.length}회</span>` : ''}
  </div>`;
}

function toVisEdge(edge) {
  const color = EDGE_COLORS[edge.type] || EDGE_COLORS['import'];
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    color,
    width: edge.type === 'claude-edit' ? 2 : 1,
    dashes: edge.type === 'import',
    arrows: { to: { enabled: true, scaleFactor: 0.5 } },
    _data: edge,
  };
}

function filterNodes(data) {
  if (showAllFiles) return data;

  // Default: only show Claude-edited files + session nodes + their 1-hop neighbors
  const claudeEditedIds = new Set();
  for (const node of data.nodes) {
    if ((node.claudeEdits && node.claudeEdits.length > 0) || node.type === 'session') {
      claudeEditedIds.add(node.id);
    }
  }

  // Add 1-hop neighbors via import edges
  const neighborIds = new Set(claudeEditedIds);
  for (const edge of data.edges) {
    if (edge.type === 'import') {
      if (claudeEditedIds.has(edge.from)) neighborIds.add(edge.to);
      if (claudeEditedIds.has(edge.to)) neighborIds.add(edge.from);
    }
  }

  const filteredNodes = data.nodes.filter(n =>
    neighborIds.has(n.id) && (selectedProject === 'all' || n.project === selectedProject)
  );
  const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = data.edges.filter(e =>
    filteredNodeIds.has(e.from) && filteredNodeIds.has(e.to)
  );

  return { ...data, nodes: filteredNodes, edges: filteredEdges };
}

function initGraph(data) {
  allGraphData = data;
  const container = document.getElementById('graph-canvas');

  const filtered = filterNodes(data);
  nodesDataset = new vis.DataSet(filtered.nodes.map(toVisNode));
  edgesDataset = new vis.DataSet(filtered.edges.map(toVisEdge));

  const options = {
    physics: {
      solver: 'forceAtlas2Based',
      forceAtlas2Based: {
        gravitationalConstant: -50,
        centralGravity: 0.005,
        springLength: 120,
        springConstant: 0.08,
        damping: 0.4,
        avoidOverlap: 0.8,
      },
      stabilization: { iterations: 200, fit: true },
    },
    interaction: {
      hover: true,
      tooltipDelay: 100,
      zoomView: true,
      dragView: true,
    },
    nodes: {
      borderWidthSelected: 3,
    },
    edges: {
      smooth: { type: 'continuous', roundness: 0.2 },
      selectionWidth: 2,
    },
  };

  network = new vis.Network(container, { nodes: nodesDataset, edges: edgesDataset }, options);

  network.on('click', (params) => {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      const nodeData = nodesDataset.get(nodeId);
      if (nodeData) {
        window.showSidebar(nodeData._data);
      }
    } else {
      window.closeSidebar();
    }
  });

  network.on('stabilizationIterationsDone', () => {
    network.setOptions({ physics: { enabled: false } });
  });

  updateStats(data);
}

function applyDelta(data) {
  if (!network) {
    initGraph(data);
    return;
  }
  allGraphData = data;
  const filtered = filterNodes(data);

  // Update nodes
  const newNodes = filtered.nodes.map(toVisNode);
  const existingIds = new Set(nodesDataset.getIds());
  const newIds = new Set(newNodes.map(n => n.id));

  // Remove nodes no longer present
  const toRemove = [...existingIds].filter(id => !newIds.has(id));
  if (toRemove.length) nodesDataset.remove(toRemove);

  // Add or update
  nodesDataset.update(newNodes);

  // Update edges
  const newEdges = filtered.edges.map(toVisEdge);
  const existingEdgeIds = new Set(edgesDataset.getIds());
  const newEdgeIds = new Set(newEdges.map(e => e.id));
  const toRemoveEdges = [...existingEdgeIds].filter(id => !newEdgeIds.has(id));
  if (toRemoveEdges.length) edgesDataset.remove(toRemoveEdges);
  edgesDataset.update(newEdges);

  updateStats(data);
  network.setOptions({ physics: { enabled: true } });
  setTimeout(() => network.setOptions({ physics: { enabled: false } }), 2000);
}

function updateStats(data) {
  const el = document.getElementById('stats-text');
  if (el && data.stats) {
    el.textContent = `노드 ${data.nodes.length} · 엣지 ${data.edges.length} · 세션 ${data.stats.totalSessions} · ${new Date(data.stats.buildTime).toLocaleTimeString('ko-KR')} 업데이트`;
  }
}

function setShowAllFiles(val) {
  showAllFiles = val;
  if (allGraphData) applyDelta(allGraphData);
}

function setProjectFilter(project) {
  selectedProject = project;
  if (allGraphData) applyDelta(allGraphData);
}

function fitGraph() {
  if (network) network.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
}
