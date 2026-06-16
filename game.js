// ============================================
// 네이버 로그인
// ============================================
const NAVER_CLIENT_ID = 'F4KAOrNX_NAYeUvnbEgI';
// 콜백 URL 고정: 접속 경로(/index.html 유무 등)와 무관하게 항상 이 주소 사용
// → 네이버 개발자센터에는 이 주소 하나만 Callback URL로 등록하면 됨
const NAVER_CALLBACK_URL = 'https://lsmnice-cmd.github.io/pangpang-farm/';

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

// 로켓 발사 (슈웅!)
function playRocketSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(1400, now + 0.35);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
    } catch (e) {}
}

// 무지개 별 (반짝이는 아르페지오)
function playRainbowSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        [523, 659, 784, 1047, 1319].forEach((f, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.type = 'triangle';
            osc.frequency.value = f;
            gain.gain.setValueAtTime(0.15, now + i * 0.06);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.25);
            osc.start(now + i * 0.06); osc.stop(now + i * 0.06 + 0.25);
        });
    } catch (e) {}
}

// 돌멩이 떨어짐 (쿵)
function playStoneSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.18);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    } catch (e) {}
}

// 잘못된 스왑 (삑)
function playInvalidSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        [0, 0.1].forEach(d => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.type = 'square';
            osc.frequency.value = 160;
            gain.gain.setValueAtTime(0.08, now + d);
            gain.gain.exponentialRampToValueAtTime(0.001, now + d + 0.07);
            osc.start(now + d); osc.stop(now + d + 0.07);
        });
    } catch (e) {}
}

// 특수 블록 생성 (딩!)
function playSpecialSpawnSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } catch (e) {}
}

// 승리 팡파레
function playWinFanfare() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        const seq = [[523, 0, 0.15], [659, 0.15, 0.15], [784, 0.3, 0.15], [1047, 0.45, 0.4]];
        seq.forEach(([f, t, d]) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.type = 'triangle';
            osc.frequency.value = f;
            gain.gain.setValueAtTime(0.22, now + t);
            gain.gain.exponentialRampToValueAtTime(0.001, now + t + d);
            osc.start(now + t); osc.stop(now + t + d);
        });
    } catch (e) {}
}

// 패배 (시무룩)
function playLoseSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        [[392, 0], [330, 0.2], [262, 0.4]].forEach(([f, t]) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.type = 'sine';
            osc.frequency.value = f;
            gain.gain.setValueAtTime(0.18, now + t);
            gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.3);
            osc.start(now + t); osc.stop(now + t + 0.35);
        });
    } catch (e) {}
}

// 카운트다운 틱 (마지막 5초)
function playTickSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'square';
        osc.frequency.value = 1100;
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    } catch (e) {}
}

