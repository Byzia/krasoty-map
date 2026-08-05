// Стабильный ID из текста: не зависит от порядка строк в таблице,
// меняется только если поменять название или координаты места
function stableIdFromString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

let allPlacesData = [];
let activeCategoryFilter = 'Все';
let activeCountryFilter = 'Все';
let activeCityFilter = 'Все';
let isFeedLoading = false;

const WELCOME_KEY = 'krasoty_planety_welcome_seen';

// Проверка первого захода
async function checkFirstTimeUser() {
    let seen = false;

    if (window.vkBridge) {
        try {
            const res = await vkBridge.send('VKWebAppStorageGet', { keys: [WELCOME_KEY] });
            if (res && res.keys && res.keys[0] && res.keys[0].value === 'true') {
                seen = true;
            }
        } catch (e) {
            seen = localStorage.getItem(WELCOME_KEY) === 'true';
        }
    } else {
        seen = localStorage.getItem(WELCOME_KEY) === 'true';
    }

    if (!seen) {
        const modal = document.getElementById('welcome-modal');
        if (modal) modal.classList.add('active');
    }
}

// Закрытие приветственного окна
async function closeWelcomeModal() {
    const modal = document.getElementById('welcome-modal');
    if (modal) modal.classList.remove('active');

    try {
        localStorage.setItem(WELCOME_KEY, 'true');
    } catch (e) {}

    if (window.vkBridge) {
        try {
            await vkBridge.send('VKWebAppStorageSet', { key: WELCOME_KEY, value: 'true' });
        } catch (e) {}
    }
}

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

