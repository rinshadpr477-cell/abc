const h = require('../helpers');

let admin;
beforeAll(async () => {
  await h.connect('t_category');
});
afterAll(() => h.disconnect());
beforeEach(async () => {
  await h.clearAll();
  admin = await h.createAdmin();
});

const get = (path) => h.http().get(`/api/v1${path}`).set(h.auth(admin));
const patch = (path, body) => h.http().patch(`/api/v1${path}`).set(h.auth(admin)).send(body);

async function buildElectronics() {
  const electronics = await h.mkCategory(admin, 'Electronics');
  const mobiles = await h.mkCategory(admin, 'Mobiles', electronics.id);
  const android = await h.mkCategory(admin, 'Android Phones', mobiles.id);
  const samsung = await h.mkCategory(admin, 'Samsung', android.id);
  const oneplus = await h.mkCategory(admin, 'OnePlus', android.id);
  const iphones = await h.mkCategory(admin, 'iPhones', mobiles.id);
  const computers = await h.mkCategory(admin, 'Computers', electronics.id);
  const laptops = await h.mkCategory(admin, 'Laptops', computers.id);
  return { electronics, mobiles, android, samsung, oneplus, iphones, computers, laptops };
}

describe('Categories', () => {
  test('creates root and nested categories with derived level/ancestors', async () => {
    const c = await buildElectronics();
    expect(c.electronics.level).toBe(0);
    expect(c.samsung.level).toBe(3);
    expect(c.samsung.ancestors).toEqual([c.electronics.id, c.mobiles.id, c.android.id]);
    expect(c.samsung.slug).toBe('samsung');
  });

  test('supports unlimited nesting (60 levels)', async () => {
    let parent;
    for (let i = 0; i < 60; i++) parent = await h.mkCategory(admin, `Level ${i}`, parent && parent.id);
    expect(parent.level).toBe(59);
    const tree = (await get('/categories/tree')).body.data;
    let depth = 0;
    for (let node = tree[0]; node; node = node.children[0]) depth++;
    expect(depth).toBe(60);
  });

  test('tree is correctly nested and built without per-node queries', async () => {
    await buildElectronics();
    const spy = vi.spyOn(require('mongoose').Query.prototype, 'exec');
    const res = await get('/categories/tree');
    const calls = spy.mock.calls.length;
    spy.mockRestore();
    expect(calls).toBeLessThanOrEqual(2); // 1 for the tree (+1 for auth user lookup)
    const [root] = res.body.data;
    expect(root.name).toBe('Electronics');
    expect(root.children.map((c) => c.name)).toEqual(['Computers', 'Mobiles']);
    const mobiles = root.children.find((c) => c.name === 'Mobiles');
    expect(mobiles.children.find((c) => c.name === 'Android Phones').children.map((c) => c.name)).toEqual(['OnePlus', 'Samsung']);
  });

  test('returns descendants and ancestors', async () => {
    const c = await buildElectronics();
    const d = await get(`/categories/${c.mobiles.id}/descendants`);
    expect(d.body.data.map((x) => x.name).sort()).toEqual(['Android Phones', 'OnePlus', 'Samsung', 'iPhones']);
    const a = await get(`/categories/${c.samsung.id}/ancestors`);
    expect(a.body.data.map((x) => x.name)).toEqual(['Electronics', 'Mobiles', 'Android Phones']);
  });

  test('rejects missing / inactive parent and duplicate sibling names', async () => {
    const c = await buildElectronics();
    const missing = await h.http().post('/api/v1/categories').set(h.auth(admin)).send({ name: 'X', parent: '507f1f77bcf86cd799439011' });
    expect(missing.status).toBe(422);
    await patch(`/categories/${c.laptops.id}`, { isActive: false });
    const inactive = await h.http().post('/api/v1/categories').set(h.auth(admin)).send({ name: 'Y', parent: c.laptops.id });
    expect(inactive.status).toBe(422);
    const dup = await h.http().post('/api/v1/categories').set(h.auth(admin)).send({ name: 'mobiles', parent: c.electronics.id });
    expect(dup.status).toBe(409);
  });

  test('prevents self-parent and circular moves', async () => {
    const c = await buildElectronics();
    const self = await patch(`/categories/${c.mobiles.id}`, { parent: c.mobiles.id });
    expect(self.status).toBe(422);
    expect(self.body.code).toBe('SELF_PARENT');
    const underChild = await patch(`/categories/${c.electronics.id}`, { parent: c.samsung.id });
    expect(underChild.status).toBe(422);
    expect(underChild.body.code).toBe('CIRCULAR_PARENT');
    const underGrandChild = await patch(`/categories/${c.mobiles.id}`, { parent: c.oneplus.id });
    expect(underGrandChild.body.code).toBe('CIRCULAR_PARENT');
    // nothing changed
    expect((await get(`/categories/${c.mobiles.id}`)).body.data.parent).toBe(c.electronics.id);
  });

  test('moving a category re-paths its entire subtree', async () => {
    const c = await buildElectronics();
    const fashion = await h.mkCategory(admin, 'Fashion');
    const res = await patch(`/categories/${c.mobiles.id}`, { parent: fashion.id });
    expect(res.status).toBe(200);
    const samsung = (await get(`/categories/${c.samsung.id}`)).body.data;
    expect(samsung.ancestors).toEqual([fashion.id, c.mobiles.id, c.android.id]);
    expect(samsung.level).toBe(3);
    const d = await get(`/categories/${fashion.id}/descendants`);
    expect(d.body.data).toHaveLength(5);
    expect((await get(`/categories/${c.electronics.id}/descendants`)).body.data.map((x) => x.name).sort()).toEqual(['Computers', 'Laptops']);
    // move to root
    await patch(`/categories/${c.android.id}`, { parent: null });
    const s2 = (await get(`/categories/${c.samsung.id}`)).body.data;
    expect(s2.ancestors).toEqual([c.android.id]);
    expect(s2.level).toBe(1);
  });

  test('deactivating cascades to descendants; activation needs an active parent', async () => {
    const c = await buildElectronics();
    await patch(`/categories/${c.mobiles.id}`, { isActive: false });
    const inactive = (await get(`/categories/${c.samsung.id}`)).body.data;
    expect(inactive.isActive).toBe(false);
    const react = await patch(`/categories/${c.samsung.id}`, { isActive: true });
    expect(react.status).toBe(422);
    const publicTree = (await h.http().get('/api/v1/categories/tree')).body.data;
    expect(publicTree[0].children.map((x) => x.name)).toEqual(['Computers']);
  });

  test('deletion is restricted for categories with children or products', async () => {
    const c = await buildElectronics();
    const withChildren = await h.http().delete(`/api/v1/categories/${c.mobiles.id}`).set(h.auth(admin));
    expect(withChildren.status).toBe(409);
    expect(withChildren.body.code).toBe('CATEGORY_HAS_CHILDREN');
    await h.mkProduct(admin, c.laptops.id);
    const withProducts = await h.http().delete(`/api/v1/categories/${c.laptops.id}`).set(h.auth(admin));
    expect(withProducts.body.code).toBe('CATEGORY_HAS_PRODUCTS');
    const leaf = await h.http().delete(`/api/v1/categories/${c.iphones.id}`).set(h.auth(admin));
    expect(leaf.status).toBe(200);
  });
});
