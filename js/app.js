/**
 * ============================================================================
 * HANA EXAM ONLINE - MAIN APPLICATION LOGIC (js/app.js)
 * ============================================================================
 * รองรับ:
 * 1. หน้า Launch (Start Exam/Quiz, Team Challenge, Exit Ticket, Quick Question MC/TF/SA)
 * 2. หน้า Library + ปุ่ม Add Exam/Quiz ครบทั้ง 5 ฟังก์ชัน:
 *    - Generate Questions with AI (Prompt + แนบไฟล์ Word/PDF/Excel)
 *    - Copy-Paste Questions
 *    - Extract Questions from Document (.docx, .pdf, .xlsx, .txt)
 *    - Import Questions from Code or Excel Template (พร้อมดาวน์โหลดแม่แบบ Excel)
 *    - Blank Quiz
 * 3. หน้า Rooms: สร้างชื่อห้องสอบใหม่เพิ่มได้ไม่จำกัด สลับใช้งานได้ทันที และซิงค์ลง Google Sheets
 * 4. หน้า Live Results แบบ Real-time (Show Names, Show Responses, Show Results,
 *    Pause, Finish Activity, Invite Examinees, แถบสีเขียว/แดง และ Class Total %)
 * 5. หน้าทำข้อสอบผ่านมือถือของผู้เข้าสอบ:
 *    - รองรับ Cross-Device 100% ทั้งการดึงชุดข้อสอบสดจาก Google Sheets ตามรหัสห้อง (`getSessionByRoom`)
 *    - และฝังชุดข้อสอบที่บีบอัด (LZString) ลงในลิงก์เชิญ (`?mode=student&room=...&exam=...`)
 *      ทำให้มือถือเข้าถึงชุดข้อสอบที่ผู้คุมสอบสร้างและเปิดสอบได้ตรงชุด 100% ทันที!
 */

const STORAGE_KEY = 'HANA_EXAM_APP_STATE_V2';
const PREV_STORAGE_KEY = 'HANA_EXAM_APP_STATE_V1';
const LEGACY_STORAGE_KEY = 'SOCRATIVE_APP_STATE_V1';
const SETTINGS_KEY = 'HANA_EXAM_APP_SETTINGS_V2';
const LEGACY_SETTINGS_KEY = 'HANA_EXAM_APP_SETTINGS_V1';

// ตั้งค่า PDF.js worker
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ช่องทางสื่อสาร Real-time ระหว่างแท็บผู้คุมสอบและแท็บผู้เข้าสอบ
const liveChannel = ('BroadcastChannel' in window) ? new BroadcastChannel('hana_exam_realtime_channel') : null;

const DEFAULT_GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzSEMEiZ33E0FEhCmQmgsxueaTijfJNXDG_R_B54ix59EBRBN0TcSa3VfWSM1LbrCkE/exec';
const OLD_GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby3V0oPb2vz7qu2b-RXjCqjMYtdEiySGYcnDmh375IbJBfjS8DTJQ-4z0hOSO0gXL1B/exec';

let appSettings = {
  sheetDocUrl: 'https://docs.google.com/spreadsheets/d/1vPV2GXeJLxlCXrMkbHUSVWUZyLSDT4SnjjhxOEIALGQ/edit',
  gasWebAppUrl: DEFAULT_GAS_WEB_APP_URL,
  geminiApiKey: '',
  roomCode: 'THANAT01'
};

function getDefaultRooms() {
  const now = '2026-11-17T08:00:00.000Z';
  return [
    {
      code: 'THANAT01',
      name: 'แบบวัดผลการปฐมนิเทศพนักงานรายวัน',
      department: 'new employee',
      createdAt: now,
      updatedAt: now
    },
    {
      code: 'BASICCHANA',
      name: 'ห้องสอบพื้นฐาน Hana (Basic Hana Training)',
      department: 'HRD / Training Center',
      createdAt: now,
      updatedAt: now
    },
    {
      code: 'LINUS2X-QA',
      name: 'ห้องสอบ Inspection for LINUS2X Product',
      department: 'Production / QA Inspection',
      createdAt: now,
      updatedAt: now
    },
    {
      code: 'HANA-ESD01',
      name: 'ห้องสอบมาตรฐานความปลอดภัยและ ESD',
      department: 'Engineering / Safety',
      createdAt: now,
      updatedAt: now
    }
  ];
}

// ชุดข้อสอบมาตรฐาน: แบบวัดผลการปฐมนิเทศ พนักงานรายวัน 25 ข้อ (จากไฟล์จริงของ Hana)
function getOrientation25Quiz() {
  const rawItems = [
    ['วันทำงานปกติของพนักงานรายวันใน 1 สัปดาห์ มีวันทำงาน 6 วัน และมีวันหยุด 1 วัน', 'True'],
    ['ระยะเวลาในการทดลองงานของพนักงานใหม่คือ 90 วัน โดยนับรวมวันหยุดด้วย', 'True'],
    ['บริษัทกำหนดกะในการทำงานของพนักงานรายวันไว้ 3 กะต่อวัน', 'False'],
    ['พนักงานรายวันที่ทำงานในกะเช้าจะต้องทำงาน รวม OT Auto ตั้งแต่เวลา 07.00 – 17.55 น.', 'True'],
    ['บริษัทกำหนดให้มีวันหยุดประเพณีของบริษัทไว้ 13 วัน โดยรวมถึงวันแรงงานแห่งชาติด้วย', 'False'],
    ['พนักงานที่ทำงานในกะกลางคืนจะได้รับค่ากะจำนวน 45 บาทต่อวัน', 'True'],
    ['พนักงานที่ทำงาน 8 ชั่วโมงทำงาน รวม ทำ OT Auto จะได้รับค่าอาหาร 30 บาท', 'True'],
    ['พนักงานรายวันจะได้รับค่าเดินทางวันละ 25 บาท', 'True'],
    ['บริษัทจะจ่ายเบี้ยขยันประจำงวด ให้กับพนักงานรายวันที่ไม่ป่วย สาย ลา ขาด โดยจ่ายให้งวดค่าจ้างละ 300 บาท', 'False'],
    ['พนักงานทำงานครบทดลองงานถึงจะสามารถสมัคร สวัสดิการกองทุนสำรองเลี้ยงชีพได้', 'False'],
    ['พนักงานรายวันจะมีสิทธิหยุดพักผ่อนประจำปี (พักร้อน) เมื่อทำงานครบทดลองงาน', 'True'],
    ['พนักงานหญิงตั้งครรภ์ มีสิทธิลาคลอดก่อนและหลังคลอดได้ ครรภ์หนึ่งไม่เกิน 120 วัน โดยบริษัทฯ จ่ายค่าจ้างเท่ากับค่าจ้างในวันทำงานตลอดระยะเวลาที่ลา แต่ไม่เกิน 60 วัน', 'True'],
    ['พนักงานที่ทำงานครบ 1 ปีขึ้นไป จึงจะสามารถใช้สิทธิการลาสมรสได้เป็นจำนวน 3 วันทำงาน และลาได้เพียงครั้งเดียว', 'True'],
    ['พนักงานที่ผ่านการทดลองงานแล้วเท่านั้นจึงจะสามารถใช้สิทธิลางานศพได้', 'False'],
    ['พนักงานต้องทำงานครบทดลองงาน ถึงจะเบิกเงินช่วยเหลือค่าการศึกษาบุตรได้', 'False'],
    ['พนักงานทุกคนจะต้องติดบัตรประจำตัวพนักงานตลอดเวลาที่อยู่ในบริเวณบริษัท', 'True'],
    ['พนักงานจะสมัครสหกรณ์ออมทรัพย์ของบริษัทต้องทำงานครบทดลองงาน', 'True'],
    ['พนักงานที่ทำงานล่วงเวลาในวันทำงานปกติ จะได้รับค่าล่วงเวลาเป็นจำนวน 1.5 เท่าของค่าแรงปกติต่อชั่วโมงการทำงานล่วงเวลา', 'True'],
    ['พนักงานต้อง ส่งซักชุดสม็อกตามตารางที่หัวหน้างานแจ้งไว้พร้อมกับเพื่อนในไลน์ โดยห้ามไม่ให้มาส่งซักเองคนเดียว', 'True'],
    ['พนักงานต้องไม่ย้าย ล๊อกเกอร์เองหากไม่ได้รับอนุญาต และห้ามนำสิ่งของผิดกฎหมายไว้ในตู้ล๊อกเกอร์โดยเด็ดขาด', 'True'],
    ['พนักงานที่ขาดงานเป็นเวลา 3 วันทำงานติดต่อกันโดยไม่แจ้งให้บริษัททราบ ถือว่าพ้นสภาพจากการเป็นพนักงานของบริษัท เว้นแต่การขาดงานนั้นมีเหตุผลอันสมควร', 'True'],
    ['กรณีพนักงานที่ยังไม่ได้รับสิทธิการรักษาพยาบาลตามสิทธิของประกันสังคม หากพนักงานเจ็บป่วยควรเข้ารับการรักษาที่โรงพยาบาลของรัฐบาล เพื่อสามารถเบิกค่ารักษากับบริษัทได้เต็มจำนวน', 'True'],
    ['กรณีพนักงานเจ็บป่วยฉุกเฉิน หรือประสบอุบัติเหตุ และไม่ได้เข้ารับการรักษาในโรงพยาบาลตามสิทธิประกันสังคม จะต้องทำการแจ้งให้เจ้าหน้าที่การบุคคลทราบโดยทันทีที่สามารถทำได้', 'True'],
    ['PDPA คือ พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล ซึ่งกฎหมายที่ถูกสร้างมาเพื่อป้องกันการละเมิดข้อมูลส่วนบุคคลของทุกคน รวมถึงการจัดเก็บข้อมูลและนำไปใช้โดยไม่ได้แจ้งให้ทราบ และไม่ได้รับความยินยอมจากเจ้าของข้อมูลเสียก่อน', 'True'],
    ['Corporate Code Of Conduct เป็นจริยธรรมธุรกิจขององค์กร ซึ่งประกอบด้วยเรื่องของ ความสัมพันธ์ต่อลูกค้า ความสัมพันธ์ต่อซัพพลายเออร์และผู้รับเหมา ความสัมพันธ์ต่อผู้ถือหุ้นและกลุ่มการเงิน ความสัมพันธ์ระหว่างบริษัทและพนักงาน และความสัมพันธ์ต่อกลุ่มอื่น ๆ ที่เกี่ยวข้อง', 'True']
  ];

  return {
    id: 'QUIZ_HANA_ORIENT_25',
    title: 'แบบวัดผลการปฐมนิเทศ พนักงานรายวัน 25 ข้อ',
    subject: 'HRD / ทั่วไป',
    shareCode: 'HANA-269251',
    createdAt: '2026-11-17T08:00:00.000Z',
    updatedAt: '2026-11-17T08:00:00.000Z',
    questions: rawItems.map((item, idx) => ({
      id: 'Q_OR_' + (idx + 1),
      type: 'TF',
      text: item[0],
      options: ['True', 'False'],
      correctAnswer: item[1],
      explanation: '',
      points: 1
    }))
  };
}

// ข้อมูลเริ่มต้นของระบบ
function getInitialSeedState() {
  const orientQuiz = getOrientation25Quiz();
  const thaiQuizId = 'QUIZ_THAI_ELEC_02';
  const defaultSessionId = 'SESS_THANAT01_ORIENT';

  return {
    rooms: getDefaultRooms(),
    quizzes: [
      orientQuiz,
      {
        id: thaiQuizId,
        title: 'แบบทดสอบพื้นฐานอิเล็กทรอนิกส์และ ESD (Hana Basic Electronics)',
        subject: 'วิศวกรรมไฟฟ้า / อิเล็กทรอนิกส์',
        shareCode: 'HANA-889201',
        createdAt: '2026-11-16T08:30:00.000Z',
        updatedAt: '2026-11-16T08:30:00.000Z',
        questions: [
          {
            id: 'TQ1',
            type: 'MC',
            text: 'ตามกฎของโอห์ม (Ohm\'s Law) ความสัมพันธ์ระหว่างแรงดัน (V) กระแส (I) และความต้านทาน (R) ข้อใดถูกต้อง?',
            options: ['A. V = I × R', 'B. V = I / R', 'C. R = V × I', 'D. I = V × R'],
            correctAnswer: 'A',
            explanation: 'แรงดันไฟฟ้า (V) เท่ากับ กระแสไฟฟ้า (I) คูณกับความต้านทาน (R)',
            points: 1
          },
          {
            id: 'TQ2',
            type: 'TF',
            text: 'ไดโอด (Diode) เป็นอุปกรณ์สารกึ่งตัวนำที่ยอมให้กระแสไฟฟ้าไหลผ่านได้ทิศทางเดียว',
            options: ['True', 'False'],
            correctAnswer: 'True',
            explanation: 'ไดโอดยอมให้กระแสไหลผ่านเมื่อไบอัสตรง (Forward Bias)',
            points: 1
          },
          {
            id: 'TQ3',
            type: 'SA',
            text: 'หน่วยวัดค่าความต้านทานไฟฟ้าคืออะไร?',
            options: [],
            correctAnswer: 'โอห์ม',
            explanation: 'หน่วยวัดความต้านทานไฟฟ้าคือ โอห์ม (Ohm, Ω)',
            points: 1
          }
        ]
      }
    ],
    activeSession: {
      id: defaultSessionId,
      roomCode: 'THANAT01',
      quizId: orientQuiz.id,
      quizTitle: orientQuiz.title,
      activityType: 'quiz',
      status: 'active',
      settings: { instantFeedback: true, shuffle: false },
      startedAt: '2026-11-17T08:40:00.000Z'
    },
    responses: []
  };
}

