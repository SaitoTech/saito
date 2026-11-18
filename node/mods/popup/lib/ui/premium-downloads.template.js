const PREMIUM_TYPE = 'popup-premium';

function box(owns_premium) {
  const copy = owns_premium
    ? 'Download the complete lesson archive, including audio and transcripts.'
    : 'Get the complete Popup Chinese collection for offline access. Support the project and download all our lessons, audio and transcripts.';
  const button = owns_premium ? 'Access Downloads' : 'Learn More';

  return `
    <section class="popup-premium" data-premium="${owns_premium ? '1' : '0'}">
      <h2 class="popup-premium-title">Popup Chinese Premium</h2>
      <p class="popup-premium-copy">${copy}</p>
      <button type="button" class="popup-premium-open">${button}</button>
    </section>
  `;
}

function overlay(owns_premium, downloads) {
  if (owns_premium) {
    const groups = downloads || [];
    let links = '';
    if (!groups.length) {
      links = `
        <p class="popup-premium-note">No downloadable archive is included with this installation. Lesson pages still play each lesson's audio from the site. A packaged collection of audio and transcripts is not in the Popup Chinese module.</p>
      `;
    } else {
      links = groups
        .map((group) => {
          const items = group.files
            .map(
              (file) =>
                `<li><a href="${file.href}">${file.title}</a><span>${file.detail}</span></li>`
            )
            .join('');
          return `<h3>${group.title}</h3><ul class="popup-premium-files">${items}</ul>`;
        })
        .join('');
    }
    return `
      <div class="popup-premium-overlay">
        <h2>Your Premium Downloads</h2>
        ${links}
      </div>
    `;
  }

  return `
    <div class="popup-premium-overlay">
      <h2>Unlock the Popup Chinese Archive</h2>
      <p>Get downloadable access to our complete collection of Mandarin lessons, audio, transcripts and learning materials.</p>
      <p>Your purchase supports the continued development of Popup Chinese while helping preserve this collection for offline learning.</p>
      <p class="popup-premium-note">The lessons on this site stay free. Premium adds the download archive. It is not required to study here.</p>
      <a class="popup-premium-store" href="/store?type=${PREMIUM_TYPE}">Get Premium on the Saito Store</a>
    </div>
  `;
}

module.exports = { box, overlay, PREMIUM_TYPE };
