let objectUrl = null;
let currentUser = null;
const fileInput = document.getElementById('video');
const preview = document.getElementById('preview');
const previewBox = document.getElementById('previewBox');
const message = document.getElementById('message');
const form = document.getElementById('uploadForm');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
        message.textContent = 'Please select a valid video file.';
        message.className = 'message error';
        fileInput.value = '';
        return;
    }
    if (file.size > 100 * 1024 * 1024) {
        message.textContent = 'The maximum upload size is 100 MB.';
        message.className = 'message error';
        fileInput.value = '';
        return;
    }
    const titleInput = document.getElementById('title');
    if (!titleInput.value) titleInput.value = file.name.replace(/\.[^.]+$/, '');
    document.getElementById('fileInfo').textContent = `${file.name} · ${formatBytes(file.size)}`;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    preview.src = objectUrl;
    previewBox.hidden = false;
    message.textContent = 'Video selected and ready for upload.';
    message.className = 'message';
});

function uploadWithProgress(formData) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/videos');
        const token = getToken();
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.addEventListener('progress', e => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                progressBar.style.width = `${percent}%`;
                progressText.textContent = `Uploading... ${percent}% (${formatBytes(e.loaded)} / ${formatBytes(e.total)})`;
            }
        });
        xhr.addEventListener('load', () => {
            const type = xhr.getResponseHeader('content-type') || '';
            const body = type.includes('application/json') ? JSON.parse(xhr.responseText) : xhr.responseText;
            if (xhr.status >= 200 && xhr.status < 300) resolve(body);
            else reject(new Error(body.error || body || `Upload failed (${xhr.status})`));
        });
        xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));
        xhr.send(formData);
    });
}

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
    progressText.hidden = false;
    progressBar.style.width = '0%';
    try {
        const result = await uploadWithProgress(formData);
        progressBar.style.width = '100%';
        progressText.textContent = 'Upload complete.';
        message.textContent = `${result.message} You can now stream it from the library.`;
        form.reset();
        previewBox.hidden = true;
        preview.removeAttribute('src');
        document.getElementById('fileInfo').textContent = 'MP4/WebM/MOV and other browser-supported video formats up to 100 MB.';
    } catch (error) {
        message.textContent = error.message;
        message.className = 'message error';
        progressBar.style.width = '0%';
        progressText.hidden = true;
    } finally {
        button.disabled = false;
    }
});

document.getElementById('clearBtn').onclick = () => {
    form.reset();
    previewBox.hidden = true;
    preview.removeAttribute('src');
    progressBar.style.width = '0%';
    progressText.hidden = true;
    message.textContent = '';
};

document.getElementById('logout').onclick = e => { e.preventDefault(); logout(); };

requireAuth().then(user => {
    if (user) {
        currentUser = user;
        if (!['admin', 'uploader'].includes(user.role)) {
            message.textContent = 'Viewer accounts can stream videos but cannot upload.';
            message.className = 'message error';
            document.getElementById('uploadBtn').disabled = true;
            fileInput.disabled = true;
        }
    }
});
