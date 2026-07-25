// Ключ для хранения в облаке VK
const VK_STORAGE_KEY = 'krasoty_planety_favs';

// Глобальный массив с ID избранных мест
let favoritesList = [];
let isVkStorageLoaded = false;

// Загрузка избранного из облака VK
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
            console.error('Ошибка загрузки из VK Storage, fallback на LocalStorage:', e);
            fallbackLoadLocalStorage();
        }
    } else {
        fallbackLoadLocalStorage();
    }
    isVkStorageLoaded = true;
}

// Запасной вариант (для локального тестирования вне VK)
function fallbackLoadLocalStorage() {
    try {
        const local = localStorage.getItem(VK_STORAGE_KEY);
        favoritesList = local ? JSON.parse(local) : [];
    } catch (e) {
        favoritesList = [];
    }
}

// Сохранение избранного в облако VK
async function saveFavoritesToVK() {
    const jsonString = JSON.stringify(favoritesList);
    
    // Запасное локальное сохранение
    try { localStorage.setItem(VK_STORAGE_KEY, jsonString); } catch (e) {}

    // Облачное сохранение в VK Profile
    if (window.vkBridge) {
        try {
            await vkBridge.send('VKWebAppStorageSet', {
                key: VK_STORAGE_KEY,
                value: jsonString
            });
        } catch (e) {
            console.error('Ошибка сохранения в VK Storage:', e);
        }
    }
}

// Проверить, в избранном ли точка
function isFavorite(placeId) {
    return favoritesList.includes(placeId);
}

// Переключить состояние избранного (Лента + Карта)
async function toggleFavorite(placeId, event) {
    if (event) event.stopPropagation();

    const index = favoritesList.indexOf(placeId);

    if (index === -1) {
        favoritesList.push(placeId);
    } else {
        favoritesList.splice(index, 1);
    }

    // Сохраняем в облако
    await saveFavoritesToVK();

    // Синхронизируем UI во всех вкладках и попапах
    updateAllFavoriteUI(placeId);
}

// Синхронизация иконок сердечка во всем приложении
function updateAllFavoriteUI(placeId) {
    const isFav = isFavorite(placeId);

    // 1. Обновляем иконку в Попапе на Карте (если он открыт)
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

    // 2. Если мы на вкладке Избранного — перерисовываем список
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id === 'tab-favorites') {
        renderFavoritesScreen();
    } 
    // 3. Если мы в Ленте — обновляем карточки в ленте
    else if (activeTab && activeTab.id === 'tab-feed') {
        renderFeed(allPlacesData);
    }
}

// Отрисовка экрана Избранного
function renderFavoritesScreen() {
    const favContainer = document.getElementById('favorites-list');
    if (!favContainer) return;

    const favoritePlaces = allPlacesData.filter(place => isFavorite(place.id));

    if (favoritePlaces.length === 0) {
        favContainer.innerHTML = `
            <div class="placeholder-screen">
                <i class="fa-solid fa-heart-crack"></i>
                <h2>Избранных мест пока нет</h2>
                <p>Нажимайте на сердечко 🤍 в Ленте или на Карте, чтобы сохранить локации в облако VK.</p>
            </div>`;
        return;
    }

    let html = '';

    favoritePlaces.forEach((place) => {
        const imageUrl = place.image && place.image.trim() !== '' 
            ? place.image 
            : 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=600';

        const hasCoords = !isNaN(place.lat) && !isNaN(place.lng);
        
        const mapBtnHtml = hasCoords 
            ? `<button class="feed-btn sec" onclick="openPlaceOnMap(${place.lat}, ${place.lng})">
                <i class="fa-solid fa-map-pin"></i> На карту
               </button>`
            : `<button class="feed-btn sec" style="opacity: 0.5; cursor: not-allowed;" onclick="alert('Координаты скоро будут добавлены!')">
                <i class="fa-solid fa-clock"></i> Скоро
               </button>`;

        html += `
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

    favContainer.innerHTML = html;
}