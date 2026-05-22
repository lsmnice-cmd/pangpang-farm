// ============================================
// 백엔드 (Google Apps Script) 연동
// ============================================
const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbyLv8diy8EwsdaNl_lkEza3U2gkHqudkrxzVMPC_VM9tOhcovikesaK-E3frY-77JA/exec';

function getOrCreateUserId() {
    let uid = localStorage.getItem('pangpang-user-id');
    if (!uid) {
        uid = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        localStorage.setItem('pangpang-user-id', uid);
    }
    return uid;
}

async function saveToBackend(state) {
    try {
        const res = await fetch(BACKEND_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'save',
                userId: getOrCreateUserId(),
                name: (farmAnimals[0] && farmAnimals[0].name) || '',
                data: state
            })
        });
        const json = await res.json();
        console.log('💾 백엔드 저장:', json);
        return json;
    } catch (e) {
        console.warn('백엔드 저장 실패 (로컬은 정상)', e);
    }
}

async function loadFromBackend() {
    try {
        const uid = getOrCreateUserId();
        const url = BACKEND_URL + '?action=load&userId=' + encodeURIComponent(uid);
        const res = await fetch(url);
        const json = await res.json();
        console.log('📥 백엔드 불러옴:', json);
        if (json.ok && json.data) {
            return json.data;
        }
        return null;
    } catch (e) {
        console.warn('백엔드 불러오기 실패', e);
        return null;
    }
}

