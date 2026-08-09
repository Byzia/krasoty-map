const VK_FAVS_KEY = 'krasoty_planety_favs';
const VK_VISITED_KEY = 'krasoty_planety_visited';
// Отдельные ключи для мест "для прогулок" — id там из другой таблицы (camping_spots),
// поэтому нельзя хранить их в тех же списках, что и обычные красивые места
const VK_CAMPING_FAVS_KEY = 'krasoty_planety_camping_favs';
const VK_CAMPING_VISITED_KEY = 'krasoty_planety_camping_visited';
const APP_SHARE_LINK = 'https://vk.com/app54690254';
const DAILY_BONUS_KEY = 'krasoty_planety_daily_bonus';
const DAILY_BONUS_AMOUNT = 10;

// Адрес собственного бэкенда (Amvera) — используется для мест, лидеров и рефералов
const BACKEND_URL = 'https://krasoty-backend-byzika.amvera.io';

let favoritesList = [];
let visitedList = [];
let campingFavoritesList = [];
let campingVisitedList = [];
let vkUserData = null;
let currentProfileSubTab = 'favs';
let dailyBonusState = { lastClaimedDate: null, totalBonusPoints: 0 };

// Место дня — общее для всех, детерминированно выбирается по дате и id мест,
// так что у всех пользователей в один день будет одно и то же место
function getPlaceOfTheDay() {
    if (typeof allPlacesData === 'undefined' || allPlacesData.length === 0) return null;
    const sorted = [...allPlacesData].sort((a, b) => a.id - b.id);
    const daysSinceEpoch = Math.floor(Date.now() / 86400000);
    const index = daysSinceEpoch % sorted.length;
    return sorted[index];
}

function isDailyBonusClaimedToday() {
    const todayStr = new Date().toISOString().slice(0, 10);
    return dailyBonusState.lastClaimedDate === todayStr;
}

// Пытаемся начислить бонус за место дня — вызывается при лайке любого места
async function maybeClaimDailyBonus(placeId) {
    const place = getPlaceOfTheDay();
    if (!place || place.id !== placeId) return;
    if (isDailyBonusClaimedToday()) return;

    const todayStr = new Date().toISOString().slice(0, 10);
    dailyBonusState.lastClaimedDate = todayStr;
    dailyBonusState.totalBonusPoints = (dailyBonusState.totalBonusPoints || 0) + DAILY_BONUS_AMOUNT;

    await saveDailyBonusToVK();
    if (typeof renderPlaceOfDayBanner === 'function') renderPlaceOfDayBanner();
    if (typeof submitScoreToLeaderboard === 'function') submitScoreToLeaderboard();
}

async function loadDailyBonusFromVK() {
    if (window.vkBridge) {
        try {
            const data = await vkBridge.send('VKWebAppStorageGet', { keys: [DAILY_BONUS_KEY] });
            if (data && data.keys && data.keys[0] && data.keys[0].value) {
                dailyBonusState = { ...dailyBonusState, ...JSON.parse(data.keys[0].value) };
                return;
            }
        } catch (e) {}
    }
    try {
        const local = localStorage.getItem(DAILY_BONUS_KEY);
        if (local) dailyBonusState = { ...dailyBonusState, ...JSON.parse(local) };
    } catch (e) {}
}

async function saveDailyBonusToVK() {
    const json = JSON.stringify(dailyBonusState);
    try { localStorage.setItem(DAILY_BONUS_KEY, json); } catch (e) {}
    if (window.vkBridge) {
        try { await vkBridge.send('VKWebAppStorageSet', { key: DAILY_BONUS_KEY, value: json }); } catch (e) {}
    }
}

// Общий расчёт очков ранга — вынесен в одно место (раньше формула была
// продублирована в renderProfileScreen и generateStoryCanvasImage)
function calculateRankScore() {
    const visitedPlaces = (typeof allPlacesData !== 'undefined') ? allPlacesData.filter(p => isVisited(p.id)) : [];
    const favPlaces = (typeof allPlacesData !== 'undefined') ? allPlacesData.filter(p => isFavorite(p.id)) : [];
    return visitedPlaces.length * 2 + favPlaces.length + (dailyBonusState.totalBonusPoints || 0);
}

