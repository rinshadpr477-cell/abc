// Must be required BEFORE any src module: it prepares the environment the config validates.
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789-0123456789';
process.env.MONGODB_URI = process.env.TEST_MONGO_BASE || 'mongodb://localhost:27017/unused';

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { hashPassword } = require('../services/auth.service');


async function connect(dbName) {
  const base = process.env.TEST_MONGO_BASE.replace(/\/?(\?.*)?$/, '/');
  const query = (process.env.TEST_MONGO_BASE.match(/\?.*$/) || [''])[0];
  await mongoose.connect(`${base}${dbName}${query}`);
  await Promise.all([User.init(), Category.init(), Product.init(), Order.init()]);
}

async function disconnect() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

async function clearAll() {
  await Promise.all([User, Category, Product, Order].map((m) => m.deleteMany({})));
}

const http = () => request(app);

let seq = 0;
async function createAdmin() {
  const email = `admin${++seq}@test.com`;
  await User.create({ name: 'Admin', email, password: await hashPassword('Passw0rd!'), role: 'ADMIN' });
  return login(email);
}

async function registerCustomer(name = 'Cust') {
  const email = `cust${++seq}@test.com`;
  const res = await http().post('/api/v1/auth/register').send({ name, email, password: 'Passw0rd!' });
  return { token: res.body.data.accessToken, user: res.body.data.user, email, cookies: res.headers['set-cookie'] };
}

async function login(email, password = 'Passw0rd!') {
  const res = await http().post('/api/v1/auth/login').send({ email, password });
  return { token: res.body.data.accessToken, user: res.body.data.user, email, cookies: res.headers['set-cookie'] };
}

const auth = (t) => ({ Authorization: `Bearer ${t.token}` });

async function mkCategory(admin, name, parent) {
  const res = await http().post('/api/v1/categories').set(auth(admin)).send({ name, ...(parent ? { parent } : {}) });
  if (res.status !== 201) throw new Error(`category ${name}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

async function mkProduct(admin, category, overrides = {}) {
  const n = ++seq;
  const res = await http()
    .post('/api/v1/products')
    .set(auth(admin))
    .send({ name: `Product ${n}`, sku: `SKU-${n}`, price: 100, stock: 10, category, ...overrides });
  if (res.status !== 201) throw new Error(`product: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

module.exports = {
  connect, disconnect, clearAll, http, createAdmin, registerCustomer, login, auth, mkCategory, mkProduct,
  models: { User, Category, Product, Order },
};
