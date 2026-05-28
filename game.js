// ============================================
// 네이버 로그인
// ============================================
const NAVER_CLIENT_ID = 'F4KAOrNX_NAYeUvnbEgI';
const NAVER_CALLBACK_URL = window.location.origin + window.location.pathname;

let naverLogin = null;
let currentUser = null;

function initNaverLogin() {
    if (typeof naver === 'undefined') {
        console.warn('네이버 SDK 로드 실패');
        return;
    }
    naverLogin = new naver.LoginWithNaverId({
        clientId: NAVER_CLIENT_ID,
        callbackUrl: NAVER_CALLBACK_URL,
        callbackHandle: true,
        isPopup: false,
        loginButton: { color: "green", type: 3, height: 50 }
    });
    naverLogin.init();
    
    naverLogin.getLoginStatus(function(status) {
        if (status) {
            const profile = naverLogin.user;
            currentUser = {
                id: 'naver_' + profile.getId(),
                name: profile.getName() || profile.getEmail() || '네이버회원',
                email: profile.getEmail() || '',
                type: 'naver'
            };
            localStorage.setItem('pangpang-user', JSON.stringify(currentUser));
            console.log('✅ 네이버 로그인 성공:', currentUser);
            afterLogin();
        }
    });
}

function loginWithNaver() {
    if (!naverLogin) {
        alert('네이버 로그인 준비 중이에요. 잠시 후 다시 시도해주세요.');
        return;
    }
    const naverBtn = document.querySelector('#naverIdLogin a');
    if (naverBtn) {
        naverBtn.click();
    } else {
        const state = Math.random().toString(36).slice(2);
        const url = `https://nid.naver.com/oauth2.0/authorize?response_type=token&client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(NAVER_CALLBACK_URL)}&state=${state}`;
        window.location.href = url;
    }
}

function loginAsGuest() {
    let guestId = localStorage.getItem('pangpang-guest-id');
    if (!guestId) {
        guestId = 'guest_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        localStorage.setItem('pangpang-guest-id', guestId);
    }
    currentUser = {
        id: guestId,
        name: '게스트',
        email: '',
        type: 'guest'
    };
    localStorage.setItem('pangpang-user', JSON.stringify(currentUser));
    console.log('👤 게스트 모드:', currentUser);
    afterLogin();
}

function logoutUser() {
    if (confirm('정말 로그아웃할까요?\n진행 데이터는 서버에 저장되어 있어요.')) {
        localStorage.removeItem('pangpang-user');
        currentUser = null;
        location.reload();
    }
}

function afterLogin() {
    const nameEl = document.getElementById('user-name-display');
    const userInfo = document.getElementById('user-info');
    if (nameEl && currentUser) {
        nameEl.textContent = currentUser.name;
        if (currentUser.type === 'naver') {
            userInfo.classList.add('naver');
        } else {
            userInfo.classList.remove('naver');
        }
    }
    bootGame();
}

// ============================================
// 백엔드 연동
// ============================================
const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbyLv8diy8EwsdaNl_lkEza3U2gkHqudkrxzVMPC_VM9tOhcovikesaK-E3frY-77JA/exec';

// 테스트 모드: 'EXP', '하트', 'EXP하트', '' 중 하나
let testMode = '';

function getUserId() { return currentUser ? currentUser.id : null; }
function getUserName() { return currentUser ? currentUser.name : '게스트'; }
function isExpTest() { return testMode === 'EXP' || testMode === 'EXP하트'; }
function isHeartTest() { return testMode === '하트' || testMode === 'EXP하트'; }

async function saveToBackend(state) {
    const uid = getUserId();
    if (!uid) return;
    try {
        const res = await fetch(BACKEND_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'save',
                userId: uid,
                name: getUserName(),
                email: (currentUser && currentUser.email) || '',
                data: state
            })
        });
        const json = await res.json();
        console.log('💾 백엔드 저장:', json);
        return json;
    } catch (e) {
        console.warn('백엔드 저장 실패', e);
    }
}

async function loadFromBackend() {
    const uid = getUserId();
    if (!uid) return null;
    try {
        const url = BACKEND_URL + '?action=load&userId=' + encodeURIComponent(uid);
        const res = await fetch(url);
        const json = await res.json();
        console.log('📥 백엔드 불러옴:', json);
        
        if (json.mode === 'EXP' || json.mode === '하트' || json.mode === 'EXP하트' || json.mode === '테스트') {
            testMode = json.mode === '테스트' ? 'EXP하트' : json.mode;
            console.log('🧪 테스트 모드:', testMode);
        } else {
            testMode = '';
        }
        
        if (json.ok && json.data) return json.data;
        return null;
    } catch (e) {
        console.warn('백엔드 불러오기 실패', e);
        return null;
    }
}

async function recordWinToBackend(animal, reward) {
    const uid = getUserId();
    if (!uid) return;
    try {
        await fetch(BACKEND_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'win',
                userId: uid,
                name: getUserName(),
                email: (currentUser && currentUser.email) || '',
                animalStage: animal.stage,
                rewardLabel: reward.label,
                rewardType: reward.type,
                rewardValue: reward.value
            })
        });
        console.log('🏆 당첨 기록 완료');
    } catch (e) {
        console.warn('당첨 기록 실패', e);
    }
}

// ============================================
// 사운드 시스템 (Web Audio API + TTS)
// ============================================
let audioCtx = null;
let bgmGain = null;
let bgmOscillators = [];
let soundEnabled = true;
let audioUnlocked = false;

function loadSoundSetting() {
    const saved = localStorage.getItem('pangpang-sound');
    soundEnabled = saved !== 'off';
    updateSoundButton();
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('pangpang-sound', soundEnabled ? 'on' : 'off');
    updateSoundButton();
    if (soundEnabled) {
        if (screenPuzzle && screenPuzzle.classList.contains('active')) {
            startBGM();
        }
    } else {
        stopBGM();
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    }
}

function updateSoundButton() {
    const btn = document.getElementById('settings-sound');
    if (btn) {
        btn.textContent = soundEnabled ? '🔊 사운드: 켜짐' : '🔇 사운드: 꺼짐';
    }
}

function initAudio() {
    if (audioCtx) return;
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioCtx();
        audioUnlocked = true;
    } catch (e) {
        console.warn('Audio Context 실패', e);
    }
}

// 매치 사운드 (팝!)
function playMatchSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
        
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        
        osc.start(now);
        osc.stop(now + 0.15);
    } catch (e) {}
}

// 콤보 사운드 (콤보 횟수에 따라 음 높아짐)
function playComboSound(comboNum) {
    if (!soundEnabled || !audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        const baseFreq = 440 + (comboNum * 80);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.2);
        
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        
        osc.start(now);
        osc.stop(now + 0.3);
    } catch (e) {}
}

// 폭탄 사운드 (꽝!)
function playBombSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        
        // 저음 폭발음
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(100, now);
        osc1.frequency.exponentialRampToValueAtTime(40, now + 0.5);
        gain1.gain.setValueAtTime(0.4, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc1.start(now);
        osc1.stop(now + 0.5);
        
        // 노이즈 (지지직)
        const bufferSize = audioCtx.sampleRate * 0.3;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const noise = audioCtx.createBufferSource();
        const noiseGain = audioCtx.createGain();
        noise.buffer = buffer;
        noise.connect(noiseGain);
        noiseGain.connect(audioCtx.destination);
        noiseGain.gain.setValueAtTime(0.3, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        noise.start(now);
    } catch (e) {}
}

// 레벨업 사운드 (띠리링)
function playLevelUpSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        const notes = [523, 659, 784, 1047]; // C, E, G, C
        notes.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.1);
            gain.gain.setValueAtTime(0.2, now + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.2);
            osc.start(now + i * 0.1);
            osc.stop(now + i * 0.1 + 0.2);
        });
    } catch (e) {}
}

