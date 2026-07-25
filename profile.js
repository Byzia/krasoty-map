const VK_STORAGE_KEY = 'krasoty_planety_favs';
let favoritesList = [];
let vkUserData = null;

// 1. Загрузка данных пользователя из VK Bridge
async function loadVkUserData() {
    if (window.vkBridge) {
        try {
            const user = await vkBridge.send('VKWebAppGetUserInfo');
            if (user && user.first_name) {
                vkUserData = user;
            }
        } catch (e) {
            console.warn('Данные профиля VK недоступны, используем гостевой режим:', e);
        }
    }
}

// 2. Загрузка избранного из VK Storage
async function loadFavoritesFromVK() {
    if (window.vkBridge) {
        try {
            const data = await vkBridge.send('VKWebAppStorageGet', { keys: [VK_STORAGE_KEY] });
            if (data && data.keys && data.keys[0] && data.keys[0].value) {
                favoritesList = JSON.parse(data.keys[0].value);
            } else {
                favoritesList = [];
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
        const local = localStorage.getItem(VK_STORAGE_KEY);
        favoritesList = local ? JSON.parse(local) : [];
    } catch (e) {
        favoritesList = [];
    }
}

// 3. Сохранение избранного в VK Storage
async function saveFavoritesToVK() {
    const jsonString = JSON.stringify(favoritesList);
    try { localStorage.setItem(VK_STORAGE_KEY, jsonString); } catch (e) {}

    if (window.vkBridge) {
        try {
            await vkBridge.send('VKWebAppStorageSet', {
                key: VK_STORAGE_KEY,
                value: jsonString
            });
        } catch (e) {}
    }
}

function isFavorite(placeId) {
    return favoritesList.includes(placeId);
}

// 4. Переключение сердечка (синхронизация)
async function toggleFavorite(placeId, event) {
    if (event) event.stopPropagation();

    const index = favoritesList.indexOf(placeId);
    if (index === -1) {
        favoritesList.push(placeId);
    } else {
        favoritesList.splice(index, 1);
    }

    await saveFavoritesToVK();
    updateAllFavoriteUI(placeId);
}

function updateAllFavoriteUI(placeId) {
    const isFav = isFavorite(placeId);

    // Обновляем кнопку в Попапе на Карте
    const mapFavBtn = document.getElementById(`popup-fav-btn-${placeId}`);
    if (mapFavBtn) {
        if (isFav) {
            mapFavBtn.classList.add('active');
            mapFavBtn.innerHTML = '<i class="fa-solid fa-heart"></i>';
        } else {
            mapFavBtn.classList.remove('active');
            mapFavBtn.innerHTML = '<i class="fa-regular fa-heart"></i>';
        }
    }

    // Обновляем текущий активный экран
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id === 'tab-profile') {
        renderProfileScreen();
    } else if (activeTab && activeTab.id === 'tab-feed') {
        if (typeof renderFeed === 'function' && typeof allPlacesData !== 'undefined') {
            renderFeed(allPlacesData);
        }
    }
}

// 5. Отрисовка Экрана Профиля
function renderProfileScreen() {
    const container = document.getElementById('profile-content');
    if (!container) return;

    // Аватар и имя
    const avatar = vkUserData?.photo_200 || 'https://vk.com/images/camera_200.png';
    const name = vkUserData ? `${vkUserData.first_name} ${vkUserData.last_name}` : 'Путешественник';

    // Сохраненные места
    const favPlaces = (typeof allPlacesData !== 'undefined') 
        ? allPlacesData.filter(place => isFavorite(place.id))
        : [];

    let favItemsHtml = '';
    if (favPlaces.length === 0) {
        favItemsHtml = `
            <div class="empty-fav-box">
                <i class="fa-solid fa-heart-crack"></i>
                <p>У вас пока нет сохраненных мест.<br>Нажимайте 🤍 на карточках в Ленте или на Карте!</p>
            </div>`;
    } else {
        favPlaces.forEach((place) => {
            const imageUrl = place.image && place.image.trim() !== '' 
                ? place.image 
                : 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=600';

            const hasCoords = !isNaN(place.lat) && !isNaN(place.lng);
            const mapBtnHtml = hasCoords 
                ? `<button class="feed-btn sec" onclick="openPlaceOnMap(${place.lat}, ${place.lng})"><i class="fa-solid fa-map-pin"></i> На карту</button>`
                : `<button class="feed-btn sec" style="opacity: 0.5;" onclick="alert('Координаты скоро будут добавлены!')"><i class="fa-solid fa-clock"></i> Скоро</button>`;

            favItemsHtml += `
                <div class="feed-card">
                    <div class="feed-card-img-wrapper">
                        <img class="feed-card-img" src="${imageUrl}" alt="${place.title}">
                        <span class="feed-card-badge">${place.category || 'Локация'}</span>
                        <button class="fav-badge-btn active" onclick="toggleFavorite(${place.id}, event)">
                            <i class="fa-solid fa-heart"></i>
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

    const totalLocations = (typeof allPlacesData !== 'undefined') ? allPlacesData.length : 0;

    container.innerHTML = `
        <!-- Шапка Профиля -->
        <div class="profile-header-card">
            <img class="profile-avatar" src="${avatar}" alt="${name}">
            <div class="profile-info">
                <h2 class="profile-name">${name}</h2>
                <span class="profile-status">Исследователь планеты 🌍</span>
            </div>
        </div>

        <!-- Статистика -->
        <div class="profile-stats-row">
            <div class="stat-box">
                <span class="stat-number">${favPlaces.length}</span>
                <span class="stat-label">В Избранном</span>
            </div>
            <div class="stat-box">
                <span class="stat-number">${totalLocations}</span>
                <span class="stat-label">Всего локаций</span>
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
                    <span>Поделиться с друзьями</span>
                </div>
                <i class="fa-solid fa-chevron-right arrow"></i>
            </button>
        </div>

        <!-- Избранные места -->
        <div class="profile-section-title">
            <h3><i class="fa-solid fa-heart" style="color: #e53935;"></i> Мои сохраненные места</h3>
        </div>
        <div class="profile-fav-list">
            ${favItemsHtml}
        </div>
    `;
}

// Поделиться сервисом во ВКонтакте
function shareApp() {
    if (window.vkBridge) {
        vkBridge.send('VKWebAppShare', { link: 'https://vk.ru/thebeautyofplan' })
            .catch(e => console.log('Шеринг отменен:', e));
    } else {
        navigator.clipboard.writeText('https://vk.ru/thebeautyofplan');
        alert('Ссылка на группу скопирована в буфер обмена!');
    }
}