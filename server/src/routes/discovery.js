import { Router } from 'express';
import { many } from '../db/pool.js';
import { buildDiscoveryQuery, parseDiscoveryParams } from '../lib/discovery.js';
import { intParam } from '../lib/validate.js';
import { forbidden } from '../lib/httpError.js';
import { asyncRoute } from '../middleware/errors.js';
import { requireAuth } from '../middleware/session.js';
import { summarizeRow } from './serializers.js';

const router = Router();

router.use(requireAuth);

function ensureReady(user) {
  if (!user.gender || !user.birth_date || user.latitude === null || !user.city) {
    throw forbidden('Complete your profile (gender, date of birth and location) to browse other members');
  }
}

async function run(req, res, { defaultSort, requireCompatibility }) {
  ensureReady(req.user);

  const params = parseDiscoveryParams(req.query, { defaultSort });
  const { text, values } = buildDiscoveryQuery(req.user, params, { requireCompatibility });
  const rows = await many(text, values);

  res.json({
    items: rows.map(summarizeRow),
    total: rows[0]?.total_count ?? 0,
    params,
  });
}

router.get(
  '/map',
  asyncRoute(async (req, res) => {
    ensureReady(req.user);

    const radius = intParam(req.query.radius, { min: 1, max: 20000, fallback: 150 });
    const params = {
      ...parseDiscoveryParams({}, { defaultSort: 'distance' }),
      direction: 'asc',
      maxDistance: radius,
      limit: 60,
    };
    const { text, values } = buildDiscoveryQuery(req.user, params, { requireCompatibility: true });
    const rows = await many(text, values);

    res.json({
      centre: { latitude: req.user.latitude, longitude: req.user.longitude, city: req.user.city },
      radiusKm: radius,
      items: rows.map((row) => ({
        ...summarizeRow(row),
        // Rounded to roughly one kilometre: precise enough to place someone in their
        // neighbourhood, never precise enough to place them at an address.
        latitude: Math.round(row.latitude * 100) / 100,
        longitude: Math.round(row.longitude * 100) / 100,
      })),
    });
  }),
);

router.get(
  '/browse',
  asyncRoute((req, res) => run(req, res, { defaultSort: 'relevance', requireCompatibility: true })),
);

router.get(
  '/search',
  asyncRoute((req, res) => run(req, res, { defaultSort: 'relevance', requireCompatibility: false })),
);

export default router;
