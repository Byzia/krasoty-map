let map = null;
let markersCluster = null;

function initMap() {
    if (map) return; // Карта уже создана

    // Инициализация карты (Санкт-Петербург / Россия по умолчанию)
    map = L.map('map', {
        center: [59.9342802, 30.3350986],
        zoom: 5,
        zoomControl: false
    });

    // Тёмный слой карты CartoDB DarkMatter
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(map);

    // Кластеризация маркеров
    markersCluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 40
    });

    map.addLayer(markersCluster);

    // Кнопка геолокации
    const geoBtn = document.getElementById('geoBtn');
    if (geoBtn) {
        geoBtn.addEventListener('click', locateUser);
    }

    // Загружаем точки из таблицы
    loadMapPoints();
}

// Загрузка точек из таблицы Google
async function loadMapPoints() {
    const SHEET_ID = '1IL0rA5nhgrR6PY2kecw2EGmghOttrgGAZ4oU4lQLps8';
    const cacheBuster = new Date().getTime();
    const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&_cb=${cacheBuster}`;

    try {
        const res = await fetch(SHEET_URL);
        const text = await res.text();
        const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
        if (!match) return;

        const json = JSON.parse(match[1]);
        const rows = json.table.rows || [];

        // Очищаем старые маркеры
        markersCluster.clearLayers();

        rows.forEach((row, index) => {
            if (!row.c) return;

            const getV = (i) => {
                if (!row.c[i]) return '';
                if (row.c[i].v !== null && row.c[i].v !== undefined) return String(row.c[i].v);
                if (row.c[i].f !== null && row.c[i].f !== undefined) return String(row.c[i].f);
                return '';
            };

            const lat = parseFloat(getV(3).replace(',', '.'));
            const lng = parseFloat(getV(4).replace(',', '.'));

            if (!isNaN(lat) && !isNaN(lng)) {
                const title = getV(1) || 'Локация';
                const category = getV(2) || 'Природа';
                const image = getV(6) || 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=600';
                const description = getV(7) || '';
                const link = getV(8) || 'https://vk.ru/thebeautyofplan';

                // Создаем красивый кастомный маркер
                const customIcon = L.divIcon({
                    className: 'custom-pin',
                    html: `<i class="fa-solid fa-location-dot"></i>`,
                    iconSize: [36, 36],
                    iconAnchor: [18, 36],
                    popupAnchor: [0, -32]
                });

                const marker = L.marker([lat, lng], { icon: customIcon });

                // Проверяем статус Избранного
                const fav = typeof isFavorite === 'function' && isFavorite(index);
                const favIconClass = fav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
                const favActiveClass = fav ? 'active' : '';

                // Шаблон Popup карточки на карте с СЕРДЕЧКОМ
                const popupContent = `
                    <div class="popup-card">
                        <div style="position: relative;">
                            <img src="${image}" class="popup-img" alt="${title}">
                            <button id="popup-fav-btn-${index}" class="fav-badge-btn ${favActiveClass}" onclick="toggleFavorite(${index}, event)">
                                <i class="${favIconClass}"></i>
                            </button>
                        </div>
                        <div class="popup-body">
                            <div class="popup-title">${title}</div>
                            <div class="popup-text">${description.substring(0, 90)}...</div>
                            <a href="${link}" target="_blank" class="popup-link">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i> В группу VK
                            </a>
                        </div>
                    </div>
                `;

                marker.bindPopup(popupContent);
                markersCluster.addLayer(marker);
            }
        });

    } catch (e) {
        console.error("Ошибка загрузки точек карты:", e);
    }
}

// Определить местоположение пользователя
function locateUser() {
    if (!map) return;

    map.locate({ setView: true, maxZoom: 13 })
        .on('locationfound', (e) => {
            L.circleMarker(e.latlng, {
                radius: 8,
                color: '#ffffff',
                fillColor: '#2787F5',
                fillOpacity: 1,
                weight: 3
            }).addTo(map).bindPopup("Вы здесь").openPopup();
        })
        .on('locationerror', () => {
            alert("Не удалось определить ваше местоположение.");
        });
}