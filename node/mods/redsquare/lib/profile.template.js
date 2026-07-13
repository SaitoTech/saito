module.exports = (profile) => {
  let p = profile.profile || {};

  return `
    <section class="profile">
      <div class="profile-card">
        <img class="profile-avatar" src="${p.avatar || '/saito/img/dreamscape.png'}" alt="${p.name || 'Profile'}" />
        <span class="profile-name">${p.name || 'Profile'}</span>
        <span class="profile-handle">@${p.handle || 'user'}</span>
        <p class="profile-bio">${p.bio || ''}</p>
        <div class="profile-stats">
          <span class="profile-stat"><strong>${p.following || 0}</strong> Following</span>
          <span class="profile-stat"><strong>${p.followers || 0}</strong> Followers</span>
        </div>
        <button class="profile-new-post saito-button-primary small" type="button">New Post</button>
        <button class="profile-view saito-button-secondary small" type="button">View profile</button>
      </div>
    </section>
  `;
};
