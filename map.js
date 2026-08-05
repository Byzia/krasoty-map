let map = null;
let markersClusterGroup = null;
let campingClusterGroup = null;
let campingSpotsLoaded = false;
let currentMapMode = 'beauty';
let userMarker = null;
let activeMapCategory = 'Все';

// Слои карты
let darkTileLayer = null;
let satelliteTileLayer = null;
let currentTileMode = 'dark'; 

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

    darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 18,
        minZoom: 3,
        noWrap: true,
        bounds: worldBounds
    });

    satelliteTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18,
        minZoom: 3,
        noWrap: true,
        bounds: worldBounds
    });

    darkTileLayer.addTo(map);

    // Настройка кластеризации
    markersClusterGroup = L.markerClusterGroup({
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        spiderfyOnMaxZoom: true,
        maxClusterRadius: 50,
        disableClusteringAtZoom: 15
    });
    
    map.addLayer(markersClusterGroup);

    campingClusterGroup = L.markerClusterGroup({
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        spiderfyOnMaxZoom: true,
        maxClusterRadius: 50,
        disableClusteringAtZoom: 15,
        iconCreateFunction: (cluster) => L.divIcon({
            html: `<div style="background:#4caf50; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700; border:2px solid rgba(255,255,255,0.4);">${cluster.getChildCount()}</div>`,
            className: '',
            iconSize: [36, 36]
        })
    });

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

// Переключение режима карты
function toggleMapLayer() {
    if (!map || !darkTileLayer || !satelliteTileLayer) return;

    const layerBtn = document.getElementById('layerBtn');

    if (currentTileMode === 'dark') {
        map.removeLayer(darkTileLayer);
        map.addLayer(satelliteTileLayer);
        currentTileMode = 'satellite';
        if (layerBtn) {
            layerBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
            layerBtn.classList.add('active');
        }
    } else {
        map.removeLayer(satelliteTileLayer);
        map.addLayer(darkTileLayer);
        currentTileMode = 'dark';
        if (layerBtn) {
            layerBtn.innerHTML = '<i class="fa-solid fa-layer-group"></i>';
            layerBtn.classList.remove('active');
        }
    }
}