// 작물 이름 음성 (TTS)
function speakCropName(name) {
    if (!soundEnabled) return;
    if (!('speechSynthesis' in window)) return;
    try {
        const utterance = new SpeechSynthesisUtterance(name);
        utterance.lang = 'ko-KR';
        utterance.rate = 1.3;
        utterance.pitch = 1.5;
        utterance.volume = 0.7;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    } catch (e) {}
}

// 배경음악 (간단한 농장 멜로디)
function startBGM() {
    if (!soundEnabled || !audioCtx || bgmOscillators.length > 0) return;
    try {
        bgmGain = audioCtx.createGain();
        bgmGain.connect(audioCtx.destination);
        bgmGain.gain.value = 0.05; // 매우 작게
        
        // C장조 단순 멜로디 반복 (도-미-솔-도-솔-미)
        const melody = [
            { note: 523, dur: 0.5 }, // C5
            { note: 659, dur: 0.5 }, // E5
            { note: 784, dur: 0.5 }, // G5
            { note: 1047, dur: 0.5 }, // C6
            { note: 784, dur: 0.5 },
            { note: 659, dur: 0.5 },
            { note: 587, dur: 0.5 }, // D5
            { note: 659, dur: 1.0 }
        ];
        
        const playMelody = () => {
            if (!soundEnabled || !audioCtx) return;
            let t = audioCtx.currentTime;
            melody.forEach(({note, dur}) => {
                const osc = audioCtx.createOscillator();
                const noteGain = audioCtx.createGain();
                osc.connect(noteGain);
                noteGain.connect(bgmGain);
                osc.type = 'sine';
                osc.frequency.value = note;
                noteGain.gain.setValueAtTime(0, t);
                noteGain.gain.linearRampToValueAtTime(0.5, t + 0.05);
                noteGain.gain.linearRampToValueAtTime(0.5, t + dur - 0.05);
                noteGain.gain.linearRampToValueAtTime(0, t + dur);
                osc.start(t);
                osc.stop(t + dur);
                bgmOscillators.push(osc);
                t += dur;
            });
        };
        
        playMelody();
        const interval = setInterval(() => {
            if (!soundEnabled || bgmOscillators.length === 0) {
                clearInterval(interval);
                return;
            }
            playMelody();
        }, 4500);
        
        bgmOscillators._interval = interval;
    } catch (e) {
        console.warn('BGM 시작 실패', e);
    }
}

function stopBGM() {
    if (bgmOscillators._interval) clearInterval(bgmOscillators._interval);
    bgmOscillators.forEach(osc => {
        try { osc.stop(); } catch (e) {}
    });
    bgmOscillators = [];
}

// ============================================
// 게임 설정
// ============================================
const BOARD_SIZE = 6;

const ALL_CROPS = [
    { id: 'apple', emoji: '🍎', name: '사과' },
    { id: 'banana', emoji: '🍌', name: '바나나' },
    { id: 'tomato', emoji: '🍅', name: '토마토' },
    { id: 'corn', emoji: '🌽', name: '옥수수' },
    { id: 'cucumber', emoji: '🥒', name: '오이' },
    { id: 'eggplant', emoji: '🍆', name: '가지' },
    { id: 'onion', emoji: '🧅', name: '양파' },
    { id: 'grape', emoji: '🍇', name: '포도' },
    { id: 'garlic', emoji: '🧄', name: '마늘' }
];

const CROPS_BY_STAGE = {
    chicken: ['apple', 'banana', 'tomato', 'corn', 'cucumber'],
    pig:     ['apple', 'banana', 'tomato', 'corn', 'cucumber', 'eggplant', 'onion'],
    cow:     ['apple', 'banana', 'tomato', 'corn', 'cucumber', 'eggplant', 'onion', 'grape', 'garlic']
};

const STAGES = {
    chicken: { babyName: '병아리', babyEmoji: '🐤', adultName: '닭', adultEmoji: '🐓', nextStage: 'pig' },
    pig:     { babyName: '새끼 돼지', babyEmoji: '🐷', adultName: '돼지', adultEmoji: '🐖', nextStage: 'cow' },
    cow:     { babyName: '송아지', babyEmoji: '🐮', adultName: '소', adultEmoji: '🐄', nextStage: null }
};

const LEVEL_EXP_TABLE = {
    1: 200, 2: 400, 3: 600, 4: 800, 5: 1000,
    6: 1200, 7: 1400, 8: 1600, 9: 1800
};
const MAX_LEVEL = 10;

const REWARDS = {
    chicken: [
        { label: '1,000원 쿠폰', emoji: '🎟️', type: 'coupon', value: 1000, weight: 35 },
        { label: '2,000원 쿠폰', emoji: '🎟️', type: 'coupon', value: 2000, weight: 28 },
        { label: '3,000원 쿠폰', emoji: '🎟️', type: 'coupon', value: 3000, weight: 21 },
        { label: '꽝!', emoji: '😢', type: 'miss', value: 0, weight: 7 },
        { label: '닭정육 2kg', emoji: '🍗', type: 'product', value: 'chicken-2kg', weight: 9 }
    ],
    pig: [
        { label: '3,000원 쿠폰', emoji: '🎟️', type: 'coupon', value: 3000, weight: 32 },
        { label: '4,000원 쿠폰', emoji: '🎟️', type: 'coupon', value: 4000, weight: 30 },
        { label: '5,000원 쿠폰', emoji: '🎟️', type: 'coupon', value: 5000, weight: 26 },
        { label: '꽝!', emoji: '😢', type: 'miss', value: 0, weight: 5 },
        { label: '삼겹살 2kg', emoji: '🥓', type: 'product', value: 'pork-2kg', weight: 7 }
    ],
    cow: [
        { label: '5,000원 쿠폰', emoji: '🎟️', type: 'coupon', value: 5000, weight: 30 },
        { label: '7,000원 쿠폰', emoji: '🎟️', type: 'coupon', value: 7000, weight: 30 },
        { label: '10,000원 쿠폰', emoji: '🎟️', type: 'coupon', value: 10000, weight: 30 },
        { label: '꽝!', emoji: '😢', type: 'miss', value: 0, weight: 5 },
        { label: '한우 2kg', emoji: '🥩', type: 'product', value: 'beef-2kg', weight: 5 }
    ]
};

const MAX_HEARTS = 5;
const DAILY_HEARTS = 3;
const MAX_FARM_SLOTS = 5;
const DAILY_EXP_LIMIT = 1800;
const MATCH_BASE_EXP = 5;
const INITIAL_TIME = 90;
const HINT_FREE_COUNT = 3;
const HINT_TIME_COST = 30;
const TIME_PER_MATCH = 1;
const COMBO_BOMB_TRIGGER = 10;

// ============================================
// 게임 상태
// ============================================
let board = [];
let selectedCell = null;
let isLocked = false;
let comboCount = 0;
let cumulativeCombo = 0;  // 누적 콤보 (게이지용)
let bombReady = false;
let dailyEatenToday = 0;
let lastResetDate = '';
let hearts = 3;
let farmAnimals = [];
let activeAnimalId = null;
let bigWanderInterval = null;

let puzzleTimer = INITIAL_TIME;
let puzzleTimerInterval = null;
let sessionStartLevel = 1;
let sessionMatches = 0;
let sessionMaxCombo = 1;
let sessionGainedExp = 0;
let sessionHintsLeft = HINT_FREE_COUNT;

let droppedCropQueue = [];
let animalIsMovingToFood = false;
let activePosX = 20;
let activePosY = 0;

let currentRewards = [];
let chosenRewardIndex = -1;
let activeWanderInterval = null;

