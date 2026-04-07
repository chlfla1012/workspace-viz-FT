// ─── 실제 코드 분석 기반 기능 데이터 ────────────────────────────────────────────
const FEATURE_DATA = {
  'bucket-list-main': {
    categories: [
      {
        name: '항목 관리',
        features: [
          { name: '항목 추가', status: 'implemented', file: 'js/app.js', detail: 'handleAdd() → BucketStorage.addItem(), ID=Date.now()' },
          { name: '항목 수정', status: 'implemented', file: 'js/app.js', detail: 'handleEditSubmit() → BucketStorage.updateItem(), 모달 UI' },
          { name: '항목 삭제', status: 'implemented', file: 'js/app.js', detail: 'handleDelete() → BucketStorage.deleteItem(), 확인 알림' },
          { name: '완료 토글', status: 'implemented', file: 'js/app.js', detail: 'handleToggle() → toggleComplete(), 완료 시간 자동 기록' },
        ],
      },
      {
        name: '조회 & 필터',
        features: [
          { name: '전체/진행중/완료 필터', status: 'implemented', file: 'js/storage.js', detail: 'getFilteredList("all"|"active"|"completed")' },
          { name: '통계 조회', status: 'implemented', file: 'js/storage.js', detail: 'getStats() → {total, completed, completionRate}' },
          { name: 'XSS 방지', status: 'implemented', file: 'js/app.js', detail: 'escapeHtml() - textContent/innerHTML 방식' },
        ],
      },
    ],
  },
  'chatbot': {
    categories: [
      {
        name: '메시지 처리',
        features: [
          { name: 'LINE Webhook 수신', status: 'implemented', file: 'massage-chatbot/index.js', detail: 'POST /webhook, 서명 검증 verifyLineSignature()' },
          { name: '자동 응답', status: 'implemented', file: 'massage-chatbot/index.js', detail: 'getAutoReply() - 영업시간/전화번호/위치 키워드' },
          { name: '사용자 메시지 로그', status: 'implemented', file: 'massage-chatbot/index.js', detail: 'Conversations.log() - role/message/intent' },
          { name: 'LINE 메시지 응답', status: 'implemented', file: 'massage-chatbot/index.js', detail: 'replyToLine() - axios POST to LINE_REPLY_URL' },
        ],
      },
      {
        name: '자연어 처리',
        features: [
          { name: '대화 히스토리 관리', status: 'implemented', file: 'massage-chatbot/chains.js', detail: 'respondToUser() - 최근 10턴 히스토리 기반' },
          { name: '의도 구조화 파싱', status: 'implemented', file: 'massage-chatbot/chains.js', detail: 'parseReservation() - Zod 스키마로 예약/결제 의도 추출' },
          { name: '도메인별 프롬프트', status: 'implemented', file: 'massage-chatbot/chains.js', detail: 'pickDomainPrompt() - 상담/예약/결제 자동 선택' },
          { name: '일본어 정중 톤', status: 'implemented', file: 'massage-chatbot/llm.js', detail: 'jpStyleSystem - 일본어 정중체 유지' },
        ],
      },
      {
        name: '예약 관리',
        features: [
          { name: '세션 기반 정보 수집', status: 'implemented', file: 'memory/reservationSession.js', detail: 'ReservationSession.get/set - 15분 TTL, course/duration/start_time' },
          { name: '부족 정보 자동 질문', status: 'implemented', file: 'massage-chatbot/index.js', detail: 'missingFields() - 필수 필드 자동 감지 후 재질문' },
          { name: '일본어 날짜 파싱', status: 'implemented', file: 'utils/datetime.js', detail: 'parseJpDateTimeToJstIso() - "明日15時" 등 파싱' },
          { name: '시간 충돌 체크', status: 'implemented', file: 'massage-chatbot/index.js', detail: 'Reservations.overlaps() - UTC 기반 겹침 검사' },
          { name: 'Google Calendar 연동', status: 'implemented', file: 'calendarService.js', detail: 'handleReservationFromGPT() - JST 타임존 이벤트 생성' },
          { name: '예약 DB 저장', status: 'implemented', file: 'dao/reservations.js', detail: 'Reservations.create() - user_id/course/start_time(UTC)/end_time(UTC)' },
          { name: '예약 확인 메시지', status: 'implemented', file: 'massage-chatbot/index.js', detail: 'JST 포맷 확인 메시지 LINE으로 전송' },
        ],
      },
      {
        name: '결제',
        features: [
          { name: 'Stripe Checkout 세션', status: 'implemented', file: 'payment/stripeService.js', detail: 'createCheckoutSession() - 금액/통화/상품명 지정' },
          { name: '코스-가격 변환', status: 'implemented', file: 'utils/pricing.js', detail: 'courseToPriceJPY() - 코스명/분수 → JPY 금액' },
          { name: 'Stripe Webhook', status: 'implemented', file: 'massage-chatbot/index.js', detail: 'POST /payment/webhook - checkout.session.completed 처리' },
          { name: '결제 완료 LINE 알림', status: 'implemented', file: 'massage-chatbot/index.js', detail: '결제 완료 시 사용자에게 LINE 알림 자동 전송' },
          { name: '결제 성공/취소 페이지', status: 'implemented', file: 'massage-chatbot/index.js', detail: 'GET /payment/success, GET /payment/cancel' },
        ],
      },
      {
        name: '데이터 관리',
        features: [
          { name: '사용자 관리', status: 'implemented', file: 'dao/users.js', detail: 'Users.upsert() - user_id/language' },
          { name: '대화 로깅', status: 'implemented', file: 'dao/conversations.js', detail: 'Conversations.log() - role/message/intent/created_at' },
          { name: '결제 이력 저장', status: 'implemented', file: 'dao/payments.js', detail: 'Payments - stripe_session_id/amount_jpy/status' },
        ],
      },
    ],
  },
  'kenshin': {
    categories: [
      {
        name: '인증 & 권한',
        features: [
          { name: '로그인 (JWT)', status: 'implemented', file: 'kenshin-server/routes/adminRoutes.js', detail: 'POST /admin/login - JWT 발급, 역할 기반' },
          { name: '관리자 CRUD', status: 'implemented', file: 'kenshin-server/routes/adminRoutes.js', detail: 'create/update/delete/list/reset-password' },
          { name: '초기 비밀번호 변경', status: 'implemented', file: 'kenshin-app/src/features/auth/LoginPage.jsx', detail: '첫 로그인 시 강제 변경 모달' },
          { name: '역할 기반 접근 제어', status: 'implemented', file: 'kenshin-app/src/App.jsx', detail: 'RequireAdminRole - 最高/一般 관리자만 AdminPage 접근' },
        ],
      },
      {
        name: '건물 & 방 관리',
        features: [
          { name: '건물 등록/수정/삭제', status: 'implemented', file: 'kenshin-server/routes/buildingRoutes.js', detail: 'POST /building/register|update|delete' },
          { name: '건물 목록 조회', status: 'implemented', file: 'kenshin-server/routes/buildingRoutes.js', detail: 'POST /building/list' },
          { name: '방 등록/수정/삭제', status: 'implemented', file: 'kenshin-server/routes/roomRoutes.js', detail: 'POST /room/register|update|delete - 이미지 포함 multipart' },
          { name: '방 목록/상세 조회', status: 'implemented', file: 'kenshin-server/routes/roomRoutes.js', detail: 'POST /room/list|detail - building_id 필터' },
        ],
      },
      {
        name: '계량기 & OCR',
        features: [
          { name: '이미지 업로드', status: 'implemented', file: 'kenshin-server/routes/meterImageRoutes.js', detail: 'POST /meter-image/upload - multer 미들웨어' },
          { name: '이미지 목록 조회', status: 'implemented', file: 'kenshin-server/routes/meterImageRoutes.js', detail: 'POST /meter-image/list - meter_id 필터, 최신순' },
          { name: 'OCR 인식 실행', status: 'implemented', file: 'kenshin-server/routes/meterRoutes.js', detail: 'POST /meter/recognize - Google Vision API' },
          { name: '이미지 상세/미리보기', status: 'implemented', file: 'kenshin-app/src/features/meter/ImageDetailModal.jsx', detail: '캡처 날짜, 이미지 미리보기' },
        ],
      },
      {
        name: '청구 관리',
        features: [
          { name: '청구 목록 조회', status: 'implemented', file: 'kenshin-server/routes/billingRoutes.js', detail: '건물/상태/기간/고객명 필터링' },
          { name: '청구 상태 업데이트', status: 'implemented', file: 'kenshin-server/routes/billingRoutes.js', detail: '未請求/請求済/入金待ち/完了 상태 관리' },
          { name: 'CSV 내보내기', status: 'implemented', file: 'kenshin-server/routes/billingRoutes.js', detail: 'POST /billing/export - CsvExportModal 연동' },
          { name: '내보내기 미리보기', status: 'implemented', file: 'kenshin-server/routes/billingRoutes.js', detail: 'POST /billing/export-preview' },
        ],
      },
      {
        name: '대시보드 & 통계',
        features: [
          { name: '요약 정보', status: 'implemented', file: 'kenshin-server/routes/dashboardRoutes.js', detail: 'captureCount/requestCount/successRate/failCount' },
          { name: '인식률 추이', status: 'implemented', file: 'kenshin-server/routes/dashboardRoutes.js', detail: 'GET /dashboard/recognition-trend?range=7d - 일별 성공률' },
        ],
      },
      {
        name: '플랜 관리',
        features: [
          { name: '플랜 CRUD', status: 'implemented', file: 'kenshin-server/routes/planMasterRoutes.js', detail: 'GET|POST|PUT|DELETE /plan-master/*' },
          { name: '방별 플랜 변경', status: 'implemented', file: 'kenshin-server/routes/planMasterRoutes.js', detail: 'PUT /plan-master/room/:roomId/plan' },
        ],
      },
    ],
  },
  'claude-code-mastery': {
    categories: [
      {
        name: '레이아웃 & 네비게이션',
        features: [
          { name: '반응형 메뉴', status: 'implemented', file: 'web-resume/index.html', detail: 'PC + 햄버거 메뉴(모바일)' },
          { name: '다크/라이트 모드', status: 'implemented', file: 'web-resume/assets/js/main.js', detail: 'localStorage 저장, 즉시 반영' },
          { name: '한국어/영어 다국어', status: 'implemented', file: 'web-resume/assets/js/main.js', detail: 'i18nData, data-i18n 속성 기반' },
        ],
      },
      {
        name: '콘텐츠 섹션',
        features: [
          { name: '타이핑 애니메이션', status: 'implemented', file: 'web-resume/assets/js/main.js', detail: 'hero.typing 배열 순차 타이핑' },
          { name: '기술 스택 표시', status: 'implemented', file: 'web-resume/index.html', detail: 'Frontend/Backend/DB 카테고리별' },
          { name: '경력 타임라인', status: 'implemented', file: 'web-resume/assets/js/main.js', detail: 'experience 객체 배열 렌더링' },
          { name: '프로젝트 카드 + 필터', status: 'implemented', file: 'web-resume/assets/js/main.js', detail: '전체/풀스택/프론트/백엔드 필터' },
        ],
      },
      {
        name: '연락처 폼',
        features: [
          { name: '폼 입력 & 검증', status: 'implemented', file: 'web-resume/assets/js/main.js', detail: '이름 2자+, 유효 이메일, 메시지 10자+' },
          { name: '백엔드 전송', status: 'partial', file: 'web-resume/assets/js/main.js', detail: '성공 메시지 표시만 구현, 실제 전송 미구현' },
        ],
      },
    ],
  },
  'my-portfolio-2026': {
    categories: [
      {
        name: '전체',
        features: [
          { name: '프로젝트 초기화', status: 'partial', file: 'CLAUDE.md', detail: '기본 구조 문서화만 완료, 코드 미구현' },
        ],
      },
    ],
  },
  'witts-review': {
    categories: [
      {
        name: '문서 관리',
        features: [
          { name: '반기 평가 문서 저장', status: 'implemented', file: '/', detail: '엑셀/텍스트 파일, Git 버전 관리' },
        ],
      },
    ],
  },
  'output-style-test': {
    categories: [
      {
        name: '계산기',
        features: [
          { name: '사칙연산', status: 'implemented', file: 'calculator.html', detail: '+/-/*/÷ 기본 연산' },
          { name: '터미널 UI', status: 'implemented', file: 'calculator.html', detail: 'Matrix 스타일 다크 테마' },
        ],
      },
    ],
  },
};