// 셔플 (휘리릭)
function playShuffleSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        const bufferSize = audioCtx.sampleRate * 0.25;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize) * 0.5;
        const noise = audioCtx.createBufferSource();
        const gain = audioCtx.createGain();
        noise.buffer = buffer;
        noise.connect(gain); gain.connect(audioCtx.destination);
        gain.gain.value = 0.15;
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
        p: { R: '#C62828', D: '#7F1414', T: '#6D4C41', L: '#4CAF50', W: '#FFE5E5' },
        g: [
            '......TT........',
            '......T.LL......',
            '.....T.LLLL.....',
            '...RRR..RRR.....',
            '..RRRRRRRRRR....',
            '.RRWWRRRRRRRR...',
            '.RWWRRRRRRRRR...',
            '.RWRRRRRRRRRR...',
            '.RRRRRRRRRRRR...',
            '.RRRRRRRRRRRD...',
            '..RRRRRRRRRDD...',
            '..RRRRRRRRDD....',
            '...RRRR.RRRD....'
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
        p: { O: '#FF7043', R: '#E64A19', G: '#3F9B43', E: '#2E7D32', W: '#FFD9CC' },
        g: [
            '...G....G...G...',
            '....G..GG..G....',
            '....GGGGGGGG....',
            '..GGGEGGGGEGGG..',
            '.OOOGGGGGGGGOOO.',
            '.OOOOOOOOOOOOOO.',
            '.OWWOOOOOOOOOOR.',
            '.OWOOOOOOOOOORR.',
            '.OOOOOOOOOOOORR.',
            '..OOOOOOOOOORR..',
            '...OOOOOOOORR...',
            '.....OOOOOO.....'
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
    // ---- UI 아이콘 (v0.11 픽셀 테마) ----
    heart: {
        p: { R: '#FF5C7A', D: '#D63B5B', W: '#FFD1DB' },
        g: [
            '................',
            '..RRR....RRR....',
            '.RRRRR..RRRRR...',
            '.RWWRRRRRRRRR...',
            '.RWRRRRRRRRRD...',
            '.RRRRRRRRRRRD...',
            '..RRRRRRRRRD....',
            '...RRRRRRRD.....',
            '....RRRRRD......',
            '.....RRRD.......',
            '......RD........',
            '................'
        ]
    },
    heartbreak: {
        p: { R: '#FF5C7A', D: '#D63B5B' },
        g: [
            '................',
            '..RRR....RRR....',
            '.RRRRR..RRRRR...',
            '.RRRR.RRRRRRR...',
            '.RRRRR.RRRRRD...',
            '.RRRR.RRRRRRD...',
            '..RRRR.RRRRD....',
            '...RRR.RRRD.....',
            '....RR.RRD......',
            '.....R.RD.......',
            '......R.........',
            '................'
        ]
    },
    sword: {
        p: { B: '#AEB6C8', W: '#F0F4FF', G: '#FFB300', H: '#7A5230' },
        g: [
            '..........WW....',
            '.........WBB....',
            '........WBB.....',
            '.......WBB......',
            '......WBB.......',
            '.....WBB........',
            '..G.WBB.........',
            '..GGBB..........',
            '..GGG...........',
            '.HHGG...........',
            '.HH..G..........',
            '................'
        ]
    },
    gamepad: {
        p: { P: '#9C8ADE', D: '#7B68C4', K: '#4A2F17', R: '#FF5C7A', Y: '#FFD93B' },
        g: [
            '................',
            '..PPPP....PPPP..',
            '.PPPPPPPPPPPPPP.',
            '.PPKPPPPPPPPYPP.',
            '.PKKKPPPPPYPPYP.',
            '.PPKPPPPPPPPYPP.',
            '.PPPPPPPPPPPPPP.',
            '.PPPDD....DDPPP.',
            '................'
        ]
    },
    trophy: {
        p: { G: '#FFD93B', D: '#E0A800', B: '#8A5A3B' },
        g: [
            '.GGGGGGGGGGGG...',
            '.G.GGGGGGGG.G...',
            '.G.GGGGGGGG.G...',
            '..GGGGGGGGGG....',
            '...GGGGGGGG.....',
            '....GGGGGG......',
            '.....GDDG.......',
            '......GG........',
            '......GG........',
            '....GGGGGG......',
            '...BBBBBBBB.....'
        ]
    },
    gear: {
        p: { S: '#9AA0A6', D: '#6B7075' },
        g: [
            '.....SS..SS.....',
            '..SS.SSSSSS.SS..',
            '..SSSSSSSSSSSS..',
            '...SSSS..SSSS...',
            '.SSSSS....SSSSS.',
            '.SSSS......SSSS.',
            '.SSSS......SSSS.',
            '.SSSSS....SSSSS.',
            '...SSSS..SSSS...',
            '..SSSSSSSSSSSD..',
            '..SS.SSSSSS.SS..',
            '.....SS..SS.....'
        ]
    },
    bulb: {
        p: { Y: '#FFE066', W: '#FFF6C9', S: '#9AA0A6', D: '#E0A800' },
        g: [
            '.....YYYY.......',
            '....YYYYYY......',
            '...YYWYYYYY.....',
            '...YWYYYYYY.....',
            '...YYYYYYYD.....',
            '....YYYYYD......',
            '.....YYYY.......',
            '.....SSSS.......',
            '.....SSSS.......',
            '......SS........'
        ]
    },
    bomb: {
        p: { K: '#2E2E2E', W: '#5A5A5A', T: '#C97A3D', S: '#FFD93B' },
        g: [
            '.........S......',
            '........TT......',
            '.......T........',
            '....KKKK........',
            '...KKKKKK.......',
            '..KKWKKKKK......',
            '..KWKKKKKK......',
            '..KKKKKKKK......',
            '..KKKKKKKK......',
            '...KKKKKK.......',
            '....KKKK........'
        ]
    },
    clock: {
        p: { B: '#8A5A3B', W: '#FFF7E6', K: '#4A2F17', R: '#FF5C7A' },
        g: [
            '....BBBBBB......',
            '...BWWWWWWB.....',
            '..BWWWKWWWWB....',
            '..BWWWKWWWWB....',
            '..BWWWKKKWWB....',
            '..BWWWWWWWWB....',
            '..BWWWWWWWWB....',
            '...BWWWWWWB.....',
            '....BBBBBB......'
        ]
    },
    star: {
        p: { Y: '#FFD93B', D: '#E0A800' },
        g: [
            '.......Y........',
            '......YYY.......',
            '......YYY.......',
            '.YYYYYYYYYYYYY..',
            '..YYYYYYYYYYY...',
            '....YYYYYYY.....',
            '...YYYYYYYYY....',
            '...YYYY.YYYD....',
            '..YYY.....YDD...'
        ]
    },
    // ---- 특수 블록 (v0.12 퍼즐 정교화) ----
    rocket_h: {
        p: { W: '#E8ECF4', D: '#B8C0D0', R: '#FF5C7A', B: '#7EC8E3', Y: '#FFD93B' },
        g: [
            '................',
            '....BB..........',
            '..WWWWWWWWWRR...',
            '.YWWWWWWWWWWRR..',
            '.YYWWWWWWWWWWRR.',
            '.YWWWWWWWWWWRR..',
            '..WWDDDDDDWRR...',
            '....BB..........',
            '................'
        ]
    },
    rocket_v: {
        p: { W: '#E8ECF4', D: '#B8C0D0', R: '#FF5C7A', B: '#7EC8E3', Y: '#FFD93B' },
        g: [
            '.......RR.......',
            '......RRRR......',
            '......WWWW......',
            '......WWWD......',
            '......WWWD......',
            '......WWWD......',
            '....B.WWWD.B....',
            '....BBWWWDBB....',
            '......YYYY......',
            '.......YY.......'
        ]
    },
    rainbow: {
        p: { R: '#FF5C7A', O: '#FFB347', Y: '#FFD93B', G: '#7CC47C', B: '#7EC8E3', W: '#FFFFFF' },
        g: [
            '....RRRRRRRR....',
            '...ROOOOOOOOR...',
            '..ROYYYYYYYYOR..',
            '..ROYGGGGGGYOR..',
            '..ROYGBBBBGYOR..',
            '..ROYGBWWBGYOR..',
            '..ROYGBWWBGYOR..',
            '..ROYGBBBBGYOR..',
            '..ROYGGGGGGYOR..',
            '..ROYYYYYYYYOR..',
            '...ROOOOOOOOR...',
            '....RRRRRRRR....'
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

let botBoard = null;            // 봇의 실제 보드 (실시간 표시용)

// ---- 1일 1회 제한 (배틀/먹방대회) ----
let lastBattleDate = '';
let lastContestDate = '';

function todayKST() {
    return getKoreaTime().toISOString().slice(0, 10);
}

// ---- 먹방대회 상태 ----
let contestMode = false;
let contestScore = 0;
let contestFinishing = false;
let contestMyBest = 0;
let timerMax = 90; // 모드별 타이머 최대값 (게이지 계산용)
const CONTEST_TIME = 60;

const STONE = { id: 'stone', emoji: '🪨', name: '돌멩이' };

// 특수 블록: 4매치 → 로켓(줄 제거), 5매치/십자 → 무지개 별(같은 작물 전체 제거)
const ROCKET_H = { id: 'rocket_h', name: '가로 로켓' };
const ROCKET_V = { id: 'rocket_v', name: '세로 로켓' };
const RAINBOW = { id: 'rainbow', name: '무지개 별' };
const SPECIAL_IDS = ['rocket_h', 'rocket_v', 'rainbow'];

function isSpecial(p) { return !!p && SPECIAL_IDS.includes(p.id); }
function isStonePiece(p) { return !!p && p.id === 'stone'; }
function isCrop(p) { return !!p && !isSpecial(p) && !isStonePiece(p); }
function keyOf(r, c) { return r + '-' + c; }
function cellEl(r, c) { return boardElement.children[r * BOARD_SIZE + c]; }

// 보드 직렬화 (PvP 폴링 때 36글자 문자열로 주고받음)
const BOARD_CODE = { apple: 'a', banana: 'b', tomato: 't', corn: 'c', cucumber: 'u', eggplant: 'e', onion: 'o', grape: 'g', garlic: 'l', stone: 'S' };
const CODE_TO_ID = {};
Object.keys(BOARD_CODE).forEach(k => { CODE_TO_ID[BOARD_CODE[k]] = k; });

function encodeBoard(b) {
    let s = '';
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            s += (b[r] && b[r][c]) ? (BOARD_CODE[b[r][c].id] || '.') : '.';
        }
    }
    return s;
}
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
    const state = { farmAnimals, activeAnimalId, hearts, dailyEatenToday, lastResetDate, lastBattleDate, lastContestDate };
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
        lastBattleDate = s.lastBattleDate || '';
        lastContestDate = s.lastContestDate || '';
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
    timerMax = INITIAL_TIME;
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
    if (findHintCandidates().length === 0) reshuffleBoard(); // 시작부터 막힌 보드 방지
    startTimer();
    startActiveAnimalWandering();
    startBGM();
}

function initActiveAnimalPosition() {
    const animal = document.getElementById('puzzle-active-spot');
    if (!animal) return;
    animal.style.left = activePosX + 'px';
    animal.style.bottom = activePosY + 'px';
    animal.style.setProperty('--face', '1');
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
            if (isCrop(board[row][col])) { // 작물만 폭파 대상 (돌멩이/특수 블록 제외)
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
        if (puzzleTimer <= 5 && puzzleTimer > 0) playTickSound(); // 마지막 5초 긴장감
        if (puzzleTimer <= 0) {
            if (battleMode) finishBattle();
            else if (contestMode) finishContest();
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
        const percent = Math.max(0, Math.min(100, (puzzleTimer / timerMax) * 100));
        timerGaugeFill.style.width = percent + '%';
        if (puzzleTimer <= 15) timerGaugeFill.classList.add('warning');
        else timerGaugeFill.classList.remove('warning');
    }
}
function addTime(seconds) {
    // 배틀/대회는 공정성을 위해 시간 추가 없음 (힌트 비용 차감은 허용)
    if ((battleMode || contestMode) && seconds > 0) return;
    puzzleTimer += seconds;
    if (puzzleTimer < 0) puzzleTimer = 0;
    if (puzzleTimer > timerMax) puzzleTimer = timerMax;
    updateTimerDisplay();
}

function useHint() {
    if (isLocked) return;
    if (puzzleTimer <= 0) return;

    if (sessionHintsLeft > 0) {
        sessionHintsLeft--;
        updateHintButton();
    } else {
        if (contestMode) { showToast('대회에서는 힌트를 3번까지만 쓸 수 있어요!'); return; }
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
    const icon = spriteTag('bulb', 'inline-pix');
    if (sessionHintsLeft > 0) {
        btn.innerHTML = icon + ' 힌트 (' + sessionHintsLeft + '/3)';
        btn.classList.remove('hint-paid');
    } else {
        btn.innerHTML = icon + ' 힌트 (-' + HINT_TIME_COST + '초)';
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
                swapOn(board, row, col, row, col + 1);
                const matches = findMatches();
                swapOn(board, row, col, row, col + 1);
                if (matches.length > 0) results.push([{row, col}, {row, col: col + 1}]);
            }
            if (row < BOARD_SIZE - 1 && !isStone(row + 1, col)) {
                swapOn(board, row, col, row + 1, col);
                const matches = findMatches();
                swapOn(board, row, col, row + 1, col);
                if (matches.length > 0) results.push([{row, col}, {row: row + 1, col}]);
            }
        }
    }
    return results;
}

function getCurrentCrops() {
    if (battleMode || contestMode) return ALL_CROPS.filter(c => BATTLE_CROP_IDS.includes(c.id));
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

function renderBoard(falls) {
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
            // 낙하 애니메이션: 떨어진 칸 수만큼 위에서 떨어져 내려옴
            if (falls && falls[row] && falls[row][col] > 0) {
                cell.style.setProperty('--fd', falls[row][col]);
                cell.classList.add('fall');
            }
            boardElement.appendChild(cell);
        }
    }
}