// Сохранение флага "разрешил уведомления" отдельным запросом,
// чтобы не затирать остальные поля таблицы лидеров при каждой игре
async function setNotificationsAllowedOnServer(allowed) {
    if (!vkUserData || !vkUserData.id) return;

    const payload = {
        vk_user_id: vkUserData.id,
        name: `${vkUserData.first_name || ''} ${vkUserData.last_name || ''}`.trim() || 'Путешественник',
        avatar: vkUserData.photo_100 || '',
        notifications_allowed: allowed
    };

    try {
        await fetchWithTimeout(`${BACKEND_URL}/api/leaderboard/notifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.warn('Не удалось сохранить статус уведомлений:', e);
    }
}

// Отправка своего результата в общую таблицу лидеров (Supabase).
// Вызывается после завершения любой игры. Молча ничего не делает, если
// нет данных пользователя VK или нет сети — таблица лидеров необязательна
// для работы остального приложения.
// Своё лёгкое уведомление вместо системного alert() — у alert() в браузере/вебвью
// (в том числе внутри самого приложения ВК) всегда виден адрес сайта в шапке
// окна, это некрасиво и не убирается кодом. Используется во всём приложении.
function showAppToast(message, isError) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'app-toast';
        toast.style.cssText = `
            position: fixed; left: 50%; bottom: 90px; transform: translateX(-50%);
            color: #ffffff; padding: 12px 18px; border-radius: 12px; font-size: 13px;
            z-index: 9999; max-width: 88%; text-align: center;
            box-shadow: 0 4px 16px rgba(0,0,0,0.4); transition: opacity 0.25s ease; opacity: 0;
        `;
        document.body.appendChild(toast);
    }
    toast.style.background = isError ? '#c62828' : '#2e7d32';
    toast.textContent = message;
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 3200);
}

// Обёртка над fetch с ограничением по времени — чтобы плохое соединение
// (особенно на Android) не могло подвесить экран навсегда
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// Простая аналитика — заходы и клики "в группу", видно админу в панели
function trackAnalyticsEvent(eventType, placeId) {
    if (!vkUserData || !vkUserData.id) return;
    fetchWithTimeout(`${BACKEND_URL}/api/analytics/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: eventType, vk_user_id: vkUserData.id, place_id: placeId || null })
    }, 8000).catch(() => {}); // аналитика необязательна — тихо игнорируем неудачу
}