const screenLogin = document.getElementById('screen-login');
const screenMain = document.getElementById('screen-main');
const screenPuzzle = document.getElementById('screen-puzzle');
const screenResult = document.getElementById('screen-result');
const heartCountMain = document.getElementById('heart-count-main');
const slotCountMain = document.getElementById('slot-count-main');
const bigAnimalsContainer = document.getElementById('big-animals');
const boardElement = document.getElementById('board');
const flyLayer = document.getElementById('fly-layer');
const timerText = document.getElementById('timer-text');
const timerGaugeFill = document.getElementById('timer-gauge-fill');
const comboBox = document.getElementById('combo-box');
const comboText = document.getElementById('combo-text');
const comboGaugeFill = document.getElementById('combo-gauge-fill');
const comboGaugeText = document.getElementById('combo-gauge-text');
const btnBomb = document.getElementById('btn-bomb');

const skyMain = document.getElementById('sky-main');
const celestialMain = document.getElementById('celestial-main');
const cloudsMain = document.getElementById('clouds-main');
const starsMain = document.getElementById('stars-main');
const timeTextMain = document.getElementById('time-text-main');

function saveState() {
    const state = { farmAnimals, activeAnimalId, hearts, dailyEatenToday, lastResetDate };
    localStorage.setItem('pangpang-farm-v5', JSON.stringify(state));
    saveToBackend(state);
}

function loadLocalState() {
    const raw = localStorage.getItem('pangpang-farm-v5');
    if (!raw) return false;
    try {
        const s = JSON.parse(raw);
        farmAnimals = s.farmAnimals || [];
        activeAnimalId = s.activeAnimalId || null;
        hearts = s.hearts !== undefined ? s.hearts : 3;
        dailyEatenToday = s.dailyEatenToday || 0;
        lastResetDate = s.lastResetDate || '';
        return true;
    } catch (e) {
        return false;
    }
}

function resetAllData() {
    localStorage.removeItem('pangpang-farm-v5');
    localStorage.removeItem('pangpang-user');
    localStorage.removeItem('pangpang-guest-id');
    location.reload();
}

function getKoreaTime() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (9 * 60 * 60 * 1000));
}

function checkDailyReset() {
    const today = getKoreaTime().toISOString().slice(0, 10);
    if (lastResetDate !== today) {
        hearts = Math.max(hearts, DAILY_HEARTS);
        if (hearts > MAX_HEARTS) hearts = MAX_HEARTS;
        dailyEatenToday = 0;
        lastResetDate = today;
        saveState();
    }
}

function updateSkyByTime() {
    const korea = getKoreaTime();
    const hour = korea.getHours();
    const minute = korea.getMinutes();
    const hourFloat = hour + minute / 60;

    if (timeTextMain) {
        timeTextMain.textContent = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
    }

    const SUNRISE = 6, SUNSET = 18;
    let skyGradient, isDayTime, progress;

    if (hourFloat >= SUNRISE && hourFloat < SUNRISE + 1) {
        skyGradient = 'linear-gradient(180deg, #FFB088 0%, #FFD78A 100%)';
        isDayTime = true;
    } else if (hourFloat >= SUNRISE + 1 && hourFloat < SUNSET - 1) {
        skyGradient = 'linear-gradient(180deg, #B5E7FF 0%, #87CEEB 100%)';
        isDayTime = true;
    } else if (hourFloat >= SUNSET - 1 && hourFloat < SUNSET) {
        skyGradient = 'linear-gradient(180deg, #FF9966 0%, #C77AC4 100%)';
        isDayTime = true;
    } else {
        skyGradient = 'linear-gradient(180deg, #0F1F4A 0%, #2A3A6F 100%)';
        isDayTime = false;
    }
    if (skyMain) skyMain.style.background = skyGradient;

    if (isDayTime) {
        progress = (hourFloat - SUNRISE) / (SUNSET - SUNRISE);
        if (celestialMain) celestialMain.textContent = '☀️';
    } else {
        let nightHours = hourFloat >= SUNSET ? hourFloat - SUNSET : hourFloat + (24 - SUNSET);
        progress = nightHours / 12;
        if (celestialMain) celestialMain.textContent = '🌙';
    }

    if (celestialMain) {
        const farmEl = document.getElementById('big-farm');
        if (farmEl) {
            const w = farmEl.clientWidth;
            const x = 20 + progress * (w - 60);
            const yArc = Math.sin(progress * Math.PI);
            const y = 50 - yArc * 35;
            celestialMain.style.left = x + 'px';
            celestialMain.style.top = y + 'px';
        }
    }

    if (isDayTime) {
        if (cloudsMain) cloudsMain.classList.remove('hide');
        if (starsMain) starsMain.classList.remove('show');
    } else {
        if (cloudsMain) cloudsMain.classList.add('hide');
        if (starsMain) starsMain.classList.add('show');
    }
}

function createStars() {
    if (!starsMain) return;
    starsMain.innerHTML = '';
    for (let i = 0; i < 18; i++) {
        const s = document.createElement('span');
        s.className = 'star';
        s.textContent = '✦';
        s.style.left = (5 + Math.random() * 90) + '%';
        s.style.top = (5 + Math.random() * 60) + '%';
        s.style.animationDelay = (Math.random() * 2) + 's';
        s.style.fontSize = (8 + Math.random() * 6) + 'px';
        starsMain.appendChild(s);
    }
}

function showScreen(name) {
    [screenLogin, screenMain, screenPuzzle, screenResult].forEach(s => {
        if (s) s.classList.remove('active');
    });
    if (name === 'login') screenLogin.classList.add('active');
    if (name === 'main') screenMain.classList.add('active');
    if (name === 'puzzle') screenPuzzle.classList.add('active');
    if (name === 'result') screenResult.classList.add('active');
}

function generateAnimalId() {
    return 'a' + Date.now() + Math.floor(Math.random() * 1000);
}

function createNewBabyChicken(name) {
    return {
        id: generateAnimalId(),
        name: name,
        stage: 'chicken',
        level: 1,
        exp: 0,
        posX: 30 + Math.random() * 200,
        posY: 30 + Math.random() * 50,
        facingRight: true
    };
}

function getActiveAnimal() {
    return farmAnimals.find(a => a.id === activeAnimalId);
}

function getAnimalEmoji(animal) {
    const s = STAGES[animal.stage];
    return animal.level >= MAX_LEVEL ? s.adultEmoji : s.babyEmoji;
}

function renderBigFarm() {
    if (!bigAnimalsContainer) return;
    bigAnimalsContainer.innerHTML = '';
    const farmEl = document.getElementById('big-farm');
    if (!farmEl) return;
    const farmWidth = farmEl.clientWidth;
    const farmHeight = farmEl.clientHeight;
    const grassTop = farmHeight * 0.45;
    const grassBottom = farmHeight - 30;

    farmAnimals.forEach((animal, idx) => {
        const el = document.createElement('div');
        el.className = 'big-animal';
        if (animal.level >= MAX_LEVEL) el.classList.add('adult');
        el.dataset.animalId = animal.id;
        el.textContent = getAnimalEmoji(animal);

        if (animal.posX === undefined || animal.posX < 20 || animal.posX > farmWidth - 60) {
            animal.posX = 30 + (idx * 70) % (farmWidth - 80);
        }
        if (animal.posY === undefined || animal.posY < grassTop || animal.posY > grassBottom) {
            animal.posY = grassTop + 20 + Math.random() * (grassBottom - grassTop - 40);
        }

        el.style.left = animal.posX + 'px';
        el.style.top = animal.posY + 'px';
        el.style.transform = animal.facingRight ? 'scaleX(1)' : 'scaleX(-1)';

        const lvTag = document.createElement('span');
        lvTag.className = 'lv-tag';
        if (animal.level >= MAX_LEVEL) {
            lvTag.classList.add('max');
            lvTag.textContent = 'MAX';
        } else {
            lvTag.textContent = 'Lv.' + animal.level;
        }
        el.appendChild(lvTag);

        const tag = document.createElement('span');
        tag.className = 'name-tag';
        tag.textContent = animal.name;
        el.appendChild(tag);

        el.addEventListener('click', () => onBigAnimalClick(animal.id));
        bigAnimalsContainer.appendChild(el);
    });

    if (slotCountMain) slotCountMain.textContent = farmAnimals.length;
}

