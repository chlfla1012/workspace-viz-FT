const express = require('express');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const app = express();
const PORT = 3333;

app.use(express.json());
app.use(express.static(__dirname));

// ─── SSE clients ─────────────────────────────────────────────────────────────
const sseClients = [];
function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => res.write(payload));
}

// ─── Config ───────────────────────────────────────────────────────────────────
const WORKSPACE_DIR = '/Users/rymchoi/workspace';
const CLAUDE_PROJECTS_DIR = path.join(process.env.HOME, '.claude', 'projects');
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', '.cache']);
const SCAN_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.md', '.json', '.py']);

// ─── Cache ────────────────────────────────────────────────────────────────────
let graphCache = null;
let projectsCache = null;
let cacheBuilding = false;
const jsonlMtimes = new Map();
let claudeEditsMap = new Map();    // filePath → EditRecord[]
let sessionConvosMap = new Map();  // sessionId → { project, messages[], userMessages[] }

// ─── JSONL: parse edits + conversations ───────────────────────────────────────
async function parseAllClaudeHistory() {
  const newEditsMap = new Map();
  const newConvosMap = new Map();

  let projectDirs = [];
  try { projectDirs = fs.readdirSync(CLAUDE_PROJECTS_DIR); } catch (e) { return { editsMap: newEditsMap, convosMap: newConvosMap }; }

  for (const projectDir of projectDirs) {
    const projectPath = path.join(CLAUDE_PROJECTS_DIR, projectDir);
    let files = [];
    try { files = fs.readdirSync(projectPath).filter(f => f.endsWith('.jsonl')); } catch (e) { continue; }

    for (const file of files) {
      const filePath = path.join(projectPath, file);
      try {
        await parseJsonlFile(filePath, newEditsMap, newConvosMap);
        jsonlMtimes.set(filePath, fs.statSync(filePath).mtimeMs);
      } catch (e) { /* skip */ }
    }
  }

  return { editsMap: newEditsMap, convosMap: newConvosMap };
}

async function parseJsonlFile(filePath, editsMap, convosMap) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch (e) { continue; }

    const sid = obj.sessionId || '';
    const ts = obj.timestamp || '';
    const cwd = obj.cwd || '';
    const cwdProject = cwd.startsWith(WORKSPACE_DIR)
      ? path.relative(WORKSPACE_DIR, cwd).split(path.sep)[0]
      : null;
    // Only use cwd-derived project if it's an actual subdirectory name (not empty)
    const project = (cwdProject && cwdProject !== '' && cwdProject !== '.') ? cwdProject : null;

    // ── User messages (대화 내용) ──
    if (obj.type === 'user' && sid) {
      const msg = obj.message || {};
      let text = '';
      const content = msg.content;
      if (typeof content === 'string') {
        text = content;
      } else if (Array.isArray(content)) {
        text = content
          .filter(c => c.type === 'text')
          .map(c => c.text || '')
          .join(' ');
      }
      text = text.replace(/<[^>]+>/g, '').trim(); // strip XML tags
      // Filter noise: system messages, command artifacts, very short inputs
      if (text.length < 3) continue;
      if (/^(logout|exit|yes|no|응|ㅇ|ok|ㅇㅇ|네|아니|ㄴ)$/i.test(text)) continue;
      if (/^(Caveat:|Please analyze this codebase|No conversations found|Status dialog|See ya|Set output style|Connected to Cursor)/i.test(text)) continue;
      if (/^\s*init\s*\/init\s*$/i.test(text)) continue;

      if (!convosMap.has(sid)) {
        convosMap.set(sid, { project, messages: [], firstTs: ts, lastTs: ts });
      }
      const convo = convosMap.get(sid);
      convo.messages.push({ ts, text: text.slice(0, 300) });
      if (!convo.project && project) convo.project = project;
      if (ts > convo.lastTs) convo.lastTs = ts;
      if (ts < convo.firstTs) convo.firstTs = ts;
    }

    // ── Assistant tool_use (파일 편집) ──
    if (obj.type === 'assistant' && sid) {
      const msg = obj.message || {};
      if (!Array.isArray(msg.content)) continue;
      for (const block of msg.content) {
        if (block.type !== 'tool_use') continue;
        if (!['Edit', 'Write', 'MultiEdit'].includes(block.name)) continue;
        const input = block.input || {};
        const targetPath = input.file_path || input.path;
        if (!targetPath) continue;

        const record = { sessionId: sid, timestamp: ts, cwd, tool: block.name };
        if (!editsMap.has(targetPath)) editsMap.set(targetPath, []);
        editsMap.get(targetPath).push(record);

        // Infer project from edited file path if cwd-based project unknown
        const fileProject = targetPath.startsWith(WORKSPACE_DIR)
          ? path.relative(WORKSPACE_DIR, targetPath).split(path.sep)[0]
          : null;
        const resolvedProject = project || (fileProject && fileProject !== '' ? fileProject : null);

        // link session→project
        if (!convosMap.has(sid)) {
          convosMap.set(sid, { project: resolvedProject, messages: [], firstTs: ts, lastTs: ts });
        }
        const c = convosMap.get(sid);
        if (!c.project && resolvedProject) c.project = resolvedProject;
        if (ts > (c.lastTs || '')) c.lastTs = ts;
        if (!c.firstTs || ts < c.firstTs) c.firstTs = ts;
      }
    }
  }
}