// 입력 위임: 탭(두 번 눌러 교환) + 스와이프(끌어서 교환) 모두 지원
let dragStart = null;

function initBoardInput() {
    if (!boardElement) return;
    boardElement.style.touchAction = 'none'; // 보드 위 스와이프 시 화면 스크롤 방지

    boardElement.addEventListener('pointerdown', (e) => {
        const cell = e.target.closest('.cell');
        if (!cell) return;
        dragStart = {
            row: +cell.dataset.row, col: +cell.dataset.col,
            x: e.clientX, y: e.clientY, moved: false
        };
    });

    boardElement.addEventListener('pointermove', (e) => {
        if (!dragStart || dragStart.moved) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        if (Math.hypot(dx, dy) < 18) return; // 스와이프 판정 임계값
        dragStart.moved = true;
        let dr = 0, dc = 0;
        if (Math.abs(dx) > Math.abs(dy)) dc = dx > 0 ? 1 : -1;
        else dr = dy > 0 ? 1 : -1;
        const r2 = dragStart.row + dr, c2 = dragStart.col + dc;
        if (r2 < 0 || c2 < 0 || r2 >= BOARD_SIZE || c2 >= BOARD_SIZE) return;
        clearSelection();
        attemptSwap(dragStart.row, dragStart.col, r2, c2);
    });

    window.addEventListener('pointerup', () => {
        if (dragStart && !dragStart.moved) handleCellTap(dragStart.row, dragStart.col);
        dragStart = null;
    });
}

function clearSelection() {
    if (selectedCell) {
        highlightCell(selectedCell.row, selectedCell.col, false);
        selectedCell = null;
    }
}

function handleCellTap(row, col) {
    if (isLocked) return;
    if (puzzleTimer <= 0) return;

    const p = board[row][col];
    if (isStonePiece(p)) { clearSelection(); return; } // 돌멩이는 선택 불가

    if (selectedCell === null) {
        selectedCell = { row, col };
        highlightCell(row, col, true);
        return;
    }

    const prev = selectedCell;
    highlightCell(prev.row, prev.col, false);
    selectedCell = null;
    if (prev.row === row && prev.col === col) return;

    if (isAdjacent(prev, { row, col })) {
        attemptSwap(prev.row, prev.col, row, col);
    } else {
        // 멀리 떨어진 칸을 누르면 새로 선택 (편의성)
        selectedCell = { row, col };
        highlightCell(row, col, true);
    }
}

function attemptSwap(r1, c1, r2, c2) {
    if (isLocked || puzzleTimer <= 0) return;
    const A = board[r1][c1];
    const B = board[r2][c2];
    if (!A || !B) return;

    if (isStonePiece(A) || isStonePiece(B)) {
        animateInvalid(r1, c1, r2, c2);
        return;
    }

    // 특수 블록이 끼면 매치 없이도 발동
    if (isSpecial(A) || isSpecial(B)) {
        isLocked = true;
        animateSwap(r1, c1, r2, c2, () => {
            swapOn(board, r1, c1, r2, c2);
            renderBoard();
            isLocked = false;
            comboCount = 0;
            executeSpecialSwap(r2, c2, r1, c1); // 스왑 후 A는 (r2,c2)에 있음
        });
        return;
    }

    // 일반 스왑: 매치가 생기는지 먼저 확인
    swapOn(board, r1, c1, r2, c2);
    const valid = findMatchesOn(board).length > 0;
    swapOn(board, r1, c1, r2, c2); // 원복

    if (valid) {
        isLocked = true;
        animateSwap(r1, c1, r2, c2, () => {
            swapOn(board, r1, c1, r2, c2);
            renderBoard();
            isLocked = false;
            comboCount = 0;
            processMatches({ row: r2, col: c2 }); // 스왑 도착 지점에 특수 블록 생성
        });
    } else {
        animateInvalid(r1, c1, r2, c2); // 흔들리며 제자리로
    }
}

