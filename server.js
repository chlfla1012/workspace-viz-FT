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
let claudeEditsMap = new Map();       // filePath → EditRecord[]
let sessionConvosMap = new Map();     // sessionId → { project, messages[], firstTs, lastTs }
let sessionDecisionsMap = new Map();  // sessionId → DecisionSession

// ─── JSONL: parse edits + conversations ───────────────────────────────────────
async function parseAllClaudeHistory() {
  const newEditsMap = new Map();
  const newConvosMap = new Map();
  const newDecisionsMap = new Map();

  let projectDirs = [];
  try { projectDirs = fs.readdirSync(CLAUDE_PROJECTS_DIR); } catch (e) {
    return { editsMap: newEditsMap, convosMap: newConvosMap, decisionsMap: newDecisionsMap };
  }

  for (const projectDir of projectDirs) {
    const projectPath = path.join(CLAUDE_PROJECTS_DIR, projectDir);
    let files = [];
    try { files = fs.readdirSync(projectPath).filter(f => f.endsWith('.jsonl')); } catch (e) { continue; }

    for (const file of files) {
      const filePath = path.join(projectPath, file);
      try {
        await parseJsonlFile(filePath, newEditsMap, newConvosMap, newDecisionsMap);
        jsonlMtimes.set(filePath, fs.statSync(filePath).mtimeMs);
      } catch (e) { /* skip */ }
    }
  }

  // Post-process: detect debug patterns (3+ edits on same file within a session)
  for (const [, dec] of newDecisionsMap) {
    const fileCounts = {};
    for (const e of dec.events) {
      if (e.kind === 'action' && e.filePath) {
        fileCounts[e.filePath] = (fileCounts[e.filePath] || 0) + 1;
      }
    }
    dec.debugPatterns = Object.entries(fileCounts)
      .filter(([, count]) => count >= 3)
      .map(([filePath, count]) => ({ filePath: path.basename(filePath), fullPath: filePath, editCount: count }));
  }

  return { editsMap: newEditsMap, convosMap: newConvosMap, decisionsMap: newDecisionsMap };
}

async function parseJsonlFile(filePath, editsMap, convosMap, decisionsMap) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const ERROR_KEYWORDS = /\b(Error|Failed|failed|undefined is not|Cannot read|ENOENT|EACCES|SyntaxError|TypeError|ReferenceError|Exception|Traceback)\b/;

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
    const project = (cwdProject && cwdProject !== '' && cwdProject !== '.') ? cwdProject : null;

    // ── DecisionSession 초기화 헬퍼 ──
    const getDecision = () => {
      if (!decisionsMap || !sid) return null;
      if (!decisionsMap.has(sid)) {
        decisionsMap.set(sid, { project, events: [], errorCount: 0, debugPatterns: [] });
      }
      const dec = decisionsMap.get(sid);
      if (!dec.project && project) dec.project = project;
      return dec;
    };

    // ── User messages (대화 내용 + tool_result) ──
    if (obj.type === 'user' && sid) {
      const msg = obj.message || {};
      const content = msg.content;

      // tool_result 처리 (에러 감지)
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type !== 'tool_result') continue;
          const dec = getDecision();
          if (!dec || dec.events.length >= 50) continue;

          const isError = block.is_error === true;
          let resultText = '';
          if (typeof block.content === 'string') {
            resultText = block.content;
          } else if (Array.isArray(block.content)) {
            resultText = block.content.filter(c => c.type === 'text').map(c => c.text || '').join(' ');
          }
          const detectedError = isError || ERROR_KEYWORDS.test(resultText);
          if (detectedError) dec.errorCount++;
          dec.events.push({
            ts, kind: 'result',
            isError: detectedError,
            text: resultText.slice(0, 200),
            errorSnippet: detectedError ? resultText.slice(0, 150) : undefined,
            toolUseId: block.tool_use_id,
          });
        }
      }

      // 일반 user 텍스트 메시지
      let text = '';
      if (typeof content === 'string') {
        text = content;
      } else if (Array.isArray(content)) {
        text = content.filter(c => c.type === 'text').map(c => c.text || '').join(' ');
      }
      text = text.replace(/<[^>]+>/g, '').trim();
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

    // ── Assistant (text 독백 + tool_use 편집) ──
    if (obj.type === 'assistant' && sid) {
      const msg = obj.message || {};
      if (!Array.isArray(msg.content)) continue;

      for (const block of msg.content) {
        // ── AI 자기 독백 (reasoning) ──
        if (block.type === 'text') {
          const dec = getDecision();
          if (dec && dec.events.length < 50 && block.text && block.text.trim().length > 5) {
            dec.events.push({
              ts, kind: 'reasoning',
              text: block.text.trim().slice(0, 400),
            });
          }
          continue;
        }

        // ── tool_use (action) ──
        if (block.type === 'tool_use') {
          const input = block.input || {};
          const targetPath = input.file_path || input.path;

          // action 이벤트 기록
          const dec = getDecision();
          if (dec && dec.events.length < 50) {
            dec.events.push({
              ts, kind: 'action',
              tool: block.name,
              filePath: targetPath ? path.basename(targetPath) : undefined,
              fullPath: targetPath || undefined,
              toolUseId: block.id,
            });
          }

          // 기존 editsMap 로직 (Edit/Write/MultiEdit만)
          if (!['Edit', 'Write', 'MultiEdit'].includes(block.name)) continue;
          if (!targetPath) continue;

          const record = { sessionId: sid, timestamp: ts, cwd, tool: block.name };
          if (!editsMap.has(targetPath)) editsMap.set(targetPath, []);
          editsMap.get(targetPath).push(record);

          const fileProject = targetPath.startsWith(WORKSPACE_DIR)
            ? path.relative(WORKSPACE_DIR, targetPath).split(path.sep)[0]
            : null;
          const resolvedProject = project || (fileProject && fileProject !== '' ? fileProject : null);

          if (!convosMap.has(sid)) {
            convosMap.set(sid, { project: resolvedProject, messages: [], firstTs: ts, lastTs: ts });
          }
          const c = convosMap.get(sid);
          if (!c.project && resolvedProject) c.project = resolvedProject;
          if (ts > (c.lastTs || '')) c.lastTs = ts;
          if (!c.firstTs || ts < c.firstTs) c.firstTs = ts;

          // decisionsMap project 동기화
          if (decisionsMap && decisionsMap.has(sid) && !decisionsMap.get(sid).project && resolvedProject) {
            decisionsMap.get(sid).project = resolvedProject;
          }
        }
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

    // CLAUDE.md full sections parse
    const claudeMdSections = parseCLAUDEmd(claudeMdPath);

    // Phase progress
    const phaseData = parsePhaseFile(projectPath);

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
      claudeMd,
      claudeMdSections,
      phaseData,
    });
  }

  // Sort: most recently active first
  projects.sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''));
  return projects;
}

