let allPlacesData = [];
let activeCategoryFilter = 'Все';
let activeCountryFilter = 'Все';
let activeCityFilter = 'Все';
let isFeedLoading = false;

// Закрытие выпадающих списков при клике вне их области
document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-dropdown-wrapper')) {
        document.querySelectorAll('.custom-dropdown-wrapper.open').forEach(el => el.classList.remove('open'));
    }
});

function toggleDropdownMenu(id, event) {
    if (event) event.stopPropagation();
    const target = document.getElementById(id);
    if (!target) return;
    
    const isOpen = target.classList.contains('open');
    document.querySelectorAll('.custom-dropdown-wrapper.open').forEach(el => el.classList.remove('open'));
    
    if (!isOpen) {
        target.classList.add('open');
    }
}

function renderFeed(places) {
    const feedContainer = document.getElementById('feed-list');
    if (!feedContainer) return;

    if (!places || places.length === 0) {
        feedContainer.innerHTML = `
            <div class="placeholder-screen">
                <i class="fa-solid fa-magnifying-glass"></i>
                <p>Ничего не найдено</p>
            </div>`;
        return;
    }

    let html = '';

    places.forEach((place) => {
        const imageUrl = place.image && place.image.trim() !== '' 
            ? place.image 
            : 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=600';

        const hasCoords = !isNaN(place.lat) && !isNaN(place.lng);
        
        const mapBtnHtml = hasCoords 
            ? `<button class="feed-btn sec" onclick="openPlaceOnMap(${place.lat}, ${place.lng}); event.stopPropagation();">
                <i class="fa-solid fa-map-pin"></i> На карту
               </button>`
            : `<button class="feed-btn sec" style="opacity: 0.5; cursor: not-allowed;" onclick="alert('Координаты этой локации скоро будут добавлены!'); event.stopPropagation();">
                <i class="fa-solid fa-clock"></i> Скоро
               </button>`;

        const routeUrl = `https://yandex.ru/maps/?rtext=~${place.lat},${place.lng}&rtt=auto`;
        const fav = typeof isFavorite === 'function' && isFavorite(place.id);
        const vis = typeof isVisited === 'function' && isVisited(place.id);

        const locationSubtext = [place.country, place.city].filter(Boolean).join(', ');

        const newBadgeHtml = place.isNew 
            ? `<span class="feed-card-badge new-badge"><i class="fa-solid fa-fire"></i> NEW</span>` 
            : '';

        html += `
            <div class="feed-card" onclick="openPlaceDetails(${place.id})">
                <div class="feed-card-img-wrapper">
                    <img class="feed-card-img" src="${imageUrl}" alt="${place.title}">
                    
                    <div class="feed-badges-container">
                        <span class="feed-card-badge">${place.category || 'Локация'}</span>
                        ${newBadgeHtml}
                    </div>
                    
                    <button class="fav-badge-btn ${fav ? 'active' : ''}" onclick="toggleFavorite(${place.id}, event)">
                        <i class="${fav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                    </button>

                    <button class="visited-badge-btn ${vis ? 'active' : ''}" onclick="toggleVisited(${place.id}, event)">
                        <i class="fa-solid fa-check"></i>
                    </button>
                </div>
                <div class="feed-card-body">
                    <h3 class="feed-card-title">${place.title}</h3>
                    ${locationSubtext ? `<div class="feed-card-location"><i class="fa-solid fa-location-dot"></i> ${locationSubtext}</div>` : ''}
                    <p class="feed-card-text">${place.description}</p>
                    <div class="feed-card-actions">
                        ${mapBtnHtml}
                        <a class="feed-btn sec route-btn" href="${routeUrl}" target="_blank" onclick="event.stopPropagation()">
                            <i class="fa-solid fa-route"></i> Маршрут
                        </a>
                        <a class="feed-btn prim" href="${place.link}" target="_blank" onclick="event.stopPropagation()">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> В группу
                        </a>
                    </div>
                </div>
            </div>
        `;
    });

    feedContainer.innerHTML = html;
}

// Загрузка данных из Google Sheets
async function loadFeedData(forceRefresh = false) {
    if (allPlacesData.length > 0 && !forceRefresh && !isFeedLoading) {
        renderCategoryChips();
        renderLocationSelectors();
        applyCurrentFilters();
        if (typeof renderMapMarkers === 'function') {
            renderMapMarkers(allPlacesData);
        }
        return;
    }

    if (isFeedLoading) return;
    isFeedLoading = true;

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

        const newPlaces = [];
        const seenKeys = new Set();

        rows.forEach((row, index) => {
            if (!row.c) return;
            
            const getV = (i) => {
                if (!row.c[i]) return '';
                if (row.c[i].v !== null && row.c[i].v !== undefined) return String(row.c[i].v);
                if (row.c[i].f !== null && row.c[i].f !== undefined) return String(row.c[i].f);
                return '';
            };

            const title = getV(1).trim();
            const category = getV(2).trim();
            const description = getV(7).trim();

            if (!title && !description && !category) return;

            const latStr = getV(3).replace(',', '.');
            const lngStr = getV(4).replace(',', '.');
            const lat = parseFloat(latStr);
            const lng = parseFloat(lngStr);

            const country = getV(9).trim() || 'Россия';
            const city = getV(10).trim();

            const uniqueKey = `${title.toLowerCase()}_${lat}_${lng}`;
            if (seenKeys.has(uniqueKey)) return;
            seenKeys.add(uniqueKey);

            const VK_PUBLIC_URL = 'https://vk.ru/thebeautyofplan';

            newPlaces.push({
                id: index,
                title: title || 'Без названия',
                category: category || 'Локация',
                lat: lat,
                lng: lng,
                icon: getV(5) || '<i class="fa-solid fa-location-dot"></i>',
                image: getV(6),
                description: description || 'Описание временно отсутствует.',
                link: getV(8) || VK_PUBLIC_URL,
                country: country,
                city: city,
                fullSearchText: `${title} ${category} ${country} ${city} ${description} ${getV(0)}`.toLowerCase()
            });
        });

        // Помечаем последние 10 мест как Новинки
        const NEW_COUNT = 10;
        const totalCount = newPlaces.length;
        newPlaces.forEach((place, idx) => {
            place.isNew = idx >= Math.max(0, totalCount - NEW_COUNT);
        });

        // Сортировка постов от новых к старым (последние из таблицы идут первыми)
        newPlaces.reverse();

        allPlacesData = newPlaces;

        renderCategoryChips();
        renderLocationSelectors();
        applyCurrentFilters();

        if (typeof renderMapMarkers === 'function') {
            renderMapMarkers(allPlacesData);
        }
    } catch (e) {
        console.error("Ошибка загрузки ленты:", e);
    } finally {
        isFeedLoading = false;
    }
}

