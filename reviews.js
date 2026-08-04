// Модуль пользовательских отзывов (фото + текст) к местам.
// Один отзыв на пользователя на место (можно редактировать/удалять).
// Новые отзывы уходят на модерацию (status: 'pending') и появляются
// у всех остальных только после того, как их одобрят вручную в Supabase.

const REVIEW_PHOTOS_MAX = 3;
let reviewDraftFiles = [];      // File-объекты, выбранные в текущем редакторе
let reviewDraftExistingUrls = []; // уже загруженные фото при редактировании (можно убирать)
let reviewEditingPlaceId = null;

// Сжимаем фото на клиенте перед загрузкой, чтобы не тратить лимит хранилища
function compressImageFile(file, maxDim = 1280, quality = 0.72) {
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
    const path = `${placeId}/${vkUserData.id}_${Date.now()}_${index}.jpg`;
    const res = await fetchWithTimeout(`${SUPABASE_URL}/storage/v1/object/place-photos/${path}`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'image/jpeg'
        },
        body: blob
    }, 15000);
    if (!res.ok) throw new Error('Ошибка загрузки фото на сервер');
    return `${SUPABASE_URL}/storage/v1/object/public/place-photos/${path}`;
}

async function fetchApprovedReviews(placeId) {
    try {
        const res = await fetchWithTimeout(
            `${SUPABASE_URL}/rest/v1/place_reviews?select=*&place_id=eq.${placeId}&status=eq.approved&order=created_at.desc`,
            { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
        );
        if (!res.ok) return [];
        return await res.json();
    } catch (e) {
        console.warn('Не удалось загрузить отзывы:', e);
        return [];
    }
}

async function fetchMyReview(placeId) {
    if (!vkUserData || !vkUserData.id) return null;
    try {
        const res = await fetchWithTimeout(
            `${SUPABASE_URL}/rest/v1/place_reviews?select=*&place_id=eq.${placeId}&vk_user_id=eq.${vkUserData.id}`,
            { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
        );
        if (!res.ok) return null;
        const rows = await res.json();
        return rows[0] || null;
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
    const photosHtml = (review.photo_urls || []).map(url => `
        <img src="${url}" onclick="event.stopPropagation(); window.open('${url}', '_blank')" style="width:64px; height:64px; border-radius:8px; object-fit:cover; cursor:pointer;">
    `).join('');

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
        alert('Не удалось определить пользователя ВК. Попробуй чуть позже.');
        return;
    }

    const commentEl = document.getElementById('review-comment-input');
    const comment = commentEl ? commentEl.value.trim() : '';

    if (!comment && reviewDraftExistingUrls.length === 0 && reviewDraftFiles.length === 0) {
        alert('Добавь текст или хотя бы одно фото');
        return;
    }

    const submitBtn = document.getElementById('review-submit-btn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Отправка...'; }

    try {
        const uploadedUrls = [];
        for (let i = 0; i < reviewDraftFiles.length; i++) {
            const blob = await compressImageFile(reviewDraftFiles[i]);
            const url = await uploadReviewPhoto(blob, placeId, Date.now() + i);
            uploadedUrls.push(url);
        }

        const finalPhotoUrls = [...reviewDraftExistingUrls, ...uploadedUrls];

        const payload = [{
            place_id: placeId,
            vk_user_id: vkUserData.id,
            name: `${vkUserData.first_name || ''} ${vkUserData.last_name || ''}`.trim() || 'Путешественник',
            avatar: vkUserData.photo_100 || '',
            comment: comment,
            photo_urls: finalPhotoUrls.length > 0 ? finalPhotoUrls : null,
            status: 'pending',
            updated_at: new Date().toISOString()
        }];

        const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/place_reviews`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(payload)
        }, 20000);

        if (!res.ok) throw new Error('Сервер отклонил запрос');

        alert('Отзыв отправлен! Появится у остальных после проверки 👍');
        closeModal();
        if (typeof openPlaceDetails === 'function') openPlaceDetails(placeId);
    } catch (e) {
        console.error('Ошибка отправки отзыва:', e);
        alert('Не получилось отправить отзыв — проверь соединение и попробуй ещё раз.');
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Отправить'; }
    }
}

async function deleteReview(placeId) {
    if (!vkUserData || !vkUserData.id) return;
    if (!confirm('Удалить свой отзыв?')) return;

    try {
        await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/place_reviews?place_id=eq.${placeId}&vk_user_id=eq.${vkUserData.id}`, {
            method: 'DELETE',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        closeModal();
        if (typeof openPlaceDetails === 'function') openPlaceDetails(placeId);
    } catch (e) {
        alert('Не удалось удалить отзыв, попробуй ещё раз');
    }
}