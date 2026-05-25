#!/bin/sh
# Generate Redis ACL file from environment variables and start Redis

cat > /etc/redis/users.acl <<EOF
user default on >${REDIS_PASSWORD:?REDIS_PASSWORD is required} ~* &* +@all -@dangerous
EOF

exec redis-server /etc/redis/redis.conf
