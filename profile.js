const VK_FAVS_KEY = 'krasoty_planety_favs';
const VK_VISITED_KEY = 'krasoty_planety_visited';

let favoritesList = [];
let visitedList = [];
let vkUserData = null;
let currentProfileSubTab = 'favs';

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
            console.warn('Ошибка загрузки из VK Storage:', e);
            loadLocalData();
        }
    } else {
        loadLocalData();
    }
}

function loadLocalData() {
    try {
        favoritesList = JSON.parse(localStorage.getItem(VK_FAVS_KEY) || '[]');
        visitedList = JSON.parse(localStorage.getItem(VK_VISITED_KEY) || '[]');
    } catch (e) {
        favoritesList = [];
        visitedList = [];
    }
}

// Сохранение списков
async function saveUserData() {
    const favsJson = JSON.stringify(favoritesList);
    const visJson = JSON.stringify(visitedList);

    localStorage.setItem(VK_FAVS_KEY, favsJson);
    localStorage.setItem(VK_VISITED_KEY, visJson);

    if (window.vkBridge) {
        try {
            await vkBridge.send('VKWebAppStorageSet', { key: VK_FAVS_KEY, value: favsJson });
            await vkBridge.send('VKWebAppStorageSet', { key: VK_VISITED_KEY, value: visJson });
        } catch (e) {
            console.warn('Ошибка сохранения в VK Storage:', e);
        }
    }
}

// Проверки статусов
function isFavorite(id) {
    return favoritesList.includes(id);
}

function isVisited(id) {
    return visitedList.includes(id);
}

// Переключатели Избранное / Посещенное
function toggleFavorite(id, event) {
    if (event) event.stopPropagation();

    if (favoritesList.includes(id)) {
        favoritesList = favoritesList.filter(item => item !== id);
    } else {
        favoritesList.push(id);
    }

    saveUserData();
    updateUIState(id);
}

function toggleVisited(id, event) {
    if (event) event.stopPropagation();

    if (visitedList.includes(id)) {
        visitedList = visitedList.filter(item => item !== id);
    } else {
        visitedList.push(id);
    }

    saveUserData();
    updateUIState(id);
}

function updateUIState(id) {
    if (typeof applyCurrentFilters === 'function') {
        applyCurrentFilters();
    }
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id === 'tab-profile') {
        renderProfileScreen();
    }
}

// Подсчет ранга путешественника
function getUserRankInfo(visitedCount) {
    if (visitedCount >= 50) return { title: 'Легенда Планеты 🌟', next: 100, progress: 100, color: '#ff1744' };
    if (visitedCount >= 25) return { title: 'Первооткрыватель 🧭', next: 50, progress: Math.min(100, Math.round((visitedCount / 50) * 100)), color: '#e040fb' };
    if (visitedCount >= 10) return { title: 'Опытный Турист 🎒', next: 25, progress: Math.min(100, Math.round((visitedCount / 25) * 100)), color: '#00e676' };
    if (visitedCount >= 3) return { title: 'Исследователь 🗺', next: 10, progress: Math.min(100, Math.round((visitedCount / 10) * 100)), color: '#29b6f6' };
    return { title: 'Новичок 🏕', next: 3, progress: Math.min(100, Math.round((visitedCount / 3) * 100)), color: '#2787F5' };
}