function onBigAnimalClick(id) {
    const animal = farmAnimals.find(a => a.id === id);
    if (!animal) return;
    if (animal.level >= MAX_LEVEL) {
        showAdultPopup(animal);
    } else {
        activeAnimalId = id;
        saveState();
    }
}

function startBigFarmWandering() {
    stopBigFarmWandering();
    bigWanderInterval = setInterval(() => {
        if (!screenMain.classList.contains('active')) return;
        const farmEl = document.getElementById('big-farm');
        if (!farmEl) return;
        const farmWidth = farmEl.clientWidth;
        const farmHeight = farmEl.clientHeight;
        const grassTop = farmHeight * 0.45;
        const grassBottom = farmHeight - 30;

        farmAnimals.forEach(animal => {
            const el = bigAnimalsContainer.querySelector(`[data-animal-id="${animal.id}"]`);
            if (!el) return;
            if (Math.random() > 0.5) return;

            const targetX = 20 + Math.random() * (farmWidth - 80);
            const targetY = grassTop + 20 + Math.random() * (grassBottom - grassTop - 40);

            if (Math.abs(targetX - animal.posX) < 20 && Math.abs(targetY - animal.posY) < 20) return;

            animal.facingRight = targetX >= animal.posX;
            animal.posX = targetX;
            animal.posY = targetY;

            el.style.transform = animal.facingRight ? 'scaleX(1)' : 'scaleX(-1)';
            el.style.left = targetX + 'px';
            el.style.top = targetY + 'px';
            el.classList.add('walking');
            setTimeout(() => el.classList.remove('walking'), 3000);
        });
        saveState();
    }, 4000);
}

function stopBigFarmWandering() {
    if (bigWanderInterval) {
        clearInterval(bigWanderInterval);
        bigWanderInterval = null;
    }
}

function startFirstTime() {
    document.getElementById('name-overlay').classList.add('active');
    const input = document.getElementById('animal-name-input');
    if (input) {
        input.focus();
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmName();
        });
    }
}

function confirmName() {
    const input = document.getElementById('animal-name-input');
    let name = input.value.trim();
    if (!name) name = '병아리';
    if (name.length > 10) name = name.slice(0, 10);

    const baby = createNewBabyChicken(name);
    farmAnimals.push(baby);
    activeAnimalId = baby.id;
    saveState();

    document.getElementById('name-overlay').classList.remove('active');
    enterMain();
}

function enterMain() {
    showScreen('main');
    updateHeartUI();
    renderBigFarm();
    startBigFarmWandering();
    updateSkyByTime();
    stopBGM();
}

function goToMain() { enterMain(); }
function updateHeartUI() { if (heartCountMain) heartCountMain.textContent = hearts; }

function goToPuzzle() {
    initAudio();  // 첫 클릭 시 오디오 활성화
    
    if (!activeAnimalId || !getActiveAnimal() || getActiveAnimal().level >= MAX_LEVEL) {
        const growing = farmAnimals.find(a => a.level < MAX_LEVEL);
        if (growing) {
            activeAnimalId = growing.id;
        } else {
            if (farmAnimals.length >= MAX_FARM_SLOTS) {
                alert('농장이 꽉 찼어요!');
                return;
            }
            const newBaby = createNewBabyChicken('병아리' + (farmAnimals.length + 1));
            farmAnimals.push(newBaby);
            activeAnimalId = newBaby.id;
        }
        saveState();
    }

    if (dailyEatenToday >= DAILY_EXP_LIMIT && !isExpTest()) {
        document.getElementById('full-overlay').classList.add('active');
        return;
    }

    if (hearts <= 0 && !isHeartTest()) {
        document.getElementById('no-heart-overlay').classList.add('active');
        return;
    }

    if (!isHeartTest()) {
        hearts--;
    }
    saveState();
    updateHeartUI();
    startPuzzleSession();
}

function startPuzzleSession() {
    showScreen('puzzle');
    stopBigFarmWandering();

    puzzleTimer = INITIAL_TIME;
    sessionMatches = 0;
    sessionMaxCombo = 1;
    sessionGainedExp = 0;
    sessionHintsLeft = HINT_FREE_COUNT;
    comboCount = 0;
    cumulativeCombo = 0;
    bombReady = false;
    selectedCell = null;
    isLocked = false;
    droppedCropQueue = [];
    animalIsMovingToFood = false;

    const active = getActiveAnimal();
    sessionStartLevel = active ? active.level : 1;

    activePosX = 20;
    activePosY = 8;

    updatePuzzleUI();
    updateComboGauge();
    initActiveAnimalPosition();
    board = createBoard();
    renderBoard();
    startTimer();
    startActiveAnimalWandering();
    startBGM();
}

function initActiveAnimalPosition() {
    const animal = document.getElementById('puzzle-active-spot');
    if (!animal) return;
    animal.style.left = activePosX + 'px';
    animal.style.bottom = activePosY + 'px';
    animal.style.transform = 'scaleX(1)';
}

function updatePuzzleUI() {
    const active = getActiveAnimal();
    if (!active) return;
    updateHintButton();

    const animalEl = document.getElementById('puzzle-active-spot');
    if (animalEl) {
        animalEl.textContent = getAnimalEmoji(active);
        if (active.level >= MAX_LEVEL) animalEl.classList.add('adult');
        else animalEl.classList.remove('adult');
    }

    const emojiMini = document.getElementById('active-emoji-mini');
    if (emojiMini) emojiMini.textContent = getAnimalEmoji(active);

    document.getElementById('active-name-mini').textContent = active.name;
    document.getElementById('active-level-mini').textContent = active.level;

    if (active.level >= MAX_LEVEL) {
        document.getElementById('growth-bar').style.width = '100%';
    } else {
        const need = LEVEL_EXP_TABLE[active.level];
        const percent = Math.min(100, (active.exp / need) * 100);
        document.getElementById('growth-bar').style.width = percent + '%';
    }
}

// ============================================
// 콤보 게이지
// ============================================
function updateComboGauge() {
    if (!comboGaugeFill || !comboGaugeText) return;
    const percent = Math.min(100, (cumulativeCombo / COMBO_BOMB_TRIGGER) * 100);
    comboGaugeFill.style.height = percent + '%';
    comboGaugeText.textContent = cumulativeCombo + '/' + COMBO_BOMB_TRIGGER;
    
    if (cumulativeCombo >= COMBO_BOMB_TRIGGER) {
        comboGaugeFill.classList.add('full');
        bombReady = true;
        if (btnBomb) {
            btnBomb.classList.add('active');
            btnBomb.disabled = false;
        }
    } else {
        comboGaugeFill.classList.remove('full');
        bombReady = false;
        if (btnBomb) {
            btnBomb.classList.remove('active');
            btnBomb.disabled = true;
        }
    }
}

function useBomb() {
    if (!bombReady || isLocked || puzzleTimer <= 0) return;
    
    cumulativeCombo = 0;
    bombReady = false;
    updateComboGauge();
    
    triggerBombEffect();
}

