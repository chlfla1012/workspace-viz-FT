const CONFIDENCE_CONFIG = {
  high:   { label: '파악 완료',   color: '#3fb950', bg: '#3fb95022' },
  medium: { label: '일부 불명확', color: '#d29922', bg: '#d2992222' },
  low:    { label: '정보 부족',   color: '#f85149', bg: '#f8514922' },
};

const STACK_COLORS = {
  'React': '#61DAFB', 'Vue': '#42b883', 'Node.js': '#339933',
  'Express': '#aaaaaa', 'TypeScript': '#3178C6', 'JavaScript': '#F7DF1E',
  'Python': '#3572A5', 'MySQL': '#4479A1', 'PostgreSQL': '#336791',
  'Tailwind CSS': '#38BDF8', 'Vite': '#646CFF', 'Redux Toolkit': '#764ABC',
  'LangChain': '#1C3C3C', 'OpenAI GPT-4o': '#74AA9C', 'Stripe': '#635BFF',
  'Fabric.js': '#FF6B6B', 'Google Calendar API': '#4285F4',
  'Vanilla JS': '#F7DF1E', 'HTML': '#E67E22', 'LocalStorage': '#8b949e',
};

let _allProjectsData = [];

// ─── Hidden projects (persisted in localStorage) ──────────────────────────────
const _hiddenProjects = new Set(
  JSON.parse(localStorage.getItem('hiddenProjects') || '[]')
);

function toggleHideProject(name) {
  if (_hiddenProjects.has(name)) {
    _hiddenProjects.delete(name);
  } else {
    _hiddenProjects.add(name);
  }
  localStorage.setItem('hiddenProjects', JSON.stringify([..._hiddenProjects]));
  renderCards(_allProjectsData);
  // Notify graph/pnet to refresh
  if (window._refreshVisibleProjects) window._refreshVisibleProjects();
}

function getVisibleProjects(projects) {
  return projects.filter(p => !_hiddenProjects.has(p.name));
}

function renderCards(projects) {
  const grid = document.getElementById('cards-grid');
  if (!projects || projects.length === 0) {
    grid.innerHTML = '<p class="no-data" style="padding:24px">프로젝트를 찾을 수 없습니다.</p>';
    return;
  }
  // Show hidden cards collapsed at the bottom
  const visible = projects.filter(p => !_hiddenProjects.has(p.name));
  const hidden  = projects.filter(p =>  _hiddenProjects.has(p.name));
  grid.innerHTML =
    visible.map(p => renderCard(p)).join('') +
    (hidden.length ? `<div class="hidden-cards-section">
      <div class="hidden-cards-label">숨김 처리됨 (${hidden.length})</div>
      ${hidden.map(p => renderHiddenCard(p)).join('')}
    </div>` : '');
}

