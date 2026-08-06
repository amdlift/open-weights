#!/bin/sh
set -e

DB_PATH="${DATABASE_PATH:-/data/openweights.db}"
DB_DIR="$(dirname "$DB_PATH")"

if [ ! -d "$DB_DIR" ]; then
	mkdir -p "$DB_DIR" 2>/dev/null || {
		echo "openweights: cannot create '$DB_DIR'." >&2
		echo "openweights: mount a writable volume there, or set DATABASE_PATH." >&2
		exit 1
	}
fi

if [ ! -w "$DB_DIR" ]; then
	echo "openweights: '$DB_DIR' is not writable by uid $(id -u):$(id -g)." >&2
	echo "openweights: chown the host directory to that uid, or run with 'user:'." >&2
	exit 1
fi

# Schema migrations and the built-in exercise seed are applied by the server on
# first database access (src/lib/server/db/index.ts), so upgrading is just a pull.
exec "$@"