// Определение стиля и иконки пина по категории
function getCategoryPinConfig(category, isNew) {
    if (isNew) {
        return { color: '#ff3d00', icon: 'fa-solid fa-fire', isNew: true }; 
    }

    const cat = (category || '').toLowerCase();

    if (cat.includes('гор') || cat.includes('скал')) {
        return { color: '#ab47bc', icon: 'fa-solid fa-mountain' }; 
    }
    if (cat.includes('водо') || cat.includes('озер') || cat.includes('рек') || cat.includes('море')) {
        return { color: '#26c6da', icon: 'fa-solid fa-water' }; 
    }
    if (cat.includes('зам') || cat.includes('усадьб') || cat.includes('дворец') || cat.includes('архитект')) {
        return { color: '#ffa726', icon: 'fa-solid fa-building-columns' }; 
    }
    if (cat.includes('пещер') || cat.includes('каньон')) {
        return { color: '#8d6e63', icon: 'fa-solid fa-dungeon' }; 
    }
    if (cat.includes('природ') || cat.includes('парк') || cat.includes('лес')) {
        return { color: '#66bb6a', icon: 'fa-solid fa-tree' }; 
    }

    return { color: '#2787F5', icon: 'fa-solid fa-location-dot' }; 
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

// Отрисовка меток на карте
// Переключение между "Красивые места" и "Кемпинг" — полностью разные наборы пинов,
// чтобы карта не превращалась в кашу из смешанных иконок
function switchMapMode(mode) {
    if (mode === currentMapMode) return;
    currentMapMode = mode;

    document.getElementById('mode-beauty-btn').classList.toggle('active', mode === 'beauty');
    document.getElementById('mode-camping-btn').classList.toggle('active', mode === 'camping');

    const surpriseBtn = document.getElementById('surpriseBtn');
    if (surpriseBtn) surpriseBtn.style.display = mode === 'beauty' ? '' : 'none';

    // Фильтры по странам/категориям относятся только к красивым местам —
    // в режиме кемпинга они не нужны и пока нечего фильтровать
    const overlayFilters = document.getElementById('map-overlay-filters');
    if (overlayFilters) overlayFilters.style.display = mode === 'beauty' ? '' : 'none';

    if (mode === 'beauty') {
        map.removeLayer(campingClusterGroup);
        map.addLayer(markersClusterGroup);
    } else {
        map.removeLayer(markersClusterGroup);
        map.addLayer(campingClusterGroup);
        if (!campingSpotsLoaded) {
            loadCampingSpots();
        }
    }
}

async function loadCampingSpots() {
    try {
        const res = await fetchWithTimeout(`${BACKEND_URL}/api/camping-spots`);
        if (!res.ok) throw new Error('Bad response');
        const spots = await res.json();
        campingSpotsLoaded = true;
        renderCampingMarkers(spots);
    } catch (e) {
        console.error('Не удалось загрузить места кемпинга:', e);
        showAppToast('Не удалось загрузить места кемпинга', true);
    }
}

const CAMPING_CATEGORY_ICONS = {
    'Кемпинг': { icon: 'fa-solid fa-campground', color: '#4caf50' },
    'Пикник': { icon: 'fa-solid fa-utensils', color: '#ff9800' }
};

function renderCampingMarkers(spots) {
    if (!campingClusterGroup) return;
    campingClusterGroup.clearLayers();

    spots.forEach((spot) => {
        if (!spot || isNaN(spot.lat) || isNaN(spot.lng)) return;

        const conf = CAMPING_CATEGORY_ICONS[spot.category] || CAMPING_CATEGORY_ICONS['Кемпинг'];

        const customIcon = L.divIcon({
            className: 'custom-pin-marker',
            html: `
                <div class="custom-pin-body" style="background: ${conf.color};">
                    <i class="${conf.icon}"></i>
                </div>
            `,
            iconSize: [34, 34],
            iconAnchor: [17, 17]
        });

        const marker = L.marker([spot.lat, spot.lng], { icon: customIcon });
        const routeUrl = `https://yandex.ru/maps/?rtext=~${spot.lat},${spot.lng}&rtt=auto`;

        const popupContent = `
            <div class="popup-card">
                <div class="popup-body">
                    <div class="popup-title">${spot.title}</div>
                    <div style="font-size:11px; color:#4caf50; margin-bottom:4px;">${spot.category || 'Кемпинг'}</div>
                    ${spot.description ? `<div class="popup-text">${spot.description}</div>` : ''}
                    <div style="display: flex; gap: 6px;">
                        <a href="${routeUrl}" target="_blank" class="popup-link sec">
                            <i class="fa-solid fa-route"></i> Маршрут
                        </a>
                    </div>
                </div>
            </div>
        `;

        marker.bindPopup(popupContent, { maxWidth: 260, className: 'custom-popup' });
        campingClusterGroup.addLayer(marker);
    });
}

function renderMapMarkers(places) {
    if (!markersClusterGroup) return;
    markersClusterGroup.clearLayers();

    const addedKeys = new Set();

    places.forEach((place) => {
        if (!place || isNaN(place.lat) || isNaN(place.lng)) return;
        if (place.lat === 0 && place.lng === 0) return;
        if (Math.abs(place.lat) > 90 || Math.abs(place.lng) > 180) return;

        const key = place.id !== undefined ? `id_${place.id}` : `${place.title}_${place.lat}_${place.lng}`;
        if (addedKeys.has(key)) return;
        addedKeys.add(key);

        const pinConfig = getCategoryPinConfig(place.category, place.isNew);

        const newTagHtml = place.isNew ? '<span class="pin-new-tag">NEW</span>' : '';

        const customIcon = L.divIcon({
            className: 'custom-pin-marker',
            html: `
                <div class="custom-pin-pulse ${place.isNew ? 'new-pulse' : ''}" style="background: ${pinConfig.color};"></div>
                <div class="custom-pin-body ${place.isNew ? 'new-pin-body' : ''}" style="background: ${pinConfig.color};">
                    <i class="${pinConfig.icon}"></i>
                    ${newTagHtml}
                </div>
            `,
            iconSize: [38, 38],
            iconAnchor: [19, 19]
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
                    
                    <button id="popup-fav-btn-${place.id}" class="fav-badge-btn ${fav ? 'active' : ''}" title="Хочу посетить" onclick="toggleFavorite(${place.id}, event)">
                        <i class="${fav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                    </button>

                    <button id="popup-vis-btn-${place.id}" class="visited-badge-btn ${vis ? 'active' : ''}" title="Я там был" onclick="toggleVisited(${place.id}, event)">
                        <i class="${vis ? 'fa-solid' : 'fa-regular'} fa-flag"></i>
                    </button>
                </div>
                <div class="popup-body">
                    <div class="popup-title">${place.title}</div>
                    ${!place.hasPost ? `<div style="color:#ff9800; font-size:11px; margin-bottom:4px;"><i class="fa-regular fa-clock"></i> Пост скоро</div>` : ''}
                    <div class="popup-text">${(place.description || '').substring(0, 80)}...</div>
                    <div style="display: flex; gap: 6px;">
                        <a href="${routeUrl}" target="_blank" class="popup-link sec" onclick="event.stopPropagation()">
                            <i class="fa-solid fa-route"></i> Маршрут
                        </a>
                        <a href="${place.link}" target="_blank" class="popup-link" onclick="event.stopPropagation()">
                            ${place.hasPost ? 'Перейти к посту' : 'Группа ВК'}
                        </a>
                    </div>
                </div>
            </div>
        `;

        marker.bindPopup(popupContent, {
            autoPan: true,
            autoPanPaddingTopLeft: [20, 140],
            autoPanPaddingBottomRight: [20, 75],
            offset: [0, -5]
        });

        markersClusterGroup.addLayer(marker);
    });
}

// Отрисовка виджетов на карте
function renderMapCategoryChips(categories) {
    let overlayContainer = document.getElementById('map-overlay-filters');
    const tabMap = document.getElementById('tab-map');

    if (!overlayContainer && tabMap) {
        overlayContainer = document.createElement('div');
        overlayContainer.id = 'map-overlay-filters';
        overlayContainer.className = 'map-overlay-panel';
        tabMap.appendChild(overlayContainer);
    }

    if (overlayContainer) {
        let chipsContainer = document.getElementById('category-chips-map');
        if (!chipsContainer) {
            chipsContainer = document.createElement('div');
            chipsContainer.id = 'category-chips-map';
            chipsContainer.className = 'chips-scroll-container';
            overlayContainer.appendChild(chipsContainer);
        }

        let chipsHtml = '';
        categories.forEach(cat => {
            const activeClass = cat === activeCategoryFilter ? 'active' : '';
            chipsHtml += `<button class="chip-btn ${activeClass}" onclick="setCategoryFilter('${cat.replace(/'/g, "\\'")}')">${cat}</button>`;
        });
        chipsContainer.innerHTML = chipsHtml;
    }
}

function renderMapLocationSelectors() {
    let overlayContainer = document.getElementById('map-overlay-filters');
    if (!overlayContainer) return;

    let mapSelectors = document.getElementById('map-selectors-row');
    if (!mapSelectors) {
        mapSelectors = document.createElement('div');
        mapSelectors.id = 'map-selectors-row';
        mapSelectors.className = 'selectors-row';
        overlayContainer.prepend(mapSelectors);
    }

    const rawCountries = [...new Set(allPlacesData.map(p => p.country).filter(Boolean))];
    rawCountries.sort((a, b) => a.localeCompare(b, 'ru'));
    const countries = ['Все', ...rawCountries];

    let rawCities = [];
    if (activeCountryFilter !== 'Все') {
        rawCities = [...new Set(allPlacesData.filter(p => p.country === activeCountryFilter).map(p => p.city).filter(Boolean))];
    } else {
        rawCities = [...new Set(allPlacesData.map(p => p.city).filter(Boolean))];
    }
    rawCities.sort((a, b) => a.localeCompare(b, 'ru'));
    const availableCities = ['Все', ...rawCities];

    const countryItems = countries.map(c => `
        <div class="dropdown-item ${c === activeCountryFilter ? 'active' : ''}" onclick="onCountrySelectChange('${c.replace(/'/g, "\\'")}')">
            <span>${c === 'Все' ? '🌐 Все страны' : c}</span>
            ${c === activeCountryFilter ? '<i class="fa-solid fa-check"></i>' : ''}
        </div>
    `).join('');

    const cityItems = availableCities.map(c => `
        <div class="dropdown-item ${c === activeCityFilter ? 'active' : ''}" onclick="onCitySelectChange('${c.replace(/'/g, "\\'")}')">
            <span>${c === 'Все' ? '🏙 Все города/регионы' : c}</span>
            ${c === activeCityFilter ? '<i class="fa-solid fa-check"></i>' : ''}
        </div>
    `).join('');

    const countryTitle = activeCountryFilter === 'Все' ? '🌐 Все страны' : activeCountryFilter;
    const cityTitle = activeCityFilter === 'Все' ? '🏙 Все города/регионы' : activeCityFilter;

    mapSelectors.innerHTML = `
        <div class="custom-dropdown-wrapper" id="mapCountryDropdown">
            <button class="custom-dropdown-btn" onclick="toggleDropdownMenu('mapCountryDropdown', event)">
                <span class="dropdown-selected-text">${countryTitle}</span>
                <i class="fa-solid fa-chevron-down select-arrow"></i>
            </button>
            <div class="custom-dropdown-menu">
                <div class="dropdown-menu-list">
                    ${countryItems}
                </div>
            </div>
        </div>
        <div class="custom-dropdown-wrapper" id="mapCityDropdown">
            <button class="custom-dropdown-btn" onclick="toggleDropdownMenu('mapCityDropdown', event)">
                <span class="dropdown-selected-text">${cityTitle}</span>
                <i class="fa-solid fa-chevron-down select-arrow"></i>
            </button>
            <div class="custom-dropdown-menu">
                <div class="dropdown-menu-list">
                    ${cityItems}
                </div>
            </div>
        </div>
    `;
}

// Кнопка «Удиви меня»
function surpriseMe() {
    if (typeof allPlacesData === 'undefined' || !allPlacesData || allPlacesData.length === 0) return;

    let pool = allPlacesData;

    if (activeCategoryFilter === '🔥 Новинки') {
        pool = pool.filter(p => p.isNew);
    } else if (activeCategoryFilter !== 'Все') {
        pool = pool.filter(p => p.category === activeCategoryFilter);
    }

    if (activeCountryFilter !== 'Все') pool = pool.filter(p => p.country === activeCountryFilter);
    if (activeCityFilter !== 'Все') pool = pool.filter(p => p.city === activeCityFilter);

    if (pool.length === 0) {
        showAppToast('По выбранным фильтрам нет подходящих локаций!', true);
        return;
    }

    const randomPlace = pool[Math.floor(Math.random() * pool.length)];

    if (map && !isNaN(randomPlace.lat) && !isNaN(randomPlace.lng)) {
        if (typeof switchTab === 'function') switchTab('map');

        map.flyTo([randomPlace.lat, randomPlace.lng], 12, { animate: true, duration: 1.5 });

        setTimeout(() => {
            openPlaceDetails(randomPlace.id);
        }, 1600);
    }
}

// Открытие модального окна
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

    const locationText = [place.country, place.city].filter(Boolean).join(', ');

    const newBadgeHtml = place.isNew 
        ? `<span class="feed-card-badge new-badge"><i class="fa-solid fa-fire"></i> NEW</span>` 
        : '';

    const comingSoonBadgeHtml = !place.hasPost
        ? `<span class="feed-card-badge" style="background: rgba(255,152,0,0.75);"><i class="fa-regular fa-clock"></i> Пост скоро</span>`
        : '';

    modal.innerHTML = `
        <div class="modal-card">
            <button class="modal-close-btn" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
            <div class="modal-img-wrapper">
                <img src="${imageUrl}" class="modal-img" alt="${place.title}">
                
                <div class="feed-badges-container">
                    <span class="feed-card-badge">${place.category || 'Локация'}</span>
                    ${newBadgeHtml}
                    ${comingSoonBadgeHtml}
                </div>
                
                <button class="fav-badge-btn ${fav ? 'active' : ''}" title="Хочу посетить" onclick="toggleFavorite(${place.id}, event); updateModalButtons(${place.id});">
                    <i class="${fav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                </button>

                <button class="visited-badge-btn ${vis ? 'active' : ''}" title="Я там был" onclick="toggleVisited(${place.id}, event); updateModalButtons(${place.id});">
                    <i class="${vis ? 'fa-solid' : 'fa-regular'} fa-flag"></i>
                </button>
            </div>
            <div class="modal-body">
                <h2 class="modal-title">${place.title}</h2>
                ${locationText ? `<div class="feed-card-location" style="margin-bottom: 12px;"><i class="fa-solid fa-location-dot"></i> ${locationText}</div>` : ''}
                <p class="modal-text">${place.description}</p>
                
                <div class="modal-actions">
                    <button onclick="sharePlaceToStory('${imageUrl}', '${place.link}')" class="feed-btn sec" style="background: rgba(233, 30, 99, 0.15) !important; color: #ff80ab !important;">
                        <i class="fa-solid fa-circle-play"></i> Поделиться в Истории VK
                    </button>
                    <button onclick="sharePlaceToFriend('${place.link}')" class="feed-btn sec" style="background: rgba(76, 175, 80, 0.15) !important; color: #4caf50 !important;">
                        <i class="fa-solid fa-paper-plane"></i> Отправить другу
                    </button>
                    <a href="${routeUrl}" target="_blank" class="feed-btn sec">
                        <i class="fa-solid fa-route"></i> Построить маршрут
                    </a>
                    ${place.hasPost ? `
                    <a href="${place.link}" target="_blank" class="feed-btn prim" onclick="if(typeof trackAnalyticsEvent==='function') trackAnalyticsEvent('group_link_click', ${place.id});">
                        <i class="fa-solid fa-comments"></i> Читать и обсудить в ВК
                    </a>
                    ` : `
                    <button class="feed-btn prim" style="opacity: 0.6;" onclick="showAppToast('Пост про это место скоро выйдет в группе — пока можно посмотреть саму группу', false); window.open('${place.link}', '_blank'); if(typeof trackAnalyticsEvent==='function') trackAnalyticsEvent('group_link_click', ${place.id});">
                        <i class="fa-regular fa-clock"></i> Пост скоро — пока группа
                    </button>
                    `}
                </div>

                <div id="place-reviews-section" style="margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08);"></div>
            </div>
        </div>
    `;

    modal.classList.add('active');
    if (typeof renderReviewsSection === 'function') renderReviewsSection(place.id);
}

