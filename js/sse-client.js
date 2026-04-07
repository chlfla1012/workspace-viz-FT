let evtSource = null;

function connectSSE() {
  if (evtSource) evtSource.close();
  evtSource = new EventSource('/api/events');
  const indicator = document.getElementById('status-indicator');

  evtSource.onopen = () => { indicator.className = ''; };

  evtSource.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    if (msg.type === 'connected') {
      hideLoading();
      const { graph, projects } = msg.data;
      window._setProjectsData(projects);
      renderCards(projects);
      const visible = window.getVisibleProjects ? window.getVisibleProjects(projects) : projects;
      initGraph(filterGraphByProjects(graph, visible));
      initTimeline(graph);
      initPnet(visible);
      populateProjectFilter(graph);
      updateStats(graph, projects);
    } else if (msg.type === 'update') {
      const { graph, projects } = msg.data;
      window._setProjectsData(projects);
      renderCards(projects);
      const visible = window.getVisibleProjects ? window.getVisibleProjects(projects) : projects;
      applyDelta(filterGraphByProjects(graph, visible));
      updateTimeline(graph);
      updatePnet(visible);
      populateProjectFilter(graph);
      updateStats(graph, projects);
      showToast('워크스페이스 업데이트됨');
    }
  };

  evtSource.onerror = () => {
    indicator.className = 'disconnected';
    setTimeout(connectSSE, 5000);
  };
}

function updateStats(graph, projects) {
  const el = document.getElementById('stats-text');
  if (!el) return;
  const sessionCount = graph?.stats?.totalSessions || 0;
  const projectCount = projects?.length || 0;
  const buildTime = graph?.stats?.buildTime ? new Date(graph.stats.buildTime).toLocaleTimeString('ko-KR') : '';
  el.textContent = `프로젝트 ${projectCount} · 세션 ${sessionCount} · ${buildTime} 업데이트`;
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

function populateProjectFilter(data) {
  const select = document.getElementById('project-filter');
  if (!select) return;
  const current = select.value;
  const projects = new Set(['all']);
  for (const node of (data?.nodes || [])) {
    if (node.project) projects.add(node.project);
  }
  select.innerHTML = [...projects].map(p =>
    `<option value="${p}">${p === 'all' ? '전체' : p}</option>`
  ).join('');
  if ([...projects].includes(current)) select.value = current;
}

function filterGraphByProjects(graph, visibleProjects) {
  if (!graph || !visibleProjects) return graph;
  const names = new Set(visibleProjects.map(p => p.name));
  return {
    ...graph,
    nodes: (graph.nodes || []).filter(n => !n.project || names.has(n.project)),
    edges: (graph.edges || []).filter(e => {
      const fn = (graph.nodes || []).find(n => n.id === e.from);
      const tn = (graph.nodes || []).find(n => n.id === e.to);
      return (!fn || !fn.project || names.has(fn.project)) &&
             (!tn || !tn.project || names.has(tn.project));
    }),
  };
}

// Called when user toggles hide on a card — refresh graph+pnet without re-fetching
window._refreshVisibleProjects = function() {
  const projects = window._allProjectsDataRaw;
  if (!projects) return;
  const visible = window.getVisibleProjects ? window.getVisibleProjects(projects) : projects;
  // Rebuild pnet from scratch with visible projects only
  initPnet(visible);
  fetch('/api/graph').then(r => r.json()).then(graph => {
    applyDelta(filterGraphByProjects(graph, visible));
    populateProjectFilter(graph);
  });
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('status-indicator').className = 'loading';

  // Fallback polling
  setTimeout(async () => {
    try {
      const [graphRes, projectsRes] = await Promise.all([
        fetch('/api/graph'),
        fetch('/api/projects'),
      ]);
      const graph = await graphRes.json();
      const projects = await projectsRes.json();

      if (graph.loading || projects.loading) {
        document.getElementById('loading-msg').textContent = '서버에서 파일 스캔 중... (잠시만 기다려주세요)';
        setTimeout(() => location.reload(), 4000);
        return;
      }

      if (!window._graphInitialized) {
        hideLoading();
        window._setProjectsData(projects);
        renderCards(projects);
        const visible = window.getVisibleProjects ? window.getVisibleProjects(projects) : projects;
        initGraph(filterGraphByProjects(graph, visible));
        initTimeline(graph);
        initPnet(visible);
        populateProjectFilter(graph);
        updateStats(graph, projects);
      }
    } catch (e) {
      document.getElementById('loading-msg').textContent =
        '서버에 연결할 수 없습니다. 터미널에서 node server.js 를 실행해주세요.';
    }
  }, 1200);

  connectSSE();
});

window.showToast = showToast;
