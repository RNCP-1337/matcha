import { one } from '../db/pool.js';
import { sendToUser } from '../realtime/hub.js';

export async function pushNotification(userId, actorId, type) {
  if (userId === actorId) return null;

  const notification = await one(
    `WITH inserted AS (
       INSERT INTO notifications (user_id, actor_id, type) VALUES ($1, $2, $3) RETURNING *
     )
     SELECT i.id, i.type, i.created_at, i.read_at,
            u.id AS actor_id, u.username AS actor_username,
            p.filename AS actor_photo
       FROM inserted i
       LEFT JOIN users u ON u.id = i.actor_id
       LEFT JOIN photos p ON p.id = u.profile_photo_id`,
    [userId, actorId, type],
  );

  sendToUser(userId, { type: 'notification', notification });
  return notification;
}
