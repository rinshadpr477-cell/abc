const h = require('../helpers');

const { Product, Order } = h.models;
let admin;
let cat;
beforeAll(() => h.connect('t_order'));
afterAll(() => h.disconnect());
beforeEach(async () => {
  await h.clearAll();
  admin = await h.createAdmin();
  cat = await h.mkCategory(admin, 'Gadgets');
});

const place = (who, items, key) => {
  const r = h.http().post('/api/v1/orders').set(h.auth(who));
  if (key) r.set('Idempotency-Key', key);
  return r.send({ items });
};
const stockOf = async (id) => (await Product.findById(id)).stock;
const setStatus = (id, status) => h.http().patch(`/api/v1/admin/orders/${id}/status`).set(h.auth(admin)).send({ status });

describe('Order creation', () => {
  test('multi-product order: backend computes prices, sale price and totals; stock is reduced', async () => {
    const a = await h.mkProduct(admin, cat.id, { name: 'Item A', price: 100, stock: 10 });
    const b = await h.mkProduct(admin, cat.id, { name: 'Item B', price: 50, salePrice: 40, stock: 5 });
    const c = await h.registerCustomer();
    const res = await place(c, [{ productId: a.id, quantity: 2 }, { productId: b.id, quantity: 3 }]);
    expect(res.status).toBe(201);
    const o = res.body.data;
    expect(o.orderNumber).toMatch(/^ORD-\d{8}-[0-9A-F]{8}$/);
    expect(o.status).toBe('PENDING');
    const byName = Object.fromEntries(o.items.map((i) => [i.name, i]));
    expect(byName['Item A']).toMatchObject({ unitPrice: 100, quantity: 2, lineTotal: 200, sku: a.sku });
    expect(byName['Item B']).toMatchObject({ unitPrice: 40, quantity: 3, lineTotal: 120 });
    expect(o.subtotal).toBe(320);
    expect(o.total).toBe(320);
    expect(await stockOf(a.id)).toBe(8);
    expect(await stockOf(b.id)).toBe(2);
  });

  test('client-supplied prices, totals and names are rejected', async () => {
    const a = await h.mkProduct(admin, cat.id, { price: 100 });
    const c = await h.registerCustomer();
    const res = await place(c, [{ productId: a.id, quantity: 1, price: 1 }]);
    expect(res.status).toBe(422);
    const res2 = await h.http().post('/api/v1/orders').set(h.auth(c)).send({ items: [{ productId: a.id, quantity: 1 }], total: 1 });
    expect(res2.status).toBe(422);
    expect(await stockOf(a.id)).toBe(10);
  });

  test('order snapshots survive later product edits', async () => {
    const a = await h.mkProduct(admin, cat.id, { name: 'Old name', price: 100 });
    const c = await h.registerCustomer();
    const o = (await place(c, [{ productId: a.id, quantity: 1 }])).body.data;
    await h.http().patch(`/api/v1/products/${a.id}`).set(h.auth(admin)).send({ name: 'New name', price: 999 });
    const again = await h.http().get(`/api/v1/orders/${o.id}`).set(h.auth(c));
    expect(again.body.data.items[0]).toMatchObject({ name: 'Old name', unitPrice: 100 });
  });

  test('insufficient stock, inactive product, unknown product and merged duplicate lines', async () => {
    const a = await h.mkProduct(admin, cat.id, { stock: 3 });
    const inactive = await h.mkProduct(admin, cat.id, { status: 'INACTIVE' });
    const c = await h.registerCustomer();

    const tooMany = await place(c, [{ productId: a.id, quantity: 4 }]);
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.code).toBe('INSUFFICIENT_STOCK');
    expect((await place(c, [{ productId: inactive.id, quantity: 1 }])).body.code).toBe('PRODUCT_UNAVAILABLE');
    expect((await place(c, [{ productId: '507f1f77bcf86cd799439011', quantity: 1 }])).body.code).toBe('PRODUCT_NOT_FOUND');
    // 2 + 2 of the same product = 4 > 3
    expect((await place(c, [{ productId: a.id, quantity: 2 }, { productId: a.id, quantity: 2 }])).status).toBe(409);
    expect(await stockOf(a.id)).toBe(3);
    expect(await Order.countDocuments()).toBe(0);
  });

  test('a failure on a later line rolls back stock already decremented for earlier lines', async () => {
    const a = await h.mkProduct(admin, cat.id, { stock: 5 });
    const b = await h.mkProduct(admin, cat.id, { stock: 1 });
    const c = await h.registerCustomer();
    const [first, second] = [a, b].sort((x, y) => x.id.localeCompare(y.id)); // lines are processed in id order
    const res = await place(c, [{ productId: first.id, quantity: 1 }, { productId: second.id, quantity: 99 }]);
    expect(res.status).toBe(409);
    expect(await stockOf(a.id)).toBe(5);
    expect(await stockOf(b.id)).toBe(1);
    expect(await Order.countDocuments()).toBe(0);
  });

  test('a failure while creating the order document rolls back the stock decrement', async () => {
    const a = await h.mkProduct(admin, cat.id, { stock: 5 });
    const c = await h.registerCustomer();
    const spy = vi.spyOn(Order, 'create').mockRejectedValueOnce(new Error('boom'));
    const res = await place(c, [{ productId: a.id, quantity: 2 }]);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await stockOf(a.id)).toBe(5);
  });

  test('concurrent orders cannot oversell', async () => {
    const a = await h.mkProduct(admin, cat.id, { stock: 5 });
    const customers = await Promise.all(Array.from({ length: 12 }, () => h.registerCustomer()));
    const results = await Promise.all(customers.map((c) => place(c, [{ productId: a.id, quantity: 1 }])));
    const ok = results.filter((r) => r.status === 201).length;
    const failed = results.filter((r) => r.status === 409).length;
    expect(ok).toBe(5);
    expect(failed).toBe(7);
    expect(await stockOf(a.id)).toBe(0);
    expect(await Order.countDocuments()).toBe(5);
  });

  test('concurrent multi-product orders stay consistent (no negative stock, stock + sold = initial)', async () => {
    const a = await h.mkProduct(admin, cat.id, { stock: 7 });
    const b = await h.mkProduct(admin, cat.id, { stock: 7 });
    const customers = await Promise.all(Array.from({ length: 8 }, () => h.registerCustomer()));
    const results = await Promise.all(
      customers.map((c, i) =>
        place(c, i % 2 ? [{ productId: a.id, quantity: 2 }, { productId: b.id, quantity: 1 }] : [{ productId: b.id, quantity: 2 }, { productId: a.id, quantity: 1 }])
      )
    );
    results.forEach((r) => expect([201, 409]).toContain(r.status));
    const orders = await Order.find();
    const sold = (id) => orders.flatMap((o) => o.items).filter((i) => String(i.product) === id).reduce((s, i) => s + i.quantity, 0);
    expect(await stockOf(a.id)).toBe(7 - sold(a.id));
    expect(await stockOf(b.id)).toBe(7 - sold(b.id));
    expect(await stockOf(a.id)).toBeGreaterThanOrEqual(0);
    expect(await stockOf(b.id)).toBeGreaterThanOrEqual(0);
  });

  test('duplicate submission with the same Idempotency-Key creates one order and one decrement', async () => {
    const a = await h.mkProduct(admin, cat.id, { stock: 10 });
    const c = await h.registerCustomer();
    const key = 'checkout-key-0001';
    const first = await place(c, [{ productId: a.id, quantity: 2 }], key);
    const second = await place(c, [{ productId: a.id, quantity: 2 }], key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await Order.countDocuments()).toBe(1);
    expect(await stockOf(a.id)).toBe(8);
  });

  test('simultaneous duplicate submissions (same key) collapse to one order', async () => {
    const a = await h.mkProduct(admin, cat.id, { stock: 10 });
    const c = await h.registerCustomer();
    const results = await Promise.all(Array.from({ length: 5 }, () => place(c, [{ productId: a.id, quantity: 1 }], 'race-key-00001')));
    results.forEach((r) => expect([200, 201]).toContain(r.status));
    expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
    expect(await Order.countDocuments()).toBe(1);
    expect(await stockOf(a.id)).toBe(9);
  });

  test('admins cannot place orders', async () => {
    const a = await h.mkProduct(admin, cat.id);
    expect((await place(admin, [{ productId: a.id, quantity: 1 }])).status).toBe(403);
  });
});