// ─── 상태별 스타일 ──────────────────────────────────────────────────────────────
const STATUS_STYLE = {
  implemented: { color: '#3fb950', bg: '#1a3a1f', label: '구현됨',  icon: '✓' },
  partial:     { color: '#d29922', bg: '#2a2000', label: '일부 구현', icon: '◐' },
  missing:     { color: '#f85149', bg: '#2a0a0a', label: '미구현',   icon: '✗' },
  unknown:     { color: '#8b949e', bg: '#1c2128', label: '불명확',   icon: '?' },
};

const CAT_COLORS = [
  '#58a6ff', '#3fb950', '#F5E642', '#FF6B35', '#9B59B6',
  '#26C6DA', '#EC407A', '#E67E22', '#2ECC71', '#4287F5',
];

let pnetNetwork = null;
let pnetNodes   = null;
let pnetEdges   = null;
let _pnetProjects = [];

function buildPnetData(projects) {
  const nodes = [];
  const edges = [];

  projects.forEach((p, pi) => {
    const projId  = `proj:${p.name}`;
    const featData = FEATURE_DATA[p.name];
    const confBorder = { high: '#3fb950', medium: '#d29922', low: '#f85149' }[p.confidence] || '#8b949e';

    // ── Project hub node ──
    const sessCount = (p.sessions || []).length;
    nodes.push({
      id: projId,
      label: p.name,
      title: buildProjTitle(p),
      group: 'project',
      shape: 'ellipse',
      color: { background: '#1f3a5f', border: confBorder,
               highlight: { background: '#388bfd', border: '#79c0ff' } },
      font: { color: '#e6edf3', size: 13, bold: true },
      size: 30 + Math.min(sessCount * 3, 15),
      borderWidth: 3,
      _data: p,
    });

    if (!featData) {
      // No data — show placeholder
      const uid = `feat:${p.name}:unknown`;
      nodes.push({ id: uid, label: '분석 데이터 없음', group: 'unknown',
        shape: 'box', size: 10,
        color: { background: '#2a0a0a', border: '#f85149' },
        font: { color: '#f85149', size: 10 } });
      edges.push({ id: `e:${projId}:${uid}`, from: projId, to: uid,
        color: { color: '#f8514944' }, dashes: true,
        arrows: { to: { enabled: true, scaleFactor: 0.4 } } });
      return;
    }

    featData.categories.forEach((cat, ci) => {
      const catColor = CAT_COLORS[ci % CAT_COLORS.length];
      const catId = `cat:${p.name}:${cat.name}`;

      // ── Category node ──
      const totalF = cat.features.length;
      const doneF  = cat.features.filter(f => f.status === 'implemented').length;
      const pct    = totalF > 0 ? Math.round(doneF / totalF * 100) : 0;
      const catBorder = pct === 100 ? '#3fb950' : pct > 50 ? '#d29922' : '#f85149';

      nodes.push({
        id: catId,
        label: `${cat.name}\n${doneF}/${totalF}`,
        title: buildCatTitle(cat),
        group: 'category',
        shape: 'box',
        color: { background: '#161b22', border: catBorder,
                 highlight: { background: '#21262d', border: catColor } },
        font: { color: catColor, size: 11, bold: true },
        borderWidth: 2,
        margin: 6,
        _cat: cat,
        _project: p.name,
      });

      edges.push({
        id: `e:${projId}:${catId}`,
        from: projId,
        to: catId,
        color: { color: `${catColor}66`, highlight: catColor },
        width: 2,
        arrows: { to: { enabled: true, scaleFactor: 0.4 } },
        smooth: { type: 'curvedCW', roundness: 0.2 },
      });

      // ── Feature nodes ──
      cat.features.forEach((feat, fi) => {
        const featId = `feat:${p.name}:${cat.name}:${fi}`;
        const st = STATUS_STYLE[feat.status] || STATUS_STYLE.unknown;

        nodes.push({
          id: featId,
          label: `${st.icon} ${feat.name}`,
          title: buildFeatTitle(feat),
          group: 'feature',
          shape: 'box',
          color: { background: st.bg, border: st.color,
                   highlight: { background: '#21262d', border: st.color } },
          font: { color: st.color, size: 10 },
          borderWidth: 1,
          margin: 4,
          _feat: feat,
        });

        edges.push({
          id: `e:${catId}:${featId}`,
          from: catId,
          to: featId,
          color: { color: `${st.color}55`, highlight: st.color },
          width: 1,
          arrows: { to: { enabled: true, scaleFactor: 0.3 } },
          smooth: { type: 'curvedCW', roundness: 0.15 },
        });
      });
    });

    // ── Session nodes (up to 3) ──
    (p.sessions || []).slice(0, 3).forEach((sess, si) => {
      const sesId = `sess:${sess.sessionId}`;
      const dateStr = sess.firstTs ? new Date(sess.firstTs).toLocaleDateString('ko-KR') : '';
      nodes.push({
        id: sesId,
        label: sess.sessionId.slice(0, 8) + '\n' + dateStr,
        title: buildSessTitle(sess, p.name),
        group: 'session',
        shape: 'dot',
        color: { background: '#2a1500', border: '#FF6B35',
                 highlight: { background: '#3a2000', border: '#FF9A76' } },
        font: { color: '#FF6B35', size: 9 },
        size: 10,
        _sess: sess,
        _project: p.name,
      });
      edges.push({
        id: `e:${sesId}:${projId}:${si}`,
        from: sesId,
        to: projId,
        color: { color: '#FF6B3555', highlight: '#FF6B35' },
        width: 2,
        dashes: [4, 4],
        arrows: { to: { enabled: true, scaleFactor: 0.4 } },
      });
    });
  });

  return { nodes, edges };
}