// ─── File Scanner ─────────────────────────────────────────────────────────────
function scanWorkspaceFiles(dir, results = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return results; }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) scanWorkspaceFiles(fullPath, results);
    else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) results.push(fullPath);
  }
  return results;
}

// ─── Import Analyzer ──────────────────────────────────────────────────────────
const IMPORT_PATTERNS = [
  /(?:import\s+(?:.*?\s+from\s+)?|export\s+.*?\s+from\s+)['"](\.[^'"]+)['"]/g,
  /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
  /\bsrc\s*=\s*['"](\.[^'"]+)['"]/g,
  /\bhref\s*=\s*['"](\.[^'"]+)['"]/g,
];

function analyzeImports(filePath) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch (e) { return []; }
  const dir = path.dirname(filePath);
  const imports = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const importPath = match[1];
      if (!importPath.startsWith('.')) continue;
      let resolved = path.resolve(dir, importPath);
      if (!path.extname(resolved)) {
        for (const ext of ['.js', '.ts', '.jsx', '.tsx', '.css', '.html']) {
          if (fs.existsSync(resolved + ext)) { resolved = resolved + ext; break; }
          const idx = path.join(resolved, 'index' + ext);
          if (fs.existsSync(idx)) { resolved = idx; break; }
        }
      }
      if (fs.existsSync(resolved)) imports.add(resolved);
    }
  }
  return [...imports];
}

// ─── Project Info ─────────────────────────────────────────────────────────────
const PROJECT_META = {
  'bucket-list-main': {
    description: '인생에서 이루고 싶은 목표들을 기록·관리하는 버킷리스트 웹앱',
    stack: ['Vanilla JS', 'HTML', 'Tailwind CSS', 'LocalStorage'],
    features: ['버킷리스트 추가/수정/삭제', '완료 체크 & 필터', '달성률 통계', '모바일 반응형'],
    startCommand: 'python -m http.server 8000 또는 브라우저에서 index.html',
    confidence: 'high',
    unknowns: [],
  },
  'chatbot': {
    description: 'LINE 메신저 기반 마사지샵 예약·결제 AI 챗봇 시스템',
    stack: ['Node.js', 'Express', 'LangChain', 'OpenAI GPT-4o', 'PostgreSQL', 'Stripe', 'Google Calendar API'],
    features: ['자연어 대화 상담', '예약 관리', 'Stripe 결제', 'Google Calendar 연동', '대화 히스토리 저장'],
    startCommand: 'npm run dev',
    confidence: 'high',
    unknowns: [],
  },
  'claude-code-mastery': {
    description: '개발자 웹 이력서 / 포트폴리오 사이트 (진행 중)',
    stack: ['HTML', 'CSS', 'JavaScript', 'Vite'],
    features: ['기술 스택 소개', '경력 타임라인', '프로젝트 포트폴리오', '다크/라이트 모드'],
    startCommand: 'npm run dev',
    confidence: 'medium',
    unknowns: ['프레임워크 최종 미확정 (React vs Vue)', '백엔드 구현 방식 미확정'],
  },
  'kenshin': {
    description: '이미지 인식 기반 문제 풀이 + 마스터 데이터 관리 풀스택 앱',
    stack: ['React', 'Vite', 'Redux Toolkit', 'Express', 'MySQL', 'Google Cloud Vision', 'Fabric.js'],
    features: ['Canvas 드로잉', '이미지 OCR 인식', '청구/결제', '사용량 미터', '관리자 대시보드', '역할 기반 접근제어'],
    startCommand: 'npm run dev (프론트) / 백엔드 실행 명령어 불명확',
    confidence: 'high',
    unknowns: ['백엔드 서버 실행 명령어', '정확한 서비스 도메인/타겟 고객'],
  },
  'my-portfolio-2026': {
    description: '2026년 개인 포트폴리오 사이트 (초기 단계)',
    stack: [],
    features: [],
    startCommand: null,
    confidence: 'low',
    unknowns: ['기술 스택 미확정', '프레임워크 미선택', '실제 구현 코드 없음'],
  },
  'output-style-test': {
    description: '해킹 테마 터미널 스타일 계산기 (스타일 테스트용)',
    stack: ['Vanilla JS', 'HTML', 'CSS'],
    features: ['기본 사칙연산', 'Matrix 터미널 UI'],
    startCommand: '브라우저에서 calculator.html 열기',
    confidence: 'high',
    unknowns: [],
  },
  'witts-review': {
    description: '근무 평가 및 반기 면담 기록 저장소',
    stack: [],
    features: ['반기별 채용공고 기록', '개인 근무 평가', '면담 내용 저장'],
    startCommand: null,
    confidence: 'low',
    unknowns: ['웹 앱이 아닌 데이터 파일 모음', '실행 방법 없음'],
  },
};