let appState = loadAppState();
let builderEditingQuizId = null;
let builderQuestions = [];
let pendingLaunchType = 'quiz';

// Student state
let currentStudent = {
  id: '',
  name: '',
  roomCode: 'THANAT01',
  currentIndex: 0,
  selectedOption: '',
  answers: {}
};

// ================= INITIALIZATION =================
window.addEventListener('DOMContentLoaded', async () => {
  loadSettings();

  // 1. ตรวจสอบว่ามีข้อมูลข้อสอบแนบมากับ URL หรือไม่ (?mode=student&room=...&exam=...)
  const params = new URLSearchParams(window.location.search);
  const examPayloadParam = params.get('exam');
  if (examPayloadParam) {
    importExamFromUrlParam(examPayloadParam);
  }

  ensureRoomExistsInList(appSettings.roomCode);
  updateRoomBadges();
  renderRoomsManagement();
  renderQuizLibrary();
  renderLiveResultsTable();
  renderReportsList();

  // ปิดเมนู Add Quiz เมื่อคลิกข้างนอก
  document.addEventListener('click', (e) => {
    const pop = document.getElementById('addQuizPopover');
    const btn = document.getElementById('addQuizBtn');
    if (pop && pop.classList.contains('open')) {
      if (!pop.contains(e.target) && !btn.contains(e.target)) {
        pop.classList.remove('open');
      }
    }
  });

  // 2. ตรวจสอบ URL พารามิเตอร์ว่าเปิดจากมือถือของผู้เข้าสอบหรือไม่ (?mode=student&room=...)
  if (params.get('room')) {
    const urlRoom = params.get('room').toUpperCase().trim();
    ensureRoomExistsInList(urlRoom);
    appSettings.roomCode = urlRoom;
    document.getElementById('stuRoomInput').value = appSettings.roomCode;
    updateRoomBadges();
    renderRoomsManagement();
  }

  if (params.get('mode') === 'student') {
    toggleStudentPortalMode(true);
    // ดึงข้อสอบล่าสุดของห้องนั้นจาก Google Sheets ทันทีที่เปิดหน้ามือถือ
    await syncStudentRoomSessionFromCloud(appSettings.roomCode);
  } else {
    // ถ้าเปิดหน้าผู้คุมสอบ ให้ซิงค์ชุดข้อสอบและห้องสอบกับ Google Sheets อัตโนมัติ
    pullAllDataFromGoogleSheets(false);
  }

  // รับข้อมูล Real-time ข้ามแท็บ
  if (liveChannel) {
    liveChannel.onmessage = (event) => {
      if (event.data && event.data.type === 'STATE_UPDATED') {
        appState = loadAppState();
        renderLiveResultsTable();
        renderQuizLibrary();
        renderRoomsManagement();
        renderReportsList();
        updateStudentDetectedQuizBanner();
      }
    };
  }

  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      appState = loadAppState();
      renderLiveResultsTable();
      renderQuizLibrary();
      renderRoomsManagement();
      updateStudentDetectedQuizBanner();
    }
  });

  // ซิงค์ข้อมูลกับ Google Sheets อัตโนมัติทุก 3.5 วินาที
  setInterval(() => {
    if (appSettings.gasWebAppUrl) {
      pollLiveFromGoogleSheet();
    }
  }, 3500);
});

// ================= URL EMBEDDED QUIZ COMPRESSION (100% CROSS-DEVICE GUARANTEE) =================
function buildEmbeddedStudentUrl(roomCode) {
  const code = String(roomCode || appSettings.roomCode || 'THANAT01').toUpperCase().trim();
  const baseUrl = window.location.origin + window.location.pathname;
  let url = `${baseUrl}?mode=student&room=${encodeURIComponent(code)}`;

  try {
    const session = appState.activeSession;
    const quiz = appState.quizzes.find(q => q.id === session?.quizId) || appState.quizzes[0];
    if (quiz && window.LZString) {
      // บีบอัดข้อมูลชุดข้อสอบและเซสชันที่กำลังเปิดสอบแนบไปกับลิงก์ เพื่อให้มือถือเปิดได้ตรงชุด 100% แม้ยังไม่ได้ตั้งค่า Cloud
      const compactPayload = {
        s: session ? {
          id: session.id,
          r: code,
          t: session.activityType || 'quiz',
          st: session.status || 'active',
          fb: session.settings?.instantFeedback ?? true,
          sh: session.settings?.shuffle ?? false
        } : null,
        q: {
          id: quiz.id,
          t: quiz.title,
          sb: quiz.subject || 'HRD',
          sc: quiz.shareCode || 'HANA-269251',
          qs: (quiz.questions || []).map(item => [
            item.type || 'TF',
            item.text || '',
            item.options || [],
            item.correctAnswer ?? 'True'
          ])
        }
      };
      const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(compactPayload));
      if (compressed && compressed.length < 6500) {
        url += `&exam=${compressed}`;
      }
    }
  } catch (e) {
    console.warn('Could not embed compressed quiz in URL:', e);
  }
  return url;
}

function importExamFromUrlParam(encodedStr) {
  try {
    if (!window.LZString || !encodedStr) return;
    const jsonStr = LZString.decompressFromEncodedURIComponent(encodedStr);
    if (!jsonStr) return;
    const data = JSON.parse(jsonStr);
    if (!data || !data.q) return;

    const importedQuiz = {
      id: data.q.id || ('QUIZ_URL_' + Date.now()),
      title: data.q.t || 'ชุดข้อสอบออนไลน์',
      subject: data.q.sb || 'ทั่วไป',
      shareCode: data.q.sc || 'HANA-EXAM',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      questions: (data.q.qs || []).map((arr, idx) => ({
        id: (data.q.id || 'Q') + '_' + (idx + 1),
        type: arr[0] || 'TF',
        text: arr[1] || '',
        options: Array.isArray(arr[2]) && arr[2].length > 0 ? arr[2] : (arr[0] === 'TF' ? ['True', 'False'] : []),
        correctAnswer: arr[3] !== undefined ? arr[3] : 'True',
        points: 1
      }))
    };

    const existingIdx = appState.quizzes.findIndex(q => q.id === importedQuiz.id || q.title === importedQuiz.title);
    if (existingIdx !== -1) {
      appState.quizzes[existingIdx] = importedQuiz;
    } else {
      appState.quizzes.unshift(importedQuiz);
    }

    const roomCode = (data.s?.r || appSettings.roomCode || 'THANAT01').toUpperCase();
    appSettings.roomCode = roomCode;
    appState.activeSession = {
      id: data.s?.id || ('SESS_' + roomCode),
      roomCode: roomCode,
      quizId: importedQuiz.id,
      quizTitle: importedQuiz.title,
      activityType: data.s?.t || 'quiz',
      status: data.s?.st || 'active',
      settings: {
        instantFeedback: data.s?.fb ?? true,
        shuffle: data.s?.sh ?? false
      },
      startedAt: new Date().toISOString()
    };

    saveAppState(false);
    updateStudentDetectedQuizBanner();
  } catch (err) {
    console.warn('Failed to parse exam param from URL:', err);
  }
}

function updateStudentDetectedQuizBanner() {
  const banner = document.getElementById('stuDetectedQuizBanner');
  if (!banner) return;
  const session = appState.activeSession;
  const quiz = appState.quizzes.find(q => q.id === session?.quizId) || appState.quizzes[0];
  if (quiz) {
    banner.textContent = `📝 ชุดข้อสอบที่เปิดสอบ: ${quiz.title} (${(quiz.questions || []).length} ข้อ)`;
  }
}

function loadAppState() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(PREV_STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      const seed = getInitialSeedState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.rooms) || parsed.rooms.length === 0) {
      parsed.rooms = getDefaultRooms();
    }
    if (!Array.isArray(parsed.quizzes)) {
      parsed.quizzes = [];
    }

    // ตรวจสอบให้มีชุดข้อสอบ "แบบวัดผลการปฐมนิเทศ พนักงานรายวัน 25 ข้อ" เสมอ และลบ Life Science Quiz เดิมออกหากผู้ใช้ไม่ได้ใช้
    const hasOrient25 = parsed.quizzes.some(q => q.id === 'QUIZ_HANA_ORIENT_25' || q.title.includes('แบบวัดผลการปฐมนิเทศ'));
    if (!hasOrient25) {
      parsed.quizzes.unshift(getOrientation25Quiz());
    }
    parsed.quizzes = parsed.quizzes.filter(q => q.id !== 'QUIZ_LIFE_SCI_01' || parsed.quizzes.length === 1);

    // หาก activeSession ยังชี้ไปที่ Life Science Quiz เดิม ให้สลับมาที่ชุดข้อสอบแรกในคลังของผู้ใช้ทันที
    const currentQuizExists = parsed.quizzes.some(q => q.id === parsed.activeSession?.quizId);
    if (!parsed.activeSession || !currentQuizExists) {
      const firstQuiz = parsed.quizzes[0] || getOrientation25Quiz();
      parsed.activeSession = {
        id: 'SESS_' + Date.now(),
        roomCode: parsed.activeSession?.roomCode || 'THANAT01',
        quizId: firstQuiz.id,
        quizTitle: firstQuiz.title,
        activityType: 'quiz',
        status: 'active',
        settings: { instantFeedback: true, shuffle: false },
        startedAt: new Date().toISOString()
      };
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    return parsed;
  } catch (e) {
    return getInitialSeedState();
  }
}

function saveAppState(broadcast = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  if (broadcast && liveChannel) {
    liveChannel.postMessage({ type: 'STATE_UPDATED' });
  }
  updateRoomBadges();
  renderLiveResultsTable();
  updateStudentDetectedQuizBanner();
}

function loadSettings() {
  try {
    let raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      appSettings = Object.assign(appSettings, saved);
    }
  } catch (e) {}
  // บังคับใช้ลิงก์ Apps Script ใหม่ที่ฝังไว้เป็นค่าหลักเสมอหากยังไม่ได้เปลี่ยนเป็นลิงก์ใหม่
  if (!appSettings.gasWebAppUrl || !appSettings.gasWebAppUrl.includes('AKfycbzSEMEiZ33E0FEhCmQmgsxueaTijfJNXDG_R_B54ix59EBRBN0TcSa3VfWSM1LbrCkE')) {
    appSettings.gasWebAppUrl = DEFAULT_GAS_WEB_APP_URL;
  }
  appSettings.sheetDocUrl = 'https://docs.google.com/spreadsheets/d/1vPV2GXeJLxlCXrMkbHUSVWUZyLSDT4SnjjhxOEIALGQ/edit';
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));

  document.getElementById('settingSheetDocUrl').value = appSettings.sheetDocUrl;
  document.getElementById('settingGasWebAppUrl').value = appSettings.gasWebAppUrl;
  document.getElementById('settingGeminiKey').value = appSettings.geminiApiKey || '';
  updateDbStatusIndicator();

  if (appSettings.gasWebAppUrl) {
    callGoogleScript({ action: 'ping' });
  }
}

function saveAppSettings() {
  appSettings.sheetDocUrl = document.getElementById('settingSheetDocUrl').value.trim() || 'https://docs.google.com/spreadsheets/u/0/';
  appSettings.gasWebAppUrl = document.getElementById('settingGasWebAppUrl').value.trim();
  appSettings.geminiApiKey = document.getElementById('settingGeminiKey').value.trim();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
  updateDbStatusIndicator();
  closeModal('settingsModal');
  showToast('บันทึกการตั้งค่า Google Sheets & AI เรียบร้อยแล้ว');
  if (appSettings.gasWebAppUrl) {
    syncAllToGoogleSheets();
  }
}

function updateDbStatusIndicator() {
  const dot = document.getElementById('dbStatusDot');
  const txt = document.getElementById('dbStatusText');
  if (appSettings.gasWebAppUrl) {
    dot.style.background = '#22c55e';
    txt.textContent = 'Google Sheets: เชื่อมต่อแล้ว';
  } else {
    dot.style.background = '#f59e0b';
    txt.textContent = 'ตั้งค่า Google Sheet / AI';
  }
}

// ================= NAVIGATION & TABS =================
function switchTab(tabName) {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.remove('active');
  });
  const target = document.getElementById('view-' + tabName);
  if (target) target.classList.add('active');

  if (tabName === 'library') renderQuizLibrary();
  if (tabName === 'live') renderLiveResultsTable();
  if (tabName === 'reports') renderReportsList();
  if (tabName === 'rooms') {
    updateRoomBadges();
    renderRoomsManagement();
  }
}

function toggleStudentPortalMode(forceStudent) {
  const isCurrentlyStudent = document.getElementById('view-student').classList.contains('active');
  const goStudent = forceStudent !== undefined ? forceStudent : !isCurrentlyStudent;

  document.getElementById('teacherNavbar').style.display = goStudent ? 'none' : 'flex';
  document.getElementById('studentNavbar').style.display = goStudent ? 'flex' : 'none';

  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  if (goStudent) {
    document.getElementById('view-student').classList.add('active');
    document.getElementById('stuRoomInput').value = appSettings.roomCode;
    document.getElementById('studentRoomBadge').textContent = 'ROOM: ' + appSettings.roomCode;
    populateRoomsDatalist();
    updateStudentDetectedQuizBanner();
  } else {
    switchTab('live');
  }
}