async function submitScoreToLeaderboard() {
    if (!vkUserData || !vkUserData.id) return;
    if (!userGameStats) return;

    const pStats = userGameStats.puzzle || { solved: 0 };
    const qStats = userGameStats.quiz || { bestScore: 0 };
    const achievementsCount = userGameStats.achievements
        ? Object.values(userGameStats.achievements).filter(Boolean).length
        : 0;

    const dailyBonus = (typeof dailyBonusState !== 'undefined' && dailyBonusState.totalBonusPoints) || 0;
    const totalScore = (qStats.discoveryScore || 0) + (pStats.solved || 0) * 20 + achievementsCount * 50 + dailyBonus;
    const streak = userGameStats.streak || { current: 0, lastPlayDate: null };

    const payload = {
        vk_user_id: vkUserData.id,
        name: `${vkUserData.first_name || ''} ${vkUserData.last_name || ''}`.trim() || 'Путешественник',
        avatar: vkUserData.photo_100 || '',
        score: totalScore,
        achievements_count: achievementsCount,
        current_streak: streak.current || 0,
        last_play_date: streak.lastPlayDate || null
    };

    try {
        await fetchWithTimeout(`${BACKEND_URL}/api/leaderboard`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.warn('Не удалось обновить таблицу лидеров:', e);
    }
}

// Получение топа таблицы лидеров
async function fetchLeaderboard(limit = 20) {
    try {
        const res = await fetchWithTimeout(`${BACKEND_URL}/api/leaderboard?limit=${limit}`);
        if (!res.ok) throw new Error('Bad response: ' + res.status);
        return await res.json();
    } catch (e) {
        console.warn('Не удалось загрузить таблицу лидеров:', e);
        return null;
    }
}

// Универсальная публикация Истории ВК: сначала пробует картинку из canvas (blob),
// если не получилось — пробует ту же картинку по обычной ссылке. Используется
// профилем, играми и картой, чтобы не дублировать один и тот же код.
function publishStoryToVK({ blobDataUrl, imageUrl, targetLink }) {
    if (!window.vkBridge) {
        showAppToast('Функция историй доступна только внутри мобильного приложения ВКонтакте!', true);
        return;
    }

    const attachment = { text: 'open', type: 'url', url: targetLink || APP_SHARE_LINK };

    const send = (payload) => vkBridge.send('VKWebAppShowStoryBox', { background_type: 'image', ...payload, attachment })
        .then((data) => {
            if (data && data.result) console.log('История опубликована');
        });

    if (blobDataUrl) {
        send({ blob: blobDataUrl }).catch(() => {
            send({ url: imageUrl }).catch((e) => console.log('Публикация истории отменена:', e));
        });
    } else {
        send({ url: imageUrl }).catch((e) => console.log('Публикация истории отменена:', e));
    }
}

// 1. Загрузка данных пользователя VK
async function loadVkUserData() {
    if (window.vkBridge) {
        try {
            const user = await vkBridge.send('VKWebAppGetUserInfo');
            if (user && user.first_name) {
                vkUserData = user;
                registerReferralIfPresent();
                trackAnalyticsEvent('app_open');
            }
        } catch (e) {
            console.warn('Профиль VK недоступен:', e);
        }
    }
    await loadDailyBonusFromVK();
}

// Реферальная ссылка — приглашение друга: id пригласившего кладём в хэш ссылки
// (#ref123456), потому что обычный ?ref=123 при запуске мини-приложения ВК
// теряется, а хэш — доходит и виден в window.location.hash при старте.
function inviteFriendWithReferral() {
    if (!vkUserData || !vkUserData.id) {
        showAppToast('Не удалось определить пользователя ВК. Попробуй чуть позже.', true);
        return;
    }
    const referralLink = `${APP_SHARE_LINK}#ref${vkUserData.id}`;

    if (!window.vkBridge) {
        navigator.clipboard.writeText(referralLink);
        showAppToast('Ссылка-приглашение скопирована в буфер обмена!', false);
        return;
    }

    vkBridge.send('VKWebAppShare', { link: referralLink })
        .catch((e) => console.log('Шеринг отменён:', e));
}

// Регистрация перехода по реферальной ссылке — один раз при запуске
async function registerReferralIfPresent() {
    if (!vkUserData || !vkUserData.id) return;

    const hash = window.location.hash || '';
    const match = hash.match(/ref(\d+)/);
    if (!match) return;

    const referrerId = parseInt(match[1], 10);
    if (!referrerId || referrerId === vkUserData.id) return;

    try {
        await fetchWithTimeout(`${BACKEND_URL}/api/referrals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ referred_user_id: vkUserData.id, referrer_user_id: referrerId })
        });
        // Если такой referred_user_id уже есть в таблице — сервер просто не изменит
        // ничего (первичный ключ), это и нужно: засчитываем переход только один раз.
    } catch (e) {
        console.warn('Не удалось зарегистрировать переход по приглашению:', e);
    }
}

// Сколько друзей я привёл (для отображения в профиле)
async function fetchMyReferralsCount() {
    if (!vkUserData || !vkUserData.id) return 0;
    try {
        const res = await fetchWithTimeout(`${BACKEND_URL}/api/referrals/count?referrer_user_id=${vkUserData.id}`);
        if (!res.ok) return 0;
        const data = await res.json();
        return data.count || 0;
    } catch (e) {
        return 0;
    }
}

// 2. Загрузка списков из VK Storage
async function loadFavoritesFromVK() {
    const keys = [VK_FAVS_KEY, VK_VISITED_KEY, VK_CAMPING_FAVS_KEY, VK_CAMPING_VISITED_KEY];
    if (window.vkBridge) {
        try {
            const data = await vkBridge.send('VKWebAppStorageGet', { keys });
            if (data && data.keys) {
                const favData = data.keys.find(k => k.key === VK_FAVS_KEY);
                const visData = data.keys.find(k => k.key === VK_VISITED_KEY);
                const campFavData = data.keys.find(k => k.key === VK_CAMPING_FAVS_KEY);
                const campVisData = data.keys.find(k => k.key === VK_CAMPING_VISITED_KEY);

                favoritesList = (favData && favData.value) ? JSON.parse(favData.value) : [];
                visitedList = (visData && visData.value) ? JSON.parse(visData.value) : [];
                campingFavoritesList = (campFavData && campFavData.value) ? JSON.parse(campFavData.value) : [];
                campingVisitedList = (campVisData && campVisData.value) ? JSON.parse(campVisData.value) : [];
            }
        } catch (e) {
            fallbackLoadLocalStorage();
        }
    } else {
        fallbackLoadLocalStorage();
    }
}

function fallbackLoadLocalStorage() {
    try {
        favoritesList = JSON.parse(localStorage.getItem(VK_FAVS_KEY) || '[]');
        visitedList = JSON.parse(localStorage.getItem(VK_VISITED_KEY) || '[]');
        campingFavoritesList = JSON.parse(localStorage.getItem(VK_CAMPING_FAVS_KEY) || '[]');
        campingVisitedList = JSON.parse(localStorage.getItem(VK_CAMPING_VISITED_KEY) || '[]');
    } catch (e) {
        favoritesList = [];
        visitedList = [];
        campingFavoritesList = [];
        campingVisitedList = [];
    }
}

// 3. Сохранение списков в VK Storage
async function saveUserDataToVK() {
    const favsJson = JSON.stringify(favoritesList);
    const visJson = JSON.stringify(visitedList);

    try {
        localStorage.setItem(VK_FAVS_KEY, favsJson);
        localStorage.setItem(VK_VISITED_KEY, visJson);
    } catch (e) {}

    if (window.vkBridge) {
        try {
            await vkBridge.send('VKWebAppStorageSet', { key: VK_FAVS_KEY, value: favsJson });
            await vkBridge.send('VKWebAppStorageSet', { key: VK_VISITED_KEY, value: visJson });
        } catch (e) {}
    }
}

// То же самое, но для отдельных списков мест "для прогулок"
async function saveCampingUserDataToVK() {
    const favsJson = JSON.stringify(campingFavoritesList);
    const visJson = JSON.stringify(campingVisitedList);

    try {
        localStorage.setItem(VK_CAMPING_FAVS_KEY, favsJson);
        localStorage.setItem(VK_CAMPING_VISITED_KEY, visJson);
    } catch (e) {}

    if (window.vkBridge) {
        try {
            await vkBridge.send('VKWebAppStorageSet', { key: VK_CAMPING_FAVS_KEY, value: favsJson });
            await vkBridge.send('VKWebAppStorageSet', { key: VK_CAMPING_VISITED_KEY, value: visJson });
        } catch (e) {}
    }
}

function isFavorite(placeId) { return favoritesList.includes(placeId); }
function isVisited(placeId) { return visitedList.includes(placeId); }
function isCampingFavorite(spotId) { return campingFavoritesList.includes(spotId); }
function isCampingVisited(spotId) { return campingVisitedList.includes(spotId); }

// 4. Переключение Сердечка
async function toggleFavorite(placeId, event) {
    if (event) event.stopPropagation();

    const idx = favoritesList.indexOf(placeId);
    let becameFavorite = false;
    if (idx === -1) {
        favoritesList.push(placeId);
        becameFavorite = true;
    } else {
        favoritesList.splice(idx, 1);
    }

    await saveUserDataToVK();
    updateAllUI(placeId);

    if (becameFavorite) {
        maybeClaimDailyBonus(placeId);
    }
}

// 5. Переключение Флажка (Посещено)
async function toggleVisited(placeId, event) {
    if (event) event.stopPropagation();

    const idx = visitedList.indexOf(placeId);
    if (idx === -1) {
        visitedList.push(placeId);
    } else {
        visitedList.splice(idx, 1);
    }

    await saveUserDataToVK();
    updateAllUI(placeId);
}

// Синхронизация интерфейса
function updateAllUI(placeId) {
    const mapFavBtn = document.getElementById(`popup-fav-btn-${placeId}`);
    const mapVisBtn = document.getElementById(`popup-vis-btn-${placeId}`);
    
    if (mapFavBtn) {
        mapFavBtn.className = `fav-badge-btn ${isFavorite(placeId) ? 'active' : ''}`;
        mapFavBtn.innerHTML = `<i class="${isFavorite(placeId) ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`;
    }
    if (mapVisBtn) {
        mapVisBtn.className = `visited-badge-btn ${isVisited(placeId) ? 'active' : ''}`;
        mapVisBtn.innerHTML = `<i class="${isVisited(placeId) ? 'fa-solid' : 'fa-regular'} fa-flag"></i>`;
    }

    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id === 'tab-profile') {
        renderProfileScreen();
    } else if (activeTab && activeTab.id === 'tab-feed') {
        if (typeof renderFeed === 'function' && typeof allPlacesData !== 'undefined') {
            renderFeed(allPlacesData);
        }
    }
}

// 4б/5б. Лайк и "Я тут был" для мест "для прогулок" — своя пара функций,
// т.к. id пересекаются с обычными местами, но означают совсем другое
async function toggleCampingFavorite(spotId, event) {
    if (event) event.stopPropagation();

    const idx = campingFavoritesList.indexOf(spotId);
    if (idx === -1) {
        campingFavoritesList.push(spotId);
    } else {
        campingFavoritesList.splice(idx, 1);
    }

    await saveCampingUserDataToVK();
    updateCampingUI(spotId);
}

async function toggleCampingVisited(spotId, event) {
    if (event) event.stopPropagation();

    const idx = campingVisitedList.indexOf(spotId);
    if (idx === -1) {
        campingVisitedList.push(spotId);
    } else {
        campingVisitedList.splice(idx, 1);
    }

    await saveCampingUserDataToVK();
    updateCampingUI(spotId);
}

// Синхронизация интерфейса для мест "для прогулок" (попап на карте + модалка)
function updateCampingUI(spotId) {
    const mapFavBtn = document.getElementById(`popup-fav-btn-c-${spotId}`);
    const mapVisBtn = document.getElementById(`popup-vis-btn-c-${spotId}`);

    if (mapFavBtn) {
        mapFavBtn.className = `fav-badge-btn ${isCampingFavorite(spotId) ? 'active' : ''}`;
        mapFavBtn.innerHTML = `<i class="${isCampingFavorite(spotId) ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`;
    }
    if (mapVisBtn) {
        mapVisBtn.className = `visited-badge-btn ${isCampingVisited(spotId) ? 'active' : ''}`;
        mapVisBtn.innerHTML = `<i class="${isCampingVisited(spotId) ? 'fa-solid' : 'fa-regular'} fa-flag"></i>`;
    }

    const modal = document.getElementById('modal-overlay');
    if (modal && modal.classList.contains('active')) {
        const modalFavBtn = modal.querySelector('.fav-badge-btn');
        const modalVisBtn = modal.querySelector('.visited-badge-btn');
        if (modalFavBtn) {
            modalFavBtn.className = `fav-badge-btn ${isCampingFavorite(spotId) ? 'active' : ''}`;
            modalFavBtn.innerHTML = `<i class="${isCampingFavorite(spotId) ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`;
        }
        if (modalVisBtn) {
            modalVisBtn.className = `visited-badge-btn ${isCampingVisited(spotId) ? 'active' : ''}`;
            modalVisBtn.innerHTML = `<i class="${isCampingVisited(spotId) ? 'fa-solid' : 'fa-regular'} fa-flag"></i>`;
        }
    }

    // Список в профиле нужно перерисовать полностью — карточка при снятии
    // лайка/флажка должна пропасть из текущей вкладки "Хочу посетить"/"Я там был"
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id === 'tab-profile') {
        renderProfileScreen();
    }
}

