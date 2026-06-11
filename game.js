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
        flushBackendSave();
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
// 백엔드 연동 (타임아웃 + 재시도 공통 레이어)
// ============================================
const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbyLv8diy8EwsdaNl_lkEza3U2gkHqudkrxzVMPC_VM9tOhcovikesaK-E3frY-77JA/exec';

const API_TIMEOUT_MS = 12000;   // GAS 콜드스타트 감안
const SAVE_DEBOUNCE_MS = 2500;  // 잦은 saveState 호출을 묶어서 전송

// 테스트 모드: 'EXP', '하트', 'EXP하트', '' 중 하나 (서버 mode 열에서 내려옴)
let testMode = '';

function getUserId() { return currentUser ? currentUser.id : null; }
function getUserName() { return currentUser ? currentUser.name : '게스트'; }
function isExpTest() { return testMode === 'EXP' || testMode === 'EXP하트'; }
function isHeartTest() { return testMode === '하트' || testMode === 'EXP하트'; }

// POST 공통 호출: 타임아웃 + 자동 재시도 + JSON 검증
async function apiCall(payload, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
        try {
            const res = await fetch(BACKEND_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timer);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const json = await res.json();
            if (!json || typeof json !== 'object') throw new Error('invalid response');
            return json;
        } catch (e) {
            clearTimeout(timer);
            console.warn(`API 호출 실패 (${attempt + 1}/${retries + 1})`, e);
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
            }
        }
    }
    return null; // 모든 재시도 실패
}

// GET 공통 호출
async function apiGet(params, retries = 2) {
    const qs = Object.entries(params)
        .map(([k, v]) => k + '=' + encodeURIComponent(v))
        .join('&');
    const url = BACKEND_URL + '?' + qs;

    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
        try {
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const json = await res.json();
            if (!json || typeof json !== 'object') throw new Error('invalid response');
            return json;
        } catch (e) {
            clearTimeout(timer);
            console.warn(`API 호출 실패 (${attempt + 1}/${retries + 1})`, e);
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
            }
        }
    }
    return null;
}

// ---- 디바운스 저장: saveState가 아무리 자주 불려도 백엔드 전송은 묶어서 ----
let saveDebounceTimer = null;
let pendingState = null;
let saveFailNotified = false;

function scheduleBackendSave(state) {
    pendingState = state;
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => flushBackendSave(), SAVE_DEBOUNCE_MS);
}

async function flushBackendSave() {
    if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
        saveDebounceTimer = null;
    }
    if (!pendingState) return;
    const uid = getUserId();
    if (!uid) { pendingState = null; return; }

    const state = pendingState;
    pendingState = null;

    const json = await apiCall({
        action: 'save',
        userId: uid,
        name: getUserName(),
        email: (currentUser && currentUser.email) || '',
        data: state
    }, 1);

    if (!json || !json.ok) {
        // 실패: 최신 상태가 그 사이에 안 생겼으면 되돌려놓고 나중에 재시도
        if (!pendingState) pendingState = state;
        if (!saveFailNotified) {
            saveFailNotified = true;
            showToast('⚠️ 서버 저장이 지연되고 있어요. 자동으로 다시 시도할게요.');
        }
        setTimeout(() => flushBackendSave(), 10000);
    } else {
        saveFailNotified = false;
        console.log('💾 백엔드 저장 완료');
    }
}

// 페이지를 떠날 때 미전송분 마지막 전송 시도
window.addEventListener('beforeunload', () => {
    if (pendingState && getUserId() && navigator.sendBeacon) {
        navigator.sendBeacon(BACKEND_URL, JSON.stringify({
            action: 'save',
            userId: getUserId(),
            name: getUserName(),
            email: (currentUser && currentUser.email) || '',
            data: pendingState
        }));
        pendingState = null;
    }
});

async function loadFromBackend() {
    const uid = getUserId();
    if (!uid) return { ok: false };

    const json = await apiGet({ action: 'load', userId: uid });
    if (!json) return { ok: false, networkError: true };

    console.log('📥 백엔드 불러옴:', json);

    if (json.mode === 'EXP' || json.mode === '하트' || json.mode === 'EXP하트' || json.mode === '테스트') {
        testMode = json.mode === '테스트' ? 'EXP하트' : json.mode;
        console.log('🧪 테스트 모드:', testMode);
    } else {
        testMode = '';
    }

    // 서버 데이터 형식 검증 후에만 사용
    if (json.ok && json.data && typeof json.data === 'object' && Array.isArray(json.data.farmAnimals)) {
        return { ok: true, data: json.data };
    }
    return { ok: true, data: null };
}

// ============================================
// 로딩 / 토스트 UI
// ============================================
function showLoading(msg) {
    const overlay = document.getElementById('loading-overlay');
    const text = document.getElementById('loading-text');
    if (text) text.textContent = msg || '불러오는 중...';
    if (overlay) overlay.classList.add('active');
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('active');
}

function showToast(msg) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

function showConnectionError() {
    const overlay = document.getElementById('conn-error-overlay');
    if (overlay) overlay.classList.add('active');
}

