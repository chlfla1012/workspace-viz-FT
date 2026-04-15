// ─── AI Decision Log ──────────────────────────────────────────────────────────

let _decisionsData = null;
let _decisionsProject = null;

async function loadDecisions(projectName) {
  if (!projectName) return;
  _decisionsProject = projectName;

  const main = document.getElementById('decisions-main');
  main.innerHTML = '<p class="no-data" style="padding:24px">로딩 중...</p>';

  try {
    const res = await fetch(`/api/decisions/${encodeURIComponent(projectName)}`);
    const data = await res.json();
    _decisionsData = data;
    renderDecisionLog(data);
  } catch (e) {
    main.innerHTML = `<p class="no-data" style="padding:24px">데이터 로드 실패: ${e.message}</p>`;
  }
}

function renderDecisionLog(data) {
  const main = document.getElementById('decisions-main');
  const summary = document.getElementById('decisions-summary');

  // Summary badges
  const s = data.summary || {};
  summary.innerHTML = [
    s.totalReasoning ? `<span class="dec-badge reasoning-badge">🤔 독백 ${s.totalReasoning}</span>` : '',
    s.totalActions   ? `<span class="dec-badge action-badge">⚡ 액션 ${s.totalActions}</span>` : '',
    s.totalErrors    ? `<span class="dec-badge error-badge">🔴 에러 ${s.totalErrors}</span>` : '',
    s.debuggingFiles?.length ? `<span class="dec-badge debug-badge">🔧 디버깅 ${s.debuggingFiles.length}파일</span>` : '',
  ].join('');

  if (!data.sessions || data.sessions.length === 0) {
    main.innerHTML = '<p class="no-data" style="padding:24px">이 프로젝트의 Decision 기록이 없습니다.</p>';
    return;
  }

  main.innerHTML = data.sessions.map(s => renderSessionBlock(s)).join('');
}

function renderSessionBlock(session) {
  const firstTs = session.firstTs ? new Date(session.firstTs).toLocaleString('ko-KR') : '-';
  const lastTs  = session.lastTs && session.lastTs !== session.firstTs
    ? ' ~ ' + new Date(session.lastTs).toLocaleString('ko-KR') : '';
  const eventCount = session.events.length;

  const errorBadge = session.errorCount > 0
    ? `<span class="dec-badge error-badge">🔴 에러 ${session.errorCount}</span>` : '';
  const debugBadge = session.debugPatterns?.length > 0
    ? `<span class="dec-badge debug-badge">🔧 디버깅 ${session.debugPatterns.map(p => p.filePath).join(', ')}</span>` : '';

  const sid8 = session.sessionId.slice(0, 8);
  const panelId = `dec-panel-${sid8}`;

  return `
  <div class="decision-session">
    <div class="decision-session-header" onclick="toggleDecPanel('${panelId}')">
      <code class="session-id" style="font-size:11px">${sid8}</code>
      <span style="color:#8b949e;font-size:11px">${firstTs}${lastTs}</span>
      <span style="color:#8b949e;font-size:11px">${eventCount}개 이벤트</span>
      ${errorBadge}${debugBadge}
      <span class="dec-toggle" id="toggle-${panelId}">▼</span>
    </div>
    <div class="dec-panel" id="${panelId}">
      ${session.events.length === 0
        ? '<p class="no-data" style="padding:12px">이벤트 없음</p>'
        : session.events.map(e => renderEventCard(e)).join('')
      }
    </div>
  </div>`;
}

function renderEventCard(event) {
  const kindLabel = { reasoning: '🤔 AI 독백', action: '⚡ 액션', result: '📥 결과' }[event.kind] || event.kind;
  const cls = event.kind === 'result' && event.isError ? 'event-result error' : `event-${event.kind}`;
  const ts = event.ts ? new Date(event.ts).toLocaleTimeString('ko-KR') : '';

  let body = '';
  if (event.kind === 'reasoning') {
    body = `<div class="event-text">${escapeDecHtml(event.text || '')}</div>`;
  } else if (event.kind === 'action') {
    const toolColor = { Edit: '#FF6B35', Write: '#3fb950', Read: '#79c0ff', Bash: '#d29922' }[event.tool] || '#8b949e';
    body = `<span class="event-tool" style="color:${toolColor}">${escapeDecHtml(event.tool || '')}</span>`
      + (event.filePath ? ` <span class="event-filepath">${escapeDecHtml(event.filePath)}</span>` : '');
  } else if (event.kind === 'result') {
    if (event.isError) {
      body = `<div class="event-error-snippet">${escapeDecHtml(event.errorSnippet || event.text || '')}</div>`;
    } else {
      body = `<div class="event-text" style="color:#484f58">${escapeDecHtml((event.text || '').slice(0, 120))}</div>`;
    }
  }

  return `
  <div class="event-card ${cls}">
    <div class="event-header">
      <span class="event-kind-label">${kindLabel}</span>
      <span class="event-ts">${ts}</span>
    </div>
    ${body}
  </div>`;
}

function toggleDecPanel(panelId) {
  const panel = document.getElementById(panelId);
  const toggle = document.getElementById('toggle-' + panelId);
  if (!panel) return;
  const hidden = panel.classList.toggle('hidden');
  if (toggle) toggle.textContent = hidden ? '▶' : '▼';
}

function populateDecisionsFilter(projects) {
  const sel = document.getElementById('decisions-project-filter');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- 프로젝트 선택 --</option>'
    + (projects || []).map(p => `<option value="${escapeDecHtml(p.name)}">${escapeDecHtml(p.name)}</option>`).join('');
}

function escapeDecHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.loadDecisions = loadDecisions;
window.toggleDecPanel = toggleDecPanel;
window.populateDecisionsFilter = populateDecisionsFilter;