describe('Order access', () => {
  test('customers see only their own orders; admins see all', async () => {
    const a = await h.mkProduct(admin, cat.id);
    const c1 = await h.registerCustomer('One');
    const c2 = await h.registerCustomer('Two');
    const o1 = (await place(c1, [{ productId: a.id, quantity: 1 }])).body.data;
    await place(c2, [{ productId: a.id, quantity: 1 }]);

    const mine = await h.http().get('/api/v1/orders/my-orders').set(h.auth(c1));
    expect(mine.body.data.map((o) => o.id)).toEqual([o1.id]);
    expect((await h.http().get(`/api/v1/orders/${o1.id}`).set(h.auth(c2))).status).toBe(404);
    expect((await h.http().get(`/api/v1/orders/${o1.id}`).set(h.auth(c1))).status).toBe(200);
    expect((await h.http().get(`/api/v1/orders/${o1.id}`).set(h.auth(admin))).status).toBe(200);

    const all = await h.http().get('/api/v1/admin/orders').set(h.auth(admin));
    expect(all.body.meta.total).toBe(2);
    expect(all.body.data[0].customer).toHaveProperty('email');
    expect((await h.http().get('/api/v1/admin/orders').set(h.auth(c1))).status).toBe(403);
    expect((await h.http().get('/api/v1/admin/orders?search=Two').set(h.auth(admin))).body.meta.total).toBe(1);
  });

  test('a customer cannot change status directly or cancel someone else\'s order', async () => {
    const a = await h.mkProduct(admin, cat.id);
    const c1 = await h.registerCustomer();
    const c2 = await h.registerCustomer();
    const o = (await place(c1, [{ productId: a.id, quantity: 1 }])).body.data;
    const direct = await h.http().patch(`/api/v1/admin/orders/${o.id}/status`).set(h.auth(c1)).send({ status: 'DELIVERED' });
    expect(direct.status).toBe(403);
    expect((await h.http().patch(`/api/v1/orders/${o.id}/cancel`).set(h.auth(c2))).status).toBe(404);
    expect((await Order.findById(o.id)).status).toBe('PENDING');
  });
});

