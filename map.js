// Основной адрес паблика VK
const VK_PUBLIC_URL = 'https://vk.ru/thebeautyofplan';

let map = null;
let markersClusterGroup = null;
let userMarker = null;

function initMap() {
    if (map) return; // Карта уже создана

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

    loadPlaces();

    document.getElementById('geoBtn').onclick = locateUser;
    map.on('locationfound', (e) => setUserLocation(e.latlng.lat, e.latlng.lng));
}

async function loadPlaces() {
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

        rows.forEach((row) => {
            if (!row.c) return;
            const getV = (i) => (row.c[i] && row.c[i].v !== null && row.c[i].v !== undefined) ? row.c[i].v : '';

            const lat = parseFloat(String(getV(3)).replace(',', '.'));
            const lng = parseFloat(String(getV(4)).replace(',', '.'));

            if (!isNaN(lat) && !isNaN(lng)) {
                const iconHtml = getV(5) || '<i class="fa-solid fa-location-dot"></i>';
                const customIcon = L.divIcon({
                    className: 'custom-pin',
                    html: iconHtml,
                    iconSize: [36, 36],
                    iconAnchor: [18, 18]
                });

                const linkUrl = getV(8) || VK_PUBLIC_URL;

                const marker = L.marker([lat, lng], { icon: customIcon });
                marker.bindPopup(`
                    <div class="popup-card">
                        <img class="popup-img" src="${getV(6) || 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9'}">
                        <div class="popup-body">
                            <div class="popup-title">${getV(1) || 'Локация'}</div>
                            <div class="popup-text">${getV(7)}</div>
                            <a class="popup-link" href="${linkUrl}" target="_blank">Перейти к посту</a>
                        </div>
                    </div>
                `);

                markersClusterGroup.addLayer(marker);
            }
        });
    } catch (e) {
        console.error("Ошибка загрузки данных таблицы:", e);
    }
}

function locateUser() {
    if (window.vkBridge && vkBridge.isWebView && vkBridge.isWebView()) {
        vkBridge.send('VKWebAppGetGeodata')
            .then(data => {
                if (data && data.available) {
                    setUserLocation(data.lat, data.long);
                } else {
                    map.locate({ setView: true, maxZoom: 10 });
                }
            })
            .catch(() => map.locate({ setView: true, maxZoom: 10 }));
    } else {
        map.locate({ setView: true, maxZoom: 10 });
    }
}

function setUserLocation(lat, lng) {
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