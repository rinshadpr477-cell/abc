const mongoose = require('mongoose');
const env = require('./environment');

async function connectDatabase(uri = env.MONGODB_URI) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  return mongoose.connection;
}

const disconnectDatabase = () => mongoose.disconnect();

module.exports = { connectDatabase, disconnectDatabase };
