/**
 * NoSQL-injection guard: drops any object key that starts with "$" or contains "." from the
 * request body and params (in place). Query strings use the "simple" parser (flat strings
 * only) and are additionally validated by zod, so operator objects can never reach Mongo.
 */
function clean(value) {
  if (Array.isArray(value)) return value.forEach(clean);
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) delete value[key];
      else clean(value[key]);
    }
  }
}

module.exports = (req, _res, next) => {
  clean(req.body);
  clean(req.params);
  next();
};