// ── Tooltip builders ──────────────────────────────────────────────────────────
function buildProjTitle(p) {
  const conf = { high: '파악 완료', medium: '일부 불명확', low: '정보 부족' }[p.confidence] || '-';
  const confColor = { high: '#3fb950', medium: '#d29922', low: '#f85149' }[p.confidence] || '#8b949e';
  return `<div style="background:#1c2128;padding:8px;border-radius:6px;font-size:11px;color:#e6edf3;max-width:220px">
    <b>${p.name}</b> <span style="color:${confColor}">[${conf}]</span><br>
    <span style="color:#8b949e">${p.description || ''}</span><br>
    파일 ${p.fileCount || 0}개 · Claude ${p.claudeEditedFiles || 0}파일 편집
  </div>`;
}

function buildCatTitle(cat) {
  const done  = cat.features.filter(f => f.status === 'implemented').length;
  const part  = cat.features.filter(f => f.status === 'partial').length;
  const total = cat.features.length;
  const lines = cat.features.map(f => {
    const st = STATUS_STYLE[f.status] || STATUS_STYLE.unknown;
    return `<div style="color:${st.color}">${st.icon} ${f.name}</div>`;
  }).join('');
  return `<div style="background:#1c2128;padding:8px;border-radius:6px;font-size:11px;max-width:230px">
    <b style="color:#e6edf3">${cat.name}</b>
    <span style="color:#8b949e;margin-left:6px">구현 ${done}/${total}${part > 0 ? ` (일부 ${part})` : ''}</span>
    <div style="margin-top:4px">${lines}</div>
  </div>`;
}