function triggerBombEffect() {
    playBombSound();
    
    const cropsOnBoard = {};
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (board[row][col]) {
                const id = board[row][col].id;
                if (!cropsOnBoard[id]) cropsOnBoard[id] = [];
                cropsOnBoard[id].push({row, col});
            }
        }
    }
    
    const cropIds = Object.keys(cropsOnBoard);
    if (cropIds.length === 0) return;
    
    const targetId = cropIds[Math.floor(Math.random() * cropIds.length)];
    const targetCells = cropsOnBoard[targetId];
    const targetCrop = ALL_CROPS.find(c => c.id === targetId);
    
    showBombEffect(targetCrop);
    
    const bombExp = MATCH_BASE_EXP * targetCells.length;
    sessionMatches += targetCells.length;
    grantExpToActive(bombExp);
    
    targetCells.forEach((pos, idx) => {
        const cell = boardElement.children[pos.row * BOARD_SIZE + pos.col];
        if (cell) {
            setTimeout(() => {
                spawnParticles(cell);
                cell.classList.add('matching');
                dropCropToField(cell, targetCrop);
            }, idx * 80);
        }
    });
    
    addTime(5);
    
    setTimeout(() => {
        targetCells.forEach(({row, col}) => { board[row][col] = null; });
        dropDown();
        fillEmpty();
        renderBoard();
        
        setTimeout(() => {
            if (puzzleTimer <= 0) return;
            const more = findMatches();
            if (more.length > 0) {
                comboCount = 0;
                processMatches();
            } else {
                comboCount = 0;
                checkEndConditions();
            }
        }, 500);
    }, 800);
}

function showBombEffect(crop) {
    if (!flyLayer) return;
    
    const bomb = document.createElement('div');
    bomb.textContent = '💣 BOOM! 💥';
    bomb.style.cssText = `
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        font-size: 36px;
        font-weight: bold;
        color: #FF1744;
        text-shadow: 0 0 20px #FFD700, 0 2px 6px rgba(0,0,0,0.5);
        z-index: 100;
        animation: bombPop 1.2s ease-out forwards;
        white-space: nowrap;
        pointer-events: none;
    `;
    flyLayer.appendChild(bomb);
    
    if (crop) {
        const target = document.createElement('div');
        target.textContent = crop.emoji + ' 폭파!';
        target.style.cssText = `
            position: absolute;
            left: 50%;
            top: 65%;
            transform: translate(-50%, -50%);
            font-size: 22px;
            font-weight: bold;
            color: #FF6B35;
            text-shadow: 0 2px 4px rgba(255,255,255,0.9);
            z-index: 100;
            animation: bombPop 1.2s ease-out forwards;
            pointer-events: none;
        `;
        flyLayer.appendChild(target);
        setTimeout(() => target.remove(), 1200);
        
        // 폭파된 작물 이름 외치기
        speakCropName(crop.name);
    }
    
    setTimeout(() => bomb.remove(), 1200);
}

function startTimer() {
    stopTimer();
    updateTimerDisplay();
    puzzleTimerInterval = setInterval(() => {
        puzzleTimer--;
        updateTimerDisplay();
        if (puzzleTimer <= 0) endPuzzleSession('timeout');
    }, 1000);
}

function stopTimer() {
    if (puzzleTimerInterval) {
        clearInterval(puzzleTimerInterval);
        puzzleTimerInterval = null;
    }
}

function updateTimerDisplay() {
    if (timerText) timerText.textContent = puzzleTimer;
    if (timerGaugeFill) {
        const percent = Math.max(0, Math.min(100, (puzzleTimer / INITIAL_TIME) * 100));
        timerGaugeFill.style.width = percent + '%';
        if (puzzleTimer <= 15) timerGaugeFill.classList.add('warning');
        else timerGaugeFill.classList.remove('warning');
    }
}
function addTime(seconds) {
    puzzleTimer += seconds;
    if (puzzleTimer < 0) puzzleTimer = 0;
    if (puzzleTimer > INITIAL_TIME) puzzleTimer = INITIAL_TIME;
    updateTimerDisplay();
}

function useHint() {
    if (isLocked) return;
    if (puzzleTimer <= 0) return;

    if (sessionHintsLeft > 0) {
        sessionHintsLeft--;
        updateHintButton();
    } else {
        if (puzzleTimer < HINT_TIME_COST) {
            alert('남은 시간이 부족해서 힌트를 사용할 수 없어요!');
            return;
        }
        addTime(-HINT_TIME_COST);
    }

    const candidates = findHintCandidates();
    if (candidates.length === 0) {
        alert('매치 가능한 자리가 없어요. 보드를 섞어드릴게요.');
        board = createBoard();
        renderBoard();
        return;
    }

    const blinkCells = candidates[0];
    blinkCells.forEach(({row, col}) => {
        const cell = boardElement.children[row * BOARD_SIZE + col];
        if (cell) cell.classList.add('hint-blink');
    });

    setTimeout(() => {
        blinkCells.forEach(({row, col}) => {
            const cell = boardElement.children[row * BOARD_SIZE + col];
            if (cell) cell.classList.remove('hint-blink');
        });
    }, 2500);
}

function updateHintButton() {
    const btn = document.querySelector('.btn-hint');
    if (!btn) return;
    if (sessionHintsLeft > 0) {
        btn.textContent = '💡 힌트 (' + sessionHintsLeft + '/3)';
        btn.classList.remove('hint-paid');
    } else {
        btn.textContent = '💡 힌트 (-' + HINT_TIME_COST + '초)';
        btn.classList.add('hint-paid');
    }
}

function findHintCandidates() {
    const results = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (col < BOARD_SIZE - 1) {
                swap(row, col, row, col + 1);
                const matches = findMatches();
                swap(row, col, row, col + 1);
                if (matches.length > 0) results.push([{row, col}, {row, col: col + 1}]);
            }
            if (row < BOARD_SIZE - 1) {
                swap(row, col, row + 1, col);
                const matches = findMatches();
                swap(row, col, row + 1, col);
                if (matches.length > 0) results.push([{row, col}, {row: row + 1, col}]);
            }
        }
    }
    return results;
}

function getCurrentCrops() {
    const active = getActiveAnimal();
    const stage = active ? active.stage : 'chicken';
    const ids = CROPS_BY_STAGE[stage];
    return ALL_CROPS.filter(c => ids.includes(c.id));
}

function createBoard() {
    const crops = getCurrentCrops();
    const nb = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
        nb.push([]);
        for (let col = 0; col < BOARD_SIZE; col++) {
            let crop;
            do {
                crop = crops[Math.floor(Math.random() * crops.length)];
            } while (
                (col >= 2 && nb[row][col-1].id === crop.id && nb[row][col-2].id === crop.id) ||
                (row >= 2 && nb[row-1][col].id === crop.id && nb[row-2][col].id === crop.id)
            );
            nb[row].push(crop);
        }
    }
    return nb;
}

function renderBoard() {
    if (!boardElement) return;
    boardElement.innerHTML = '';
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            const crop = board[row][col];
            if (crop) {
                cell.textContent = crop.emoji;
                cell.dataset.cropId = crop.id;
            }
            cell.dataset.row = row;
            cell.dataset.col = col;
            cell.addEventListener('click', () => handleCellClick(row, col));
            boardElement.appendChild(cell);
        }
    }
}

function handleCellClick(row, col) {
    if (isLocked) return;
    if (puzzleTimer <= 0) return;

    if (selectedCell === null) {
        selectedCell = { row, col };
        highlightCell(row, col, true);
    } else {
        const prev = selectedCell;
        highlightCell(prev.row, prev.col, false);

        if (prev.row === row && prev.col === col) {
            selectedCell = null;
            return;
        }

        if (isAdjacent(prev, { row, col })) {
            swap(prev.row, prev.col, row, col);
            if (findMatches().length > 0) {
                comboCount = 0;
                processMatches();
            } else {
                swap(prev.row, prev.col, row, col);
            }
        }
        selectedCell = null;
    }
}

function isAdjacent(a, b) {
    const rd = Math.abs(a.row - b.row);
    const cd = Math.abs(a.col - b.col);
    return (rd === 1 && cd === 0) || (rd === 0 && cd === 1);
}

