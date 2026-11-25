/* Creates the first ADMIN from ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD in the environment.
 * This is the ONLY way to create an admin: there is no public admin registration. */
const env = require('../src/config/environment');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const User = require('../src/models/User');
const { hashPassword } = require('../src/services/auth.service');

(async () => {
  const { ADMIN_NAME: name = 'Store Admin', ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = env;
  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (see .env.example).');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }
  await connectDatabase();
  await User.init();
  const normalised = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalised });
  if (existing) {
    console.log(`User ${normalised} already exists (role ${existing.role}); nothing changed.`);
  } else {
    await User.create({ name, email: normalised, password: await hashPassword(password), role: 'ADMIN' });
    console.log(`Admin created: ${normalised}`);
  }
  await disconnectDatabase();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