function buildFeatTitle(feat) {
  const st = STATUS_STYLE[feat.status] || STATUS_STYLE.unknown;
  return `<div style="background:#1c2128;padding:8px;border-radius:6px;font-size:11px;max-width:240px">
    <b style="color:${st.color}">${st.icon} ${feat.name}</b>
    <span style="color:${st.color};background:${st.bg};padding:1px 5px;border-radius:3px;margin-left:6px;font-size:10px">${st.label}</span><br>
    <span style="color:#8b949e;font-size:10px">${feat.file || ''}</span><br>
    <span style="color:#c9d1d9">${feat.detail || ''}</span>
  </div>`;
}

function buildSessTitle(sess, projName) {
  const msgs = (sess.messages || []).slice(0, 2);
  return `<div style="background:#1c2128;padding:8px;border-radius:6px;font-size:11px;max-width:230px">
    <b style="color:#FF6B35">세션 ${sess.sessionId.slice(0, 8)}</b> · <span style="color:#8b949e">${projName}</span><br>
    <span style="color:#8b949e">${sess.firstTs ? new Date(sess.firstTs).toLocaleString('ko-KR') : ''}</span><br>
    ${msgs.map(m => `<div style="color:#c9d1d9;margin-top:2px">${escH(m.text.slice(0, 60))}</div>`).join('')}
  </div>`;
}

