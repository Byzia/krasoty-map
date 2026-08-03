// Модуль управления игровым центром, статистикой и мини-игрой «Пазл»

const VK_GAME_STATS_KEY = 'krasoty_planety_game_stats';

// Общий объект игровой статистики пользователя
let userGameStats = {
    puzzle: {
        solved: 0,
        bestTime: null, // в секундах
        bestMoves: null,
        totalMoves: 0
    }
};

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

// Загрузка статистики из VK Storage / localStorage
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

// Сохранение статистики
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

// Инициализация вкладки Игр
async function initGamesTab() {
    const container = document.getElementById('games-container');
    if (!container) return;

    await loadGameStatsFromVK();

    // Если игра уже активна, оставляем её, иначе показываем каталог
    if (!puzzleState.activePlace) {
        renderGamesHub();
    }
}

// Рендеринг игрового хаба (каталога с показателями игровой статистики)
function renderGamesHub() {
    const container = document.getElementById('games-container');
    if (!container) return;

    const pStats = userGameStats.puzzle || { solved: 0, bestTime: null, bestMoves: null };
    const bestTimeFormatted = pStats.bestTime !== null ? formatPuzzleTime(pStats.bestTime) : '--:--';
    const bestMovesFormatted = pStats.bestMoves !== null ? `${pStats.bestMoves} ходов` : '--';

    container.innerHTML = `
        <div class="games-hub-header">
            <div class="games-icon-glow">
                <i class="fa-solid fa-gamepad"></i>
            </div>
            <h2 class="games-teaser-title">Игровой центр</h2>
            <p class="games-teaser-desc">
                Играйте в мини-игры, открывайте живописные уголки планеты и прокачивайте свой ранг путешественника!
            </p>
        </div>

        <div class="games-list">
            <!-- Игра 1: Мини-пазл (АКТИВНА) -->
            <div class="game-card active-game" onclick="startPuzzleGame()">
                <div class="game-card-body">
                    <div class="game-card-icon" style="background: rgba(39, 135, 245, 0.2); color: #2787F5;">
                        <i class="fa-solid fa-puzzle-piece"></i>
                    </div>
                    <div class="game-card-info">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #ffffff;">Мини-пазл локаций</h3>
                            <span class="game-card-badge" style="position: static; flex-shrink: 0;">Доступно</span>
                        </div>
                        <p style="margin: 0; font-size: 12px; color: #aaaaaa; line-height: 1.3;">Соберите фотографию места из 9 частей за минимальное время!</p>
                    </div>
                </div>

                <!-- Блок персональной статистики по Пазлам -->
                <div style="margin-top: 12px; background: rgba(0, 0, 0, 0.3); border-radius: 12px; padding: 10px; display: flex; justify-content: space-around; text-align: center; border: 1px solid rgba(255, 255, 255, 0.05);">
                    <div>
                        <div style="font-size: 10px; color: #888888;">Собрано</div>
                        <div style="font-size: 13px; font-weight: 700; color: #2787F5;">🧩 ${pStats.solved}</div>
                    </div>
                    <div>
                        <div style="font-size: 10px; color: #888888;">Рекорд времени</div>
                        <div style="font-size: 13px; font-weight: 700; color: #4caf50;">⚡ ${bestTimeFormatted}</div>
                    </div>
                    <div>
                        <div style="font-size: 10px; color: #888888;">Лучший результат</div>
                        <div style="font-size: 13px; font-weight: 700; color: #ff9800;">🎯 ${bestMovesFormatted}</div>
                    </div>
                </div>

                <div style="margin-top: 12px;">
                    <button class="feed-btn prim game-start-btn" style="width: 100%; margin-left: 0;">
                        Играть <i class="fa-solid fa-play"></i>
                    </button>
                </div>
            </div>

            <!-- Игра 2: Квиз (СКОРО) -->
            <div class="game-card teaser-game">
                <div class="game-card-body">
                    <div class="game-card-icon" style="background: rgba(171, 71, 188, 0.2); color: #ab47bc;">
                        <i class="fa-solid fa-bullseye"></i>
                    </div>
                    <div class="game-card-info">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #ffffff;">Угадай место по фото</h3>
                            <span class="game-card-badge upcoming" style="position: static; flex-shrink: 0;">Скоро</span>
                        </div>
                        <p style="margin: 0; font-size: 12px; color: #aaaaaa; line-height: 1.3;">Викторина с выбором ответов на время.</p>
                    </div>
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

// Запуск игры в Пазл
function startPuzzleGame(specificPlaceId = null) {
    const container = document.getElementById('games-container');
    if (!container) return;

    // Подбираем место из загруженных локаций (с картинкой)
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
        selectedPlace = {
            id: 999,
            title: 'Замок Нойшванштайн',
            image: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=600',
            lat: 47.5576,
            lng: 10.7498
        };
    }

    // Сброс состояния
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

    // Старт таймера
    puzzleState.timerInterval = setInterval(() => {
        puzzleState.seconds++;
        const timerEl = document.getElementById('puzzle-timer');
        if (timerEl) {
            timerEl.textContent = formatPuzzleTime(puzzleState.seconds);
        }
    }, 1000);

    renderPuzzleScreen();
}

// Генерация и перемешивание кусочков 3x3 (9 плиток)
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

// Отрисовка экрана сборки пазла
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
            <!-- Шапка игры -->
            <div class="puzzle-header">
                <button class="puzzle-back-btn" onclick="quitPuzzleGame()">
                    <i class="fa-solid fa-arrow-left"></i> Назад
                </button>
                <div class="puzzle-stats">
                    <span class="puzzle-stat"><i class="fa-regular fa-clock"></i> <b id="puzzle-timer">${formatPuzzleTime(puzzleState.seconds)}</b></span>
                    <span class="puzzle-stat"><i class="fa-solid fa-arrows-rotate"></i> <b>${puzzleState.moves}</b> ходов</span>
                </div>
            </div>

            <!-- Инфо о локации -->
            <div class="puzzle-place-info">
                <h3 class="puzzle-place-title">${place.title}</h3>
                <p class="puzzle-hint-text">Нажмите на первую детальку, затем на вторую, чтобы поменять их местами.</p>
            </div>

            <!-- Игровое поле 3x3 -->
            <div class="puzzle-board-container">
                <div class="puzzle-board">
                    ${tilesHtml}
                </div>
            </div>

            <!-- Кнопки управления -->
            <div class="puzzle-controls">
                <button class="feed-btn sec" onclick="togglePuzzlePreview()">
                    <i class="fa-solid fa-eye"></i> Подсказка
                </button>
                <button class="feed-btn prim" onclick="startPuzzleGame()">
                    <i class="fa-solid fa-shuffle"></i> Пересдать
                </button>
            </div>
        </div>

        <!-- Окно предпросмотра оригинала -->
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

// Клик по кусочку пазла
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

// Проверка успешной сборки и обновление статистики
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

        // Сохраняем общую статистику
        saveGameStatsToVK();
    }
}

// Экран победы
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
                    ${!isNaN(place.lat) && !isNaN(place.lng) ? `
                        <button class="feed-btn sec" onclick="openPlaceOnMap(${place.lat}, ${place.lng})">
                            <i class="fa-solid fa-map-pin"></i> Показать на карте
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', victoryHtml);
}

// Показ / Скрытие подсказки оригинальной картинки
function togglePuzzlePreview() {
    const modal = document.getElementById('puzzle-preview-modal');
    if (modal) {
        modal.classList.toggle('active');
    }
}

// Выход из игры назад в игровой центр
function quitPuzzleGame() {
    clearInterval(puzzleState.timerInterval);
    puzzleState.activePlace = null;
    renderGamesHub();
}

function formatPuzzleTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}