// ================= UNLIMITED ROOMS MANAGEMENT =================
function ensureRoomExistsInList(roomCode, roomName = '', department = 'ทั่วไป') {
  const code = String(roomCode || 'THANAT01').toUpperCase().trim();
  if (!code) return;
  if (!Array.isArray(appState.rooms)) {
    appState.rooms = getDefaultRooms();
  }
  const exists = appState.rooms.find(r => String(r.code).toUpperCase() === code);
  if (!exists) {
    const now = new Date().toISOString();
    const newRoom = {
      code: code,
      name: roomName || `ห้องสอบ ${code}`,
      department: department || 'ทั่วไป',
      createdAt: now,
      updatedAt: now
    };
    appState.rooms.unshift(newRoom);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    if (appSettings.gasWebAppUrl) {
      callGoogleScript({ action: 'saveRoom', room: newRoom });
    }
  }
}

function populateRoomsDatalist() {
  const dl = document.getElementById('availableRoomsDatalist');
  if (!dl) return;
  dl.innerHTML = (appState.rooms || []).map(rm =>
    `<option value="${escapeHtml(rm.code)}">${escapeHtml(rm.name)} (${escapeHtml(rm.department || 'ทั่วไป')})</option>`
  ).join('');
}

function updateRoomBadges() {
  const code = (appSettings.roomCode || 'THANAT01').toUpperCase();
  const navRoomEl = document.getElementById('navRoomName');
  if (navRoomEl) navRoomEl.textContent = code;

  const launchRoomEl = document.getElementById('launchCurrentRoomLabel');
  if (launchRoomEl) launchRoomEl.textContent = code;

  const activeHighlight = document.getElementById('activeRoomHighlight');
  if (activeHighlight) activeHighlight.textContent = code;

  const inviteBig = document.getElementById('inviteRoomCodeBig');
  if (inviteBig) inviteBig.textContent = code;

  const liveRoomPill = document.getElementById('liveRoomPill');
  if (liveRoomPill) liveRoomPill.textContent = 'ห้อง: ' + code;

  const activeQuiz = appState.quizzes.find(q => q.id === appState.activeSession?.quizId) || appState.quizzes[0];
  const quizBadge = document.getElementById('activeRoomQuizBadge');
  if (quizBadge && activeQuiz) {
    quizBadge.textContent = `(ชุดข้อสอบที่เปิดอยู่: ${activeQuiz.title})`;
  }
  const inviteQuizNameLabel = document.getElementById('inviteQuizNameLabel');
  if (inviteQuizNameLabel && activeQuiz) {
    inviteQuizNameLabel.textContent = `📝 ชุดข้อสอบ: ${activeQuiz.title} (${(activeQuiz.questions || []).length} ข้อ)`;
  }

  // สร้างลิงก์ที่ฝังชุดข้อสอบปัจจุบันให้มือถือเปิดได้ตรงชุด 100%
  const inviteUrl = buildEmbeddedStudentUrl(code);
  const urlDisplay = document.getElementById('studentDirectUrlDisplay');
  if (urlDisplay) urlDisplay.textContent = inviteUrl;
  const inviteInput = document.getElementById('inviteUrlInput');
  if (inviteInput) inviteInput.value = inviteUrl;

  const qrImg = document.getElementById('inviteQrCodeImg');
  if (qrImg) {
    // สำหรับ QR Code ใช้ลิงก์สั้นหากลิงก์ฝังข้อสอบยาวเกินความจุ QR
    const shortUrl = `${window.location.origin}${window.location.pathname}?mode=student&room=${encodeURIComponent(code)}`;
    const qrTarget = inviteUrl.length <= 900 ? inviteUrl : shortUrl;
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrTarget)}`;
  }

  populateRoomsDatalist();
}

function createNewRoom() {
  const codeInput = document.getElementById('newRoomCodeInput');
  const nameInput = document.getElementById('newRoomNameInput');
  const deptInput = document.getElementById('newRoomDeptInput');

  const rawCode = (codeInput.value || '').trim().toUpperCase().replace(/\s+/g, '-');
  if (!rawCode) {
    return showToast('กรุณากรอกรหัสห้องสอบ (Room Code) เช่น THANAT01 หรือ HANA-01');
  }

  const roomName = (nameInput.value || '').trim() || `ห้องสอบ ${rawCode}`;
  const dept = (deptInput.value || '').trim() || 'ทั่วไป';
  const now = new Date().toISOString();

  if (!Array.isArray(appState.rooms)) appState.rooms = getDefaultRooms();
  const existingIdx = appState.rooms.findIndex(r => String(r.code).toUpperCase() === rawCode);

  let roomObj;
  if (existingIdx !== -1) {
    appState.rooms[existingIdx].name = roomName;
    appState.rooms[existingIdx].department = dept;
    appState.rooms[existingIdx].updatedAt = now;
    roomObj = appState.rooms[existingIdx];
    showToast(`อัปเดตข้อมูลห้องสอบ "${rawCode}" และสลับไปใช้งานห้องนี้เรียบร้อยแล้ว!`);
  } else {
    roomObj = {
      code: rawCode,
      name: roomName,
      department: dept,
      createdAt: now,
      updatedAt: now
    };
    appState.rooms.unshift(roomObj);
    showToast(`🎉 สร้างห้องสอบใหม่ "${rawCode}" และเลือกใช้งานเรียบร้อยแล้ว!`);
  }

  selectActiveRoom(rawCode, false);

  codeInput.value = '';
  nameInput.value = '';
  deptInput.value = '';

  if (appSettings.gasWebAppUrl) {
    callGoogleScript({ action: 'saveRoom', room: roomObj });
  }
}

function selectActiveRoom(roomCode, notify = true) {
  const code = String(roomCode || 'THANAT01').toUpperCase().trim();
  appSettings.roomCode = code;
  if (appState.activeSession) {
    appState.activeSession.roomCode = code;
    if (appSettings.gasWebAppUrl) {
      callGoogleScript({ action: 'startSession', session: appState.activeSession });
    }
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
  saveAppState();
  updateRoomBadges();
  renderRoomsManagement();
  renderReportsList();
  if (notify) {
    showToast(`สลับห้องสอบที่ใช้งานเป็น "${code}" เรียบร้อยแล้ว`);
  }
}

function deleteRoomByCode(roomCode) {
  const code = String(roomCode || '').toUpperCase();
  if ((appState.rooms || []).length <= 1) {
    return showToast('ต้องมีห้องสอบอย่างน้อย 1 ห้องในระบบ');
  }
  if (!confirm(`ต้องการลบห้องสอบ "${code}" ออกจากรายการใช่หรือไม่?`)) return;

  appState.rooms = appState.rooms.filter(r => String(r.code).toUpperCase() !== code);
  if (String(appSettings.roomCode).toUpperCase() === code) {
    appSettings.roomCode = appState.rooms[0].code;
    if (appState.activeSession) {
      appState.activeSession.roomCode = appSettings.roomCode;
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
  }
  saveAppState();
  updateRoomBadges();
  renderRoomsManagement();
  if (appSettings.gasWebAppUrl) {
    callGoogleScript({ action: 'deleteRoom', room_code: code });
  }
  showToast(`ลบห้องสอบ ${code} เรียบร้อยแล้ว`);
}

function copyRoomSpecificLink(roomCode) {
  const inviteUrl = buildEmbeddedStudentUrl(roomCode);
  navigator.clipboard.writeText(inviteUrl).then(() => {
    showToast(`คัดลอกลิงก์เข้าห้องสอบ ${roomCode} (พร้อมชุดข้อสอบปัจจุบัน) เรียบร้อยแล้ว!`);
  });
}

function renderRoomsManagement() {
  const container = document.getElementById('roomsListContainer');
  const countEl = document.getElementById('totalRoomsCount');
  if (!container) return;

  const rooms = appState.rooms || getDefaultRooms();
  if (countEl) countEl.textContent = rooms.length;

  const currentActive = String(appSettings.roomCode || 'THANAT01').toUpperCase();

  container.innerHTML = rooms.map(rm => {
    const isCurrent = String(rm.code).toUpperCase() === currentActive;
    const studentCount = (appState.responses || []).filter(r => String(r.roomCode || '').toUpperCase() === String(rm.code).toUpperCase()).length;

    return `
      <div class="room-card-item ${isCurrent ? 'active-room' : ''}">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
            <div>
              <span class="soc-code-pill" style="font-size:0.95rem;padding:4px 10px;background:${isCurrent ? '#1e40af' : '#e2e8f0'};color:${isCurrent ? '#fff' : '#1e293b'};">
                ${escapeHtml(rm.code)}
              </span>
              ${isCurrent ? '<span style="margin-left:6px;font-size:0.76rem;font-weight:700;color:#16a34a;">● กำลังใช้งาน</span>' : ''}
            </div>
            <span style="font-size:0.78rem;color:#64748b;background:#f1f5f9;padding:3px 8px;border-radius:6px;">
              ${escapeHtml(rm.department || 'ทั่วไป')}
            </span>
          </div>
          <div style="font-weight:700;font-size:0.98rem;color:#0f172a;margin-bottom:4px;">
            ${escapeHtml(rm.name || rm.code)}
          </div>
          <div style="font-size:0.8rem;color:#64748b;">
            ผู้เข้าสอบสะสมในห้องนี้: <b>${studentCount}</b> คน
          </div>
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap;padding-top:10px;border-top:1px solid #f1f5f9;">
          ${isCurrent
            ? `<button class="btn-primary-blue" style="padding:6px 12px;font-size:0.8rem;background:#16a34a;" onclick="openLaunchQuizModal('quiz')">🚀 เปิดชุดข้อสอบในห้องนี้</button>`
            : `<button class="btn-primary-blue" style="padding:6px 12px;font-size:0.8rem;" onclick="selectActiveRoom('${escapeHtml(rm.code)}')">✓ เลือกใช้ห้องนี้</button>`
          }
          <button class="btn-outline" style="padding:6px 10px;font-size:0.8rem;" onclick="copyRoomSpecificLink('${escapeHtml(rm.code)}')" title="คัดลอกลิงก์ห้องนี้ให้ผู้เข้าสอบ">
            🔗 ลิงก์
          </button>
          <button class="btn-outline" style="padding:6px 10px;font-size:0.8rem;color:#dc2626;margin-left:auto;" onclick="deleteRoomByCode('${escapeHtml(rm.code)}')" title="ลบห้องสอบนี้">
            🗑
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function copyStudentLink() {
  const inviteUrl = buildEmbeddedStudentUrl(appSettings.roomCode);
  navigator.clipboard.writeText(inviteUrl).then(() => {
    showToast('คัดลอกลิงก์เข้าสอบสำหรับมือถือ (พร้อมฝังชุดข้อสอบปัจจุบัน) เรียบร้อยแล้ว!');
  });
}

// ================= LIBRARY & ADD QUIZ MENU =================
function toggleAddQuizMenu(e) {
  e.stopPropagation();
  const pop = document.getElementById('addQuizPopover');
  pop.classList.toggle('open');
}