// 두 칸이 서로 자리를 바꾸는 연출
function animateSwap(r1, c1, r2, c2, done) {
    const a = cellEl(r1, c1);
    const b = cellEl(r2, c2);
    if (!a || !b) { done(); return; }
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    const dx = br.left - ar.left;
    const dy = br.top - ar.top;
    a.style.transition = 'transform 0.15s ease';
    b.style.transition = 'transform 0.15s ease';
    a.style.zIndex = '3';
    a.style.transform = `translate(${dx}px, ${dy}px)`;
    b.style.transform = `translate(${-dx}px, ${-dy}px)`;
    setTimeout(done, 160);
}

// 잘못된 스왑: 갔다가 흔들리며 돌아옴
function animateInvalid(r1, c1, r2, c2) {
    isLocked = true;
    animateSwap(r1, c1, r2, c2, () => {
        const a = cellEl(r1, c1);
        const b = cellEl(r2, c2);
        if (a) a.style.transform = '';
        if (b) b.style.transform = '';
        setTimeout(() => {
            if (a) a.classList.add('shake');
            if (b) b.classList.add('shake');
            playInvalidSound();
            setTimeout(() => { renderBoard(); isLocked = false; }, 280);
        }, 160);
    });
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
    swapOn(board, r1, c1, r2, c2);
    renderBoard();
}

function swapOn(b, r1, c1, r2, c2) {
    const t = b[r1][c1];
    b[r1][c1] = b[r2][c2];
    b[r2][c2] = t;
}

function findMatches() {
    return findMatchesOn(board);
}

function findMatchesOn(board) {
    const matched = [];
    const seen = new Set();
    const add = (row, col) => {
        const k = row + '-' + col;
        if (!seen.has(k)) { seen.add(k); matched.push({row, col}); }
    };
    const same = (a, b) => a && b && a.id === b.id && isCrop(a); // 돌멩이/특수블록은 매치 제외

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

// ============================================
// 매치 해석 파이프라인 (v0.12)
// findRunsOn: 연속 3개 이상 "런" 목록 → 특수 블록 생성 계획 → executeClear
// ============================================
function findRunsOn(b) {
    const runs = [];
    // 가로
    for (let row = 0; row < BOARD_SIZE; row++) {
        let col = 0;
        while (col < BOARD_SIZE) {
            const p = b[row][col];
            if (!isCrop(p)) { col++; continue; }
            let end = col;
            while (end + 1 < BOARD_SIZE && b[row][end + 1] && b[row][end + 1].id === p.id) end++;
            if (end - col >= 2) {
                const cells = [];
                for (let k = col; k <= end; k++) cells.push({ row, col: k });
                runs.push({ cells, dir: 'h', id: p.id });
            }
            col = end + 1;
        }
    }
    // 세로
    for (let col = 0; col < BOARD_SIZE; col++) {
        let row = 0;
        while (row < BOARD_SIZE) {
            const p = b[row][col];
            if (!isCrop(p)) { row++; continue; }
            let end = row;
            while (end + 1 < BOARD_SIZE && b[end + 1][col] && b[end + 1][col].id === p.id) end++;
            if (end - row >= 2) {
                const cells = [];
                for (let k = row; k <= end; k++) cells.push({ row: k, col });
                runs.push({ cells, dir: 'v', id: p.id });
            }
            row = end + 1;
        }
    }
    return runs;
}

function processMatches(swapPos) {
    const runs = findRunsOn(board);
    if (runs.length === 0) return;

    // ---- 특수 블록 생성 계획 ----
    const spawnList = [];
    const usedRuns = new Set();

    // 1) 십자/L자 교차 (가로 런 + 세로 런이 한 칸 공유) → 무지개 별
    const hMap = {}, vMap = {};
    runs.forEach((run, i) => {
        run.cells.forEach(({ row, col }) => {
            const k = keyOf(row, col);
            if (run.dir === 'h') hMap[k] = i; else vMap[k] = i;
        });
    });
    Object.keys(hMap).forEach(k => {
        if (vMap[k] !== undefined && !usedRuns.has(hMap[k]) && !usedRuns.has(vMap[k])) {
            const [r, c] = k.split('-').map(Number);
            spawnList.push({ row: r, col: c, piece: RAINBOW });
            usedRuns.add(hMap[k]);
            usedRuns.add(vMap[k]);
        }
    });

    // 2) 단일 런: 5개 이상 → 무지개 별, 정확히 4개 → 로켓(런 방향대로)
    runs.forEach((run, i) => {
        if (usedRuns.has(i)) return;
        if (run.cells.length >= 5) {
            const pos = pickSpawnCell(run, swapPos);
            spawnList.push({ row: pos.row, col: pos.col, piece: RAINBOW });
        } else if (run.cells.length === 4) {
            const pos = pickSpawnCell(run, swapPos);
            spawnList.push({ row: pos.row, col: pos.col, piece: run.dir === 'h' ? ROCKET_H : ROCKET_V });
        }
    });

    const seed = new Set();
    runs.forEach(run => run.cells.forEach(({ row, col }) => seed.add(keyOf(row, col))));
    executeClear(seed, spawnList, swapPos);
}

// 특수 블록이 생길 위치: 스왑한 칸이 런에 포함되면 그 칸, 아니면 런 가운데
function pickSpawnCell(run, swapPos) {
    if (swapPos) {
        const k = keyOf(swapPos.row, swapPos.col);
        if (run.cells.some(c => keyOf(c.row, c.col) === k)) return swapPos;
    }
    return run.cells[Math.floor(run.cells.length / 2)];
}

// 특수 블록 연쇄 확장: 제거 대상에 특수 블록이 있으면 그 효과 범위도 함께 제거
function expandSpecials(seedSet) {
    const set = new Set(seedSet);
    const queue = [...seedSet];
    let guard = 0;
    while (queue.length && guard++ < 200) {
        const k = queue.shift();
        const [r, c] = k.split('-').map(Number);
        const p = board[r] && board[r][c];
        if (!p) continue;
        const extra = [];
        if (p.id === 'rocket_h') {
            for (let cc = 0; cc < BOARD_SIZE; cc++) extra.push(keyOf(r, cc));
        } else if (p.id === 'rocket_v') {
            for (let rr = 0; rr < BOARD_SIZE; rr++) extra.push(keyOf(rr, c));
        } else if (p.id === 'rainbow') {
            const target = mostCommonCropId();
            if (target) {
                for (let rr = 0; rr < BOARD_SIZE; rr++) {
                    for (let cc = 0; cc < BOARD_SIZE; cc++) {
                        if (board[rr][cc] && board[rr][cc].id === target) extra.push(keyOf(rr, cc));
                    }
                }
            }
        }
        extra.forEach(k2 => { if (!set.has(k2)) { set.add(k2); queue.push(k2); } });
    }
    return set;
}

function mostCommonCropId() {
    const count = {};
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const p = board[r][c];
            if (isCrop(p)) count[p.id] = (count[p.id] || 0) + 1;
        }
    }
    let best = null, n = 0;
    Object.keys(count).forEach(id => { if (count[id] > n) { n = count[id]; best = id; } });
    return best;
}

