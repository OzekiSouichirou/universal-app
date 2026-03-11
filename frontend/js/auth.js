const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:8000'
  : 'https://polonix-api-sod4.onrender.com';

async function checkAuth(requireAdmin = false) {
  const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

  if (!token) {
    window.location.href = 'index.html';
    return null;
  }

  try {
    const res = await fetch(`${API}/users/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('role');
      sessionStorage.removeItem('access_token');
      sessionStorage.removeItem('role');
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
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('role');
  window.location.href = 'index.html';
}