function highlightCell(row, col, on) {
    const cell = boardElement.children[row * BOARD_SIZE + col];
    if (cell) {
        if (on) cell.classList.add('selected');
        else cell.classList.remove('selected');
    }
}

function swap(r1, c1, r2, c2) {
    const t = board[r1][c1];
    board[r1][c1] = board[r2][c2];
    board[r2][c2] = t;
    renderBoard();
}

function findMatches() {
    const matched = [];
    const seen = new Set();
    const add = (row, col) => {
        const k = row + '-' + col;
        if (!seen.has(k)) { seen.add(k); matched.push({row, col}); }
    };
    const same = (a, b) => a && b && a.id === b.id;

    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col <= BOARD_SIZE - 3; col++) {
            const c = board[row][col];
            if (c && same(c, board[row][col+1]) && same(c, board[row][col+2])) {
                let end = col + 2;
                while (end + 1 < BOARD_SIZE && same(c, board[row][end+1])) end++;
                for (let k = col; k <= end; k++) add(row, k);
                col = end;
            }
        }
    }
    for (let col = 0; col < BOARD_SIZE; col++) {
        for (let row = 0; row <= BOARD_SIZE - 3; row++) {
            const c = board[row][col];
            if (c && same(c, board[row+1][col]) && same(c, board[row+2][col])) {
                let end = row + 2;
                while (end + 1 < BOARD_SIZE && same(c, board[end+1][col])) end++;
                for (let k = row; k <= end; k++) add(k, col);
                row = end;
            }
        }
    }
    return matched;
}

function processMatches() {
    const matches = findMatches();
    if (matches.length === 0) return;

    comboCount++;
      if (comboCount >= 2) {
        cumulativeCombo++;
    }
    sessionMatches++;
    if (comboCount > sessionMaxCombo) sessionMaxCombo = comboCount;
    
    const expGain = MATCH_BASE_EXP;

    if (comboCount >= 2) {
        comboText.textContent = comboCount;
        comboBox.style.opacity = '1';
        comboBox.style.transform = 'scale(1.2)';
        setTimeout(() => { comboBox.style.transform = 'scale(1)'; }, 200);
        setTimeout(() => { comboBox.style.opacity = '0'; }, 1500);
        playComboSound(comboCount);
    } else {
        playMatchSound();
    }

    updateComboGauge();
    addTime(TIME_PER_MATCH);

    const matchData = matches.map(m => ({ row: m.row, col: m.col, crop: board[m.row][m.col] }));
    if (matchData.length > 0 && matchData[0]) {
        showScorePopup(matchData[0], expGain, comboCount);
        // 작물 이름 외치기 (콤보 2 이상일 때만, 너무 시끄럽지 않게)
        if (comboCount >= 2 && matchData[0].crop) {
            speakCropName(matchData[0].crop.name);
        }
    }

    matchData.forEach(m => {
        const cell = boardElement.children[m.row * BOARD_SIZE + m.col];
        if (cell) {
            spawnParticles(cell);
            cell.classList.add('matching');
        }
    });

    if (matchData[0] && matchData[0].crop) {
        const firstCell = boardElement.children[matchData[0].row * BOARD_SIZE + matchData[0].col];
        if (firstCell) dropCropToField(firstCell, matchData[0].crop);
    }

    grantExpToActive(expGain);

    setTimeout(() => {
        matches.forEach(({row, col}) => { board[row][col] = null; });
        dropDown();
        fillEmpty();
        renderBoard();

        setTimeout(() => {
            if (puzzleTimer <= 0) return;
            const more = findMatches();
            if (more.length > 0) {
                processMatches();
            } else {
                comboCount = 0;
                checkEndConditions();
            }
        }, 300);
    }, 400);
}

function checkEndConditions() {
    if (dailyEatenToday >= DAILY_EXP_LIMIT && !isExpTest()) {
        setTimeout(() => endPuzzleSession('full'), 500);
        return;
    }
    const active = getActiveAnimal();
    if (active && active.level >= MAX_LEVEL) {
        setTimeout(() => {
            stopTimer();
            isLocked = true;
            showAdultPopup(active);
        }, 600);
    }
}

function grantExpToActive(amount) {
    const active = getActiveAnimal();
    if (!active || active.level >= MAX_LEVEL) return;
    
    if (isExpTest()) {
        amount = amount * 100;
        dailyEatenToday = 0;
    }
    
    const allowed = DAILY_EXP_LIMIT - dailyEatenToday;
    if (allowed <= 0) return;
    const grant = Math.min(amount, allowed);
    dailyEatenToday += grant;
    active.exp += grant;
    sessionGainedExp += grant;

    while (active.level < MAX_LEVEL) {
        const need = LEVEL_EXP_TABLE[active.level];
        if (active.exp >= need) {
            active.exp -= need;
            active.level++;
            showLevelUpEffect(active);
            playLevelUpSound();
        } else break;
    }
    if (active.level >= MAX_LEVEL) active.exp = 0;
    saveState();
    updatePuzzleUI();
}

function showLevelUpEffect(animal) {
    if (!flyLayer) return;
    const popup = document.createElement('div');
    popup.className = 'score-popup combo';
    popup.textContent = 'Lv.' + animal.level + '!';
    popup.style.left = '50%';
    popup.style.top = '20%';
    popup.style.color = '#FFD700';
    flyLayer.appendChild(popup);
    setTimeout(() => popup.remove(), 1200);
}

function dropCropToField(cell, crop) {
    const farmEl = document.getElementById('puzzle-mini-farm');
    const dropsLayer = document.getElementById('dropped-crops-layer');
    if (!farmEl || !dropsLayer) return;

    const cellRect = cell.getBoundingClientRect();
    const dropsRect = dropsLayer.getBoundingClientRect();
    const startX = cellRect.left + cellRect.width / 2 - 13;
    const startY = cellRect.top + cellRect.height / 2 - 13;
    const padX = 20, padBottom = 8, padTop = 20;
    const dropAreaWidth = dropsRect.width - padX * 2;
    const dropAreaHeight = dropsRect.height - padBottom - padTop;
    const randXInLayer = padX + Math.random() * dropAreaWidth;
    const randYInLayer = padTop + Math.random() * dropAreaHeight;
    const endX = dropsRect.left + randXInLayer;
    const endY = dropsRect.top + randYInLayer;

    const flying = document.createElement('div');
    flying.className = 'flying-crop';
    flying.textContent = crop.emoji;
    flying.style.left = startX + 'px';
    flying.style.top = startY + 'px';
    document.body.appendChild(flying);

    requestAnimationFrame(() => {
        flying.style.left = endX + 'px';
        flying.style.top = endY + 'px';
        flying.style.transform = 'rotate(360deg)';
    });

    setTimeout(() => {
        flying.remove();
        const dropped = document.createElement('div');
        dropped.className = 'dropped-crop';
        dropped.textContent = crop.emoji;
        dropped.style.left = (randXInLayer - 11) + 'px';
        dropped.style.top = (randYInLayer - 11) + 'px';
        dropsLayer.appendChild(dropped);
        droppedCropQueue.push({ element: dropped, xInLayer: randXInLayer, yInLayer: randYInLayer });
        if (!animalIsMovingToFood) eatNextDroppedCrop();
    }, 600);
}