// Heuristic: match session to project by scanning its user messages for project names
function inferProjectFromMessages(messages, projectNames) {
  if (!messages || messages.length === 0) return null;
  const text = messages.map(m => m.text).join(' ').toLowerCase();
  for (const name of projectNames) {
    if (text.includes(name.toLowerCase())) return name;
  }
  return null;
}

function buildProjectCards() {
  const projects = [];

  let projectDirs = [];
  try { projectDirs = fs.readdirSync(WORKSPACE_DIR, { withFileTypes: true }); } catch (e) { return []; }
  projectDirs = projectDirs.filter(e => e.isDirectory() && !IGNORE_DIRS.has(e.name) && e.name !== 'workspace-viz');

  for (const entry of projectDirs) {
    const name = entry.name;
    const projectPath = path.join(WORKSPACE_DIR, name);
    const meta = PROJECT_META[name] || {
      description: '알 수 없음',
      stack: [],
      features: [],
      startCommand: null,
      confidence: 'low',
      unknowns: ['프로젝트 정보 없음'],
    };

    // File stats
    const allFiles = scanWorkspaceFiles(projectPath);
    const extCounts = {};
    for (const f of allFiles) {
      const ext = path.extname(f).slice(1) || 'other';
      extCounts[ext] = (extCounts[ext] || 0) + 1;
    }

    // Last modified
    let lastModified = null;
    for (const f of allFiles) {
      try {
        const mtime = fs.statSync(f).mtime.toISOString();
        if (!lastModified || mtime > lastModified) lastModified = mtime;
      } catch (e) { /* skip */ }
    }

    const allProjectNames = projectDirs.map(e => e.name);

    // Claude sessions for this project
    const projectSessions = [];
    for (const [sid, convo] of sessionConvosMap) {
      // Resolve project: use explicit match or infer from message text
      if (!convo.project && convo.messages.length > 0) {
        convo.project = inferProjectFromMessages(convo.messages, allProjectNames);
      }
      if (convo.project === name) {
        projectSessions.push({
          sessionId: sid,
          firstTs: convo.firstTs,
          lastTs: convo.lastTs,
          messageCount: convo.messages.length,
          messages: convo.messages.slice(0, 10), // first 10 user messages
        });
      }
    }
    projectSessions.sort((a, b) => (b.lastTs || '').localeCompare(a.lastTs || ''));

    // CLAUDE.md summary — find the most content-rich paragraph
    let claudeMd = null;
    const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
    if (fs.existsSync(claudeMdPath)) {
      try {
        const raw = fs.readFileSync(claudeMdPath, 'utf8');
        const lines = raw.split('\n');
        const BOILERPLATE = /This file provides guidance|Claude Code|claude\.ai\/code|No build step|npm install|npm run|python -m http|There are no tests|Once the project structure/i;
        const SKIP_LINE = /^\s*(#|-|\*|>|\|)/;
        // Collect all paragraphs (groups of non-empty prose lines)
        const paragraphs = [];
        let para = [];
        let inCode = false;
        for (const line of lines) {
          if (line.startsWith('```')) { inCode = !inCode; continue; }
          if (inCode) continue;
          const trimmed = line.trim();
          if (!trimmed) {
            if (para.length) { paragraphs.push(para.join(' ')); para = []; }
            continue;
          }
          if (SKIP_LINE.test(trimmed)) continue;
          if (BOILERPLATE.test(trimmed)) continue;
          para.push(trimmed);
        }
        if (para.length) paragraphs.push(para.join(' '));
        // Pick the longest paragraph (most informative), strip markdown formatting
        const best = paragraphs.sort((a, b) => b.length - a.length)[0] || null;
        claudeMd = best
          ? best.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').slice(0, 200)
          : null;
      } catch (e) { /* skip */ }
    }

    // Edited files count
    let claudeEditedFiles = 0;
    for (const [filePath] of claudeEditsMap) {
      if (filePath.startsWith(projectPath + path.sep)) claudeEditedFiles++;
    }

    // Has git
    const hasGit = fs.existsSync(path.join(projectPath, '.git'));

    // package.json info
    let pkgInfo = null;
    const pkgPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        pkgInfo = {
          name: pkg.name,
          version: pkg.version,
          scripts: Object.keys(pkg.scripts || {}),
        };
      } catch (e) { /* skip */ }
    }

    projects.push({
      name,
      path: projectPath,
      ...meta,
      fileCount: allFiles.length,
      extCounts,
      lastModified,
      claudeEditedFiles,
      sessions: projectSessions,
      hasGit,
      pkgInfo,
      claudeMd,  // CLAUDE.md summary sentence
    });
  }

  // Sort: most recently active first
  projects.sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''));
  return projects;
}