function renderCard(p) {
  const conf = CONFIDENCE_CONFIG[p.confidence] || CONFIDENCE_CONFIG.low;
  const lastActivity = p.lastModified ? relativeTime(p.lastModified) : '알 수 없음';

  const stackBadges = (p.stack || []).map(s => {
    const color = STACK_COLORS[s] || '#8b949e';
    return `<span class="stack-badge" style="border-color:${color}44;color:${color}">${s}</span>`;
  }).join('');

  const featureList = (p.features || []).length > 0
    ? p.features.map(f => `<li>${f}</li>`).join('')
    : '<li class="no-data">기능 정보 없음</li>';

  const unknownsList = (p.unknowns || []).length > 0
    ? `<div class="unknowns-section">
        <div class="section-label">⚠ 알 수 없는 정보</div>
        ${p.unknowns.map(u => `<div class="unknown-item">• ${u}</div>`).join('')}
       </div>`
    : '';

  const claudeMdHtml = p.claudeMd
    ? `<div class="section-label" style="margin-top:10px">📋 CLAUDE.md</div>
       <div class="claude-md-summary">${escapeHtml(p.claudeMd)}</div>`
    : '';

  const sessionCount = (p.sessions || []).length;
  const sessionsHtml = sessionCount > 0
    ? `<div class="section-label">Claude 작업 이력 (${sessionCount}회)</div>
       <div class="sessions-list">
         ${p.sessions.slice(0, 3).map(s => renderSessionRow(s, p.name)).join('')}
         ${sessionCount > 3
           ? `<div class="more-sessions" onclick="showAllSessions('${escapeAttr(p.name)}')">+ ${sessionCount - 3}개 더 보기</div>`
           : ''}
       </div>`
    : `<div class="no-data" style="font-size:11px;padding:4px 0">Claude 작업 기록 없음</div>`;

  return `
  <div class="project-card" id="card-${p.name}">
    <div class="card-header">
      <div class="card-title-row">
        <h3 class="card-title">${p.name}</h3>
        <span class="confidence-badge" style="color:${conf.color};background:${conf.bg}">${conf.label}</span>
        <button class="hide-btn" title="숨기기" onclick="toggleHideProject('${escapeAttr(p.name)}')">숨김</button>
      </div>
      <p class="card-desc">${p.description || '설명 없음'}</p>
    </div>

    <div class="card-meta-row">
      <span class="meta-item">📁 ${p.fileCount || 0}개 파일</span>
      <span class="meta-item">🕐 ${lastActivity}</span>
      ${p.hasGit ? '<span class="meta-item git-badge">Git</span>' : ''}
      ${p.claudeEditedFiles > 0 ? `<span class="meta-item claude-badge">Claude ${p.claudeEditedFiles}파일 편집</span>` : ''}
    </div>

    <div class="card-body">
      <div class="card-section left-section">
        <div class="section-label">기술 스택</div>
        <div class="stack-badges">${stackBadges || '<span class="no-data">미확정</span>'}</div>

        <div class="section-label" style="margin-top:10px">주요 기능</div>
        <ul class="feature-list">${featureList}</ul>

        ${p.startCommand ? `
          <div class="section-label" style="margin-top:10px">실행 방법</div>
          <code class="start-cmd">${escapeHtml(p.startCommand)}</code>
        ` : ''}

        ${claudeMdHtml}
        ${unknownsList}
      </div>

      <div class="card-section right-section">
        ${sessionsHtml}
      </div>
    </div>
  </div>`;
}

function renderSessionRow(session, projectName) {
  const firstTs = session.firstTs ? new Date(session.firstTs).toLocaleString('ko-KR') : '-';
  const msgCount = session.messageCount || 0;

  // Pick best preview message (first real message, skip empty)
  const msgs = session.messages || [];
  const previewMsg = msgs.find(m => m.text && m.text.length > 5) || msgs[0];
  const preview = previewMsg ? escapeHtml(previewMsg.text.slice(0, 70)) : '(내용 없음)';
  const hasMore = previewMsg && previewMsg.text.length > 70;

  return `
  <div class="session-row" onclick="openSessionModal('${session.sessionId}', '${escapeAttr(projectName)}')">
    <div class="session-row-top">
      <code class="session-id">${session.sessionId.slice(0, 8)}</code>
      <span class="session-ts">${firstTs}</span>
      <span class="session-msg-count">${msgCount}개 대화</span>
    </div>
    <div class="session-preview">${preview}${hasMore ? '...' : ''}</div>
  </div>`;
}