function escH(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Init / Update ────────────────────────────────────────────────────────────
function _initPnetInternal(projects) {
  _pnetProjects = projects;
  const container = document.getElementById('pnet-canvas');
  if (!container) return;

  // Destroy existing instance to avoid event listener duplication
  if (pnetNetwork) { pnetNetwork.destroy(); pnetNetwork = null; }

  const { nodes, edges } = buildPnetData(projects);
  pnetNodes = new vis.DataSet(nodes);
  pnetEdges = new vis.DataSet(edges);

  const options = {
    physics: {
      solver: 'forceAtlas2Based',
      forceAtlas2Based: {
        gravitationalConstant: -120,
        centralGravity: 0.008,
        springLength: 140,
        springConstant: 0.05,
        damping: 0.5,
        avoidOverlap: 0.9,
      },
      stabilization: { iterations: 400, fit: true },
    },
    interaction: {
      hover: true,
      tooltipDelay: 60,
      zoomView: true,
      dragView: true,
      navigationButtons: false,
    },
    edges: {
      smooth: { type: 'continuous', roundness: 0.25 },
    },
    nodes: { borderWidthSelected: 3 },
  };

  pnetNetwork = new vis.Network(container, { nodes: pnetNodes, edges: pnetEdges }, options);

  pnetNetwork.on('click', params => {
    if (!params.nodes.length) {
      document.getElementById('pnet-detail').classList.add('hidden');
      return;
    }
    const node = pnetNodes.get(params.nodes[0]);
    if (!node) return;

    if (node.group === 'project' && node._data) {
      showPnetDetail(node._data);
    } else if (node.group === 'category' && node._cat) {
      showCatDetail(node._cat, node._project);
    } else if (node.group === 'feature' && node._feat) {
      showFeatDetail(node._feat);
    } else if (node.group === 'session' && node._sess) {
      window.openSessionModal(node._sess.sessionId, node._project);
    } else {
      document.getElementById('pnet-detail').classList.add('hidden');
    }
  });

  pnetNetwork.on('stabilizationIterationsDone', () => {
    pnetNetwork.setOptions({ physics: { enabled: false } });
  });

  window.pnetNetwork = pnetNetwork;
}

// ─── Detail panel renderers ───────────────────────────────────────────────────
function showPnetDetail(p) {
  const featData = FEATURE_DATA[p.name];
  const confColor = { high: '#3fb950', medium: '#d29922', low: '#f85149' }[p.confidence] || '#8b949e';
  const confLabel = { high: '파악 완료', medium: '일부 불명확', low: '정보 부족' }[p.confidence] || '-';

  let catSummary = '';
  if (featData) {
    catSummary = featData.categories.map(cat => {
      const done = cat.features.filter(f => f.status === 'implemented').length;
      const part = cat.features.filter(f => f.status === 'partial').length;
      const total = cat.features.length;
      const pct = total > 0 ? Math.round(done / total * 100) : 0;
      const barColor = pct === 100 ? '#3fb950' : pct > 50 ? '#d29922' : '#f85149';
      return `
        <div class="pdet-cat-row" onclick="showCatDetailByName('${p.name}','${escH(cat.name)}')">
          <div class="pdet-cat-name">${cat.name}</div>
          <div class="pdet-prog-bar"><div style="width:${pct}%;background:${barColor};height:100%;border-radius:2px"></div></div>
          <div class="pdet-prog-label" style="color:${barColor}">${done}/${total}</div>
        </div>`;
    }).join('');
  }

  setPnetDetail(`
    <div class="pnet-detail-header">
      <strong>${p.name}</strong>
      <span style="color:${confColor};font-size:10px;margin-left:6px">${confLabel}</span>
      <span class="pnet-detail-close" onclick="document.getElementById('pnet-detail').classList.add('hidden')">✕</span>
    </div>
    <p style="font-size:11px;color:#8b949e;margin:4px 0 10px;line-height:1.4">${p.description || '설명 없음'}</p>
    ${catSummary ? `<div class="pdet-label" style="margin-bottom:6px">카테고리별 구현 현황</div>${catSummary}` : ''}
    ${(p.unknowns||[]).length > 0 ? `
      <div class="pdet-unknowns" style="margin-top:10px">
        <div class="pdet-label" style="margin-bottom:4px">⚠ 알 수 없는 정보</div>
        ${p.unknowns.map(u => `<div style="font-size:10px;color:#ffa07a">• ${u}</div>`).join('')}
      </div>` : ''}
  `);
}

function showCatDetail(cat, projectName) {
  const rows = cat.features.map(feat => {
    const st = STATUS_STYLE[feat.status] || STATUS_STYLE.unknown;
    return `
      <div class="pdet-feat-row">
        <span class="pdet-feat-icon" style="color:${st.color}">${st.icon}</span>
        <div class="pdet-feat-info">
          <div class="pdet-feat-name">${feat.name}</div>
          <div class="pdet-feat-detail">${feat.detail || ''}</div>
          <div class="pdet-feat-file">${feat.file || ''}</div>
        </div>
        <span class="pdet-feat-status" style="color:${st.color};background:${st.bg}">${st.label}</span>
      </div>`;
  }).join('');

  const done  = cat.features.filter(f => f.status === 'implemented').length;
  const part  = cat.features.filter(f => f.status === 'partial').length;
  const total = cat.features.length;

  setPnetDetail(`
    <div class="pnet-detail-header">
      <span style="color:#8b949e;font-size:11px;cursor:pointer" onclick="showProjDetailByName('${escH(projectName)}')">← ${projectName}</span>
      <span class="pnet-detail-close" onclick="document.getElementById('pnet-detail').classList.add('hidden')">✕</span>
    </div>
    <div style="font-size:13px;font-weight:700;color:#e6edf3;margin:6px 0 2px">${cat.name}</div>
    <div style="font-size:11px;color:#8b949e;margin-bottom:10px">
      구현 ${done}/${total}${part > 0 ? ` · 일부 구현 ${part}` : ''}
    </div>
    <div class="pdet-feat-list">${rows}</div>
  `);
}

function showFeatDetail(feat) {
  const st = STATUS_STYLE[feat.status] || STATUS_STYLE.unknown;
  setPnetDetail(`
    <div class="pnet-detail-header">
      <strong style="color:${st.color}">${st.icon} ${feat.name}</strong>
      <span class="pnet-detail-close" onclick="document.getElementById('pnet-detail').classList.add('hidden')">✕</span>
    </div>
    <div style="margin-top:8px">
      <div class="pdet-row"><span class="pdet-label">상태</span>
        <span style="color:${st.color};background:${st.bg};padding:2px 7px;border-radius:4px;font-size:11px">${st.label}</span>
      </div>
      <div class="pdet-row"><span class="pdet-label">파일</span>
        <code style="font-size:10px;color:#79c0ff;word-break:break-all">${feat.file || '-'}</code>
      </div>
      <div class="pdet-row" style="flex-direction:column;gap:2px">
        <span class="pdet-label">상세</span>
        <span style="font-size:12px;color:#c9d1d9;line-height:1.5">${feat.detail || '-'}</span>
      </div>
    </div>
  `);
}

function showCatDetailByName(projectName, catName) {
  const fd = FEATURE_DATA[projectName];
  if (!fd) return;
  const cat = fd.categories.find(c => c.name === catName);
  if (cat) showCatDetail(cat, projectName);
}

function showProjDetailByName(projectName) {
  const p = _pnetProjects.find(x => x.name === projectName);
  if (p) showPnetDetail(p);
}

function setPnetDetail(html) {
  document.getElementById('pnet-detail-inner').innerHTML = html;
  document.getElementById('pnet-detail').classList.remove('hidden');
}

let _pnetFilter = 'all';

function updatePnet(projects) {
  if (!pnetNetwork) { initPnet(projects); return; }
  _pnetProjects = projects;
  applyPnetFilter(_pnetFilter);
}

function fitPnet() {
  if (pnetNetwork) pnetNetwork.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
}

// ─── Project filter ───────────────────────────────────────────────────────────
function setPnetFilter(projectName) {
  _pnetFilter = projectName;

  // Update button states
  document.getElementById('pnet-btn-all').classList.toggle('active', projectName === 'all');
  document.querySelectorAll('.pnet-proj-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.project === projectName);
  });

  applyPnetFilter(projectName);
  document.getElementById('pnet-detail').classList.add('hidden');
}

