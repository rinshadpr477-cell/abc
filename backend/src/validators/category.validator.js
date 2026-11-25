const { z } = require('zod');
const { objectId, boolString, pagination, searchString } = require('./common');

const base = {
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000),
  parent: objectId.nullable(),
  isActive: z.boolean(),
};

const create = z
  .object({
    name: base.name,
    description: base.description.optional(),
    parent: base.parent.optional(),
    isActive: base.isActive.optional(),
  })
  .strict();

const update = z
  .object({
    name: base.name.optional(),
    description: base.description.optional(),
    parent: base.parent.optional(),
    isActive: base.isActive.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

const list = z.object({
  ...pagination,
  search: searchString,
  parent: z.union([objectId, z.literal('root')]).optional(),
  isActive: boolString.optional(),
});

const tree = z.object({ includeInactive: boolString.optional() });

module.exports = { create, update, list, tree };
