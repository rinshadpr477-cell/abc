const { z } = require('zod');

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid id');
const idParams = z.object({ id: objectId });

const boolString = z.enum(['true', 'false']).transform((v) => v === 'true');

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
};

const searchString = z.string().trim().max(100).optional();

module.exports = { objectId, idParams, boolString, pagination, searchString };
