const h = require('../helpers');

const { Category, Product, Order } = h.models;

let admin;
beforeAll(() => h.connect('t_hardening'));
afterAll(() => h.disconnect());
beforeEach(async () => {
  await h.clearAll();
  admin = await h.createAdmin();
});

const patchCat = (id, body) => h.http().patch(`/api/v1/categories/${id}`).set(h.auth(admin)).send(body);
const delCat = (id) => h.http().delete(`/api/v1/categories/${id}`).set(h.auth(admin));
const postProduct = (category, n) => h.http().post('/api/v1/products').set(h.auth(admin)).send({ name: `Race Product ${n}`, sku: `RACE-${n}-${Date.now()}`, price: 10, stock: 5, category });
const place = (who, items, key) => {
  const r = h.http().post('/api/v1/orders').set(h.auth(who));
  if (key) r.set('Idempotency-Key', key);
  return r.send({ items });
};

/** Every category's stored ancestors/level must equal what its parent chain implies, and there must be no cycle. */
async function assertHierarchyConsistent() {
  const all = await Category.find().lean();
  const byId = new Map(all.map((c) => [String(c._id), c]));
  for (const c of all) {
    const chain = [];
    const seen = new Set([String(c._id)]);
    let cur = c;
    while (cur.parent) {
      const pid = String(cur.parent);
      if (seen.has(pid)) throw new Error(`cycle detected through ${c.name}`);
      seen.add(pid);
      const p = byId.get(pid);
      if (!p) throw new Error(`${c.name} points at a missing parent`);
      chain.unshift(pid);
      cur = p;
    }
    expect(c.ancestors.map(String)).toEqual(chain);
    expect(c.level).toBe(chain.length);
  }
}

