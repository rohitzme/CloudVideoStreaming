const video = document.getElementById('video');
const select = document.getElementById('videoSelect');
const status = document.getElementById('status');
let videos = [];
let currentId = null;

async function loadVideos() {
    try {
        const data = await apiFetch('/api/videos');
        videos = data.videos;
        select.innerHTML = '<option value="">Choose a video asset</option>' + videos.map(v => `<option value="${v.id}">${v.title} · ${formatBytes(v.size)}</option>`).join('');
        document.getElementById('libraryStatus').textContent = `${videos.length} video asset${videos.length === 1 ? '' : 's'} available.`;
        if (!videos.length) status.textContent = 'No videos yet. Upload one from the Upload page.';
    } catch (error) { document.getElementById('libraryStatus').textContent = error.message; status.textContent = error.message; status.className = 'message error'; }
}

select.addEventListener('change', async () => {
    const selected = videos.find(v => v.id === select.value);
    if (!selected) { video.removeAttribute('src'); currentId = null; document.getElementById('videoMeta').hidden = true; return; }
    currentId = selected.id;
    video.src = selected.streamUrl;
    video.load();
    const meta = document.getElementById('videoMeta');
    meta.hidden = false;
    meta.innerHTML = `<strong>${selected.title}</strong><span>${selected.description || 'No description provided.'}</span><small>${formatBytes(selected.size)} · ${selected.views} views · uploaded by ${selected.uploadedBy}</small>`;
    status.textContent = `${selected.title} is ready to stream.`;
    status.className = 'message';
    try { await apiFetch(`/api/videos/${selected.id}/view`, { method: 'POST' }); } catch { /* playback can continue */ }
});

document.getElementById('playBtn').onclick = async () => { try { await video.play(); status.textContent = 'Video is playing from the CloudStream backend.'; } catch { status.textContent = 'Choose a video before pressing Play.'; status.className = 'message error'; } };
document.getElementById('pauseBtn').onclick = () => { video.pause(); status.textContent = 'Video paused.'; };
document.getElementById('muteBtn').onclick = () => { video.muted = !video.muted; document.getElementById('muteBtn').textContent = video.muted ? '🔇 Unmute' : '🔊 Mute'; };
document.getElementById('fullBtn').onclick = () => video.requestFullscreen?.();
document.getElementById('refreshBtn').onclick = loadVideos;
document.getElementById('logout').onclick = e => { e.preventDefault(); logout(); };
video.addEventListener('timeupdate', () => { const percent = video.duration ? video.currentTime / video.duration * 100 : 0; document.getElementById('watchProgress').style.width = `${percent}%`; });
video.addEventListener('ended', () => { status.textContent = 'Playback completed successfully.'; });
requireAuth().then(user => { if (user) loadVideos(); });
