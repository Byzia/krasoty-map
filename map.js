let map = null;
let markersClusterGroup = null;
let userMarker = null;

function initMap() {
    if (map) return;

    const worldBounds = L.latLngBounds(
        L.latLng(-85, -180),
        L.latLng(85, 180)
    );

    map = L.map('map', { 
        zoomControl: false,
        minZoom: 3,
        maxBounds: worldBounds,
        maxBoundsViscosity: 1.0
    }).setView([60.0, 95.0], 3);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 18,
        minZoom: 3,
        noWrap: true,
        bounds: worldBounds
    }).addTo(map);

    markersClusterGroup = L.markerClusterGroup({
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        spiderfyOnMaxZoom: true,
        maxClusterRadius: 60,
        disableClusteringAtZoom: 15
    });
    
    map.addLayer(markersClusterGroup);

    loadMapPoints();

    const geoBtn = document.getElementById('geoBtn');
    if (geoBtn) {
        geoBtn.onclick = locateUser;
    }
    map.on('locationfound', (e) => setUserLocation(e.latlng.lat, e.latlng.lng));
}

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

        markersClusterGroup.clearLayers();

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
                const iconHtml = getV(5) || '<i class="fa-solid fa-location-dot"></i>';
                const image = getV(6) || 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=600';
                const description = getV(7) || '';
                const link = getV(8) || 'https://vk.ru/thebeautyofplan';

                const customIcon = L.divIcon({
                    className: 'custom-pin',
                    html: iconHtml,
                    iconSize: [36, 36],
                    iconAnchor: [18, 18]
                });

                const marker = L.marker([lat, lng], { icon: customIcon });

                const fav = typeof isFavorite === 'function' && isFavorite(index);
                const vis = typeof isVisited === 'function' && isVisited(index);

                // Карточка с ДВУМЯ кнопками действий
                const popupContent = `
                    <div class="popup-card">
                        <div style="position: relative;">
                            <img src="${image}" class="popup-img" alt="${title}">
                            
                            <button id="popup-fav-btn-${index}" class="fav-badge-btn ${fav ? 'active' : ''}" onclick="toggleFavorite(${index}, event)">
                                <i class="${fav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                            </button>

                            <button id="popup-vis-btn-${index}" class="visited-badge-btn ${vis ? 'active' : ''}" onclick="toggleVisited(${index}, event)">
                                <i class="fa-solid fa-check"></i>
                            </button>
                        </div>
                        <div class="popup-body">
                            <div class="popup-title">${title}</div>
                            <div class="popup-text">${description}</div>
                            <a href="${link}" target="_blank" class="popup-link">Перейти к посту</a>
                        </div>
                    </div>
                `;

                marker.bindPopup(popupContent);
                markersClusterGroup.addLayer(marker);
            }
        });
    } catch (e) {
        console.error("Ошибка загрузки точек карты:", e);
    }
}

function locateUser() {
    if (window.vkBridge && vkBridge.isWebView && vkBridge.isWebView()) {
        vkBridge.send('VKWebAppGetGeodata')
            .then(data => {
                if (data && data.available) {
                    setUserLocation(data.lat, data.long);
                } else {
                    if (map) map.locate({ setView: true, maxZoom: 10 });
                }
            })
            .catch(() => { if (map) map.locate({ setView: true, maxZoom: 10 }); });
    } else {
        if (map) map.locate({ setView: true, maxZoom: 10 });
    }
}

function setUserLocation(lat, lng) {
    if (!map) return;
    const latlng = [lat, lng];
    map.setView(latlng, 10);
    if (userMarker) map.removeLayer(userMarker);
    
    const myIcon = L.divIcon({
        className: 'custom-pin',
        html: '<i class="fa-solid fa-user-large"></i>',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });
    userMarker = L.marker(latlng, { icon: myIcon }).addTo(map);
    userMarker.bindPopup("<b>Вы здесь!</b>").openPopup();
}