import { many, one } from '../db/pool.js';
import { ageFrom } from '../lib/validate.js';

export async function userTags(userId) {
  const rows = await many(
    'SELECT t.name FROM user_tags ut JOIN tags t ON t.id = ut.tag_id WHERE ut.user_id = $1 ORDER BY t.name',
    [userId],
  );
  return rows.map((row) => row.name);
}

export async function userPhotos(userId) {
  return many(
    'SELECT id, filename, created_at FROM photos WHERE user_id = $1 ORDER BY position, id',
    [userId],
  );
}

function profileCompletion(user, photoCount) {
  return Boolean(user.gender && user.birth_date && user.city && user.profile_photo_id && photoCount > 0);
}

export async function publicSelf(user) {
  const [tags, photos, profilePhoto] = await Promise.all([
    userTags(user.id),
    userPhotos(user.id),
    user.profile_photo_id ? one('SELECT filename FROM photos WHERE id = $1', [user.profile_photo_id]) : null,
  ]);

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    gender: user.gender,
    sexualPreference: user.sexual_preference,
    biography: user.biography,
    birthDate: user.birth_date,
    age: user.birth_date ? ageFrom(user.birth_date) : null,
    city: user.city,
    country: user.country,
    latitude: user.latitude,
    longitude: user.longitude,
    locationSource: user.location_source,
    fameRating: user.fame_rating,
    isVerified: user.is_verified,
    profilePhoto: profilePhoto?.filename || null,
    profilePhotoId: user.profile_photo_id,
    photos,
    tags,
    profileComplete: profileCompletion(user, photos.length),
    createdAt: user.created_at,
  };
}

export function summarizeRow(row) {
  return {
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    gender: row.gender,
    sexualPreference: row.sexual_preference,
    biography: row.biography,
    age: row.age ?? (row.birth_date ? ageFrom(row.birth_date) : null),
    city: row.city,
    country: row.country,
    fameRating: row.fame_rating,
    isOnline: row.is_online,
    lastSeen: row.last_seen,
    photo: row.photo || null,
    distanceKm: row.distance_km == null ? null : Math.round(row.distance_km * 10) / 10,
    commonTags: row.common_tags ?? null,
    iLiked: row.i_liked ?? null,
    likesMe: row.likes_me ?? null,
  };
}
