// Показываем фото на весь экран прямо внутри приложения — без перехода
// куда-либо, поэтому и предупреждение ВК про "подозрительный сайт" не всплывает
function openPhotoViewer(url) {
    const modal = document.getElementById('modal-overlay');
    if (!modal) return;

    modal.innerHTML = `
        <div class="modal-card" onclick="event.stopPropagation()" style="padding: 10px; background: #000; box-shadow: none;">
            <button class="modal-close-btn" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
            <img src="${url}" style="width: 100%; max-height: 80vh; object-fit: contain; border-radius: 10px; display:block;">
        </div>
    `;
    modal.classList.add('active');
}

// Модуль пользовательских отзывов (фото + текст) к местам.
// Один отзыв на пользователя на место (можно редактировать/удалять).
// Новые отзывы уходят на модерацию (status: 'pending') и появляются
// у всех остальных только после того, как их одобрят в самой админке.

const REVIEW_PHOTOS_MAX = 3;
let reviewDraftFiles = [];      // File-объекты, выбранные в текущем редакторе
let reviewDraftExistingUrls = []; // уже загруженные фото при редактировании (можно убирать)
let reviewEditingPlaceId = null;

// Сжимаем фото на клиенте перед загрузкой, чтобы не тратить лимит хранилища
// и меньше передавать по слабой сети
function compressImageFile(file, maxDim = 1000, quality = 0.62) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxDim || height > maxDim) {
                    const scale = maxDim / Math.max(width, height);
                    width = Math.round(width * scale);
                    height = Math.round(height * scale);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob); else reject(new Error('Не удалось обработать изображение'));
                }, 'image/jpeg', quality);
            };
            img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
        reader.readAsDataURL(file);
    });
}

async function uploadReviewPhoto(blob, placeId, index) {
    const formData = new FormData();
    formData.append('photo', blob, `${index}.jpg`);

    const res = await fetchWithTimeout(`${BACKEND_URL}/api/reviews/upload-photo`, {
        method: 'POST',
        body: formData
    }, 30000);

    if (!res.ok) throw new Error('Ошибка загрузки фото на сервер');
    const data = await res.json();
    return data.url;
}

// Пробуем загрузить фото, при неудаче даём ещё одну попытку —
// на нестабильной мобильной сети с первого раза получается не всегда
async function uploadReviewPhotoWithRetry(blob, placeId, index) {
    try {
        return await uploadReviewPhoto(blob, placeId, index);
    } catch (e) {
        console.warn('Первая попытка загрузки фото не удалась, пробуем ещё раз:', e);
        return await uploadReviewPhoto(blob, placeId, index + '_retry');
    }
}

async function fetchApprovedReviews(placeId) {
    try {
        const res = await fetchWithTimeout(`${BACKEND_URL}/api/reviews?place_id=${placeId}`);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.warn('Не удалось загрузить отзывы:', e);
        return null;
    }
}