// Публикация историй
function sharePlaceToStory(imageUrl, postLink) {
    const bgImage = (imageUrl && imageUrl.trim() !== '')
        ? imageUrl
        : 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=1080';

    publishStoryToVK({
        imageUrl: bgImage,
        targetLink: postLink || APP_SHARE_LINK
    });
}

// Прямая отправка конкретного места другу/в чат/на стену (в отличие от Историй —
// это открывает нативное окно ВК "куда отправить", с постом об этом месте)
function sharePlaceToFriend(postLink) {
    const link = postLink || APP_SHARE_LINK;

    if (!window.vkBridge) {
        navigator.clipboard.writeText(link);
        showAppToast('Ссылка на место скопирована в буфер обмена!', false);
        return;
    }

    vkBridge.send('VKWebAppShare', { link: link })
        .catch((e) => console.log('Шеринг отменён:', e));
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
        visBtn.innerHTML = `<i class="${vis ? 'fa-solid' : 'fa-regular'} fa-flag"></i>`;
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
        className: 'custom-pin-marker',
        html: `
            <div class="custom-pin-pulse" style="background: #e91e63;"></div>
            <div class="custom-pin-body" style="background: #e91e63;">
                <i class="fa-solid fa-user-large"></i>
            </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19]
    });
    userMarker = L.marker(latlng, { icon: myIcon }).addTo(map);

    userMarker.bindPopup("<b>Вы здесь!</b>", {
        autoPan: true,
        autoPanPaddingTopLeft: [20, 140],
        autoPanPaddingBottomRight: [20, 75]
    }).openPopup();
}