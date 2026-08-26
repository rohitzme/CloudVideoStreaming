const form = document.getElementById('loginForm');
const message = document.getElementById('message');
const loginBtn = document.getElementById('loginBtn');

if (getToken()) {
    const user = getStoredUser();
    if (user) location.href = user.role === 'admin' ? 'admin.html' : 'stream.html';
}

document.getElementById('demoBtn').addEventListener('click', () => {
    document.getElementById('username').value = 'admin';
    document.getElementById('password').value = 'admin123';
    message.textContent = 'Demo credentials filled. Click Sign in.';
    message.className = 'message';
});

form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = '';
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';
    try {
        const result = await apiFetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('username').value.trim(),
                password: document.getElementById('password').value
            })
        });
        saveSession(result, document.getElementById('remember').checked);
        message.textContent = 'Authentication successful. Opening workspace...';
        setTimeout(() => location.href = result.user.role === 'admin' ? 'admin.html' : 'stream.html', 300);
    } catch (error) {
        message.textContent = error.message;
        message.className = 'message error';
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign in';
    }
});
