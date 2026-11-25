const { MongoMemoryReplSet } = require('mongodb-memory-server');

// One in-memory single-node REPLICA SET for the whole run, so multi-document transactions work.
module.exports = async function setup() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.NODE_ENV = 'test';
  process.env.TEST_MONGO_BASE = replSet.getUri();
  return async function teardown() {
    await replSet.stop();
  };
};