// 특수 블록 스왑 발동 (무지개: 상대 작물 전체, 로켓: 줄 — expandSpecials가 처리)
function executeSpecialSwap(rA, cA, rB, cB) {
    const A = board[rA][cA];
    const B = board[rB][cB];
    const seed = new Set();

    function trigger(p, r, c, other) {
        seed.add(keyOf(r, c));
        if (p.id === 'rainbow') {
            // 스왑 상대가 작물이면 그 작물 전체, 아니면 가장 많은 작물
            const target = isCrop(other) ? other.id : mostCommonCropId();
            if (target) {
                for (let rr = 0; rr < BOARD_SIZE; rr++) {
                    for (let cc = 0; cc < BOARD_SIZE; cc++) {
                        if (board[rr][cc] && board[rr][cc].id === target) seed.add(keyOf(rr, cc));
                    }
                }
            }
        }
    }

    if (isSpecial(A)) trigger(A, rA, cA, B);
    if (isSpecial(B)) trigger(B, rB, cB, A);
    if (seed.size === 0) return;
    executeClear(seed, [], { row: rA, col: cA });
}

// ---- 공용 제거 파이프라인: 연출 → 제거 → 특수 생성 → 낙하 → 연쇄 ----
function executeClear(seedSet, spawnList, focusPos) {
    const clearSet = expandSpecials(seedSet);

    // 배틀: 제거 대상에 인접한 돌멩이도 함께 파괴
    if (battleMode) {
        const adj = [];
        clearSet.forEach(k => {
            const [r, c] = k.split('-').map(Number);
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
                const rr = r + dr, cc = c + dc;
                if (rr < 0 || cc < 0 || rr >= BOARD_SIZE || cc >= BOARD_SIZE) return;
                const kk = keyOf(rr, cc);
                if (!clearSet.has(kk) && board[rr][cc] && board[rr][cc].id === 'stone') adj.push(kk);
            });
        });
        adj.forEach(k => clearSet.add(k));
    }

    const tiles = clearSet.size;
    if (tiles === 0) return;

    comboCount++;
    if (comboCount >= 2) cumulativeCombo++;
    sessionMatches++;
    if (comboCount > sessionMaxCombo) sessionMaxCombo = comboCount;

    // 매치 크기에 따른 보상 차등: 3개 = 5 EXP, 한 칸 늘 때마다 +2 (최대 40)
    const expGain = Math.min(40, MATCH_BASE_EXP + Math.max(0, tiles - 3) * 2);

    if (battleMode) {
        battleScore++;
        let atk = 1 + Math.floor(Math.max(0, tiles - 3) / 3); // 크게 지울수록 돌멩이 더 발사
        if (comboCount >= 3) atk++;
        sendBattleAttack(Math.min(4, atk));
        updateBattlePanel();
    }

    // 먹방대회 점수: 지운 칸 × 10 × 콤보 (크고 길게 먹을수록 점수 폭발)
    let contestGain = 0;
    if (contestMode) {
        contestGain = tiles * 10 * comboCount;
        contestScore += contestGain;
        updateContestPanel();
    }

    // 발동된 특수 블록에 맞는 사운드
    let firedRainbow = false, firedRocket = false;
    clearSet.forEach(k => {
        const [r, c] = k.split('-').map(Number);
        const p = board[r][c];
        if (p && p.id === 'rainbow') firedRainbow = true;
        else if (p && (p.id === 'rocket_h' || p.id === 'rocket_v')) firedRocket = true;
    });

    if (firedRainbow) playRainbowSound();
    else if (firedRocket) playRocketSound();
    else if (comboCount >= 2) playComboSound(comboCount);
    else playMatchSound();

    if (spawnList && spawnList.length > 0) playSpecialSpawnSound(); // 특수 블록 탄생

    if (comboCount >= 2) {
        comboText.textContent = comboCount;
        comboBox.style.opacity = '1';
        comboBox.style.transform = 'scale(1.2)';
        setTimeout(() => { comboBox.style.transform = 'scale(1)'; }, 200);
        setTimeout(() => { comboBox.style.opacity = '0'; }, 1500);
    }

    updateComboGauge();
    addTime(TIME_PER_MATCH);

    // 대표 셀/작물 (점수 팝업, 농장 떨어뜨리기, 작물 이름 외치기)
    let repPos = null, repCrop = null;
    for (const k of clearSet) {
        const [r, c] = k.split('-').map(Number);
        const p = board[r][c];
        if (isCrop(p)) { repPos = { row: r, col: c }; repCrop = p; break; }
    }
    if (focusPos && clearSet.has(keyOf(focusPos.row, focusPos.col))) {
        const fp = board[focusPos.row][focusPos.col];
        if (isCrop(fp)) { repPos = focusPos; repCrop = fp; }
    }

    if (repPos) showScorePopup(repPos, contestMode ? contestGain : expGain, comboCount);
    if (repCrop && comboCount >= 2) speakCropName(repCrop.name);

    clearSet.forEach(k => {
        const [r, c] = k.split('-').map(Number);
        const cell = cellEl(r, c);
        if (cell) {
            spawnParticles(cell);
            cell.classList.add('matching');
        }
    });

    if (repPos && repCrop) {
        const cell = cellEl(repPos.row, repPos.col);
        if (cell) dropCropToField(cell, repCrop);
    }

    grantExpToActive(expGain);

    setTimeout(() => {
        clearSet.forEach(k => {
            const [r, c] = k.split('-').map(Number);
            board[r][c] = null;
        });
        // 특수 블록은 제거된 자리에 생성
        (spawnList || []).forEach(s => { board[s.row][s.col] = s.piece; });

        const falls = dropDownWithFalls(board);
        fillEmptyOn(board, getCurrentCrops());
        renderBoard(falls);

        setTimeout(() => {
            if (puzzleTimer <= 0) return;
            if (findRunsOn(board).length > 0) {
                processMatches(null); // 연쇄
            } else {
                comboCount = 0;
                ensureMoves();
                checkEndConditions();
            }
        }, 340);
    }, 400);
}

// 낙하 거리 기록하며 중력 적용 (낙하 애니메이션용)
function dropDownWithFalls(b) {
    const falls = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
    for (let col = 0; col < BOARD_SIZE; col++) {
        let write = BOARD_SIZE - 1;
        for (let row = BOARD_SIZE - 1; row >= 0; row--) {
            if (b[row][col] !== null) {
                if (write !== row) {
                    b[write][col] = b[row][col];
                    b[row][col] = null;
                    falls[write][col] = write - row;
                }
                write--;
            }
        }
        // 위쪽 빈칸(새 작물 스폰 자리)은 보드 위에서 떨어져 내려옴
        for (let r = write; r >= 0; r--) falls[r][col] = write + 1;
    }
    return falls;
}