function retryBoot() {
    const overlay = document.getElementById('conn-error-overlay');
    if (overlay) overlay.classList.remove('active');
    bootGame();
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

// ⚠️ 중요: 이 배열의 "순서"는 서버(Code.gs)의 REWARDS와 반드시 동일해야 합니다.
// 추첨 자체는 서버에서 하고, 클라이언트는 룰렛 그림과 멈출 위치(인덱스) 표시에만 사용합니다.
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
// 마인크래프트 스타일 픽셀 스프라이트 (v0.9.1)
// 이모지 대신 SVG 픽셀아트로 캐릭터/작물 렌더링
// ============================================
const SPRITES = {
    // ---- 동물 (마인크래프트 몹 얼굴 스타일, 정면) ----
    chick: {
        p: { Y: '#FFD93B', D: '#E0A800', K: '#1A1A1A', W: '#FFFFFF', O: '#FF8C00' },
        g: [
            '................',
            '..YYYYYYYYYYYY..',
            '..YYYYYYYYYYYY..',
            '..YYYYYYYYYYYY..',
            '..YWWKYYYYKWWY..',
            '..YWWKYYYYKWWY..',
            '..YYYYYYYYYYYY..',
            '..YYYYOOOOYYYY..',
            '..YYYYOOOOYYYY..',
            '..YYYYYYYYYYYY..',
            '..YYYYYYYYYYYY..',
            '..YDYYYYYYYYDY..',
            '..YDDYYYYYYDDY..',
            '..YYYYYYYYYYYY..',
            '................'
        ]
    },
    chicken: {
        p: { W: '#F7F7F7', S: '#DCDCDC', R: '#D63B3B', O: '#FFB300', K: '#1A1A1A' },
        g: [
            '....RRRRRRRR....',
            '..WWWWWWWWWWWW..',
            '..WWWWWWWWWWWW..',
            '..WWWWWWWWWWWW..',
            '..WKKWWWWWWKKW..',
            '..WKKWWWWWWKKW..',
            '..WWWWWWWWWWWW..',
            '..WWWWOOOOWWWW..',
            '..WWWWOOOOWWWW..',
            '..WWWWRRRRWWWW..',
            '..WWWWRRRRWWWW..',
            '..WWWWWWWWWWWW..',
            '..WSWWWWWWWWSW..',
            '..WSSWWWWWWSSW..',
            '................'
        ]
    },
    piglet: {
        p: { P: '#FFAFC0', S: '#F08CA4', N: '#C9536F', K: '#1A1A1A', W: '#FFFFFF' },
        g: [
            '................',
            '..PPPPPPPPPPPP..',
            '..PPPPPPPPPPPP..',
            '..PPPPPPPPPPPP..',
            '..PWWKPPPPKWWP..',
            '..PWWKPPPPKWWP..',
            '..PPPPPPPPPPPP..',
            '..PPPSSSSSSPPP..',
            '..PPPSNSSNSPPP..',
            '..PPPSSSSSSPPP..',
            '..PPPPPPPPPPPP..',
            '..PPPPPPPPPPPP..',
            '..PPPPPPPPPPPP..',
            '................'
        ]
    },
    pig: {
        p: { P: '#F2A0B0', S: '#D87B93', N: '#A6435C', K: '#1A1A1A', W: '#FFFFFF' },
        g: [
            '................',
            '..PPPPPPPPPPPP..',
            '..PPPPPPPPPPPP..',
            '..PWWKPPPPKWWP..',
            '..PWWKPPPPKWWP..',
            '..PPPPPPPPPPPP..',
            '..PPSSSSSSSSPP..',
            '..PPSNSSSSNSPP..',
            '..PPSNSSSSNSPP..',
            '..PPSSSSSSSSPP..',
            '..PPPPPPPPPPPP..',
            '..PPPPPPPPPPPP..',
            '..PPPPPPPPPPPP..',
            '................'
        ]
    },
    calf: {
        p: { B: '#8A5A3B', S: '#EFD3BC', N: '#8A5A44', K: '#1A1A1A', W: '#FFFFFF' },
        g: [
            '................',
            '..BBBBBBBBBBBB..',
            '..BBBBBBBBBBBB..',
            '..BWWKBBBBKWWB..',
            '..BWWKBBBBKWWB..',
            '..BBBBBBBBBBBB..',
            '..BBBBBBBBBBBB..',
            '..SSSSSSSSSSSS..',
            '..SNNSSSSSSNNS..',
            '..SSSSSSSSSSSS..',
            '..SSSSSSSSSSSS..',
            '................'
        ]
    },
    cow: {
        p: { B: '#5C4033', G: '#C9C9C9', S: '#E8C8B0', N: '#8A5A44', K: '#1A1A1A', W: '#FFFFFF' },
        g: [
            '.GG..........GG.',
            '.GBBBBBBBBBBBBG.',
            '..BBBBBBBBBBBB..',
            '..BWWKBBBBKWWB..',
            '..BWWKBBBBKWWB..',
            '..BBBBBBBBBBBB..',
            '..BBBBBBBBBBBB..',
            '..SSSSSSSSSSSS..',
            '..SNNSSSSSSNNS..',
            '..SSSSSSSSSSSS..',
            '..SSSSSSSSSSSS..',
            '................'
        ]
    },
    // ---- 작물 ----
    apple: {
        p: { R: '#E53935', D: '#B71C1C', T: '#6D4C41', L: '#4CAF50', W: '#FFCDD2' },
        g: [
            '......T.........',
            '......T.LL......',
            '.....T.LLLL.....',
            '...RRRRRRRR.....',
            '..RRRRRRRRRR....',
            '.RRWWRRRRRRRR...',
            '.RRWRRRRRRRRR...',
            '.RRRRRRRRRRRR...',
            '.RRRRRRRRRRRR...',
            '.RRRRRRRRRRRD...',
            '..RRRRRRRRRDD...',
            '...RRRRRRRDD....',
            '....RRRRRRD.....'
        ]
    },
    banana: {
        p: { Y: '#FFD93B', D: '#E0A800', T: '#7A5230' },
        g: [
            '...........T....',
            '..........YY....',
            '.........YYY....',
            '........YYYY....',
            '.......YYYY.....',
            '......YYYY......',
            '....YYYYY.......',
            '..YYYYYY........',
            '.YYYYYD.........',
            '.YYYDD..........',
            '.TDD............'
        ]
    },
    tomato: {
        p: { R: '#E53935', D: '#B71C1C', G: '#2E7D32', W: '#FFCDD2' },
        g: [
            '.....G..G.......',
            '....GGGGGG......',
            '...RRGGGGRR.....',
            '..RRRRRRRRRR....',
            '.RRRRRRRRRRRR...',
            '.RRWRRRRRRRRR...',
            '.RRRRRRRRRRRR...',
            '.RRRRRRRRRRRR...',
            '..RRRRRRRRRD....',
            '...RRRRRRRDD....',
            '....RRRRRR......'
        ]
    },
    corn: {
        p: { Y: '#FFD93B', D: '#E8B400', G: '#4CAF50', E: '#2E7D32' },
        g: [
            '......YYY.......',
            '.....YDYDY......',
            '.....YYDYY......',
            '.....YDYDY......',
            '.....YYDYY......',
            '.....YDYDY......',
            '....GYYDYYG.....',
            '....GGYDYGG.....',
            '....GEGGGEG.....',
            '.....GEGEG......',
            '......GEG.......'
        ]
    },
    cucumber: {
        p: { G: '#43A047', D: '#2E7D32', W: '#A5D6A7' },
        g: [
            '......DD........',
            '.....GGGG.......',
            '.....GWGG.......',
            '.....GWGG.......',
            '.....GWGG.......',
            '.....GWGG.......',
            '.....GWGG.......',
            '.....GGGG.......',
            '.....GGGD.......',
            '......GGD.......'
        ]
    },
    eggplant: {
        p: { P: '#7B1FA2', D: '#4A148C', G: '#388E3C', W: '#CE93D8' },
        g: [
            '.......GG.......',
            '......GGGG......',
            '.....GGGGG......',
            '.....PPPPP......',
            '....PPPPPPP.....',
            '....PPWPPPP.....',
            '....PPPPPPPP....',
            '.....PPPPPPP....',
            '.....PPPPPPD....',
            '......PPPPDD....',
            '.......PPDD.....'
        ]
    },
    onion: {
        p: { O: '#E0B080', D: '#B98C5A', G: '#7CB342' },
        g: [
            '.......G........',
            '......GG........',
            '......OO........',
            '....OOOOOO......',
            '...OODOODOO.....',
            '..OODOODOODO....',
            '..OODOODOODO....',
            '..OODOODOODO....',
            '...OODOODOO.....',
            '....OOOOOO......',
            '.....OOOO.......'
        ]
    },
    grape: {
        p: { P: '#8E44AD', D: '#6C3483', G: '#388E3C', T: '#6D4C41' },
        g: [
            '.......T........',
            '......GGT.......',
            '.....GGG........',
            '....PP.PP.......',
            '...PPPPPPP......',
            '...PPDPPDP......',
            '....PPPPP.......',
            '...PPDPPPP......',
            '....PPPDP.......',
            '.....PPP........',
            '......P.........'
        ]
    },
    garlic: {
        p: { W: '#F5F0E1', D: '#D9CFB5', G: '#7CB342' },
        g: [
            '.......G........',
            '......WW........',
            '.....WWWW.......',
            '....WWWWWW......',
            '...WWDWWDWW.....',
            '...WWDWWDWW.....',
            '...WWDWWDWW.....',
            '....WWWWWW......',
            '.....WWWW.......'
        ]
    },
    // ---- 배틀용 돌멩이 (코블스톤) ----
    stone: {
        p: { G: '#9E9E9E', D: '#757575', L: '#BDBDBD', K: '#616161' },
        g: [
            '................',
            '..GGGGGDDGGGGG..',
            '..GLLGGGDDGGLG..',
            '..GLGGDDGGGGGG..',
            '..GGGGDKDGGLLG..',
            '..GDDGGDGGGLGG..',
            '..GGDDGGGDDGGG..',
            '..GLGGGGGDKDGG..',
            '..GLLGGDGGDGGG..',
            '..GGGGDDGGGGLG..',
            '..GGDGGGGLLGGG..',
            '..GGDDGGGLGGGG..',
            '..GGGGGGGGGGGG..',
            '................'
        ]
    },
    // ---- 로고용 잔디 블록 ----
    grassblock: {
        p: { G: '#6FBF44', H: '#5DA838', B: '#8A5A3B', D: '#6E4128', L: '#9C6B47' },
        g: [
            'GHGGHGGGHGGHGGGH',
            'GGHGGHGGGHGGHGGG',
            'HGGHGGHGGGHGGHGG',
            'BBDBBBLBBDBBBLBB',
            'BLBBDBBBLBBDBBBL',
            'BBBLBBDBBBLBBBDB',
            'BDBBBLBBBDBBLBBB',
            'BBLBBBDBBBLBBBDB',
            'BBBDBBBLBBBDBBBL',
            'BLBBBDBBLBBBDBBB',
            'BBDBBBLBBBDBBBLB',
            'BBBLBBBDBBBLBBBD',
            'BDBBLBBBDBBLBBBB',
            'BBBDBBBLBBBDBBLB',
            'BLBBBDBBBLBBBDBB',
            'BBBLBBDBBBLBBBDB'
        ]
    }
};

const _spriteCache = {};

function spriteURI(name) {
    if (_spriteCache[name]) return _spriteCache[name];
    const s = SPRITES[name];
    if (!s) return '';
    const rows = s.g;
    const h = rows.length;
    const w = Math.max(...rows.map(r => r.length));
    let rects = '';
    for (let y = 0; y < h; y++) {
        const row = rows[y];
        let x = 0;
        while (x < row.length) {
            const ch = row[x];
            if (ch === '.' || ch === ' ') { x++; continue; }
            let x2 = x + 1;
            while (x2 < row.length && row[x2] === ch) x2++; // 가로 연속 픽셀 병합
            rects += `<rect x="${x}" y="${y}" width="${x2 - x}" height="1" fill="${s.p[ch]}"/>`;
            x = x2;
        }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`;
    const uri = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    _spriteCache[name] = uri;
    return uri;
}

function spriteTag(name, cls = '') {
    return `<img class="pix${cls ? ' ' + cls : ''}" src="${spriteURI(name)}" alt="${name}" draggable="false">`;
}

function animalSpriteName(animal) {
    const adult = animal.level >= MAX_LEVEL;
    if (animal.stage === 'chicken') return adult ? 'chicken' : 'chick';
    if (animal.stage === 'pig') return adult ? 'pig' : 'piglet';
    return adult ? 'cow' : 'calf';
}

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
let serverReward = null;      // 서버가 결정해서 내려준 보상
let spinInProgress = false;   // 룰렛 중복 클릭 방지
let activeWanderInterval = null;

// ---- 배틀 상태 ----
let battleMode = false;
let battleId = null;
let battleRole = null;          // 'p1' | 'p2'
let battleOppName = '';
let battleScore = 0;            // 내 매치 수
let battleAttacksSent = 0;      // 내가 보낸 돌멩이 누적
let battleAttacksApplied = 0;   // 상대가 보낸 돌멩이 중 이미 적용한 누적
let battleOppScore = 0;
let battleFinished = false;
let battleIsBot = false;
let battlePollTimer = null;
let botState = null;
let botTickTimer = null;
let mmPollTimer = null;
let mmActive = false;
let mmStartTs = 0;

const STONE = { id: 'stone', emoji: '🪨', name: '돌멩이' };
const BATTLE_CROP_IDS = ['apple', 'banana', 'tomato', 'corn', 'cucumber', 'eggplant'];
const BATTLE_TIME = 90;
const MM_BOT_FALLBACK_MS = 10000;  // 10초 안에 상대 없으면 봇
const BATTLE_POLL_MS = 2500;

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
    scheduleBackendSave(state);
}

// 중요한 순간(승급, 룰렛, 게임 종료 등)에는 디바운스 없이 즉시 전송
function saveStateNow() {
    saveState();
    flushBackendSave();
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
        el.innerHTML = spriteTag(animalSpriteName(animal));

        if (animal.posX === undefined || animal.posX < 20 || animal.posX > farmWidth - 60) {
            animal.posX = 30 + (idx * 70) % (farmWidth - 80);
        }
        if (animal.posY === undefined || animal.posY < grassTop || animal.posY > grassBottom) {
            animal.posY = grassTop + 20 + Math.random() * (grassBottom - grassTop - 40);
        }

        el.style.left = animal.posX + 'px';
        el.style.top = animal.posY + 'px';
        el.style.transform = 'scaleX(1)'; // 정면 스프라이트: 반전 시 이름표가 거울 글씨가 되므로 고정

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

            el.style.transform = 'scaleX(1)';
            el.style.left = targetX + 'px';
            el.style.top = targetY + 'px';
            el.classList.add('walking');
            setTimeout(() => el.classList.remove('walking'), 3000);
        });
        // 위치 변화는 로컬에만 저장 (백엔드 전송은 디바운스가 알아서 묶음)
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
    saveStateNow();

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
        animalEl.innerHTML = spriteTag(animalSpriteName(active));
        if (active.level >= MAX_LEVEL) animalEl.classList.add('adult');
        else animalEl.classList.remove('adult');
    }

    const emojiMini = document.getElementById('active-emoji-mini');
    if (emojiMini) emojiMini.innerHTML = spriteTag(animalSpriteName(active));

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

    if (battleMode) {
        battleScore += Math.ceil(targetCells.length / 2);
        sendBattleAttack(Math.max(1, Math.floor(targetCells.length / 3)));
        updateBattlePanel();
    }
    
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
        target.innerHTML = spriteTag(crop.id, 'inline-pix') + ' 폭파!';
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
        if (puzzleTimer <= 0) {
            if (battleMode) finishBattle();
            else endPuzzleSession('timeout');
        }
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
    if (battleMode && seconds > 0) return; // 배틀은 공정성을 위해 시간 추가 없음 (힌트 비용 차감은 허용)
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
    const isStone = (r, c) => board[r] && board[r][c] && board[r][c].id === 'stone';
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (isStone(row, col)) continue; // 돌멩이는 움직일 수 없으니 힌트 제외
            if (col < BOARD_SIZE - 1 && !isStone(row, col + 1)) {
                swap(row, col, row, col + 1);
                const matches = findMatches();
                swap(row, col, row, col + 1);
                if (matches.length > 0) results.push([{row, col}, {row, col: col + 1}]);
            }
            if (row < BOARD_SIZE - 1 && !isStone(row + 1, col)) {
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
    if (battleMode) return ALL_CROPS.filter(c => BATTLE_CROP_IDS.includes(c.id));
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
                cell.innerHTML = spriteTag(crop.id);
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

    // 돌멩이는 선택할 수 없음
    if (board[row][col] && board[row][col].id === 'stone') {
        if (selectedCell !== null) {
            highlightCell(selectedCell.row, selectedCell.col, false);
            selectedCell = null;
        }
        return;
    }

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
    const same = (a, b) => a && b && a.id === b.id && a.id !== 'stone';

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

    // 배틀: 매치 1회 = 상대에게 돌멩이 1개 (3콤보 이상은 +1)
    if (battleMode) {
        battleScore++;
        sendBattleAttack(comboCount >= 3 ? 2 : 1);
        updateBattlePanel();
    }

    // 매치에 인접한 돌멩이는 같이 파괴
    const stoneClears = [];
    if (battleMode) {
        const stoneSeen = new Set();
        matches.forEach(({row, col}) => {
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
                const r = row + dr, c = col + dc;
                if (r < 0 || c < 0 || r >= BOARD_SIZE || c >= BOARD_SIZE) return;
                const k = r + '-' + c;
                if (stoneSeen.has(k)) return;
                if (board[r][c] && board[r][c].id === 'stone') {
                    stoneSeen.add(k);
                    stoneClears.push({ row: r, col: c });
                    const cell = boardElement.children[r * BOARD_SIZE + c];
                    if (cell) cell.classList.add('matching');
                }
            });
        });
    }
    
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
        stoneClears.forEach(({row, col}) => { board[row][col] = null; });
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
    if (battleMode) return; // 배틀은 타이머 종료로만 끝남
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
    if (battleMode) return; // 배틀에서는 EXP 없음
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
    if (battleMode) return; // 배틀에서는 미니 농장 없음
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
    flying.innerHTML = spriteTag(crop.id);
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
        dropped.innerHTML = spriteTag(crop.id);
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
    popup.textContent = battleMode ? '🪨 +1' : '+' + expGain;
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
    saveStateNow();  // 세션 종료 시 진행도 즉시 서버 저장
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
    if (battleMode) { forfeitBattle(); return; }
    endPuzzleSession('exit');
}

function showAdultPopup(animal) {
    isLocked = true;
    stopTimer();
    const s = STAGES[animal.stage];
    const adultSprite = animal.stage === 'chicken' ? 'chicken' : animal.stage === 'pig' ? 'pig' : 'cow';
    document.getElementById('modal-emoji').innerHTML = spriteTag(adultSprite);
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
    saveStateNow();
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
    closeAdultModal();
    activeAnimalId = animal.id;
    saveStateNow();
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
    serverReward = null;
    spinInProgress = false;

    // ⚠️ 룰렛을 열기 전, 최신 농장 상태(다 자란 동물 포함)를 서버에 먼저 반영
    // 서버 추첨이 서버에 저장된 데이터로 동물을 검증하기 때문
    flushBackendSave();

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

// ============================================
// 룰렛: 추첨은 서버에서, 클라이언트는 연출만
// ============================================
async function spinRoulette() {
    if (spinInProgress || chosenRewardIndex !== -1) return;

    const overlay = document.getElementById('roulette-overlay');
    const id = overlay.dataset.targetId;
    const animal = farmAnimals.find(a => a.id === id);
    if (!animal) {
        alert('동물 정보를 찾을 수 없어요. 농장으로 돌아가서 다시 시도해주세요.');
        return;
    }

    spinInProgress = true;
    const btn = document.getElementById('btn-spin');
    btn.disabled = true;
    btn.textContent = '🎲 추첨 중...';

    // 룰렛 열 때 보낸 저장이 도착할 시간 확보 후 서버 추첨 요청
    const json = await apiCall({
        action: 'spin',
        userId: getUserId(),
        name: getUserName(),
        email: (currentUser && currentUser.email) || '',
        animalId: id
    });

    if (!json || !json.ok || typeof json.rewardIndex !== 'number' || !currentRewards[json.rewardIndex]) {
        spinInProgress = false;
        btn.disabled = false;
        btn.textContent = '룰렛 돌리기!';
        const msg = (json && json.error)
            ? json.error
            : '추첨 서버에 연결하지 못했어요.\n네트워크 확인 후 다시 시도해주세요.';
        alert(msg);
        return;
    }

    chosenRewardIndex = json.rewardIndex;
    serverReward = json.reward || currentRewards[chosenRewardIndex];

    // 회전 시작 전 각도를 0으로 확실히 리셋 (룰렛이 계속 돌아 보이는 문제 방지)
    const r = document.getElementById('roulette-svg');
    r.style.transition = 'none';
    r.style.transform = 'rotate(0deg)';
    void r.offsetWidth; // 강제 리플로우로 리셋 즉시 반영

    const segAngle = 360 / currentRewards.length;
    const target = chosenRewardIndex * segAngle + segAngle / 2;
    const totalRot = 360 * 5 + (360 - target);
    r.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.21, 1)';
    r.style.transform = 'rotate(' + totalRot + 'deg)';
    btn.textContent = '돌아가는 중...';
    setTimeout(() => showPrize(), 4200);
}

function showPrize() {
    spinInProgress = false;
    const reward = serverReward || currentRewards[chosenRewardIndex];
    if (!reward) return;
    const id = document.getElementById('roulette-overlay').dataset.targetId;
    const animal = farmAnimals.find(a => a.id === id);

    document.getElementById('prize-emoji').textContent = reward.emoji || '🎁';

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

    // 당첨 기록은 서버가 추첨 시점에 이미 저장함 (클라이언트 보고 없음)
    if (animal) {
        farmAnimals = farmAnimals.filter(a => a.id !== animal.id);
        if (activeAnimalId === animal.id) activeAnimalId = null;
        saveStateNow();
    }

    document.getElementById('roulette-overlay').classList.remove('active');
    document.getElementById('prize-overlay').classList.add('active');
}

function closePrize() {
    document.getElementById('prize-overlay').classList.remove('active');
    chosenRewardIndex = -1;
    serverReward = null;
    spinInProgress = false;
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

// ============================================
// ⚔️ 배틀 모드 — 실시간 매칭 (봇 폴백)
// 매치 1회 = 상대 보드에 돌멩이 1개. 90초 후 매치 수가 많은 쪽 승리, 승자 하트 +1.
// PvP는 2.5초 폴링으로 동기화 (GAS 한계상 돌멩이 도착에 2~3초 지연 있음)
// ============================================
function goToBattle() {
    initAudio();
    battleResetState();
    mmStartTs = Date.now();
    mmActive = true;
    document.getElementById('mm-status').textContent = '상대를 찾는 중...';
    document.getElementById('mm-overlay').classList.add('active');
    requestBattleMatch();
}

function battleResetState() {
    battleScore = 0;
    battleAttacksSent = 0;
    battleAttacksApplied = 0;
    battleOppScore = 0;
    battleFinished = false;
    battleIsBot = false;
    battleId = null;
    battleRole = null;
    botState = null;
}

async function requestBattleMatch() {
    const json = await apiCall({ action: 'battle_join', userId: getUserId(), name: getUserName() }, 0);
    if (!mmActive) return;
    if (json && json.ok && json.matched) { onBattleMatched(json); return; }
    if (!json) { startBotBattle(); return; } // 서버 연결 실패 → 바로 봇
    pollBattleMatch();
}

function pollBattleMatch() {
    if (!mmActive) return;
    const elapsed = Date.now() - mmStartTs;
    const statusEl = document.getElementById('mm-status');
    if (statusEl) statusEl.textContent = '상대를 찾는 중... ' + Math.floor(elapsed / 1000) + '초';

    if (elapsed >= MM_BOT_FALLBACK_MS) {
        apiCall({ action: 'battle_cancel', userId: getUserId() }, 0); // 대기열에서 빠지기
        startBotBattle();
        return;
    }

    mmPollTimer = setTimeout(async () => {
        if (!mmActive) return;
        const json = await apiCall({ action: 'battle_poll', userId: getUserId(), name: getUserName() }, 0);
        if (!mmActive) return;
        if (json && json.ok && json.matched) { onBattleMatched(json); return; }
        pollBattleMatch();
    }, 2000);
}

function cancelMatchmaking() {
    mmActive = false;
    if (mmPollTimer) clearTimeout(mmPollTimer);
    apiCall({ action: 'battle_cancel', userId: getUserId() }, 0);
    document.getElementById('mm-overlay').classList.remove('active');
}

function onBattleMatched(json) {
    mmActive = false;
    if (mmPollTimer) clearTimeout(mmPollTimer);
    battleIsBot = false;
    battleId = json.battleId;
    battleRole = json.role;
    battleOppName = json.opponent || '상대';
    const statusEl = document.getElementById('mm-status');
    if (statusEl) statusEl.textContent = '⚔️ ' + battleOppName + ' 님과 매칭!';
    setTimeout(() => {
        document.getElementById('mm-overlay').classList.remove('active');
        startBattleSession();
    }, 900);
}

function startBotBattle() {
    mmActive = false;
    if (mmPollTimer) clearTimeout(mmPollTimer);
    battleIsBot = true;
    battleOppName = 'COM';
    const statusEl = document.getElementById('mm-status');
    if (statusEl) statusEl.textContent = '접속 중인 상대가 없어요.\n컴퓨터와 대결합니다!';
    setTimeout(() => {
        document.getElementById('mm-overlay').classList.remove('active');
        startBattleSession();
    }, 1200);
}

function startBattleSession() {
    battleMode = true;
    showScreen('puzzle');
    document.getElementById('screen-puzzle').classList.add('battle');
    stopBigFarmWandering();
    stopActiveAnimalWandering();

    puzzleTimer = BATTLE_TIME;
    comboCount = 0;
    cumulativeCombo = 0;
    bombReady = false;
    selectedCell = null;
    isLocked = false;
    sessionMatches = 0;
    sessionMaxCombo = 1;
    sessionGainedExp = 0;
    sessionHintsLeft = HINT_FREE_COUNT;
    droppedCropQueue = [];
    animalIsMovingToFood = false;

    document.getElementById('battle-my-name').textContent = getUserName();
    document.getElementById('battle-opp-name').textContent = battleOppName;
    updateHintButton();
    updateComboGauge();
    updateBattlePanel();

    board = createBoard();
    renderBoard();
    startTimer();
    startBGM();

    if (battleIsBot) startBotEngine();
    else startBattlePolling();
}

function updateBattlePanel() {
    const my = document.getElementById('battle-my-score');
    const op = document.getElementById('battle-opp-score');
    if (my) my.textContent = battleScore;
    if (op) op.textContent = battleOppScore;
}

function sendBattleAttack(n) {
    battleAttacksSent += n;
    if (battleIsBot && botState) {
        // 봇은 돌을 맞으면 다음 매치가 느려짐
        botState.slowdown = Math.min(4000, botState.slowdown + 700 * n);
    }
    // PvP는 다음 폴링 때 누적값(battleAttacksSent)으로 전송됨
}

// 상대가 보낸 돌멩이를 내 보드에 떨어뜨림
function applyIncomingStones(n) {
    if (n <= 0 || battleFinished || !battleMode) return;
    const candidates = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] && board[r][c].id !== 'stone') candidates.push({ r, c });
        }
    }
    // 최소 12칸은 일반 작물로 남겨 완전 막힘 방지
    const maxApply = Math.max(0, candidates.length - 12);
    const count = Math.min(n, maxApply);
    for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * candidates.length);
        const { r, c } = candidates.splice(idx, 1)[0];
        board[r][c] = STONE;
    }
    if (count > 0) {
        renderBoard();
        const panel = document.getElementById('battle-panel');
        if (panel) {
            panel.classList.add('hit');
            setTimeout(() => panel.classList.remove('hit'), 500);
        }
        playMatchSound();
    }
}

// ---- PvP 폴링 ----
function startBattlePolling() {
    battlePollTimer = setInterval(battlePollTick, BATTLE_POLL_MS);
    battlePollTick();
}

async function battlePollTick() {
    if (!battleMode || battleIsBot) return;
    const json = await apiCall({
        action: 'battle_update',
        userId: getUserId(),
        battleId: battleId,
        role: battleRole,
        score: battleScore,
        attacks: battleAttacksSent,
        done: battleFinished
    }, 0);

    if (!battleMode) return;
    if (!json || !json.ok) {
        // 배틀 상태 유실(캐시 만료 등) → 상대 이탈로 간주
        if (json && json.error === 'expired') concludeBattle('opp_left');
        return;
    }

    const opp = json.opponent;
    battleOppScore = Math.max(battleOppScore, opp.score || 0);
    updateBattlePanel();

    // 새로 도착한 돌멩이 적용
    const newStones = (opp.attacks || 0) - battleAttacksApplied;
    if (newStones > 0) {
        battleAttacksApplied = opp.attacks;
        applyIncomingStones(newStones);
    }

    if (opp.forfeit && !battleFinished) { concludeBattle('opp_forfeit'); return; }

    // 상대 하트비트가 12초 이상 끊기면 이탈 처리
    const oppStale = !opp.done && (json.now - opp.hb > 12000);
    if (oppStale && !battleFinished) { concludeBattle('opp_left'); return; }

    // 내가 끝났고 상대도 끝났으면(또는 이탈) 결과 확정
    if (battleFinished && (opp.done || json.now - opp.hb > 12000)) {
        concludeBattle('both_done');
    }
}

// ---- 봇 엔진 (중간 난이도: 평균 5초당 매치 1회, 가끔 콤보) ----
function startBotEngine() {
    botState = { slowdown: 0, nextAt: Date.now() + 3000 + Math.random() * 2000 };
    botTickTimer = setInterval(botTick, 500);
}

function stopBotEngine() {
    if (botTickTimer) { clearInterval(botTickTimer); botTickTimer = null; }
}

function botTick() {
    if (!battleMode || !battleIsBot || battleFinished || !botState) return;
    botState.slowdown = Math.max(0, botState.slowdown - 150);
    const now = Date.now();
    if (now < botState.nextAt) return;

    let stones = 1;
    battleOppScore++;
    if (Math.random() < 0.18) { battleOppScore++; stones = 2; } // 콤보
    updateBattlePanel();
    applyIncomingStones(stones);

    botState.nextAt = now + 3800 + Math.random() * 2600 + botState.slowdown;
}

// ---- 종료 / 결과 ----
function finishBattle() {
    if (battleFinished) return;
    battleFinished = true;
    stopTimer();
    isLocked = true;
    stopBGM();

    if (battleIsBot) {
        stopBotEngine();
        apiCall({
            action: 'battle_log', userId: getUserId(), name: getUserName(),
            myScore: battleScore, oppScore: battleOppScore,
            result: battleScore > battleOppScore ? 'win' : battleScore < battleOppScore ? 'lose' : 'draw'
        }, 0);
        concludeBattle('both_done');
    } else {
        showLoading('상대의 결과를 기다리는 중...');
        battlePollTick(); // done 상태 즉시 전송
        // 15초 안전장치: 상대 응답이 없어도 현재 점수로 확정
        setTimeout(() => { if (battleMode) concludeBattle('timeout_safe'); }, 15000);
    }
}

function concludeBattle(reason) {
    if (!battleMode) return;
    hideLoading();
    if (battlePollTimer) { clearInterval(battlePollTimer); battlePollTimer = null; }
    stopBotEngine();
    stopTimer();
    battleFinished = true;

    let result;
    if (reason === 'opp_left' || reason === 'opp_forfeit') result = 'win';
    else if (battleScore > battleOppScore) result = 'win';
    else if (battleScore < battleOppScore) result = 'lose';
    else result = 'draw';

    showBattleResult(result, reason);
}

function showBattleResult(result, reason) {
    battleMode = false;
    isLocked = false;
    document.getElementById('screen-puzzle').classList.remove('battle');

    const emoji = document.getElementById('battle-result-emoji');
    const title = document.getElementById('battle-result-title');
    const desc = document.getElementById('battle-result-desc');
    const scoreEl = document.getElementById('battle-result-score');
    scoreEl.textContent = battleScore + ' : ' + battleOppScore;

    if (result === 'win') {
        emoji.textContent = '🏆';
        title.textContent = '승리!';
        if (hearts < MAX_HEARTS) {
            hearts++;
            desc.textContent = (reason === 'opp_left' || reason === 'opp_forfeit')
                ? '상대가 나가서 승리! 하트 +1 ❤️'
                : '하트 +1 획득! ❤️';
        } else {
            desc.textContent = '이겼지만 하트가 이미 가득해요 (최대 5개)';
        }
        updateHeartUI();
        saveStateNow();
    } else if (result === 'lose') {
        emoji.textContent = '😢';
        title.textContent = '패배...';
        desc.textContent = reason === 'forfeit' ? '기권해서 패배 처리됐어요' : '다음엔 이길 수 있어요!';
    } else {
        emoji.textContent = '🤝';
        title.textContent = '무승부';
        desc.textContent = '아쉽다! 한 번 더?';
    }
    document.getElementById('battle-result-overlay').classList.add('active');
}

function closeBattleResult() {
    document.getElementById('battle-result-overlay').classList.remove('active');
    battleCleanup();
    enterMain();
}

function battleCleanup() {
    battleMode = false;
    battleId = null;
    battleRole = null;
    battleFinished = false;
    if (battlePollTimer) { clearInterval(battlePollTimer); battlePollTimer = null; }
    stopBotEngine();
    document.getElementById('screen-puzzle').classList.remove('battle');
    isLocked = false;
}

function forfeitBattle() {
    if (!battleIsBot && battleId) {
        apiCall({
            action: 'battle_update', userId: getUserId(), battleId: battleId, role: battleRole,
            score: battleScore, attacks: battleAttacksSent, done: true, forfeit: true
        }, 0);
    }
    if (battlePollTimer) { clearInterval(battlePollTimer); battlePollTimer = null; }
    stopBotEngine();
    stopTimer();
    stopBGM();
    battleFinished = true;
    showBattleResult('lose', 'forfeit');
}

async function bootGame() {
    const localOk = loadLocalState();

    showLoading('농장 데이터를 불러오는 중...');
    const result = await loadFromBackend();
    hideLoading();

    if (result.networkError) {
        if (localOk) {
            // 서버 연결 실패해도 로컬 데이터로 플레이는 가능하게
            showToast('⚠️ 서버 연결에 실패했어요. 이 기기에 저장된 데이터로 시작해요.');
        } else {
            // 로컬 데이터도 없으면 재시도 안내
            showConnectionError();
            return;
        }
    } else if (result.data) {
        farmAnimals = result.data.farmAnimals || [];
        activeAnimalId = result.data.activeAnimalId || null;
        hearts = result.data.hearts !== undefined ? result.data.hearts : 3;
        dailyEatenToday = result.data.dailyEatenToday || 0;
        lastResetDate = result.data.lastResetDate || '';
        console.log('✅ 서버 데이터 복원');
    }

    checkDailyReset();
    createStars();
    updateSkyByTime();
    setInterval(updateSkyByTime, 60000);

    if ((!localOk && !result.data) || farmAnimals.length === 0) {
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

    // 로그인 로고를 마인크래프트 잔디 블록으로
    const logo = document.querySelector('.login-logo');
    if (logo) logo.innerHTML = spriteTag('grassblock');
    
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