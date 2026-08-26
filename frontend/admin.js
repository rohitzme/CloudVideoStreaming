let maintenanceState = false;

async function loadMetrics() {
    const data = await apiFetch('/api/admin/metrics');
    users.textContent = data.users;
    videos.textContent = data.videos;
    views.textContent = data.totalViews;
    storage.textContent = formatBytes(data.storageBytes);
    streams.textContent = data.activeStreams;
    maintenanceState = data.maintenance;
    maintenance.textContent = maintenanceState ? 'Enabled' : 'Disabled';
    maintenanceBtn.textContent = maintenanceState ? 'Disable Maintenance' : 'Enable Maintenance';
}
async function loadUsers(search = '') {
    const data = await apiFetch(`/api/admin/users?search=${encodeURIComponent(search)}`);
    userTable.innerHTML = data.users.map(u => `<tr><td><strong>${u.username}</strong></td><td><span class="role">${u.role}</span></td><td>${u.status}</td><td>${formatDate(u.createdAt)}</td></tr>`).join('') || '<tr><td colspan="4">No users found.</td></tr>';
}
async function loadVideos() {
    const data = await apiFetch('/api/videos');
    videoTable.innerHTML = data.videos.map(v => `<tr><td><strong>${v.title}</strong><br><small class="muted">${v.originalName}</small></td><td>${v.uploadedBy}</td><td>${formatBytes(v.size)}</td><td>${v.views}</td><td>${formatDate(v.createdAt)}</td><td><button class="btn danger small-btn" onclick="deleteVideo('${v.id}')">Delete</button></td></tr>`).join('') || '<tr><td colspan="6">No videos uploaded yet.</td></tr>';
}
async function loadActivity() {
    const data = await apiFetch('/api/admin/activity');
    activityTable.innerHTML = data.activity.map(a => `<tr><td>${a.username}</td><td>${a.action}</td><td>${a.status}</td><td>${formatDate(a.time)}</td></tr>`).join('') || '<tr><td colspan="4">No activity recorded.</td></tr>';
}
async function deleteVideo(id) {
    if (!confirm('Delete this video asset permanently?')) return;
    try { await apiFetch(`/api/videos/${id}`, { method: 'DELETE' }); message.textContent = 'Video deleted successfully.'; await refreshAll(); }
    catch (error) { message.textContent = error.message; message.className = 'message error'; }
}
async function refreshAll() {
    try {
        await Promise.all([loadMetrics(), loadUsers(search.value), loadVideos(), loadActivity()]);
        apiHealth.textContent = 'Operational';
        systemBadge.textContent = '● System Online';
        systemBadge.className = 'badge';
        message.textContent = `Last refreshed ${new Date().toLocaleTimeString()}.`;
        message.className = 'message';
    } catch (error) {
        apiHealth.textContent = 'Unavailable';
        systemBadge.textContent = '● Backend issue';
        systemBadge.className = 'badge danger-badge';
        message.textContent = error.message;
        message.className = 'message error';
    }
}

document.getElementById('logout').onclick = e => { e.preventDefault(); logout(); };
document.getElementById('refreshBtn').onclick = refreshAll;
document.getElementById('refreshVideos').onclick = loadVideos;
search.addEventListener('input', e => loadUsers(e.target.value));
maintenanceBtn.onclick = async () => {
    try { const data = await apiFetch('/api/admin/maintenance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !maintenanceState }) }); maintenanceState = data.maintenance; await loadMetrics(); message.textContent = `Maintenance mode ${maintenanceState ? 'enabled' : 'disabled'}.`; }
    catch (error) { message.textContent = error.message; message.className = 'message error'; }
};

requireAuth('admin').then(user => { if (user) refreshAll(); });
