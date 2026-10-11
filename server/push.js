import webpush from 'web-push';

export function createPush(db, settings, subject) {
  let publicKey = settings.get('vapid_public');
  let privateKey = settings.get('vapid_private');
  if (!publicKey || !privateKey) {
    ({ publicKey, privateKey } = webpush.generateVAPIDKeys());
    settings.set('vapid_public', publicKey);
    settings.set('vapid_private', privateKey);
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const saveStmt = db.prepare(`
    INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
  `);
  const removeStmt = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');

  return {
    publicKey,

    save(userId, sub) {
      saveStmt.run(sub.endpoint, userId, sub.keys.p256dh, sub.keys.auth, Date.now());
    },

    remove(endpoint) {
      removeStmt.run(endpoint);
    },

    // El texto es discreto a propósito: se ve en la pantalla bloqueada.
    async send(userIds, payload) {
      if (!userIds.length) return;
      const placeholders = userIds.map(() => '?').join(',');
      const subs = db.prepare(`SELECT * FROM push_subscriptions WHERE user_id IN (${placeholders})`).all(...userIds);
      const body = JSON.stringify(payload);
      await Promise.all(
        subs.map((s) =>
          webpush
            .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 86400 })
            .catch((err) => {
              if (err.statusCode === 404 || err.statusCode === 410) removeStmt.run(s.endpoint);
              else console.warn(`[push] ${err.statusCode || ''} ${err.message}`);
            }),
        ),
      );
    },
  };
}