// Ранг путешественника
function getTravelerRank(score) {
    if (score === 0) return { title: 'Новичок-турист 🎒', color: '#888888' };
    if (score <= 3) return { title: 'Любитель приключений 🌲', color: '#4CAF50' };
    if (score <= 8) return { title: 'Опытный гид 🧭', color: '#2787F5' };
    if (score <= 15) return { title: 'Исследователь материков 🌍', color: '#9C27B0' };
    return { title: 'Легенда путешествий 👑', color: '#FFD700' };
}

// Отрисовка Экрана Профиля
function renderProfileScreen() {
    const container = document.getElementById('profile-container');
    if (!container) return;

    const avatar = vkUserData?.photo_200 || 'https://vk.com/images/camera_200.png';
    const name = vkUserData ? `${vkUserData.first_name} ${vkUserData.last_name}` : 'Путешественник';

    const totalPlaces = (typeof allPlacesData !== 'undefined') ? allPlacesData.length : 0;
    const favPlaces = (typeof allPlacesData !== 'undefined') ? allPlacesData.filter(p => isFavorite(p.id)) : [];
    const visitedPlaces = (typeof allPlacesData !== 'undefined') ? allPlacesData.filter(p => isVisited(p.id)) : [];

    // Места "для прогулок" — отдельные списки избранного/посещённого,
    // но в профиле показываем их вместе с обычными красивыми местами
    const favCampingSpots = (typeof allCampingSpotsData !== 'undefined') ? allCampingSpotsData.filter(s => isCampingFavorite(s.id)) : [];
    const visitedCampingSpots = (typeof allCampingSpotsData !== 'undefined') ? allCampingSpotsData.filter(s => isCampingVisited(s.id)) : [];

    const totalFavCount = favPlaces.length + favCampingSpots.length;
    const totalVisitedCount = visitedPlaces.length + visitedCampingSpots.length;

    const totalScore = calculateRankScore();
    const rank = getTravelerRank(totalScore);

    const progressPercent = totalPlaces > 0 ? Math.round((visitedPlaces.length / totalPlaces) * 100) : 0;

    const activePlacesList = currentProfileSubTab === 'favs' ? favPlaces : visitedPlaces;
    const activeCampingList = currentProfileSubTab === 'favs' ? favCampingSpots : visitedCampingSpots;

    let listHtml = '';
    if (activePlacesList.length === 0 && activeCampingList.length === 0) {
        const emptyMsg = currentProfileSubTab === 'favs' 
            ? 'Список "Хочу посетить" пока пуст.<br>Отмечайте места сердечком 🤍'
            : 'Вы пока не отметили ни одного посещённого места.<br>Нажимайте флажок 🚩 на карточках!';
        
        listHtml = `
            <div class="empty-fav-box">
                <i class="fa-solid ${currentProfileSubTab === 'favs' ? 'fa-heart-crack' : 'fa-flag'}"></i>
                <p>${emptyMsg}</p>
            </div>`;
    } else {
        activePlacesList.forEach((place) => {
            listHtml += renderPlaceCardHtml(place);
        });
        activeCampingList.forEach((spot) => {
            listHtml += (typeof renderCampingCardHtml === 'function') ? renderCampingCardHtml(spot) : '';
        });
    }

    container.innerHTML = `
        <div class="profile-header-card">
            <img class="profile-avatar" src="${avatar}" alt="${name}">
            <div class="profile-info">
                <h2 class="profile-name">${name}</h2>
                <span class="profile-status" style="color: ${rank.color}; background: rgba(255,255,255,0.05);">${rank.title}</span>
            </div>
        </div>

        <div class="progress-card">
            <div class="progress-header">
                <span>Исследовано планеты</span>
                <span class="progress-val">${progressPercent}%</span>
            </div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
            </div>
            <div class="progress-subtext">Посещено ${visitedPlaces.length} из ${totalPlaces} локаций</div>
        </div>

        <div class="profile-stats-row">
            <div class="stat-box">
                <span class="stat-number">${totalFavCount}</span>
                <span class="stat-label">❤️ Хочу посетить</span>
            </div>
            <div class="stat-box">
                <span class="stat-number">${totalVisitedCount}</span>
                <span class="stat-label">🚩 Я там был</span>
            </div>
        </div>

        <div class="profile-actions-menu">
            <button onclick="inviteFriendWithReferral()" class="menu-item-btn">
                <div class="menu-item-left">
                    <i class="fa-solid fa-user-plus" style="color: #ff9800;"></i>
                    <span id="referral-count-text">Пригласить друга</span>
                </div>
                <i class="fa-solid fa-chevron-right arrow"></i>
            </button>
            <button onclick="shareProfileToStory()" class="menu-item-btn">
                <div class="menu-item-left">
                    <i class="fa-solid fa-circle-play" style="color: #E91E63;"></i>
                    <span>Поделиться рангом в Историю</span>
                </div>
                <i class="fa-solid fa-chevron-right arrow"></i>
            </button>
            <a href="https://vk.ru/thebeautyofplan" target="_blank" class="menu-item-btn">
                <div class="menu-item-left">
                    <i class="fa-brands fa-vk" style="color: #2787F5;"></i>
                    <span>Наша группа ВКонтакте</span>
                </div>
                <i class="fa-solid fa-chevron-right arrow"></i>
            </a>
            <button onclick="shareApp()" class="menu-item-btn">
                <div class="menu-item-left">
                    <i class="fa-solid fa-share-nodes" style="color: #4CAF50;"></i>
                    <span>Поделиться сервисом</span>
                </div>
                <i class="fa-solid fa-chevron-right arrow"></i>
            </button>
        </div>

        <div class="profile-sub-tabs">
            <button class="sub-tab-btn ${currentProfileSubTab === 'favs' ? 'active' : ''}" onclick="switchProfileSubTab('favs')">
                <i class="fa-solid fa-heart"></i> Хочу посетить (${totalFavCount})
            </button>
            <button class="sub-tab-btn ${currentProfileSubTab === 'visited' ? 'active' : ''}" onclick="switchProfileSubTab('visited')">
                <i class="fa-solid fa-flag"></i> Я там был (${totalVisitedCount})
            </button>
        </div>

        <div class="profile-fav-list">
            ${listHtml}
        </div>
    `;

    refreshReferralUI();
}

