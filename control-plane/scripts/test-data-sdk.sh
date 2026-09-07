#!/usr/bin/env bash
# A fresh local cluster: overrides the application's DATABASE_URL.
set -euo pipefail
cd "$(dirname "$0")/.."
sdk_pg_bin=${NARU_TEST_PG_BIN:-$(pg_config --bindir)}
sdk_pg_dir=$(mktemp -d /tmp/naru-sdk-pg.XXXXXX)
sdk_pg_started=0
cleanup() {
  if [[ "$sdk_pg_started" == 1 ]]; then
    if ! "$sdk_pg_bin/pg_ctl" -D "$sdk_pg_dir/data" -m immediate -w stop; then
      echo "Could not stop test PostgreSQL. Logs and data: $sdk_pg_dir" >&2
      return 1
    fi
  fi
  rm -rf "$sdk_pg_dir"
}
trap cleanup EXIT
"$sdk_pg_bin/initdb" -D "$sdk_pg_dir/data" --auth=trust --username=sdk_test --no-locale >"$sdk_pg_dir/init.log"
# A private Unix socket avoids port collisions and TCP access to the test DB.
if ! "$sdk_pg_bin/pg_ctl" -D "$sdk_pg_dir/data" -l "$sdk_pg_dir/server.log" -o "-h '' -k $sdk_pg_dir" -w start; then
  cat "$sdk_pg_dir/server.log" >&2
  exit 1
fi
sdk_pg_started=1
"$sdk_pg_bin/createdb" -h "$sdk_pg_dir" -U sdk_test naru_data_test
if [[ "$#" == 0 ]]; then
  set -- src/lib/site-data/__tests__/sdk-integration.test.ts
fi
NARU_DATA_TEST=1 DATABASE_URL="postgresql://sdk_test@localhost/naru_data_test?host=$sdk_pg_dir" \
  ./node_modules/.bin/jest --config jest.data.config.cjs --runInBand "$@"
