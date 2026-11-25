const { z } = require('zod');
const { objectId, pagination, searchString } = require('./common');

const STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

// Only ids and quantities are accepted. Prices/totals/names sent by the client are rejected.
const create = z
  .object({
    items: z
      .array(z.object({ productId: objectId, quantity: z.number().int().min(1).max(1000) }).strict())
      .min(1, 'At least one item is required')
      .max(50, 'At most 50 distinct items per order'),
  })
  .strict();

const idempotencyHeader = z.object({
  'idempotency-key': z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/).optional(),
});

const list = z.object({ ...pagination, status: z.enum(STATUSES).optional() });
const adminList = z.object({ ...pagination, status: z.enum(STATUSES).optional(), search: searchString });
const updateStatus = z.object({ status: z.enum(STATUSES), note: z.string().trim().max(500).optional() }).strict();

module.exports = { create, list, adminList, updateStatus, idempotencyHeader };