// Кэш и логика реферальных ачивок/счётчика
let referralsCountCache = 0;
let gameStatsLoadedForReferrals = false;

async function checkReferralAchievements() {
    if (!vkUserData || !vkUserData.id) return;

    if (typeof loadGameStatsFromVK === 'function' && !gameStatsLoadedForReferrals) {
        await loadGameStatsFromVK();
        gameStatsLoadedForReferrals = true;
    }

    const count = await fetchMyReferralsCount();
    referralsCountCache = count;

    if (typeof userGameStats === 'undefined' || !userGameStats.achievements) return;

    let changed = false;
    if (count >= 1 && !userGameStats.achievements.inviteFirst) {
        userGameStats.achievements.inviteFirst = true;
        changed = true;
    }
    if (count >= 5 && !userGameStats.achievements.inviteFive) {
        userGameStats.achievements.inviteFive = true;
        changed = true;
    }

    if (changed) {
        if (typeof saveGameStatsToVK === 'function') saveGameStatsToVK();
        if (typeof submitScoreToLeaderboard === 'function') submitScoreToLeaderboard();
    }
}

async function refreshReferralUI() {
    await checkReferralAchievements();
    const el = document.getElementById('referral-count-text');
    if (el) {
        el.textContent = referralsCountCache > 0
            ? `Приглашено друзей: ${referralsCountCache}`
            : 'Пригласить друга';
    }
}

