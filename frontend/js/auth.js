const API = 'http://127.0.0.1:8000';

async function checkAuth(requireAdmin = false) {
  const token = localStorage.getItem('access_token');

  if (!token) {
    window.location.href = 'index.html';
    return null;
  }

  try {
    const res = await fetch(`${API}/users/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401) {
      // トークン期限切れ
      localStorage.removeItem('access_token');
      localStorage.removeItem('role');
      window.location.href = 'index.html';
      return null;
    }

    const user = await res.json();

    if (requireAdmin && user.role !== 'admin') {
      window.location.href = 'home.html';
      return null;
    }

    return user;

  } catch (e) {
    window.location.href = 'index.html';
    return null;
  }
}

function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('role');
  window.location.href = 'index.html';
}