// ─── CLAUDE.md section parser ─────────────────────────────────────────────────
function parseCLAUDEmd(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split('\n');
    const sections = [];
    let current = null;
    let inCode = false;
    let codeLines = [];
    let codeBlock = null;

    for (const line of lines) {
      // Code block toggle
      if (line.startsWith('```')) {
        if (!inCode) {
          inCode = true;
          codeBlock = line.slice(3).trim() || 'bash';
          codeLines = [];
        } else {
          inCode = false;
          if (current) {
            current.blocks.push({ type: 'code', lang: codeBlock, content: codeLines.join('\n') });
          }
          codeBlock = null;
          codeLines = [];
        }
        continue;
      }
      if (inCode) { codeLines.push(line); continue; }

      // Section headers
      const h2 = line.match(/^## (.+)/);
      const h3 = line.match(/^### (.+)/);
      if (h2) {
        if (current) sections.push(current);
        current = { title: h2[1].trim(), level: 2, blocks: [] };
        continue;
      }
      if (h3) {
        if (current) sections.push(current);
        current = { title: h3[1].trim(), level: 3, blocks: [] };
        continue;
      }

      if (!current) continue;
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Table rows
      if (trimmed.startsWith('|')) {
        const last = current.blocks[current.blocks.length - 1];
        if (last && last.type === 'table') {
          if (!trimmed.match(/^\|[-| ]+\|$/)) {
            last.rows.push(trimmed.split('|').slice(1, -1).map(c => c.trim()));
          }
        } else {
          current.blocks.push({ type: 'table', rows: [] });
          if (!trimmed.match(/^\|[-| ]+\|$/)) {
            current.blocks[current.blocks.length - 1].rows.push(
              trimmed.split('|').slice(1, -1).map(c => c.trim())
            );
          }
        }
        continue;
      }

      // List items
      if (trimmed.match(/^[-*] /)) {
        const last = current.blocks[current.blocks.length - 1];
        const text = trimmed.slice(2).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
        if (last && last.type === 'list') {
          last.items.push(text);
        } else {
          current.blocks.push({ type: 'list', items: [text] });
        }
        continue;
      }

      // Prose
      const text = trimmed.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
      const last = current.blocks[current.blocks.length - 1];
      if (last && last.type === 'prose') {
        last.text += ' ' + text;
      } else {
        current.blocks.push({ type: 'prose', text });
      }
    }
    if (current) sections.push(current);
    return sections.length ? sections : null;
  } catch (e) { return null; }
}

// ─── Phase file parser ────────────────────────────────────────────────────────
function parsePhaseFile(projectPath) {
  const candidates = ['ROADMAP.md', 'PHASE.md', 'TODO.md', 'docs/ROADMAP.md', 'docs/TODO.md'];
  for (const fname of candidates) {
    const fpath = path.join(projectPath, fname);
    if (!fs.existsSync(fpath)) continue;
    try {
      const raw = fs.readFileSync(fpath, 'utf8');
      const phases = [];
      let currentPhase = null;

      for (const line of raw.split('\n')) {
        const phaseMatch = line.match(/^#{1,3}\s+Phase\s*(\d+)\s*[-—:]?\s*(.*)/i);
        if (phaseMatch) {
          if (currentPhase) phases.push(currentPhase);
          currentPhase = {
            number: parseInt(phaseMatch[1]),
            title: phaseMatch[2].trim() || `Phase ${phaseMatch[1]}`,
            items: [],
          };
          continue;
        }
        if (!currentPhase) continue;

        const doneX    = line.match(/^\s*-\s+\[(x|X)\]\s+(.*)/);
        const todoBox  = line.match(/^\s*-\s+\[\s?\]\s+(.*)/);
        const emojiOk  = line.match(/^\s*-?\s*✅\s+(.*)/);
        const strike   = line.match(/^\s*-\s+~~(.+)~~/);

        if (doneX)   currentPhase.items.push({ text: doneX[2].trim(),  done: true });
        else if (todoBox) currentPhase.items.push({ text: todoBox[1].trim(), done: false });
        else if (emojiOk) currentPhase.items.push({ text: emojiOk[1].trim(), done: true });
        else if (strike)  currentPhase.items.push({ text: strike[1].trim(),  done: true });
      }
      if (currentPhase) phases.push(currentPhase);
      if (!phases.length) continue;

      for (const p of phases) {
        const total = p.items.length;
        const done  = p.items.filter(i => i.done).length;
        p.progress  = total > 0 ? Math.round(done / total * 100) : 0;
      }
      const allItems = phases.flatMap(p => p.items);
      const overallProgress = allItems.length > 0
        ? Math.round(allItems.filter(i => i.done).length / allItems.length * 100) : 0;

      return { source: fname, phases, overallProgress };
    } catch (e) { /* skip */ }
  }
  return null;
}

// ─── Root workspace CLAUDE.md auto-generate ───────────────────────────────────
function generateRootCLAUDEmd(projects) {
  const rootPath = path.join(WORKSPACE_DIR, 'CLAUDE.md');
  const lines = [
    '# Workspace Overview',
    `> 自動生成 · ${new Date().toLocaleString('ko-KR')} 기준`,
    '',
    `총 **${projects.length}개** 프로젝트 · Claude 편집 파일 **${projects.reduce((s, p) => s + (p.claudeEditedFiles || 0), 0)}개**`,
    '',
    '---',
    '',
  ];

  for (const p of projects) {
    const conf = { high: '파악 완료', medium: '일부 불명확', low: '정보 부족' }[p.confidence] || '-';
    lines.push(`## ${p.name}`);
    lines.push(`**상태**: ${conf} · **파일**: ${p.fileCount || 0}개 · **세션**: ${(p.sessions || []).length}회`);
    if (p.description) lines.push(`> ${p.description}`);
    if ((p.stack || []).length) lines.push(`**스택**: ${p.stack.join(', ')}`);
    if ((p.features || []).length) {
      lines.push('**주요 기능**:');
      p.features.forEach(f => lines.push(`- ${f}`));
    }
    if (p.claudeMd) lines.push(`**CLAUDE.md 요약**: ${p.claudeMd}`);
    if (p.startCommand) lines.push(`**실행**: \`${p.startCommand}\``);
    lines.push('');
  }

  try {
    fs.writeFileSync(rootPath, lines.join('\n'), 'utf8');
  } catch (e) { console.warn('[viz] Root CLAUDE.md write failed:', e.message); }
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
    const { editsMap, convosMap, decisionsMap } = await parseAllClaudeHistory();
    claudeEditsMap = editsMap;
    sessionConvosMap = convosMap;
    sessionDecisionsMap = decisionsMap;
    graphCache = await buildGraph();
    projectsCache = buildProjectCards();
    generateRootCLAUDEmd(projectsCache);
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

app.get('/api/decisions/:project', (req, res) => {
  if (!sessionDecisionsMap.size && cacheBuilding) return res.json({ loading: true });
  const projectName = req.params.project;
  const sessions = [];

  for (const [sid, dec] of sessionDecisionsMap) {
    if (dec.project !== projectName) continue;
    const convo = sessionConvosMap.get(sid) || {};
    sessions.push({
      sessionId: sid,
      firstTs: convo.firstTs || '',
      lastTs: convo.lastTs || '',
      errorCount: dec.errorCount,
      debugPatterns: dec.debugPatterns,
      events: dec.events,
    });
  }
  sessions.sort((a, b) => b.lastTs.localeCompare(a.lastTs));

  const summary = {
    totalErrors:    sessions.reduce((s, x) => s + x.errorCount, 0),
    totalReasoning: sessions.reduce((s, x) => s + x.events.filter(e => e.kind === 'reasoning').length, 0),
    totalActions:   sessions.reduce((s, x) => s + x.events.filter(e => e.kind === 'action').length, 0),
    debuggingFiles: [...new Set(sessions.flatMap(s => s.debugPatterns.map(p => p.filePath)))],
  };

  res.json({ project: projectName, sessions, summary });
});

app.get('/api/claudemd/:project', (req, res) => {
  const project = projectsCache?.find(p => p.name === req.params.project);
  if (!project) return res.status(404).json({ error: 'not found' });
  res.json({ sections: project.claudeMdSections || [], raw: project.claudeMd });
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
