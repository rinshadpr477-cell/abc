/* Optional demo data: the Electronics hierarchy plus sample products. Safe to re-run (skips existing). */
require('../src/config/environment');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const categories = require('../src/services/category.service');

const TREE = {
  Electronics: {
    Mobiles: { 'Android Phones': { Samsung: {}, OnePlus: {} }, iPhones: {} },
    Computers: { Laptops: {}, Desktops: {} },
  },
  Fashion: { Men: {}, Women: {} },
};

async function ensure(name, parent) {
  const existing = await Category.findOne({ name, parent: parent || null });
  return existing || categories.create({ name, parent: parent || null });
}

async function walk(node, parent, out) {
  for (const [name, children] of Object.entries(node)) {
    const cat = await ensure(name, parent);
    out[name] = cat;
    await walk(children, cat._id, out);
  }
}

const PRODUCTS = [
  ['Samsung Galaxy S24', 'SAM-S24', 799, 749, 25, 'Samsung'],
  ['OnePlus 12', 'ONE-12', 699, null, 40, 'OnePlus'],
  ['iPhone 15', 'APL-IP15', 899, 849, 15, 'iPhones'],
  ['ThinkPad X1 Carbon', 'LEN-X1C', 1599, null, 8, 'Laptops'],
  ['Gaming Desktop RTX', 'DSK-RTX', 1899, 1799, 5, 'Desktops'],
  ['Classic Oxford Shirt', 'FSH-OXF', 49.99, 39.99, 100, 'Men'],
  ['Summer Dress', 'FSH-SUM', 59.5, null, 0, 'Women'],
];

(async () => {
  await connectDatabase();
  await Promise.all([Category.init(), Product.init()]);
  const cats = {};
  await walk(TREE, null, cats);
  for (const [name, sku, price, salePrice, stock, cat] of PRODUCTS) {
    if (!(await Product.exists({ sku }))) {
      await Product.create({ name, sku, price, salePrice, stock, category: cats[cat]._id });
    }
  }
  console.log(`Demo data ready: ${Object.keys(cats).length} categories, ${PRODUCTS.length} products.`);
  await disconnectDatabase();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
