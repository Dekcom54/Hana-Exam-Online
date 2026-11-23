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
const DRIVE_IMAGES_ROOT_FOLDER_ID = '1SMXkHtdsCvcNCMTfosakUcf7xnEMJdBE';
const DRIVE_IMAGES_ROOT_FOLDER_URL = 'https://drive.google.com/drive/folders/1SMXkHtdsCvcNCMTfosakUcf7xnEMJdBE';

// Cache รูปภาพแบบ Data URL ชั่วคราวในเครื่องเพื่อช่วยให้ Export PDF ไม่ติด CORS
const localImageDataUrlCache = {};

let appSettings = {
  sheetDocUrl: 'https://docs.google.com/spreadsheets/d/1vPV2GXeJLxlCXrMkbHUSVWUZyLSDT4SnjjhxOEIALGQ/edit',
  gasWebAppUrl: DEFAULT_GAS_WEB_APP_URL,
  driveFolderId: DRIVE_IMAGES_ROOT_FOLDER_ID,
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
      settings: {
        deliveryMethod: 'instant_feedback',
        requireNames: true,
        shuffle: false,
        shuffleAnswers: false,
        instantFeedback: true,
        showFinalScore: true,
        oneAttempt: false,
        timeLimitEnabled: false,
        timeLimitMinutes: 15,
        activityMonitoring: false,
        restrictionsEnabled: false,
        blockCopyPaste: false,
        accessPasscode: '',
        teacherPacedIndex: 0
      },
      startedAt: '2026-11-17T08:40:00.000Z'
    },
    responses: [],
    reports: [],
    clearedSessionIds: []
  };
}

let appState = loadAppState();
let builderEditingQuizId = null;
let builderQuestions = [];
let pendingLaunchType = 'quiz';
let selectedDeliveryMethod = 'instant_feedback';
let currentReportDetailId = null;
let activeExportTab = 'excel';

// Student state
let currentStudent = {
  id: '',
  name: '',
  teamName: '',
  roomCode: 'THANAT01',
  currentIndex: 0,
  questionOrder: [],
  optionOrderMap: {},
  selectedOption: '',
  answers: {},
  tabSwitches: 0,
  monitoringLog: [],
  timerInterval: null,
  remainingSeconds: 0,
  monitoringActive: false
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
        syncStudentTeacherPacedIfActive();
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
      syncStudentTeacherPacedIfActive();
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
      const compactPayload = {
        s: session ? {
          id: session.id,
          r: code,
          t: session.activityType || 'quiz',
          st: session.status || 'active',
          cfg: session.settings || {}
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
            item.correctAnswer ?? 'True',
            (item.imageUrl && String(item.imageUrl).startsWith('http')) ? item.imageUrl : ''
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
        imageUrl: arr[4] || '',
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
    const cfg = data.s?.cfg || {
      deliveryMethod: 'instant_feedback',
      requireNames: true,
      instantFeedback: data.s?.fb ?? true,
      shuffle: data.s?.sh ?? false,
      showFinalScore: true
    };
    appState.activeSession = {
      id: data.s?.id || ('SESS_' + roomCode),
      roomCode: roomCode,
      quizId: importedQuiz.id,
      quizTitle: importedQuiz.title,
      activityType: data.s?.t || 'quiz',
      status: data.s?.st || 'active',
      settings: cfg,
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
  if (!session || session.status === 'finished' || session.status === 'cleared') {
    banner.textContent = '⏳ ขณะนี้ยังไม่มีข้อสอบที่เปิดสอบในห้องนี้ กรุณารอผู้คุมสอบกด Launch';
    banner.style.background = '#f8fafc';
    banner.style.color = '#64748b';
    return;
  }
  const quiz = appState.quizzes.find(q => q.id === session.quizId) || appState.quizzes[0];
  if (quiz) {
    banner.style.background = '#eff6ff';
    banner.style.color = '#1e40af';
    banner.textContent = `📝 ชุดข้อสอบที่เปิดสอบ: ${quiz.title} (${(quiz.questions || []).length} ข้อ)`;
  }

  // อัปเดตช่องกรอกตามเงื่อนไขที่ผู้ปล่อยข้อสอบตั้งไว้
  const cfg = session.settings || {};
  const nameLabel = document.getElementById('stuNameLabel');
  if (nameLabel) {
    nameLabel.textContent = cfg.requireNames === false
      ? 'รหัสพนักงาน และ ชื่อ - นามสกุล (ไม่บังคับ)'
      : 'รหัสพนักงาน และ ชื่อ - นามสกุล (Employee ID & Name) *';
  }
  const teamGroup = document.getElementById('stuTeamSelectGroup');
  if (teamGroup) {
    teamGroup.style.display = (cfg.deliveryMethod === 'team_challenge' || session.activityType === 'team') ? 'block' : 'none';
  }
  const passGroup = document.getElementById('stuPasscodeGroup');
  if (passGroup) {
    passGroup.style.display = (cfg.restrictionsEnabled && cfg.accessPasscode) ? 'block' : 'none';
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
    if (!Array.isArray(parsed.responses)) {
      parsed.responses = [];
    }
    if (!Array.isArray(parsed.reports)) {
      parsed.reports = [];
    }
    if (!Array.isArray(parsed.clearedSessionIds)) {
      parsed.clearedSessionIds = [];
    }

    const hasOrient25 = parsed.quizzes.some(q => q.id === 'QUIZ_HANA_ORIENT_25' || q.title.includes('แบบวัดผลการปฐมนิเทศ'));
    if (!hasOrient25) {
      parsed.quizzes.unshift(getOrientation25Quiz());
    }
    parsed.quizzes = parsed.quizzes.filter(q => q.id !== 'QUIZ_LIFE_SCI_01' || parsed.quizzes.length === 1);

    // คงค่า activeSession = null ไว้หากถูกล้างหลังจากดาวน์โหลดรายงานแล้ว (เพื่อให้หน้า Live Results แสดงสถานะว่างตามรูปที่ 4)
    if (parsed.activeSession) {
      const currentQuizExists = parsed.quizzes.some(q => q.id === parsed.activeSession.quizId);
      if (!currentQuizExists) {
        parsed.activeSession = null;
      }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    return parsed;
  } catch (e) {
    return getInitialSeedState();
  }
}

function saveAppState(broadcast = true) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (err) {
    console.warn('localStorage quota warning:', err);
  }
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

// ================= QUESTION IMAGE HELPERS & GOOGLE DRIVE AUTO-FOLDER =================
function extractDriveFileId(url) {
  if (!url) return '';
  const str = String(url);
  let m = str.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = str.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return '';
}

function getDisplayImageUrl(url) {
  if (!url) return '';
  const str = String(url).trim();
  if (str.startsWith('data:image/')) return str;
  const driveId = extractDriveFileId(str);
  if (driveId) return `https://lh3.googleusercontent.com/d/${driveId}`;
  return str;
}

function handleQuestionImageError(imgEl) {
  if (!imgEl || imgEl.dataset.fallbackTried) return;
  const orig = imgEl.getAttribute('data-orig-url') || imgEl.src || '';
  const driveId = extractDriveFileId(orig);
  if (driveId) {
    imgEl.dataset.fallbackTried = '1';
    imgEl.src = `https://drive.google.com/thumbnail?id=${driveId}&sz=w1200`;
  }
}

function openImageLightbox(src) {
  const img = document.getElementById('lightboxPreviewImg');
  if (!img || !src) return;
  img.removeAttribute('data-fallback-tried');
  img.setAttribute('data-orig-url', src);
  img.onerror = () => handleQuestionImageError(img);
  img.src = getDisplayImageUrl(src);
  openModal('imageLightboxModal');
}

function compressImageFileToDataUrl(file, maxWidth = 1100, quality = 0.84) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => resolve({ dataUrl: ev.target.result, mimeType: file.type || 'image/jpeg' });
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const outMime = (file.type === 'image/png') ? 'image/png' : 'image/jpeg';
        const dataUrl = outMime === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality);
        resolve({ dataUrl, mimeType: outMime });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
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
    points: 1,
    imageUrl: ''
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

    const imgUrl = q.imageUrl ? getDisplayImageUrl(q.imageUrl) : '';
    const isDriveImg = imgUrl && (imgUrl.includes('googleusercontent.com') || imgUrl.includes('drive.google.com'));
    const imageRowHtml = q.imageUrl ? `
      <div class="q-image-row">
        <div class="q-image-preview-wrap">
          <img src="${escapeHtml(imgUrl)}" data-orig-url="${escapeHtml(q.imageUrl)}" onerror="handleQuestionImageError(this)"
            class="q-image-thumb" onclick="openImageLightbox('${escapeHtml(q.imageUrl)}')" title="คลิกเพื่อดูภาพขนาดเต็ม" />
          <div style="display:flex;flex-direction:column;gap:4px;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              ${q._uploadingDrive
                ? '<span class="q-image-badge uploading">⏳ กำลังอัปโหลดขึ้น Google Drive...</span>'
                : (isDriveImg
                  ? '<span class="q-image-badge drive">☁️ บันทึกบน Google Drive แล้ว</span>'
                  : '<span class="q-image-badge local">🖼️ แนบรูปภาพแล้ว</span>')}
              ${q.imageFolderUrl ? `<a href="${escapeHtml(q.imageFolderUrl)}" target="_blank" style="font-size:0.74rem;color:#0284c7;text-decoration:underline;">เปิดโฟลเดอร์ Drive ↗</a>` : ''}
            </div>
            <span style="font-size:0.74rem;color:#64748b;">คลิกที่รูปเพื่อดูขนาดใหญ่</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <label class="btn-outline" style="padding:5px 10px;font-size:0.78rem;cursor:pointer;">
            🔄 เปลี่ยนรูป
            <input type="file" accept="image/*" style="display:none;" onchange="handleBuilderQuestionImageUpload(${idx}, event)" />
          </label>
          <button type="button" class="btn-outline" style="padding:5px 10px;font-size:0.78rem;color:#dc2626;" onclick="removeBuilderQuestionImage(${idx})">
            🗑 ลบรูป
          </button>
        </div>
      </div>
    ` : `
      <div class="q-image-row">
        <div style="font-size:0.8rem;color:#64748b;">
          🖼️ รูปภาพประกอบข้อที่ ${idx + 1} (เก็บลงโฟลเดอร์ตามชื่อข้อสอบใน Google Drive อัตโนมัติ)
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <label class="btn-outline" style="padding:5px 10px;font-size:0.78rem;cursor:pointer;border-color:#93c5fd;color:#1e40af;background:#eff6ff;">
            📷 เพิ่มรูปภาพ
            <input type="file" accept="image/*" style="display:none;" onchange="handleBuilderQuestionImageUpload(${idx}, event)" />
          </label>
          <button type="button" class="btn-outline" style="padding:5px 10px;font-size:0.78rem;" onclick="promptQuestionImageUrl(${idx})">
            🔗 วางลิงก์รูป
          </button>
        </div>
      </div>
    `;

    return `
      <div class="q-builder-card" onpaste="handleBuilderQuestionPasteImage(${idx}, event)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="soc-code-pill" style="background:#1e40af;color:#fff;">ข้อที่ ${idx + 1}</span>
            <select class="form-select" style="width:auto;padding:4px 10px;font-size:0.82rem;"
              onchange="changeBuilderQuestionType(${idx}, this.value)">
              <option value="MC" ${q.type === 'MC' ? 'selected' : ''}>Multiple Choice (ปรนัย)</option>
              <option value="TF" ${q.type === 'TF' ? 'selected' : ''}>True / False (ถูก-ผิด)</option>
              <option value="SA" ${q.type === 'SA' ? 'selected' : ''}>Short Answer (เติมคำ)</option>
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <label class="btn-outline" style="padding:4px 10px;font-size:0.78rem;cursor:pointer;border-color:#93c5fd;color:#1e40af;background:#eff6ff;" title="อัปโหลดรูปภาพลง Google Drive โฟลเดอร์ตามชื่อข้อสอบอัตโนมัติ (หรือกด Ctrl+V วางรูปได้)">
              📷 ${q.imageUrl ? 'เปลี่ยนรูป' : 'เพิ่มรูป'}
              <input type="file" accept="image/*" style="display:none;" onchange="handleBuilderQuestionImageUpload(${idx}, event)" />
            </label>
            <button class="btn-outline" style="padding:4px 8px;font-size:0.78rem;color:#dc2626;" onclick="removeBuilderQuestion(${idx})">
              ลบข้อนี้
            </button>
          </div>
        </div>
        <input type="text" class="form-input" placeholder="พิมพ์โจทย์คำถามข้อที่ ${idx + 1}... (สามารถกด Ctrl+V วางรูปภาพข้อนี้ได้)"
          value="${escapeHtml(q.text)}"
          oninput="updateBuilderQuestion(${idx}, 'text', this.value)" />
        ${imageRowHtml}
        ${optionsHtml}
      </div>
    `;
  }).join('');
}

function handleBuilderQuestionPasteImage(idx, event) {
  const items = event.clipboardData?.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type && items[i].type.startsWith('image/')) {
      const file = items[i].getAsFile();
      if (file) {
        event.preventDefault();
        handleBuilderQuestionImageUpload(idx, { target: { files: [file] } });
        return;
      }
    }
  }
}

