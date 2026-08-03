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
        totalMoves: 0
    },
    quiz: {
        played: 0,
        bestScore: 0,
        totalCorrect: 0,
        totalQuestions: 0
    },
    achievements: {
        firstPuzzle: false,
        puzzleMaster: false,
        speedDemon: false,
        firstQuiz: false,
        quizExpert: false
    }
};

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
    const a = userGameStats.achievements;

    if (p.solved >= 1) a.firstPuzzle = true;
    if (p.solved >= 3) a.puzzleMaster = true;
    if (p.bestTime !== null && p.bestTime <= 30) a.speedDemon = true;
    if (q.played >= 1) a.firstQuiz = true;
    if (quizState.correctCount === 5) a.quizExpert = true;
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
    }
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

        <!-- Блок достижений (Ачивок) -->
        <div style="background: #1e1e1e; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 12px 14px; margin-bottom: 4px;">
            <div style="font-size: 12px; font-weight: 700; color: #aaaaaa; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-medal" style="color: #ffd700;"></i> Ваши достижения
            </div>
            <div style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none;">
                <div class="achievement-badge ${a.firstPuzzle ? 'unlocked' : 'locked'}" title="Соберите первый пазл">
                    <i class="fa-solid fa-puzzle-piece"></i>
                    <span>Новичок-пазл</span>
                </div>
                <div class="achievement-badge ${a.puzzleMaster ? 'unlocked' : 'locked'}" title="Соберите 3 пазла">
                    <i class="fa-solid fa-crown"></i>
                    <span>Мастер пазлов</span>
                </div>
                <div class="achievement-badge ${a.speedDemon ? 'unlocked' : 'locked'}" title="Соберите пазл быстрее чем за 30 секунд">
                    <i class="fa-solid fa-bolt"></i>
                    <span>Молния</span>
                </div>
                <div class="achievement-badge ${a.firstQuiz ? 'unlocked' : 'locked'}" title="Пройдите первый квиз">
                    <i class="fa-solid fa-bullseye"></i>
                    <span>Эрудит</span>
                </div>
                <div class="achievement-badge ${a.quizExpert ? 'unlocked' : 'locked'}" title="Ответьте правильно на все 5 вопросов">
                    <i class="fa-solid fa-gem"></i>
                    <span>Знаток планеты</span>
                </div>
            </div>
        </div>

        <div class="games-list">
            <!-- Игра 1: Мини-пазл -->
            <div class="game-card">
                <div class="game-card-body" onclick="startPuzzleGame()">
                    <div class="game-card-icon" style="background: rgba(39, 135, 245, 0.2); color: #2787F5;">
                        <i class="fa-solid fa-puzzle-piece"></i>
                    </div>
                    <div class="game-card-info">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #ffffff;">Мини-пазл локаций</h3>
                            <span class="game-card-badge" style="position: static; flex-shrink: 0;">Доступно</span>
                        </div>
                        <p style="margin: 0; font-size: 12px; color: #aaaaaa; line-height: 1.3;">Соберите фотографию места из 9 частей!</p>
                    </div>
                </div>

                <div style="margin-top: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 10px; padding: 8px; display: flex; justify-content: space-around; text-align: center; border: 1px solid rgba(255, 255, 255, 0.05);" onclick="startPuzzleGame()">
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
                    <button class="feed-btn prim game-start-btn" style="flex: 2; margin-left: 0;" onclick="startPuzzleGame()">
                        Играть <i class="fa-solid fa-play"></i>
                    </button>
                    <button class="feed-btn sec game-start-btn" style="flex: 1; margin-left: 0; background: #2a2a2a;" onclick="shareGameInvite('puzzle')">
                        <i class="fa-solid fa-share-nodes"></i> Поделиться
                    </button>
                </div>
            </div>

            <!-- Игра 2: Квиз -->
            <div class="game-card">
                <div class="game-card-body" onclick="startQuizGame()">
                    <div class="game-card-icon" style="background: rgba(171, 71, 188, 0.2); color: #ab47bc;">
                        <i class="fa-solid fa-bullseye"></i>
                    </div>
                    <div class="game-card-info">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #ffffff;">Угадай место по фото</h3>
                            <span class="game-card-badge" style="position: static; flex-shrink: 0;">Доступно</span>
                        </div>
                        <p style="margin: 0; font-size: 12px; color: #aaaaaa; line-height: 1.3;">Викторина из 5 вопросов по фото уникальных мест.</p>
                    </div>
                </div>

                <div style="margin-top: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 10px; padding: 8px; display: flex; justify-content: space-around; text-align: center; border: 1px solid rgba(255, 255, 255, 0.05);" onclick="startQuizGame()">
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
                    <button class="feed-btn prim game-start-btn" style="flex: 2; margin-left: 0; background: #ab47bc;" onclick="startQuizGame()">
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
        alert('Ссылка на игровой центр скопирована в буфер обмена!');
    }
}

