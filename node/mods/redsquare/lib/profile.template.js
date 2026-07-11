module.exports = (profile) => {
  let p = profile.profile || {};

  return `
    <section class="profile">
      <h3 class="profile-title">Your profile</h3>
      <div class="profile-card">
        <img class="profile-avatar" src="${p.avatar || '/saito/img/dreamscape.png'}" alt="${p.name || 'Profile'}" />
        <div class="profile-info">
          <span class="profile-name">${p.name || 'Profile'}</span>
          <span class="profile-handle">@${p.handle || 'user'}</span>
        </div>
        <p class="profile-bio">${p.bio || ''}</p>
        <div class="profile-stats">
          <span><strong>${p.following || 0}</strong> Following</span>
          <span><strong>${p.followers || 0}</strong> Followers</span>
        </div>
        <button class="profile-view" type="button">View profile</button>
      </div>
    </section>
  `;
};
