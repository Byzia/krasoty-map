// Модуль управления игровым центром и мини-игрой «Пазл»

let puzzleState = {
    activePlace: null,
    tiles: [],
    selectedTileIndex: null,
    moves: 0,
    seconds: 0,
    timerInterval: null,
    isCompleted: false
};

// Инициализация вкладки Игр
function initGamesTab() {
    const container = document.getElementById('games-container');
    if (!container) return;

    // Если игра уже активна, оставляем её, иначе показываем каталог
    if (!puzzleState.activePlace) {
        renderGamesHub();
    }
}

// Рендеринг игрового хаба (каталога)
function renderGamesHub() {
    const container = document.getElementById('games-container');
    if (!container) return;

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
                <div class="game-card-badge">Доступно</div>
                <div class="game-card-body">
                    <div class="game-card-icon" style="background: rgba(39, 135, 245, 0.2); color: #2787F5;">
                        <i class="fa-solid fa-puzzle-piece"></i>
                    </div>
                    <div class="game-card-info">
                        <h3>Мини-пазл локаций</h3>
                        <p>Соберите фотографию места из 9 частей за минимальное время!</p>
                    </div>
                    <button class="feed-btn prim game-start-btn">
                        Играть <i class="fa-solid fa-play"></i>
                    </button>
                </div>
            </div>

            <!-- Игра 2: Квиз (СКОРО) -->
            <div class="game-card teaser-game">
                <div class="game-card-badge upcoming">Скоро</div>
                <div class="game-card-body">
                    <div class="game-card-icon" style="background: rgba(171, 71, 188, 0.2); color: #ab47bc;">
                        <i class="fa-solid fa-bullseye"></i>
                    </div>
                    <div class="game-card-info">
                        <h3>Угадай место по фото</h3>
                        <p>Викторина с выбором ответов на время.</p>
                    </div>
                </div>
            </div>

            <!-- Игра 3: Колесо фортуны (СКОРО) -->
            <div class="game-card teaser-game">
                <div class="game-card-badge upcoming">Скоро</div>
                <div class="game-card-body">
                    <div class="game-card-icon" style="background: rgba(255, 152, 0, 0.2); color: #ff9800;">
                        <i class="fa-solid fa-dharmachakra"></i>
                    </div>
                    <div class="game-card-info">
                        <h3>Колесо путешествий</h3>
                        <p>Рулетка случайных приключений на эти выходные.</p>
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

    // Резервный вариант, если данные ещё не загрузились
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
        isCompleted: false
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

    // Перемешивание Fisher-Yates
    do {
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
    } while (isAlreadySolved(shuffled)); // Убеждаемся, что пазл не собрался случайно сам

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
        
        // Расчёт смещения фона для кусочка 3x3
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
        // Первый клик — выделение детальки
        puzzleState.selectedTileIndex = index;
    } else if (puzzleState.selectedTileIndex === index) {
        // Повторный клик — снятие выделения
        puzzleState.selectedTileIndex = null;
    } else {
        // Второй клик — обмен местами
        const firstIdx = puzzleState.selectedTileIndex;
        const secondIdx = index;

        [puzzleState.tiles[firstIdx], puzzleState.tiles[secondIdx]] = [puzzleState.tiles[secondIdx], puzzleState.tiles[firstIdx]];
        
        puzzleState.selectedTileIndex = null;
        puzzleState.moves++;

        // Проверка победы
        checkPuzzleVictory();
    }

    renderPuzzleScreen();
}

// Проверка успешной сборки
function checkPuzzleVictory() {
    const isSolved = puzzleState.tiles.every((tile, idx) => tile.correctPos === idx);

    if (isSolved) {
        clearInterval(puzzleState.timerInterval);
        puzzleState.isCompleted = true;
    }
}

// Экран победы
function showPuzzleVictoryOverlay() {
    const container = document.getElementById('games-container');
    if (!container) return;

    const place = puzzleState.activePlace;
    const finalTime = formatPuzzleTime(puzzleState.seconds);

    const victoryHtml = `
        <div class="puzzle-victory-overlay">
            <div class="victory-card">
                <div class="victory-icon-glow">
                    <i class="fa-solid fa-trophy"></i>
                </div>
                <h2 class="victory-title">Пазл собран! 🎉</h2>
                <p class="victory-place">${place.title}</p>

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