function renderQuizLibrary() {
  const container = document.getElementById('quizListContainer');
  if (!container) return;
  const keyword = (document.getElementById('quizSearchInput')?.value || '').toLowerCase().trim();
  const quizzes = (appState.quizzes || []).filter(q =>
    q.title.toLowerCase().includes(keyword) ||
    (q.subject || '').toLowerCase().includes(keyword) ||
    (q.shareCode || '').toLowerCase().includes(keyword)
  );

  if (quizzes.length === 0) {
    container.innerHTML = `
      <div style="padding:42px;text-align:center;color:#6b7280;">
        ยังไม่มีชุดข้อสอบที่ตรงกับการค้นหา คลิกปุ่ม <b>+ Add Exam / Quiz</b> ด้านบนเพื่อสร้างข้อสอบใหม่
      </div>`;
    return;
  }

  container.innerHTML = quizzes.map(q => {
    const qCount = (q.questions || []).length;
    const dateStr = q.updatedAt ? new Date(q.updatedAt).toLocaleDateString('th-TH') : '-';
    const isCurrentlyLaunched = appState.activeSession?.quizId === q.id;
    return `
      <div class="quiz-row" style="${isCurrentlyLaunched ? 'background:#f0fdf4;' : ''}">
        <div class="quiz-info-main">
          <div class="quiz-doc-icon" style="${isCurrentlyLaunched ? 'background:#dcfce7;color:#16a34a;' : ''}">
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
          </div>
          <div>
            <div class="quiz-name" onclick="editExistingQuiz('${q.id}')">
              ${escapeHtml(q.title)}
              ${isCurrentlyLaunched ? '<span class="soc-code-pill" style="background:#dcfce7;color:#166534;font-size:0.74rem;margin-left:6px;">● กำลังเปิดสอบอยู่</span>' : ''}
            </div>
            <div class="quiz-meta">
              <span>${qCount} ข้อ</span>
              <span>•</span>
              <span>หมวด/แผนก: ${escapeHtml(q.subject || 'ทั่วไป')}</span>
              <span>•</span>
              <span class="soc-code-pill">${escapeHtml(q.shareCode || 'HANA-100000')}</span>
              <span>•</span>
              <span>อัปเดต ${dateStr}</span>
            </div>
          </div>
        </div>
        <div class="quiz-row-actions">
          <button class="btn-primary-blue" style="padding:7px 12px;font-size:0.82rem;" onclick="quickStartQuizFromLibrary('${q.id}')">
            ▶ เปิดสอบ (Launch)
          </button>
          <button class="btn-outline" style="padding:7px 12px;font-size:0.82rem;" onclick="editExistingQuiz('${q.id}')">
            ✏️ แก้ไข
          </button>
          <button class="btn-outline" style="padding:7px 12px;font-size:0.82rem;" onclick="duplicateQuiz('${q.id}')">
            📋 คัดลอก
          </button>
          <button class="btn-outline" style="padding:7px 10px;font-size:0.82rem;color:#dc2626;" onclick="deleteQuizById('${q.id}')">
            🗑
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// เปิดหน้าต่างสร้างข้อสอบตามโหมดทั้ง 5
function openCreateQuizFeature(mode, existingQuiz = null) {
  const pop = document.getElementById('addQuizPopover');
  if (pop) pop.classList.remove('open');

  if (!existingQuiz && !document.getElementById('createQuizModal').classList.contains('open')) {
    builderEditingQuizId = null;
    document.getElementById('builderQuizTitle').value = '';
    document.getElementById('builderQuizSubject').value = 'HRD / ทั่วไป';
    builderQuestions = [];
    if (mode === 'blank') {
      addBlankQuestionToBuilder('MC', false);
    }
  }

  document.querySelectorAll('.mode-pill').forEach(btn => {
    btn.style.borderColor = '#d1d5db';
    btn.style.background = '#ffffff';
    btn.style.color = '#374151';
  });
  const activePill = document.getElementById('tabMode-' + mode);
  if (activePill) {
    activePill.style.borderColor = '#1e40af';
    activePill.style.background = '#eff6ff';
    activePill.style.color = '#1e40af';
  }

  document.querySelectorAll('.create-feature-panel').forEach(p => p.style.display = 'none');
  const panel = document.getElementById('panel-' + mode);
  if (panel) panel.style.display = 'block';

  const titles = {
    ai: '✨ Generate Questions with AI (สร้างข้อสอบด้วย AI หรือจากไฟล์)',
    extract: '📄 Extract Questions from Document (ดึงข้อสอบจากไฟล์ Word / PDF / Excel)',
    copypaste: '📋 Copy-Paste Questions (วางข้อความข้อสอบเพื่อแยกอัตโนมัติ)',
    excelcode: '📊 Import Questions from Code or Excel Template',
    blank: '✏️ สร้าง / แก้ไขชุดข้อสอบ (Exam Builder)'
  };
  document.getElementById('createModalTitle').textContent = titles[mode] || 'สร้างชุดข้อสอบ';

  renderBuilderQuestions();
  openModal('createQuizModal');
}

function editExistingQuiz(quizId) {
  const quiz = appState.quizzes.find(q => q.id === quizId);
  if (!quiz) return;
  builderEditingQuizId = quiz.id;
  document.getElementById('builderQuizTitle').value = quiz.title;
  document.getElementById('builderQuizSubject').value = quiz.subject || 'ทั่วไป';
  builderQuestions = JSON.parse(JSON.stringify(quiz.questions || []));
  openCreateQuizFeature('blank', quiz);
}

function duplicateQuiz(quizId) {
  const quiz = appState.quizzes.find(q => q.id === quizId);
  if (!quiz) return;
  const copy = JSON.parse(JSON.stringify(quiz));
  copy.id = 'QUIZ_' + Date.now();
  copy.title = quiz.title + ' (Copy)';
  copy.shareCode = 'HANA-' + Math.floor(100000 + Math.random() * 900000);
  copy.updatedAt = new Date().toISOString();
  appState.quizzes.unshift(copy);
  saveAppState();
  renderQuizLibrary();
  syncQuizToGoogleSheet(copy);
  showToast('คัดลอกชุดข้อสอบเรียบร้อยแล้ว');
}

function deleteQuizById(quizId) {
  if (!confirm('ต้องการลบชุดข้อสอบนี้ใช่หรือไม่?')) return;
  appState.quizzes = appState.quizzes.filter(q => q.id !== quizId);
  if (appState.activeSession && appState.activeSession.quizId === quizId && appState.quizzes.length > 0) {
    appState.activeSession.quizId = appState.quizzes[0].id;
    appState.activeSession.quizTitle = appState.quizzes[0].title;
  }
  saveAppState();
  renderQuizLibrary();
  if (appSettings.gasWebAppUrl) {
    callGoogleScript({ action: 'deleteQuiz', quiz_id: quizId });
  }
  showToast('ลบชุดข้อสอบเรียบร้อยแล้ว');
}

// ================= QUESTION BUILDER UI =================
function addBlankQuestionToBuilder(type = 'MC', shouldRender = true) {
  const newQ = {
    id: 'Q_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    type: type,
    text: '',
    options: type === 'MC' ? ['A. ตัวเลือกที่ 1', 'B. ตัวเลือกที่ 2', 'C. ตัวเลือกที่ 3', 'D. ตัวเลือกที่ 4']
      : (type === 'TF' ? ['True', 'False'] : []),
    correctAnswer: type === 'MC' ? 'A' : (type === 'TF' ? 'True' : ''),
    explanation: '',
    points: 1
  };
  builderQuestions.push(newQ);
  if (shouldRender) renderBuilderQuestions();
}

function renderBuilderQuestions() {
  const listEl = document.getElementById('builderQuestionsList');
  const countEl = document.getElementById('builderQuestionCount');
  countEl.textContent = builderQuestions.length;

  if (builderQuestions.length === 0) {
    listEl.innerHTML = `
      <div style="padding:24px;text-align:center;color:#64748b;background:#f8fafc;border-radius:10px;border:1px dashed #cbd5e1;">
        ยังไม่มีข้อสอบในรายการ สามารถอัปโหลดไฟล์ Word / PDF / Excel, ใช้ AI สร้าง หรือกดปุ่ม <b>+ เพิ่มข้อปรนัย (MC)</b> ด้านบนได้เลย
      </div>`;
    return;
  }

  listEl.innerHTML = builderQuestions.map((q, idx) => {
    let optionsHtml = '';
    if (q.type === 'MC') {
      const letters = ['A', 'B', 'C', 'D', 'E'];
      optionsHtml = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
          ${(q.options || ['', '', '', '']).map((opt, oIdx) => {
            const letter = letters[oIdx] || String.fromCharCode(65 + oIdx);
            const isChecked = String(q.correctAnswer).toUpperCase() === letter;
            return `
              <div style="display:flex;align-items:center;gap:6px;">
                <input type="radio" name="correct_${idx}" ${isChecked ? 'checked' : ''}
                  onchange="updateBuilderQuestion(${idx}, 'correctAnswer', '${letter}')" title="ตั้งเป็นข้อที่ถูกต้อง" />
                <span style="font-weight:700;font-size:0.84rem;width:18px;">${letter}.</span>
                <input type="text" class="form-input" style="padding:7px 10px;font-size:0.86rem;"
                  value="${escapeHtml(opt.replace(/^[A-Eก-ง][\.\)\s]+/i, ''))}"
                  oninput="updateBuilderOption(${idx}, ${oIdx}, this.value)" />
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else if (q.type === 'TF') {
      optionsHtml = `
        <div style="display:flex;gap:16px;margin-top:10px;">
          <label style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:0.9rem;">
            <input type="radio" name="correct_${idx}" ${String(q.correctAnswer).toLowerCase() === 'true' ? 'checked' : ''}
              onchange="updateBuilderQuestion(${idx}, 'correctAnswer', 'True')" /> True (ถูก)
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:0.9rem;">
            <input type="radio" name="correct_${idx}" ${String(q.correctAnswer).toLowerCase() === 'false' ? 'checked' : ''}
              onchange="updateBuilderQuestion(${idx}, 'correctAnswer', 'False')" /> False (ผิด)
          </label>
        </div>
      `;
    } else {
      optionsHtml = `
        <div style="margin-top:10px;">
          <label style="font-size:0.8rem;font-weight:600;color:#166534;">คำตอบที่ถูกต้อง (Short Answer Key):</label>
          <input type="text" class="form-input" style="padding:7px 10px;font-size:0.88rem;margin-top:4px;"
            placeholder="เช่น โอห์ม หรือคำตอบสั้นๆ"
            value="${escapeHtml(q.correctAnswer || '')}"
            oninput="updateBuilderQuestion(${idx}, 'correctAnswer', this.value)" />
        </div>
      `;
    }

    return `
      <div class="q-builder-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="soc-code-pill" style="background:#1e40af;color:#fff;">ข้อที่ ${idx + 1}</span>
            <select class="form-select" style="width:auto;padding:4px 10px;font-size:0.82rem;"
              onchange="changeBuilderQuestionType(${idx}, this.value)">
              <option value="MC" ${q.type === 'MC' ? 'selected' : ''}>Multiple Choice (ปรนัย)</option>
              <option value="TF" ${q.type === 'TF' ? 'selected' : ''}>True / False (ถูก-ผิด)</option>
              <option value="SA" ${q.type === 'SA' ? 'selected' : ''}>Short Answer (เติมคำ)</option>
            </select>
          </div>
          <button class="btn-outline" style="padding:4px 8px;font-size:0.78rem;color:#dc2626;" onclick="removeBuilderQuestion(${idx})">
            ลบข้อนี้
          </button>
        </div>
        <input type="text" class="form-input" placeholder="พิมพ์โจทย์คำถามข้อที่ ${idx + 1}..."
          value="${escapeHtml(q.text)}"
          oninput="updateBuilderQuestion(${idx}, 'text', this.value)" />
        ${optionsHtml}
      </div>
    `;
  }).join('');
}

function updateBuilderQuestion(idx, field, val) {
  if (!builderQuestions[idx]) return;
  builderQuestions[idx][field] = val;
}

function updateBuilderOption(qIdx, optIdx, val) {
  if (!builderQuestions[qIdx]) return;
  const letter = String.fromCharCode(65 + optIdx);
  builderQuestions[qIdx].options[optIdx] = `${letter}. ${val}`;
}

function changeBuilderQuestionType(idx, newType) {
  const q = builderQuestions[idx];
  if (!q) return;
  q.type = newType;
  if (newType === 'MC') {
    q.options = ['A. ตัวเลือก 1', 'B. ตัวเลือก 2', 'C. ตัวเลือก 3', 'D. ตัวเลือก 4'];
    q.correctAnswer = 'A';
  } else if (newType === 'TF') {
    q.options = ['True', 'False'];
    q.correctAnswer = 'True';
  } else {
    q.options = [];
    q.correctAnswer = '';
  }
  renderBuilderQuestions();
}

function removeBuilderQuestion(idx) {
  builderQuestions.splice(idx, 1);
  renderBuilderQuestions();
}

function saveBuilderQuiz() {
  const title = document.getElementById('builderQuizTitle').value.trim() || 'ชุดข้อสอบใหม่ (' + new Date().toLocaleDateString('th-TH') + ')';
  const subject = document.getElementById('builderQuizSubject').value.trim() || 'ทั่วไป';

  if (builderQuestions.length === 0) {
    return showToast('กรุณาเพิ่มคำถามอย่างน้อย 1 ข้อก่อนบันทึก');
  }

  const now = new Date().toISOString();
  let savedQuiz = null;

  if (builderEditingQuizId) {
    const idx = appState.quizzes.findIndex(q => q.id === builderEditingQuizId);
    if (idx !== -1) {
      appState.quizzes[idx].title = title;
      appState.quizzes[idx].subject = subject;
      appState.quizzes[idx].questions = builderQuestions;
      appState.quizzes[idx].updatedAt = now;
      savedQuiz = appState.quizzes[idx];
    }
  }

  if (!savedQuiz) {
    savedQuiz = {
      id: 'QUIZ_' + Date.now(),
      title: title,
      subject: subject,
      shareCode: 'HANA-' + Math.floor(100000 + Math.random() * 900000),
      createdAt: now,
      updatedAt: now,
      questions: builderQuestions
    };
    appState.quizzes.unshift(savedQuiz);
  }

  // ตั้งชุดข้อสอบที่เพิ่งบันทึกเป็นชุดข้อสอบที่เปิดสอบในห้องปัจจุบันให้อัตโนมัติเลย เพื่อป้องกันการลืมกด Launch
  appState.activeSession = {
    id: appState.activeSession?.id || ('SESS_' + Date.now()),
    roomCode: appSettings.roomCode || 'THANAT01',
    quizId: savedQuiz.id,
    quizTitle: savedQuiz.title,
    activityType: 'quiz',
    status: 'active',
    settings: appState.activeSession?.settings || { instantFeedback: true, shuffle: false },
    startedAt: now
  };

  saveAppState();
  renderQuizLibrary();
  closeModal('createQuizModal');
  syncQuizToGoogleSheet(savedQuiz);
  if (appSettings.gasWebAppUrl) {
    callGoogleScript({ action: 'startSession', session: appState.activeSession });
  }
  showToast(`บันทึกและเปิดใช้งานชุดข้อสอบ "${title}" (${builderQuestions.length} ข้อ) เรียบร้อยแล้ว!`);
}

