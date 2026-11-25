const { z } = require('zod');
const { boolString, pagination, searchString } = require('./common');

const list = z.object({
  ...pagination,
  search: searchString,
  role: z.enum(['ADMIN', 'CUSTOMER']).optional(),
  isActive: boolString.optional(),
});
const setStatus = z.object({ isActive: z.boolean() }).strict();

module.exports = { list, setStatus };