// 🎨 Отрисовка Экрана Профиля
function renderProfileScreen() {
    const container = document.getElementById('profile-container');
    if (!container) return;

    const visitedCount = visitedList.length;
    const favCount = favoritesList.length;
    const rank = getUserRankInfo(visitedCount);

    const userName = vkUserData ? `${vkUserData.first_name} ${vkUserData.last_name}` : 'Путешественник';
    const userPhoto = vkUserData ? vkUserData.photo_200 : 'https://vk.com/images/camera_200.png';

    let placesToRender = [];
    if (currentProfileSubTab === 'favs') {
        placesToRender = (typeof allPlacesData !== 'undefined') ? allPlacesData.filter(p => favoritesList.includes(p.id)) : [];
    } else {
        placesToRender = (typeof allPlacesData !== 'undefined') ? allPlacesData.filter(p => visitedList.includes(p.id)) : [];
    }

    let placesListHtml = '';
    if (placesToRender.length === 0) {
        const emptyMsg = currentProfileSubTab === 'favs' 
            ? 'У вас пока нет избранных мест.<br>Отмечайте сердечком понравившиеся локации в ленте!' 
            : 'Вы еще не отметили ни одного посещенного места.<br>Нажимайте галочку на карточках!';
        
        placesListHtml = `
            <div class="empty-fav-box">
                <i class="fa-solid ${currentProfileSubTab === 'favs' ? 'fa-heart-crack' : 'fa-compass'}"></i>
                <p>${emptyMsg}</p>
            </div>
        `;
    } else {
        placesToRender.forEach(place => {
            const imageUrl = place.image && place.image.trim() !== '' 
                ? place.image 
                : 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=600';

            const fav = isFavorite(place.id);
            const vis = isVisited(place.id);

            placesListHtml += `
                <div class="feed-card" onclick="openPlaceDetails(${place.id})">
                    <div class="feed-card-img-wrapper">
                        <img class="feed-card-img" src="${imageUrl}" alt="${place.title}">
                        <span class="feed-card-badge">${place.category || 'Локация'}</span>
                        
                        <button class="fav-badge-btn ${fav ? 'active' : ''}" onclick="toggleFavorite(${place.id}, event)">
                            <i class="${fav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                        </button>

                        <button class="visited-badge-btn ${vis ? 'active' : ''}" onclick="toggleVisited(${place.id}, event)">
                            <i class="fa-solid fa-check"></i>
                        </button>
                    </div>
                    <div class="feed-card-body">
                        <h3 class="feed-card-title">${place.title}</h3>
                        <p class="feed-card-text">${place.description}</p>
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = `
        <div class="profile-header-card">
            <img src="${userPhoto}" class="profile-avatar" alt="Avatar">
            <div class="profile-info">
                <h2 class="profile-name">${userName}</h2>
                <div class="profile-status" style="background: ${rank.color}20; color: ${rank.color}; border: 1px solid ${rank.color}40;">
                    ${rank.title}
                </div>
            </div>
        </div>

        <div class="progress-card">
            <div class="progress-header">
                <span>Уровень исследований</span>
                <span class="progress-val">${visitedCount} / ${rank.next} мест</span>
            </div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${rank.progress}%; background: ${rank.color};"></div>
            </div>
            <div class="progress-subtext">Посетите еще ${Math.max(0, rank.next - visitedCount)} локации для повышения ранга</div>
        </div>

        <div class="profile-stats-row">
            <div class="stat-box">
                <span class="stat-number">${visitedCount}</span>
                <span class="stat-label">Посещено</span>
            </div>
            <div class="stat-box">
                <span class="stat-number">${favCount}</span>
                <span class="stat-label">В избранном</span>
            </div>
        </div>

        <div class="profile-actions-menu">
            <button class="menu-item-btn" onclick="shareUserRankStory()">
                <div class="menu-item-left">
                    <i class="fa-solid fa-circle-play" style="color: #2787F5;"></i>
                    <span>Поделиться рангом в Истории</span>
                </div>
                <i class="fa-solid fa-chevron-right arrow"></i>
            </button>
            <button class="menu-item-btn" onclick="shareApp()">
                <div class="menu-item-left">
                    <i class="fa-solid fa-share-nodes" style="color: #4caf50;"></i>
                    <span>Рассказать друзьям</span>
                </div>
                <i class="fa-solid fa-chevron-right arrow"></i>
            </button>
        </div>

        <div class="profile-sub-tabs">
            <button class="chip-btn ${currentProfileSubTab === 'favs' ? 'active' : ''}" onclick="switchProfileSubTab('favs')">
                <i class="fa-solid fa-heart"></i> Избранное (${favCount})
            </button>
            <button class="chip-btn ${currentProfileSubTab === 'visited' ? 'active' : ''}" onclick="switchProfileSubTab('visited')">
                <i class="fa-solid fa-check"></i> Посещено (${visitedCount})
            </button>
        </div>

        <div class="profile-fav-list">
            ${placesListHtml}
        </div>
    `;
}

function switchProfileSubTab(subTab) {
    currentProfileSubTab = subTab;
    renderProfileScreen();
}

// Генерация истории VK
function shareUserRankStory() {
    if (!window.vkBridge) {
        alert('Поделиться историей можно только внутри ВКонтакте!');
        return;
    }

    const visitedCount = visitedList.length;
    const rank = getUserRankInfo(visitedCount);
    const userName = vkUserData ? vkUserData.first_name : 'Путешественник';

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');

    // Градиент фона
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 1920);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1920);

    // Заголовок
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('МОИ ПУТЕШЕСТВИЯ', 540, 450);

    // Карточка ранга
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.roundRect(140, 550, 800, 600, 40);
    ctx.fill();

    // Текст имени и ранга
    ctx.fillStyle = '#94a3b8';
    ctx.font = '36px -apple-system, sans-serif';
    ctx.fillText(userName, 540, 680);

    ctx.fillStyle = rank.color;
    ctx.font = 'bold 64px -apple-system, sans-serif';
    ctx.fillText(rank.title, 540, 780);

    // Статистика
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 96px -apple-system, sans-serif';
    ctx.fillText(String(visitedCount), 540, 960);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '32px -apple-system, sans-serif';
    ctx.fillText('красивых мест посещено', 540, 1030);

    // Низ
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 42px -apple-system, sans-serif';
    ctx.fillText('Красоты Планеты', 540, 1500);

    const blob = canvas.toDataURL('image/png');
    const appUrl = 'https://vk.com/app51800000'; // Замени на ID твоего сервиса при необходимости

    vkBridge.send('VKWebAppShowStoryBox', {
        background_type: 'image',
        blob: blob,
        attachment: {
            text: 'open',
            type: 'url',
            url: appUrl
        }
    }).catch(e => {
        console.log('Отмена выкладки истории:', e);
    });
}

function shareApp() {
    if (window.vkBridge) {
        vkBridge.send('VKWebAppShare', { link: 'https://vk.com/app51800000' });
    } else {
        alert('Поделиться можно внутри ВКонтакте!');
    }
}