// ================= WORD (.docx), PDF (.pdf), EXCEL (.xlsx) PARSER =================
async function handleDocumentUpload(event, sourceMode) {
  const file = event.target.files[0];
  if (!file) return;

  const statusBox = document.getElementById('extractStatusBox');
  if (statusBox) statusBox.textContent = `⏳ กำลังอ่านไฟล์ "${file.name}" ...`;
  showToast(`กำลังสกัดข้อสอบจากไฟล์ ${file.name}...`);

  if (!document.getElementById('builderQuizTitle').value) {
    document.getElementById('builderQuizTitle').value = file.name.replace(/\.[^/.]+$/, '');
  }

  const ext = file.name.split('.').pop().toLowerCase();

  try {
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
      const parsed = parseExcelRowsToQuestions(rows);
      if (parsed.length > 0) {
        builderQuestions = builderQuestions.concat(parsed);
        renderBuilderQuestions();
        if (statusBox) statusBox.textContent = `✅ ดึงข้อสอบจากไฟล์ Excel สำเร็จ ${parsed.length} ข้อ!`;
        showToast(`ดึงข้อสอบจาก Excel สำเร็จ ${parsed.length} ข้อ!`);
        return;
      }
      const rawText = XLSX.utils.sheet_to_txt(workbook.Sheets[sheetName]);
      await extractQuestionsFromRawText(rawText, file.name);
    } else if (ext === 'docx') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
      await extractQuestionsFromRawText(result.value, file.name);
    } else if (ext === 'pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        fullText += strings.join(' ') + '\n';
      }
      await extractQuestionsFromRawText(fullText, file.name);
    } else {
      const text = await file.text();
      await extractQuestionsFromRawText(text, file.name);
    }
  } catch (err) {
    console.error(err);
    if (statusBox) statusBox.textContent = `⚠️ เกิดข้อผิดพลาดในการอ่านไฟล์: ${err.message}`;
    showToast('ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบรูปแบบไฟล์');
  }
}

function parseExcelRowsToQuestions(rows) {
  const result = [];
  rows.forEach((row, idx) => {
    const keys = Object.keys(row);
    if (keys.length === 0) return;

    const qText = row['Question'] || row['question'] || row['โจทย์'] || row['คำถาม'] || row[keys[0]] || '';
    if (!String(qText).trim() || String(qText).toLowerCase() === 'question') return;

    const rawType = String(row['Type'] || row['type'] || row['ประเภท'] || 'MC').toUpperCase();
    const optA = row['Option A'] || row['A'] || row['ก'] || row['ตัวเลือก A'] || row[keys[1]] || '';
    const optB = row['Option B'] || row['B'] || row['ข'] || row['ตัวเลือก B'] || row[keys[2]] || '';
    const optC = row['Option C'] || row['C'] || row['ค'] || row['ตัวเลือก C'] || row[keys[3]] || '';
    const optD = row['Option D'] || row['D'] || row['ง'] || row['ตัวเลือก D'] || row[keys[4]] || '';
    let ans = String(row['Answer'] || row['Correct'] || row['เฉลย'] || row['คำตอบ'] || row[keys[5]] || 'A').trim();

    const mapThaiToEng = { 'ก': 'A', 'ข': 'B', 'ค': 'C', 'ง': 'D' };
    if (mapThaiToEng[ans]) ans = mapThaiToEng[ans];

    let type = 'MC';
    if (rawType.includes('TF') || rawType.includes('TRUE')) type = 'TF';
    else if (rawType.includes('SA') || rawType.includes('SHORT')) type = 'SA';
    else if (!optA && !optB) type = 'SA';

    result.push({
      id: 'Q_XLS_' + Date.now() + '_' + idx,
      type: type,
      text: String(qText).trim(),
      options: type === 'MC'
        ? [`A. ${optA}`, `B. ${optB}`, `C. ${optC}`, `D. ${optD}`]
        : (type === 'TF' ? ['True', 'False'] : []),
      correctAnswer: type === 'MC' ? ans.toUpperCase().charAt(0) : ans,
      explanation: String(row['Explanation'] || row['คำอธิบาย'] || ''),
      points: 1
    });
  });
  return result;
}

async function extractQuestionsFromRawText(rawText, sourceName = '') {
  const statusBox = document.getElementById('extractStatusBox');

  if (appSettings.geminiApiKey && rawText.trim().length > 20) {
    try {
      if (statusBox) statusBox.textContent = '✨ กำลังใช้ Gemini AI วิเคราะห์และแยกข้อสอบจากเอกสาร...';
      const aiQuestions = await callGeminiToExtractQuestions(rawText);
      if (aiQuestions && aiQuestions.length > 0) {
        builderQuestions = builderQuestions.concat(aiQuestions);
        renderBuilderQuestions();
        if (statusBox) statusBox.textContent = `✅ สกัดข้อสอบด้วย AI สำเร็จ ${aiQuestions.length} ข้อ จาก "${sourceName}"`;
        showToast(`สกัดข้อสอบสำเร็จ ${aiQuestions.length} ข้อ!`);
        return;
      }
    } catch (e) {
      console.warn('Gemini fallback to local regex parser:', e);
    }
  }

  const parsed = smartParseTextToQuestions(rawText);
  if (parsed.length > 0) {
    builderQuestions = builderQuestions.concat(parsed);
    renderBuilderQuestions();
    if (statusBox) statusBox.textContent = `✅ ดึงข้อสอบสำเร็จ ${parsed.length} ข้อ จาก "${sourceName}"`;
    showToast(`ดึงข้อสอบสำเร็จ ${parsed.length} ข้อ!`);
  } else {
    if (statusBox) statusBox.textContent = '⚠️ ไม่พบรูปแบบข้อสอบชัดเจน ระบบได้นำข้อความใส่ในช่อง Copy-Paste ให้ปรับแต่งต่อได้ทันที';
    document.getElementById('copyPasteTextarea').value = rawText;
    openCreateQuizFeature('copypaste');
  }
}

function smartParseTextToQuestions(text) {
  // รองรับกรณีเลขข้อติดกับคำว่า True/False ของข้อก่อนหน้า เช่น "True23. กรณี..."
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/(True|False)\s*(\d{1,3}[\.\)\s])/gi, '$1\n$2')
    .trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n(?=\s*(?:ข้อที่\s*\d+|ข้อ\s*\d+|\d{1,3}[\.\)\:\s]))/g);
  const questions = [];
  const thaiToEng = { 'ก': 'A', 'ข': 'B', 'ค': 'C', 'ง': 'D', 'จ': 'E' };

  blocks.forEach((block, bIdx) => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    let qLine = lines[0].replace(/^(?:ข้อที่\s*\d+|ข้อ\s*\d+|\d{1,3})[\.\)\:\s]+/, '').trim();
    if (!qLine) return;

    const options = [];
    let correctAns = '';

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      const ansMatch = line.match(/^(?:เฉลย|คำตอบ|Answer|Correct|Key)[\s\:\=\-]+([A-Eก-ง]|True|False|.+)$/i);
      if (ansMatch) {
        let rawAns = ansMatch[1].trim().replace(/[\.\)]$/, '');
        if (thaiToEng[rawAns]) rawAns = thaiToEng[rawAns];
        correctAns = rawAns;
        continue;
      }

      const optMatch = line.match(/^([A-Dก-ง])[\.\)\s]+(.+)$/i);
      if (optMatch) {
        let keyChar = optMatch[1].toUpperCase();
        if (thaiToEng[keyChar]) keyChar = thaiToEng[keyChar];
        let optText = optMatch[2].trim();
        if (optText.endsWith('*')) {
          correctAns = keyChar;
          optText = optText.replace(/\*+$/, '').trim();
        }
        options.push(`${keyChar}. ${optText}`);
      } else {
        // บรรทัดต่อเนื่องของโจทย์ยาว
        qLine += ' ' + line;
      }
    }

    // ตรวจสอบกรณีโจทย์ลงท้ายด้วย True หรือ False (เช่นไฟล์แบบวัดผลการปฐมนิเทศ 25 ข้อ)
    let type = 'MC';
    const trailingTF = qLine.match(/\s+(True|False)\s*$/i);
    if (options.length === 0 && trailingTF) {
      type = 'TF';
      correctAns = trailingTF[1].charAt(0).toUpperCase() + trailingTF[1].slice(1).toLowerCase();
      qLine = qLine.replace(/\s+(True|False)\s*$/i, '').trim();
    } else if (options.length === 0) {
      if (/true\s*\/\s*false|ถูก\s*หรือ\s*ผิด|ใช่หรือไม่/i.test(block)) {
        type = 'TF';
      } else {
        type = 'SA';
      }
    }

    questions.push({
      id: 'Q_PARSE_' + Date.now() + '_' + bIdx,
      type: type,
      text: qLine,
      options: type === 'MC'
        ? (options.length >= 2 ? options : ['A. ตัวเลือก 1', 'B. ตัวเลือก 2', 'C. ตัวเลือก 3', 'D. ตัวเลือก 4'])
        : (type === 'TF' ? ['True', 'False'] : []),
      correctAnswer: correctAns || (type === 'MC' ? 'A' : (type === 'TF' ? 'True' : '')),
      explanation: '',
      points: 1
    });
  });

  return questions;
}

function parseCopyPasteText() {
  const raw = document.getElementById('copyPasteTextarea').value;
  if (!raw.trim()) return showToast('กรุณาวางข้อความข้อสอบก่อน');
  const parsed = smartParseTextToQuestions(raw);
  if (parsed.length === 0) {
    return showToast('ไม่พบรูปแบบข้อสอบ กรุณาขึ้นต้นข้อด้วยตัวเลข เช่น 1. โจทย์...');
  }
  builderQuestions = builderQuestions.concat(parsed);
  renderBuilderQuestions();
  showToast(`แปลงข้อความเป็นข้อสอบสำเร็จ ${parsed.length} ข้อ!`);
}

// ================= AI QUESTION GENERATOR =================
async function generateQuestionsWithAI() {
  const promptText = document.getElementById('aiPromptInput').value.trim();
  const count = Number(document.getElementById('aiQuestionCount').value || 5);
  const qType = document.getElementById('aiQuestionType').value || 'MIXED';

  if (!promptText) {
    return showToast('กรุณาพิมพ์หัวข้อหรือเนื้อหาที่ต้องการให้สร้างข้อสอบ');
  }

  if (!document.getElementById('builderQuizTitle').value) {
    document.getElementById('builderQuizTitle').value = promptText.substring(0, 45);
  }

  showToast('✨ กำลังสร้างข้อสอบอัตโนมัติ...');

  if (appSettings.geminiApiKey) {
    try {
      const prompt = `สร้างข้อสอบจำนวน ${count} ข้อ ในหัวข้อ: "${promptText}" รูปแบบคำถาม: ${qType} (MC=ปรนัย 4 ตัวเลือก A-D, TF=True/False, SA=เติมคำตอบสั้นๆ) ตอบกลับเป็น JSON Array เท่านั้น ตามโครงสร้าง: [{"type":"MC","text":"โจทย์","options":["A. ...","B. ...","C. ...","D. ..."],"correctAnswer":"A","explanation":"..."}]`;
      const generated = await callGeminiToExtractQuestions(prompt);
      if (generated && generated.length > 0) {
        builderQuestions = builderQuestions.concat(generated);
        renderBuilderQuestions();
        showToast(`✨ สร้างข้อสอบด้วย Gemini AI สำเร็จ ${generated.length} ข้อ!`);
        return;
      }
    } catch (err) {
      console.warn('Gemini API error, using smart built-in generator:', err);
    }
  }

  const generated = generateBuiltInQuestions(promptText, count, qType);
  builderQuestions = builderQuestions.concat(generated);
  renderBuilderQuestions();
  showToast(`✨ สร้างข้อสอบสำเร็จ ${generated.length} ข้อ!`);
}

async function callGeminiToExtractQuestions(contentOrPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(appSettings.geminiApiKey)}`;
  const systemInstruction = `คุณคือระบบสกัดและสร้างข้อสอบอัจฉริยะของ Hana Exam Online ให้แปลงข้อมูลที่ได้รับเป็น JSON Array ของข้อสอบเท่านั้น ห้ามมี Markdown คั่น โครงสร้างแต่ละข้อคือ: {"type": "MC" หรือ "TF" หรือ "SA", "text": "โจทย์คำถาม", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswer": "A หรือ True หรือ คำตอบสั้น", "explanation": "คำอธิบายเฉลย"}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: systemInstruction + '\n\nเนื้อหา:\n' + contentOrPrompt }] }]
    })
  });
  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Invalid JSON from AI');
  const arr = JSON.parse(jsonMatch[0]);
  return arr.map((item, idx) => ({
    id: 'Q_AI_' + Date.now() + '_' + idx,
    type: item.type || 'MC',
    text: item.text || '',
    options: item.options || [],
    correctAnswer: item.correctAnswer || 'A',
    explanation: item.explanation || '',
    points: 1
  }));
}