describe('concurrent category moves never create a cycle', () => {
  test('A under B and B under A at the same time: at most one succeeds (repeated)', async () => {
    for (let i = 0; i < 8; i++) {
      const A = await h.mkCategory(admin, `Alpha ${i}`);
      const B = await h.mkCategory(admin, `Beta ${i}`);
      const [r1, r2] = await Promise.all([patchCat(A.id, { parent: B.id }), patchCat(B.id, { parent: A.id })]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([200, 422]);
      const loser = r1.status === 422 ? r1 : r2;
      expect(loser.body.code).toBe('CIRCULAR_PARENT');
      await assertHierarchyConsistent();
    }
  });

  test('deep variant: A under B\'s child while B goes under A\'s child (subtree rewrites collide)', async () => {
    for (let i = 0; i < 5; i++) {
      const A = await h.mkCategory(admin, `Deep A ${i}`);
      const A1 = await h.mkCategory(admin, `Deep A1 ${i}`, A.id);
      const A2 = await h.mkCategory(admin, `Deep A2 ${i}`, A1.id);
      const B = await h.mkCategory(admin, `Deep B ${i}`);
      const B1 = await h.mkCategory(admin, `Deep B1 ${i}`, B.id);
      const [r1, r2] = await Promise.all([patchCat(A.id, { parent: B1.id }), patchCat(B.id, { parent: A2.id })]);
      expect([r1.status, r2.status].sort()).toEqual([200, 422]);
      await assertHierarchyConsistent();
    }
  });

  test('non-conflicting concurrent moves both succeed and levels stay correct (no global lock)', async () => {
    const root1 = await h.mkCategory(admin, 'Root One');
    const root2 = await h.mkCategory(admin, 'Root Two');
    const x = await h.mkCategory(admin, 'X');
    const y = await h.mkCategory(admin, 'Y');
    const x1 = await h.mkCategory(admin, 'X1', x.id);
    const [r1, r2] = await Promise.all([patchCat(x.id, { parent: root1.id }), patchCat(y.id, { parent: root2.id })]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect((await Category.findById(x1.id)).level).toBe(2);
    await assertHierarchyConsistent();
  });

  test('a rejected circular move leaves the tree and descendant queries intact', async () => {
    const A = await h.mkCategory(admin, 'Top');
    const B = await h.mkCategory(admin, 'Mid', A.id);
    const C = await h.mkCategory(admin, 'Leaf', B.id);
    const bad = await patchCat(A.id, { parent: C.id });
    expect(bad.status).toBe(422);
    await assertHierarchyConsistent();
    const d = await h.http().get(`/api/v1/categories/${A.id}/descendants`).set(h.auth(admin));
    expect(d.body.data.map((x) => x.name).sort()).toEqual(['Leaf', 'Mid']);
  });
});

describe('deletion and assignment races leave no orphans', () => {
  test('deleting a category while a product is being assigned to it: never both succeed', async () => {
    for (let i = 0; i < 8; i++) {
      const cat = await h.mkCategory(admin, `Race Cat ${i}`);
      const [del, prod] = await Promise.all([delCat(cat.id), postProduct(cat.id, i)]);
      const outcomes = `${del.status}/${prod.status}`;
      expect(['200/422', '409/201']).toContain(outcomes);
      // invariant: no product points at a category that no longer exists
      const products = await Product.find().lean();
      for (const p of products) expect(await Category.exists({ _id: p.category })).toBeTruthy();
    }
  });

  test('deleting a category while a child is being created under it: never both succeed', async () => {
    for (let i = 0; i < 8; i++) {
      const parent = await h.mkCategory(admin, `Parent ${i}`);
      const [del, child] = await Promise.all([
        delCat(parent.id),
        h.http().post('/api/v1/categories').set(h.auth(admin)).send({ name: `Child ${i}`, parent: parent.id }),
      ]);
      expect(['200/422', '409/201']).toContain(`${del.status}/${child.status}`);
      for (const c of await Category.find({ parent: { $ne: null } }).lean()) expect(await Category.exists({ _id: c.parent })).toBeTruthy();
    }
  });

  test('moving a product into a category that is being deleted is rejected or blocks the delete', async () => {
    const source = await h.mkCategory(admin, 'Source');
    const target = await h.mkCategory(admin, 'Target');
    const p = await h.mkProduct(admin, source.id);
    const [del, move] = await Promise.all([
      delCat(target.id),
      h.http().patch(`/api/v1/products/${p.id}`).set(h.auth(admin)).send({ category: target.id }),
    ]);
    expect(['200/422', '409/200']).toContain(`${del.status}/${move.status}`);
    const stored = await Product.findById(p.id).lean();
    expect(await Category.exists({ _id: stored.category })).toBeTruthy();
  });

  test('deleting an ordered product while an order is placed: the order never references a missing product', async () => {
    for (let i = 0; i < 6; i++) {
      await h.clearAll();
      admin = await h.createAdmin();
      const cat = await h.mkCategory(admin, 'Gadgets');
      const p = await h.mkProduct(admin, cat.id, { stock: 5 });
      const customer = await h.registerCustomer();
      const [del, order] = await Promise.all([
        h.http().delete(`/api/v1/products/${p.id}`).set(h.auth(admin)),
        place(customer, [{ productId: p.id, quantity: 1 }]),
      ]);
      expect(del.status).toBe(200);
      if (order.status === 201) {
        // order won: the product must still exist (deactivated), so history stays valid
        expect(del.body.data).toEqual({ deleted: false, deactivated: true });
        expect(await Product.exists({ _id: p.id })).toBeTruthy();
      } else {
        // delete won: the order was refused and nothing was created
        expect(order.status).toBe(422);
        expect(await Order.countDocuments()).toBe(0);
      }
    }
  });

  test('historical orders keep their snapshots after the product is deactivated, and stock is untouched by the delete', async () => {
    const cat = await h.mkCategory(admin, 'Hist');
    const p = await h.mkProduct(admin, cat.id, { name: 'Old Widget', price: 12, stock: 4 });
    const customer = await h.registerCustomer();
    const o = (await place(customer, [{ productId: p.id, quantity: 2 }])).body.data;
    const del = await h.http().delete(`/api/v1/products/${p.id}`).set(h.auth(admin));
    expect(del.body.data).toEqual({ deleted: false, deactivated: true });
    const again = await h.http().get(`/api/v1/orders/${o.id}`).set(h.auth(customer));
    expect(again.body.data.items[0]).toMatchObject({ name: 'Old Widget', unitPrice: 12, quantity: 2 });
    expect((await Product.findById(p.id)).stock).toBe(2);
  });
});

describe('Idempotency-Key payload validation', () => {
  let cat;
  beforeEach(async () => {
    cat = await h.mkCategory(admin, 'Idem');
  });

  test('same key + same cart (reordered / split lines) returns the original order once', async () => {
    const a = await h.mkProduct(admin, cat.id, { stock: 10 });
    const b = await h.mkProduct(admin, cat.id, { stock: 10 });
    const c = await h.registerCustomer();
    const first = await place(c, [{ productId: a.id, quantity: 2 }, { productId: b.id, quantity: 1 }], 'idem-key-same-01');
    expect(first.status).toBe(201);
    const reordered = await place(c, [{ productId: b.id, quantity: 1 }, { productId: a.id, quantity: 1 }, { productId: a.id, quantity: 1 }], 'idem-key-same-01');
    expect(reordered.status).toBe(200);
    expect(reordered.body.data.id).toBe(first.body.data.id);
    const upper = await place(c, [{ productId: a.id.toUpperCase(), quantity: 2 }, { productId: b.id, quantity: 1 }], 'idem-key-same-01');
    expect(upper.status).toBe(200);
    expect(await Order.countDocuments()).toBe(1);
    expect((await Product.findById(a.id)).stock).toBe(8);
  });

  test('same key + different quantity or product is rejected with 409 and changes nothing', async () => {
    const a = await h.mkProduct(admin, cat.id, { stock: 10 });
    const b = await h.mkProduct(admin, cat.id, { stock: 10 });
    const c = await h.registerCustomer();
    expect((await place(c, [{ productId: a.id, quantity: 2 }], 'idem-key-diff-01')).status).toBe(201);
    const qty = await place(c, [{ productId: a.id, quantity: 3 }], 'idem-key-diff-01');
    expect(qty.status).toBe(409);
    expect(qty.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const other = await place(c, [{ productId: b.id, quantity: 2 }], 'idem-key-diff-01');
    expect(other.status).toBe(409);
    const extra = await place(c, [{ productId: a.id, quantity: 2 }, { productId: b.id, quantity: 1 }], 'idem-key-diff-01');
    expect(extra.status).toBe(409);
    expect(await Order.countDocuments()).toBe(1);
    expect((await Product.findById(a.id)).stock).toBe(8);
    expect((await Product.findById(b.id)).stock).toBe(10);
  });

  test('the same key used by a different customer is independent', async () => {
    const a = await h.mkProduct(admin, cat.id, { stock: 10 });
    const c1 = await h.registerCustomer();
    const c2 = await h.registerCustomer();
    expect((await place(c1, [{ productId: a.id, quantity: 1 }], 'shared-key-0001')).status).toBe(201);
    expect((await place(c2, [{ productId: a.id, quantity: 4 }], 'shared-key-0001')).status).toBe(201);
    expect(await Order.countDocuments()).toBe(2);
  });

  test('concurrent requests with the same key and the same cart collapse to one order', async () => {
    const a = await h.mkProduct(admin, cat.id, { stock: 10 });
    const c = await h.registerCustomer();
    const results = await Promise.all(Array.from({ length: 5 }, () => place(c, [{ productId: a.id, quantity: 2 }], 'idem-key-race-01')));
    results.forEach((r) => expect([200, 201]).toContain(r.status));
    expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
    expect(await Order.countDocuments()).toBe(1);
    expect((await Product.findById(a.id)).stock).toBe(8);
  });

  test('concurrent requests with the same key but DIFFERENT carts: exactly one order, the rest get 409', async () => {
    const a = await h.mkProduct(admin, cat.id, { stock: 10 });
    const c = await h.registerCustomer();
    const results = await Promise.all([1, 2, 3, 4].map((q) => place(c, [{ productId: a.id, quantity: q }], 'idem-key-race-02')));
    const created = results.filter((r) => r.status === 201);
    expect(created).toHaveLength(1);
    results.filter((r) => r.status !== 201).forEach((r) => expect([200, 409]).toContain(r.status));
    expect(await Order.countDocuments()).toBe(1);
    const order = await Order.findOne();
    expect((await Product.findById(a.id)).stock).toBe(10 - order.items[0].quantity); // exactly one decrement
  });

  test('a failed attempt does not consume the key: retrying after restock creates the order', async () => {
    const a = await h.mkProduct(admin, cat.id, { stock: 1 });
    const c = await h.registerCustomer();
    const fail = await place(c, [{ productId: a.id, quantity: 3 }], 'idem-key-retry-1');
    expect(fail.status).toBe(409);
    expect(fail.body.code).toBe('INSUFFICIENT_STOCK');
    expect(await Order.countDocuments()).toBe(0);
    await h.http().patch(`/api/v1/products/${a.id}`).set(h.auth(admin)).send({ stock: 5 });
    const retry = await place(c, [{ productId: a.id, quantity: 3 }], 'idem-key-retry-1');
    expect(retry.status).toBe(201);
    expect((await Product.findById(a.id)).stock).toBe(2);
  });

  test('prices and totals still come from the server, never from the client', async () => {
    const a = await h.mkProduct(admin, cat.id, { price: 100, stock: 5 });
    const c = await h.registerCustomer();
    const res = await h.http().post('/api/v1/orders').set(h.auth(c)).set('Idempotency-Key', 'idem-key-price-1')
      .send({ items: [{ productId: a.id, quantity: 1, unitPrice: 1 }], total: 1 });
    expect(res.status).toBe(422);
    const ok = await place(c, [{ productId: a.id, quantity: 1 }], 'idem-key-price-1');
    expect(ok.body.data.total).toBe(100);
  });

  test('the stored fingerprint is never exposed in API responses', async () => {
    const a = await h.mkProduct(admin, cat.id, { stock: 5 });
    const c = await h.registerCustomer();
    const res = await place(c, [{ productId: a.id, quantity: 1 }], 'idem-key-hide-01');
    expect(JSON.stringify(res.body)).not.toMatch(/idempotency/i);
    expect(JSON.stringify((await h.http().get('/api/v1/orders/my-orders').set(h.auth(c))).body)).not.toMatch(/idempotency/i);
  });
});

describe('search safety', () => {
  test('regex metacharacters are treated literally and never throw', async () => {
    const cat = await h.mkCategory(admin, 'Search');
    await h.mkProduct(admin, cat.id, { name: 'Plain Thing', sku: 'PLAIN-1' });
    for (const term of ['.*', '(', '[a-', '\\', '$^', 'a{2,', '(?<x>', '+++']) {
      const res = await h.http().get(`/api/v1/products?search=${encodeURIComponent(term)}`).set(h.auth(admin));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    }
    expect((await h.http().get('/api/v1/products?search=plain')).body.data).toHaveLength(1);
  });

  test('search terms longer than 100 characters are rejected on every searchable endpoint', async () => {
    const long = 'x'.repeat(101);
    for (const url of ['/api/v1/products', '/api/v1/users', '/api/v1/categories', '/api/v1/admin/orders']) {
      expect((await h.http().get(`${url}?search=${long}`).set(h.auth(admin))).status).toBe(422);
    }
    expect((await h.http().get(`/api/v1/users?search=${'x'.repeat(100)}`).set(h.auth(admin))).status).toBe(200);
  });

  test('admin order search: by order-number prefix (indexed), by customer name/email, pagination preserved', async () => {
    const cat = await h.mkCategory(admin, 'OrdSearch');
    const p = await h.mkProduct(admin, cat.id, { stock: 50 });
    const alice = await h.registerCustomer('Alice Wonder');
    const bob = await h.registerCustomer('Bob Builder');
    const o1 = (await place(alice, [{ productId: p.id, quantity: 1 }])).body.data;
    await place(alice, [{ productId: p.id, quantity: 1 }]);
    await place(bob, [{ productId: p.id, quantity: 1 }]);

    const byNumber = await h.http().get(`/api/v1/admin/orders?search=${o1.orderNumber.toLowerCase()}`).set(h.auth(admin));
    expect(byNumber.body.data.map((o) => o.id)).toEqual([o1.id]);
    const prefix = await h.http().get('/api/v1/admin/orders?search=ORD-').set(h.auth(admin));
    expect(prefix.body.meta.total).toBe(3);
    const byName = await h.http().get('/api/v1/admin/orders?search=alice&limit=1&page=2').set(h.auth(admin));
    expect(byName.body.meta).toMatchObject({ total: 2, page: 2, totalPages: 2 });
    expect(byName.body.data).toHaveLength(1);
    const byEmail = await h.http().get(`/api/v1/admin/orders?search=${encodeURIComponent(bob.email)}`).set(h.auth(admin));
    expect(byEmail.body.meta.total).toBe(1);
  });

  test('the customer pre-lookup is bounded (a broad term cannot load every user)', async () => {
    const User = h.models.User;
    const spy = vi.spyOn(User, 'find');
    await h.http().get('/api/v1/admin/orders?search=a').set(h.auth(admin));
    const limited = spy.mock.results.some((r) => r.value && r.value.options && r.value.options.limit === 200);
    spy.mockRestore();
    expect(limited).toBe(true);
  });
});