// 가능한 수가 없으면 자동 셔플 (돌멩이/특수 블록은 자리 유지)
function ensureMoves() {
    if (puzzleTimer <= 0 || isLocked) return;
    // 특수 블록이 하나라도 있으면 그걸 쓸 수 있으니 통과
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (isSpecial(board[r][c])) return;
        }
    }
    if (findHintCandidates().length > 0) return;
    showToast('🔀 만들 수 있는 매치가 없어서 보드를 섞었어요!');
    playShuffleSound();
    reshuffleBoard();
}

function reshuffleBoard() {
    for (let attempt = 0; attempt < 12; attempt++) {
        const cells = [], pieces = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (isCrop(board[r][c])) { cells.push({ r, c }); pieces.push(board[r][c]); }
            }
        }
        for (let i = pieces.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
        }
        cells.forEach(({ r, c }, i) => { board[r][c] = pieces[i]; });
        if (findMatchesOn(board).length === 0 && findHintCandidates().length > 0) {
            renderBoard();
            return;
        }
    }
    // 12번 섞어도 안 되면 작물 새로 생성
    const crops = getCurrentCrops();
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (isCrop(board[r][c])) board[r][c] = crops[Math.floor(Math.random() * crops.length)];
        }
    }
    renderBoard();
    if (findMatchesOn(board).length > 0) { comboCount = 0; processMatches(null); }
}

function checkEndConditions() {
    if (battleMode || contestMode) return; // 배틀/대회는 타이머 종료로만 끝남
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
    if (battleMode || contestMode) return; // 배틀/대회에서는 EXP 없음 (대회는 순수 점수전)
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

    if (targetXInFarm > activePosX) animal.style.setProperty('--face', '1');
    else if (targetXInFarm < activePosX) animal.style.setProperty('--face', '-1');

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

        if (targetX > activePosX) animal.style.setProperty('--face', '1');
        else animal.style.setProperty('--face', '-1');

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
    dropDownOn(board);
}

function dropDownOn(board) {
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
    fillEmptyOn(board, getCurrentCrops());
}

function fillEmptyOn(board, crops) {
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
        emojiEl.innerHTML = spriteTag('clock');
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
    if (contestMode) { finishContest(); return; } // 중도 포기해도 현재 점수로 제출
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
        playLoseSound();
        document.getElementById('prize-title').textContent = '아쉽지만 꽝!';
        document.getElementById('prize-label').textContent = '다음 기회를 노려보세요';
        document.getElementById('prize-desc').textContent = '';
    } else {
        playWinFanfare();
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
    if (lastBattleDate === todayKST() && !testMode) {
        showToast('⚔️ 배틀은 하루에 1번만 도전할 수 있어요! 내일 다시 만나요.');
        return;
    }
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
    lastBattleDate = todayKST(); // 입장 시점에 1일 1회 소진
    saveState();
    battleMode = true;
    showScreen('puzzle');
    document.getElementById('screen-puzzle').classList.add('battle');
    stopBigFarmWandering();
    stopActiveAnimalWandering();

    puzzleTimer = BATTLE_TIME;
    timerMax = BATTLE_TIME;
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
    if (findHintCandidates().length === 0) reshuffleBoard();
    renderOppBoardEmpty(); // 상대 보드 자리 표시 (첫 동기화 전)
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
    // 봇전: 봇의 실제 보드에 돌멩이를 떨어뜨려 진짜로 방해함
    if (battleIsBot) applyStonesToBotBoard(n);
    // PvP는 다음 폴링 때 누적값(battleAttacksSent)으로 전송됨
}

// ---- 상대 보드 실시간 표시 ----
function renderOppBoard(b) {
    const el = document.getElementById('opp-board');
    if (!el || !b) return;
    let html = '';
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = b[r] && b[r][c];
            const id = cell ? cell.id : null;
            html += '<div class="ocell' + (id === 'stone' ? ' stone' : '') + '">' + (id ? spriteTag(id) : '') + '</div>';
        }
    }
    el.innerHTML = html;
}

function renderOppBoardEncoded(s) {
    const el = document.getElementById('opp-board');
    if (!el || !s || s.length < BOARD_SIZE * BOARD_SIZE) return;
    let html = '';
    for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
        const id = CODE_TO_ID[s[i]] || null;
        html += '<div class="ocell' + (id === 'stone' ? ' stone' : '') + '">' + (id ? spriteTag(id) : '') + '</div>';
    }
    el.innerHTML = html;
}

function renderOppBoardEmpty() {
    const el = document.getElementById('opp-board');
    if (!el) return;
    let html = '';
    for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) html += '<div class="ocell"></div>';
    el.innerHTML = html;
}

function applyStonesToBotBoard(n) {
    if (!botBoard || n <= 0) return;
    const candidates = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (botBoard[r][c] && botBoard[r][c].id !== 'stone') candidates.push({ r, c });
        }
    }
    const maxApply = Math.max(0, candidates.length - 12);
    const count = Math.min(n, maxApply);
    for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * candidates.length);
        const { r, c } = candidates.splice(idx, 1)[0];
        botBoard[r][c] = STONE;
    }
    if (count > 0) renderOppBoard(botBoard);
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
        playStoneSound();
        ensureMoves(); // 돌멩이 때문에 수가 막혔으면 자동 셔플
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
        board: encodeBoard(board),
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
    if (opp.board) renderOppBoardEncoded(opp.board); // 상대 보드 실시간 반영

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

// ---- 봇 엔진 (중간 난이도) ----
// 봇은 자기 보드를 실제로 가지고 플레이함: 유효한 스왑을 찾아 매치 → 연쇄까지 처리.
// 내가 보낸 돌멩이가 봇 보드를 진짜로 막아서 난이도가 자연스럽게 조절됨.
function startBotEngine() {
    botBoard = createBoard(); // battleMode라 배틀 작물 6종으로 생성됨
    renderOppBoard(botBoard);
    botState = { nextAt: Date.now() + 3500 + Math.random() * 2000 };
    botTickTimer = setInterval(botTick, 400);
}

function stopBotEngine() {
    if (botTickTimer) { clearInterval(botTickTimer); botTickTimer = null; }
    botBoard = null;
}

function botTick() {
    if (!battleMode || !battleIsBot || battleFinished || !botState || !botBoard) return;
    const now = Date.now();
    if (now < botState.nextAt) return;

    const sw = findSwapOn(botBoard);
    let events = 0;
    if (sw) {
        swapOn(botBoard, sw.r1, sw.c1, sw.r2, sw.c2);
        events = botResolveBoard();
    } else {
        botShuffleBoard(); // 가능한 수가 없으면 섞기 (돌멩이는 그대로 유지)
    }

    if (events > 0) {
        battleOppScore += events;
        updateBattlePanel();
        applyIncomingStones(Math.min(3, events)); // 봇도 매치당 돌멩이 발사
    }
    renderOppBoard(botBoard);

    botState.nextAt = now + 4200 + Math.random() * 2800;
}