// ─── Session Modal ────────────────────────────────────────────────────────────
function openSessionModal(sessionId, projectName) {
  const project = _allProjectsData.find(p => p.name === projectName);
  if (!project) {
    console.warn('openSessionModal: project not found', projectName, '_allProjectsData.length', _allProjectsData.length);
    return;
  }
  const session = project.sessions.find(s => s.sessionId === sessionId);
  if (!session) {
    console.warn('openSessionModal: session not found', sessionId);
    return;
  }

  document.getElementById('modal-title').textContent = `${projectName} · 세션 ${sessionId.slice(0, 8)}`;
  const body = document.getElementById('modal-body');

  const messages = (session.messages || []).filter(m => m.text && m.text.trim().length > 2);

  body.innerHTML = `
    <div class="modal-meta">
      <div><span style="color:#8b949e">세션 ID</span> <code style="color:#79c0ff">${sessionId}</code></div>
      <div><span style="color:#8b949e">기간</span>
        ${session.firstTs ? new Date(session.firstTs).toLocaleString('ko-KR') : '-'}
        ${session.lastTs && session.lastTs !== session.firstTs
          ? ' ~ ' + new Date(session.lastTs).toLocaleString('ko-KR') : ''}
      </div>
      <div><span style="color:#8b949e">대화 수</span> ${messages.length}개</div>
    </div>
    <div class="modal-messages">
      ${messages.length === 0
        ? '<p class="no-data" style="padding:12px">필터링 후 표시할 대화 내용이 없습니다.</p>'
        : messages.map((m, i) => `
          <div class="chat-bubble">
            <div class="chat-ts">${m.ts ? new Date(m.ts).toLocaleString('ko-KR') : ''}</div>
            <div class="chat-text">${escapeHtml(m.text)}</div>
          </div>
        `).join('')
      }
    </div>
  `;

  document.getElementById('session-modal').classList.remove('hidden');
}

function closeSessionModal() {
  document.getElementById('session-modal').classList.add('hidden');
}

function showAllSessions(projectName) {
  // Show a list of all sessions in the modal for that project
  const project = _allProjectsData.find(p => p.name === projectName);
  if (!project || !project.sessions.length) return;

  document.getElementById('modal-title').textContent = `${projectName} · 전체 세션 목록`;
  const body = document.getElementById('modal-body');

  body.innerHTML = `
    <div class="modal-messages">
      ${project.sessions.map(s => {
        const msgs = (s.messages || []).filter(m => m.text && m.text.length > 5);
        const preview = msgs[0] ? escapeHtml(msgs[0].text.slice(0, 80)) : '(내용 없음)';
        return `
          <div class="chat-bubble" style="cursor:pointer" onclick="openSessionModal('${s.sessionId}', '${escapeAttr(projectName)}')">
            <div class="chat-ts" style="display:flex;justify-content:space-between">
              <code style="color:#79c0ff">${s.sessionId.slice(0, 8)}</code>
              <span>${s.firstTs ? new Date(s.firstTs).toLocaleString('ko-KR') : ''}</span>
              <span style="color:#FF6B35">${msgs.length}개 대화</span>
            </div>
            <div class="chat-text" style="color:#8b949e;margin-top:3px">${preview}${msgs[0] && msgs[0].text.length > 80 ? '...' : ''}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  document.getElementById('session-modal').classList.remove('hidden');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function relativeTime(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(isoStr).toLocaleDateString('ko-KR');
}

function renderHiddenCard(p) {
  const conf = CONFIDENCE_CONFIG[p.confidence] || CONFIDENCE_CONFIG.low;
  return `
  <div class="project-card hidden-card" id="card-${p.name}">
    <div class="card-header" style="padding:10px 14px">
      <div class="card-title-row">
        <h3 class="card-title" style="font-size:13px">${p.name}</h3>
        <span class="confidence-badge" style="color:${conf.color};background:${conf.bg}">${conf.label}</span>
        <button class="hide-btn unhide-btn" title="표시하기" onclick="toggleHideProject('${escapeAttr(p.name)}')">표시</button>
      </div>
    </div>
  </div>`;
}

window.renderCards = renderCards;
window.openSessionModal = openSessionModal;
window.closeSessionModal = closeSessionModal;
window.showAllSessions = showAllSessions;
window.toggleHideProject = toggleHideProject;
window.getVisibleProjects = getVisibleProjects;
window._setProjectsData = (data) => { _allProjectsData = data; window._allProjectsDataRaw = data; };
