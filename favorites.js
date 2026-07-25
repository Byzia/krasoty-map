// Ключ для хранения сохраненных id в LocalStorage
const FAVORITES_KEY = 'krasoty_planety_favorites';

// Получить массив ID из памяти
function getFavorites() {
    try {
        const data = localStorage.getItem(FAVORITES_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

// Переключить состояние избранного (добавить / удалить)
function toggleFavorite(placeId, event) {
    if (event) event.stopPropagation();

    let favorites = getFavorites();
    const index = favorites.indexOf(placeId);

    if (index === -1) {
        favorites.push(placeId);
    } else {
        favorites.splice(index, 1);
    }

    try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch (e) {
        console.error("Ошибка сохранения в LocalStorage:", e);
    }

    // Перерисовываем экран, если мы на вкладке Избранного или Ленты
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id === 'tab-favorites') {
        renderFavoritesScreen();
    } else if (activeTab && activeTab.id === 'tab-feed') {
        renderFeed(allPlacesData);
    }
}

// Проверить, находится ли место в избранном
function isFavorite(placeId) {
    const favorites = getFavorites();
    return favorites.includes(placeId);
}

// Отрисовка экрана Избранного
function renderFavoritesScreen() {
    const favContainer = document.getElementById('favorites-list');
    if (!favContainer) return;

    const favIds = getFavorites();

    // Фильтруем общее множество мест из feed.js
    const favoritePlaces = allPlacesData.filter(place => favIds.includes(place.id));

    if (favoritePlaces.length === 0) {
        favContainer.innerHTML = `
            <div class="placeholder-screen">
                <i class="fa-solid fa-heart-crack"></i>
                <h2>Избранных мест пока нет</h2>
                <p>Нажимайте на сердечко 🤍 у понравившихся мест в Ленте, чтобы сохранить их сюда.</p>
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