function eatNextDroppedCrop() {
    if (droppedCropQueue.length === 0) {
        animalIsMovingToFood = false;
        return;
    }
    animalIsMovingToFood = true;
    const next = droppedCropQueue.shift();
    const animal = document.getElementById('puzzle-active-spot');
    const dropsLayer = document.getElementById('dropped-crops-layer');
    if (!animal || !dropsLayer) {
        if (next.element) next.element.remove();
        animalIsMovingToFood = false;
        return;
    }

    const farmEl = document.getElementById('puzzle-mini-farm');
    const farmRect = farmEl.getBoundingClientRect();
    const dropsLayerTopInFarm = farmRect.height * 0.25;
    const targetXInFarm = next.xInLayer - 10;
    const targetYInFarm = dropsLayerTopInFarm + next.yInLayer;
    const targetBottom = farmRect.height - targetYInFarm - 20;

    if (targetXInFarm > activePosX) animal.style.transform = 'scaleX(1)';
    else if (targetXInFarm < activePosX) animal.style.transform = 'scaleX(-1)';

    activePosX = targetXInFarm;
    activePosY = Math.max(4, targetBottom);

    animal.classList.add('walking');
    animal.style.left = activePosX + 'px';
    animal.style.bottom = activePosY + 'px';

    setTimeout(() => {
        animal.classList.remove('walking');
        animal.classList.add('chewing');
        setTimeout(() => {
            animal.classList.remove('chewing');
            if (next.element) {
                next.element.classList.add('eaten');
                setTimeout(() => {
                    if (next.element && next.element.parentNode) next.element.remove();
                }, 250);
            }
            eatNextDroppedCrop();
        }, 1500);
    }, 2000);
}

function startActiveAnimalWandering() {
    stopActiveAnimalWandering();
    activeWanderInterval = setInterval(() => {
        if (!screenPuzzle.classList.contains('active')) return;
        if (animalIsMovingToFood) return;
        const animal = document.getElementById('puzzle-active-spot');
        const farmEl = document.getElementById('puzzle-mini-farm');
        if (!animal || !farmEl) return;

        const farmWidth = farmEl.clientWidth;
        const farmHeight = farmEl.clientHeight;
        const grassTopFromBottom = farmHeight * 0.75 - 30;
        const grassBottomFromBottom = 5;
        const targetX = 15 + Math.random() * (farmWidth - 50);
        const targetBottom = grassBottomFromBottom + Math.random() * (grassTopFromBottom - grassBottomFromBottom);

        if (Math.abs(targetX - activePosX) < 15 && Math.abs(targetBottom - activePosY) < 15) return;

        if (targetX > activePosX) animal.style.transform = 'scaleX(1)';
        else animal.style.transform = 'scaleX(-1)';

        activePosX = targetX;
        activePosY = targetBottom;

        animal.classList.add('walking');
        animal.style.left = targetX + 'px';
        animal.style.bottom = targetBottom + 'px';

        setTimeout(() => {
            if (animal) animal.classList.remove('walking');
        }, 2500);
    }, 5000);
}

function stopActiveAnimalWandering() {
    if (activeWanderInterval) {
        clearInterval(activeWanderInterval);
        activeWanderInterval = null;
    }
}

function spawnParticles(cell) {
    if (!cell || !flyLayer) return;
    const cellRect = cell.getBoundingClientRect();
    const wrap = flyLayer.getBoundingClientRect();
    const cx = cellRect.left - wrap.left + cellRect.width / 2 - 4;
    const cy = cellRect.top - wrap.top + cellRect.height / 2 - 4;
    for (let i = 0; i < 6; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const angle = (Math.PI * 2 * i) / 6;
        const dist = 25 + Math.random() * 15;
        p.style.left = cx + 'px';
        p.style.top = cy + 'px';
        p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
        p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
        const cols = ['#FFD700', '#FFAA00', '#FF8C42', '#FFEC8B'];
        p.style.background = cols[Math.floor(Math.random() * cols.length)];
        flyLayer.appendChild(p);
        setTimeout(() => p.remove(), 700);
    }
}

function showScorePopup(matchPos, expGain, multiplier) {
    if (!matchPos || !flyLayer) return;
    const cell = boardElement.children[matchPos.row * BOARD_SIZE + matchPos.col];
    if (!cell) return;
    const cellRect = cell.getBoundingClientRect();
    const wrap = flyLayer.getBoundingClientRect();
    const cx = cellRect.left - wrap.left + cellRect.width / 2;
    const cy = cellRect.top - wrap.top + cellRect.height / 2;

    const popup = document.createElement('div');
    popup.className = 'score-popup';
    if (multiplier >= 2) popup.classList.add('combo');
    popup.textContent = '+' + expGain;
    popup.style.left = cx + 'px';
    popup.style.top = cy + 'px';
    flyLayer.appendChild(popup);
    setTimeout(() => popup.remove(), 1000);
}

function dropDown() {
    for (let col = 0; col < BOARD_SIZE; col++) {
        for (let row = BOARD_SIZE - 1; row >= 0; row--) {
            if (board[row][col] === null) {
                for (let above = row - 1; above >= 0; above--) {
                    if (board[above][col] !== null) {
                        board[row][col] = board[above][col];
                        board[above][col] = null;
                        break;
                    }
                }
            }
        }
    }
}

function fillEmpty() {
    const crops = getCurrentCrops();
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (board[row][col] === null) {
                board[row][col] = crops[Math.floor(Math.random() * crops.length)];
            }
        }
    }
}

function endPuzzleSession(reason) {
    stopTimer();
    stopActiveAnimalWandering();
    stopBGM();
    isLocked = true;
    const dropsLayer = document.getElementById('dropped-crops-layer');
    if (dropsLayer) dropsLayer.innerHTML = '';
    droppedCropQueue = [];
    animalIsMovingToFood = false;
    showResultScreen(reason);
}

function showResultScreen(reason) {
    showScreen('result');
    const emojiEl = document.getElementById('result-screen-emoji');
    const titleEl = document.getElementById('result-screen-title');

    if (reason === 'timeout') {
        emojiEl.textContent = '⏰';
        titleEl.textContent = '시간 종료!';
    } else if (reason === 'full') {
        emojiEl.textContent = '🍽️';
        titleEl.textContent = '오늘 다 먹었어요!';
    } else if (reason === 'exit') {
        emojiEl.textContent = '👋';
        titleEl.textContent = '게임 종료';
    }

    document.getElementById('stat-matches').textContent = sessionMatches;
    document.getElementById('stat-combo').textContent = sessionMaxCombo;
    document.getElementById('stat-exp').textContent = sessionGainedExp.toLocaleString();

    const active = getActiveAnimal();
    if (active) {
        document.getElementById('result-animal-name').textContent = active.name;
        document.getElementById('result-from-lv').textContent = sessionStartLevel;
        document.getElementById('result-to-lv').textContent = active.level;
    }
}

function confirmExitPuzzle() {
    document.getElementById('exit-overlay').classList.add('active');
}

function closeExit() {
    document.getElementById('exit-overlay').classList.remove('active');
}

function exitToMain() {
    document.getElementById('exit-overlay').classList.remove('active');
    endPuzzleSession('exit');
}

function showAdultPopup(animal) {
    isLocked = true;
    stopTimer();
    const s = STAGES[animal.stage];
    document.getElementById('modal-emoji').textContent = s.adultEmoji;
    document.getElementById('modal-title').textContent =
        animal.name + '(이)가 ' + s.adultName + '(으)로 다 자랐어요!';
    document.getElementById('modal-animal-name').textContent = animal.name;

    const companionBtn = document.getElementById('btn-companion');
    if (farmAnimals.length >= MAX_FARM_SLOTS) {
        companionBtn.disabled = true;
        companionBtn.textContent = '🤝 (농장 꽉 참)';
    } else {
        companionBtn.disabled = false;
        companionBtn.textContent = '🤝 농장에서 같이 살기';
    }

    const upgradeBtn = document.getElementById('btn-upgrade');
    if (s.nextStage === null) {
        upgradeBtn.disabled = true;
        upgradeBtn.textContent = '⛔ 최종 단계';
    } else {
        upgradeBtn.disabled = false;
        const ns = STAGES[s.nextStage];
        upgradeBtn.textContent = '⬆️ ' + ns.babyName + '(으)로 승급';
    }

    document.getElementById('modal-overlay').dataset.targetId = animal.id;
    document.getElementById('modal-overlay').classList.add('active');
}