async function handleBuilderQuestionImageUpload(idx, event) {
  const file = event.target.files?.[0];
  if (!file || !builderQuestions[idx]) return;

  const quizTitle = (document.getElementById('builderQuizTitle')?.value || '').trim() || 'ชุดข้อสอบออนไลน์';

  try {
    const { dataUrl, mimeType } = await compressImageFileToDataUrl(file, 1100, 0.84);
    builderQuestions[idx].imageUrl = dataUrl;
    builderQuestions[idx]._uploadingDrive = Boolean(appSettings.gasWebAppUrl);
    renderBuilderQuestions();

    if (appSettings.gasWebAppUrl) {
      showToast(`⏳ กำลังอัปโหลดรูปข้อที่ ${idx + 1} ไปยังโฟลเดอร์ "${quizTitle}" ใน Google Drive...`);
      const res = await callGoogleScript({
        action: 'uploadQuestionImage',
        quizTitle: quizTitle,
        questionNum: idx + 1,
        fileName: `Q${idx + 1}_${file.name}`,
        mimeType: mimeType,
        base64Data: dataUrl,
        rootFolderId: DRIVE_IMAGES_ROOT_FOLDER_ID
      });

      if (builderQuestions[idx]) {
        builderQuestions[idx]._uploadingDrive = false;
        if (res && res.status === 'ok' && res.imageUrl) {
          builderQuestions[idx].imageUrl = res.imageUrl;
          builderQuestions[idx].imageDriveFileId = res.fileId;
          builderQuestions[idx].imageFolderUrl = res.folderUrl || DRIVE_IMAGES_ROOT_FOLDER_URL;
          localImageDataUrlCache[res.imageUrl] = dataUrl;
          localImageDataUrlCache[res.fileId] = dataUrl;
          renderBuilderQuestions();
          showToast(`☁️ อัปโหลดรูปข้อที่ ${idx + 1} ลงโฟลเดอร์ "${res.folderName || quizTitle}" ใน Google Drive สำเร็จ!`);
        } else {
          renderBuilderQuestions();
          showToast(`🖼️ แนบรูปข้อที่ ${idx + 1} ไว้ในเครื่องแล้ว (กรุณาอัปเดตและ Deploy โค้ด Code.gs ใน Apps Script เพื่อให้ซิงค์เข้า Google Drive อัตโนมัติ)`);
        }
      }
    } else {
      showToast(`🖼️ แนบรูปภาพประกอบข้อที่ ${idx + 1} เรียบร้อยแล้ว`);
    }
  } catch (err) {
    console.error(err);
    if (builderQuestions[idx]) builderQuestions[idx]._uploadingDrive = false;
    renderBuilderQuestions();
    showToast('ไม่สามารถอ่านไฟล์รูปภาพได้: ' + err.message);
  }
}

function promptQuestionImageUrl(idx) {
  if (!builderQuestions[idx]) return;
  const url = prompt('วางลิงก์รูปภาพ (เช่น ลิงก์แชร์จาก Google Drive หรือ URL รูปภาพ):', builderQuestions[idx].imageUrl || '');
  if (url === null) return;
  builderQuestions[idx].imageUrl = url.trim();
  renderBuilderQuestions();
}

