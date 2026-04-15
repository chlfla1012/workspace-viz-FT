// ─── Phase Progress ───────────────────────────────────────────────────────────

function renderPhaseProgress(phaseData) {
  if (!phaseData || !phaseData.phases || phaseData.phases.length === 0) return '';

  const overall = phaseData.overallProgress || 0;
  const overallColor = overall === 100 ? '#3fb950' : overall > 50 ? '#d29922' : '#388bfd';

  const phaseBars = phaseData.phases.map(p => {
    const color = p.progress === 100 ? '#3fb950' : p.progress > 50 ? '#d29922' : '#388bfd';
    const doneCount = p.items.filter(i => i.done).length;
    const totalCount = p.items.length;
    const label = totalCount > 0 ? `${doneCount}/${totalCount}` : '-';
    return `
    <div class="phase-row" title="${escapePhaseHtml(p.title)}">
      <span class="phase-name">Phase ${p.number}</span>
      <div class="phase-bar-track">
        <div class="phase-bar-fill" style="width:${p.progress}%;background:${color}"></div>
      </div>
      <span class="phase-pct" style="color:${color}">${p.progress}%</span>
      <span class="phase-count">${label}</span>
    </div>`;
  }).join('');

  return `
  <div class="phase-progress-strip">
    <div class="phase-strip-header">
      <span class="phase-source-label">📋 ${escapePhaseHtml(phaseData.source)}</span>
      <span class="phase-overall" style="color:${overallColor}">전체 ${overall}%</span>
    </div>
    <div class="phase-overall-track">
      <div class="phase-overall-fill" style="width:${overall}%;background:${overallColor}"></div>
    </div>
    <div class="phase-rows">${phaseBars}</div>
  </div>`;
}

function escapePhaseHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.renderPhaseProgress = renderPhaseProgress;
