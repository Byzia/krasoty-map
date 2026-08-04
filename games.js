// Модуль управления игровым центром, статистикой, ачивками и мини-играми

const VK_GAME_STATS_KEY = 'krasoty_planety_game_stats';
const VK_PUBLIC_URL = 'https://vk.ru/thebeautyofplan';
// APP_SHARE_LINK теперь общий для всего приложения — объявлен в profile.js

// Резервные локации для игры на случай отсутствия сети/данных
const FALLBACK_QUIZ_PLACES = [
    { id: 901, title: 'Замок Нойшванштайн', category: 'Замки', image: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=600', lat: 47.5576, lng: 10.7498, link: 'https://vk.ru/thebeautyofplan' },
    { id: 902, title: 'Эйфелева башня', category: 'Архитектура', image: 'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?q=80&w=600', lat: 48.8584, lng: 2.2945, link: 'https://vk.ru/thebeautyofplan' },
    { id: 903, title: 'Мачу-Пикчу', category: 'Горы', image: 'https://images.unsplash.com/photo-1526392060635-9d6019884377?q=80&w=600', lat: -13.1631, lng: -72.5450, link: 'https://vk.ru/thebeautyofplan' },
    { id: 904, title: 'Великий Каньон', category: 'Каньоны', image: 'https://images.unsplash.com/photo-1474044159687-1ee9f3a51722?q=80&w=600', lat: 36.1069, lng: -112.1129, link: 'https://vk.ru/thebeautyofplan' },
    { id: 905, title: 'Тадж-Махал', category: 'Дворцы', image: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?q=80&w=600', lat: 27.1751, lng: 78.0421, link: 'https://vk.ru/thebeautyofplan' },
    { id: 906, title: 'Водопад Игуасу', category: 'Водопады', image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=600', lat: -25.6953, lng: -54.4367, link: 'https://vk.ru/thebeautyofplan' },
    { id: 907, title: 'Колизей', category: 'Архитектура', image: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?q=80&w=600', lat: 41.8902, lng: 12.4922, link: 'https://vk.ru/thebeautyofplan' },
    { id: 908, title: 'Плитивицкие озёра', category: 'Озера', image: 'https://images.unsplash.com/photo-1589182373726-e4f658ab50f0?q=80&w=600', lat: 44.8805, lng: 15.6162, link: 'https://vk.ru/thebeautyofplan' }
];

// Общий объект игровой статистики и ачивок пользователя
let userGameStats = {
    puzzle: {
        solved: 0,
        bestTime: null,
        bestMoves: null,
        totalMoves: 0,
        solvedByDifficulty: { easy: 0, medium: 0, hard: 0 }
    },
    quiz: {
        played: 0,
        bestScore: 0,
        totalCorrect: 0,
        totalQuestions: 0,
        perfectRounds: 0,
        perfectHardRounds: 0
    },
    streak: {
        current: 0,
        longest: 0,
        lastPlayDate: null
    },
    notificationsPromptShown: false,
    achievements: {
        firstPuzzle: false,
        puzzleMaster: false,
        puzzleLegend: false,
        speedDemon: false,
        hardPuzzleSolved: false,
        firstQuiz: false,
        quizVeteran: false,
        quizExpert: false,
        quizHardPerfect: false,
        streak3: false,
        streak7: false,
        streak30: false,
        inviteFirst: false,
        inviteFive: false
    }
};

// Настройки уровней сложности
const PUZZLE_DIFFICULTIES = {
    easy:   { label: 'Лёгкий',  grid: 3, icon: 'fa-seedling', color: '#4caf50' },
    medium: { label: 'Средний', grid: 4, icon: 'fa-fire',     color: '#ff9800' },
    hard:   { label: 'Сложный', grid: 5, icon: 'fa-skull',    color: '#f44336' }
};

const QUIZ_DIFFICULTIES = {
    easy:   { label: 'Лёгкий',  count: 4,  icon: 'fa-seedling', color: '#4caf50' },
    medium: { label: 'Средний', count: 6,  icon: 'fa-fire',     color: '#ff9800' },
    hard:   { label: 'Сложный', count: 10, icon: 'fa-skull',    color: '#f44336' }
};

// Обновление серии дней подряд — вызывается при завершении любой игры
function updateStreak() {
    if (!userGameStats.streak) {
        userGameStats.streak = { current: 0, longest: 0, lastPlayDate: null };
    }
    const s = userGameStats.streak;

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    if (s.lastPlayDate === todayStr) return; // сегодня уже засчитано

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    s.current = (s.lastPlayDate === yesterdayStr) ? s.current + 1 : 1;
    if (s.current > s.longest) s.longest = s.current;
    s.lastPlayDate = todayStr;
}

// Состояние игры «Пазл»
let puzzleState = {
    activePlace: null,
    tiles: [],
    selectedTileIndex: null,
    moves: 0,
    seconds: 0,
    timerInterval: null,
    isCompleted: false,
    isNewRecord: false
};

// Состояние игры «Квиз / Викторина»
let quizState = {
    questions: [],
    currentQuestionIndex: 0,
    score: 0,
    correctCount: 0,
    seconds: 0,
    timerInterval: null,
    isAnswered: false,
    selectedOptionIndex: null,
    isCompleted: false,
    isNewRecord: false
};

// 1. Загрузка статистики из VK Storage / localStorage
async function loadGameStatsFromVK() {
    if (window.vkBridge) {
        try {
            const data = await vkBridge.send('VKWebAppStorageGet', { keys: [VK_GAME_STATS_KEY] });
            if (data && data.keys && data.keys[0] && data.keys[0].value) {
                const loaded = JSON.parse(data.keys[0].value);
                userGameStats = { ...userGameStats, ...loaded };
            }
        } catch (e) {
            fallbackLoadStats();
        }
    } else {
        fallbackLoadStats();
    }
}

function fallbackLoadStats() {
    try {
        const local = localStorage.getItem(VK_GAME_STATS_KEY);
        if (local) {
            userGameStats = { ...userGameStats, ...JSON.parse(local) };
        }
    } catch (e) {}
}

// 2. Сохранение статистики
async function saveGameStatsToVK() {
    const json = JSON.stringify(userGameStats);
    try {
        localStorage.setItem(VK_GAME_STATS_KEY, json);
    } catch (e) {}

    if (window.vkBridge) {
        try {
            await vkBridge.send('VKWebAppStorageSet', { key: VK_GAME_STATS_KEY, value: json });
        } catch (e) {}
    }
}

// Проверка и выдача ачивок
function checkAchievements() {
    const p = userGameStats.puzzle;
    const q = userGameStats.quiz;
    const s = userGameStats.streak;
    const a = userGameStats.achievements;

    if (p.solved >= 1) a.firstPuzzle = true;
    if (p.solved >= 10) a.puzzleMaster = true;
    if (p.solved >= 25) a.puzzleLegend = true;
    if (p.bestTime !== null && p.bestTime <= 20) a.speedDemon = true;
    if (p.solvedByDifficulty && p.solvedByDifficulty.hard >= 1) a.hardPuzzleSolved = true;

    if (q.played >= 1) a.firstQuiz = true;
    if (q.played >= 10) a.quizVeteran = true;
    if (q.perfectRounds >= 1) a.quizExpert = true;
    if (q.perfectHardRounds >= 1) a.quizHardPerfect = true;

    if (s) {
        if (s.longest >= 3) a.streak3 = true;
        if (s.longest >= 7) a.streak7 = true;
        if (s.longest >= 30) a.streak30 = true;
    }
}

// Инициализация вкладки Игр
async function initGamesTab() {
    const container = document.getElementById('games-container');
    if (!container) return;

    await loadGameStatsFromVK();

    if (puzzleState.activePlace) {
        renderPuzzleScreen();
    } else if (quizState.questions.length > 0 && !quizState.isCompleted) {
        renderQuizScreen();
    } else {
        renderGamesHub();
        // Не блокируем отрисовку хаба сетевым запросом — статус уведомлений
        // нужен только позже, для попапа после ачивки "Разогрев"
        refreshNotificationsStatus();
    }
}

// Проверяем в Supabase, разрешил ли пользователь уже уведомления о серии —
// чтобы не показывать кнопку "включить" повторно
let notificationsAllowedCache = false;
async function refreshNotificationsStatus() {
    if (!vkUserData || !vkUserData.id) return;
    try {
        const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/leaderboard?select=notifications_allowed&vk_user_id=eq.${vkUserData.id}`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        if (!res.ok) return;
        const rows = await res.json();
        notificationsAllowedCache = !!(rows && rows[0] && rows[0].notifications_allowed);
    } catch (e) {
        console.warn('Не удалось проверить статус уведомлений:', e);
    }
}

// Запрос разрешения на уведомления ВК + сохранение флага на сервере
async function enableStreakNotifications() {
    if (!window.vkBridge) {
        showAppToast('Доступно только внутри приложения ВКонтакте!', true);
        return;
    }
    try {
        const result = await vkBridge.send('VKWebAppAllowNotifications');
        if (result && result.result) {
            await setNotificationsAllowedOnServer(true);
            notificationsAllowedCache = true;
        }
    } catch (e) {
        console.log('Пользователь не разрешил уведомления:', e);
    }
}

// Показываем предложение включить напоминания один раз — в момент,
// когда у человека уже есть что терять (после 3 дней подряд), а не сразу.
function maybeShowNotificationsPrompt() {
    if (notificationsAllowedCache) return;
    if (userGameStats.notificationsPromptShown) return;
    if (!userGameStats.achievements || !userGameStats.achievements.streak3) return;

    userGameStats.notificationsPromptShown = true;
    saveGameStatsToVK();

    setTimeout(() => {
        showNotificationsPromptModal();
    }, 1400);
}

function showNotificationsPromptModal() {
    const modal = document.getElementById('modal-overlay');
    if (!modal) return;

    modal.innerHTML = `
        <div class="modal-card" style="padding: 28px 24px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 12px;">🔥</div>
            <h3 style="margin: 0 0 10px 0; font-size: 19px; color: #ffffff;">3 дня подряд — это уже серия!</h3>
            <p style="color: #aaaaaa; font-size: 14px; line-height: 1.4; margin-bottom: 22px;">
                Хочешь, будем присылать напоминание, если однажды забудешь зайти и случайно потеряешь серию?
            </p>
            <div style="display: flex; gap: 10px;">
                <button class="feed-btn sec" style="flex: 1; margin-left: 0;" onclick="closeModal()">Не сейчас</button>
                <button class="feed-btn prim" style="flex: 1; margin-left: 0; background: #ff9800;" onclick="closeModal(); enableStreakNotifications();">
                    <i class="fa-solid fa-bell"></i> Включить
                </button>
            </div>
        </div>
    `;
    modal.classList.add('active');
}

async function showLeaderboardScreen() {
    const container = document.getElementById('games-container');
    if (!container) return;

    container.innerHTML = `
        <div class="puzzle-game-wrapper">
            <div class="puzzle-header">
                <button class="puzzle-back-btn" onclick="renderGamesHub()">
                    <i class="fa-solid fa-arrow-left"></i> Назад
                </button>
            </div>
            <div class="puzzle-place-info" style="text-align:center;">
                <h3 class="puzzle-place-title">🏆 Таблица лидеров</h3>
                <p class="puzzle-hint-text">Топ игроков по очкам и достижениям</p>
            </div>
            <div id="leaderboard-list" style="padding: 4px 16px 24px; display:flex; flex-direction:column; gap:10px;">
                <div style="text-align:center; color:#888888; padding: 30px 0;">
                    <i class="fa-solid fa-spinner fa-spin"></i> Загрузка...
                </div>
            </div>
        </div>
    `;

    const rows = await fetchLeaderboard(20);
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;

    if (!rows) {
        listEl.innerHTML = `<div style="text-align:center; color:#888888; padding: 30px 0;">Не удалось загрузить таблицу лидеров. Попробуй позже.</div>`;
        return;
    }

    if (rows.length === 0) {
        listEl.innerHTML = `<div style="text-align:center; color:#888888; padding: 30px 0;">Пока никто не сыграл — стань первым! 🚀</div>`;
        return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const myId = vkUserData ? vkUserData.id : null;

    listEl.innerHTML = rows.map((row, i) => {
        const isMe = myId && row.vk_user_id === myId;
        return `
            <div style="display:flex; align-items:center; gap:12px; background:${isMe ? 'rgba(39,135,245,0.15)' : '#1e1e1e'}; border:1px solid ${isMe ? 'rgba(39,135,245,0.5)' : 'rgba(255,255,255,0.08)'}; border-radius:14px; padding:10px 14px;">
                <div style="width:34px; text-align:center; font-size:18px; font-weight:700; color:#888888;">${medals[i] || (i + 1)}</div>
                <img src="${row.avatar || 'https://vk.com/images/camera_100.png'}" style="width:44px; height:44px; border-radius:50%; object-fit:cover; flex-shrink:0;">
                <div style="flex:1; min-width:0;">
                    <div style="font-size:14px; font-weight:600; color:#ffffff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${row.name}${isMe ? ' (ты)' : ''}</div>
                    <div style="font-size:11px; color:#888888;">🏅 ${row.achievements_count} ачивок</div>
                </div>
                <div style="font-size:16px; font-weight:700; color:#ffd700; flex-shrink:0;">${row.score}</div>
            </div>
        `;
    }).join('');
}

// Рендеринг игрового хаба с ачивками
function renderGamesHub() {
    const container = document.getElementById('games-container');
    if (!container) return;

    const pStats = userGameStats.puzzle || { solved: 0, bestTime: null, bestMoves: null };
    const pBestTime = pStats.bestTime !== null ? formatPuzzleTime(pStats.bestTime) : '--:--';
    const pBestMoves = pStats.bestMoves !== null ? `${pStats.bestMoves} ходов` : '--';

    const qStats = userGameStats.quiz || { played: 0, bestScore: 0, totalCorrect: 0, totalQuestions: 0 };
    const qAccuracy = qStats.totalQuestions > 0 ? Math.round((qStats.totalCorrect / qStats.totalQuestions) * 100) : 0;

    const a = userGameStats.achievements;
    const streak = userGameStats.streak || { current: 0, longest: 0 };
    const achievementsList = [
        { key: 'firstPuzzle', icon: 'fa-puzzle-piece', label: 'Новичок-пазл', hint: 'Соберите первый пазл' },
        { key: 'puzzleMaster', icon: 'fa-crown', label: 'Мастер пазлов', hint: 'Соберите 10 пазлов' },
        { key: 'puzzleLegend', icon: 'fa-trophy', label: 'Легенда пазлов', hint: 'Соберите 25 пазлов' },
        { key: 'speedDemon', icon: 'fa-bolt', label: 'Молния', hint: 'Соберите пазл быстрее чем за 20 секунд' },
        { key: 'hardPuzzleSolved', icon: 'fa-skull', label: 'Профи', hint: 'Соберите пазл на сложном уровне (5×5)' },
        { key: 'firstQuiz', icon: 'fa-bullseye', label: 'Эрудит', hint: 'Пройдите первую викторину' },
        { key: 'quizVeteran', icon: 'fa-book', label: 'Знаток планеты', hint: 'Пройдите 10 викторин' },
        { key: 'quizExpert', icon: 'fa-gem', label: 'Идеальный раунд', hint: 'Ответьте правильно на все вопросы викторины' },
        { key: 'quizHardPerfect', icon: 'fa-brain', label: 'Гений', hint: 'Пройдите сложную викторину без единой ошибки' },
        { key: 'streak3', icon: 'fa-fire', label: 'Разогрев', hint: 'Играйте 3 дня подряд' },
        { key: 'streak7', icon: 'fa-fire-flame-curved', label: 'Постоянство', hint: 'Играйте 7 дней подряд' },
        { key: 'streak30', icon: 'fa-meteor', label: 'Легенда путешествий', hint: 'Играйте 30 дней подряд' },
        { key: 'inviteFirst', icon: 'fa-user-plus', label: 'Первый друг', hint: 'Пригласи хотя бы одного друга в приложение' },
        { key: 'inviteFive', icon: 'fa-people-group', label: 'Амбассадор', hint: 'Пригласи 5 друзей в приложение' }
    ];
    const unlockedCount = achievementsList.filter(item => a[item.key]).length;
    const achievementsHtml = achievementsList.map(item => `
        <div class="achievement-badge ${a[item.key] ? 'unlocked' : 'locked'}" title="${item.hint}">
            <i class="fa-solid ${item.icon}"></i>
            <span>${item.label}</span>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="games-hub-header">
            <div class="games-icon-glow">
                <i class="fa-solid fa-gamepad"></i>
            </div>
            <h2 class="games-teaser-title">Игровой центр</h2>
            <p class="games-teaser-desc">
                Играйте в мини-игры, открывайте уголки планеты, собирайте достижения и соревнуйтесь с друзьями!
            </p>
        </div>

        ${streak.current > 0 ? `
        <div style="display: flex; align-items: center; gap: 8px; background: rgba(255, 152, 0, 0.12); border: 1px solid rgba(255, 152, 0, 0.35); border-radius: 12px; padding: 10px 14px; margin-bottom: 4px;">
            <i class="fa-solid fa-fire" style="color: #ff9800; font-size: 18px;"></i>
            <div style="font-size: 12px; color: #ffffff; flex: 1;">
                <b>${streak.current}</b> ${streak.current === 1 ? 'день' : 'дня(ей)'} подряд ${streak.current === 1 ? '— начало положено!' : 'подряд!'}
                <span style="color: #888888;"> · рекорд: ${streak.longest}</span>
            </div>
        </div>
        ` : ''}

        <!-- Блок достижений (Ачивок) -->
        <div style="background: #1e1e1e; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 12px 14px; margin-bottom: 4px;">
            <div style="font-size: 12px; font-weight: 700; color: #aaaaaa; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                <span><i class="fa-solid fa-medal" style="color: #ffd700;"></i> Ваши достижения</span>
                <span style="color: #666666;">${unlockedCount} / ${achievementsList.length}</span>
            </div>
            <div class="chips-scroll-container" style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none;">
                ${achievementsHtml}
            </div>
        </div>

        <button onclick="showLeaderboardScreen()" style="display:flex; align-items:center; justify-content:center; gap:8px; width:100%; background: linear-gradient(135deg, rgba(255,215,0,0.18), rgba(255,152,0,0.12)); border: 1px solid rgba(255,215,0,0.35); border-radius: 14px; padding: 12px; color:#ffd700; font-size:14px; font-weight:700; cursor:pointer; margin-bottom: 4px;">
            <i class="fa-solid fa-ranking-star"></i> Таблица лидеров
        </button>

        <div class="games-list">
            <!-- Игра 1: Мини-пазл -->
            <div class="game-card">
                <div class="game-card-body" onclick="showPuzzleDifficultySelect()">
                    <div class="game-card-icon" style="background: rgba(39, 135, 245, 0.2); color: #2787F5;">
                        <i class="fa-solid fa-puzzle-piece"></i>
                    </div>
                    <div class="game-card-info">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #ffffff;">Мини-пазл локаций</h3>
                            <span class="game-card-badge" style="position: static; flex-shrink: 0;">Доступно</span>
                        </div>
                        <p style="margin: 0; font-size: 12px; color: #aaaaaa; line-height: 1.3;">Соберите фотографию места — выберите уровень сложности!</p>
                    </div>
                </div>

                <div style="margin-top: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 10px; padding: 8px; display: flex; justify-content: space-around; text-align: center; border: 1px solid rgba(255, 255, 255, 0.05);" onclick="showPuzzleDifficultySelect()">
                    <div>
                        <div style="font-size: 9px; color: #888888;">Собрано</div>
                        <div style="font-size: 12px; font-weight: 700; color: #2787F5;">🧩 ${pStats.solved}</div>
                    </div>
                    <div>
                        <div style="font-size: 9px; color: #888888;">Рекорд времени</div>
                        <div style="font-size: 12px; font-weight: 700; color: #4caf50;">⚡ ${pBestTime}</div>
                    </div>
                    <div>
                        <div style="font-size: 9px; color: #888888;">Минимум ходов</div>
                        <div style="font-size: 12px; font-weight: 700; color: #ff9800;">🎯 ${pBestMoves}</div>
                    </div>
                </div>

                <div style="margin-top: 10px; display: flex; gap: 8px;">
                    <button class="feed-btn prim game-start-btn" style="flex: 2; margin-left: 0;" onclick="showPuzzleDifficultySelect()">
                        Играть <i class="fa-solid fa-play"></i>
                    </button>
                    <button class="feed-btn sec game-start-btn" style="flex: 1; margin-left: 0; background: #2a2a2a;" onclick="shareGameInvite('puzzle')">
                        <i class="fa-solid fa-share-nodes"></i> Поделиться
                    </button>
                </div>
            </div>

            <!-- Игра 2: Квиз -->
            <div class="game-card">
                <div class="game-card-body" onclick="showQuizDifficultySelect()">
                    <div class="game-card-icon" style="background: rgba(171, 71, 188, 0.2); color: #ab47bc;">
                        <i class="fa-solid fa-bullseye"></i>
                    </div>
                    <div class="game-card-info">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #ffffff;">Угадай место по фото</h3>
                            <span class="game-card-badge" style="position: static; flex-shrink: 0;">Доступно</span>
                        </div>
                        <p style="margin: 0; font-size: 12px; color: #aaaaaa; line-height: 1.3;">Викторина по фото уникальных мест — выберите уровень сложности!</p>
                    </div>
                </div>

                <div style="margin-top: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 10px; padding: 8px; display: flex; justify-content: space-around; text-align: center; border: 1px solid rgba(255, 255, 255, 0.05);" onclick="showQuizDifficultySelect()">
                    <div>
                        <div style="font-size: 9px; color: #888888;">Сыграно</div>
                        <div style="font-size: 12px; font-weight: 700; color: #ab47bc;">🎯 ${qStats.played}</div>
                    </div>
                    <div>
                        <div style="font-size: 9px; color: #888888;">Рекорд очков</div>
                        <div style="font-size: 12px; font-weight: 700; color: #ff9800;">🏆 ${qStats.bestScore}</div>
                    </div>
                    <div>
                        <div style="font-size: 9px; color: #888888;">Точность</div>
                        <div style="font-size: 12px; font-weight: 700; color: #4caf50;">📊 ${qAccuracy}%</div>
                    </div>
                </div>


                <div style="margin-top: 10px; display: flex; gap: 8px;">
                    <button class="feed-btn prim game-start-btn" style="flex: 2; margin-left: 0; background: #ab47bc;" onclick="showQuizDifficultySelect()">
                        Играть <i class="fa-solid fa-play"></i>
                    </button>
                    <button class="feed-btn sec game-start-btn" style="flex: 1; margin-left: 0; background: #2a2a2a;" onclick="shareGameInvite('quiz')">
                        <i class="fa-solid fa-share-nodes"></i> Поделиться
                    </button>
                </div>
            </div>

            <!-- Игра 3: Колесо фортуны (СКОРО) -->
            <div class="game-card teaser-game">
                <div class="game-card-body">
                    <div class="game-card-icon" style="background: rgba(255, 152, 0, 0.2); color: #ff9800;">
                        <i class="fa-solid fa-dharmachakra"></i>
                    </div>
                    <div class="game-card-info">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #ffffff;">Колесо путешествий</h3>
                            <span class="game-card-badge upcoming" style="position: static; flex-shrink: 0;">Скоро</span>
                        </div>
                        <p style="margin: 0; font-size: 12px; color: #aaaaaa; line-height: 1.3;">Рулетка случайных приключений на эти выходные.</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function shareGameInvite(gameType) {
    const text = gameType === 'puzzle' 
        ? '🧩 Собирай фото уникальных мест планеты на время в мини-пазлах!' 
        : '🎯 Сможешь угадать все редкие уголки мира по фотографиям в нашем квизе?';

    if (window.vkBridge) {
        vkBridge.send('VKWebAppShare', { link: APP_SHARE_LINK, text: text })
            .catch(() => {});
    } else {
        navigator.clipboard.writeText(APP_SHARE_LINK);
        showAppToast('Ссылка на игровой центр скопирована в буфер обмена!', false);
    }
}

/* ==========================================================================
   🎮 ИГРА 1: МИНИ-ПАЗЛ
   ========================================================================== */

function difficultySelectHtml(difficultiesObj, startFnName, extraLabelFn) {
    return Object.entries(difficultiesObj).map(([key, d]) => `
        <button class="difficulty-card" style="border-color: ${d.color}66;" onclick="${startFnName}('${key}')">
            <i class="fa-solid ${d.icon}" style="color: ${d.color};"></i>
            <span class="difficulty-title">${d.label}</span>
            <span class="difficulty-sub">${extraLabelFn(d)}</span>
        </button>
    `).join('');
}

function showPuzzleDifficultySelect() {
    const container = document.getElementById('games-container');
    if (!container) return;

    container.innerHTML = `
        <div class="puzzle-game-wrapper">
            <div class="puzzle-header">
                <button class="puzzle-back-btn" onclick="renderGamesHub()">
                    <i class="fa-solid fa-arrow-left"></i> Назад
                </button>
            </div>
            <div class="puzzle-place-info" style="text-align:center;">
                <h3 class="puzzle-place-title">Выберите сложность</h3>
                <p class="puzzle-hint-text">Чем больше деталей — тем сложнее и тем ближе редкие достижения</p>
            </div>
            <div class="difficulty-list">
                ${difficultySelectHtml(PUZZLE_DIFFICULTIES, 'startPuzzleGame', d => `${d.grid}×${d.grid} — ${d.grid * d.grid} деталей`)}
            </div>
        </div>
    `;
}

function showQuizDifficultySelect() {
    const container = document.getElementById('games-container');
    if (!container) return;

    container.innerHTML = `
        <div class="puzzle-game-wrapper">
            <div class="puzzle-header">
                <button class="puzzle-back-btn" onclick="renderGamesHub()">
                    <i class="fa-solid fa-arrow-left"></i> Назад
                </button>
            </div>
            <div class="puzzle-place-info" style="text-align:center;">
                <h3 class="puzzle-place-title">Выберите сложность</h3>
                <p class="puzzle-hint-text">Больше вопросов — больше очков и шанс на редкие достижения</p>
            </div>
            <div class="difficulty-list">
                ${difficultySelectHtml(QUIZ_DIFFICULTIES, 'startQuizGame', d => `${d.count} вопросов`)}
            </div>
        </div>
    `;
}

function startPuzzleGame(difficulty = 'easy', specificPlaceId = null) {
    const container = document.getElementById('games-container');
    if (!container) return;

    const diffConfig = PUZZLE_DIFFICULTIES[difficulty] || PUZZLE_DIFFICULTIES.easy;
    const gridSize = diffConfig.grid;

    let availablePlaces = [];
    if (typeof allPlacesData !== 'undefined' && allPlacesData.length > 0) {
        availablePlaces = allPlacesData.filter(p => p.image && p.image.trim() !== '');
    }

    let selectedPlace = null;
    if (specificPlaceId !== null && availablePlaces.length > 0) {
        selectedPlace = availablePlaces.find(p => p.id === specificPlaceId);
    }

    if (!selectedPlace && availablePlaces.length > 0) {
        selectedPlace = availablePlaces[Math.floor(Math.random() * availablePlaces.length)];
    }

    if (!selectedPlace) {
        selectedPlace = FALLBACK_QUIZ_PLACES[0];
    }

    clearInterval(puzzleState.timerInterval);
    puzzleState = {
        activePlace: selectedPlace,
        difficulty: difficulty,
        gridSize: gridSize,
        tiles: generateShuffledTiles(gridSize),
        selectedTileIndex: null,
        moves: 0,
        seconds: 0,
        timerInterval: null,
        isCompleted: false,
        isNewRecord: false
    };

    puzzleState.timerInterval = setInterval(() => {
        puzzleState.seconds++;
        const timerEl = document.getElementById('puzzle-timer');
        if (timerEl) {
            timerEl.textContent = formatPuzzleTime(puzzleState.seconds);
        }
    }, 1000);

    renderPuzzleScreen();
}

function generateShuffledTiles(gridSize) {
    const total = gridSize * gridSize;
    let positions = Array.from({ length: total }, (_, i) => i);
    let shuffled = [...positions];

    do {
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
    } while (isAlreadySolved(shuffled));

    return shuffled.map((correctPos, currentIdx) => ({
        correctPos: correctPos,
        currentPos: currentIdx
    }));
}

function isAlreadySolved(arr) {
    return arr.every((val, idx) => val === idx);
}

function renderPuzzleScreen() {
    const container = document.getElementById('games-container');
    if (!container) return;

    const place = puzzleState.activePlace;
    const imageUrl = place.image;
    const gridSize = puzzleState.gridSize || 3;
    const bgSize = gridSize * 100;

    let tilesHtml = '';
    puzzleState.tiles.forEach((tile, index) => {
        const isSelected = puzzleState.selectedTileIndex === index;

        const correctRow = Math.floor(tile.correctPos / gridSize);
        const correctCol = tile.correctPos % gridSize;
        const bgX = (correctCol / (gridSize - 1)) * 100;
        const bgY = (correctRow / (gridSize - 1)) * 100;

        tilesHtml += `
            <div class="puzzle-tile ${isSelected ? 'selected' : ''}" 
                 onclick="handleTileClick(${index})"
                 style="background-image: url('${imageUrl}'); background-position: ${bgX}% ${bgY}%; background-size: ${bgSize}% ${bgSize}%;">
                <span class="tile-num">${index + 1}</span>
            </div>
        `;
    });

    container.innerHTML = `
        <div class="puzzle-game-wrapper">
            <div class="puzzle-header">
                <button class="puzzle-back-btn" onclick="quitPuzzleGame()">
                    <i class="fa-solid fa-arrow-left"></i> Назад
                </button>
                <div class="puzzle-stats">
                    <span class="puzzle-stat"><i class="fa-regular fa-clock"></i> <b id="puzzle-timer">${formatPuzzleTime(puzzleState.seconds)}</b></span>
                    <span class="puzzle-stat"><i class="fa-solid fa-arrows-rotate"></i> <b>${puzzleState.moves}</b> ходов</span>
                </div>
            </div>

            <div class="puzzle-place-info">
                <h3 class="puzzle-place-title">${place.title}</h3>
                <p class="puzzle-hint-text">Нажмите на первую детальку, затем на вторую, чтобы поменять их местами. Сложность: ${(PUZZLE_DIFFICULTIES[puzzleState.difficulty] || PUZZLE_DIFFICULTIES.easy).label}</p>
            </div>

            <div class="puzzle-board-container">
                <div class="puzzle-board" style="grid-template-columns: repeat(${gridSize}, 1fr); grid-template-rows: repeat(${gridSize}, 1fr);">
                    ${tilesHtml}
                </div>
            </div>

            <div class="puzzle-controls">
                <button class="feed-btn sec" onclick="togglePuzzlePreview()">
                    <i class="fa-solid fa-eye"></i> Подсказка
                </button>
                <button class="feed-btn prim" onclick="startPuzzleGame('${puzzleState.difficulty}')">
                    <i class="fa-solid fa-shuffle"></i> Пересдать
                </button>
            </div>
        </div>

        <div id="puzzle-preview-modal" class="modal-overlay" onclick="togglePuzzlePreview()">
            <div class="modal-card" style="padding: 16px; text-align: center;">
                <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 16px;">Оригинальная фотография</h3>
                <img src="${imageUrl}" style="width: 100%; border-radius: 12px; max-height: 60vh; object-fit: cover;">
                <p style="font-size: 12px; color: #aaa; margin-top: 10px; margin-bottom: 0;">Нажмите в любое место, чтобы закрыть</p>
            </div>
        </div>
    `;

    if (puzzleState.isCompleted) {
        showPuzzleVictoryOverlay();
    }
}

function handleTileClick(index) {
    if (puzzleState.isCompleted) return;

    if (puzzleState.selectedTileIndex === null) {
        puzzleState.selectedTileIndex = index;
    } else if (puzzleState.selectedTileIndex === index) {
        puzzleState.selectedTileIndex = null;
    } else {
        const firstIdx = puzzleState.selectedTileIndex;
        const secondIdx = index;

        [puzzleState.tiles[firstIdx], puzzleState.tiles[secondIdx]] = [puzzleState.tiles[secondIdx], puzzleState.tiles[firstIdx]];
        
        puzzleState.selectedTileIndex = null;
        puzzleState.moves++;

        checkPuzzleVictory();
    }

    renderPuzzleScreen();
}

function checkPuzzleVictory() {
    const isSolved = puzzleState.tiles.every((tile, idx) => tile.correctPos === idx);

    if (isSolved) {
        clearInterval(puzzleState.timerInterval);
        puzzleState.isCompleted = true;

        if (!userGameStats.puzzle) {
            userGameStats.puzzle = { solved: 0, bestTime: null, bestMoves: null, totalMoves: 0, solvedByDifficulty: { easy: 0, medium: 0, hard: 0 } };
        }
        if (!userGameStats.puzzle.solvedByDifficulty) {
            userGameStats.puzzle.solvedByDifficulty = { easy: 0, medium: 0, hard: 0 };
        }

        const pStats = userGameStats.puzzle;
        const diff = puzzleState.difficulty || 'easy';
        pStats.solved = (pStats.solved || 0) + 1;
        pStats.totalMoves = (pStats.totalMoves || 0) + puzzleState.moves;
        pStats.solvedByDifficulty[diff] = (pStats.solvedByDifficulty[diff] || 0) + 1;

        let isRecord = false;
        if (pStats.bestTime === null || puzzleState.seconds < pStats.bestTime) {
            pStats.bestTime = puzzleState.seconds;
            isRecord = true;
        }

        if (pStats.bestMoves === null || puzzleState.moves < pStats.bestMoves) {
            pStats.bestMoves = puzzleState.moves;
            isRecord = true;
        }

        puzzleState.isNewRecord = isRecord;
        updateStreak();
        checkAchievements();
        saveGameStatsToVK();
        submitScoreToLeaderboard();
        maybeShowNotificationsPrompt();
    }
}

function showPuzzleVictoryOverlay() {
    const container = document.getElementById('games-container');
    if (!container) return;

    const place = puzzleState.activePlace;
    const finalTime = formatPuzzleTime(puzzleState.seconds);

    const recordTag = puzzleState.isNewRecord 
        ? `<div style="background: rgba(76, 175, 80, 0.2); color: #4caf50; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 8px; margin-bottom: 10px;">🎉 Новый рекорд!</div>`
        : '';

    const victoryHtml = `
        <div class="puzzle-victory-overlay">
            <div class="victory-card">
                <div class="victory-icon-glow">
                    <i class="fa-solid fa-trophy"></i>
                </div>
                <h2 class="victory-title">Пазл собран! 🎉</h2>
                <p class="victory-place">${place.title}</p>
                ${recordTag}

                <div class="victory-stats-row">
                    <div class="victory-stat-box">
                        <span>Время</span>
                        <b>${finalTime}</b>
                    </div>
                    <div class="victory-stat-box">
                        <span>Ходов</span>
                        <b>${puzzleState.moves}</b>
                    </div>
                </div>

                <div class="victory-actions">
                    <button class="feed-btn prim" onclick="startPuzzleGame('${puzzleState.difficulty}')">
                        <i class="fa-solid fa-forward"></i> Следующий пазл
                    </button>
                    <button class="feed-btn sec" style="background: rgba(233, 30, 99, 0.2); color: #ff80ab;" onclick="shareGameResultToStory('puzzle', '${place.title}', '${finalTime}', '${puzzleState.moves}')">
                        <i class="fa-solid fa-circle-play"></i> Поделиться в Историю
                    </button>
                    ${!isNaN(place.lat) && !isNaN(place.lng) ? `
                        <button class="feed-btn sec" onclick="openPlaceOnMap(${place.lat}, ${place.lng})">
                            <i class="fa-solid fa-map-pin"></i> Показать на карте
                        </button>
                    ` : ''}
                    <button class="feed-btn sec" style="background: #242424;" onclick="quitPuzzleGame()">
                        <i class="fa-solid fa-house"></i> Вернуться в меню
                    </button>
                </div>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', victoryHtml);
}

function togglePuzzlePreview() {
    const modal = document.getElementById('puzzle-preview-modal');
    if (modal) {
        modal.classList.toggle('active');
    }
}

function quitPuzzleGame() {
    clearInterval(puzzleState.timerInterval);
    puzzleState.activePlace = null;
    renderGamesHub();
}

/* ==========================================================================
   🎯 ИГРА 2: КВИЗ «УГАДАЙ МЕСТО ПО ФОТО» (5 вопросов)
   ========================================================================== */

function startQuizGame(difficulty = 'easy') {
    const container = document.getElementById('games-container');
    if (!container) return;

    const diffConfig = QUIZ_DIFFICULTIES[difficulty] || QUIZ_DIFFICULTIES.easy;
    const questions = generateQuizQuestions(diffConfig.count);
    if (questions.length === 0) {
        showAppToast('Не удалось загрузить достаточно мест для викторины.', true);
        return;
    }

    clearInterval(quizState.timerInterval);
    quizState = {
        difficulty: difficulty,
        questions: questions,
        currentQuestionIndex: 0,
        score: 0,
        correctCount: 0,
        seconds: 0,
        timerInterval: null,
        isAnswered: false,
        selectedOptionIndex: null,
        isCompleted: false,
        isNewRecord: false
    };

    quizState.timerInterval = setInterval(() => {
        quizState.seconds++;
        const timerEl = document.getElementById('quiz-timer');
        if (timerEl) {
            timerEl.textContent = formatPuzzleTime(quizState.seconds);
        }
    }, 1000);

    renderQuizScreen();
}

function generateQuizQuestions(desiredCount = 5) {
    let pool = [];
    if (typeof allPlacesData !== 'undefined' && allPlacesData.length > 0) {
        pool = allPlacesData.filter(p => p.image && p.image.trim() !== '' && p.title);
    }
    if (pool.length < 4) {
        pool = [...pool, ...FALLBACK_QUIZ_PLACES];
    }

    const uniqueMap = new Map();
    pool.forEach(p => {
        if (!uniqueMap.has(p.title.toLowerCase().trim())) {
            uniqueMap.set(p.title.toLowerCase().trim(), p);
        }
    });
    const uniquePool = Array.from(uniqueMap.values());

    const numQuestions = Math.min(desiredCount, uniquePool.length);
    const shuffledPool = [...uniquePool].sort(() => 0.5 - Math.random());
    const targets = shuffledPool.slice(0, numQuestions);

    return targets.map(target => {
        const wrongCandidates = uniquePool.filter(p => p.title.trim() !== target.title.trim());
        const shuffledWrong = wrongCandidates.sort(() => 0.5 - Math.random()).slice(0, 3);
        
        const options = [target, ...shuffledWrong].sort(() => 0.5 - Math.random());
        const correctIndex = options.findIndex(opt => opt.title.trim() === target.title.trim());

        return {
            targetPlace: target,
            options: options,
            correctIndex: correctIndex
        };
    });
}

function renderQuizScreen() {
    const container = document.getElementById('games-container');
    if (!container) return;

    if (quizState.isCompleted) {
        showQuizVictoryOverlay();
        return;
    }

    const currentQ = quizState.questions[quizState.currentQuestionIndex];
    const target = currentQ.targetPlace;
    const imageUrl = target.image;
    const totalQ = quizState.questions.length;
    const currentQNum = quizState.currentQuestionIndex + 1;

    let optionsHtml = '';
    currentQ.options.forEach((opt, idx) => {
        let extraClass = '';
        let iconHtml = '';

        if (quizState.isAnswered) {
            if (idx === currentQ.correctIndex) {
                extraClass = 'correct';
                iconHtml = '<i class="fa-solid fa-check"></i>';
            } else if (idx === quizState.selectedOptionIndex) {
                extraClass = 'wrong';
                iconHtml = '<i class="fa-solid fa-xmark"></i>';
            } else {
                extraClass = 'disabled';
            }
        }

        optionsHtml += `
            <button class="quiz-opt-btn ${extraClass}" onclick="handleQuizOptionClick(${idx})">
                <span>${opt.title}</span>
                ${iconHtml}
            </button>
        `;
    });

    container.innerHTML = `
        <div class="quiz-game-wrapper">
            <div class="puzzle-header">
                <button class="puzzle-back-btn" onclick="quitQuizGame()">
                    <i class="fa-solid fa-arrow-left"></i> Назад
                </button>
                <div class="puzzle-stats">
                    <span class="puzzle-stat"><i class="fa-regular fa-clock"></i> <b id="quiz-timer">${formatPuzzleTime(quizState.seconds)}</b></span>
                    <span class="puzzle-stat"><i class="fa-solid fa-star" style="color: #ff9800;"></i> <b>${quizState.score}</b></span>
                </div>
            </div>

            <div class="quiz-progress-bar-container">
                <div class="quiz-progress-header">
                    <span>Вопрос ${currentQNum} из ${totalQ}</span>
                    <span style="color: #ab47bc; font-weight: 700;">Категория: ${target.category || 'Локация'}</span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${(currentQNum / totalQ) * 100}%; background: linear-gradient(90deg, #ab47bc, #2787F5);"></div>
                </div>
            </div>

            <div class="quiz-question-title">
                <i class="fa-solid fa-circle-question"></i> Что это за место на фото?
            </div>

            <div class="quiz-image-card">
                <img src="${imageUrl}" alt="Угадай место" class="quiz-img">
            </div>

            <div class="quiz-options-list">
                ${optionsHtml}
            </div>
        </div>
    `;
}

function handleQuizOptionClick(optionIndex) {
    if (quizState.isAnswered || quizState.isCompleted) return;

    quizState.isAnswered = true;
    quizState.selectedOptionIndex = optionIndex;

    const currentQ = quizState.questions[quizState.currentQuestionIndex];
    if (optionIndex === currentQ.correctIndex) {
        quizState.correctCount++;
        quizState.score += 100;
    }

    renderQuizScreen();

    setTimeout(() => {
        nextQuizQuestion();
    }, 1200);
}

function nextQuizQuestion() {
    quizState.currentQuestionIndex++;
    quizState.isAnswered = false;
    quizState.selectedOptionIndex = null;

    if (quizState.currentQuestionIndex < quizState.questions.length) {
        renderQuizScreen();
    } else {
        finishQuizGame();
    }
}

function finishQuizGame() {
    clearInterval(quizState.timerInterval);
    quizState.isCompleted = true;

    if (!userGameStats.quiz) {
        userGameStats.quiz = { played: 0, bestScore: 0, totalCorrect: 0, totalQuestions: 0, perfectRounds: 0, perfectHardRounds: 0 };
    }

    const qStats = userGameStats.quiz;
    qStats.played = (qStats.played || 0) + 1;
    qStats.totalCorrect = (qStats.totalCorrect || 0) + quizState.correctCount;
    qStats.totalQuestions = (qStats.totalQuestions || 0) + quizState.questions.length;

    const isPerfect = quizState.correctCount === quizState.questions.length;
    if (isPerfect) {
        qStats.perfectRounds = (qStats.perfectRounds || 0) + 1;
        if (quizState.difficulty === 'hard') {
            qStats.perfectHardRounds = (qStats.perfectHardRounds || 0) + 1;
        }
    }

    let isRecord = false;
    if (quizState.score > (qStats.bestScore || 0)) {
        qStats.bestScore = quizState.score;
        isRecord = true;
    }
    quizState.isNewRecord = isRecord;

    updateStreak();
    checkAchievements();
    saveGameStatsToVK();
    submitScoreToLeaderboard();
    maybeShowNotificationsPrompt();
    renderQuizScreen();
}

function showQuizVictoryOverlay() {
    const container = document.getElementById('games-container');
    if (!container) return;

    const totalQ = quizState.questions.length;
    const finalTime = formatPuzzleTime(quizState.seconds);

    const recordTag = quizState.isNewRecord 
        ? `<div style="background: rgba(76, 175, 80, 0.2); color: #4caf50; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 8px; margin-bottom: 10px;">🎉 Новый рекорд очков!</div>`
        : '';

    const victoryHtml = `
        <div class="puzzle-victory-overlay">
            <div class="victory-card">
                <div class="victory-icon-glow" style="background: linear-gradient(135deg, #ab47bc, #2787F5); box-shadow: 0 0 25px rgba(171, 71, 188, 0.6);">
                    <i class="fa-solid fa-award"></i>
                </div>
                <h2 class="victory-title">Викторина завершена! 🎉</h2>
                <p class="victory-place" style="color: #ab47bc;">Угадано ${quizState.correctCount} из ${totalQ} локаций</p>
                ${recordTag}

                <div class="victory-stats-row">
                    <div class="victory-stat-box">
                        <span>Набрано очков</span>
                        <b style="color: #ff9800;">${quizState.score}</b>
                    </div>
                    <div class="victory-stat-box">
                        <span>Время</span>
                        <b>${finalTime}</b>
                    </div>
                </div>

                <div class="victory-actions">
                    <button class="feed-btn prim" style="background: #ab47bc;" onclick="startQuizGame('${quizState.difficulty}')">
                        <i class="fa-solid fa-rotate-right"></i> Сыграть ещё раз
                    </button>
                    <button class="feed-btn sec" style="background: rgba(233, 30, 99, 0.2); color: #ff80ab;" onclick="shareGameResultToStory('quiz', 'Результат викторины', '${quizState.correctCount}/${quizState.questions.length}', '${quizState.score}')">
                        <i class="fa-solid fa-circle-play"></i> Поделиться в Историю
                    </button>
                    <a href="${VK_PUBLIC_URL}" target="_blank" class="feed-btn sec" style="text-decoration: none; display: flex; align-items: center; justify-content: center; background: rgba(39, 135, 245, 0.2); color: #2787F5;">
                        <i class="fa-brands fa-vk"></i> Посмотреть эти локации
                    </a>
                    <button class="feed-btn sec" style="background: #242424;" onclick="quitQuizGame()">
                        <i class="fa-solid fa-house"></i> В Игровой центр
                    </button>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = victoryHtml;
}

// Генерация Canvas для историй ВК
function generateGameStoryImage(gameType, title, stat1, stat2) {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1920;
        const ctx = canvas.getContext('2d');

        const accentColor = gameType === 'puzzle' ? '#2787F5' : '#ab47bc';
        const isNewRecord = gameType === 'puzzle' ? puzzleState.isNewRecord : quizState.isNewRecord;

        drawStoryBackground(ctx, accentColor);
        drawTopBadgePill(ctx, 540, 190, accentColor);
        drawMedallion(ctx, 540, 560, 220, accentColor, gameType === 'puzzle' ? '🧩' : '🎯');

        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 54px sans-serif';
        ctx.fillText(gameType === 'puzzle' ? 'Пазл собран!' : 'Викторина пройдена!', 540, 850);

        ctx.fillStyle = accentColor;
        ctx.font = 'bold 46px sans-serif';
        wrapCenteredText(ctx, title, 540, 925, 900, 54);

        const chips = gameType === 'puzzle'
            ? [
                { icon: '⏱', value: stat1, label: 'время', color: '#4caf50' },
                { icon: '🔀', value: stat2, label: 'ходов', color: '#ff9800' }
              ]
            : [
                { icon: '✅', value: stat1, label: 'правильно', color: '#4caf50' },
                { icon: '⭐', value: stat2, label: 'очков', color: '#ff9800' }
              ];
        drawStatChips(ctx, chips, 540, 1080);

        if (isNewRecord) {
            drawRibbonBadge(ctx, 540, 1340, '🏆 Новый рекорд!', '#ffd700');
        }

        drawStoryFooter(ctx, 1760, accentColor);

        return canvas.toDataURL('image/png');
    } catch (e) {
        return null;
    }
}

// Публикация истории в ВК
function shareGameResultToStory(gameType, title, stat1, stat2) {
    const storyDataUrl = generateGameStoryImage(gameType, title, stat1, stat2);
    const fallbackImage = 'https://sun9-82.userapi.com/c858228/v858228221/11d13f/8V3zJ5rX-o8.jpg';

    publishStoryToVK({
        blobDataUrl: storyDataUrl,
        imageUrl: fallbackImage,
        targetLink: APP_SHARE_LINK
    });
}

function quitQuizGame() {
    clearInterval(quizState.timerInterval);
    quizState.isCompleted = false;
    quizState.questions = [];
    renderGamesHub();
}

function formatPuzzleTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}