async function fetchMyReview(placeId) {
    if (!vkUserData || !vkUserData.id) return null;
    try {
        const res = await fetchWithTimeout(`${BACKEND_URL}/api/reviews/mine?place_id=${placeId}&vk_user_id=${vkUserData.id}`);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

// Рисуем блок отзывов внутри уже открытой карточки места.
// Показываем сразу заготовку (без ожидания сервера), данные подгружаем в фоне —
// так на медленной сети экран не выглядит подвисшим.
function renderReviewsSection(placeId) {
    const section = document.getElementById('place-reviews-section');
    if (!section) return;

    section.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
            <h4 style="margin:0; font-size:14px; color:#ffffff;"><i class="fa-solid fa-comments" style="color:#4caf50;"></i> Отзывы путешественников</h4>
            <button class="feed-btn sec" style="flex: none; margin-left:0; padding:6px 12px; font-size:12px;" onclick="event.stopPropagation(); openReviewEditor(${placeId})">
                <i class="fa-solid fa-plus"></i> Добавить
            </button>
        </div>
        <div id="place-reviews-list" style="font-size:12px; color:#888888;">Загружаем...</div>
    `;

    Promise.all([
        fetchApprovedReviews(placeId),
        fetchMyReview(placeId)
    ]).then(([approved, mine]) => {
        const listEl = document.getElementById('place-reviews-list');
        if (!listEl) return;

        const addBtn = section.querySelector('button');
        if (addBtn && mine) {
            addBtn.innerHTML = `<i class="fa-solid fa-pen"></i> Мой отзыв`;
        }

        // approved === null означает, что запрос не удался (плохая связь и т.п.) —
        // это не то же самое, что "отзывов пока нет"
        if (approved === null) {
            listEl.innerHTML = `<div style="text-align:center; color:#ff9800; font-size:12px; padding:8px 0 4px;">Не удалось загрузить отзывы — проверь соединение</div>`;
            return;
        }

        const otherApproved = approved.filter(r => !mine || r.vk_user_id !== mine.vk_user_id);

        let html = '';
        if (mine) {
            html += `
                <div style="background: rgba(39,135,245,0.1); border:1px solid rgba(39,135,245,0.3); border-radius:12px; padding:10px 12px; margin-bottom:10px;">
                    <div style="font-size:11px; color:${mine.status === 'approved' ? '#4caf50' : '#ff9800'}; margin-bottom:4px;">
                        ${mine.status === 'approved' ? '✅ Опубликован' : '⏳ На модерации'}
                    </div>
                    ${renderSingleReviewCard(mine, true)}
                </div>
            `;
        }

        if (otherApproved.length === 0 && !mine) {
            html += `<div style="text-align:center; color:#888888; font-size:12px; padding:8px 0 4px;">Пока никто не оставил отзыв — стань первым!</div>`;
        } else {
            html += otherApproved.map(r => renderSingleReviewCard(r, false)).join('');
        }

        listEl.outerHTML = `<div id="place-reviews-list">${html}</div>`;
    }).catch(() => {
        const listEl = document.getElementById('place-reviews-list');
        if (listEl) listEl.textContent = 'Не удалось загрузить отзывы';
    });
}

function renderSingleReviewCard(review, isMine) {
    const photosHtml = (review.photo_urls || []).map(url => {
        const safeUrl = url.replace(/^http:\/\//i, 'https://');
        return `
        <img src="${safeUrl}" onclick="event.stopPropagation(); openPhotoViewer('${safeUrl}')" style="width:64px; height:64px; border-radius:8px; object-fit:cover; cursor:pointer;">
    `;
    }).join('');

    return `
        <div style="display:flex; gap:10px; padding:10px 0; ${isMine ? '' : 'border-bottom:1px solid rgba(255,255,255,0.06);'}">
            <img src="${review.avatar || 'https://vk.com/images/camera_100.png'}" style="width:34px; height:34px; border-radius:50%; object-fit:cover; flex-shrink:0;">
            <div style="flex:1; min-width:0;">
                <div style="font-size:12px; font-weight:600; color:#ffffff;">${review.name || 'Путешественник'}</div>
                ${review.comment ? `<div style="font-size:12px; color:#cccccc; margin-top:2px; line-height:1.4;">${review.comment}</div>` : ''}
                ${photosHtml ? `<div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">${photosHtml}</div>` : ''}
            </div>
        </div>
    `;
}

// Экран редактора отзыва (используем общий modal-overlay)
function openReviewEditor(placeId, event) {
    if (event) event.stopPropagation();
    const modal = document.getElementById('modal-overlay');
    if (!modal) return;

    reviewEditingPlaceId = placeId;
    reviewDraftFiles = [];
    reviewDraftExistingUrls = [];

    modal.innerHTML = `
        <div class="modal-card" onclick="event.stopPropagation()" style="padding: 20px; max-height: 85vh; overflow-y: auto;">
            <button class="modal-close-btn" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
            <h3 id="review-editor-title" style="margin: 4px 0 14px 0; font-size: 17px; color:#ffffff;">Новый отзыв</h3>

            <textarea id="review-comment-input" placeholder="Расскажи, как тебе тут понравилось..." style="width:100%; min-height:80px; background:#1a1a1a; border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:10px; color:#ffffff; font-size:13px; box-sizing:border-box; resize:vertical;"></textarea>

            <div id="review-photos-preview" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;"></div>

            <label for="review-file-input" id="review-add-photo-btn" style="display:flex; align-items:center; justify-content:center; gap:6px; border:1px dashed rgba(255,255,255,0.25); border-radius:10px; padding:10px; margin-top:10px; color:#aaaaaa; font-size:12px; cursor:pointer;">
                <i class="fa-solid fa-camera"></i> Добавить фото (до ${REVIEW_PHOTOS_MAX})
            </label>
            <input id="review-file-input" type="file" accept="image/*" multiple style="display:none;" onchange="handleReviewFileSelect(event)">

            <div id="review-editor-buttons" style="display:flex; gap:10px; margin-top:18px;">
                <button id="review-submit-btn" class="feed-btn prim" style="flex:1; margin-left:0;" onclick="submitReview(${placeId})">
                    Отправить
                </button>
            </div>
            <p style="font-size:11px; color:#666666; margin-top:10px; margin-bottom:0;">Отзыв появится у остальных после проверки модератором.</p>
        </div>
    `;
    modal.classList.add('active');
    renderReviewPhotosPreview();

    // Существующий отзыв (если есть) подгружаем в фоне и заполняем форму,
    // не заставляя человека ждать сервер, чтобы просто увидеть окно
    fetchMyReview(placeId).then(existing => {
        if (!existing) return;

        reviewDraftExistingUrls = existing.photo_urls ? [...existing.photo_urls] : [];

        const commentEl = document.getElementById('review-comment-input');
        if (commentEl && existing.comment) commentEl.value = existing.comment;

        const titleEl = document.getElementById('review-editor-title');
        if (titleEl) titleEl.textContent = 'Редактировать отзыв';

        const buttonsEl = document.getElementById('review-editor-buttons');
        if (buttonsEl) {
            buttonsEl.innerHTML = `
                <button class="feed-btn sec" style="flex:1; margin-left:0; background:#c62828;" onclick="deleteReview(${placeId})">
                    <i class="fa-solid fa-trash"></i> Удалить
                </button>
                <button id="review-submit-btn" class="feed-btn prim" style="flex:2; margin-left:0;" onclick="submitReview(${placeId})">
                    Сохранить
                </button>
            `;
        }

        renderReviewPhotosPreview();
    });
}

function renderReviewPhotosPreview() {
    const wrap = document.getElementById('review-photos-preview');
    if (!wrap) return;

    let html = '';
    reviewDraftExistingUrls.forEach((url, i) => {
        html += `
            <div style="position:relative;">
                <img src="${url}" style="width:64px; height:64px; border-radius:8px; object-fit:cover;">
                <button onclick="removeExistingReviewPhoto(${i})" style="position:absolute; top:-6px; right:-6px; width:20px; height:20px; border-radius:50%; background:#c62828; color:#fff; border:none; font-size:11px;">✕</button>
            </div>
        `;
    });
    reviewDraftFiles.forEach((file, i) => {
        const url = URL.createObjectURL(file);
        html += `
            <div style="position:relative;">
                <img src="${url}" style="width:64px; height:64px; border-radius:8px; object-fit:cover;">
                <button onclick="removeNewReviewPhoto(${i})" style="position:absolute; top:-6px; right:-6px; width:20px; height:20px; border-radius:50%; background:#c62828; color:#fff; border:none; font-size:11px;">✕</button>
            </div>
        `;
    });
    wrap.innerHTML = html;

    const totalCount = reviewDraftExistingUrls.length + reviewDraftFiles.length;
    const addBtn = document.getElementById('review-add-photo-btn');
    if (addBtn) addBtn.style.display = totalCount >= REVIEW_PHOTOS_MAX ? 'none' : 'flex';
}

function handleReviewFileSelect(event) {
    const files = Array.from(event.target.files || []);
    const totalCount = reviewDraftExistingUrls.length + reviewDraftFiles.length;
    const remaining = REVIEW_PHOTOS_MAX - totalCount;

    reviewDraftFiles.push(...files.slice(0, Math.max(0, remaining)));
    event.target.value = '';
    renderReviewPhotosPreview();
}

function removeExistingReviewPhoto(index) {
    reviewDraftExistingUrls.splice(index, 1);
    renderReviewPhotosPreview();
}

function removeNewReviewPhoto(index) {
    reviewDraftFiles.splice(index, 1);
    renderReviewPhotosPreview();
}

async function submitReview(placeId) {
    if (!vkUserData || !vkUserData.id) {
        showAppToast('Не удалось определить пользователя ВК. Попробуй чуть позже.', true);
        return;
    }

    const commentEl = document.getElementById('review-comment-input');
    const comment = commentEl ? commentEl.value.trim() : '';

    if (!comment && reviewDraftExistingUrls.length === 0 && reviewDraftFiles.length === 0) {
        showAppToast('Добавь текст или хотя бы одно фото', true);
        return;
    }

    const submitBtn = document.getElementById('review-submit-btn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Отправка...'; }

    try {
        const uploadedUrls = [];
        let failedCount = 0;

        for (let i = 0; i < reviewDraftFiles.length; i++) {
            if (submitBtn) submitBtn.textContent = `Загружаю фото ${i + 1} из ${reviewDraftFiles.length}...`;
            try {
                const blob = await compressImageFile(reviewDraftFiles[i]);
                const url = await uploadReviewPhotoWithRetry(blob, placeId, Date.now() + i);
                uploadedUrls.push(url);
            } catch (photoErr) {
                console.warn('Фото не загрузилось, пропускаем:', photoErr);
                failedCount++;
            }
        }

        const finalPhotoUrls = [...reviewDraftExistingUrls, ...uploadedUrls];

        if (submitBtn) submitBtn.textContent = 'Сохраняю отзыв...';

        const payload = {
            place_id: placeId,
            vk_user_id: vkUserData.id,
            name: `${vkUserData.first_name || ''} ${vkUserData.last_name || ''}`.trim() || 'Путешественник',
            avatar: vkUserData.photo_100 || '',
            comment: comment,
            photo_urls: finalPhotoUrls.length > 0 ? finalPhotoUrls : null
        };

        const res = await fetchWithTimeout(`${BACKEND_URL}/api/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }, 20000);

        if (!res.ok) throw new Error('Сервер отклонил запрос');

        if (failedCount > 0) {
            showAppToast(`Отзыв отправлен, но ${failedCount} фото не загрузилось (плохая связь) — можешь дозагрузить их позже через "Мой отзыв"`, true);
        } else {
            showAppToast('Отзыв отправлен! Появится у остальных после проверки 👍', false);
        }
        closeModal();
        if (typeof openPlaceDetails === 'function') openPlaceDetails(placeId);
    } catch (e) {
        console.error('Ошибка отправки отзыва:', e);
        showAppToast('Не получилось отправить отзыв. Похоже, слабое соединение — попробуй на Wi-Fi или более сильном сигнале.', true);
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Отправить'; }
    }
}

