document.getElementById('logout-btn').addEventListener('click', logout);

async function init() {
  const user = await checkAuth(true);
  if (!user) return;
  document.getElementById('current-user').textContent    = user.username;
  document.getElementById('profile-username').textContent = user.username;
  document.getElementById('profile-role').textContent    = user.role==='admin' ? '管理者' : '一般ユーザー';
  document.getElementById('profile-created').textContent = new Date(user.created_at+'Z').toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'});
}

document.getElementById('change-password-btn').addEventListener('click', async () => {
  const current = document.getElementById('current-password').value.trim();
  const newPass = document.getElementById('new-password').value.trim();
  const confirm = document.getElementById('confirm-password').value.trim();
  const msg     = document.getElementById('password-msg');

  if (!current||!newPass||!confirm) { msg.style.color='#f0476c'; msg.textContent='すべての項目を入力してください'; return; }
  if (newPass!==confirm)            { msg.style.color='#f0476c'; msg.textContent='新しいパスワードが一致しません'; return; }

  try {
    await api('/users/me/password', { method:'PATCH', body:JSON.stringify({ current_password:current, new_password:newPass }) });
    msg.style.color = '#3ecf8e'; msg.textContent = 'パスワードを変更しました';
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value     = '';
    document.getElementById('confirm-password').value = '';
  } catch(e) { msg.style.color='#f0476c'; msg.textContent=e.message||'パスワード変更に失敗しました'; }
});

init();