// 봇 보드에서 매치 가능한 스왑 찾기 (시작 위치 랜덤화로 패턴 단조로움 방지)
function findSwapOn(b) {
    const isStone = (r, c) => b[r] && b[r][c] && b[r][c].id === 'stone';
    const rOff = Math.floor(Math.random() * BOARD_SIZE);
    const cOff = Math.floor(Math.random() * BOARD_SIZE);
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            const r = (i + rOff) % BOARD_SIZE;
            const c = (j + cOff) % BOARD_SIZE;
            if (isStone(r, c)) continue;
            if (c < BOARD_SIZE - 1 && !isStone(r, c + 1)) {
                swapOn(b, r, c, r, c + 1);
                const m = findMatchesOn(b).length;
                swapOn(b, r, c, r, c + 1);
                if (m > 0) return { r1: r, c1: c, r2: r, c2: c + 1 };
            }
            if (r < BOARD_SIZE - 1 && !isStone(r + 1, c)) {
                swapOn(b, r, c, r + 1, c);
                const m = findMatchesOn(b).length;
                swapOn(b, r, c, r + 1, c);
                if (m > 0) return { r1: r, c1: c, r2: r + 1, c2: c };
            }
        }
    }
    return null;
}

// 봇 보드의 매치/연쇄를 즉시 정산 (이벤트 수 반환)
function botResolveBoard() {
    let events = 0;
    let guard = 0;
    while (guard++ < 10) {
        const matches = findMatchesOn(botBoard);
        if (matches.length === 0) break;
        events++;
        // 매치 인접 돌멩이도 파괴 (플레이어와 같은 규칙)
        const stoneKill = [];
        const seen = new Set();
        matches.forEach(({ row, col }) => {
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
                const r = row + dr, c = col + dc;
                if (r < 0 || c < 0 || r >= BOARD_SIZE || c >= BOARD_SIZE) return;
                const k = r + '-' + c;
                if (seen.has(k)) return;
                if (botBoard[r][c] && botBoard[r][c].id === 'stone') { seen.add(k); stoneKill.push({ r, c }); }
            });
        });
        matches.forEach(({ row, col }) => { botBoard[row][col] = null; });
        stoneKill.forEach(({ r, c }) => { botBoard[r][c] = null; });
        dropDownOn(botBoard);
        fillEmptyOn(botBoard, getCurrentCrops());
    }
    return events;
}

