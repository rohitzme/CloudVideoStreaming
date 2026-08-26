let objectUrl = null;
const fileInput = document.getElementById('video');
const preview = document.getElementById('preview');
const previewBox = document.getElementById('previewBox');
const message = document.getElementById('message');
const form = document.getElementById('uploadForm');

fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { message.textContent = 'Please select a valid video file.'; message.className = 'message error'; fileInput.value = ''; return; }
    if (file.size > 100 * 1024 * 1024) { message.textContent = 'The maximum upload size is 100 MB.'; message.className = 'message error'; fileInput.value = ''; return; }
    document.getElementById('title').value ||= file.name.replace(/\.[^.]+$/, '');
    document.getElementById('fileInfo').textContent = `${file.name} · ${formatBytes(file.size)}`;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    preview.src = objectUrl;
    previewBox.hidden = false;
    message.textContent = 'Video selected and ready for upload.';
    message.className = 'message';
});

form.addEventListener('submit', async e => {
    e.preventDefault();
    const file = fileInput.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('video', file);
    formData.append('title', document.getElementById('title').value.trim());
    formData.append('description', document.getElementById('description').value.trim());
    const button = document.getElementById('uploadBtn');
    button.disabled = true;
    message.textContent = 'Uploading and registering video asset...';
    message.className = 'message';
    try {
        const result = await apiFetch('/api/videos', { method: 'POST', body: formData });
        document.getElementById('progressBar').style.width = '100%';
        message.textContent = `${result.message} You can now stream it from the library.`;
        form.reset();
        previewBox.hidden = true;
        preview.removeAttribute('src');
        document.getElementById('fileInfo').textContent = 'MP4/WebM/MOV and other browser-supported video formats up to 100 MB.';
    } catch (error) {
        message.textContent = error.message;
        message.className = 'message error';
    } finally { button.disabled = false; }
});

document.getElementById('clearBtn').onclick = () => { form.reset(); previewBox.hidden = true; preview.removeAttribute('src'); document.getElementById('progressBar').style.width = '0%'; message.textContent = ''; };
document.getElementById('logout').onclick = e => { e.preventDefault(); logout(); };
requireAuth().then(user => { if (user && !['admin','uploader'].includes(user.role)) { message.textContent = 'Viewer accounts can stream videos but cannot upload.'; document.getElementById('uploadBtn').disabled = true; } });
