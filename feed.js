let allPlacesData = [];

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
        const imageUrl = place.image && place.image.trim() !== '' 
            ? place.image 
            : 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=600';

        const hasCoords = !isNaN(place.lat) && !isNaN(place.lng);
        
        const mapBtnHtml = hasCoords 
            ? `<button class="feed-btn sec" onclick="openPlaceOnMap(${place.lat}, ${place.lng})">
                <i class="fa-solid fa-map-pin"></i> На карту
               </button>`
            : `<button class="feed-btn sec" style="opacity: 0.5; cursor: not-allowed;" onclick="alert('Координаты этой локации скоро будут добавлены!')">
                <i class="fa-solid fa-clock"></i> Скоро на карте
               </button>`;

        // Проверяем, находится ли текущая локация в Избранном
        const fav = typeof isFavorite === 'function' && isFavorite(place.id);
        const favIconClass = fav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
        const favBtnClass = fav ? 'fav-badge-btn active' : 'fav-badge-btn';

        html += `
            <div class="feed-card">
                <div class="feed-card-img-wrapper">
                    <img class="feed-card-img" src="${imageUrl}" alt="${place.title}">
                    <span class="feed-card-badge">${place.category || 'Локация'}</span>
                    <button class="${favBtnClass}" onclick="toggleFavorite(${place.id}, event)">
                        <i class="${favIconClass}"></i>
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

    feedContainer.innerHTML = html;
}

async function loadFeedData() {
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

        allPlacesData = [];

        rows.forEach((row, index) => {
            if (!row.c) return;
            
            const getV = (i) => {
                if (!row.c[i]) return '';
                if (row.c[i].v !== null && row.c[i].v !== undefined) return String(row.c[i].v);
                if (row.c[i].f !== null && row.c[i].f !== undefined) return String(row.c[i].f);
                return '';
            };

            const title = getV(1);
            const category = getV(2);
            const description = getV(7);

            if (!title && !description && !category) return;

            const lat = parseFloat(getV(3).replace(',', '.'));
            const lng = parseFloat(getV(4).replace(',', '.'));
            const VK_PUBLIC_URL = 'https://vk.ru/thebeautyofplan';

            allPlacesData.push({
                id: index,
                title: title || 'Без названия',
                category: category || 'Локация',
                lat: lat,
                lng: lng,
                image: getV(6),
                description: description || 'Описание временно отсутствует.',
                link: getV(8) || VK_PUBLIC_URL,
                fullSearchText: `${title} ${category} ${description} ${getV(0)}`.toLowerCase()
            });
        });

        renderFeed(allPlacesData);
    } catch (e) {
        console.error("Ошибка загрузки ленты:", e);
    }
}

function openPlaceOnMap(lat, lng) {
    if (typeof switchTab === 'function') {
        switchTab('map');
    }

    if (map) {
        setTimeout(() => {
            map.invalidateSize();
            map.setView([lat, lng], 13);
        }, 150);
    }
}

function filterFeed(query) {
    const cleanQuery = query.toLowerCase().trim();
    if (!cleanQuery) {
        renderFeed(allPlacesData);
        return;
    }

    const filtered = allPlacesData.filter(place => place.fullSearchText.includes(cleanQuery));

    filtered.sort((a, b) => {
        const aInTitle = a.title.toLowerCase().includes(cleanQuery);
        const bInTitle = b.title.toLowerCase().includes(cleanQuery);

        if (aInTitle && !bInTitle) return -1;
        if (!aInTitle && bInTitle) return 1;
        return 0;
    });

    renderFeed(filtered);
}