function removeBuilderQuestionImage(idx) {
  if (!builderQuestions[idx]) return;
  builderQuestions[idx].imageUrl = '';
  builderQuestions[idx].imageDriveFileId = '';
  builderQuestions[idx].imageFolderUrl = '';
  renderBuilderQuestions();
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

async function saveBuilderQuiz() {
  const title = document.getElementById('builderQuizTitle').value.trim() || 'ชุดข้อสอบใหม่ (' + new Date().toLocaleDateString('th-TH') + ')';
  const subject = document.getElementById('builderQuizSubject').value.trim() || 'ทั่วไป';

  if (builderQuestions.length === 0) {
    return showToast('กรุณาเพิ่มคำถามอย่างน้อย 1 ข้อก่อนบันทึก');
  }

  // ล้างสถานะชั่วคราวก่อนบันทึก
  const cleanQuestions = builderQuestions.map(q => {
    const copy = Object.assign({}, q);
    delete copy._uploadingDrive;
    return copy;
  });

  const now = new Date().toISOString();
  let savedQuiz = null;

  if (builderEditingQuizId) {
    const idx = appState.quizzes.findIndex(q => q.id === builderEditingQuizId);
    if (idx !== -1) {
      appState.quizzes[idx].title = title;
      appState.quizzes[idx].subject = subject;
      appState.quizzes[idx].questions = cleanQuestions;
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
      questions: cleanQuestions
    };
    appState.quizzes.unshift(savedQuiz);
  }

  // หากมี activeSession ที่กำลังเปิดข้อสอบชุดนี้อยู่ ให้อัปเดตชื่อตามไปด้วย
  if (appState.activeSession && appState.activeSession.quizId === savedQuiz.id) {
    appState.activeSession.quizTitle = savedQuiz.title;
  }

  saveAppState();
  renderQuizLibrary();
  closeModal('createQuizModal');
  showToast(`💾 กำลังบันทึกชุดข้อสอบ "${title}" (${cleanQuestions.length} ข้อ) ลง Google Sheets...`);

  const syncRes = await syncQuizToGoogleSheet(savedQuiz);
  if (syncRes && syncRes.uploadedImages) {
    let changed = false;
    Object.entries(syncRes.uploadedImages).forEach(([qIdxStr, info]) => {
      const qi = Number(qIdxStr);
      if (savedQuiz.questions[qi] && info && info.imageUrl) {
        if (savedQuiz.questions[qi].imageUrl?.startsWith('data:')) {
          localImageDataUrlCache[info.imageUrl] = savedQuiz.questions[qi].imageUrl;
        }
        savedQuiz.questions[qi].imageUrl = info.imageUrl;
        savedQuiz.questions[qi].imageDriveFileId = info.fileId;
        savedQuiz.questions[qi].imageFolderUrl = info.folderUrl || DRIVE_IMAGES_ROOT_FOLDER_URL;
        changed = true;
      }
    });
    if (changed) saveAppState(false);
  }
  showToast(`✅ บันทึกชุดข้อสอบ "${title}" (${cleanQuestions.length} ข้อ) เรียบร้อยแล้ว!`);
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

// ================= LAUNCH ACTIVITIES (MATCHES IMAGE 2 — ALL UNLOCKED) =================
function selectDeliveryMethod(method) {
  selectedDeliveryMethod = method || 'instant_feedback';
  document.querySelectorAll('#deliveryMethodList .delivery-method-card').forEach(card => {
    const isSel = card.getAttribute('data-method') === selectedDeliveryMethod;
    card.classList.toggle('selected', isSel);
    const radio = card.querySelector('input[type="radio"]');
    if (radio) radio.checked = isSel;
  });
}

function toggleLaunchSubSetting(elId, isChecked) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.style.display = isChecked ? 'flex' : 'none';
}

function openLaunchQuizModal(activityType = 'quiz', preselectedQuizId = null) {
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
  sel.innerHTML = appState.quizzes.map(q => {
    const isSel = preselectedQuizId && q.id === preselectedQuizId ? 'selected' : '';
    return `<option value="${q.id}" ${isSel}>${escapeHtml(q.title)} (${(q.questions || []).length} ข้อ)</option>`;
  }).join('');

  selectDeliveryMethod(activityType === 'team' ? 'team_challenge' : 'instant_feedback');

  document.getElementById('launchModalTitle').textContent =
    activityType === 'team' ? '🚀 Team Challenge Settings' : '📝 Launch Exam / Quiz Settings';
  openModal('launchQuizModal');
}

function readLaunchModalSettings() {
  const deliveryMethod = selectedDeliveryMethod || 'instant_feedback';
  return {
    deliveryMethod: deliveryMethod,
    requireNames: document.getElementById('launchSettingRequireNames')?.checked ?? true,
    shuffle: document.getElementById('launchSettingShuffle')?.checked ?? false,
    shuffleAnswers: document.getElementById('launchSettingShuffleAnswers')?.checked ?? false,
    instantFeedback: document.getElementById('launchSettingInstantFeedback')?.checked ?? true,
    showFinalScore: document.getElementById('launchSettingShowFinalScore')?.checked ?? true,
    oneAttempt: document.getElementById('launchSettingOneAttempt')?.checked ?? false,
    timeLimitEnabled: document.getElementById('launchSettingTimeLimit')?.checked ?? false,
    timeLimitMinutes: Math.max(1, Number(document.getElementById('launchSettingTimeLimitMinutes')?.value || 15)),
    activityMonitoring: document.getElementById('launchSettingActivityMonitoring')?.checked ?? false,
    restrictionsEnabled: document.getElementById('launchSettingRestrictions')?.checked ?? false,
    blockCopyPaste: document.getElementById('launchSettingBlockCopy')?.checked ?? true,
    accessPasscode: (document.getElementById('launchSettingPasscode')?.value || '').trim(),
    teacherPacedIndex: 0
  };
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

  const settings = readLaunchModalSettings();
  const actType = settings.deliveryMethod === 'team_challenge' ? 'team' : (pendingLaunchType || 'quiz');

  closeModal('launchQuizModal');
  startNewLiveSession(quizId, actType, settings);
}

function quickStartQuizFromLibrary(quizId) {
  openLaunchQuizModal('quiz', quizId);
}

async function startNewLiveSession(quizId, activityType = 'quiz', customSettings = null) {
  const quiz = appState.quizzes.find(q => q.id === quizId);
  if (!quiz) return;

  const settings = customSettings || {
    deliveryMethod: activityType === 'team' ? 'team_challenge' : 'instant_feedback',
    requireNames: true,
    shuffle: false,
    shuffleAnswers: false,
    instantFeedback: true,
    showFinalScore: true,
    oneAttempt: false,
    timeLimitEnabled: false,
    timeLimitMinutes: 15,
    activityMonitoring: false,
    restrictionsEnabled: false,
    blockCopyPaste: false,
    accessPasscode: '',
    teacherPacedIndex: 0
  };

  const newSession = {
    id: 'SESS_' + Date.now(),
    roomCode: appSettings.roomCode || 'THANAT01',
    quizId: quiz.id,
    quizTitle: quiz.title,
    activityType: activityType,
    status: 'active',
    settings: settings,
    startedAt: new Date().toISOString()
  };

  appState.activeSession = newSession;
  saveAppState();
  renderQuizLibrary();

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

// ================= LIVE RESULTS VIEW (ACTIVE + IMAGE 4 EMPTY STATE) =================
function getResponsesForSession(session) {
  if (!session) return [];
  const clearedSet = new Set(appState.clearedSessionIds || []);
  return (appState.responses || []).filter(r => {
    if (!r) return false;
    if (clearedSet.has(r.sessionId)) return false;
    if (String(r.sessionId) === String(session.id)) return true;
    // รองรับเฉพาะกรณีคำตอบจากห้องเดียวกันที่ส่งหลังเวลาเปิด session นี้
    const sameRoom = String(r.roomCode || '').toUpperCase() === String(session.roomCode || '').toUpperCase();
    if (sameRoom && !r.sessionId && session.startedAt && r.updatedAt && r.updatedAt >= session.startedAt) {
      return true;
    }
    return false;
  });
}

function getDeliveryMethodLabel(method) {
  const map = {
    instant_feedback: 'Instant Feedback',
    open_navigation: 'Open Navigation',
    teacher_paced: 'Teacher Paced',
    team_challenge: 'Team Challenge'
  };
  return map[method] || 'Instant Feedback';
}

function renderLiveResultsTable() {
  const emptyEl = document.getElementById('liveEmptyState');
  const activeEl = document.getElementById('liveActiveContent');
  const navCounter = document.getElementById('navOnlineCount');

  const session = appState.activeSession;
  if (!session || session.status === 'cleared') {
    if (emptyEl) emptyEl.style.display = 'flex';
    if (activeEl) activeEl.style.display = 'none';
    if (navCounter) navCounter.textContent = '0';
    return;
  }

  const quiz = appState.quizzes.find(q => q.id === session.quizId) || appState.quizzes[0];
  if (!quiz) {
    if (emptyEl) emptyEl.style.display = 'flex';
    if (activeEl) activeEl.style.display = 'none';
    if (navCounter) navCounter.textContent = '0';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (activeEl) activeEl.style.display = 'block';

  document.getElementById('liveQuizTitle').textContent = quiz.title;
  const liveRoomPill = document.getElementById('liveRoomPill');
  if (liveRoomPill) liveRoomPill.textContent = 'ห้อง: ' + (session.roomCode || appSettings.roomCode);

  const methodPill = document.getElementById('liveMethodPill');
  const deliveryMethod = session.settings?.deliveryMethod || (session.activityType === 'team' ? 'team_challenge' : 'instant_feedback');
  if (methodPill) methodPill.textContent = getDeliveryMethodLabel(deliveryMethod);

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

  const questions = quiz.questions || [];
  const responses = getResponsesForSession(session);
  if (navCounter) navCounter.textContent = responses.length;

  // Teacher Paced Controls Bar
  const tpBar = document.getElementById('teacherPacedBar');
  if (tpBar) {
    if (deliveryMethod === 'teacher_paced' && session.status !== 'finished') {
      tpBar.style.display = 'flex';
      const tpIdx = Math.min(Math.max(0, Number(session.settings?.teacherPacedIndex || 0)), Math.max(0, questions.length - 1));
      const tpLabel = document.getElementById('teacherPacedQuestionLabel');
      if (tpLabel && questions[tpIdx]) {
        tpLabel.textContent = `กำลังเปิดข้อที่ ${tpIdx + 1} / ${questions.length}: ${String(questions[tpIdx].text || '').substring(0, 75)}`;
      }
    } else {
      tpBar.style.display = 'none';
    }
  }

  // Team Challenge Live Progress Bar
  const tcBar = document.getElementById('teamChallengeBar');
  if (tcBar) {
    if (deliveryMethod === 'team_challenge') {
      tcBar.style.display = 'block';
      const teamColors = {
        'Blue Team': '#2563eb',
        'Green Team': '#16a34a',
        'Orange Team': '#ea580c',
        'Purple Team': '#7c3aed'
      };
      const teamMap = {};
      Object.keys(teamColors).forEach(t => teamMap[t] = { sumPct: 0, count: 0 });
      responses.forEach(r => {
        const t = r.teamName || 'Blue Team';
        if (!teamMap[t]) teamMap[t] = { sumPct: 0, count: 0 };
        teamMap[t].sumPct += Number(r.percent || 0);
        teamMap[t].count += 1;
      });
      tcBar.innerHTML = `
        <div style="font-weight:700;font-size:0.9rem;color:#1e293b;margin-bottom:10px;">🚀 Team Challenge Live Progress</div>
        <div style="display:grid;gap:8px;">
          ${Object.entries(teamMap).map(([teamName, info]) => {
            const avg = info.count > 0 ? Math.round(info.sumPct / info.count) : 0;
            const color = teamColors[teamName] || '#0284c7';
            return `
              <div style="display:grid;grid-template-columns:130px 1fr 64px;align-items:center;gap:10px;font-size:0.84rem;">
                <span style="font-weight:700;color:${color};">${escapeHtml(teamName)} (${info.count})</span>
                <div style="height:14px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
                  <div style="height:100%;width:${avg}%;background:${color};transition:width 0.3s;border-radius:999px;"></div>
                </div>
                <span style="font-weight:700;text-align:right;color:#334155;">${avg}%</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      tcBar.style.display = 'none';
    }
  }

  const showNames = document.getElementById('toggleShowNames')?.checked ?? true;
  const showResponses = document.getElementById('toggleShowResponses')?.checked ?? true;
  const showResults = document.getElementById('toggleShowResults')?.checked ?? true;

  renderMatrixIntoElements(
    document.getElementById('liveTableHead'),
    document.getElementById('liveTableBody'),
    questions,
    responses,
    { showNames, showResponses, showResults, showMonitoringBadge: Boolean(session.settings?.activityMonitoring) }
  );
}

function renderMatrixIntoElements(thead, tbody, questions, responses, opts = {}) {
  if (!thead || !tbody) return;
  const { showNames = true, showResponses = true, showResults = true, showMonitoringBadge = false } = opts;

  const qHeadersHtml = (questions || []).map((q, idx) =>
    `<th class="q-col-header color-${idx % 5}" title="${escapeHtml(q.text)}">${idx + 1}</th>`
  ).join('');

  thead.innerHTML = `
    <tr>
      <th class="col-name">NAME ▲</th>
      <th class="col-score">SCORE %</th>
      ${qHeadersHtml}
    </tr>
  `;

  const rowsHtml = (responses || []).map((resp, rIdx) => {
    const displayName = showNames ? escapeHtml(resp.studentName) : `Examinee #${rIdx + 1}`;
    const displayScore = showResults ? `${resp.percent || 0}%` : '—';
    const switches = Number(resp.tabSwitches || 0);
    const monBadge = (showMonitoringBadge && switches > 0)
      ? `<span title="สลับหน้าจอ ${switches} ครั้ง" style="background:#fee2e2;color:#b91c1c;font-size:0.7rem;padding:1px 5px;border-radius:4px;font-weight:700;">⚠ ${switches}</span>`
      : '';

    const cellsHtml = (questions || []).map((q, qIdx) => {
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
            ${monBadge}
          </div>
        </td>
        <td class="student-score-cell">${displayScore}</td>
        ${cellsHtml}
      </tr>
    `;
  }).join('');

  const totalStudents = (responses || []).length;
  const classTotalCells = (questions || []).map((q, qIdx) => {
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

function teacherPaceMove(delta) {
  const session = appState.activeSession;
  if (!session) return;
  const quiz = appState.quizzes.find(q => q.id === session.quizId);
  if (!quiz) return;
  const cur = Number(session.settings?.teacherPacedIndex || 0);
  const next = Math.min(Math.max(0, cur + delta), Math.max(0, (quiz.questions || []).length - 1));
  if (!session.settings) session.settings = {};
  session.settings.teacherPacedIndex = next;
  saveAppState();
  if (appSettings.gasWebAppUrl) {
    callGoogleScript({
      action: 'updateSessionStatus',
      session_id: session.id,
      status: session.status,
      settings: session.settings
    });
  }
  showToast(`👨‍🏫 เปลี่ยนคำถามไปยังข้อที่ ${next + 1} แล้ว`);
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
  const session = appState.activeSession;
  if (!session) return showToast('ยังไม่มีกิจกรรมที่กำลังเปิดสอบอยู่');

  const quiz = appState.quizzes.find(q => q.id === session.quizId) || appState.quizzes[0];
  if (!quiz) return;

  const now = new Date().toISOString();
  const sessionResponses = getResponsesForSession(session);
  const avgPct = sessionResponses.length > 0
    ? Math.round(sessionResponses.reduce((sum, r) => sum + Number(r.percent || 0), 0) / sessionResponses.length)
    : 0;

  // สร้าง Report Snapshot เก็บถาวรใน appState.reports เพื่อให้โหลด Excel / PDF ได้ตลอดแม้ล้างหน้า Live Results แล้ว
  const reportObj = {
    id: 'RPT_' + Date.now(),
    sessionId: session.id,
    roomCode: String(session.roomCode || appSettings.roomCode || 'THANAT01').toUpperCase(),
    quizId: quiz.id,
    quizTitle: quiz.title,
    quizSubject: quiz.subject || 'ทั่วไป',
    deliveryMethod: session.settings?.deliveryMethod || 'instant_feedback',
    settings: JSON.parse(JSON.stringify(session.settings || {})),
    startedAt: session.startedAt || now,
    finishedAt: now,
    passRateThreshold: 80,
    questions: JSON.parse(JSON.stringify(quiz.questions || [])),
    responses: JSON.parse(JSON.stringify(sessionResponses)),
    avgPercent: avgPct
  };

  if (!Array.isArray(appState.reports)) appState.reports = [];
  // อัปเดตหากมี report ของ session เดียวกันอยู่แล้ว หรือเพิ่มใหม่บนสุด
  const existingIdx = appState.reports.findIndex(rp => rp.sessionId === session.id);
  if (existingIdx !== -1) {
    appState.reports[existingIdx] = reportObj;
  } else {
    appState.reports.unshift(reportObj);
  }

  appState.activeSession.status = 'finished';
  appState.activeSession.endedAt = now;
  saveAppState();

  if (appSettings.gasWebAppUrl) {
    callGoogleScript({ action: 'updateSessionStatus', session_id: session.id, status: 'finished' });
    callGoogleScript({ action: 'saveReport', report: reportObj });
  }

  // พาผู้ดูแลมายังหน้า Report Detail ทันทีตามรูปที่ 3
  switchTab('reports');
  openReportDetail(reportObj.id);
  showToast('☑ จบการสอบแล้ว! สามารถกด Export Results เพื่อดาวน์โหลด Excel หรือ PDF รายบุคคลได้ทันที');
}

function clearLiveResultsAfterExport(sessionId) {
  if (!Array.isArray(appState.clearedSessionIds)) appState.clearedSessionIds = [];
  if (sessionId && !appState.clearedSessionIds.includes(sessionId)) {
    appState.clearedSessionIds.push(sessionId);
  }
  const active = appState.activeSession;
  if (active && (!sessionId || active.id === sessionId || active.status === 'finished')) {
    const clearedId = active.id;
    const clearedRoom = active.roomCode;
    if (!appState.clearedSessionIds.includes(clearedId)) {
      appState.clearedSessionIds.push(clearedId);
    }
    appState.activeSession = null;
    appState.responses = (appState.responses || []).filter(r =>
      r.sessionId !== clearedId && r.sessionId !== sessionId
    );
    if (appSettings.gasWebAppUrl) {
      callGoogleScript({ action: 'clearLiveSession', session_id: clearedId, room_code: clearedRoom });
    }
  } else if (sessionId) {
    appState.responses = (appState.responses || []).filter(r => r.sessionId !== sessionId);
  }
  saveAppState();
  renderLiveResultsTable();
  renderQuizLibrary();
}

function openInviteStudentsModal() {
  updateRoomBadges();
  openModal('inviteModal');
}

// ปุ่มจำลองผู้เข้าสอบส่งข้อสอบจากมือถือแบบ Real-time
function simulateStudentSubmission() {
  const session = appState.activeSession;
  if (!session) return showToast('กรุณากดเปิดข้อสอบ (Launch) ก่อนจำลองผู้เข้าสอบ');
  const quiz = appState.quizzes.find(q => q.id === session.quizId) || appState.quizzes[0];
  if (!quiz) return;

  const sampleNames = [
    '056894 Thanat Y.',
    '082942 ทาริกา',
    '061204 กิตติพงศ์ ใจดี',
    '074318 พิมพ์ชนก รักเรียน',
    '059102 ธนกร เก่งมาก'
  ];
  const sampleTeams = ['Blue Team', 'Green Team', 'Orange Team', 'Purple Team'];

  const currentResps = getResponsesForSession(session);
  let targetResp = currentResps.find(r => Object.keys(r.answers || {}).length < quiz.questions.length);

  if (!targetResp) {
    const randomName = sampleNames[currentResps.length % sampleNames.length];
    targetResp = {
      id: 'RESP_' + Date.now(),
      sessionId: session.id,
      roomCode: session.roomCode,
      studentId: 'STU_' + Date.now(),
      studentName: randomName,
      teamName: sampleTeams[currentResps.length % sampleTeams.length],
      answers: {},
      score: 0,
      percent: 0,
      tabSwitches: 0,
      monitoringLog: [],
      updatedAt: new Date().toISOString()
    };
    appState.responses.push(targetResp);
  }

  // ตอบทีละข้อ (หรือหลายข้อเพื่อทดสอบง่ายขึ้น)
  const nextQIdx = Object.keys(targetResp.answers).length;
  const q = quiz.questions[nextQIdx];
  if (q) {
    const isLuckyCorrect = Math.random() > 0.2;
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

// ================= STUDENT / EXAMINEE MOBILE QUIZ FLOW =================
function shuffleArrayCopy(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function stopStudentExamGuards() {
  if (currentStudent.timerInterval) {
    clearInterval(currentStudent.timerInterval);
    currentStudent.timerInterval = null;
  }
  currentStudent.monitoringActive = false;
  document.removeEventListener('visibilitychange', handleStudentVisibilityChange);
  document.removeEventListener('copy', handleStudentRestrictionBlock);
  document.removeEventListener('contextmenu', handleStudentRestrictionBlock);
}

function handleStudentRestrictionBlock(e) {
  if (!currentStudent.monitoringActive) return;
  const cfg = appState.activeSession?.settings || {};
  if (cfg.restrictionsEnabled && cfg.blockCopyPaste) {
    e.preventDefault();
    showToast('🚫 ระบบป้องกันการคัดลอกข้อความระหว่างทำข้อสอบ');
  }
}

function handleStudentVisibilityChange() {
  if (!currentStudent.monitoringActive) return;
  const session = appState.activeSession;
  if (!session?.settings?.activityMonitoring) return;
  if (document.hidden) {
    currentStudent.tabSwitches = (currentStudent.tabSwitches || 0) + 1;
    const ts = new Date().toLocaleTimeString('th-TH');
    if (!Array.isArray(currentStudent.monitoringLog)) currentStudent.monitoringLog = [];
    currentStudent.monitoringLog.push(`สลับหน้าจอออกเวลา ${ts}`);
    const resp = appState.responses.find(r => r.sessionId === session.id && r.studentId === currentStudent.id);
    if (resp) {
      resp.tabSwitches = currentStudent.tabSwitches;
      resp.monitoringLog = currentStudent.monitoringLog;
      saveAppState();
    }
  } else {
    showToast(`⚠️ Activity Monitoring: ตรวจพบการสลับหน้าจอ (${currentStudent.tabSwitches} ครั้ง)`);
  }
}

function startStudentTimer(minutes) {
  if (currentStudent.timerInterval) clearInterval(currentStudent.timerInterval);
  currentStudent.remainingSeconds = Math.max(1, Number(minutes || 15)) * 60;
  const badge = document.getElementById('stuTimerBadge');
  const updateDisplay = () => {
    const m = Math.floor(currentStudent.remainingSeconds / 60);
    const s = currentStudent.remainingSeconds % 60;
    if (badge) {
      badge.style.display = 'inline-block';
      badge.textContent = `⏱ ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      if (currentStudent.remainingSeconds <= 60) {
        badge.style.background = '#fee2e2';
        badge.style.color = '#b91c1c';
      } else {
        badge.style.background = '#fef3c7';
        badge.style.color = '#92400e';
      }
    }
  };
  updateDisplay();
  currentStudent.timerInterval = setInterval(() => {
    currentStudent.remainingSeconds--;
    updateDisplay();
    if (currentStudent.remainingSeconds <= 0) {
      clearInterval(currentStudent.timerInterval);
      currentStudent.timerInterval = null;
      showToast('⏰ หมดเวลาทำข้อสอบ! ระบบกำลังส่งคำตอบของคุณอัตโนมัติ');
      finishStudentExam();
    }
  }, 1000);
}

function syncStudentTeacherPacedIfActive() {
  const quizStep = document.getElementById('studentQuizStep');
  if (!quizStep || quizStep.style.display === 'none') return;
  const session = appState.activeSession;
  if (!session || session.settings?.deliveryMethod !== 'teacher_paced') return;
  const targetIdx = Number(session.settings?.teacherPacedIndex || 0);
  if (currentStudent.currentIndex !== targetIdx) {
    currentStudent.currentIndex = targetIdx;
    const origIdx = currentStudent.questionOrder[targetIdx] ?? targetIdx;
    currentStudent.selectedOption = currentStudent.answers[origIdx]?.value || '';
    renderStudentCurrentQuestion();
  }
}

async function syncStudentRoomSessionFromCloud(roomCode) {
  if (!appSettings.gasWebAppUrl) return false;
  const code = String(roomCode || appSettings.roomCode || 'THANAT01').toUpperCase().trim();
  const data = await callGoogleScript({
    action: 'getSessionByRoom',
    room_code: code
  });
  if (data && data.status === 'ok' && data.quiz) {
    const existingIdx = appState.quizzes.findIndex(q => q.id === data.quiz.id);
    if (existingIdx !== -1) {
      appState.quizzes[existingIdx] = data.quiz;
    } else {
      appState.quizzes.unshift(data.quiz);
    }
    if (data.session) {
      appState.activeSession = data.session;
    }
    saveAppState(false);
    updateStudentDetectedQuizBanner();
    return true;
  }
  return false;
}

async function studentEnterRoom() {
  const room = document.getElementById('stuRoomInput').value.trim().toUpperCase();
  let name = document.getElementById('stuNameInput').value.trim();

  if (!room) return showToast('กรุณากรอกรหัสห้องสอบ (Room Name)');

  const joinBtn = document.getElementById('stuJoinBtn');
  if (joinBtn) {
    joinBtn.disabled = true;
    joinBtn.textContent = '⏳ กำลังโหลดชุดข้อสอบของห้อง ' + room + '...';
  }

  await syncStudentRoomSessionFromCloud(room);

  if (joinBtn) {
    joinBtn.disabled = false;
    joinBtn.textContent = 'เข้าสู่ห้องสอบ (Join Exam Room)';
  }

  ensureRoomExistsInList(room);
  appSettings.roomCode = room;

  const session = appState.activeSession;
  if (!session || session.status === 'finished' || session.status === 'cleared') {
    return showToast('ขณะนี้ยังไม่มีข้อสอบที่เปิดสอบในห้องนี้ กรุณารอผู้คุมสอบกด Launch');
  }
  if (session.status === 'paused') {
    return showToast('ผู้คุมสอบหยุดรับคำตอบชั่วคราว กรุณารอสักครู่');
  }

  const cfg = session.settings || {};

  // ตรวจสอบ Require Names
  if (cfg.requireNames !== false && !name) {
    return showToast('กรุณากรอกรหัสพนักงาน และ ชื่อ-นามสกุลของคุณ');
  }
  if (!name) {
    const anonNum = getResponsesForSession(session).length + 1;
    name = `Anonymous #${anonNum}`;
  }

  // ตรวจสอบ Restrictions Passcode
  if (cfg.restrictionsEnabled && cfg.accessPasscode) {
    const enteredPass = (document.getElementById('stuPasscodeInput')?.value || '').trim();
    if (enteredPass !== cfg.accessPasscode) {
      return showToast('🔒 รหัสผ่านเข้าสอบไม่ถูกต้อง กรุณาตรวจสอบกับผู้คุมสอบ');
    }
  }

  const studentId = 'STU_' + name.replace(/\s+/g, '_').toUpperCase();
  const quiz = appState.quizzes.find(q => q.id === session.quizId) || appState.quizzes[0];
  if (!quiz) return showToast('ไม่พบชุดข้อสอบของห้องนี้');

  // ตรวจสอบ One Attempt
  let existing = appState.responses.find(r =>
    String(r.sessionId) === String(session.id) && r.studentId === studentId
  );
  if (cfg.oneAttempt && existing && existing.completed) {
    return showToast('🚫 ข้อสอบนี้กำหนดให้ทำได้เพียง 1 ครั้ง (One Attempt) คุณส่งข้อสอบไปแล้ว');
  }

  const teamName = (cfg.deliveryMethod === 'team_challenge' || session.activityType === 'team')
    ? (document.getElementById('stuTeamSelect')?.value || 'Blue Team')
    : '';

  const totalQ = (quiz.questions || []).length;
  const baseIndices = Array.from({ length: totalQ }, (_, i) => i);
  const questionOrder = (cfg.shuffle && cfg.deliveryMethod !== 'teacher_paced')
    ? shuffleArrayCopy(baseIndices)
    : baseIndices;

  const optionOrderMap = {};
  if (cfg.shuffleAnswers) {
    (quiz.questions || []).forEach((q, qIdx) => {
      if (q.type === 'MC' && Array.isArray(q.options)) {
        optionOrderMap[qIdx] = shuffleArrayCopy(q.options.map((_, oi) => oi));
      }
    });
  }

  stopStudentExamGuards();

  currentStudent = {
    id: studentId,
    name: name,
    teamName: teamName,
    roomCode: room,
    currentIndex: cfg.deliveryMethod === 'teacher_paced' ? Number(cfg.teacherPacedIndex || 0) : 0,
    questionOrder: questionOrder,
    optionOrderMap: optionOrderMap,
    selectedOption: '',
    answers: existing?.answers ? JSON.parse(JSON.stringify(existing.answers)) : {},
    tabSwitches: existing?.tabSwitches || 0,
    monitoringLog: existing?.monitoringLog || [],
    timerInterval: null,
    remainingSeconds: 0,
    monitoringActive: true
  };

  document.getElementById('studentRoomBadge').textContent = 'ROOM: ' + room;

  if (!existing) {
    existing = {
      id: 'RESP_' + Date.now(),
      sessionId: session.id,
      roomCode: room,
      studentId: currentStudent.id,
      studentName: name,
      teamName: teamName,
      answers: {},
      score: 0,
      percent: 0,
      tabSwitches: 0,
      monitoringLog: [],
      completed: false,
      updatedAt: new Date().toISOString()
    };
    appState.responses.push(existing);
    saveAppState();
  } else {
    existing.teamName = teamName || existing.teamName || '';
    saveAppState();
  }
  syncStudentResponseToGoogleSheet(existing, quiz);

  // เปิดใช้งาน Time Limit / Activity Monitoring / Restrictions
  const timerBadge = document.getElementById('stuTimerBadge');
  if (cfg.timeLimitEnabled) {
    startStudentTimer(cfg.timeLimitMinutes || 15);
  } else if (timerBadge) {
    timerBadge.style.display = 'none';
  }

  const monBadge = document.getElementById('stuMonitoringBadge');
  if (cfg.activityMonitoring) {
    if (monBadge) monBadge.style.display = 'inline-block';
    document.addEventListener('visibilitychange', handleStudentVisibilityChange);
  } else if (monBadge) {
    monBadge.style.display = 'none';
  }

  if (cfg.restrictionsEnabled && cfg.blockCopyPaste) {
    document.addEventListener('copy', handleStudentRestrictionBlock);
    document.addEventListener('contextmenu', handleStudentRestrictionBlock);
  }

  const firstOrigIdx = currentStudent.questionOrder[currentStudent.currentIndex] ?? 0;
  currentStudent.selectedOption = currentStudent.answers[firstOrigIdx]?.value || '';

  document.getElementById('studentLoginStep').style.display = 'none';
  document.getElementById('studentDoneStep').style.display = 'none';
  document.getElementById('studentQuizStep').style.display = 'block';

  renderStudentCurrentQuestion();
}

function renderStudentCurrentQuestion() {
  const session = appState.activeSession;
  if (!session) return;
  const quiz = appState.quizzes.find(q => q.id === session.quizId) || appState.quizzes[0];
  if (!quiz) return;
  const questions = quiz.questions || [];
  const cfg = session.settings || {};
  const method = cfg.deliveryMethod || 'instant_feedback';

  const displayIdx = Math.min(Math.max(0, currentStudent.currentIndex), Math.max(0, questions.length - 1));
  const origQIdx = currentStudent.questionOrder?.[displayIdx] ?? displayIdx;
  const q = questions[origQIdx];
  if (!q) return;

  document.getElementById('stuQuizTitleDisplay').textContent = quiz.title;
  document.getElementById('stuDisplayName').textContent =
    `ผู้เข้าสอบ: ${currentStudent.name}${currentStudent.teamName ? ` [${currentStudent.teamName}]` : ''} (ห้อง: ${currentStudent.roomCode})`;
  document.getElementById('stuProgressBadge').textContent = `ข้อ ${displayIdx + 1} / ${questions.length}`;

  // จัดการปุ่มและแถบควบคุมตาม Delivery Method
  const prevBtn = document.getElementById('stuPrevBtn');
  const submitBtn = document.getElementById('stuSubmitBtn');
  const finishAllBtn = document.getElementById('stuFinishAllBtn');
  const openNavBar = document.getElementById('stuOpenNavBar');
  const tpBanner = document.getElementById('stuTeacherPacedBanner');

  if (tpBanner) tpBanner.style.display = method === 'teacher_paced' ? 'block' : 'none';

  if (method === 'open_navigation') {
    if (prevBtn) prevBtn.style.visibility = displayIdx > 0 ? 'visible' : 'hidden';
    if (submitBtn) submitBtn.textContent = displayIdx + 1 < questions.length ? 'บันทึกและไปข้อถัดไป ➡' : 'บันทึกคำตอบข้อนี้';
    if (finishAllBtn) finishAllBtn.style.display = 'inline-flex';
    if (openNavBar) {
      openNavBar.style.display = 'flex';
      openNavBar.innerHTML = currentStudent.questionOrder.map((oIdx, dIdx) => {
        const isCurrent = dIdx === displayIdx;
        const isAns = Boolean(currentStudent.answers[oIdx]?.value);
        return `<button type="button" class="stu-nav-pill ${isCurrent ? 'current' : (isAns ? 'answered' : '')}" onclick="studentJumpToQuestion(${dIdx})">${dIdx + 1}</button>`;
      }).join('');
    }
  } else {
    if (openNavBar) openNavBar.style.display = 'none';
    if (finishAllBtn) finishAllBtn.style.display = 'none';
    if (prevBtn) prevBtn.style.visibility = (method === 'teacher_paced' || displayIdx === 0) ? 'hidden' : 'visible';
    if (submitBtn) submitBtn.textContent = 'ส่งคำตอบ (Submit Answer)';
  }

  const prevAns = currentStudent.answers[origQIdx]?.value || '';
  if (!currentStudent.selectedOption) {
    currentStudent.selectedOption = prevAns;
  }

  const container = document.getElementById('stuQuestionContainer');

  let imageHtml = '';
  if (q.imageUrl) {
    const imgSrc = getDisplayImageUrl(q.imageUrl);
    imageHtml = `
      <div class="stu-question-image-wrap">
        <img src="${escapeHtml(imgSrc)}" data-orig-url="${escapeHtml(q.imageUrl)}" onerror="handleQuestionImageError(this)"
          class="stu-question-image" onclick="openImageLightbox('${escapeHtml(q.imageUrl)}')" title="แตะเพื่อขยายรูปภาพ" />
      </div>
    `;
  }

  let inputHtml = '';
  if (q.type === 'MC') {
    const letters = ['A', 'B', 'C', 'D', 'E'];
    const rawOpts = q.options || [];
    const order = currentStudent.optionOrderMap?.[origQIdx] || rawOpts.map((_, i) => i);
    inputHtml = order.map((origOptIdx, visualIdx) => {
      const opt = rawOpts[origOptIdx] || '';
      const origLetter = letters[origOptIdx] || 'A';
      const displayLetter = letters[visualIdx] || origLetter;
      const cleanOpt = String(opt).replace(/^[A-E][\.\)\s]+/i, '');
      const selectedClass = currentStudent.selectedOption === origLetter ? 'selected' : '';
      return `
        <button type="button" class="student-option-btn ${selectedClass}" data-optval="${origLetter}" onclick="studentSelectOption('${origLetter}')">
          <span class="option-letter-badge">${displayLetter}</span>
          <span>${escapeHtml(cleanOpt)}</span>
        </button>
      `;
    }).join('');
  } else if (q.type === 'TF') {
    inputHtml = ['True', 'False'].map(val => {
      const selectedClass = currentStudent.selectedOption === val ? 'selected' : '';
      return `
        <button type="button" class="student-option-btn ${selectedClass}" data-optval="${val}" onclick="studentSelectOption('${val}')">
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
          value="${escapeHtml(currentStudent.selectedOption || prevAns)}"
          oninput="currentStudent.selectedOption = this.value" />
      </div>
    `;
  }

  container.innerHTML = `
    <div style="font-size:1.08rem;font-weight:600;color:#1e293b;margin-bottom:12px;line-height:1.5;">
      ${displayIdx + 1}. ${escapeHtml(q.text)}
    </div>
    ${imageHtml}
    <div>${inputHtml}</div>
  `;
}

function studentSelectOption(val) {
  currentStudent.selectedOption = val;
  document.querySelectorAll('#stuQuestionContainer .student-option-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.getAttribute('data-optval') === val);
  });
}

function studentJumpToQuestion(displayIdx) {
  currentStudent.currentIndex = displayIdx;
  const origQIdx = currentStudent.questionOrder?.[displayIdx] ?? displayIdx;
  currentStudent.selectedOption = currentStudent.answers[origQIdx]?.value || '';
  renderStudentCurrentQuestion();
}

function studentNavQuestion(delta) {
  const session = appState.activeSession;
  const quiz = appState.quizzes.find(q => q.id === session?.quizId) || appState.quizzes[0];
  if (!quiz) return;
  const next = currentStudent.currentIndex + delta;
  if (next >= 0 && next < quiz.questions.length) {
    studentJumpToQuestion(next);
  }
}

function studentSubmitCurrentAnswer() {
  const session = appState.activeSession;
  if (!session || session.status === 'finished' || session.status === 'cleared') {
    return showToast('การสอบในห้องนี้สิ้นสุดแล้ว');
  }
  if (session.status === 'paused') {
    return showToast('ผู้คุมสอบหยุดรับคำตอบชั่วคราว กรุณารอสักครู่');
  }
  const quiz = appState.quizzes.find(q => q.id === session.quizId) || appState.quizzes[0];
  const cfg = session.settings || {};
  const method = cfg.deliveryMethod || 'instant_feedback';

  const displayIdx = currentStudent.currentIndex;
  const origQIdx = currentStudent.questionOrder?.[displayIdx] ?? displayIdx;
  const q = quiz.questions[origQIdx];

  let val = String(currentStudent.selectedOption || '').trim();
  if (!val) {
    const selectedBtn = document.querySelector('#stuQuestionContainer .student-option-btn.selected');
    if (selectedBtn) val = selectedBtn.getAttribute('data-optval') || '';
  }
  if (!val) {
    const shortInput = document.getElementById('stuShortAnswerInput');
    if (shortInput) val = shortInput.value.trim();
  }
  if (!val) return showToast('กรุณาเลือกหรือพิมพ์คำตอบก่อนกดส่ง');

  const isCorrect = checkAnswerCorrectness(q, val);
  currentStudent.answers[origQIdx] = { value: val, isCorrect: isCorrect };

  let resp = appState.responses.find(r =>
    String(r.sessionId) === String(session.id) && r.studentId === currentStudent.id
  );
  if (!resp) {
    resp = {
      id: 'RESP_' + Date.now(),
      sessionId: session.id,
      roomCode: currentStudent.roomCode,
      studentId: currentStudent.id,
      studentName: currentStudent.name,
      teamName: currentStudent.teamName || '',
      answers: {},
      score: 0,
      percent: 0,
      tabSwitches: currentStudent.tabSwitches || 0,
      monitoringLog: currentStudent.monitoringLog || []
    };
    appState.responses.push(resp);
  }
  resp.answers = Object.assign({}, currentStudent.answers);
  resp.tabSwitches = currentStudent.tabSwitches || 0;
  resp.monitoringLog = currentStudent.monitoringLog || [];
  recalculateStudentScore(resp, quiz);
  resp.updatedAt = new Date().toISOString();

  saveAppState();
  syncStudentResponseToGoogleSheet(resp, quiz);

  if (cfg.instantFeedback && method !== 'open_navigation') {
    showToast(isCorrect ? '✅ คำตอบถูกต้อง!' : `❌ คำตอบยังไม่ถูก (เฉลย: ${q.correctAnswer})`);
  }

  if (method === 'teacher_paced') {
    showToast(`✅ ส่งคำตอบข้อที่ ${displayIdx + 1} แล้ว รอผู้คุมสอบเปลี่ยนข้อถัดไป`);
    return;
  }

  if (method === 'open_navigation') {
    if (displayIdx + 1 < quiz.questions.length) {
      studentJumpToQuestion(displayIdx + 1);
    } else {
      renderStudentCurrentQuestion();
      showToast('บันทึกคำตอบแล้ว สามารถตรวจทานหรือกด "ส่งข้อสอบทั้งหมด" ด้านล่างได้');
    }
    return;
  }

  if (displayIdx + 1 < quiz.questions.length) {
    studentJumpToQuestion(displayIdx + 1);
  } else {
    finishStudentExam();
  }
}

function studentFinishOpenNavQuiz() {
  const session = appState.activeSession;
  const quiz = appState.quizzes.find(q => q.id === session?.quizId);
  const answeredCount = Object.keys(currentStudent.answers || {}).length;
  const totalQ = (quiz?.questions || []).length;
  if (answeredCount < totalQ) {
    if (!confirm(`คุณตอบไปแล้ว ${answeredCount} / ${totalQ} ข้อ ต้องการส่งข้อสอบทั้งหมดเลยใช่หรือไม่?`)) return;
  }
  finishStudentExam();
}

function finishStudentExam() {
  stopStudentExamGuards();
  const session = appState.activeSession;
  const quiz = appState.quizzes.find(q => q.id === session?.quizId) || appState.quizzes[0];
  const cfg = session?.settings || {};

  let resp = appState.responses.find(r =>
    session && String(r.sessionId) === String(session.id) && r.studentId === currentStudent.id
  );
  if (resp) {
    resp.completed = true;
    recalculateStudentScore(resp, quiz);
    resp.updatedAt = new Date().toISOString();
    saveAppState();
    if (quiz) syncStudentResponseToGoogleSheet(resp, quiz);
  }

  document.getElementById('studentQuizStep').style.display = 'none';
  document.getElementById('studentDoneStep').style.display = 'block';

  const scoreEl = document.getElementById('stuFinalScoreText');
  if (cfg.showFinalScore !== false && resp && quiz) {
    scoreEl.textContent = `คะแนนของคุณ: ${resp.score} / ${(quiz.questions || []).length} ข้อ (${resp.percent}%)`;
    scoreEl.style.color = '#16a34a';
  } else {
    scoreEl.textContent = 'บันทึกคำตอบเรียบร้อยแล้ว (ผู้คุมสอบปิดการแสดงคะแนนรวม)';
    scoreEl.style.color = '#0369a1';
  }
}

function studentResetToLogin() {
  stopStudentExamGuards();
  document.getElementById('stuNameInput').value = '';
  document.getElementById('studentDoneStep').style.display = 'none';
  document.getElementById('studentQuizStep').style.display = 'none';
  document.getElementById('studentLoginStep').style.display = 'block';
  updateStudentDetectedQuizBanner();
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
  const totalQ = (quiz?.questions || []).length || 1;
  let score = 0;
  Object.values(resp.answers || {}).forEach(a => {
    if (a && a.isCorrect) score++;
  });
  resp.score = score;
  resp.percent = Math.round((score / totalQ) * 100);
}

// ================= GOOGLE SHEETS SYNC =================
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
    const clearedSet = new Set(appState.clearedSessionIds || []);
    if (Array.isArray(data.quizzes) && data.quizzes.length > 0) {
      data.quizzes.forEach(remoteQ => {
        if (!remoteQ || !remoteQ.id) return;
        const idx = appState.quizzes.findIndex(localQ => localQ.id === remoteQ.id);
        if (idx !== -1) {
          // รักษา local imageUrl ไว้หากฝั่ง remote ยังไม่มีคอลัมน์ image_url
          const localQs = appState.quizzes[idx].questions || [];
          (remoteQ.questions || []).forEach((rq, qi) => {
            if (!rq.imageUrl && localQs[qi]?.imageUrl) rq.imageUrl = localQs[qi].imageUrl;
          });
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
    if (Array.isArray(data.reports) && data.reports.length > 0) {
      if (!Array.isArray(appState.reports)) appState.reports = [];
      data.reports.forEach(remoteRp => {
        if (!remoteRp || !remoteRp.id) return;
        if (!appState.reports.some(r => r.id === remoteRp.id)) {
          appState.reports.push(remoteRp);
        }
      });
    }
    if (Array.isArray(data.sessions) && data.sessions.length > 0) {
      const roomSessions = data.sessions.filter(s =>
        String(s.roomCode).toUpperCase() === String(appSettings.roomCode).toUpperCase() &&
        s.status !== 'finished' && s.status !== 'cleared' && !clearedSet.has(s.id)
      );
      if (roomSessions.length > 0) {
        appState.activeSession = roomSessions[roomSessions.length - 1];
      }
    }
    if (Array.isArray(data.responses) && appState.activeSession) {
      const activeId = appState.activeSession.id;
      data.responses.filter(r => r && r.sessionId === activeId && !clearedSet.has(r.sessionId)).forEach(remoteResp => {
        const existingIdx = appState.responses.findIndex(localR =>
          String(localR.studentId) === String(remoteResp.studentId) && String(localR.sessionId) === String(activeId)
        );
        if (existingIdx !== -1) {
          const localCnt = Object.keys(appState.responses[existingIdx].answers || {}).length;
          const remoteCnt = Object.keys(remoteResp.answers || {}).length;
          if (remoteCnt >= localCnt) appState.responses[existingIdx] = remoteResp;
        } else {
          appState.responses.push(remoteResp);
        }
      });
    }
    saveAppState(false);
    renderQuizLibrary();
    renderRoomsManagement();
    renderLiveResultsTable();
    renderReportsList();
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
  statusEl.textContent = '⏳ กำลังทดสอบเชื่อมต่อและสร้างตารางฐานข้อมูลใน Google Sheets & Drive...';
  appSettings.gasWebAppUrl = url;
  const res = await callGoogleScript({ action: 'ping' });
  if (res && res.status === 'ok') {
    statusEl.innerHTML = `<span style="color:#16a34a;font-weight:700;">✅ เชื่อมต่อสำเร็จ! Google Sheets และโฟลเดอร์ Google Drive พร้อมใช้งานแล้ว</span>`;
    showToast('เชื่อมต่อ Google Sheets & Drive สำเร็จ!');
    await syncAllToGoogleSheets();
  } else {
    statusEl.innerHTML = `<span style="color:#dc2626;">⚠️ ไม่สามารถเชื่อมต่อข้ามเครื่องได้ กรุณาตรวจสอบใน Apps Script > Deploy > Manage deployments ว่าตั้งค่า <b>Who has access = Anyone (ทุกคน)</b> แล้ว</span>`;
  }
}

async function syncQuizToGoogleSheet(quiz) {
  if (!appSettings.gasWebAppUrl) return null;
  return await callGoogleScript({ action: 'saveQuiz', quiz: quiz });
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
  if (!appSettings.gasWebAppUrl) return;
  // หากหน้า Live Results ถูกล้างแล้วและไม่มี activeSession ในเครื่อง ให้ไม่ดึง session เก่ากลับมา
  if (!appState.activeSession && !notify) return;

  const activeRoom = String(appSettings.roomCode || appState.activeSession?.roomCode || 'THANAT01').toUpperCase().trim();
  const clearedSet = new Set(appState.clearedSessionIds || []);
  const data = await callGoogleScript({ action: 'getAllData' });
  if (data && data.status === 'ok') {
    if (Array.isArray(data.sessions) && data.sessions.length > 0) {
      const roomSessions = data.sessions.filter(s =>
        String(s.roomCode).toUpperCase() === activeRoom &&
        s.status !== 'finished' && s.status !== 'cleared' && !clearedSet.has(s.id)
      );
      if (roomSessions.length > 0) {
        const latestSess = roomSessions[roomSessions.length - 1];
        if (appState.quizzes.some(q => q.id === latestSess.quizId)) {
          appState.activeSession = latestSess;
        }
      }
    }
    if (Array.isArray(data.responses) && appState.activeSession && !clearedSet.has(appState.activeSession.id)) {
      const curSessId = String(appState.activeSession.id);
      data.responses.forEach(remoteResp => {
        if (!remoteResp || clearedSet.has(remoteResp.sessionId)) return;
        if (String(remoteResp.sessionId) !== curSessId) return;
        const rStuId = String(remoteResp.studentId || '');
        const existingIdx = appState.responses.findIndex(localR =>
          String(localR.studentId) === rStuId && String(localR.sessionId) === curSessId
        );
        if (existingIdx !== -1) {
          const localAnsCount = Object.keys(appState.responses[existingIdx].answers || {}).length;
          const remoteAnsCount = Object.keys(remoteResp.answers || {}).length;
          if (remoteAnsCount >= localAnsCount) {
            appState.responses[existingIdx] = remoteResp;
          }
        } else {
          appState.responses.push(remoteResp);
        }
      });
    }
    saveAppState(false);
    syncStudentTeacherPacedIfActive();
    if (notify) showToast('✅ ซิงค์รายชื่อผู้เข้าสอบและผลคะแนนจาก Google Sheets เรียบร้อยแล้ว!');
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

// ================= REPORTS LIST, REPORT DETAIL (IMAGE 3) & EXPORT RESULTS =================
function formatSocrativeReportDate(isoStr) {
  const d = isoStr ? new Date(isoStr) : new Date();
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatPdfShortDate(isoStr) {
  const d = isoStr ? new Date(isoStr) : new Date();
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function getAllReportsList() {
  const list = Array.isArray(appState.reports) ? appState.reports.slice() : [];
  // หากมี activeSession ที่ยังไม่ได้กด Finish แสดงเป็นรายการ Live ชั่วคราวด้านบนด้วย
  const session = appState.activeSession;
  if (session && session.status !== 'cleared' && !list.some(r => r.sessionId === session.id)) {
    const quiz = appState.quizzes.find(q => q.id === session.quizId);
    if (quiz) {
      const resps = getResponsesForSession(session);
      const avg = resps.length > 0 ? Math.round(resps.reduce((s, r) => s + Number(r.percent || 0), 0) / resps.length) : 0;
      list.unshift({
        id: 'LIVE_' + session.id,
        isLiveDraft: true,
        sessionId: session.id,
        roomCode: String(session.roomCode || appSettings.roomCode).toUpperCase(),
        quizId: quiz.id,
        quizTitle: quiz.title,
        quizSubject: quiz.subject || 'ทั่วไป',
        deliveryMethod: session.settings?.deliveryMethod || 'instant_feedback',
        settings: session.settings || {},
        startedAt: session.startedAt,
        finishedAt: new Date().toISOString(),
        passRateThreshold: 80,
        questions: quiz.questions || [],
        responses: resps,
        avgPercent: avg
      });
    }
  }
  return list;
}

function getReportById(reportId) {
  return getAllReportsList().find(r => r.id === reportId) || getAllReportsList()[0] || null;
}

function showReportsListView() {
  currentReportDetailId = null;
  const listView = document.getElementById('reportsListView');
  const detailView = document.getElementById('reportDetailView');
  if (listView) listView.style.display = 'block';
  if (detailView) detailView.style.display = 'none';
  renderReportsList();
}

function renderReportsList() {
  const container = document.getElementById('reportsListContainer');
  if (!container) return;

  // หากกำลังเปิดหน้ารายละเอียด Report อยู่ ให้รีเฟรชรายละเอียดแทน
  if (currentReportDetailId) {
    const detailView = document.getElementById('reportDetailView');
    if (detailView && detailView.style.display !== 'none') {
      openReportDetail(currentReportDetailId);
    }
  }

  const reports = getAllReportsList();
  if (reports.length === 0) {
    container.innerHTML = `
      <div style="padding:48px 24px;text-align:center;color:#64748b;">
        <div style="font-size:2.2rem;margin-bottom:10px;">📊</div>
        <div style="font-weight:700;font-size:1.05rem;color:#1e293b;margin-bottom:4px;">ยังไม่มีรายงานผลสอบ</div>
        <div style="font-size:0.86rem;">เมื่อผู้เข้าสอบส่งคำตอบและผู้ดูแลกด <b>Finish Activity</b> รายงานจะมาแสดงที่นี่อัตโนมัติ</div>
      </div>
    `;
    return;
  }

  container.innerHTML = reports.map(rp => {
    const stuCount = (rp.responses || []).length;
    const qCount = (rp.questions || []).length;
    const dateLabel = formatSocrativeReportDate(rp.finishedAt);
    return `
      <div class="quiz-row" style="cursor:pointer;" onclick="openReportDetail('${escapeHtml(rp.id)}')">
        <div class="quiz-info-main">
          <div class="quiz-doc-icon" style="background:${rp.isLiveDraft ? '#dcfce7' : '#e0f2fe'};color:${rp.isLiveDraft ? '#166534' : '#0369a1'};">📊</div>
          <div>
            <div class="quiz-name">
              ${escapeHtml(rp.quizTitle)}
              ${rp.isLiveDraft
                ? '<span class="soc-code-pill" style="background:#dcfce7;color:#166534;font-size:0.72rem;margin-left:6px;">● LIVE</span>'
                : '<span class="soc-code-pill" style="background:#f1f5f9;color:#475569;font-size:0.72rem;margin-left:6px;">FINISHED</span>'}
            </div>
            <div class="quiz-meta">
              <span>ห้อง: <b>${escapeHtml(rp.roomCode)}</b></span>
              <span>•</span>
              <span>${stuCount} คน</span>
              <span>•</span>
              <span>${qCount} ข้อ</span>
              <span>•</span>
              <span>เฉลี่ย ${rp.avgPercent || 0}%</span>
              <span>•</span>
              <span>${escapeHtml(dateLabel)}</span>
            </div>
          </div>
        </div>
        <div class="quiz-row-actions" onclick="event.stopPropagation()">
          <button class="btn-outline" style="padding:7px 12px;font-size:0.82rem;" onclick="openReportDetail('${escapeHtml(rp.id)}')">
            📄 ดูรายงาน (View Report)
          </button>
          <button class="btn-report-cyan" style="padding:7px 14px;font-size:0.82rem;" onclick="openReportDetail('${escapeHtml(rp.id)}'); openExportResultsModal();">
            ⬇ Export Results
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function openReportDetail(reportId) {
  const report = getReportById(reportId);
  if (!report) return showReportsListView();

  currentReportDetailId = report.id;
  document.getElementById('reportsListView').style.display = 'none';
  document.getElementById('reportDetailView').style.display = 'block';

  document.getElementById('reportDetailTitle').textContent = String(report.quizTitle || 'EXAM REPORT').toUpperCase();
  document.getElementById('reportDetailDate').textContent = formatSocrativeReportDate(report.finishedAt);
  const infoIcon = document.getElementById('reportDetailRoomInfo');
  if (infoIcon) {
    infoIcon.title = `ห้องสอบ: ${report.roomCode} | จำนวนข้อสอบ: ${(report.questions || []).length} ข้อ | รูปแบบ: ${getDeliveryMethodLabel(report.deliveryMethod)}`;
  }

  const resps = report.responses || [];
  const stuCount = resps.length;
  document.getElementById('reportStatStudents').textContent = `${stuCount} ${stuCount === 1 ? 'student' : 'students'}`;
  document.getElementById('reportStatRoomLabel').textContent = `Room: ${report.roomCode}`;

  const avg = stuCount > 0 ? Math.round(resps.reduce((s, r) => s + Number(r.percent || 0), 0) / stuCount) : 0;
  document.getElementById('reportStatAvgScore').textContent = `${avg}%`;

  const threshold = Number(report.passRateThreshold || 80);
  const passedCount = resps.filter(r => Number(r.percent || 0) >= threshold).length;
  const passPct = stuCount > 0 ? Math.round((passedCount / stuCount) * 100) : 0;
  document.getElementById('reportStatPassValue').textContent = stuCount > 0 ? `${passPct}% Passed (${passedCount}/${stuCount})` : 'Pass Rate';
  document.getElementById('reportPassRateLink').textContent = `เกณฑ์ผ่าน ≥ ${threshold}% (Set)`;

  switchReportSubTab('overview');
  renderReportDetailMatrix();
  renderReportMonitoringTable();
}

function switchReportSubTab(tab) {
  document.getElementById('reportSubTab-overview')?.classList.toggle('active', tab === 'overview');
  document.getElementById('reportSubTab-monitoring')?.classList.toggle('active', tab === 'monitoring');
  const ov = document.getElementById('reportOverviewPanel');
  const mn = document.getElementById('reportMonitoringPanel');
  if (ov) ov.style.display = tab === 'overview' ? 'block' : 'none';
  if (mn) mn.style.display = tab === 'monitoring' ? 'block' : 'none';
}

function setReportPassRate() {
  const report = getReportById(currentReportDetailId);
  if (!report) return;
  const val = prompt('กำหนดเกณฑ์คะแนนผ่าน (%) เช่น 70 หรือ 80:', String(report.passRateThreshold || 80));
  if (val === null) return;
  const num = Math.min(100, Math.max(0, Number(val) || 80));
  report.passRateThreshold = num;
  const savedIdx = (appState.reports || []).findIndex(r => r.id === report.id);
  if (savedIdx !== -1) {
    appState.reports[savedIdx].passRateThreshold = num;
    saveAppState(false);
  }
  openReportDetail(report.id);
}

function renderReportDetailMatrix() {
  const report = getReportById(currentReportDetailId);
  if (!report) return;
  const showNames = document.getElementById('reportToggleShowNames')?.checked ?? true;
  const showResponses = document.getElementById('reportToggleShowResponses')?.checked ?? true;
  const showResults = document.getElementById('reportToggleShowResults')?.checked ?? true;

  renderMatrixIntoElements(
    document.getElementById('reportTableHead'),
    document.getElementById('reportTableBody'),
    report.questions || [],
    report.responses || [],
    { showNames, showResponses, showResults, showMonitoringBadge: true }
  );
}

function renderReportMonitoringTable() {
  const wrap = document.getElementById('reportMonitoringTableWrap');
  const report = getReportById(currentReportDetailId);
  if (!wrap || !report) return;
  const resps = report.responses || [];
  if (resps.length === 0) {
    wrap.innerHTML = `<div style="color:#64748b;font-size:0.88rem;">ยังไม่มีข้อมูลผู้เข้าสอบในรอบนี้</div>`;
    return;
  }
  wrap.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
      <thead>
        <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;text-align:left;">
          <th style="padding:10px;">ผู้เข้าสอบ (Student Name)</th>
          <th style="padding:10px;">คะแนน</th>
          <th style="padding:10px;">จำนวนครั้งที่สลับหน้าจอ</th>
          <th style="padding:10px;">รายละเอียดเหตุการณ์</th>
        </tr>
      </thead>
      <tbody>
        ${resps.map(r => {
          const sw = Number(r.tabSwitches || 0);
          const logs = Array.isArray(r.monitoringLog) && r.monitoringLog.length > 0 ? r.monitoringLog.join(', ') : 'ปกติ (ไม่พบการสลับหน้าจอ)';
          return `
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:10px;font-weight:600;">${escapeHtml(r.studentName)}</td>
              <td style="padding:10px;">${r.percent || 0}% (${r.score || 0}/${(report.questions || []).length})</td>
              <td style="padding:10px;">
                <span class="soc-code-pill" style="background:${sw > 0 ? '#fee2e2' : '#dcfce7'};color:${sw > 0 ? '#b91c1c' : '#166534'};">
                  ${sw} ครั้ง
                </span>
              </td>
              <td style="padding:10px;color:#475569;font-size:0.82rem;">${escapeHtml(logs)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// ================= EXPORT RESULTS MODAL (IMAGE 3 POPUP) =================
function openExportResultsModal() {
  const report = getReportById(currentReportDetailId);
  if (!report) return showToast('ไม่พบข้อมูลรายงานที่จะส่งออก');

  // เติมรายชื่อผู้เข้าสอบในแท็บ Individual Student PDFs
  const listEl = document.getElementById('exportPdfStudentList');
  if (listEl) {
    const resps = report.responses || [];
    if (resps.length === 0) {
      listEl.innerHTML = `<div style="padding:10px;color:#64748b;text-align:center;font-size:0.84rem;">ยังไม่มีผู้เข้าสอบในรายงานนี้</div>`;
    } else {
      listEl.innerHTML = resps.map((r, idx) => `
        <label class="export-student-check-row" style="cursor:pointer;">
          <span style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" class="export-student-chk" value="${idx}" checked />
            <span style="font-weight:600;color:#1e293b;">${escapeHtml(r.studentName)}</span>
          </span>
          <span style="font-size:0.8rem;font-weight:700;color:#0284c7;">${r.percent || 0}% (${r.score || 0}/${(report.questions || []).length})</span>
        </label>
      `).join('');
    }
    const selAll = document.getElementById('exportPdfSelectAll');
    if (selAll) selAll.checked = true;
  }

  switchExportTab('excel');
  openModal('exportResultsModal');
}

function toggleSelectAllExportStudents(checked) {
  document.querySelectorAll('.export-student-chk').forEach(chk => {
    chk.checked = checked;
  });
}

function switchExportTab(tabKey) {
  activeExportTab = tabKey;
  ['excel', 'individual-pdf', 'summary-pdf', 'answer-key'].forEach(k => {
    document.getElementById('exportNav-' + k)?.classList.toggle('active', k === tabKey);
    const panel = document.getElementById('exportPanel-' + k);
    if (panel) panel.style.display = k === tabKey ? 'flex' : 'none';
  });
}

function getOptionFullText(question, rawAnswer) {
  if (!question || rawAnswer === undefined || rawAnswer === null || rawAnswer === '') return '-';
  const ansStr = String(rawAnswer).trim();
  if (question.type === 'MC' && Array.isArray(question.options)) {
    const letters = ['A', 'B', 'C', 'D', 'E'];
    const letter = ansStr.toUpperCase().charAt(0);
    const idx = letters.indexOf(letter);
    if (idx !== -1 && question.options[idx]) {
      return String(question.options[idx]);
    }
  }
  return ansStr;
}

/**
 * สร้าง Workbook Excel ที่เก็บหัวข้อคำถามครบทุกตัวอักษร + เฉลย + ผลสอบรายข้อทุกคน + ชีตสรุปคำถาม
 */
function buildCompleteResultsExcelWorkbook(report, includeMcContent = true) {
  const questions = report.questions || [];
  const responses = report.responses || [];
  const totalQ = questions.length;
  const avgPct = responses.length > 0
    ? Math.round(responses.reduce((s, r) => s + Number(r.percent || 0), 0) / responses.length)
    : 0;

  // Sheet 1: Results (หัวข้อข้อสอบครบทุกตัวอักษรในหัวคอลัมน์)
  const aoa = [];
  aoa.push([report.quizTitle || 'Hana Exam Online Report']);
  aoa.push([
    `Room: ${report.roomCode || '-'}`,
    `Date: ${formatSocrativeReportDate(report.finishedAt)}`,
    `Students: ${responses.length}`,
    `Class Average: ${avgPct}%`
  ]);
  aoa.push([]);

  // Row 4: Full untruncated headers
  const headerRow = [
    'ลำดับ (No.)',
    'ชื่อ-นามสกุล (Student Name)',
    'ห้องสอบ (Room)',
    'คะแนนที่ได้ (Score)',
    'คิดเป็น % (Score %)',
    'จำนวนข้อที่ถูก (Correct)',
    ...questions.map((q, idx) => `${idx + 1}. ${String(q.text || '')}`)
  ];
  aoa.push(headerRow);

  // Row 5: Correct Answer Key row
  const keyRow = [
    '',
    'เฉลยที่ถูกต้อง (Correct Answer)',
    '',
    `${totalQ}/${totalQ}`,
    '100%',
    totalQ,
    ...questions.map(q => includeMcContent ? getOptionFullText(q, q.correctAnswer) : String(q.correctAnswer || ''))
  ];
  aoa.push(keyRow);

  // Student Rows
  responses.forEach((r, idx) => {
    const stuRow = [
      idx + 1,
      r.studentName || '-',
      r.roomCode || report.roomCode || '-',
      `${r.score || 0}/${totalQ}`,
      `${r.percent || 0}%`,
      Number(r.score || 0),
      ...questions.map((q, qIdx) => {
        const ans = r.answers?.[qIdx];
        if (!ans || ans.value === undefined || ans.value === '') return '-';
        const displayVal = includeMcContent ? getOptionFullText(q, ans.value) : String(ans.value);
        return `${ans.isCorrect ? '✓' : '✕'} ${displayVal}`;
      })
    ];
    aoa.push(stuRow);
  });

  // Class Total Row
  const totalRow = [
    '',
    'Class Total',
    `${responses.length} students`,
    responses.length > 0 ? `${(responses.reduce((s, r) => s + Number(r.score || 0), 0) / responses.length).toFixed(1)}/${totalQ}` : `0/${totalQ}`,
    `${avgPct}%`,
    '',
    ...questions.map((q, qIdx) => {
      if (responses.length === 0) return '0%';
      const cCount = responses.filter(r => r.answers?.[qIdx]?.isCorrect).length;
      return `${Math.round((cCount / responses.length) * 100)}%`;
    })
  ];
  aoa.push(totalRow);

  const wsResults = XLSX.utils.aoa_to_sheet(aoa);
  wsResults['!cols'] = [
    { wch: 10 },
    { wch: 28 },
    { wch: 15 },
    { wch: 15 },
    { wch: 14 },
    { wch: 16 },
    ...questions.map(q => ({ wch: Math.min(60, Math.max(24, String(q.text || '').length * 0.7)) }))
  ];

  // Sheet 2: Question_Summary (รายละเอียดหัวข้อข้อสอบครบทุกตัวอักษรแบบอ่านง่ายในแนวตั้ง)
  const qRows = questions.map((q, idx) => {
    const correctCnt = responses.filter(r => r.answers?.[idx]?.isCorrect).length;
    const wrongCnt = responses.filter(r => r.answers?.[idx] && !r.answers[idx].isCorrect).length;
    const pct = responses.length > 0 ? Math.round((correctCnt / responses.length) * 100) : 0;
    return {
      'ข้อที่': idx + 1,
      'ประเภท (Type)': q.type || 'TF',
      'หัวข้อคำถาม (Full Question Text)': String(q.text || ''),
      'ตัวเลือกทั้งหมด (Options)': Array.isArray(q.options) ? q.options.join(' | ') : '',
      'เฉลยที่ถูกต้อง (Correct Answer)': getOptionFullText(q, q.correctAnswer),
      'ตอบถูก (คน)': correctCnt,
      'ตอบผิด (คน)': wrongCnt,
      'อัตราตอบถูก (%)': `${pct}%`,
      'รูปภาพประกอบ (Image URL)': q.imageUrl && !String(q.imageUrl).startsWith('data:') ? q.imageUrl : (q.imageUrl ? 'Embedded Image' : '')
    };
  });
  const wsSummary = XLSX.utils.json_to_sheet(qRows);
  wsSummary['!cols'] = [
    { wch: 8 },
    { wch: 12 },
    { wch: 68 },
    { wch: 36 },
    { wch: 24 },
    { wch: 12 },
    { wch: 12 },
    { wch: 15 },
    { wch: 36 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsResults, 'Results');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Question_Summary');
  return wb;
}

// ================= INDIVIDUAL STUDENT PDF GENERATOR (EXACT SOCRATIVE LAYOUT MATCH) =================
async function resolveImageToCorsSafeDataUrl(url) {
  if (!url) return '';
  const str = String(url).trim();
  if (str.startsWith('data:image/')) return str;
  if (localImageDataUrlCache[str]) return localImageDataUrlCache[str];

  const fileId = extractDriveFileId(str);
  if (fileId && localImageDataUrlCache[fileId]) return localImageDataUrlCache[fileId];

  // ดึงผ่าน Apps Script getImageBase64 เพื่อไม่ติดปัญหา CORS ของ canvas
  if (fileId && appSettings.gasWebAppUrl) {
    try {
      const res = await callGoogleScript({ action: 'getImageBase64', file_id: fileId });
      if (res && res.status === 'ok' && res.dataUrl) {
        localImageDataUrlCache[str] = res.dataUrl;
        localImageDataUrlCache[fileId] = res.dataUrl;
        return res.dataUrl;
      }
    } catch (e) {}
  }

  // Fallback: fetch with CORS -> FileReader
  try {
    const fetchUrl = getDisplayImageUrl(str);
    const resp = await fetch(fetchUrl, { mode: 'cors' });
    if (resp.ok) {
      const blob = await resp.blob();
      const dataUrl = await new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => resolve('');
        fr.readAsDataURL(blob);
      });
      if (dataUrl) {
        localImageDataUrlCache[str] = dataUrl;
        return dataUrl;
      }
    }
  } catch (e) {}

  return getDisplayImageUrl(str);
}

async function resolveAllQuestionImagesForPdf(questions, includeImages = true) {
  const map = {};
  if (!includeImages) return map;
  for (let i = 0; i < questions.length; i++) {
    if (questions[i]?.imageUrl) {
      map[i] = await resolveImageToCorsSafeDataUrl(questions[i].imageUrl);
    }
  }
  return map;
}

function buildSocrativeStylePdfHeaderHtml(titleText, rightTopLines, scoreDisplayText) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px;">
      <!-- Top Left Brand Logo (Hana Exam Online) -->
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:42px;height:42px;border-radius:10px;background:linear-gradient(135deg,#1e3a8a 0%,#0284c7 60%,#06b6d4 100%);display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
            <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
          </svg>
        </div>
        <div>
          <div style="font-size:23px;font-weight:800;color:#1e3a8a;line-height:1.05;letter-spacing:-0.4px;">Hana Exam Online</div>
          <div style="font-size:10px;font-weight:700;color:#64748b;letter-spacing:1.1px;margin-top:2px;">SMART ASSESSMENT SYSTEM</div>
        </div>
      </div>

      <!-- Top Right Student Name / Room / Date -->
      <div style="text-align:right;font-size:13px;line-height:1.5;color:#111827;font-weight:500;">
        ${rightTopLines.map(line => `<div>${escapeHtml(line)}</div>`).join('')}
      </div>
    </div>

    <!-- Quiz Title + Score Row -->
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding-bottom:14px;border-bottom:1.5px solid #e5e7eb;margin-bottom:22px;">
      <div style="font-size:22px;font-weight:700;color:#000000;line-height:1.25;">
        ${escapeHtml(titleText)}
      </div>
      <div style="font-size:22px;font-weight:400;color:#111827;white-space:nowrap;">
        ${escapeHtml(scoreDisplayText)}
      </div>
    </div>
  `;
}

function buildSingleQuestionPdfBlockHtml(q, qIdx, studentAnsObj, imgSrc, options = {}) {
  const { showCorrect = true, isAnswerKeyMode = false } = options;
  const pts = Number(q.points || 1);
  const isCorrect = isAnswerKeyMode ? true : Boolean(studentAnsObj?.isCorrect);
  const studentVal = studentAnsObj?.value !== undefined ? String(studentAnsObj.value) : '';

  const statusIconHtml = isCorrect
    ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#43b581" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
    : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

  const earnedPts = isCorrect ? pts : 0;
  const pointText = isAnswerKeyMode ? `${pts} POINT` : `${earnedPts}/${pts} POINT`;

  let choicesHtml = '';
  if (q.type === 'TF') {
    const tfOpts = [
      { letter: 'T', value: 'True', label: 'True' },
      { letter: 'F', value: 'False', label: 'False' }
    ];
    choicesHtml = tfOpts.map(opt => {
      const isExpected = String(q.correctAnswer || '').toLowerCase() === opt.value.toLowerCase();
      const isSelected = isAnswerKeyMode ? isExpected : (studentVal.toLowerCase() === opt.value.toLowerCase());
      let bg = '#e5e7eb';
      let fg = '#1f2937';
      let extraTag = '';
      if (isSelected && isExpected) {
        bg = '#4db668';
        fg = '#ffffff';
      } else if (isSelected && !isExpected) {
        bg = '#ef4444';
        fg = '#ffffff';
      } else if (!isSelected && isExpected && showCorrect && !isAnswerKeyMode) {
        bg = '#dcfce7';
        fg = '#166534';
        extraTag = ' <span style="font-size:11px;color:#16a34a;font-weight:700;">(เฉลยที่ถูกต้อง)</span>';
      }
      return `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:7px;">
          <span style="width:22px;height:22px;border-radius:50%;background:${bg};color:${fg};display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${opt.letter}</span>
          <span style="font-size:13.5px;color:#111827;">${opt.label}${extraTag}</span>
        </div>
      `;
    }).join('');
  } else if (q.type === 'MC') {
    const letters = ['A', 'B', 'C', 'D', 'E'];
    choicesHtml = (q.options || []).map((optText, oIdx) => {
      const letter = letters[oIdx] || String.fromCharCode(65 + oIdx);
      const cleanLabel = String(optText).replace(/^[A-E][\.\)\s]+/i, '');
      const isExpected = String(q.correctAnswer || '').toUpperCase().charAt(0) === letter;
      const isSelected = isAnswerKeyMode ? isExpected : (studentVal.toUpperCase().charAt(0) === letter);
      let bg = '#e5e7eb';
      let fg = '#1f2937';
      let extraTag = '';
      if (isSelected && isExpected) {
        bg = '#4db668';
        fg = '#ffffff';
      } else if (isSelected && !isExpected) {
        bg = '#ef4444';
        fg = '#ffffff';
      } else if (!isSelected && isExpected && showCorrect && !isAnswerKeyMode) {
        bg = '#dcfce7';
        fg = '#166534';
        extraTag = ' <span style="font-size:11px;color:#16a34a;font-weight:700;">(เฉลยที่ถูกต้อง)</span>';
      }
      return `
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:7px;">
          <span style="width:22px;height:22px;border-radius:50%;background:${bg};color:${fg};display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;margin-top:1px;">${letter}</span>
          <span style="font-size:13.5px;color:#111827;line-height:1.45;">${escapeHtml(cleanLabel)}${extraTag}</span>
        </div>
      `;
    }).join('');
  } else {
    // Short Answer
    const ansBg = isCorrect ? '#dcfce7' : '#fee2e2';
    const ansColor = isCorrect ? '#166534' : '#991b1b';
    choicesHtml = `
      <div style="margin-top:4px;font-size:13px;">
        <div style="display:inline-block;padding:5px 12px;border-radius:6px;background:${ansBg};color:${ansColor};font-weight:600;">
          คำตอบ: ${escapeHtml(isAnswerKeyMode ? (q.correctAnswer || '-') : (studentVal || '(ไม่ได้ตอบ)'))}
        </div>
        ${(!isAnswerKeyMode && !isCorrect && showCorrect && q.correctAnswer)
          ? `<div style="margin-top:4px;font-size:12px;color:#16a34a;font-weight:600;">เฉลยที่ถูกต้อง: ${escapeHtml(q.correctAnswer)}</div>`
          : ''}
      </div>
    `;
  }

  const rightImgCol = imgSrc ? `
    <div style="width:205px;flex-shrink:0;display:flex;justify-content:flex-end;align-items:flex-start;">
      <img src="${escapeHtml(imgSrc)}" crossorigin="anonymous"
        style="max-width:205px;max-height:155px;object-fit:contain;border-radius:4px;" />
    </div>
  ` : '';

  return `
    <div class="pdf-q-block" style="display:flex;align-items:flex-start;gap:14px;padding:12px 0 18px;font-family:'Sarabun','Prompt','Inter',sans-serif;">
      <!-- Check / X indicator -->
      <div style="width:26px;flex-shrink:0;padding-top:2px;">
        ${statusIconHtml}
      </div>

      <!-- Question text + choices -->
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:flex-start;gap:8px;font-size:14.5px;color:#000000;line-height:1.5;margin-bottom:5px;">
          <span style="font-weight:700;flex-shrink:0;">${qIdx + 1}.</span>
          <span style="white-space:pre-line;">${escapeHtml(q.text || '')}</span>
        </div>
        <div style="padding-left:22px;">
          <div style="font-size:10.5px;font-weight:700;color:#374151;letter-spacing:0.4px;margin-bottom:10px;">
            ${pointText}
          </div>
          <div>
            ${choicesHtml}
          </div>
        </div>
      </div>

      <!-- Optional Right-Aligned Question Image -->
      ${rightImgCol}
    </div>
  `;
}

/**
 * แบ่งหน้าอัตโนมัติขนาด A4 (794 x 1123 px) ไม่ให้ข้อสอบข้อใดถูกตัดครึ่งหน้า แล้วเรนเดอร์เป็น PDF
 */
async function renderPaginatedHtmlBlocksToPdfBlob(headerHtml, blockHtmlList) {
  const stage = document.getElementById('pdfRenderStage');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const PAGE_W = 794;
  const PAGE_H = 1123;
  const PAD_X = 48;
  const PAD_Y = 44;
  const MAX_CONTENT_H = PAGE_H - PAD_Y * 2;

  const createPageContainer = (isFirstPage) => {
    const page = document.createElement('div');
    page.style.width = PAGE_W + 'px';
    page.style.minHeight = PAGE_H + 'px';
    page.style.height = PAGE_H + 'px';
    page.style.padding = `${PAD_Y}px ${PAD_X}px`;
    page.style.background = '#ffffff';
    page.style.boxSizing = 'border-box';
    page.style.fontFamily = "'Sarabun', 'Prompt', 'Inter', sans-serif";
    page.style.color = '#111827';
    page.style.overflow = 'hidden';
    if (isFirstPage && headerHtml) {
      const hdr = document.createElement('div');
      hdr.innerHTML = headerHtml;
      page.appendChild(hdr);
    }
    return page;
  };

  // สร้างหน้าและจัดเรียงแต่ละบล็อกลงหน้าอย่างแม่นยำตามความสูงจริงหลังรูปโหลด
  stage.innerHTML = '';
  const pages = [];
  let currentPage = createPageContainer(true);
  stage.appendChild(currentPage);
  pages.push(currentPage);

  // รอรูปทั้งหมดโหลดก่อนวัดความสูง
  const waitImages = async (el) => {
    const imgs = Array.from(el.querySelectorAll('img'));
    await Promise.all(imgs.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(res => {
        img.onload = res;
        img.onerror = res;
        setTimeout(res, 3500);
      });
    }));
  };

  for (let i = 0; i < blockHtmlList.length; i++) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = blockHtmlList[i];
    currentPage.appendChild(wrapper);
    await waitImages(wrapper);

    // ตรวจสอบว่าเกินความสูงพื้นที่หน้า A4 หรือไม่ (ถ้ายาวเกินและไม่ใช่บล็อกแรกของหน้า ให้ขึ้นหน้าใหม่!)
    const usedHeight = Array.from(currentPage.children).reduce((sum, ch) => sum + ch.getBoundingClientRect().height, 0);
    if (usedHeight > MAX_CONTENT_H && currentPage.children.length > 1) {
      currentPage.removeChild(wrapper);
      currentPage = createPageContainer(false);
      stage.appendChild(currentPage);
      pages.push(currentPage);
      currentPage.appendChild(wrapper);
    }
  }

  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    const canvas = await html2canvas(pages[pIdx], {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: PAGE_W,
      height: PAGE_H
    });
    const imgData = canvas.toDataURL('image/jpeg', 0.94);
    if (pIdx > 0) pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
  }

  stage.innerHTML = '';
  return pdf.output('blob');
}

async function generateIndividualStudentPdfBlob(report, studentResp, resolvedImgMap, options = {}) {
  const questions = report.questions || [];
  const totalQ = questions.length;
  const score = Number(studentResp.score || 0);
  const pct = Number(studentResp.percent || 0);

  const headerHtml = buildSocrativeStylePdfHeaderHtml(
    report.quizTitle || 'Exam Report',
    [
      studentResp.studentName || 'Examinee',
      report.roomCode || 'THANAT01',
      formatPdfShortDate(report.finishedAt)
    ],
    `${pct}% (${score}/${totalQ})`
  );

  const blocks = questions.map((q, idx) =>
    buildSingleQuestionPdfBlockHtml(q, idx, studentResp.answers?.[idx], resolvedImgMap[idx] || '', {
      showCorrect: options.showCorrect ?? true,
      isAnswerKeyMode: false
    })
  );

  return await renderPaginatedHtmlBlocksToPdfBlob(headerHtml, blocks);
}

async function generateResultsSummaryPdfBlob(report, showNames = true) {
  const questions = report.questions || [];
  const responses = report.responses || [];
  const totalQ = questions.length;
  const avg = responses.length > 0
    ? Math.round(responses.reduce((s, r) => s + Number(r.percent || 0), 0) / responses.length)
    : 0;

  const headerHtml = buildSocrativeStylePdfHeaderHtml(
    `${report.quizTitle} — Results Summary`,
    [
      `Room: ${report.roomCode}`,
      `${responses.length} Students`,
      formatPdfShortDate(report.finishedAt)
    ],
    `Avg: ${avg}%`
  );

  const blocks = [];
  blocks.push(`
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
      <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:#1e3a8a;">${responses.length}</div>
        <div style="font-size:12px;color:#64748b;">Total Examinees</div>
      </div>
      <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:#16a34a;">${avg}%</div>
        <div style="font-size:12px;color:#64748b;">Class Average</div>
      </div>
      <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:#0284c7;">${totalQ} ข้อ</div>
        <div style="font-size:12px;color:#64748b;">Total Questions</div>
      </div>
    </div>
  `);

  responses.forEach((r, idx) => {
    const nm = showNames ? r.studentName : `Examinee #${idx + 1}`;
    const passThreshold = Number(report.passRateThreshold || 80);
    const passed = Number(r.percent || 0) >= passThreshold;
    blocks.push(`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13.5px;">
        <div style="font-weight:600;color:#111827;">${idx + 1}. ${escapeHtml(nm)}</div>
        <div style="display:flex;align-items:center;gap:14px;">
          <span>${r.score || 0}/${totalQ} ข้อ</span>
          <span style="font-weight:700;color:${passed ? '#16a34a' : '#dc2626'};min-width:48px;text-align:right;">${r.percent || 0}%</span>
        </div>
      </div>
    `);
  });

  return await renderPaginatedHtmlBlocksToPdfBlob(headerHtml, blocks);
}

async function generateAnswerKeyPdfBlob(report, includeImages = true) {
  const questions = report.questions || [];
  const resolvedImgMap = await resolveAllQuestionImagesForPdf(questions, includeImages);

  const headerHtml = buildSocrativeStylePdfHeaderHtml(
    `${report.quizTitle} — Answer Key`,
    [
      'ANSWER KEY (เฉลยข้อสอบ)',
      report.roomCode || 'THANAT01',
      formatPdfShortDate(report.finishedAt)
    ],
    `${questions.length} Questions`
  );

  const blocks = questions.map((q, idx) =>
    buildSingleQuestionPdfBlockHtml(q, idx, null, resolvedImgMap[idx] || '', {
      showCorrect: true,
      isAnswerKeyMode: true
    })
  );

  return await renderPaginatedHtmlBlocksToPdfBlob(headerHtml, blocks);
}

function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function sanitizeFileName(str) {
  return String(str || 'Report').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').substring(0, 80);
}

async function handleExportDownload(tabKey) {
  const report = getReportById(currentReportDetailId);
  if (!report) return showToast('ไม่พบข้อมูลรายงาน');

  const safeTitle = sanitizeFileName(report.quizTitle);
  const progEl = document.getElementById('exportPdfProgressMsg');

  try {
    if (tabKey === 'excel') {
      const includeMC = document.getElementById('exportExcelIncludeMCContent')?.checked ?? true;
      const wb = buildCompleteResultsExcelWorkbook(report, includeMC);
      XLSX.writeFile(wb, `${safeTitle}_Complete_Results.xlsx`);
      // ล้างข้อมูลหน้า Live Results อัตโนมัติหลังดาวน์โหลดสำเร็จตามรูปที่ 4
      clearLiveResultsAfterExport(report.sessionId);
      showToast('✅ ดาวน์โหลด Excel (หัวข้อข้อสอบครบทุกตัวอักษร) และล้างข้อมูลหน้า Live Results เรียบร้อยแล้ว!');
      return;
    }

    if (tabKey === 'individual-pdf') {
      const selectedIndices = Array.from(document.querySelectorAll('.export-student-chk:checked')).map(c => Number(c.value));
      if (selectedIndices.length === 0) {
        return showToast('กรุณาเลือกผู้เข้าสอบอย่างน้อย 1 คน');
      }
      const includeImages = document.getElementById('exportPdfIncludeImages')?.checked ?? true;
      const showCorrect = document.getElementById('exportPdfShowCorrect')?.checked ?? true;
      const dlBtn = document.getElementById('btnExportIndividualPdfDownload');
      if (dlBtn) dlBtn.disabled = true;
      if (progEl) {
        progEl.style.display = 'block';
        progEl.textContent = '⏳ กำลังเตรียมรูปภาพและสร้างไฟล์ PDF รายบุคคล...';
      }

      const resolvedImgMap = await resolveAllQuestionImagesForPdf(report.questions || [], includeImages);

      if (selectedIndices.length === 1) {
        const stu = report.responses[selectedIndices[0]];
        if (progEl) progEl.textContent = `⏳ กำลังสร้าง PDF ของ ${stu.studentName}...`;
        const pdfBlob = await generateIndividualStudentPdfBlob(report, stu, resolvedImgMap, { showCorrect });
        const fileName = `${sanitizeFileName(stu.studentName)}_${safeTitle}.pdf`;
        triggerBlobDownload(pdfBlob, fileName);
      } else {
        const zip = new JSZip();
        for (let i = 0; i < selectedIndices.length; i++) {
          const stu = report.responses[selectedIndices[i]];
          if (progEl) progEl.textContent = `⏳ กำลังสร้าง PDF คนที่ ${i + 1}/${selectedIndices.length}: ${stu.studentName}...`;
          const pdfBlob = await generateIndividualStudentPdfBlob(report, stu, resolvedImgMap, { showCorrect });
          zip.file(`${sanitizeFileName(stu.studentName)}_${safeTitle}.pdf`, pdfBlob);
        }
        if (progEl) progEl.textContent = '📦 กำลังรวมไฟล์ PDF รายบุคคลเป็น ZIP...';
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        triggerBlobDownload(zipBlob, `${safeTitle}_Individual_Student_PDFs.zip`);
      }

      if (dlBtn) dlBtn.disabled = false;
      if (progEl) progEl.style.display = 'none';

      // ล้างข้อมูลหน้า Live Results อัตโนมัติหลังดาวน์โหลดสำเร็จตามรูปที่ 4
      clearLiveResultsAfterExport(report.sessionId);
      showToast('✅ ส่งออก PDF รายบุคคล และล้างข้อมูลหน้า Live Results เรียบร้อยแล้ว!');
      return;
    }

    if (tabKey === 'summary-pdf') {
      showToast('⏳ กำลังสร้าง Results Summary PDF...');
      const showNames = document.getElementById('exportSummaryShowNames')?.checked ?? true;
      const pdfBlob = await generateResultsSummaryPdfBlob(report, showNames);
      triggerBlobDownload(pdfBlob, `${safeTitle}_Results_Summary.pdf`);
      clearLiveResultsAfterExport(report.sessionId);
      showToast('✅ ดาวน์โหลด Results Summary PDF และล้างข้อมูลหน้า Live Results เรียบร้อยแล้ว!');
      return;
    }

    if (tabKey === 'answer-key') {
      showToast('⏳ กำลังสร้าง Answer Key PDF...');
      const includeImages = document.getElementById('exportAnswerKeyIncludeImages')?.checked ?? true;
      const pdfBlob = await generateAnswerKeyPdfBlob(report, includeImages);
      triggerBlobDownload(pdfBlob, `${safeTitle}_Answer_Key.pdf`);
      showToast('✅ ดาวน์โหลด Answer Key PDF เรียบร้อยแล้ว!');
    }
  } catch (err) {
    console.error('Export error:', err);
    const dlBtn = document.getElementById('btnExportIndividualPdfDownload');
    if (dlBtn) dlBtn.disabled = false;
    if (progEl) progEl.style.display = 'none';
    showToast('เกิดข้อผิดพลาดระหว่างสร้างไฟล์: ' + err.message);
  }
}

async function handleExportSaveToDrive(tabKey) {
  const report = getReportById(currentReportDetailId);
  if (!report) return showToast('ไม่พบข้อมูลรายงาน');
  if (!appSettings.gasWebAppUrl) {
    return showToast('กรุณาเชื่อมต่อ Google Apps Script Web App URL ในหน้าตั้งค่าก่อน');
  }

  const safeTitle = sanitizeFileName(report.quizTitle);
  showToast('☁️ กำลังสร้างไฟล์และบันทึกลง Google Drive โฟลเดอร์ของข้อสอบ...');

  try {
    let base64Data = '';
    let fileName = '';
    let mimeType = '';

    if (tabKey === 'excel') {
      const includeMC = document.getElementById('exportExcelIncludeMCContent')?.checked ?? true;
      const wb = buildCompleteResultsExcelWorkbook(report, includeMC);
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
      base64Data = wbout;
      fileName = `${safeTitle}_Complete_Results.xlsx`;
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (tabKey === 'individual-pdf') {
      const selectedIndices = Array.from(document.querySelectorAll('.export-student-chk:checked')).map(c => Number(c.value));
      if (selectedIndices.length === 0) return showToast('กรุณาเลือกผู้เข้าสอบอย่างน้อย 1 คน');
      const includeImages = document.getElementById('exportPdfIncludeImages')?.checked ?? true;
      const showCorrect = document.getElementById('exportPdfShowCorrect')?.checked ?? true;
      const resolvedImgMap = await resolveAllQuestionImagesForPdf(report.questions || [], includeImages);

      if (selectedIndices.length === 1) {
        const stu = report.responses[selectedIndices[0]];
        const pdfBlob = await generateIndividualStudentPdfBlob(report, stu, resolvedImgMap, { showCorrect });
        base64Data = await blobToBase64(pdfBlob);
        fileName = `${sanitizeFileName(stu.studentName)}_${safeTitle}.pdf`;
        mimeType = 'application/pdf';
      } else {
        const zip = new JSZip();
        for (const idx of selectedIndices) {
          const stu = report.responses[idx];
          const pdfBlob = await generateIndividualStudentPdfBlob(report, stu, resolvedImgMap, { showCorrect });
          zip.file(`${sanitizeFileName(stu.studentName)}_${safeTitle}.pdf`, pdfBlob);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        base64Data = await blobToBase64(zipBlob);
        fileName = `${safeTitle}_Individual_Student_PDFs.zip`;
        mimeType = 'application/zip';
      }
    } else if (tabKey === 'summary-pdf') {
      const showNames = document.getElementById('exportSummaryShowNames')?.checked ?? true;
      const pdfBlob = await generateResultsSummaryPdfBlob(report, showNames);
      base64Data = await blobToBase64(pdfBlob);
      fileName = `${safeTitle}_Results_Summary.pdf`;
      mimeType = 'application/pdf';
    } else {
      const includeImages = document.getElementById('exportAnswerKeyIncludeImages')?.checked ?? true;
      const pdfBlob = await generateAnswerKeyPdfBlob(report, includeImages);
      base64Data = await blobToBase64(pdfBlob);
      fileName = `${safeTitle}_Answer_Key.pdf`;
      mimeType = 'application/pdf';
    }

    const res = await callGoogleScript({
      action: 'saveReportToDrive',
      quizTitle: report.quizTitle,
      fileName: fileName,
      mimeType: mimeType,
      base64Data: base64Data,
      rootFolderId: DRIVE_IMAGES_ROOT_FOLDER_ID
    });

    if (res && res.status === 'ok') {
      clearLiveResultsAfterExport(report.sessionId);
      showToast(`☁️ บันทึกไฟล์ "${res.fileName}" ลงโฟลเดอร์ Google Drive และล้างหน้า Live Results เรียบร้อยแล้ว!`);
    } else {
      showToast('⚠️ กรุณาอัปเดตและ Deploy โค้ด Code.gs ใน Apps Script เพื่อเปิดใช้งาน Save to Drive (สามารถกดปุ่ม Download ลงเครื่องได้ทันที)');
    }
  } catch (err) {
    console.error(err);
    showToast('เกิดข้อผิดพลาดในการบันทึกไป Google Drive: ' + err.message);
  }
}

function handleExportEmail(tabKey) {
  const report = getReportById(currentReportDetailId);
  if (!report) return;
  const resps = report.responses || [];
  const totalQ = (report.questions || []).length;
  const lines = [
    `รายงานผลสอบ: ${report.quizTitle}`,
    `ห้องสอบ: ${report.roomCode}`,
    `วันที่: ${formatSocrativeReportDate(report.finishedAt)}`,
    `จำนวนผู้เข้าสอบ: ${resps.length} คน | คะแนนเฉลี่ย: ${report.avgPercent || 0}%`,
    '',
    'รายชื่อผู้เข้าสอบและคะแนน:',
    ...resps.map((r, i) => `${i + 1}. ${r.studentName} — ${r.percent || 0}% (${r.score || 0}/${totalQ})`)
  ];
  const subject = encodeURIComponent(`[Hana Exam Report] ${report.quizTitle}`);
  const body = encodeURIComponent(lines.join('\n'));
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
  showToast('✉ เปิดหน้าต่างอีเมลพร้อมสรุปผลคะแนนเรียบร้อยแล้ว');
}

function emailResultsToStudents() {
  handleExportEmail('summary');
}

// คงฟังก์ชันเก่าไว้เพื่อ backward compatibility
function exportCurrentReportToExcel() {
  const rp = getReportById(currentReportDetailId);
  if (rp) {
    currentReportDetailId = rp.id;
    handleExportDownload('excel');
  }
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
  }, 3600);
}

function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