async function recordWinToBackend(animal, reward) {
    try {
        await fetch(BACKEND_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'win',
                userId: getOrCreateUserId(),
                name: animal.name,
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
// 게임 설정
// ============================================
const BOARD_SIZE = 6;

const ALL_CROPS = [
    { id: 'apple',     emoji: '🍎', name: '사과' },
    { id: 'banana',    emoji: '🍌', name: '바나나' },
    { id: 'tomato',    emoji: '🍅', name: '토마토' },
    { id: 'corn',      emoji: '🌽', name: '옥수수' },
    { id: 'cucumber',  emoji: '🥒', name: '오이' },
    { id: 'eggplant',  emoji: '🍆', name: '가지' },
    { id: 'onion',     emoji: '🧅', name: '양파' },
    { id: 'grape',     emoji: '🍇', name: '포도' },
    { id: 'garlic',    emoji: '🧄', name: '마늘' }
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
const DAILY_EXP_LIMIT = 4800;
const MATCH_BASE_EXP = 25;
const INITIAL_TIME = 120;
const HINT_FREE_COUNT = 3;
const HINT_TIME_COST = 30;
const TIME_PER_MATCH = 1;

// ============================================
// 게임 상태
// ============================================
let board = [];
let selectedCell = null;
let isLocked = false;
let comboCount = 0;
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

// DOM
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

const skyMain = document.getElementById('sky-main');
const celestialMain = document.getElementById('celestial-main');
const cloudsMain = document.getElementById('clouds-main');
const starsMain = document.getElementById('stars-main');
const timeTextMain = document.getElementById('time-text-main');

// ============================================
// 저장/불러오기
// ============================================
function saveState() {
    const state = {
        farmAnimals, activeAnimalId, hearts,
        dailyEatenToday, lastResetDate
    };
    localStorage.setItem('pangpang-farm-v4', JSON.stringify(state));
    saveToBackend(state);
}

function loadState() {
    const raw = localStorage.getItem('pangpang-farm-v4');
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
        console.error('저장 불러오기 실패', e);
        return false;
    }
}

function resetAllData() {
    localStorage.removeItem('pangpang-farm-v4');
    localStorage.removeItem('pangpang-user-id');
    location.reload();
}

// ============================================
// 일일 리셋
// ============================================
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

// ============================================
// 시간대 배경
// ============================================
function updateSkyByTime() {
    const korea = getKoreaTime();
    const hour = korea.getHours();
    const minute = korea.getMinutes();
    const hourFloat = hour + minute / 60;

    if (timeTextMain) {
        timeTextMain.textContent =
            String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
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

// ============================================
// 화면 전환
// ============================================
function showScreen(name) {
    [screenMain, screenPuzzle, screenResult].forEach(s => {
        if (s) s.classList.remove('active');
    });
    if (name === 'main') screenMain.classList.add('active');
    if (name === 'puzzle') screenPuzzle.classList.add('active');
    if (name === 'result') screenResult.classList.add('active');
}

// ============================================
// 동물 관리
// ============================================
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

function getAnimalStageName(animal) {
    const s = STAGES[animal.stage];
    return animal.level >= MAX_LEVEL ? s.adultName : s.babyName;
}

// ============================================
// 큰 농장 렌더링
// ============================================
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
        const el = bigAnimalsContainer.querySelector(`[data-animal-id="${id}"]`);
        if (el) {
            el.style.transition = 'transform 0.3s';
            el.style.transform = (animal.facingRight ? 'scaleX(1)' : 'scaleX(-1)') + ' translateY(-8px)';
            setTimeout(() => {
                el.style.transform = animal.facingRight ? 'scaleX(1)' : 'scaleX(-1)';
            }, 300);
        }
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

// ============================================
// 첫 접속
// ============================================
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

// ============================================
// 메인
// ============================================
function enterMain() {
    showScreen('main');
    updateHeartUI();
    renderBigFarm();
    startBigFarmWandering();
    updateSkyByTime();
}

function goToMain() {
    enterMain();
}

function updateHeartUI() {
    if (heartCountMain) heartCountMain.textContent = hearts;
}

// ============================================
// 퍼즐 시작
// ============================================
function goToPuzzle() {
    if (!activeAnimalId || !getActiveAnimal() || getActiveAnimal().level >= MAX_LEVEL) {
        const growing = farmAnimals.find(a => a.level < MAX_LEVEL);
        if (growing) {
            activeAnimalId = growing.id;
        } else {
            if (farmAnimals.length >= MAX_FARM_SLOTS) {
                alert('농장이 꽉 찼어요! 동물 하나를 룰렛/승급으로 보내주세요');
                return;
            }
            const newBaby = createNewBabyChicken('병아리' + (farmAnimals.length + 1));
            farmAnimals.push(newBaby);
            activeAnimalId = newBaby.id;
        }
        saveState();
    }

    if (dailyEatenToday >= DAILY_EXP_LIMIT) {
        document.getElementById('full-overlay').classList.add('active');
        return;
    }

    if (hearts <= 0) {
        document.getElementById('no-heart-overlay').classList.add('active');
        return;
    }

    hearts--;
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
    selectedCell = null;
    isLocked = false;
    droppedCropQueue = [];
    animalIsMovingToFood = false;

    const active = getActiveAnimal();
    sessionStartLevel = active ? active.level : 1;

    activePosX = 20;
    activePosY = 8;

    updatePuzzleUI();
    initActiveAnimalPosition();
    board = createBoard();
    renderBoard();
    startTimer();
    startActiveAnimalWandering();
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
// 타이머
// ============================================
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
    const min = Math.floor(puzzleTimer / 60);
    const sec = puzzleTimer % 60;
    if (timerText) {
        timerText.textContent = min + ':' + String(sec).padStart(2, '0');
    }
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

// ============================================
// 힌트
// ============================================
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
                if (matches.length > 0) {
                    results.push([{row, col}, {row, col: col + 1}]);
                }
            }
            if (row < BOARD_SIZE - 1) {
                swap(row, col, row + 1, col);
                const matches = findMatches();
                swap(row, col, row + 1, col);
                if (matches.length > 0) {
                    results.push([{row, col}, {row: row + 1, col}]);
                }
            }
        }
    }
    return results;
}

// ============================================
// 보드
// ============================================
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
    sessionMatches++;
    if (comboCount > sessionMaxCombo) sessionMaxCombo = comboCount;
    const multiplier = comboCount;
    const expGain = MATCH_BASE_EXP * multiplier;

    if (multiplier >= 2) {
        comboText.textContent = multiplier;
        comboBox.style.opacity = '1';
        comboBox.style.transform = 'scale(1.2)';
        setTimeout(() => { comboBox.style.transform = 'scale(1)'; }, 200);
        setTimeout(() => { comboBox.style.opacity = '0'; }, 1500);
    }

    addTime(TIME_PER_MATCH);

    const matchData = matches.map(m => ({ row: m.row, col: m.col, crop: board[m.row][m.col] }));
    if (matchData.length > 0 && matchData[0]) {
        showScorePopup(matchData[0], expGain, multiplier);
    }

    matchData.forEach(m => {
        const cell = boardElement.children[m.row * BOARD_SIZE + m.col];
        if (cell) {
            spawnParticles(cell);
            cell.classList.add('matching');
        }
    });

    // 매치 1번 = 작물 1개만 떨어짐
    if (matchData[0] && matchData[0].crop) {
        const firstCell = boardElement.children[matchData[0].row * BOARD_SIZE + matchData[0].col];
        if (firstCell) {
            dropCropToField(firstCell, matchData[0].crop);
        }
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
    if (dailyEatenToday >= DAILY_EXP_LIMIT) {
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

// ============================================
// 작물 → 들판 → 동물이 먹으러 감
// ============================================
function dropCropToField(cell, crop) {
    const farmEl = document.getElementById('puzzle-mini-farm');
    const dropsLayer = document.getElementById('dropped-crops-layer');
    if (!farmEl || !dropsLayer) return;

    const cellRect = cell.getBoundingClientRect();
    const farmRect = farmEl.getBoundingClientRect();
    const dropsRect = dropsLayer.getBoundingClientRect();

    const startX = cellRect.left + cellRect.width / 2 - 13;
    const startY = cellRect.top + cellRect.height / 2 - 13;

    const padX = 20;
    const padBottom = 8;
    const padTop = 20;
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

        droppedCropQueue.push({
            element: dropped,
            xInLayer: randXInLayer,
            yInLayer: randYInLayer
        });

        if (!animalIsMovingToFood) {
            eatNextDroppedCrop();
        }
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

    if (targetXInFarm > activePosX) {
        animal.style.transform = 'scaleX(1)';
    } else if (targetXInFarm < activePosX) {
        animal.style.transform = 'scaleX(-1)';
    }

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
    if (multiplier >= 2) {
        popup.classList.add('combo');
        popup.textContent = '×' + multiplier + ' +' + expGain;
    } else {
        popup.textContent = '+' + expGain;
    }
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

// ============================================
// 세션 종료 → 결과
// ============================================
function endPuzzleSession(reason) {
    stopTimer();
    stopActiveAnimalWandering();
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

// ============================================
// Lv.10 모달
// ============================================
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
    if (screenPuzzle.classList.contains('active')) {
        endPuzzleSession('timeout');
    } else {
        renderBigFarm();
    }
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

    if (screenPuzzle.classList.contains('active')) {
        endPuzzleSession('timeout');
    } else {
        renderBigFarm();
    }
}

function chooseRoulette() {
    closeAdultModal();
    showRoulette();
}

function closeAdultModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    isLocked = false;
}

// ============================================
// 룰렛
// ============================================
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
            document.getElementById('prize-desc').textContent =
                '쿠폰은 스마트스토어에서\n일괄 발급됩니다.';
        } else if (reward.type === 'product') {
            document.getElementById('prize-desc').textContent =
                '실물 상품 당첨!\n별도 연락드릴게요.';
        }
    }

    if (animal) {
        // 백엔드에 당첨 기록 (꽝 제외)
        if (reward.type !== 'miss') {
            recordWinToBackend(animal, reward);
        }
        farmAnimals = farmAnimals.filter(a => a.id !== animal.id);
        if (activeAnimalId === animal.id) activeAnimalId = null;
        saveState();
    }

    document.getElementById('roulette-overlay').classList.remove('active');
    document.getElementById('prize-overlay').classList.add('active');

    console.log('🎯 당첨 결과:', {
        animalName: animal ? animal.name : '?',
        stage: animal ? animal.stage : '?',
        rewardLabel: reward.label,
        rewardType: reward.type,
        rewardValue: reward.value,
        timestamp: new Date().toISOString()
    });
}

function closePrize() {
    document.getElementById('prize-overlay').classList.remove('active');
    chosenRewardIndex = -1;
    if (screenPuzzle.classList.contains('active')) {
        endPuzzleSession('timeout');
    } else {
        renderBigFarm();
    }
}

// ============================================
// 모달 닫기
// ============================================
function closeNoHeart() {
    document.getElementById('no-heart-overlay').classList.remove('active');
}

function closeFull() {
    document.getElementById('full-overlay').classList.remove('active');
}

function openSettings() {
    document.getElementById('settings-overlay').classList.add('active');
}

function closeSettings() {
    document.getElementById('settings-overlay').classList.remove('active');
}

function confirmReset() {
    if (confirm('정말 모든 데이터를 초기화할까요?\n농장 동물, 진행도가 모두 사라집니다.')) {
        resetAllData();
    }
}

// ============================================
// 부팅
// ============================================
async function boot() {
    const loaded = loadState();
    
    // 백엔드에서 더 최신 데이터 시도
    const serverData = await loadFromBackend();
    if (serverData) {
        farmAnimals = serverData.farmAnimals || [];
        activeAnimalId = serverData.activeAnimalId || null;
        hearts = serverData.hearts !== undefined ? serverData.hearts : 3;
        dailyEatenToday = serverData.dailyEatenToday || 0;
        lastResetDate = serverData.lastResetDate || '';
        console.log('✅ 서버에서 데이터 복원됨');
    }
    
    checkDailyReset();
    createStars();
    updateSkyByTime();
    setInterval(updateSkyByTime, 60000);

    if ((!loaded && !serverData) || farmAnimals.length === 0) {
        startFirstTime();
    } else {
        enterMain();
    }
}

boot();