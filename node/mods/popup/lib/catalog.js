class PopupCatalog {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.lessons = [];
  }

  static query() {
    return `
				SELECT lessons.id, lessons.title, lessons.content, lessons.slug, lessons.photo, lessons.username, lessons.userslug, lessons.pubdate
				FROM lessons
                   		ORDER BY lessons.pubdate DESC
			`;
  }

  load(peer, callback) {
    this.mod.sendPeerDatabaseRequestWithFilter(
      'Popup',
      PopupCatalog.query(),
      (res) => {
        if (res && res.rows) {
          this.store(res.rows);
          if (typeof callback === 'function') {
            callback();
          }
        }
      },
      (candidate) => {
        if (candidate.publicKey == peer.publicKey) {
          return 1;
        }
        return 0;
      }
    );
  }

  store(rows) {
    const seen = new Set();
    const lessons = [];
    for (let i = 0; i < rows.length; i++) {
      const lesson = rows[i];
      if (seen.has(lesson.id)) {
        continue;
      }
      seen.add(lesson.id);
      lessons.push(lesson);
    }
    lessons.sort((a, b) => String(b.pubdate || '').localeCompare(String(a.pubdate || '')));
    this.lessons = lessons;
  }

  getAll() {
    return this.lessons;
  }

  getByCategory(level = 'all') {
    if (level === 'all' || level === '' || level == null) {
      return this.lessons;
    }
    return this.lessons.filter((lesson) => lesson.userslug === level);
  }

  getById(lesson_id = null) {
    for (let i = 0; i < this.lessons.length; i++) {
      if (this.lessons[i].id == lesson_id) {
        return this.lessons[i];
      }
    }
    return {
      level: 'Unknown',
      title: 'Placeholder Title'
    };
  }

  getBySlug(userslug, slug) {
    for (let i = 0; i < this.lessons.length; i++) {
      if (this.lessons[i].userslug == userslug && this.lessons[i].slug == slug) {
        return this.lessons[i];
      }
    }
    return null;
  }
}

module.exports = PopupCatalog;