function switchProfileSubTab(tab) {
    currentProfileSubTab = tab;
    renderProfileScreen();
}

// ===== Общие помощники для рисования красивых карточек Историй (Canvas) =====

function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const bigint = parseInt(full, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function ctxRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

// Тёмный фон с мягкими цветными пятнами и лёгкой текстурой из точек
function drawStoryBackground(ctx, accentColor) {
    const grad = ctx.createLinearGradient(0, 0, 1080, 1920);
    grad.addColorStop(0, '#0a1128');
    grad.addColorStop(0.5, '#161329');
    grad.addColorStop(1, '#0b0f1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1920);

    const blob = (x, y, r, alpha) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, hexToRgba(accentColor, alpha));
        g.addColorStop(1, hexToRgba(accentColor, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    };
    blob(120, 220, 380, 0.35);
    blob(980, 1750, 420, 0.25);
    blob(540, 950, 520, 0.10);

    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = 60; y < 1920; y += 60) {
        for (let x = 60; x < 1080; x += 60) {
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// Пилюля с названием приложения вверху карточки
function drawTopBadgePill(ctx, x, y, accentColor) {
    ctx.save();
    ctx.font = '600 30px sans-serif';
    const text = 'КРАСОТЫ ПЛАНЕТЫ';
    const paddingX = 34;
    const textWidth = ctx.measureText(text).width;
    const pillWidth = textWidth + paddingX * 2 + 50;
    const pillHeight = 74;
    const pillX = x - pillWidth / 2;
    const pillY = y - pillHeight / 2;

    ctxRoundRect(ctx, pillX, pillY, pillWidth, pillHeight, pillHeight / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hexToRgba(accentColor, 0.5);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '32px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('🌍', pillX + paddingX - 8, y + 2);
    ctx.font = '600 30px sans-serif';
    ctx.fillStyle = accentColor;
    ctx.fillText(text, pillX + paddingX + 40, y + 2);
    ctx.restore();
}

// Круглый медальон с иконкой/эмодзи и свечением — центральный акцент карточки
function drawMedallion(ctx, x, y, radius, color, emoji) {
    ctx.save();

    const glow = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 1.6);
    glow.addColorStop(0, hexToRgba(color, 0.35));
    glow.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, radius - 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    const ringGrad = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
    ringGrad.addColorStop(0, hexToRgba(color, 0.9));
    ringGrad.addColorStop(1, hexToRgba(color, 0.3));
    ctx.lineWidth = 10;
    ctx.strokeStyle = ringGrad;
    ctx.stroke();

    ctx.font = `${Math.round(radius * 1.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(emoji, x, y + radius * 0.05);

    ctx.restore();
}

// Ряд статистических "чипов" (иконка + число + подпись)
function drawStatChips(ctx, chips, centerX, y) {
    const chipWidth = 300;
    const chipHeight = 190;
    const gap = 24;
    const totalWidth = chips.length * chipWidth + (chips.length - 1) * gap;
    let startX = centerX - totalWidth / 2;

    chips.forEach(chip => {
        ctxRoundRect(ctx, startX, y, chipWidth, chipHeight, 28);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = hexToRgba(chip.color || '#ffffff', 0.35);
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = chip.color || '#ffffff';
        ctx.font = '54px sans-serif';
        ctx.fillText(chip.icon, startX + chipWidth / 2, y + 66);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 46px sans-serif';
        ctx.fillText(String(chip.value), startX + chipWidth / 2, y + 128);

        ctx.fillStyle = '#999999';
        ctx.font = '26px sans-serif';
        ctx.fillText(chip.label, startX + chipWidth / 2, y + 165);

        startX += chipWidth + gap;
    });
}

// Прогресс-бар с подписью снизу
function drawProgressBar(ctx, centerX, y, width, percent, color, label) {
    const height = 20;
    const x = centerX - width / 2;

    ctxRoundRect(ctx, x, y, width, height, height / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();

    const fillWidth = Math.max(height, width * Math.min(percent, 100) / 100);
    ctxRoundRect(ctx, x, y, fillWidth, height, height / 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#cccccc';
    ctx.font = '28px sans-serif';
    ctx.fillText(label, centerX, y + 60);
}

// Небольшая лента-бейдж (например, «Новый рекорд!»)
function drawRibbonBadge(ctx, centerX, y, text, color) {
    ctx.save();
    ctx.font = 'bold 34px sans-serif';
    const paddingX = 40;
    const textWidth = ctx.measureText(text).width;
    const w = textWidth + paddingX * 2;
    const h = 74;
    const x = centerX - w / 2;
    const yTop = y - h / 2;

    ctxRoundRect(ctx, x, yTop, w, h, h / 2);
    const grad = ctx.createLinearGradient(x, yTop, x + w, yTop);
    grad.addColorStop(0, hexToRgba(color, 0.95));
    grad.addColorStop(1, hexToRgba(color, 0.65));
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.fillStyle = '#1a1a1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, centerX, y + 2);
    ctx.restore();
}

// Текст по центру с переносом на 2 строки максимум
function wrapCenteredText(ctx, text, centerX, y, maxWidth, lineHeight) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const words = text.split(' ');
    let lines = [];
    let currentLine = '';
    words.forEach(word => {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        if (ctx.measureText(testLine).width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    });
    if (currentLine) lines.push(currentLine);
    if (lines.length > 2) {
        lines = lines.slice(0, 2);
        lines[1] = lines[1].slice(0, Math.max(0, lines[1].length - 3)) + '...';
    }
    lines.forEach((line, i) => {
        ctx.fillText(line, centerX, y + i * lineHeight);
    });
}

// Подпись-приглашение внизу карточки
function drawStoryFooter(ctx, y, accentColor) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#666666';
    ctx.font = '28px sans-serif';
    ctx.fillText('Открой приложение и играй 👇', 540, y);

    ctx.fillStyle = accentColor;
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('vk.com/app54690254', 540, y + 50);
}

// Генерация Canvas карточки (Base64) для платформ, поддерживающих blob
function generateStoryCanvasImage() {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1920;
        const ctx = canvas.getContext('2d');

        const visitedPlaces = (typeof allPlacesData !== 'undefined') ? allPlacesData.filter(p => isVisited(p.id)) : [];
        const favPlaces = (typeof allPlacesData !== 'undefined') ? allPlacesData.filter(p => isFavorite(p.id)) : [];
        const totalPlaces = (typeof allPlacesData !== 'undefined') ? allPlacesData.length : 0;
        const totalScore = calculateRankScore();
        const rank = getTravelerRank(totalScore);
        const rankColor = rank.color || '#2787F5';

        const titleParts = rank.title.trim().split(' ');
        const rankEmoji = titleParts.length > 1 ? titleParts.pop() : '🌍';
        const rankName = titleParts.join(' ');

        const unlockedAchievements = (typeof userGameStats !== 'undefined' && userGameStats.achievements)
            ? Object.values(userGameStats.achievements).filter(Boolean).length
            : 0;

        drawStoryBackground(ctx, rankColor);
        drawTopBadgePill(ctx, 540, 190, rankColor);
        drawMedallion(ctx, 540, 560, 220, rankColor, rankEmoji);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#aaaaaa';
        ctx.font = '30px sans-serif';
        ctx.fillText('Мой ранг в приложении', 540, 850);

        ctx.fillStyle = rankColor;
        ctx.font = 'bold 60px sans-serif';
        wrapCenteredText(ctx, rankName, 540, 925, 900, 68);

        drawStatChips(ctx, [
            { icon: '📍', value: visitedPlaces.length, label: 'посещено', color: '#4caf50' },
            { icon: '🤍', value: favPlaces.length, label: 'в планах', color: '#e91e63' },
            { icon: '🏅', value: `${unlockedAchievements}/12`, label: 'ачивок', color: '#ffd700' }
        ], 540, 1080);

        if (totalPlaces > 0) {
            const percent = Math.round((visitedPlaces.length / totalPlaces) * 100);
            drawProgressBar(ctx, 540, 1360, 760, percent, rankColor, `Изучено ${percent}% всех локаций планеты`);
        }

        drawStoryFooter(ctx, 1760, rankColor);

        return canvas.toDataURL('image/png');
    } catch (e) {
        return null;
    }
}

// Публикация истории в VK
function shareProfileToStory() {
    const vkHostedFallbackImage = 'https://sun9-82.userapi.com/c858228/v858228221/11d13f/8V3zJ5rX-o8.jpg';
    const storyDataUrl = generateStoryCanvasImage();

    publishStoryToVK({
        blobDataUrl: storyDataUrl,
        imageUrl: vkHostedFallbackImage,
        targetLink: APP_SHARE_LINK
    });
}

function shareApp() {
    if (window.vkBridge) {
        vkBridge.send('VKWebAppShare', { link: 'https://vk.ru/thebeautyofplan' })
            .catch(e => console.log('Шеринг отменен:', e));
    } else {
        navigator.clipboard.writeText('https://vk.ru/thebeautyofplan');
        showAppToast('Ссылка на группу скопирована в буфер обмена!', false);
    }
}