// Общая вёрстка карточки места — используется и в ленте, и в профиле (списки избранного/посещённого),
// чтобы не дублировать один и тот же HTML в нескольких файлах
function renderPlaceCardHtml(place) {
    const imageUrl = place.image && place.image.trim() !== ''
        ? place.image
        : 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=600';

    const hasCoords = !isNaN(place.lat) && !isNaN(place.lng);

    const mapBtnHtml = hasCoords
        ? `<button class="feed-btn sec" onclick="openPlaceOnMap(${place.lat}, ${place.lng}); event.stopPropagation();">
            <i class="fa-solid fa-map-pin"></i> На карту
           </button>`
        : `<button class="feed-btn sec" style="opacity: 0.5; cursor: not-allowed;" onclick="showAppToast('Координаты этой локации скоро будут добавлены!', true); event.stopPropagation();">
            <i class="fa-solid fa-clock"></i> Скоро
           </button>`;

    const routeUrl = `https://yandex.ru/maps/?rtext=~${place.lat},${place.lng}&rtt=auto`;
    const fav = typeof isFavorite === 'function' && isFavorite(place.id);
    const vis = typeof isVisited === 'function' && isVisited(place.id);

    const locationSubtext = [place.country, place.city].filter(Boolean).join(', ');

    const newBadgeHtml = place.isNew
        ? `<span class="feed-card-badge new-badge"><i class="fa-solid fa-fire"></i> NEW</span>`
        : '';

    const comingSoonBadgeHtml = !place.hasPost
        ? `<span class="feed-card-badge" style="background: rgba(255,152,0,0.75);"><i class="fa-regular fa-clock"></i> Пост скоро</span>`
        : '';

    return `
        <div class="feed-card" onclick="openPlaceDetails(${place.id})">
            <div class="feed-card-img-wrapper">
                <img class="feed-card-img" src="${imageUrl}" alt="${place.title}">

                <div class="feed-badges-container">
                    <span class="feed-card-badge">${place.category || 'Локация'}</span>
                    ${newBadgeHtml}
                    ${comingSoonBadgeHtml}
                </div>

                <button class="fav-badge-btn ${fav ? 'active' : ''}" title="Хочу посетить" onclick="toggleFavorite(${place.id}, event)">
                    <i class="${fav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                </button>

                <button class="visited-badge-btn ${vis ? 'active' : ''}" title="Я там был" onclick="toggleVisited(${place.id}, event)">
                    <i class="${vis ? 'fa-solid' : 'fa-regular'} fa-flag"></i>
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
        html += renderPlaceCardHtml(place);
    });

    feedContainer.innerHTML = html;
}

// Загрузка данных из собственного бэкенда (Amvera)
const BACKEND_PLACES_URL = 'https://krasoty-backend-byzika.amvera.io/api/places';

async function loadFeedData(forceRefresh = false) {
    if (allPlacesData.length > 0 && !forceRefresh && !isFeedLoading) {
        renderCategoryChips();
        renderPlaceOfDayBanner();
        renderLocationSelectors();
        applyCurrentFilters();
        if (typeof renderMapMarkers === 'function') {
            renderMapMarkers(allPlacesData);
        }
        return;
    }

    if (isFeedLoading) return;
    isFeedLoading = true;

    try {
        const res = await fetch(BACKEND_PLACES_URL);
        if (!res.ok) throw new Error('Bad response: ' + res.status);
        const rows = await res.json();

        const VK_PUBLIC_URL = 'https://vk.ru/thebeautyofplan';

        const newPlaces = rows.map(row => {
            const rawLink = (row.link || '').trim();
            const title = (row.title || '').trim();
            const category = (row.category || '').trim();
            const description = (row.description || '').trim();
            const country = (row.country || '').trim() || 'Россия';
            const city = (row.city || '').trim();

            return {
                id: row.id,
                title: title || 'Без названия',
                category: category || 'Локация',
                lat: parseFloat(row.lat),
                lng: parseFloat(row.lng),
                image: row.image || '',
                description: description || 'Описание временно отсутствует.',
                link: rawLink || VK_PUBLIC_URL,
                hasPost: !!rawLink,
                country: country,
                city: city,
                fullSearchText: `${title} ${category} ${country} ${city} ${description}`.toLowerCase()
            };
        });

        // Помечаем последние 10 добавленных мест как Новинки (по возрастанию id)
        const byAddedOrder = [...newPlaces].sort((a, b) => a.id - b.id);
        const NEW_COUNT = 10;
        const totalCount = byAddedOrder.length;
        byAddedOrder.forEach((place, idx) => {
            place.isNew = idx >= Math.max(0, totalCount - NEW_COUNT);
        });

        // В ленте показываем от новых к старым
        byAddedOrder.reverse();
        allPlacesData = byAddedOrder;

        renderCategoryChips();
        renderPlaceOfDayBanner();
        renderLocationSelectors();
        applyCurrentFilters();

        if (typeof renderMapMarkers === 'function') {
            renderMapMarkers(allPlacesData);
        }
    } catch (e) {
        console.error("Ошибка загрузки мест:", e);
    } finally {
        isFeedLoading = false;
    }
}

// Рендеринг кастомных выпадающих списков Стран и Городов (Алфавитная сортировка)
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

// Баннер "Место дня" — одно место, общее для всех, меняется раз в сутки
function renderPlaceOfDayBanner() {
    if (typeof allPlacesData === 'undefined' || allPlacesData.length === 0) return;
    if (typeof getPlaceOfTheDay !== 'function') return;

    const place = getPlaceOfTheDay();
    if (!place) return;

    const feedHeader = document.querySelector('.feed-header');
    if (!feedHeader) return;

    let banner = document.getElementById('place-of-day-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'place-of-day-banner';
        feedHeader.insertBefore(banner, feedHeader.firstChild);
    }

    const claimedToday = typeof isDailyBonusClaimedToday === 'function' && isDailyBonusClaimedToday();
    const imageUrl = place.image && place.image.trim() !== ''
        ? place.image
        : 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=600';

    banner.innerHTML = `
        <div onclick="openPlaceDetails(${place.id})" style="display:flex; align-items:center; gap:12px; background: linear-gradient(135deg, rgba(255,152,0,0.15), rgba(233,30,99,0.1)); border: 1px solid rgba(255,152,0,0.3); border-radius: 14px; padding: 10px; margin: 0 16px 12px; cursor:pointer;">
            <img src="${imageUrl}" style="width:52px; height:52px; border-radius:10px; object-fit:cover; flex-shrink:0;">
            <div style="flex:1; min-width:0;">
                <div style="font-size:11px; font-weight:700; color:#ff9800; text-transform:uppercase; letter-spacing:0.3px;">
                    <i class="fa-solid fa-gift"></i> Место дня
                </div>
                <div style="font-size:13px; font-weight:600; color:#ffffff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${place.title}</div>
                <div style="font-size:11px; color:${claimedToday ? '#4caf50' : '#aaaaaa'};">
                    ${claimedToday ? '✅ Бонус сегодня уже получен' : '❤️ Лайкни — получишь +10 очков к рангу'}
                </div>
            </div>
            <i class="fa-solid fa-chevron-right" style="color:#666666; flex-shrink:0;"></i>
        </div>
    `;
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