function generateBuiltInQuestions(topic, count, prefType) {
  const templates = [
    {
      type: 'MC',
      text: `ข้อใดอธิบายหลักการสำคัญและมาตรฐานของ "${topic}" ได้ถูกต้องที่สุด?`,
      options: [
        `A. ปฏิบัติตามขั้นตอนมาตรฐาน (WI/SOP) ของ ${topic} อย่างเคร่งครัดเพื่อคุณภาพและความปลอดภัย`,
        `B. เป็นส่วนประกอบรองที่ไม่มีผลต่อการทำงานหลัก`,
        `C. สามารถข้ามขั้นตอนการตรวจสอบได้หากเร่งด่วน`,
        `D. ไม่มีข้อใดกล่าวถูกต้อง`
      ],
      correctAnswer: 'A'
    },
    {
      type: 'TF',
      text: `การตรวจสอบความพร้อมก่อนเริ่มงานในหัวข้อ "${topic}" ช่วยลดความผิดพลาดและของเสีย (Defect) ในสายการผลิตได้ ใช่หรือไม่?`,
      options: ['True', 'False'],
      correctAnswer: 'True'
    },
    {
      type: 'SA',
      text: `จงระบุคำสำคัญ (Keyword) หรือหัวใจหลักของเรื่อง "${topic}" มา 1 คำ`,
      options: [],
      correctAnswer: topic.split(' ')[0] || topic
    },
    {
      type: 'MC',
      text: `ปัจจัยในข้อใดส่งผลโดยตรงต่อประสิทธิภาพของ "${topic}" มากที่สุด?`,
      options: [
        `A. ความเข้าใจในโครงสร้าง มาตรฐานการทำงาน และการตรวจสอบอย่างสม่ำเสมอ`,
        `B. การสุ่มค่าพารามิเตอร์โดยไม่วัดผล`,
        `C. การตัดขั้นตอนการตรวจสอบออกทั้งหมด`,
        `D. การใช้ข้อมูลที่ไม่เกี่ยวข้องมาวิเคราะห์`
      ],
      correctAnswer: 'A'
    },
    {
      type: 'MC',
      text: `ข้อใดคือผลลัพธ์ที่ได้จากการประยุกต์ใช้ "${topic}" อย่างถูกต้อง?`,
      options: [
        `A. ได้ชิ้นงานและผลลัพธ์ที่แม่นยำ ตรวจสอบย้อนกลับได้ และตรงตามมาตรฐานลูกค้า`,
        `B. ทำให้ขั้นตอนซับซ้อนขึ้นโดยไม่เกิดผลลัพธ์`,
        `C. ไม่สามารถวัดผลการทำงานได้`,
        `D. เกิดความคลาดเคลื่อนสูงกว่ามาตรฐาน`
      ],
      correctAnswer: 'A'
    }
  ];

  const out = [];
  for (let i = 0; i < count; i++) {
    const base = templates[i % templates.length];
    const finalType = prefType === 'MIXED' ? base.type : prefType;
    out.push({
      id: 'Q_GEN_' + Date.now() + '_' + i,
      type: finalType,
      text: `(${i + 1}) ` + base.text,
      options: finalType === 'MC'
        ? base.options
        : (finalType === 'TF' ? ['True', 'False'] : []),
      correctAnswer: finalType === 'MC' ? 'A' : (finalType === 'TF' ? 'True' : (topic.split(' ')[0] || 'ถูกต้อง')),
      explanation: `คำอธิบายเพิ่มเติมเกี่ยวกับ ${topic}`,
      points: 1
    });
  }
  return out;
}