function applyPnetFilter(projectName) {
  if (!pnetNodes || !pnetEdges) return;

  const projects = projectName === 'all'
    ? _pnetProjects
    : _pnetProjects.filter(p => p.name === projectName);

  const { nodes, edges } = buildPnetData(projects);
  pnetNodes.clear(); pnetEdges.clear();
  pnetNodes.add(nodes); pnetEdges.add(edges);
  pnetNetwork.setOptions({ physics: { enabled: true } });
  setTimeout(() => {
    if (pnetNetwork) {
      pnetNetwork.setOptions({ physics: { enabled: false } });
      pnetNetwork.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    }
  }, 2500);
}

function buildPnetProjectButtons(projects) {
  const container = document.getElementById('pnet-project-btns');
  if (!container) return;
  container.innerHTML = projects.map(p => {
    const confColor = { high: '#3fb950', medium: '#d29922', low: '#f85149' }[p.confidence] || '#8b949e';
    return `<button class="btn pnet-proj-btn" data-project="${p.name}"
      style="border-color:${confColor}44"
      onclick="setPnetFilter('${p.name}')">${p.name}</button>`;
  }).join('');
}

window.initPnet = function(projects) {
  buildPnetProjectButtons(projects);
  _initPnetInternal(projects);
};
window.updatePnet = updatePnet;
window.fitPnet = fitPnet;
window.setPnetFilter = setPnetFilter;
window.showCatDetailByName = showCatDetailByName;
window.showProjDetailByName = showProjDetailByName;
