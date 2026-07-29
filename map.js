let map = null;
let markersClusterGroup = null;
let userMarker = null;
let activeMapCategory = 'Все';

// Инициализация карты Leaflet
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

    setTimeout(() => {
        if (map) map.invalidateSize();
    }, 200);
}

// Загрузка меток
async function loadMapPoints() {
    if (typeof allPlacesData !== 'undefined' && allPlacesData.length === 0 && typeof loadFeedData === 'function') {
        await loadFeedData();
        return;
    }
    if (typeof allPlacesData !== 'undefined' && allPlacesData.length > 0) {
        renderMapMarkers(allPlacesData);
    }
}

// Отрисовка меток на карте с умной дедупликацией (выбирает наиболее полную карточку)
function renderMapMarkers(places) {
    if (!markersClusterGroup) return;
    markersClusterGroup.clearLayers();

    const uniquePlacesMap = new Map();

    places.forEach((place) => {
        if (!place || isNaN(place.lat) || isNaN(place.lng)) return;

        // Создаем ключ уникальности по названию и координатам (округленным до 4 знаков)
        const cleanTitle = (place.title || '').trim().toLowerCase();
        const coordKey = `${Number(place.lat).toFixed(4)}_${Number(place.lng).toFixed(4)}`;
        const uniqueKey = cleanTitle ? `${cleanTitle}_${coordKey}` : coordKey;

        if (!uniquePlacesMap.has(uniqueKey)) {
            uniquePlacesMap.set(uniqueKey, place);
        } else {
            // Если место дублируется в таблице, выбираем вариант с картинкой и более полным описанием
            const existing = uniquePlacesMap.get(uniqueKey);
            const currentHasImage = place.image && place.image.trim() !== '';
            const existingHasImage = existing.image && existing.image.trim() !== '';

            if (currentHasImage && !existingHasImage) {
                uniquePlacesMap.set(uniqueKey, place);
            } else if (currentHasImage === existingHasImage) {
                if ((place.description || '').length >= (existing.description || '').length) {
                    uniquePlacesMap.set(uniqueKey, place);
                }
            }
        }
    });

    uniquePlacesMap.forEach((place) => {
        const customIcon = L.divIcon({
            className: 'custom-pin',
            html: place.icon || '<i class="fa-solid fa-location-dot"></i>',
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });

        const marker = L.marker([place.lat, place.lng], { icon: customIcon });

        const fav = typeof isFavorite === 'function' && isFavorite(place.id);
        const vis = typeof isVisited === 'function' && isVisited(place.id);
        const routeUrl = `https://yandex.ru/maps/?rtext=~${place.lat},${place.lng}&rtt=auto`;

        const imageUrl = place.image && place.image.trim() !== '' 
            ? place.image 
            : 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=600';

        const popupContent = `
            <div class="popup-card" onclick="openPlaceDetails(${place.id})">
                <div style="position: relative;">
                    <img src="${imageUrl}" class="popup-img" alt="${place.title}">
                    
                    <button id="popup-fav-btn-${place.id}" class="fav-badge-btn ${fav ? 'active' : ''}" onclick="toggleFavorite(${place.id}, event)">
                        <i class="${fav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                    </button>

                    <button id="popup-vis-btn-${place.id}" class="visited-badge-btn ${vis ? 'active' : ''}" onclick="toggleVisited(${place.id}, event)">
                        <i class="fa-solid fa-check"></i>
                    </button>
                </div>
                <div class="popup-body">
                    <div class="popup-title">${place.title}</div>
                    <div class="popup-text">${(place.description || '').substring(0, 80)}...</div>
                    <div style="display: flex; gap: 6px;">
                        <a href="${routeUrl}" target="_blank" class="popup-link sec" onclick="event.stopPropagation()">
                            <i class="fa-solid fa-route"></i> Маршрут
                        </a>
                        <a href="${place.link}" target="_blank" class="popup-link" onclick="event.stopPropagation()">
                            Перейти к посту
                        </a>
                    </div>
                </div>
            </div>
        `;

        marker.bindPopup(popupContent);
        markersClusterGroup.addLayer(marker);
    });
}

// Отрисовка чипсов категорий на карте
function renderMapCategoryChips(categories) {
    let chipsContainer = document.getElementById('category-chips-map');
    const tabMap = document.getElementById('tab-map');

    if (!chipsContainer && tabMap) {
        chipsContainer = document.createElement('div');
        chipsContainer.id = 'category-chips-map';
        chipsContainer.className = 'chips-scroll-container map-chips-overlay';
        tabMap.appendChild(chipsContainer);
    }

    if (chipsContainer) {
        let chipsHtml = '';
        categories.forEach(cat => {
            const activeClass = cat === activeMapCategory ? 'active' : '';
            chipsHtml += `<button class="chip-btn ${activeClass}" onclick="setMapCategoryFilter('${cat}')">${cat}</button>`;
        });
        chipsContainer.innerHTML = chipsHtml;
    }
}

function setMapCategoryFilter(cat) {
    activeMapCategory = cat;
    if (typeof allPlacesData !== 'undefined') {
        const categories = ['Все', ...new Set(allPlacesData.map(p => p.category).filter(Boolean))];
        renderMapCategoryChips(categories);
        filterMapByCategory(cat);
    }
}