// ================= EXCEL TEMPLATE DOWNLOAD & SHARE CODE IMPORT =================
function downloadExcelQuizTemplate() {
  const sampleRows = [
    {
      'Type': 'MC',
      'Question': 'อุปกรณ์ป้องกันไฟฟ้าสถิต (ESD) ที่พนักงานต้องสวมใส่ที่ข้อมือคืออะไร?',
      'Option A': 'Wrist Strap',
      'Option B': 'Safety Glasses',
      'Option C': 'Ear Plugs',
      'Option D': 'Hair Net',
      'Answer': 'A',
      'Explanation': 'Wrist Strap ใช้ถ่ายเทประจุไฟฟ้าสถิตจากร่างกายลงสู่กราวด์'
    },
    {
      'Type': 'TF',
      'Question': 'พนักงานต้องตรวจสอบค่าความต้านทานของสายรัดข้อมือ (Wrist Strap) ทุกวันก่อนเริ่มงาน',
      'Option A': 'True',
      'Option B': 'False',
      'Option C': '',
      'Option D': '',
      'Answer': 'True',
      'Explanation': ''
    },
    {
      'Type': 'SA',
      'Question': 'หน่วยวัดค่าความต้านทานไฟฟ้าคืออะไร?',
      'Option A': '',
      'Option B': '',
      'Option C': '',
      'Option D': '',
      'Answer': 'โอห์ม',
      'Explanation': ''
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Hana_Exam_Template');
  XLSX.writeFile(wb, 'Hana_Exam_Online_Template.xlsx');
  showToast('ดาวน์โหลดไฟล์ Hana_Exam_Online_Template.xlsx เรียบร้อยแล้ว');
}

function handleExcelTemplateUpload(event) {
  handleDocumentUpload(event, 'excelcode');
}

function importQuizByShareCode() {
  const code = document.getElementById('importShareCodeInput').value.trim().toUpperCase();
  if (!code) return showToast('กรุณากรอกรหัสชุดข้อสอบ เช่น HANA-269251');
  const found = appState.quizzes.find(q => String(q.shareCode).toUpperCase() === code);
  if (found) {
    builderQuestions = builderQuestions.concat(JSON.parse(JSON.stringify(found.questions)));
    document.getElementById('builderQuizTitle').value = found.title + ' (Imported)';
    renderBuilderQuestions();
    showToast(`นำเข้าข้อสอบจากรหัส ${code} สำเร็จ ${found.questions.length} ข้อ!`);
  } else {
    showToast(`ไม่พบรหัสชุดข้อสอบ ${code} ในคลังปัจจุบัน`);
  }
}

// ================= LAUNCH ACTIVITIES =================
function openLaunchQuizModal(activityType = 'quiz') {
  pendingLaunchType = activityType;

  const roomSel = document.getElementById('launchSelectRoomCode');
  if (roomSel) {
    const rooms = appState.rooms || getDefaultRooms();
    roomSel.innerHTML = rooms.map(rm => {
      const selected = String(rm.code).toUpperCase() === String(appSettings.roomCode).toUpperCase() ? 'selected' : '';
      return `<option value="${escapeHtml(rm.code)}" ${selected}>${escapeHtml(rm.code)} — ${escapeHtml(rm.name)}</option>`;
    }).join('');
  }

  const sel = document.getElementById('launchSelectQuizId');
  sel.innerHTML = appState.quizzes.map(q =>
    `<option value="${q.id}">${escapeHtml(q.title)} (${q.questions.length} ข้อ)</option>`
  ).join('');

  document.getElementById('launchModalTitle').textContent =
    activityType === 'team' ? '🚀 เริ่มกิจกรรมแข่งขันเป็นทีม (Team Challenge)' : '📝 เลือกห้องสอบและชุดข้อสอบเพื่อเริ่มสอบ (Start Exam)';
  openModal('launchQuizModal');
}

function confirmLaunchSelectedQuiz() {
  const quizId = document.getElementById('launchSelectQuizId').value;
  const chosenRoom = document.getElementById('launchSelectRoomCode')?.value || appSettings.roomCode;
  if (!quizId) return showToast('กรุณาเลือกชุดข้อสอบก่อน');

  if (chosenRoom) {
    appSettings.roomCode = chosenRoom.toUpperCase();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
    updateRoomBadges();
  }

  closeModal('launchQuizModal');
  startNewLiveSession(quizId, pendingLaunchType);
}

function quickStartQuizFromLibrary(quizId) {
  startNewLiveSession(quizId, 'quiz');
}

async function startNewLiveSession(quizId, activityType = 'quiz') {
  const quiz = appState.quizzes.find(q => q.id === quizId);
  if (!quiz) return;

  const newSession = {
    id: 'SESS_' + Date.now(),
    roomCode: appSettings.roomCode || 'THANAT01',
    quizId: quiz.id,
    quizTitle: quiz.title,
    activityType: activityType,
    status: 'active',
    settings: {
      instantFeedback: document.getElementById('launchSettingInstantFeedback')?.checked ?? true,
      shuffle: document.getElementById('launchSettingShuffle')?.checked ?? false
    },
    startedAt: new Date().toISOString()
  };

  appState.activeSession = newSession;
  saveAppState();
  renderQuizLibrary();

  // ส่งทั้งตัวชุดข้อสอบ (saveQuiz) และสถานะการเปิดห้องสอบ (startSession) ไปยัง Google Sheets ทันทีเพื่อให้มือถือดึงข้อสอบชุดนี้ได้
  if (appSettings.gasWebAppUrl) {
    await syncQuizToGoogleSheet(quiz);
    await callGoogleScript({ action: 'startSession', session: newSession });
  }

  switchTab('live');
  showToast(`🚀 เปิดห้องสอบ "${quiz.title}" ในห้อง ${newSession.roomCode} เรียบร้อยแล้ว!`);
}

function launchExitTicket() {
  const exitQuizId = 'QUIZ_EXIT_TICKET';
  let exitQuiz = appState.quizzes.find(q => q.id === exitQuizId);
  if (!exitQuiz) {
    exitQuiz = {
      id: exitQuizId,
      title: 'Exit Ticket (ประเมินความเข้าใจหลังการอบรม)',
      subject: 'ประเมินผลท้ายการอบรม',
      shareCode: 'HANA-EXIT01',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      questions: [
        {
          id: 'EX1',
          type: 'MC',
          text: 'วันนี้คุณเข้าใจเนื้อหาการอบรมมากน้อยเพียงใด?',
          options: ['A. เข้าใจดีมาก', 'B. เข้าใจพอสมควร', 'C. ยังสงสัยบางจุด', 'D. ไม่เข้าใจเลย'],
          correctAnswer: 'A',
          points: 1
        },
        {
          id: 'EX2',
          type: 'SA',
          text: 'สิ่งที่ได้เรียนรู้ในวันนี้คืออะไร?',
          options: [],
          correctAnswer: '',
          points: 1
        },
        {
          id: 'EX3',
          type: 'SA',
          text: 'คำตอบสำหรับโจทย์ที่วิทยากรตั้งไว้คืออะไร?',
          options: [],
          correctAnswer: '',
          points: 1
        }
      ]
    };
    appState.quizzes.push(exitQuiz);
  }
  startNewLiveSession(exitQuizId, 'exit_ticket');
}

function launchQuickQuestion(qType) {
  const typeLabel = qType === 'MC' ? 'Multiple Choice' : (qType === 'TF' ? 'True / False' : 'Short Answer');
  const customAnswer = prompt(`เริ่มคำถามด่วน (${typeLabel}) ในห้อง ${appSettings.roomCode} - ระบุเฉลย (เว้นว่างได้):`, qType === 'MC' ? 'A' : (qType === 'TF' ? 'True' : ''));
  if (customAnswer === null) return;

  const quickQuiz = {
    id: 'QUIZ_QUICK_' + Date.now(),
    title: `Quick Question (${typeLabel})`,
    subject: 'Quick Question',
    shareCode: 'HANA-QUICK',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    questions: [
      {
        id: 'QQ_1',
        type: qType,
        text: `คำถามด่วนจากผู้คุมสอบ (${typeLabel})`,
        options: qType === 'MC' ? ['A', 'B', 'C', 'D'] : (qType === 'TF' ? ['True', 'False'] : []),
        correctAnswer: customAnswer.trim() || (qType === 'MC' ? 'A' : 'True'),
        points: 1
      }
    ]
  };
  appState.quizzes.unshift(quickQuiz);
  startNewLiveSession(quickQuiz.id, 'quick');
}

// ================= LIVE RESULTS VIEW =================
function renderLiveResultsTable() {
  const session = appState.activeSession;
  if (!session) return;

  const quiz = appState.quizzes.find(q => q.id === session.quizId) || appState.quizzes[0];
  if (!quiz) return;

  document.getElementById('liveQuizTitle').textContent = quiz.title;
  const liveRoomPill = document.getElementById('liveRoomPill');
  if (liveRoomPill) liveRoomPill.textContent = 'ห้อง: ' + (session.roomCode || appSettings.roomCode);

  const statusPill = document.getElementById('liveStatusPill');
  const pauseText = document.getElementById('pauseBtnText');

  if (session.status === 'paused') {
    statusPill.textContent = '⏸ PAUSED';
    statusPill.style.background = '#fef3c7';
    statusPill.style.color = '#92400e';
    pauseText.textContent = 'Resume';
  } else if (session.status === 'finished') {
    statusPill.textContent = '☑ FINISHED';
    statusPill.style.background = '#e2e8f0';
    statusPill.style.color = '#334155';
    pauseText.textContent = 'Pause';
  } else {
    statusPill.textContent = '● LIVE';
    statusPill.style.background = '#dcfce7';
    statusPill.style.color = '#166534';
    pauseText.textContent = 'Pause';
  }

  const showNames = document.getElementById('toggleShowNames')?.checked ?? true;
  const showResponses = document.getElementById('toggleShowResponses')?.checked ?? true;
  const showResults = document.getElementById('toggleShowResults')?.checked ?? true;

  const questions = quiz.questions || [];
  const activeRoom = String(session.roomCode || appSettings.roomCode).toUpperCase();
  // แสดงทั้งผู้เข้าสอบที่ตรงกับ sessionId หรือเข้าห้องเดียวกัน (รองรับกรณีมือถือสร้าง session ข้ามเครื่อง)
  const responses = (appState.responses || []).filter(r =>
    r.sessionId === session.id || String(r.roomCode || '').toUpperCase() === activeRoom
  );

  const navCounter = document.getElementById('navOnlineCount');
  if (navCounter) navCounter.textContent = responses.length;

  const thead = document.getElementById('liveTableHead');
  const qHeadersHtml = questions.map((q, idx) =>
    `<th class="q-col-header color-${idx % 5}" title="${escapeHtml(q.text)}">${idx + 1}</th>`
  ).join('');

  thead.innerHTML = `
    <tr>
      <th class="col-name">NAME ↓</th>
      <th class="col-score">SCORE ∨</th>
      ${qHeadersHtml}
    </tr>
  `;

  const tbody = document.getElementById('liveTableBody');
  const rowsHtml = responses.map((resp, rIdx) => {
    const displayName = showNames ? escapeHtml(resp.studentName) : `Examinee #${rIdx + 1}`;
    const displayScore = showResults ? `${resp.percent || 0}%` : '—';

    const cellsHtml = questions.map((q, qIdx) => {
      const ansObj = resp.answers ? resp.answers[qIdx] : null;
      if (!ansObj || ansObj.value === undefined || ansObj.value === '') {
        return `<td class="ans-cell empty"></td>`;
      }

      if (!showResponses) {
        return `<td class="ans-cell answered-neutral">•••</td>`;
      }

      const valText = escapeHtml(String(ansObj.value));
      if (!showResults) {
        return `<td class="ans-cell answered-neutral">${valText}</td>`;
      }

      const isCorrect = Boolean(ansObj.isCorrect);
      const cellClass = isCorrect ? 'correct' : 'wrong';
      const icon = isCorrect ? '✓' : '✕';
      return `<td class="ans-cell ${cellClass}">${icon} ${valText}</td>`;
    }).join('');

    return `
      <tr>
        <td>
          <div class="student-name-cell">
            <span class="online-dot-green"></span>
            <span>${displayName}</span>
          </div>
        </td>
        <td class="student-score-cell">${displayScore}</td>
        ${cellsHtml}
      </tr>
    `;
  }).join('');

  const totalStudents = responses.length;
  const classTotalCells = questions.map((q, qIdx) => {
    if (totalStudents === 0 || !showResults) return `<td>0%</td>`;
    let correctCount = 0;
    responses.forEach(r => {
      if (r.answers && r.answers[qIdx] && r.answers[qIdx].isCorrect) {
        correctCount++;
      }
    });
    const pct = Math.round((correctCount / totalStudents) * 100);
    return `<td>${pct}%</td>`;
  }).join('');

  tbody.innerHTML = rowsHtml + `
    <tr class="class-total-row">
      <td colspan="2">${totalStudents} &nbsp; Class Total</td>
      ${classTotalCells}
    </tr>
  `;
}

function togglePauseActivity() {
  if (!appState.activeSession) return;
  appState.activeSession.status = appState.activeSession.status === 'paused' ? 'active' : 'paused';
  saveAppState();
  if (appSettings.gasWebAppUrl) {
    callGoogleScript({
      action: 'updateSessionStatus',
      session_id: appState.activeSession.id,
      status: appState.activeSession.status
    });
  }
  showToast(appState.activeSession.status === 'paused' ? 'หยุดรับคำตอบชั่วคราว (Paused)' : 'เปิดรับคำตอบต่อแล้ว (Resumed)');
}

function finishCurrentActivity() {
  if (!appState.activeSession) return;
  appState.activeSession.status = 'finished';
  saveAppState();
  if (appSettings.gasWebAppUrl) {
    callGoogleScript({
      action: 'updateSessionStatus',
      session_id: appState.activeSession.id,
      status: 'finished'
    });
  }
  showToast('จบการทำข้อสอบเรียบร้อยแล้ว สามารถดูสรุปผลและดาวน์โหลด Excel ได้ที่เมนู Reports');
}

function openInviteStudentsModal() {
  updateRoomBadges();
  openModal('inviteModal');
}

// ปุ่มจำลองผู้เข้าสอบส่งข้อสอบจากมือถือแบบ Real-time
function simulateStudentSubmission() {
  const session = appState.activeSession;
  if (!session) return;
  const quiz = appState.quizzes.find(q => q.id === session.quizId) || appState.quizzes[0];
  if (!quiz) return;

  const sampleNames = [
    '056894 Thanat',
    'กิตติพงศ์ ใจดี (OP1)',
    'พิมพ์ชนก รักเรียน (QA)',
    'ธนกร เก่งมาก (Production)',
    'ณัฐธิดา สดใส (HRD)'
  ];

  let targetResp = appState.responses.find(r =>
    (r.sessionId === session.id || r.roomCode === session.roomCode) &&
    Object.keys(r.answers || {}).length < quiz.questions.length
  );

  if (!targetResp) {
    const randomName = sampleNames[appState.responses.length % sampleNames.length];
    targetResp = {
      id: 'RESP_' + Date.now(),
      sessionId: session.id,
      roomCode: session.roomCode,
      studentId: 'STU_' + Date.now(),
      studentName: randomName,
      answers: {},
      score: 0,
      percent: 0,
      updatedAt: new Date().toISOString()
    };
    appState.responses.push(targetResp);
  }

  const nextQIdx = Object.keys(targetResp.answers).length;
  const q = quiz.questions[nextQIdx];
  if (q) {
    const isLuckyCorrect = Math.random() > 0.25;
    let chosenVal = '';
    if (q.type === 'MC') {
      chosenVal = isLuckyCorrect ? String(q.correctAnswer || 'A') : (q.correctAnswer === 'A' ? 'B' : 'A');
    } else if (q.type === 'TF') {
      chosenVal = isLuckyCorrect ? String(q.correctAnswer || 'True') : (q.correctAnswer === 'True' ? 'False' : 'True');
    } else {
      chosenVal = isLuckyCorrect ? String(q.correctAnswer || 'โอห์ม') : 'โวลต์';
    }

    const correct = checkAnswerCorrectness(q, chosenVal);
    targetResp.answers[nextQIdx] = { value: chosenVal, isCorrect: correct };
    recalculateStudentScore(targetResp, quiz);
    targetResp.updatedAt = new Date().toISOString();
    saveAppState();
    syncStudentResponseToGoogleSheet(targetResp, quiz);
    showToast(`📱 ${targetResp.studentName} ส่งคำตอบข้อที่ ${nextQIdx + 1} แล้ว!`);
  }
}

// ================= STUDENT / EXAMINEE MOBILE QUIZ FLOW (CROSS-DEVICE SYNC) =================
async function syncStudentRoomSessionFromCloud(roomCode) {
  if (!appSettings.gasWebAppUrl) return false;
  const code = String(roomCode || appSettings.roomCode || 'THANAT01').toUpperCase().trim();
  const data = await callGoogleScript({
    action: 'getSessionByRoom',
    room_code: code
  });
  if (data && data.status === 'ok' && data.quiz) {
    // อัปเดตชุดข้อสอบที่ได้จาก Google Sheet เข้ามาในเครื่องมือถือทันที
    const existingIdx = appState.quizzes.findIndex(q => q.id === data.quiz.id);
    if (existingIdx !== -1) {
      appState.quizzes[existingIdx] = data.quiz;
    } else {
      appState.quizzes.unshift(data.quiz);
    }
    if (data.session) {
      appState.activeSession = data.session;
    } else {
      appState.activeSession = {
        id: 'SESS_' + code,
        roomCode: code,
        quizId: data.quiz.id,
        quizTitle: data.quiz.title,
        activityType: 'quiz',
        status: 'active',
        settings: { instantFeedback: true, shuffle: false },
        startedAt: new Date().toISOString()
      };
    }
    saveAppState(false);
    updateStudentDetectedQuizBanner();
    return true;
  }
  return false;
}

async function studentEnterRoom() {
  const room = document.getElementById('stuRoomInput').value.trim().toUpperCase();
  const name = document.getElementById('stuNameInput').value.trim();

  if (!room) return showToast('กรุณากรอกรหัสห้องสอบ (Room Name)');
  if (!name) return showToast('กรุณากรอกรหัสพนักงาน และ ชื่อ-นามสกุลของคุณ');

  const joinBtn = document.getElementById('stuJoinBtn');
  if (joinBtn) {
    joinBtn.disabled = true;
    joinBtn.textContent = '⏳ กำลังโหลดชุดข้อสอบของห้อง ' + room + '...';
  }

  // พยายามดึงชุดข้อสอบที่เปิดสอบอยู่ในห้องนั้นจาก Google Sheets ก่อน (ถ้าเชื่อมต่อได้)
  await syncStudentRoomSessionFromCloud(room);

  if (joinBtn) {
    joinBtn.disabled = false;
    joinBtn.textContent = 'เข้าสู่ห้องสอบ (Join Exam Room)';
  }

  ensureRoomExistsInList(room);
  appSettings.roomCode = room;

  let session = appState.activeSession;
  if (!session) {
    const firstQuiz = appState.quizzes[0] || getOrientation25Quiz();
    session = {
      id: 'SESS_' + room,
      roomCode: room,
      quizId: firstQuiz.id,
      quizTitle: firstQuiz.title,
      activityType: 'quiz',
      status: 'active',
      settings: { instantFeedback: true, shuffle: false },
      startedAt: new Date().toISOString()
    };
    appState.activeSession = session;
  }

  if (session.status === 'finished') {
    return showToast('การสอบในห้องนี้สิ้นสุดแล้ว');
  }
  if (session.status === 'paused') {
    return showToast('ผู้คุมสอบหยุดรับคำตอบชั่วคราว กรุณารอสักครู่');
  }

  currentStudent = {
    id: 'STU_' + name.replace(/\s+/g, '_').toUpperCase(),
    name: name,
    roomCode: room,
    currentIndex: 0,
    selectedOption: '',
    answers: {}
  };

  document.getElementById('studentRoomBadge').textContent = 'ROOM: ' + room;

  const quiz = appState.quizzes.find(q => q.id === session.quizId) || appState.quizzes[0];
  let existing = appState.responses.find(r =>
    (r.sessionId === session.id || String(r.roomCode).toUpperCase() === room) &&
    r.studentId === currentStudent.id
  );
  if (!existing) {
    existing = {
      id: 'RESP_' + Date.now(),
      sessionId: session.id,
      roomCode: room,
      studentId: currentStudent.id,
      studentName: name,
      answers: {},
      score: 0,
      percent: 0,
      updatedAt: new Date().toISOString()
    };
    appState.responses.push(existing);
    saveAppState();
    // แจ้ง Google Sheets ทันทีว่าผู้เข้าสอบคนนี้เข้าห้องสอบแล้ว (ขึ้นชื่อบนจอ Live Results ทันที)
    if (quiz) syncStudentResponseToGoogleSheet(existing, quiz);
  } else {
    currentStudent.answers = existing.answers || {};
  }

  document.getElementById('studentLoginStep').style.display = 'none';
  document.getElementById('studentDoneStep').style.display = 'none';
  document.getElementById('studentQuizStep').style.display = 'block';

  renderStudentCurrentQuestion();
}

function renderStudentCurrentQuestion() {
  const session = appState.activeSession;
  const quiz = appState.quizzes.find(q => q.id === session.quizId) || appState.quizzes[0];
  const questions = quiz.questions || [];
  const qIdx = currentStudent.currentIndex;
  const q = questions[qIdx];

  document.getElementById('stuQuizTitleDisplay').textContent = quiz.title;
  document.getElementById('stuDisplayName').textContent = `ผู้เข้าสอบ: ${currentStudent.name} (ห้อง: ${currentStudent.roomCode})`;
  document.getElementById('stuProgressBadge').textContent = `ข้อ ${qIdx + 1} / ${questions.length}`;
  document.getElementById('stuPrevBtn').style.visibility = qIdx > 0 ? 'visible' : 'hidden';

  const prevAns = currentStudent.answers[qIdx]?.value || '';
  currentStudent.selectedOption = prevAns;

  const container = document.getElementById('stuQuestionContainer');

  let inputHtml = '';
  if (q.type === 'MC') {
    const letters = ['A', 'B', 'C', 'D', 'E'];
    inputHtml = (q.options || []).map((opt, idx) => {
      const letter = letters[idx] || 'A';
      const cleanOpt = String(opt).replace(/^[A-E][\.\)\s]+/i, '');
      const selectedClass = currentStudent.selectedOption === letter ? 'selected' : '';
      return `
        <button class="student-option-btn ${selectedClass}" onclick="studentSelectOption('${letter}')">
          <span class="option-letter-badge">${letter}</span>
          <span>${escapeHtml(cleanOpt)}</span>
        </button>
      `;
    }).join('');
  } else if (q.type === 'TF') {
    inputHtml = ['True', 'False'].map(val => {
      const selectedClass = currentStudent.selectedOption === val ? 'selected' : '';
      return `
        <button class="student-option-btn ${selectedClass}" onclick="studentSelectOption('${val}')">
          <span class="option-letter-badge">${val.charAt(0)}</span>
          <span>${val === 'True' ? 'True (ถูก / ใช่)' : 'False (ผิด / ไม่ใช่)'}</span>
        </button>
      `;
    }).join('');
  } else {
    inputHtml = `
      <div class="form-group" style="margin-top:12px;">
        <label>พิมพ์คำตอบของคุณ:</label>
        <input type="text" id="stuShortAnswerInput" class="form-input" placeholder="พิมพ์คำตอบที่นี่..."
          value="${escapeHtml(prevAns)}"
          oninput="currentStudent.selectedOption = this.value" />
      </div>
    `;
  }

  container.innerHTML = `
    <div style="font-size:1.08rem;font-weight:600;color:#1e293b;margin-bottom:16px;line-height:1.5;">
      ${qIdx + 1}. ${escapeHtml(q.text)}
    </div>
    <div>${inputHtml}</div>
  `;
}

function studentSelectOption(val) {
  currentStudent.selectedOption = val;
  renderStudentCurrentQuestion();
}

function studentNavQuestion(delta) {
  const session = appState.activeSession;
  const quiz = appState.quizzes.find(q => q.id === session.quizId) || appState.quizzes[0];
  const next = currentStudent.currentIndex + delta;
  if (next >= 0 && next < quiz.questions.length) {
    currentStudent.currentIndex = next;
    renderStudentCurrentQuestion();
  }
}

function studentSubmitCurrentAnswer() {
  const session = appState.activeSession;
  if (session.status === 'paused') {
    return showToast('ผู้คุมสอบหยุดรับคำตอบชั่วคราว กรุณารอสักครู่');
  }
  const quiz = appState.quizzes.find(q => q.id === session.quizId) || appState.quizzes[0];
  const qIdx = currentStudent.currentIndex;
  const q = quiz.questions[qIdx];

  const val = String(currentStudent.selectedOption || '').trim();
  if (!val) return showToast('กรุณาเลือกหรือพิมพ์คำตอบก่อนกดส่ง');

  const isCorrect = checkAnswerCorrectness(q, val);
  currentStudent.answers[qIdx] = { value: val, isCorrect: isCorrect };

  let resp = appState.responses.find(r =>
    (r.sessionId === session.id || String(r.roomCode).toUpperCase() === currentStudent.roomCode) &&
    r.studentId === currentStudent.id
  );
  if (!resp) {
    resp = {
      id: 'RESP_' + Date.now(),
      sessionId: session.id,
      roomCode: currentStudent.roomCode,
      studentId: currentStudent.id,
      studentName: currentStudent.name,
      answers: {},
      score: 0,
      percent: 0
    };
    appState.responses.push(resp);
  }
  resp.answers = currentStudent.answers;
  recalculateStudentScore(resp, quiz);
  resp.updatedAt = new Date().toISOString();

  saveAppState();
  syncStudentResponseToGoogleSheet(resp, quiz);

  if (session.settings?.instantFeedback) {
    showToast(isCorrect ? '✅ คำตอบถูกต้อง!' : `❌ คำตอบยังไม่ถูก (เฉลย: ${q.correctAnswer})`);
  }

  if (qIdx + 1 < quiz.questions.length) {
    currentStudent.currentIndex++;
    renderStudentCurrentQuestion();
  } else {
    document.getElementById('studentQuizStep').style.display = 'none';
    document.getElementById('studentDoneStep').style.display = 'block';
    document.getElementById('stuFinalScoreText').textContent =
      `คะแนนของคุณ: ${resp.score} / ${quiz.questions.length} ข้อ (${resp.percent}%)`;
  }
}

function studentResetToLogin() {
  document.getElementById('stuNameInput').value = '';
  document.getElementById('studentDoneStep').style.display = 'none';
  document.getElementById('studentQuizStep').style.display = 'none';
  document.getElementById('studentLoginStep').style.display = 'block';
}

function checkAnswerCorrectness(question, givenValue) {
  const expected = String(question.correctAnswer || '').trim().toLowerCase();
  const actual = String(givenValue || '').trim().toLowerCase();
  if (!expected) return true;
  if (question.type === 'MC') {
    return expected.charAt(0) === actual.charAt(0);
  }
  return expected === actual;
}

function recalculateStudentScore(resp, quiz) {
  const totalQ = (quiz.questions || []).length || 1;
  let score = 0;
  Object.values(resp.answers || {}).forEach(a => {
    if (a && a.isCorrect) score++;
  });
  resp.score = score;
  resp.percent = Math.round((score / totalQ) * 100);
}

// ================= GOOGLE SHEETS SYNC & REPORTS =================
async function callGoogleScript(payload) {
  if (!appSettings.gasWebAppUrl) return null;
  try {
    const res = await fetch(appSettings.gasWebAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    console.warn('Google Script Sync warning:', err);
    return null;
  }
}

async function pullAllDataFromGoogleSheets(notify = false) {
  if (!appSettings.gasWebAppUrl) return;
  const data = await callGoogleScript({ action: 'getAllData' });
  if (data && data.status === 'ok') {
    if (Array.isArray(data.quizzes) && data.quizzes.length > 0) {
      data.quizzes.forEach(remoteQ => {
        if (!remoteQ || !remoteQ.id) return;
        const idx = appState.quizzes.findIndex(localQ => localQ.id === remoteQ.id);
        if (idx !== -1) {
          appState.quizzes[idx] = remoteQ;
        } else {
          appState.quizzes.push(remoteQ);
        }
      });
    }
    if (Array.isArray(data.rooms) && data.rooms.length > 0) {
      data.rooms.forEach(remoteRm => {
        if (!remoteRm || !remoteRm.code) return;
        const exists = appState.rooms.some(r => String(r.code).toUpperCase() === String(remoteRm.code).toUpperCase());
        if (!exists) appState.rooms.push(remoteRm);
      });
    }
    if (Array.isArray(data.sessions) && data.sessions.length > 0) {
      const roomSessions = data.sessions.filter(s =>
        String(s.roomCode).toUpperCase() === String(appSettings.roomCode).toUpperCase() && s.status !== 'finished'
      );
      if (roomSessions.length > 0) {
        appState.activeSession = roomSessions[roomSessions.length - 1];
      }
    }
    if (Array.isArray(data.responses) && data.responses.length > 0) {
      appState.responses = data.responses;
    }
    saveAppState(false);
    renderQuizLibrary();
    renderRoomsManagement();
    renderLiveResultsTable();
    if (notify) showToast('✅ ดึงข้อมูลชุดข้อสอบและห้องสอบล่าสุดจาก Google Sheets เรียบร้อยแล้ว!');
  }
}

async function testGoogleSheetConnection() {
  const url = document.getElementById('settingGasWebAppUrl').value.trim();
  const statusEl = document.getElementById('settingsTestStatus');
  if (!url) {
    statusEl.innerHTML = `<span style="color:#d97706;">ยังไม่ได้กรอก Web App URL — ระบบจะฝังข้อสอบไปกับลิงก์เชิญอัตโนมัติ</span>`;
    return;
  }
  statusEl.textContent = '⏳ กำลังทดสอบเชื่อมต่อและสร้างตารางฐานข้อมูลใน Google Sheets...';
  appSettings.gasWebAppUrl = url;
  const res = await callGoogleScript({ action: 'ping' });
  if (res && res.status === 'ok') {
    statusEl.innerHTML = `<span style="color:#16a34a;font-weight:700;">✅ เชื่อมต่อสำเร็จ! สร้างตาราง Rooms, Quizzes, Questions, Sessions, Responses ใน Google Sheets เรียบร้อยแล้ว</span>`;
    showToast('เชื่อมต่อ Google Sheets สำเร็จ!');
    await syncAllToGoogleSheets();
  } else {
    statusEl.innerHTML = `<span style="color:#dc2626;">⚠️ ไม่สามารถเชื่อมต่อข้ามเครื่องได้ กรุณาตรวจสอบใน Apps Script > Deploy > Manage deployments ว่าตั้งค่า <b>Who has access = Anyone (ทุกคน)</b> แล้ว (แต่ลิงก์เชิญผู้เข้าสอบยังใช้งานได้ทันทีเพราะฝังชุดข้อสอบในลิงก์แล้ว)</span>`;
  }
}

async function syncQuizToGoogleSheet(quiz) {
  if (!appSettings.gasWebAppUrl) return;
  await callGoogleScript({ action: 'saveQuiz', quiz: quiz });
}

async function syncStudentResponseToGoogleSheet(resp, quiz) {
  if (!appSettings.gasWebAppUrl) return;
  const orderedLabels = (quiz.questions || []).map((q, idx) => {
    const a = resp.answers?.[idx];
    if (!a) return '-';
    return `${a.isCorrect ? '✓' : '✕'} ${a.value}`;
  });
  await callGoogleScript({
    action: 'submitAnswer',
    payload: Object.assign({}, resp, {
      quizTitle: quiz.title,
      orderedAnswerLabels: orderedLabels
    })
  });
}

async function manualSyncFromGoogleSheet() {
  if (!appSettings.gasWebAppUrl) {
    openModal('settingsModal');
    return showToast('กรุณาใส่ Google Apps Script Web App URL เพื่อซิงค์กับ Google Sheets');
  }
  showToast('🔄 กำลังดึงข้อมูลล่าสุดจาก Google Sheets...');
  await pollLiveFromGoogleSheet(true);
}

async function pollLiveFromGoogleSheet(notify = false) {
  if (!appSettings.gasWebAppUrl || !appState.activeSession) return;
  const data = await callGoogleScript({
    action: 'getLiveSessionData',
    session_id: appState.activeSession.id,
    room_code: appSettings.roomCode
  });
  if (data && data.status === 'ok') {
    if (data.quiz && data.quiz.id) {
      const qIdx = appState.quizzes.findIndex(q => q.id === data.quiz.id);
      if (qIdx !== -1) appState.quizzes[qIdx] = data.quiz;
      else appState.quizzes.unshift(data.quiz);
    }
    if (data.session && data.session.id) {
      appState.activeSession = data.session;
    }
    if (Array.isArray(data.responses)) {
      const otherResponses = appState.responses.filter(r =>
        r.sessionId !== appState.activeSession.id &&
        String(r.roomCode).toUpperCase() !== String(appSettings.roomCode).toUpperCase()
      );
      appState.responses = otherResponses.concat(data.responses);
    }
    if (Array.isArray(data.rooms) && data.rooms.length > 0) {
      data.rooms.forEach(remoteRoom => {
        if (remoteRoom && remoteRoom.code) {
          const exists = (appState.rooms || []).some(local => String(local.code).toUpperCase() === String(remoteRoom.code).toUpperCase());
          if (!exists) {
            appState.rooms.push(remoteRoom);
          }
        }
      });
    }
    saveAppState(false);
    if (notify) showToast('✅ ซิงค์ข้อมูลจาก Google Sheets เรียบร้อยแล้ว!');
  }
}

async function syncAllToGoogleSheets() {
  if (!appSettings.gasWebAppUrl) {
    openModal('settingsModal');
    return showToast('กรุณาตั้งค่า Google Apps Script Web App URL ก่อนซิงค์ขึ้นคลาวด์');
  }
  showToast('☁️ กำลังส่งรายชื่อห้องสอบ ชุดข้อสอบ และผลคะแนนทั้งหมดขึ้น Google Sheets...');
  if (Array.isArray(appState.rooms) && appState.rooms.length > 0) {
    await callGoogleScript({ action: 'saveRooms', rooms: appState.rooms });
  }
  for (const quiz of appState.quizzes) {
    await syncQuizToGoogleSheet(quiz);
  }
  if (appState.activeSession) {
    await callGoogleScript({ action: 'startSession', session: appState.activeSession });
  }
  const activeQuiz = appState.quizzes.find(q => q.id === appState.activeSession?.quizId) || appState.quizzes[0];
  for (const r of appState.responses) {
    if (activeQuiz) await syncStudentResponseToGoogleSheet(r, activeQuiz);
  }
  showToast('✅ บันทึกทุกชุดข้อสอบ ห้องสอบ และคะแนนลง Google Sheets เรียบร้อยแล้ว!');
}

function renderReportsList() {
  const container = document.getElementById('reportsListContainer');
  if (!container) return;
  const session = appState.activeSession;
  const quiz = appState.quizzes.find(q => q.id === session?.quizId) || appState.quizzes[0];
  const activeRoom = String(session?.roomCode || appSettings.roomCode || 'THANAT01').toUpperCase();
  const responses = appState.responses.filter(r =>
    r.sessionId === session?.id || String(r.roomCode).toUpperCase() === activeRoom
  );

  container.innerHTML = `
    <div class="quiz-row">
      <div class="quiz-info-main">
        <div class="quiz-doc-icon" style="background:#dcfce7;color:#166534;">📊</div>
        <div>
          <div class="quiz-name">${escapeHtml(quiz?.title || 'แบบวัดผลการปฐมนิเทศ พนักงานรายวัน 25 ข้อ')} (ห้อง ${escapeHtml(activeRoom)})</div>
          <div class="quiz-meta">
            <span>ผู้เข้าสอบทั้งหมด ${responses.length} คน</span>
            <span>•</span>
            <span>จำนวนข้อสอบ ${(quiz?.questions || []).length} ข้อ</span>
          </div>
        </div>
      </div>
      <div class="quiz-row-actions">
        <button class="btn-outline" onclick="switchTab('live')">ดูตารางสด (Live Results)</button>
        <button class="btn-primary-blue" onclick="exportCurrentReportToExcel()">⬇ ดาวน์โหลด Excel (.xlsx)</button>
      </div>
    </div>
  `;
}

function exportCurrentReportToExcel() {
  const session = appState.activeSession;
  const quiz = appState.quizzes.find(q => q.id === session?.quizId) || appState.quizzes[0];
  if (!quiz) return;
  const activeRoom = String(session?.roomCode || appSettings.roomCode || 'THANAT01').toUpperCase();
  const responses = appState.responses.filter(r =>
    r.sessionId === session?.id || String(r.roomCode).toUpperCase() === activeRoom
  );

  const rows = responses.map((r, idx) => {
    const rowObj = {
      'ลำดับ': idx + 1,
      'ชื่อ-นามสกุล (Examinee Name)': r.studentName,
      'ห้องสอบ (Room)': r.roomCode || activeRoom,
      'คะแนนที่ได้': r.score,
      'คิดเป็น % (Score %)': `${r.percent}%`
    };
    (quiz.questions || []).forEach((q, qIdx) => {
      const ans = r.answers?.[qIdx];
      rowObj[`ข้อ ${qIdx + 1}`] = ans ? `${ans.isCorrect ? '✓' : '✕'} ${ans.value}` : '-';
    });
    return rowObj;
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Hana_Exam_Results');
  XLSX.writeFile(wb, `Hana_Exam_${quiz.title.replace(/\s+/g, '_')}_Results.xlsx`);
  showToast('ดาวน์โหลดไฟล์ผลคะแนน Excel เรียบร้อยแล้ว');
}

// ================= MODAL & UI HELPERS =================
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

function showToast(msg) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'toast-msg';
  div.textContent = msg;
  container.appendChild(div);
  setTimeout(() => {
    div.style.opacity = '0';
    div.style.transition = 'opacity 0.3s';
    setTimeout(() => div.remove(), 300);
  }, 3200);
}

function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
