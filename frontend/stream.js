const video = document.getElementById('video');
const status = document.getElementById('status');
const playerPanel = document.getElementById('playerPanel');
const searchInput = document.getElementById('searchInput');
let videos = [];
let currentId = null;
let currentUser = null;

function buildNav() {
    const nav = document.getElementById('navBar');
    const links = [];
    if (currentUser && currentUser.role === 'admin') {
        links.push({ href: 'admin.html', label: 'Dashboard' });
        links.push({ href: 'upload.html', label: 'Upload' });
    }
    links.push({ href: 'stream.html', label: 'Library', active: true });
    nav.innerHTML = links.map(l => `<a class="${l.active ? 'active' : ''}" href="${l.href}">${l.label}</a>`).join('') + '<a href="#" id="logout">Logout</a>';
    document.getElementById('logout').onclick = e => { e.preventDefault(); logout(); };
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

async function loadVideos() {
    const search = searchInput.value.trim();
    try {
        const url = search ? `/api/videos?search=${encodeURIComponent(search)}` : '/api/videos';
        const data = await apiFetch(url);
        videos = data.videos;
        renderGrid();
        document.getElementById('libraryStatus').textContent = `${videos.length} video asset${videos.length === 1 ? '' : 's'} available.`;
    } catch (error) {
        document.getElementById('libraryStatus').textContent = error.message;
        document.getElementById('videoGrid').innerHTML = '';
        document.getElementById('emptyState').hidden = false;
    }
}

function renderGrid() {
    const grid = document.getElementById('videoGrid');
    const empty = document.getElementById('emptyState');
    if (!videos.length) {
        grid.innerHTML = '';
        empty.hidden = false;
        return;
    }
    empty.hidden = true;
    grid.innerHTML = videos.map(v => `
        <article class="video-card" data-id="${v.id}">
            <div class="video-thumb" data-id="${v.id}">
                <video preload="metadata" muted></video>
                <span class="play-overlay">▶</span>
            </div>
            <div class="video-info">
                <h3 data-id="${v.id}">${escapeHtml(v.title)}</h3>
                <p class="muted">${escapeHtml(v.description || 'No description provided.')}</p>
                <div class="video-stats">
                    <span>${formatBytes(v.size)}</span>
                    <span>${v.views} views</span>
                    <span>${formatDate(v.createdAt)}</span>
                </div>
                <div class="video-uploader">Uploaded by <strong>${escapeHtml(v.uploadedBy)}</strong></div>
                <div class="card-actions">
                    <button class="btn small-btn" data-play="${v.id}">▶ Play</button>
                    ${currentUser && currentUser.role === 'admin' ? `<button class="btn danger small-btn" data-delete="${v.id}">Delete</button>` : ''}
                </div>
            </div>
        </article>
    `).join('');

    videos.forEach(v => {
        const card = grid.querySelector(`[data-id="${v.id}"]`);
        if (card) {
            const vid = card.querySelector('video');
            vid.src = v.thumbnailUrl;
        }
    });

    grid.querySelectorAll('[data-play]').forEach(btn => {
        btn.onclick = () => playVideo(btn.getAttribute('data-play'));
    });
    grid.querySelectorAll('.video-thumb').forEach(thumb => {
        thumb.onclick = () => playVideo(thumb.getAttribute('data-id'));
    });
    grid.querySelectorAll('h3[data-id]').forEach(h => {
        h.onclick = () => playVideo(h.getAttribute('data-id'));
    });
    grid.querySelectorAll('[data-delete]').forEach(btn => {
        btn.onclick = () => deleteVideo(btn.getAttribute('data-delete'));
    });
}

async function playVideo(id) {
    const selected = videos.find(v => v.id === id);
    if (!selected) return;
    currentId = selected.id;
    playerPanel.hidden = false;
    document.getElementById('playerTitle').textContent = selected.title;
    const meta = document.getElementById('playerMeta');
    meta.innerHTML = `<strong>${escapeHtml(selected.title)}</strong><span>${escapeHtml(selected.description || 'No description provided.')}</span><small>${formatBytes(selected.size)} · ${selected.views} views · uploaded by ${escapeHtml(selected.uploadedBy)}</small>`;
    video.src = selected.streamUrl;
    video.load();
    document.getElementById('playerStatus').textContent = `${selected.title} is ready to stream.`;
    status.textContent = `${selected.title} is ready to stream.`;
    status.className = 'message';
    try { await apiFetch(`/api/videos/${selected.id}/view`, { method: 'POST' }); } catch { /* playback can continue */ }
    playerPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteVideo(id) {
    if (!confirm('Delete this video permanently?')) return;
    try {
        await apiFetch(`/api/videos/${id}`, { method: 'DELETE' });
        if (currentId === id) { playerPanel.hidden = true; video.removeAttribute('src'); }
        await loadVideos();
    } catch (error) {
        status.textContent = error.message;
        status.className = 'message error';
    }
}

document.getElementById('playBtn').onclick = async () => {
    try { await video.play(); status.textContent = 'Video is playing from the CloudStream backend.'; }
    catch { status.textContent = 'Choose a video before pressing Play.'; status.className = 'message error'; }
};
document.getElementById('pauseBtn').onclick = () => { video.pause(); status.textContent = 'Video paused.'; };
document.getElementById('muteBtn').onclick = () => { video.muted = !video.muted; document.getElementById('muteBtn').textContent = video.muted ? '🔇 Unmute' : '🔊 Mute'; };
document.getElementById('fullBtn').onclick = () => video.requestFullscreen?.();
document.getElementById('closePlayerBtn').onclick = () => { video.pause(); playerPanel.hidden = true; video.removeAttribute('src'); };
document.getElementById('refreshBtn').onclick = loadVideos;
searchInput.addEventListener('input', () => loadVideos());
video.addEventListener('timeupdate', () => {
    const percent = video.duration ? video.currentTime / video.duration * 100 : 0;
    document.getElementById('watchProgress').style.width = `${percent}%`;
});
video.addEventListener('ended', () => { status.textContent = 'Playback completed successfully.'; });

requireAuth().then(user => {
    if (user) {
        currentUser = user;
        buildNav();
        loadVideos();
    }
});
