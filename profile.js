const VK_FAVS_KEY = 'krasoty_planety_favs';
const VK_VISITED_KEY = 'krasoty_planety_visited';

let favoritesList = [];
let visitedList = [];
let vkUserData = null;
let currentProfileSubTab = 'favs'; // 'favs' или 'visited'

// 1. Загрузка данных пользователя VK
async function loadVkUserData() {
    if (window.vkBridge) {
        try {
            const user = await vkBridge.send('VKWebAppGetUserInfo');
            if (user && user.first_name) {
                vkUserData = user;
            }
        } catch (e) {
            console.warn('Профиль VK недоступен:', e);
        }
    }
}

// 2. Загрузка списков из VK Storage
async function loadFavoritesFromVK() {
    if (window.vkBridge) {
        try {
            const data = await vkBridge.send('VKWebAppStorageGet', { keys: [VK_FAVS_KEY, VK_VISITED_KEY] });
            if (data && data.keys) {
                const favData = data.keys.find(k => k.key === VK_FAVS_KEY);
                const visData = data.keys.find(k => k.key === VK_VISITED_KEY);

                favoritesList = (favData && favData.value) ? JSON.parse(favData.value) : [];
                visitedList = (visData && visData.value) ? JSON.parse(visData.value) : [];
            }
        } catch (e) {
            fallbackLoadLocalStorage();
        }
    } else {
        fallbackLoadLocalStorage();
    }
}

function fallbackLoadLocalStorage() {
    try {
        favoritesList = JSON.parse(localStorage.getItem(VK_FAVS_KEY) || '[]');
        visitedList = JSON.parse(localStorage.getItem(VK_VISITED_KEY) || '[]');
    } catch (e) {
        favoritesList = [];
        visitedList = [];
    }
}

// 3. Сохранение списков в VK Storage
async function saveUserDataToVK() {
    try {
        localStorage.setItem(VK_FAVS_KEY, JSON.stringify(favoritesList));
        localStorage.setItem(VK_VISITED_KEY, JSON.stringify(visitedList));
    } catch (e) {}

    if (window.vkBridge) {
        try {
            await vkBridge.send('VKWebAppStorageSet', { key: VK_FAVS_KEY, value: JSON.stringify(favoritesList) });
            await vkBridge.send('VKWebAppStorageSet', { key: VK_VISITED_KEY, value: JSON.stringify(visitedList) });
        } catch (e) {}
    }
}

function isFavorite(placeId) { return favoritesList.includes(placeId); }
function isVisited(placeId) { return visitedList.includes(placeId); }

// 4. Переключение Сердечка (Хочу посетить)
async function toggleFavorite(placeId, event) {
    if (event) event.stopPropagation();

    const idx = favoritesList.indexOf(placeId);
    if (idx === -1) {
        favoritesList.push(placeId);
    } else {
        favoritesList.splice(idx, 1);
    }

    await saveUserDataToVK();
    updateAllUI(placeId);
}

// 5. Переключение Галочки (Я там был)
async function toggleVisited(placeId, event) {
    if (event) event.stopPropagation();

    const idx = visitedList.indexOf(placeId);
    if (idx === -1) {
        visitedList.push(placeId);
    } else {
        visitedList.splice(idx, 1);
    }

    await saveUserDataToVK();
    updateAllUI(placeId);
}

// Синхронизация интерфейса во всех вкладках
function updateAllUI(placeId) {
    // Обновляем кнопки в карточке на карте (если открыта)
    const mapFavBtn = document.getElementById(`popup-fav-btn-${placeId}`);
    const mapVisBtn = document.getElementById(`popup-vis-btn-${placeId}`);
    
    if (mapFavBtn) {
        mapFavBtn.className = `fav-badge-btn ${isFavorite(placeId) ? 'active' : ''}`;
        mapFavBtn.innerHTML = `<i class="${isFavorite(placeId) ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`;
    }
    if (mapVisBtn) {
        mapVisBtn.className = `visited-badge-btn ${isVisited(placeId) ? 'active' : ''}`;
        mapVisBtn.innerHTML = `<i class="fa-solid fa-check"></i>`;
    }

    // Обновляем текущий экран
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id === 'tab-profile') {
        renderProfileScreen();
    } else if (activeTab && activeTab.id === 'tab-feed') {
        if (typeof renderFeed === 'function' && typeof allPlacesData !== 'undefined') {
            renderFeed(allPlacesData);
        }
    }
}