describe('Order status workflow', () => {
  async function pending(stock = 10, qty = 3) {
    const a = await h.mkProduct(admin, cat.id, { stock });
    const c = await h.registerCustomer();
    const o = (await place(c, [{ productId: a.id, quantity: qty }])).body.data;
    return { a, c, o };
  }

  test('walks the happy path PENDING → … → DELIVERED and records history', async () => {
    const { o } = await pending();
    for (const s of ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED']) {
      const res = await setStatus(o.id, s);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(s);
    }
    const final = await Order.findById(o.id);
    expect(final.statusHistory.map((x) => x.status)).toEqual(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED']);
  });

  test('rejects skipping steps, going backwards and leaving terminal states', async () => {
    const { o } = await pending();
    expect((await setStatus(o.id, 'SHIPPED')).body.code).toBe('INVALID_TRANSITION');
    expect((await setStatus(o.id, 'DELIVERED')).status).toBe(409);
    await setStatus(o.id, 'CONFIRMED');
    expect((await setStatus(o.id, 'PENDING')).status).toBe(409);
    expect((await setStatus(o.id, 'CONFIRMED')).status).toBe(409);
    await setStatus(o.id, 'PROCESSING');
    await setStatus(o.id, 'SHIPPED');
    expect((await setStatus(o.id, 'CANCELLED')).status).toBe(409); // too late to cancel
    await setStatus(o.id, 'DELIVERED');
    expect((await setStatus(o.id, 'CANCELLED')).status).toBe(409);
  });

  test('cancellation restores stock exactly once', async () => {
    const { a, o } = await pending(10, 3);
    expect(await stockOf(a.id)).toBe(7);
    expect((await setStatus(o.id, 'CANCELLED')).status).toBe(200);
    expect(await stockOf(a.id)).toBe(10);
    expect((await setStatus(o.id, 'CANCELLED')).status).toBe(409);
    expect(await stockOf(a.id)).toBe(10);
  });

  test('concurrent cancellations restore stock only once', async () => {
    const { a, c, o } = await pending(10, 4);
    const attempts = await Promise.all([
      setStatus(o.id, 'CANCELLED'),
      setStatus(o.id, 'CANCELLED'),
      h.http().patch(`/api/v1/orders/${o.id}/cancel`).set(h.auth(c)),
      h.http().patch(`/api/v1/orders/${o.id}/cancel`).set(h.auth(c)),
    ]);
    expect(attempts.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await stockOf(a.id)).toBe(10);
  });

  test('customer may cancel while PENDING only', async () => {
    const first = await pending(10, 2);
    const ok = await h.http().patch(`/api/v1/orders/${first.o.id}/cancel`).set(h.auth(first.c));
    expect(ok.status).toBe(200);
    expect(await stockOf(first.a.id)).toBe(10);

    const second = await pending(10, 2);
    await setStatus(second.o.id, 'CONFIRMED');
    const late = await h.http().patch(`/api/v1/orders/${second.o.id}/cancel`).set(h.auth(second.c));
    expect(late.status).toBe(403);
    expect(await stockOf(second.a.id)).toBe(8);
  });

  test('dashboard stats come from real data and exclude cancelled orders from revenue', async () => {
    const { o } = await pending(10, 2); // total 200
    await pending(10, 1); // total 100
    await setStatus(o.id, 'CANCELLED');
    const res = await h.http().get('/api/v1/admin/dashboard/stats').set(h.auth(admin));
    expect(res.body.data).toMatchObject({
      totalCustomers: 2, activeCustomers: 2, totalProducts: 2, activeProducts: 2,
      totalCategories: 1, totalOrders: 2, pendingOrders: 1, revenue: 100,
    });
  });
});

