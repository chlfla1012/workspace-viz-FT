let timeline = null;
let timelineItems = null;
let timelineGroups = null;

function initTimeline(data) {
  const container = document.getElementById('timeline-container');
  if (!container) return;

  const events = data.timeline || [];
  if (events.length === 0) return;

  // Groups = unique projects
  const projectSet = new Set(events.map(e => e.group));
  timelineGroups = new vis.DataSet([...projectSet].map((p, i) => ({
    id: p,
    content: p,
  })));

  timelineItems = new vis.DataSet(events.map(e => ({
    id: e.id,
    content: `${e.files ? e.files.length : 0}파일`,
    start: new Date(e.start),
    end: e.end && e.end !== e.start ? new Date(e.end) : undefined,
    group: e.group,
    title: buildTimelineTooltip(e),
    className: 'claude-edit-item',
    _data: e,
  })));

  const options = {
    stack: false,
    maxHeight: 130,
    minHeight: 100,
    orientation: { axis: 'bottom' },
    zoomMin: 1000 * 60 * 60,       // 1 hour
    zoomMax: 1000 * 60 * 60 * 24 * 365, // 1 year
    selectable: true,
    multiselect: false,
    tooltip: { followMouse: true },
    showCurrentTime: true,
    currentTimeCallback: () => new Date(),
  };

  timeline = new vis.Timeline(container, timelineItems, timelineGroups, options);

  timeline.on('select', (props) => {
    if (props.items.length === 0) {
      highlightSessionNodes(null);
      return;
    }
    const item = timelineItems.get(props.items[0]);
    if (item && item._data) {
      highlightSessionNodes(item._data.sessionId);
    }
  });

  // Fit to show all items
  timeline.fit();
}

function buildTimelineTooltip(event) {
  const files = event.files || [];
  return `<div style="background:#1c2128;padding:8px;border-radius:6px;font-size:11px;color:#e6edf3;max-width:220px">
    <b>${event.group}</b> · 세션 ${event.sessionId ? event.sessionId.slice(0, 8) : '-'}<br>
    ${new Date(event.start).toLocaleString('ko-KR')}<br>
    <span style="color:#FF6B35">${files.length}개 파일 편집</span>
    ${files.slice(0, 5).map(f => `<div style="color:#8b949e;font-size:10px">${f.split('/').pop()}</div>`).join('')}
    ${files.length > 5 ? `<div style="color:#8b949e;font-size:10px">...외 ${files.length - 5}개</div>` : ''}
  </div>`;
}

function highlightSessionNodes(sessionId) {
  if (!window.network) return;
  if (!sessionId) {
    window.network.unselectAll();
    return;
  }
  const sessionNodeId = `session:${sessionId}`;
  if (window.nodesDataset && window.nodesDataset.get(sessionNodeId)) {
    window.network.selectNodes([sessionNodeId]);
    window.network.focus(sessionNodeId, { animation: true, scale: 1.2 });
  }
}

function updateTimeline(data) {
  if (!timeline) {
    initTimeline(data);
    return;
  }
  const events = data.timeline || [];
  timelineItems.update(events.map(e => ({
    id: e.id,
    content: `${e.files ? e.files.length : 0}파일`,
    start: new Date(e.start),
    end: e.end && e.end !== e.start ? new Date(e.end) : undefined,
    group: e.group,
    title: buildTimelineTooltip(e),
    _data: e,
  })));

  const projectSet = new Set(events.map(e => e.group));
  timelineGroups.update([...projectSet].map(p => ({ id: p, content: p })));
}

window.initTimeline = initTimeline;
window.updateTimeline = updateTimeline;