// Показываем своё окошко подтверждения удаления вместо системного confirm()
function deleteReview(placeId) {
    const modal = document.getElementById('modal-overlay');
    if (!modal) return;

    modal.innerHTML = `
        <div class="modal-card" onclick="event.stopPropagation()" style="padding: 24px; text-align: center;">
            <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #ffffff;">Удалить отзыв?</h3>
            <p style="color:#aaaaaa; font-size:13px; margin-bottom:20px;">Отзыв и фото пропадут без возможности восстановить.</p>
            <div style="display:flex; gap:10px;">
                <button class="feed-btn sec" style="flex:1; margin-left:0;" onclick="event.stopPropagation(); openReviewEditor(${placeId})">Отмена</button>
                <button class="feed-btn prim" style="flex:1; margin-left:0; background:#c62828;" onclick="event.stopPropagation(); performDeleteReview(${placeId})">Удалить</button>
            </div>
        </div>
    `;
    modal.classList.add('active');
}

async function performDeleteReview(placeId) {
    if (!vkUserData || !vkUserData.id) return;

    try {
        await fetchWithTimeout(`${BACKEND_URL}/api/reviews?place_id=${placeId}&vk_user_id=${vkUserData.id}`, {
            method: 'DELETE'
        });
        closeModal();
        if (typeof openPlaceDetails === 'function') openPlaceDetails(placeId);
    } catch (e) {
        showAppToast('Не удалось удалить отзыв, попробуй ещё раз', true);
    }
}