// Рендеринг кастомных выпадающих списков Стран и Городов (Алфавитная сортировка от А до Я)
function renderLocationSelectors() {
    const feedHeader = document.querySelector('.feed-header');
    if (!feedHeader) return;

    let selectorsContainer = document.getElementById('location-selectors-container');
    if (!selectorsContainer) {
        selectorsContainer = document.createElement('div');
        selectorsContainer.id = 'location-selectors-container';
        selectorsContainer.className = 'selectors-row';

        const searchBox = feedHeader.querySelector('.search-box');
        if (searchBox && searchBox.nextSibling) {
            feedHeader.insertBefore(selectorsContainer, searchBox.nextSibling);
        } else {
            feedHeader.appendChild(selectorsContainer);
        }
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

    selectorsContainer.innerHTML = `
        <div class="custom-dropdown-wrapper" id="feedCountryDropdown">
            <button class="custom-dropdown-btn" onclick="toggleDropdownMenu('feedCountryDropdown', event)">
                <span class="dropdown-selected-text">${countryTitle}</span>
                <i class="fa-solid fa-chevron-down select-arrow"></i>
            </button>
            <div class="custom-dropdown-menu">
                <div class="dropdown-menu-list">
                    ${countryItems}
                </div>
            </div>
        </div>
        <div class="custom-dropdown-wrapper" id="feedCityDropdown">
            <button class="custom-dropdown-btn" onclick="toggleDropdownMenu('feedCityDropdown', event)">
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

    if (typeof renderMapLocationSelectors === 'function') {
        renderMapLocationSelectors();
    }
}

function onCountrySelectChange(val) {
    activeCountryFilter = val;
    activeCityFilter = 'Все'; 
    renderLocationSelectors();
    applyCurrentFilters();
}

function onCitySelectChange(val) {
    activeCityFilter = val;
    renderLocationSelectors();
    applyCurrentFilters();
}

// Отрисовка плашек категорий
function renderCategoryChips() {
    const rawCategories = [...new Set(allPlacesData.map(p => p.category).filter(Boolean))];
    const categories = ['Все', '🔥 Новинки', ...rawCategories];

    const feedHeader = document.querySelector('.feed-header');
    let chipsContainer = document.getElementById('category-chips-feed');

    if (!chipsContainer && feedHeader) {
        chipsContainer = document.createElement('div');
        chipsContainer.id = 'category-chips-feed';
        chipsContainer.className = 'chips-scroll-container';
        feedHeader.appendChild(chipsContainer);
    }

    if (chipsContainer) {
        let chipsHtml = '';
        categories.forEach(cat => {
            const activeClass = cat === activeCategoryFilter ? 'active' : '';
            chipsHtml += `<button class="chip-btn ${activeClass}" onclick="setCategoryFilter('${cat.replace(/'/g, "\\'")}')">${cat}</button>`;
        });
        chipsContainer.innerHTML = chipsHtml;
    }

    if (typeof renderMapCategoryChips === 'function') {
        renderMapCategoryChips(categories);
    }
}

function setCategoryFilter(cat) {
    activeCategoryFilter = cat;
    renderCategoryChips();
    applyCurrentFilters();
}

function applyCurrentFilters() {
    const searchInput = document.querySelector('.search-input');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    let filtered = allPlacesData;

    if (activeCategoryFilter === '🔥 Новинки') {
        filtered = filtered.filter(p => p.isNew);
    } else if (activeCategoryFilter !== 'Все') {
        filtered = filtered.filter(p => p.category === activeCategoryFilter);
    }

    if (activeCountryFilter !== 'Все') {
        filtered = filtered.filter(p => p.country === activeCountryFilter);
    }

    if (activeCityFilter !== 'Все') {
        filtered = filtered.filter(p => p.city === activeCityFilter);
    }

    if (query) {
        filtered = filtered.filter(p => p.fullSearchText.includes(query));
    }

    renderFeed(filtered);

    if (typeof renderMapMarkers === 'function') {
        renderMapMarkers(filtered);
    }
}

function filterFeed(query) {
    applyCurrentFilters();
}

function openPlaceOnMap(lat, lng) {
    if (typeof switchTab === 'function') {
        switchTab('map');
    }

    if (typeof map !== 'undefined' && map) {
        setTimeout(() => {
            map.invalidateSize();
            map.setView([lat, lng], 13);
        }, 150);
    }
}