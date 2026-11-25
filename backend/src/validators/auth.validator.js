const { z } = require('zod');

const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Invalid email address'));
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/\d/, 'Password needs a digit');
const name = z.string().trim().min(2, 'Name must be at least 2 characters').max(80);

// .strict(): unknown keys (e.g. `role`, `isActive`) are rejected rather than silently ignored.
const register = z.object({ name, email, password }).strict();
const login = z.object({ email, password: z.string().min(1, 'Password is required').max(200) }).strict();
const updateProfile = z.object({ name: name.optional(), email: email.optional() }).strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');
const changePassword = z
  .object({ currentPassword: z.string().min(1).max(200), newPassword: password })
  .strict()
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'New password must differ from the current password',
  });

module.exports = { register, login, updateProfile, changePassword };
