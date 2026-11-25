const h = require('../helpers');

let admin;
let cats;
beforeAll(() => h.connect('t_product'));
afterAll(() => h.disconnect());
beforeEach(async () => {
  await h.clearAll();
  admin = await h.createAdmin();
  const electronics = await h.mkCategory(admin, 'Electronics');
  const mobiles = await h.mkCategory(admin, 'Mobiles', electronics.id);
  const android = await h.mkCategory(admin, 'Android Phones', mobiles.id);
  const samsung = await h.mkCategory(admin, 'Samsung', android.id);
  const laptops = await h.mkCategory(admin, 'Laptops', electronics.id);
  const fashion = await h.mkCategory(admin, 'Fashion');
  cats = { electronics, mobiles, android, samsung, laptops, fashion };
});

const list = (qs = '', as) => {
  const r = h.http().get(`/api/v1/products${qs}`);
  return as ? r.set(h.auth(as)) : r;
};

describe('Products', () => {
  test('creates a product (SKU normalised) and rejects duplicate SKU', async () => {
    const p = await h.mkProduct(admin, cats.laptops.id, { sku: 'lap-1', price: 1000, salePrice: 900 });
    expect(p.sku).toBe('LAP-1');
    expect(p.effectivePrice).toBe(900);
    expect(p.onSale).toBe(true);
    const dup = await h.http().post('/api/v1/products').set(h.auth(admin)).send({ name: 'Other', sku: 'LAP-1', price: 5, stock: 1, category: cats.laptops.id });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('DUPLICATE_SKU');
  });

  test('validates price, sale price, stock and category', async () => {
    const base = { name: 'Thing', sku: 'T-1', price: 10, stock: 1, category: cats.laptops.id };
    const post = (b) => h.http().post('/api/v1/products').set(h.auth(admin)).send({ ...base, ...b });
    expect((await post({ price: -1 })).status).toBe(422);
    expect((await post({ stock: -5 })).status).toBe(422);
    expect((await post({ stock: 1.5 })).status).toBe(422);
    expect((await post({ salePrice: 20 })).status).toBe(422);
    expect((await post({ category: '507f1f77bcf86cd799439011' })).status).toBe(422);
    await h.http().patch(`/api/v1/categories/${cats.laptops.id}`).set(h.auth(admin)).send({ isActive: false });
    const inactiveCat = await post({});
    expect(inactiveCat.status).toBe(422);
    expect(inactiveCat.body.code).toBe('INACTIVE_CATEGORY');
  });

  test('update keeps effective price in sync; removing the sale price restores full price', async () => {
    const p = await h.mkProduct(admin, cats.laptops.id, { price: 100, salePrice: 80 });
    const up = await h.http().patch(`/api/v1/products/${p.id}`).set(h.auth(admin)).send({ salePrice: null });
    expect(up.body.data.effectivePrice).toBe(100);
    const bad = await h.http().patch(`/api/v1/products/${p.id}`).set(h.auth(admin)).send({ price: 50, salePrice: 60 });
    expect(bad.status).toBe(422);
  });

  test('parent category filter returns products of the category AND all descendants', async () => {
    await h.mkProduct(admin, cats.electronics.id, { name: 'Gadget' });
    await h.mkProduct(admin, cats.mobiles.id, { name: 'Phone generic' });
    await h.mkProduct(admin, cats.samsung.id, { name: 'Galaxy' });
    await h.mkProduct(admin, cats.laptops.id, { name: 'Notebook' });
    await h.mkProduct(admin, cats.fashion.id, { name: 'Shirt' });

    const names = async (id) => (await list(`?category=${id}&limit=50`)).body.data.map((p) => p.name).sort();
    expect(await names(cats.electronics.id)).toEqual(['Galaxy', 'Gadget', 'Notebook', 'Phone generic'].sort());
    expect(await names(cats.mobiles.id)).toEqual(['Galaxy', 'Phone generic']);
    expect(await names(cats.samsung.id)).toEqual(['Galaxy']);
    expect(await names(cats.fashion.id)).toEqual(['Shirt']);
  });

  test('search (name and SKU), price range, sorting and pagination work together', async () => {
    const mk = (name, sku, price, salePrice) => h.mkProduct(admin, cats.laptops.id, { name, sku, price, salePrice });
    await mk('Alpha Laptop', 'AAA-1', 500);
    await mk('Beta Laptop', 'BBB-2', 300, 250);
    await mk('Gamma Laptop', 'CCC-3', 900);
    await mk('Delta Tablet', 'DDD-4', 200);

    expect((await list('?search=laptop')).body.meta.total).toBe(3);
    expect((await list('?search=ccc')).body.data.map((p) => p.name)).toEqual(['Gamma Laptop']);
    // price filter uses the effective (sale) price: Beta is 250
    expect((await list('?minPrice=240&maxPrice=300&sortBy=name&order=asc')).body.data.map((p) => p.name)).toEqual(['Beta Laptop']);
    expect((await list('?search=laptop&minPrice=400')).body.data.map((p) => p.name).sort()).toEqual(['Alpha Laptop', 'Gamma Laptop']);

    const byPrice = await list('?sortBy=price&order=asc');
    expect(byPrice.body.data.map((p) => p.effectivePrice)).toEqual([200, 250, 500, 900]);
    const byName = await list('?sortBy=name&order=desc');
    expect(byName.body.data.map((p) => p.name)).toEqual(['Gamma Laptop', 'Delta Tablet', 'Beta Laptop', 'Alpha Laptop']);

    const p1 = await list('?sortBy=name&order=asc&limit=3&page=1');
    const p2 = await list('?sortBy=name&order=asc&limit=3&page=2');
    expect(p1.body.data).toHaveLength(3);
    expect(p2.body.data).toHaveLength(1);
    expect(p1.body.meta).toMatchObject({ total: 4, totalPages: 2, hasNextPage: true });
    expect((await list('?minPrice=500&maxPrice=100')).status).toBe(422);
  });

  test('customers never see inactive products or products in inactive categories; admins do', async () => {
    const active = await h.mkProduct(admin, cats.laptops.id, { name: 'Visible' });
    const hidden = await h.mkProduct(admin, cats.laptops.id, { name: 'Hidden', status: 'INACTIVE' });
    const inFashion = await h.mkProduct(admin, cats.fashion.id, { name: 'Shirt' });
    await h.http().patch(`/api/v1/categories/${cats.fashion.id}`).set(h.auth(admin)).send({ isActive: false });

    const customer = await h.registerCustomer();
    const asCustomer = (await list('', customer)).body.data.map((p) => p.name);
    expect(asCustomer).toEqual(['Visible']);
    expect((await list()).body.data.map((p) => p.name)).toEqual(['Visible']); // anonymous
    expect((await list('?status=INACTIVE', customer)).body.data.map((p) => p.name)).toEqual(['Visible']); // filter ignored

    expect((await h.http().get(`/api/v1/products/${hidden.id}`).set(h.auth(customer))).status).toBe(404);
    expect((await h.http().get(`/api/v1/products/${inFashion.id}`).set(h.auth(customer))).status).toBe(404);
    expect((await h.http().get(`/api/v1/products/${active.id}`).set(h.auth(customer))).status).toBe(200);

    const asAdmin = (await list('?limit=50', admin)).body.data.map((p) => p.name).sort();
    expect(asAdmin).toEqual(['Hidden', 'Shirt', 'Visible']);
    expect((await list('?status=INACTIVE', admin)).body.data.map((p) => p.name)).toEqual(['Hidden']);
  });

  test('out-of-stock products stay visible but flagged; inStock=true hides them', async () => {
    await h.mkProduct(admin, cats.laptops.id, { name: 'Gone', stock: 0 });
    await h.mkProduct(admin, cats.laptops.id, { name: 'Here', stock: 3 });
    const all = (await list('?sortBy=name&order=asc')).body.data;
    expect(all.map((p) => [p.name, p.inStock])).toEqual([['Gone', false], ['Here', true]]);
    expect((await list('?inStock=true')).body.data.map((p) => p.name)).toEqual(['Here']);
  });

  test('delete removes unused products but only deactivates ordered ones', async () => {
    const unused = await h.mkProduct(admin, cats.laptops.id);
    const used = await h.mkProduct(admin, cats.laptops.id);
    const customer = await h.registerCustomer();
    await h.http().post('/api/v1/orders').set(h.auth(customer)).send({ items: [{ productId: used.id, quantity: 1 }] });

    const d1 = await h.http().delete(`/api/v1/products/${unused.id}`).set(h.auth(admin));
    expect(d1.body.data).toEqual({ deleted: true, deactivated: false });
    const d2 = await h.http().delete(`/api/v1/products/${used.id}`).set(h.auth(admin));
    expect(d2.body.data).toEqual({ deleted: false, deactivated: true });
    expect((await h.http().get(`/api/v1/products/${used.id}`).set(h.auth(admin))).body.data.status).toBe('INACTIVE');
  });
});