// 돌멩이는 두고 나머지 작물만 섞기
function botShuffleBoard() {
    const cells = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (botBoard[r][c] && botBoard[r][c].id !== 'stone') cells.push({ r, c });
        }
    }
    const crops = cells.map(({ r, c }) => botBoard[r][c]);
    for (let i = crops.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [crops[i], crops[j]] = [crops[j], crops[i]];
    }
    cells.forEach(({ r, c }, i) => { botBoard[r][c] = crops[i]; });
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
        playWinFanfare();
        emoji.innerHTML = spriteTag('trophy');
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
        playLoseSound();
        emoji.innerHTML = spriteTag('heartbreak');
        title.textContent = '패배...';
        desc.textContent = reason === 'forfeit' ? '기권해서 패배 처리됐어요' : '다음엔 이길 수 있어요!';
    } else {
        emoji.innerHTML = spriteTag('star');
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

// ============================================
// 🍽️ 먹방대회 — 60초 점수 어택, 주간 랭킹전
// 하트 1개로 도전, 지운 칸 × 10 × 콤보로 점수 계산, 최고 기록이 랭킹에 등록됨
// ============================================
async function goToContest() {
    initAudio();
    document.getElementById('contest-overlay').classList.add('active');
    const info = document.getElementById('contest-my-info');
    info.innerHTML = '랭킹 불러오는 중...';

    const json = await apiCall({ action: 'contest_rank', userId: getUserId() }, 1);
    if (json && json.ok) {
        contestMyBest = json.myBest || 0;
        let html = '';
        if (json.myBest > 0) {
            html += '이번 주 내 최고: <b>' + json.myBest.toLocaleString() + '점</b> (' + json.myRank + '위 / ' + json.total + '명)<br>';
        } else {
            html += '이번 주 첫 도전이에요!<br>';
        }
        if (json.top && json.top.length > 0) {
            html += '👑 현재 1위: ' + json.top[0].name + ' — ' + Number(json.top[0].score).toLocaleString() + '점';
        } else {
            html += '👑 아직 1위가 없어요. 지금이 기회!';
        }
        info.innerHTML = html;
    } else {
        info.innerHTML = '랭킹을 불러오지 못했어요.<br>도전은 가능해요!';
    }
}

function closeContestIntro() {
    document.getElementById('contest-overlay').classList.remove('active');
}

function startContest() {
    if (lastContestDate === todayKST() && !testMode) {
        showToast('🍽️ 먹방대회는 하루에 1번만! 내일 다시 도전해주세요.');
        return;
    }
    if (hearts <= 0 && !isHeartTest()) {
        closeContestIntro();
        document.getElementById('contest-result-overlay').classList.remove('active');
        document.getElementById('no-heart-overlay').classList.add('active');
        return;
    }
    if (!isHeartTest()) hearts--;
    saveState();
    updateHeartUI();
    closeContestIntro();
    document.getElementById('contest-result-overlay').classList.remove('active');
    startContestSession();
}

function startContestSession() {
    lastContestDate = todayKST(); // 입장 시점에 1일 1회 소진
    saveState();
    contestMode = true;
    contestSizeStep = 0;
    contestFinishing = false;
    contestScore = 0;
    showScreen('puzzle');
    document.getElementById('screen-puzzle').classList.add('contest');
    stopBigFarmWandering();

    puzzleTimer = CONTEST_TIME;
    timerMax = CONTEST_TIME;
    comboCount = 0;
    cumulativeCombo = 0;
    bombReady = false;
    selectedCell = null;
    isLocked = false;
    sessionHintsLeft = HINT_FREE_COUNT;
    sessionMatches = 0;
    sessionMaxCombo = 1;
    sessionGainedExp = 0;
    droppedCropQueue = [];
    animalIsMovingToFood = false;

    updateHintButton();
    updateComboGauge();
    updateContestPanel();

    // 먹는 연출용 동물 (EXP는 없지만 먹방답게 먹는 모습은 보여줌)
    const a = getActiveAnimal() || farmAnimals[0];
    const spot = document.getElementById('puzzle-active-spot');
    if (spot) {
        spot.innerHTML = spriteTag(a ? animalSpriteName(a) : 'chick');
        spot.classList.remove('adult');
    }
    activePosX = 20;
    activePosY = 8;
    initActiveAnimalPosition();

    board = createBoard();
    renderBoard();
    if (findHintCandidates().length === 0) reshuffleBoard();
    startTimer();
    startActiveAnimalWandering();
    startBGM();
    playSpecialSpawnSound();
}

function updateContestPanel() {
    const s = document.getElementById('contest-score');
    if (s) s.textContent = contestScore.toLocaleString();
    const b = document.getElementById('contest-best');
    if (b) b.textContent = contestMyBest > 0 ? '주간 최고 ' + contestMyBest.toLocaleString() : '';
    updateContestAnimalSize();
}

// 먹방대회: 점수가 오를수록 먹는 동물이 점점 커짐 (1.0배 → 최대 2.6배)
// 만점 기준 6000점에서 최대 크기. 단계별로 커질 때 통통 튀는 연출 + 효과음
let contestSizeStep = 0;
function updateContestAnimalSize() {
    const spot = document.getElementById('puzzle-active-spot');
    if (!spot) return;
    const ratio = Math.min(1, contestScore / 6000);
    const scale = 1 + ratio * 1.6; // 1.0 ~ 2.6배
    spot.style.setProperty('--contest-scale', scale.toFixed(2));
    spot.classList.add('contest-grow');

    // 0.2배 단위로 한 계단 커질 때마다 통통 + 효과음
    const step = Math.floor(ratio * 8);
    if (step > contestSizeStep) {
        contestSizeStep = step;
        spot.classList.remove('grow-pop');
        void spot.offsetWidth;
        spot.classList.add('grow-pop');
        playSpecialSpawnSound();
    }
}

async function finishContest() {
    if (contestFinishing) return;
    contestFinishing = true;

    stopTimer();
    stopActiveAnimalWandering();
    stopBGM();
    isLocked = true;
    const myScore = contestScore;

    showLoading('점수 등록 중...');
    const json = await apiCall({
        action: 'contest_submit',
        userId: getUserId(),
        name: getUserName(),
        score: myScore
    }, 1);
    hideLoading();

    contestMode = false;
    isLocked = false;
    document.getElementById('screen-puzzle').classList.remove('contest');
    const spot = document.getElementById('puzzle-active-spot');
    if (spot) {
        spot.classList.remove('contest-grow', 'grow-pop');
        spot.style.removeProperty('--contest-scale');
    }

    document.getElementById('contest-result-score').textContent = myScore.toLocaleString() + '점';
    const rankEl = document.getElementById('contest-result-rank');
    const listEl = document.getElementById('contest-rank-list');

    if (json && json.ok) {
        contestMyBest = json.myBest || myScore;
        const isNewBest = myScore >= contestMyBest && myScore > 0;
        rankEl.innerHTML = (isNewBest ? '🎉 신기록! ' : '') +
            '이번 주 <b>' + json.myRank + '위</b> / ' + json.total + '명' +
            ' (최고 ' + Number(json.myBest).toLocaleString() + '점)';
        listEl.innerHTML = renderRankList(json.top || []);
        if (json.myRank <= 3) playWinFanfare();
        else playSpecialSpawnSound();
    } else {
        rankEl.textContent = '⚠️ 랭킹 서버 연결 실패 — 이번 점수는 등록되지 않았어요.';
        listEl.innerHTML = '';
        playLoseSound();
    }

    // 1일 1회: 다시 도전 버튼 상태
    const retryBtn = document.getElementById('btn-contest-retry');
    if (retryBtn) {
        if (testMode) {
            retryBtn.disabled = false;
            retryBtn.textContent = '다시 도전 (테스트)';
        } else {
            retryBtn.disabled = true;
            retryBtn.textContent = '내일 다시 도전할 수 있어요';
        }
    }

    document.getElementById('contest-result-overlay').classList.add('active');
}

function renderRankList(top) {
    if (!top || top.length === 0) return '<div class="rank-row">아직 기록이 없어요</div>';
    const medals = ['🥇', '🥈', '🥉'];
    const myName = getUserName();
    return top.map((r, i) => {
        const me = r.name === myName ? ' me' : '';
        return '<div class="rank-row' + me + '">' +
            '<span class="rank-no">' + (medals[i] || (i + 1) + '위') + '</span>' +
            '<span class="rank-name">' + escapeHtml(r.name) + '</span>' +
            '<span class="rank-score">' + Number(r.score).toLocaleString() + '</span>' +
            '</div>';
    }).join('');
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function retryContest() {
    startContest(); // 하트 확인 포함
}

function closeContestResult() {
    document.getElementById('contest-result-overlay').classList.remove('active');
    enterMain();
}

// ---- 주간 먹방대회 보상: 1등 소, 2등 돼지, 3등 닭 (다 자란 성체) ----
// 매주 월요일 지난주 톱3가 확정되고, 접속하면 자동으로 농장에 도착
async function checkContestReward() {
    if (!getUserId()) return;
    // 1단계: 받을 보상이 있는지 확인만 (claim 처리 안 함)
    const peek = await apiCall({ action: 'contest_claim', userId: getUserId(), confirm: false }, 0);
    if (!peek || !peek.ok || !peek.reward) return;

    if (farmAnimals.length >= MAX_FARM_SLOTS) {
        showToast('🏆 대회 보상 동물이 기다리고 있어요! 농장 자리를 비우면 자동으로 도착해요.');
        return; // claim 안 했으니 다음 접속 때 다시 시도됨
    }

    // 2단계: 실제 수령 처리
    const json = await apiCall({ action: 'contest_claim', userId: getUserId(), confirm: true }, 1);
    if (!json || !json.ok || !json.reward) return;
    grantContestReward(json.reward);
}

function grantContestReward(reward) {
    const stageNames = { cow: '소', pig: '돼지', chicken: '닭' };
    const medalNames = { 1: '금메달', 2: '은메달', 3: '동메달' };
    const stage = ['cow', 'pig', 'chicken'].includes(reward.stage) ? reward.stage : 'chicken';

    const animal = {
        id: generateAnimalId(),
        name: medalNames[reward.rank] || '챔피언',
        stage: stage,
        level: MAX_LEVEL, // 다 자란 성체 → 바로 룰렛 가능
        exp: 0,
        posX: 60 + Math.random() * 150,
        posY: 100 + Math.random() * 40,
        facingRight: true
    };
    farmAnimals.push(animal);
    saveStateNow();
    if (screenMain && screenMain.classList.contains('active')) renderBigFarm();

    playWinFanfare();
    document.getElementById('prize-emoji').innerHTML = spriteTag(stage);
    document.getElementById('prize-title').textContent = '🏆 지난주 먹방대회 ' + reward.rank + '등!';
    document.getElementById('prize-label').textContent = stageNames[stage] + ' 한 마리 증정!';
    document.getElementById('prize-desc').textContent = '농장에 도착했어요.\n다 자란 동물이라 바로 룰렛도 돌릴 수 있어요!';
    document.getElementById('prize-overlay').classList.add('active');
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
        lastBattleDate = result.data.lastBattleDate || '';
        lastContestDate = result.data.lastContestDate || '';
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

    // 지난주 먹방대회 보상 확인 (화면 안착 후)
    setTimeout(checkContestReward, 1500);
}

function init() {
    loadSoundSetting();

    // 로그인 로고를 마인크래프트 잔디 블록으로
    const logo = document.querySelector('.login-logo');
    if (logo) logo.innerHTML = spriteTag('grassblock');

    // data-icon 속성이 있는 모든 요소에 픽셀 아이콘 주입
    document.querySelectorAll('[data-icon]').forEach(el => {
        el.innerHTML = spriteTag(el.dataset.icon);
    });

    initBoardInput(); // 탭 + 스와이프 입력
    
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