function chooseCompanion() {
    closeAdultModal();
    activeAnimalId = null;
    saveState();
    if (screenPuzzle.classList.contains('active')) endPuzzleSession('timeout');
    else renderBigFarm();
}

function chooseUpgrade() {
    const id = document.getElementById('modal-overlay').dataset.targetId;
    const animal = farmAnimals.find(a => a.id === id);
    if (!animal) return;
    const s = STAGES[animal.stage];
    if (!s.nextStage) return;
    animal.stage = s.nextStage;
    animal.level = 1;
    animal.exp = 0;
    saveState();
    closeAdultModal();
    activeAnimalId = animal.id;
    saveState();
    if (screenPuzzle.classList.contains('active')) endPuzzleSession('timeout');
    else renderBigFarm();
}

function chooseRoulette() {
    closeAdultModal();
    showRoulette();
}

function closeAdultModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    isLocked = false;
}

function showRoulette() {
    const id = document.getElementById('modal-overlay').dataset.targetId;
    const animal = farmAnimals.find(a => a.id === id);
    if (!animal) return;
    document.getElementById('roulette-overlay').dataset.targetId = id;

    currentRewards = REWARDS[animal.stage];
    chosenRewardIndex = -1;

    const wrap = document.querySelector('.roulette-wrapper');
    if (!wrap) return;
    const old = wrap.querySelector('.roulette-svg');
    if (old) old.remove();

    const size = 300, cx = 150, cy = 150;
    const radius = 146;
    const totalW = currentRewards.reduce((sum, r) => sum + r.weight, 0);
    const segAngle = 360 / currentRewards.length;
    const colors = ['#FFE9B0', '#FFB997', '#FFD988', '#FFCDB2', '#F5C156', '#FFC8A2'];

    let svg = `<svg class="roulette-svg" id="roulette-svg" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;

    currentRewards.forEach((reward, i) => {
        const sa = i * segAngle - 90;
        const ea = (i + 1) * segAngle - 90;
        const sr = (sa * Math.PI) / 180;
        const er = (ea * Math.PI) / 180;
        const x1 = cx + radius * Math.cos(sr);
        const y1 = cy + radius * Math.sin(sr);
        const x2 = cx + radius * Math.cos(er);
        const y2 = cy + radius * Math.sin(er);
        const large = segAngle > 180 ? 1 : 0;
        const pd = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
        svg += `<path d="${pd}" fill="${colors[i % colors.length]}" stroke="#6B4423" stroke-width="1"/>`;

        const prob = Math.round((reward.weight / totalW) * 100);
        const ma = sa + segAngle / 2;
        const mr = (ma * Math.PI) / 180;
        const tr = radius * 0.65;
        const tx = cx + tr * Math.cos(mr);
        const ty = cy + tr * Math.sin(mr);
        const rot = ma + 90;

        svg += `<g transform="translate(${tx} ${ty}) rotate(${rot})">
            <text text-anchor="middle" y="-12" font-size="22">${reward.emoji}</text>
            <text text-anchor="middle" y="6" font-size="10" font-weight="bold" fill="#6B4423">${reward.label}</text>
            <text text-anchor="middle" y="20" font-size="11" font-weight="bold" fill="#FF6B35">${prob}%</text>
        </g>`;
    });
    svg += `<circle cx="${cx}" cy="${cy}" r="14" fill="#6B4423"/>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="8" fill="#FFD700"/></svg>`;
    wrap.insertAdjacentHTML('beforeend', svg);

    document.getElementById('btn-spin').disabled = false;
    document.getElementById('btn-spin').textContent = '룰렛 돌리기!';
    document.getElementById('roulette-overlay').classList.add('active');
}

function spinRoulette() {
    if (chosenRewardIndex !== -1) return;
    const totalW = currentRewards.reduce((sum, r) => sum + r.weight, 0);
    let rnd = Math.random() * totalW;
    for (let i = 0; i < currentRewards.length; i++) {
        rnd -= currentRewards[i].weight;
        if (rnd <= 0) { chosenRewardIndex = i; break; }
    }
    const segAngle = 360 / currentRewards.length;
    const target = chosenRewardIndex * segAngle + segAngle / 2;
    const totalRot = 360 * 5 + (360 - target);
    const r = document.getElementById('roulette-svg');
    r.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.21, 1)';
    r.style.transform = 'rotate(' + totalRot + 'deg)';
    document.getElementById('btn-spin').disabled = true;
    document.getElementById('btn-spin').textContent = '돌아가는 중...';
    setTimeout(() => showPrize(), 4200);
}

function showPrize() {
    const reward = currentRewards[chosenRewardIndex];
    const id = document.getElementById('roulette-overlay').dataset.targetId;
    const animal = farmAnimals.find(a => a.id === id);

    document.getElementById('prize-emoji').textContent = reward.emoji;

    if (reward.type === 'miss') {
        document.getElementById('prize-title').textContent = '아쉽지만 꽝!';
        document.getElementById('prize-label').textContent = '다음 기회를 노려보세요';
        document.getElementById('prize-desc').textContent = '';
    } else {
        document.getElementById('prize-title').textContent = '🎉 축하합니다!';
        document.getElementById('prize-label').textContent = reward.label;
        if (reward.type === 'coupon') {
            document.getElementById('prize-desc').textContent = '쿠폰은 스마트스토어에서\n일괄 발급됩니다.';
        } else if (reward.type === 'product') {
            document.getElementById('prize-desc').textContent = '실물 상품 당첨!\n별도 연락드릴게요.';
        }
    }

    if (animal) {
        if (reward.type !== 'miss') recordWinToBackend(animal, reward);
        farmAnimals = farmAnimals.filter(a => a.id !== animal.id);
        if (activeAnimalId === animal.id) activeAnimalId = null;
        saveState();
    }

    document.getElementById('roulette-overlay').classList.remove('active');
    document.getElementById('prize-overlay').classList.add('active');
}

function closePrize() {
    document.getElementById('prize-overlay').classList.remove('active');
    chosenRewardIndex = -1;
    if (screenPuzzle.classList.contains('active')) endPuzzleSession('timeout');
    else renderBigFarm();
}

function closeNoHeart() { document.getElementById('no-heart-overlay').classList.remove('active'); }
function closeFull() { document.getElementById('full-overlay').classList.remove('active'); }
function openSettings() { document.getElementById('settings-overlay').classList.add('active'); }
function closeSettings() { document.getElementById('settings-overlay').classList.remove('active'); }

function confirmReset() {
    if (confirm('정말 모든 데이터를 초기화할까요?\n농장 동물, 진행도가 모두 사라집니다.')) {
        resetAllData();
    }
}

async function bootGame() {
    const localOk = loadLocalState();
    const serverData = await loadFromBackend();
    if (serverData) {
        farmAnimals = serverData.farmAnimals || [];
        activeAnimalId = serverData.activeAnimalId || null;
        hearts = serverData.hearts !== undefined ? serverData.hearts : 3;
        dailyEatenToday = serverData.dailyEatenToday || 0;
        lastResetDate = serverData.lastResetDate || '';
        console.log('✅ 서버 데이터 복원');
    }

    checkDailyReset();
    createStars();
    updateSkyByTime();
    setInterval(updateSkyByTime, 60000);

    if ((!localOk && !serverData) || farmAnimals.length === 0) {
        showScreen('main');
        renderBigFarm();
        startBigFarmWandering();
        startFirstTime();
    } else {
        enterMain();
    }
}

function init() {
    loadSoundSetting();
    
    const savedUser = localStorage.getItem('pangpang-user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            console.log('💾 로그인 복원:', currentUser);
            afterLogin();
        } catch (e) {
            showScreen('login');
        }
    } else {
        showScreen('login');
    }

    setTimeout(() => initNaverLogin(), 500);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}