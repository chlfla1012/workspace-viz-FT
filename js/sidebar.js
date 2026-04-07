const FILE_TYPE_COLORS = {
  js: '#F5E642', ts: '#4287F5', html: '#E67E22', css: '#9B59B6',
  md: '#2ECC71', json: '#EC407A', py: '#26C6DA', session: '#FF6B35', other: '#546E7A',
};

function showSidebar(nodeData) {
  const sidebar = document.getElementById('sidebar');
  const inner = document.getElementById('sidebar-inner');
  sidebar.classList.add('open');

  if (nodeData.type === 'session') {
    renderSessionSidebar(inner, nodeData);
  } else {
    renderFileSidebar(inner, nodeData);
  }
}

function renderFileSidebar(container, node) {
  const color = FILE_TYPE_COLORS[node.type] || FILE_TYPE_COLORS.other;
  const edits = node.claudeEdits || [];

  // Find import relationships from graph
  let importedBy = [];
  let imports = [];
  if (window.edgesDataset) {
    const allEdges = window.edgesDataset.get();
    for (const edge of allEdges) {
      if (edge._data && edge._data.type === 'import') {
        if (edge._data.from === node.id) imports.push(edge._data.to);
        if (edge._data.to === node.id) importedBy.push(edge._data.from);
      }
    }
  }

  container.innerHTML = `
    <h2>파일 정보 <span id="sidebar-close" onclick="closeSidebar()">✕</span></h2>

    <div class="info-row">
      <div class="info-label">파일명</div>
      <div class="info-value">
        <span class="tag" style="background:${color}22;color:${color};border:1px solid ${color}44">${node.type.toUpperCase()}</span>
        &nbsp;<strong>${node.label}</strong>
      </div>
    </div>

    <div class="info-row">
      <div class="info-label">경로</div>
      <div class="info-value" style="font-size:10px;color:#8b949e">${node.path || node.id}</div>
    </div>

    <div class="info-row">
      <div class="info-label">프로젝트</div>
      <div class="info-value">${node.project}</div>
    </div>

    <div class="info-row">
      <div class="info-label">마지막 수정</div>
      <div class="info-value">${node.lastModified ? new Date(node.lastModified).toLocaleString('ko-KR') : '-'}</div>
    </div>

    <hr class="divider">

    <div class="info-row">
      <div class="info-label">Claude 편집 이력 (${edits.length}회)</div>
      ${edits.length === 0
        ? '<div class="no-data">편집 기록 없음</div>'
        : edits.slice().reverse().slice(0, 10).map(e => `
          <div class="edit-record">
            <span class="tag" style="background:#FF6B3522;color:#FF6B35;border:1px solid #FF6B3544">${e.tool}</span>
            &nbsp;세션 <code style="font-size:10px;color:#79c0ff">${e.sessionId ? e.sessionId.slice(0, 8) : '-'}</code>
            <div class="ts">${e.timestamp ? new Date(e.timestamp).toLocaleString('ko-KR') : '-'}</div>
            ${e.cwd ? `<div class="ts">cwd: ${e.cwd}</div>` : ''}
          </div>
        `).join('')
      }
    </div>

    <hr class="divider">

    <div class="info-row">
      <div class="info-label">Import 관계</div>
      ${imports.length === 0
        ? '<div class="no-data">import 없음</div>'
        : imports.map(f => `<div class="import-item">→ ${f.split('/').slice(-2).join('/')}</div>`).join('')
      }
    </div>

    ${importedBy.length > 0 ? `
    <div class="info-row" style="margin-top:6px">
      <div class="info-label">이 파일을 import 하는 파일</div>
      ${importedBy.map(f => `<div class="import-item">← ${f.split('/').slice(-2).join('/')}</div>`).join('')}
    </div>
    ` : ''}
  `;
}

function renderSessionSidebar(container, node) {
  container.innerHTML = `
    <h2>세션 정보 <span id="sidebar-close" onclick="closeSidebar()">✕</span></h2>

    <div class="info-row">
      <div class="info-label">세션 ID</div>
      <div class="info-value" style="font-size:10px;color:#79c0ff">${node.sessionId}</div>
    </div>

    <div class="info-row">
      <div class="info-label">첫 번째 편집</div>
      <div class="info-value">${node.lastModified ? new Date(node.lastModified).toLocaleString('ko-KR') : '-'}</div>
    </div>

    <hr class="divider">

    <div class="info-label" style="margin-bottom:6px">편집한 파일들</div>
    <div id="session-files" class="no-data">로딩 중...</div>
  `;

  // Find files edited by this session
  if (window.edgesDataset && window.nodesDataset) {
    const sessionId = node.sessionId;
    const sessionNodeId = `session:${sessionId}`;
    const allEdges = window.edgesDataset.get();
    const editedFiles = allEdges
      .filter(e => e._data && e._data.type === 'claude-edit' && e._data.from === sessionNodeId)
      .map(e => {
        const targetNode = window.nodesDataset.get(e._data.to);
        return { path: e._data.to, label: targetNode ? targetNode.label : e._data.to.split('/').pop(), ts: e._data.timestamp };
      });

    const el = document.getElementById('session-files');
    if (el) {
      if (editedFiles.length === 0) {
        el.innerHTML = '<div class="no-data">파일 없음</div>';
      } else {
        el.innerHTML = editedFiles.map(f => `
          <div class="edit-record">
            <strong>${f.label}</strong>
            <div class="ts">${f.ts ? new Date(f.ts).toLocaleString('ko-KR') : ''}</div>
            <div class="ts" style="word-break:break-all">${f.path}</div>
          </div>
        `).join('');
      }
    }
  }
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

window.showSidebar = showSidebar;
window.closeSidebar = closeSidebar;