function filterMapByCategory(cat) {
    activeMapCategory = cat;
    if (typeof allPlacesData === 'undefined') return;
    if (cat === 'Все') {
        renderMapMarkers(allPlacesData);
    } else {
        const filtered = allPlacesData.filter(p => p.category === cat);
        renderMapMarkers(filtered);
    }
}

// Кнопка «Удиви меня»
function surpriseMe() {
    if (typeof allPlacesData === 'undefined' || !allPlacesData || allPlacesData.length === 0) return;

    const pool = activeMapCategory === 'Все' 
        ? allPlacesData 
        : allPlacesData.filter(p => p.category === activeMapCategory);

    if (pool.length === 0) return;

    const randomPlace = pool[Math.floor(Math.random() * pool.length)];

    if (map && !isNaN(randomPlace.lat) && !isNaN(randomPlace.lng)) {
        if (typeof switchTab === 'function') switchTab('map');

        map.flyTo([randomPlace.lat, randomPlace.lng], 12, { animate: true, duration: 1.5 });

        setTimeout(() => {
            openPlaceDetails(randomPlace.id);
        }, 1600);
    }
}

// Открытие полных деталей карточки с кнопкой Историй VK
function openPlaceDetails(placeId) {
    if (typeof allPlacesData === 'undefined') return;
    const place = allPlacesData.find(p => p.id === placeId);
    if (!place) return;

    const modal = document.getElementById('modal-overlay');
    if (!modal) return;

    const fav = typeof isFavorite === 'function' && isFavorite(place.id);
    const vis = typeof isVisited === 'function' && isVisited(place.id);
    const routeUrl = `https://yandex.ru/maps/?rtext=~${place.lat},${place.lng}&rtt=auto`;

    const imageUrl = place.image && place.image.trim() !== '' 
        ? place.image 
        : 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=600';

    modal.innerHTML = `
        <div class="modal-card">
            <button class="modal-close-btn" onclick="closeModal()">&times;</button>
            <div class="modal-img-wrapper">
                <img src="${imageUrl}" class="modal-img" alt="${place.title}">
                <span class="feed-card-badge">${place.category || 'Локация'}</span>
                
                <button class="fav-badge-btn ${fav ? 'active' : ''}" onclick="toggleFavorite(${place.id}, event); updateModalButtons(${place.id});">
                    <i class="${fav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                </button>

                <button class="visited-badge-btn ${vis ? 'active' : ''}" onclick="toggleVisited(${place.id}, event); updateModalButtons(${place.id});">
                    <i class="fa-solid fa-check"></i>
                </button>
            </div>
            <div class="modal-body">
                <h2 class="modal-title">${place.title}</h2>
                <p class="modal-text">${place.description}</p>
                
                <div class="modal-actions">
                    <button onclick="sharePlaceToStory('${imageUrl}', '${place.link}')" class="feed-btn sec" style="background: rgba(233, 30, 99, 0.15) !important; color: #ff80ab !important;">
                        <i class="fa-solid fa-circle-play"></i> Поделиться в Истории VK
                    </button>
                    <a href="${routeUrl}" target="_blank" class="feed-btn sec">
                        <i class="fa-solid fa-route"></i> Построить маршрут
                    </a>
                    <a href="${place.link}" target="_blank" class="feed-btn prim">
                        <i class="fa-solid fa-comments"></i> Читать и обсудить в ВК
                    </a>
                </div>
            </div>
        </div>
    `;

    modal.classList.add('active');
}

// Функция публикации места в историю VK с безопасным catch
function sharePlaceToStory(imageUrl, postLink) {
    if (window.vkBridge) {
        const bgImage = (imageUrl && imageUrl.trim() !== '') 
            ? imageUrl 
            : 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=1080';

        vkBridge.send('VKWebAppShowStoryBox', {
            background_type: 'image',
            url: bgImage,
            attachment: {
                text: 'open',
                type: 'url',
                url: postLink || 'https://vk.com/app54690254'
            }
        })
        .then((data) => {
            if (data && data.result) {
                console.log('История места выложена');
            }
        })
        .catch((e) => {
            console.log('Публикация истории места отменена:', e);
        });
    } else {
        alert('Функция историй доступна только в мобильном приложении ВКонтакте!');
    }
}

function updateModalButtons(placeId) {
    const modal = document.getElementById('modal-overlay');
    if (!modal) return;
    const fav = typeof isFavorite === 'function' && isFavorite(placeId);
    const vis = typeof isVisited === 'function' && isVisited(placeId);

    const favBtn = modal.querySelector('.fav-badge-btn');
    const visBtn = modal.querySelector('.visited-badge-btn');

    if (favBtn) {
        favBtn.className = `fav-badge-btn ${fav ? 'active' : ''}`;
        favBtn.innerHTML = `<i class="${fav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`;
    }
    if (visBtn) {
        visBtn.className = `visited-badge-btn ${vis ? 'active' : ''}`;
        visBtn.innerHTML = `<i class="fa-solid fa-check"></i>`;
    }
}

function closeModal() {
    const modal = document.getElementById('modal-overlay');
    if (modal) modal.classList.remove('active');
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