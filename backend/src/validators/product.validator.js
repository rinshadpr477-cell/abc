const { z } = require('zod');
const { objectId, boolString, pagination, searchString } = require('./common');

const money = z.number().min(0).max(100000000).multipleOf(0.01);

const fields = {
  name: z.string().trim().min(2).max(200),
  sku: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9._-]+$/, 'SKU may contain letters, digits, ".", "_" and "-"'),
  description: z.string().trim().max(5000),
  price: money,
  salePrice: money.nullable(),
  stock: z.number().int().min(0).max(10000000),
  category: objectId,
  status: z.enum(['ACTIVE', 'INACTIVE']),
};

const salePriceBelowPrice = (v) => v.salePrice == null || v.price == null || v.salePrice < v.price;
const saleMsg = { path: ['salePrice'], message: 'salePrice must be lower than price' };

const create = z
  .object({
    name: fields.name,
    sku: fields.sku,
    description: fields.description.optional(),
    price: fields.price,
    salePrice: fields.salePrice.optional(),
    stock: fields.stock,
    category: fields.category,
    status: fields.status.optional(),
  })
  .strict()
  .refine(salePriceBelowPrice, saleMsg);

const update = z
  .object({
    name: fields.name.optional(),
    sku: fields.sku.optional(),
    description: fields.description.optional(),
    price: fields.price.optional(),
    salePrice: fields.salePrice.optional(),
    stock: fields.stock.optional(),
    category: fields.category.optional(),
    status: fields.status.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update')
  .refine(salePriceBelowPrice, saleMsg);

const list = z
  .object({
    ...pagination,
    search: searchString,
    category: objectId.optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    sortBy: z.enum(['price', 'name', 'createdAt']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
    // Admin-only filters (ignored/forced for customers):
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    inStock: boolString.optional(),
  })
  .refine((v) => v.minPrice == null || v.maxPrice == null || v.minPrice <= v.maxPrice, {
    path: ['minPrice'],
    message: 'minPrice must not exceed maxPrice',
  });

module.exports = { create, update, list };