/* ==========================================================================
   🎮 ИГРА 1: МИНИ-ПАЗЛ
   ========================================================================== */

function startPuzzleGame(specificPlaceId = null) {
    const container = document.getElementById('games-container');
    if (!container) return;

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
        tiles: generateShuffledTiles(),
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

function generateShuffledTiles() {
    let positions = [0, 1, 2, 3, 4, 5, 6, 7, 8];
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

    let tilesHtml = '';
    puzzleState.tiles.forEach((tile, index) => {
        const isSelected = puzzleState.selectedTileIndex === index;
        
        const correctRow = Math.floor(tile.correctPos / 3);
        const correctCol = tile.correctPos % 3;
        const bgX = (correctCol / 2) * 100;
        const bgY = (correctRow / 2) * 100;

        tilesHtml += `
            <div class="puzzle-tile ${isSelected ? 'selected' : ''}" 
                 onclick="handleTileClick(${index})"
                 style="background-image: url('${imageUrl}'); background-position: ${bgX}% ${bgY}%;">
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
                <p class="puzzle-hint-text">Нажмите на первую детальку, затем на вторую, чтобы поменять их местами.</p>
            </div>

            <div class="puzzle-board-container">
                <div class="puzzle-board">
                    ${tilesHtml}
                </div>
            </div>

            <div class="puzzle-controls">
                <button class="feed-btn sec" onclick="togglePuzzlePreview()">
                    <i class="fa-solid fa-eye"></i> Подсказка
                </button>
                <button class="feed-btn prim" onclick="startPuzzleGame()">
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
            userGameStats.puzzle = { solved: 0, bestTime: null, bestMoves: null, totalMoves: 0 };
        }

        const pStats = userGameStats.puzzle;
        pStats.solved = (pStats.solved || 0) + 1;
        pStats.totalMoves = (pStats.totalMoves || 0) + puzzleState.moves;

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
        checkAchievements();
        saveGameStatsToVK();
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
                    <button class="feed-btn prim" onclick="startPuzzleGame()">
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

function startQuizGame() {
    const container = document.getElementById('games-container');
    if (!container) return;

    const questions = generateQuizQuestions();
    if (questions.length === 0) {
        alert('К сожалению, не удалось загрузить достаточное количество мест для викторины.');
        return;
    }

    clearInterval(quizState.timerInterval);
    quizState = {
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

function generateQuizQuestions() {
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

    const numQuestions = Math.min(5, uniquePool.length);
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
        userGameStats.quiz = { played: 0, bestScore: 0, totalCorrect: 0, totalQuestions: 0 };
    }

    const qStats = userGameStats.quiz;
    qStats.played = (qStats.played || 0) + 1;
    qStats.totalCorrect = (qStats.totalCorrect || 0) + quizState.correctCount;
    qStats.totalQuestions = (qStats.totalQuestions || 0) + quizState.questions.length;

    let isRecord = false;
    if (quizState.score > (qStats.bestScore || 0)) {
        qStats.bestScore = quizState.score;
        isRecord = true;
    }
    quizState.isNewRecord = isRecord;

    checkAchievements();
    saveGameStatsToVK();
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
                    <button class="feed-btn prim" style="background: #ab47bc;" onclick="startQuizGame()">
                        <i class="fa-solid fa-rotate-right"></i> Сыграть ещё раз
                    </button>
                    <button class="feed-btn sec" style="background: rgba(233, 30, 99, 0.2); color: #ff80ab;" onclick="shareGameResultToStory('quiz', '${quizState.correctCount}', '${quizState.score}', '${finalTime}')">
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

        const grad = ctx.createLinearGradient(0, 0, 1080, 1920);
        grad.addColorStop(0, '#0a1128');
        grad.addColorStop(0.5, '#1c1936');
        grad.addColorStop(1, '#0e1622');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1080, 1920);

        ctx.fillStyle = gameType === 'puzzle' ? 'rgba(39, 135, 245, 0.25)' : 'rgba(171, 71, 188, 0.25)';
        ctx.beginPath();
        ctx.arc(540, 800, 380, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#2787F5';
        ctx.font = 'bold 44px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('КРАСОТЫ ПЛАНЕТЫ 🌍', 540, 640);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 56px sans-serif';
        ctx.fillText(gameType === 'puzzle' ? '🧩 Пазл успешно собран!' : '🎯 Квиз пройден!', 540, 740);

        ctx.fillStyle = '#ff9800';
        ctx.font = 'bold 48px sans-serif';
        ctx.fillText(title, 540, 840);

        ctx.fillStyle = '#aaaaaa';
        ctx.font = '36px sans-serif';
        ctx.fillText(gameType === 'puzzle' ? `Время: ${stat1}  •  Ходы: ${stat2}` : `Угадано: ${stat1}/5  •  Очки: ${stat2}`, 540, 940);

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