// Расчет ранга путешественника
function getTravelerRank(score) {
    if (score === 0) return { title: 'Новичок-турист 🎒', color: '#888' };
    if (score <= 3) return { title: 'Любитель приключений 🌲', color: '#4CAF50' };
    if (score <= 8) return { title: 'Опытный гид 🧭', color: '#2787F5' };
    if (score <= 15) return { title: 'Исследователь материков 🌍', color: '#9C27B0' };
    return { title: 'Легенда путешествий 👑', color: '#FFD700' };
}

// Отрисовка Экрана Профиля
function renderProfileScreen() {
    const container = document.getElementById('profile-content');
    if (!container) return;

    const avatar = vkUserData?.photo_200 || 'https://vk.com/images/camera_200.png';
    const name = vkUserData ? `${vkUserData.first_name} ${vkUserData.last_name}` : 'Путешественник';

    const totalPlaces = (typeof allPlacesData !== 'undefined') ? allPlacesData.length : 0;
    const favPlaces = (typeof allPlacesData !== 'undefined') ? allPlacesData.filter(p => isFavorite(p.id)) : [];
    const visitedPlaces = (typeof allPlacesData !== 'undefined') ? allPlacesData.filter(p => isVisited(p.id)) : [];

    // Очки активности
    const totalScore = visitedPlaces.length * 2 + favPlaces.length;
    const rank = getTravelerRank(totalScore);

    // Процент исследования мира
    const progressPercent = totalPlaces > 0 ? Math.round((visitedPlaces.length / totalPlaces) * 100) : 0;

    // Выбор списка для показа в зависимости от под-вкладки
    const activeList = currentProfileSubTab === 'favs' ? favPlaces : visitedPlaces;

    let listHtml = '';
    if (activeList.length === 0) {
        const emptyMsg = currentProfileSubTab === 'favs' 
            ? 'Список "Хочу посетить" пока пуст.<br>Отмечайте места сердечком 🤍'
            : 'Вы пока не отметили ни одного посещённого места.<br>Нажимайте галочку ✅ на карточках!';
        
        listHtml = `
            <div class="empty-fav-box">
                <i class="fa-solid ${currentProfileSubTab === 'favs' ? 'fa-heart-crack' : 'fa-compass'}"></i>
                <p>${emptyMsg}</p>
            </div>`;
    } else {
        activeList.forEach((place) => {
            const imageUrl = place.image && place.image.trim() !== '' 
                ? place.image 
                : 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=600';

            const hasCoords = !isNaN(place.lat) && !isNaN(place.lng);
            const mapBtnHtml = hasCoords 
                ? `<button class="feed-btn sec" onclick="openPlaceOnMap(${place.lat}, ${place.lng})"><i class="fa-solid fa-map-pin"></i> На карту</button>`
                : `<button class="feed-btn sec" style="opacity: 0.5;" onclick="alert('Координаты скоро будут добавлены!')"><i class="fa-solid fa-clock"></i> Скоро</button>`;

            const fav = isFavorite(place.id);
            const vis = isVisited(place.id);

            listHtml += `
                <div class="feed-card">
                    <div class="feed-card-img-wrapper">
                        <img class="feed-card-img" src="${imageUrl}" alt="${place.title}">
                        <span class="feed-card-badge">${place.category || 'Локация'}</span>
                        
                        <!-- Кнопка Хочу посетить -->
                        <button class="fav-badge-btn ${fav ? 'active' : ''}" onclick="toggleFavorite(${place.id}, event)">
                            <i class="${fav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                        </button>

                        <!-- Кнопка Посещено -->
                        <button class="visited-badge-btn ${vis ? 'active' : ''}" onclick="toggleVisited(${place.id}, event)">
                            <i class="fa-solid fa-check"></i>
                        </button>
                    </div>
                    <div class="feed-card-body">
                        <h3 class="feed-card-title">${place.title}</h3>
                        <p class="feed-card-text">${place.description}</p>
                        <div class="feed-card-actions">
                            ${mapBtnHtml}
                            <a class="feed-btn prim" href="${place.link}" target="_blank">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i> В группу
                            </a>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = `
        <!-- Шапка Профиля -->
        <div class="profile-header-card">
            <img class="profile-avatar" src="${avatar}" alt="${name}">
            <div class="profile-info">
                <h2 class="profile-name">${name}</h2>
                <span class="profile-status" style="color: ${rank.color}; background: rgba(255,255,255,0.05);">${rank.title}</span>
            </div>
        </div>

        <!-- Прогресс-бар -->
        <div class="progress-card">
            <div class="progress-header">
                <span>Исследовано планеты</span>
                <span class="progress-val">${progressPercent}%</span>
            </div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
            </div>
            <div class="progress-subtext">Посещено ${visitedPlaces.length} из ${totalPlaces} локаций</div>
        </div>

        <!-- Статистика -->
        <div class="profile-stats-row">
            <div class="stat-box">
                <span class="stat-number">${favPlaces.length}</span>
                <span class="stat-label">❤️ Хочу посетить</span>
            </div>
            <div class="stat-box">
                <span class="stat-number">${visitedPlaces.length}</span>
                <span class="stat-label">✅ Был там</span>
            </div>
        </div>

        <!-- Быстрые действия -->
        <div class="profile-actions-menu">
            <a href="https://vk.ru/thebeautyofplan" target="_blank" class="menu-item-btn">
                <div class="menu-item-left">
                    <i class="fa-brands fa-vk" style="color: #2787F5;"></i>
                    <span>Наша группа ВКонтакте</span>
                </div>
                <i class="fa-solid fa-chevron-right arrow"></i>
            </a>
            <button onclick="shareApp()" class="menu-item-btn">
                <div class="menu-item-left">
                    <i class="fa-solid fa-share-nodes" style="color: #4CAF50;"></i>
                    <span>Поделиться сервисом</span>
                </div>
                <i class="fa-solid fa-chevron-right arrow"></i>
            </button>
        </div>

        <!-- Под-вкладки коллекции -->
        <div class="profile-sub-tabs">
            <button class="sub-tab-btn ${currentProfileSubTab === 'favs' ? 'active' : ''}" onclick="switchProfileSubTab('favs')">
                <i class="fa-solid fa-heart"></i> Хочу посетить (${favPlaces.length})
            </button>
            <button class="sub-tab-btn ${currentProfileSubTab === 'visited' ? 'active' : ''}" onclick="switchProfileSubTab('visited')">
                <i class="fa-solid fa-circle-check"></i> Я там был (${visitedPlaces.length})
            </button>
        </div>

        <!-- Список мест -->
        <div class="profile-fav-list">
            ${listHtml}
        </div>
    `;
}

// Переключение внутренних под-вкладок в профиле
function switchProfileSubTab(tab) {
    currentProfileSubTab = tab;
    renderProfileScreen();
}

function shareApp() {
    if (window.vkBridge) {
        vkBridge.send('VKWebAppShare', { link: 'https://vk.ru/thebeautyofplan' })
            .catch(e => console.log('Шеринг отменен:', e));
    } else {
        navigator.clipboard.writeText('https://vk.ru/thebeautyofplan');
        alert('Ссылка на группу скопирована в буфер обмена!');
    }
}