// ─── Graph Builder ─────────────────────────────────────────────────────────────
function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return { '.js': 'js', '.jsx': 'js', '.ts': 'ts', '.tsx': 'ts',
           '.html': 'html', '.css': 'css', '.md': 'md', '.json': 'json', '.py': 'py' }[ext] || 'other';
}

function getProject(filePath) {
  const rel = path.relative(WORKSPACE_DIR, filePath);
  return rel.split(path.sep)[0] || 'root';
}

async function buildGraph() {
  const nodes = new Map();
  const edges = [];
  const allFiles = scanWorkspaceFiles(WORKSPACE_DIR);

  for (const filePath of allFiles) {
    let stat;
    try { stat = fs.statSync(filePath); } catch (e) { continue; }
    const edits = claudeEditsMap.get(filePath) || [];
    nodes.set(filePath, {
      id: filePath,
      label: path.basename(filePath),
      project: getProject(filePath),
      type: getFileType(filePath),
      lastModified: stat.mtime.toISOString(),
      claudeEdits: edits,
      path: filePath,
    });
  }

  for (const [filePath, edits] of claudeEditsMap) {
    if (!nodes.has(filePath) && filePath.startsWith(WORKSPACE_DIR)) {
      let stat;
      try { stat = fs.statSync(filePath); } catch (e) { continue; }
      nodes.set(filePath, {
        id: filePath,
        label: path.basename(filePath),
        project: getProject(filePath),
        type: getFileType(filePath),
        lastModified: stat.mtime.toISOString(),
        claudeEdits: edits,
        path: filePath,
      });
    }
  }

  for (const [filePath] of nodes) {
    for (const importedFile of analyzeImports(filePath)) {
      if (nodes.has(importedFile)) {
        edges.push({ id: `import:${filePath}:${importedFile}`, from: filePath, to: importedFile, type: 'import' });
      }
    }
  }

  const sessions = new Map();
  for (const [filePath, edits] of claudeEditsMap) {
    if (!filePath.startsWith(WORKSPACE_DIR)) continue;
    for (const edit of edits) {
      if (!sessions.has(edit.sessionId)) {
        const convo = sessionConvosMap.get(edit.sessionId);
        sessions.set(edit.sessionId, {
          id: `session:${edit.sessionId}`,
          label: `session\n${edit.sessionId.slice(0, 8)}`,
          sessionId: edit.sessionId,
          type: 'session',
          project: convo?.project || getProject((edit.cwd || WORKSPACE_DIR) + '/x'),
          lastModified: edit.timestamp,
          claudeEdits: [],
          path: null,
          firstEdit: edit.timestamp,
          messages: convo?.messages || [],
        });
      }
      const s = sessions.get(edit.sessionId);
      if (edit.timestamp < s.firstEdit) s.firstEdit = edit.timestamp;
    }
  }

  for (const [, sNode] of sessions) nodes.set(sNode.id, sNode);

  for (const [filePath, edits] of claudeEditsMap) {
    if (!filePath.startsWith(WORKSPACE_DIR)) continue;
    const seen = new Set();
    for (const edit of edits) {
      const key = `${edit.sessionId}:${filePath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        id: `claude:${edit.sessionId}:${filePath}`,
        from: `session:${edit.sessionId}`,
        to: filePath,
        type: 'claude-edit',
        sessionId: edit.sessionId,
        timestamp: edit.timestamp,
        tool: edit.tool,
      });
    }
  }

  const timelineEvents = [];
  for (const [, sNode] of sessions) {
    const edits = [];
    for (const [fp, fileEdits] of claudeEditsMap) {
      if (!fp.startsWith(WORKSPACE_DIR)) continue;
      for (const e of fileEdits) {
        if (e.sessionId === sNode.sessionId) edits.push({ filePath: fp, ...e });
      }
    }
    if (edits.length > 0) {
      edits.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      timelineEvents.push({
        id: sNode.sessionId,
        content: `${edits.length}파일`,
        start: edits[0].timestamp,
        end: edits[edits.length - 1].timestamp !== edits[0].timestamp ? edits[edits.length - 1].timestamp : undefined,
        group: getProject((edits[0].cwd || WORKSPACE_DIR) + '/x'),
        sessionId: sNode.sessionId,
        files: edits.map(e => e.filePath),
      });
    }
  }

  return {
    nodes: [...nodes.values()],
    edges,
    timeline: timelineEvents,
    stats: {
      totalFiles: nodes.size,
      totalEdges: edges.length,
      totalSessions: sessions.size,
      buildTime: new Date().toISOString(),
    },
  };
}

// ─── Rebuild all ──────────────────────────────────────────────────────────────
async function rebuildCache() {
  if (cacheBuilding) return;
  cacheBuilding = true;
  try {
    const { editsMap, convosMap } = await parseAllClaudeHistory();
    claudeEditsMap = editsMap;
    sessionConvosMap = convosMap;
    graphCache = await buildGraph();
    projectsCache = buildProjectCards();
    console.log(`[viz] Built: ${graphCache.nodes.length} nodes, ${graphCache.edges.length} edges, ${projectsCache.length} projects`);
  } finally {
    cacheBuilding = false;
  }
}

setImmediate(rebuildCache);

setInterval(async () => {
  let changed = false;
  let projectDirs = [];
  try { projectDirs = fs.readdirSync(CLAUDE_PROJECTS_DIR); } catch (e) { return; }
  for (const pd of projectDirs) {
    const pp = path.join(CLAUDE_PROJECTS_DIR, pd);
    let files = [];
    try { files = fs.readdirSync(pp).filter(f => f.endsWith('.jsonl')); } catch (e) { continue; }
    for (const file of files) {
      const fp = path.join(pp, file);
      try {
        const stat = fs.statSync(fp);
        const prev = jsonlMtimes.get(fp);
        if (prev === undefined || stat.mtimeMs > prev) changed = true;
      } catch (e) { /* skip */ }
    }
  }
  if (changed) {
    console.log('[viz] JSONL changed, rebuilding...');
    await rebuildCache();
    broadcast({ type: 'update', data: { graph: graphCache, projects: projectsCache } });
  }
}, 30000);

// ─── API ──────────────────────────────────────────────────────────────────────
app.get('/api/graph', async (req, res) => {
  if (!graphCache) {
    if (cacheBuilding) return res.json({ loading: true });
    await rebuildCache();
  }
  res.json(graphCache);
});

app.get('/api/projects', async (req, res) => {
  if (!projectsCache) {
    if (cacheBuilding) return res.json({ loading: true });
    await rebuildCache();
  }
  res.json(projectsCache);
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  if (graphCache && projectsCache) {
    res.write(`data: ${JSON.stringify({ type: 'connected', data: { graph: graphCache, projects: projectsCache } })}\n\n`);
  }

  sseClients.push(res);
  console.log(`[viz] SSE client connected (${sseClients.length})`);

  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 30000);
  req.on('close', () => {
    clearInterval(heartbeat);
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

app.post('/api/hook', async (req, res) => {
  const { tool, filePath, sessionId, timestamp, cwd } = req.body;
  console.log(`[viz] Hook: ${tool} → ${filePath}`);
  if (filePath && filePath.startsWith(WORKSPACE_DIR)) {
    const record = { sessionId: sessionId || '', timestamp: timestamp || new Date().toISOString(), cwd: cwd || '', tool: tool || 'unknown' };
    if (!claudeEditsMap.has(filePath)) claudeEditsMap.set(filePath, []);
    claudeEditsMap.get(filePath).push(record);
  }
  await rebuildCache();
  broadcast({ type: 'update', data: { graph: graphCache, projects: projectsCache } });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[viz] Workspace Visualizer → http://localhost:${PORT}`);
});
