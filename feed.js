// Переменная для хранения сохраненного списка всех мест
let allPlacesData = [];

// Функция отрисовки ленты мест
function renderFeed(places) {
    const feedContainer = document.getElementById('feed-list');
    if (!feedContainer) return;

    if (places.length === 0) {
        feedContainer.innerHTML = `
            <div class="placeholder-screen">
                <i class="fa-solid fa-magnifying-glass"></i>
                <p>Ничего не найдено</p>
            </div>`;
        return;
    }

    let html = '';

    places.forEach((place) => {
        html += `
            <div class="feed-card">
                <div class="feed-card-img-wrapper">
                    <img class="feed-card-img" src="${place.image || 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9'}" alt="${place.title}">
                    <span class="feed-card-badge">${place.category || 'Локация'}</span>
                </div>
                <div class="feed-card-body">
                    <h3 class="feed-card-title">${place.title}</h3>
                    <p class="feed-card-text">${place.description}</p>
                    <div class="feed-card-actions">
                        <button class="feed-btn sec" onclick="openPlaceOnMap(${place.lat}, ${place.lng})">
                            <i class="fa-solid fa-map-pin"></i> На карту
                        </button>
                        <a class="feed-btn prim" href="${place.link}" target="_blank">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> В группу
                        </a>
                    </div>
                </div>
            </div>
        `;
    });

    feedContainer.innerHTML = html;
}

// Загрузка и парсинг данных для ленты
async function loadFeedData() {
    const SHEET_ID = '1IL0rA5nhgrR6PY2kecw2EGmghOttrgGAZ4oU4lQLps8';
    const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

    try {
        const res = await fetch(SHEET_URL);
        const text = await res.text();
        const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
        if (!match) return;

        const json = JSON.parse(match[1]);
        const rows = json.table.rows || [];

        allPlacesData = [];

        rows.forEach((row, index) => {
            if (!row.c) return;
            const getV = (i) => (row.c[i] && row.c[i].v !== null && row.c[i].v !== undefined) ? row.c[i].v : '';

            const lat = parseFloat(String(getV(3)).replace(',', '.'));
            const lng = parseFloat(String(getV(4)).replace(',', '.'));

            if (!isNaN(lat) && !isNaN(lng)) {
                allPlacesData.push({
                    id: index,
                    title: getV(1) || 'Без названия',
                    category: getV(2) || 'Локация',
                    lat: lat,
                    lng: lng,
                    image: getV(6),
                    description: getV(7) || 'Описание временно отсутствует.',
                    link: getV(8) || VK_PUBLIC_URL
                });
            }
        });

        renderFeed(allPlacesData);
    } catch (e) {
        console.error("Ошибка загрузки ленты:", e);
    }
}

// Переход к точке на карте из ленты
function openPlaceOnMap(lat, lng) {
    // 1. Переключаем на вкладку карты через глобальную функцию
    if (typeof switchTab === 'function') {
        switchTab('map');
    }

    // 2. Наводим карту на координаты места с красивым зумом
    if (map) {
        map.setView([lat, lng], 12);
    }
}

// Поиск по ленте
function filterFeed(query) {
    const cleanQuery = query.toLowerCase().trim();
    if (!cleanQuery) {
        renderFeed(allPlacesData);
        return;
    }

    const filtered = allPlacesData.filter(place => 
        place.title.toLowerCase().includes(cleanQuery) || 
        place.description.toLowerCase().includes(cleanQuery) ||
        place.category.toLowerCase().includes(cleanQuery)
    );

    renderFeed(filtered);
}