let map = null;
let markersClusterGroup = null;
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

    // Настройка кластеризации (группировка точек)
    markersClusterGroup = L.markerClusterGroup({
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        spiderfyOnMaxZoom: true,
        maxClusterRadius: 50,
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

// Переключение режима карты (Тёмный / Спутник)
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
function getCategoryPinConfig(category) {
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

// Отрисовка меток на карте с точной геопривязкой и кластеризацией
function renderMapMarkers(places) {
    if (!markersClusterGroup) return;
    markersClusterGroup.clearLayers();

    const addedKeys = new Set();

    places.forEach((place) => {
        // Фильтрация корректности координат (исключаем 0,0 и выходящие за пределы значения)
        if (!place || isNaN(place.lat) || isNaN(place.lng)) return;
        if (place.lat === 0 && place.lng === 0) return;
        if (Math.abs(place.lat) > 90 || Math.abs(place.lng) > 180) return;

        // Защита только от идентичных дубликатов по ID или названию с координатами
        const key = place.id !== undefined ? `id_${place.id}` : `${place.title}_${place.lat}_${place.lng}`;
        if (addedKeys.has(key)) return;
        addedKeys.add(key);

        const pinConfig = getCategoryPinConfig(place.category);

        const customIcon = L.divIcon({
            className: 'custom-pin-marker',
            html: `
                <div class="custom-pin-pulse" style="background: ${pinConfig.color};"></div>
                <div class="custom-pin-body" style="background: ${pinConfig.color};">
                    <i class="${pinConfig.icon}"></i>
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
                    
                    <button id="popup-fav-btn-${place.id}" class="fav-badge-btn ${fav ? 'active' : ''}" onclick="toggleFavorite(${place.id}, event)">
                        <i class="fa-solid fa-heart"></i>
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
            chipsHtml += `<button class="chip-btn ${activeClass}" onclick="setCategoryFilter('${cat}')">${cat}</button>`;
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

    const countries = ['Все', ...new Set(allPlacesData.map(p => p.country).filter(Boolean))];

    let availableCities = ['Все'];
    if (activeCountryFilter !== 'Все') {
        availableCities = ['Все', ...new Set(allPlacesData.filter(p => p.country === activeCountryFilter).map(p => p.city).filter(Boolean))];
    } else {
        availableCities = ['Все', ...new Set(allPlacesData.map(p => p.city).filter(Boolean))];
    }

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

    if (activeCategoryFilter !== 'Все') pool = pool.filter(p => p.category === activeCategoryFilter);
    if (activeCountryFilter !== 'Все') pool = pool.filter(p => p.country === activeCountryFilter);
    if (activeCityFilter !== 'Все') pool = pool.filter(p => p.city === activeCityFilter);

    if (pool.length === 0) {
        alert('По выбранным фильтрам нет подходящих локаций!');
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

    modal.innerHTML = `
        <div class="modal-card">
            <button class="modal-close-btn" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
            <div class="modal-img-wrapper">
                <img src="${imageUrl}" class="modal-img" alt="${place.title}">
                <span class="feed-card-badge">${place.category || 'Локация'}</span>
                
                <button class="fav-badge-btn ${fav ? 'active' : ''}" onclick="toggleFavorite(${place.id}, event); updateModalButtons(${place.id});">
                    <i class="fa-solid fa-heart"></i>
                </button>

                <button class="visited-badge-btn ${vis ? 'active' : ''}" onclick="toggleVisited(${place.id}, event); updateModalButtons(${place.id});">
                    <i class="fa-solid fa-check"></i>
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

// Публикация историй
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
                console.log('История выложена');
            }
        })
        .catch((e) => {
            console.log('Публикация отменена:', e);
        });
    } else {
        alert('Функция доступна только в приложении ВКонтакте!');
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
        favBtn.innerHTML = `<i class="fa-solid fa-heart"></i>`;
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