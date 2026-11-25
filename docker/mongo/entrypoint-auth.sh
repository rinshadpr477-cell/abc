#!/bin/bash
# Entrypoint for the authenticated MongoDB replica set (used by docker-compose.auth.yml).
#
# What it does, every time the container starts:
#   1. Writes the replica-set keyfile (from $MONGO_REPLICA_KEY) to /tmp, NOT into the data volume.
#   2. Starts a temporary mongod bound to 127.0.0.1 only.
#   3. Makes sure the replica set is initiated and the root user exists:
#        - root user already works  -> nothing is changed
#        - no users yet             -> (initiates the replica set if needed and) creates the root user
#                                      using MongoDB's localhost exception
#        - users exist but the credentials do not match -> aborts with an error, changes nothing
#   4. Stops the temporary server and starts the real one with --keyFile (authorization enforced).
#
# Credentials come only from environment variables and are never written to the image or the log.
set -euo pipefail

: "${MONGO_ROOT_USERNAME:?MONGO_ROOT_USERNAME is required}"
: "${MONGO_ROOT_PASSWORD:?MONGO_ROOT_PASSWORD is required}"
: "${MONGO_REPLICA_KEY:?MONGO_REPLICA_KEY is required}"

KEYFILE=/tmp/mongo-keyfile
umask 077
printf '%s' "$MONGO_REPLICA_KEY" > "$KEYFILE"
chown mongodb:mongodb "$KEYFILE"
chmod 400 "$KEYFILE"

INIT_JS=/tmp/mongo-init.js
cat > "$INIT_JS" <<'JS'
const user = process.env.MONGO_ROOT_USERNAME;
const pwd = process.env.MONGO_ROOT_PASSWORD;
const admin = db.getSiblingDB('admin');

let authenticated = false;
try {
  // mongosh returns { ok: 1 } on success and throws on failure.
  const r = admin.auth(user, pwd);
  authenticated = r === 1 || r === true || (r && r.ok === 1);
} catch (e) { authenticated = false; }
if (authenticated) { print('[mongo-init] root user already present; nothing to do'); quit(0); }

// Not authenticated: either no user exists yet (localhost exception) or the credentials are wrong.
let initiated = true;
try { rs.status(); } catch (e) {
  if (e.codeName === 'NotYetInitialized') { initiated = false; }
  else if (e.codeName === 'Unauthorized') {
    print('[mongo-init] ERROR: users already exist but MONGO_ROOT_USERNAME/MONGO_ROOT_PASSWORD do not match. Aborting without changes.');
    quit(1);
  } else { throw e; }
}
if (!initiated) { rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] }); }

for (let i = 0; i < 60; i++) {
  if (db.hello().isWritablePrimary) break;
  sleep(1000);
}
if (!db.hello().isWritablePrimary) { print('[mongo-init] ERROR: replica set did not become primary'); quit(1); }

admin.createUser({ user: user, pwd: pwd, roles: [{ role: 'root', db: 'admin' }] });
print('[mongo-init] root user created');
JS

echo "[mongo-init] starting temporary local server"
gosu mongodb mongod --replSet rs0 --keyFile "$KEYFILE" --bind_ip 127.0.0.1 --port 27017 \
  --dbpath /data/db --fork --logpath /tmp/mongod-init.log >/dev/null

for i in $(seq 1 60); do
  if mongosh --quiet --port 27017 --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1; then break; fi
  sleep 1
done

mongosh --quiet --port 27017 --file "$INIT_JS"

echo "[mongo-init] stopping temporary server"
gosu mongodb mongod --shutdown --dbpath /data/db >/dev/null
rm -f "$INIT_JS"

echo "[mongo-init] starting MongoDB with authentication enabled"
exec docker-entrypoint.sh mongod --replSet rs0 --bind_ip_all --keyFile "$KEYFILE" --auth
