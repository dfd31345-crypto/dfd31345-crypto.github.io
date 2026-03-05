#!/usr/bin/env bash
set -euo pipefail

# cloudflare-dns.sh
# Usage:
# 1) Export your Cloudflare API token into the environment: export CF_TOKEN=your_token_here
# 2) Run: ./cloudflare-dns.sh
# The script will find the Zone for shipzibi.com and create the 4 A records and a CNAME for www.

DOMAIN="shipzibi.com"
WWW_TARGET="dfd31345-crypto.github.io"

if [ -z "${CF_TOKEN:-}" ]; then
  echo "Please set CF_TOKEN environment variable first."
  echo "Example: export CF_TOKEN=your_token_here"
  exit 1
fi

echo "Looking up zone id for ${DOMAIN}..."
ZONE_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=${DOMAIN}" \
  -H "Authorization: Bearer ${CF_TOKEN}" -H "Content-Type: application/json" \
  | python3 -c "import sys,json; j=json.load(sys.stdin); print(j.get('result')[0]['id'] if j.get('result') else '')")

if [ -z "$ZONE_ID" ]; then
  echo "Could not find zone ID for ${DOMAIN}. Make sure the Cloudflare account has that zone."
  exit 1
fi

echo "Zone ID: $ZONE_ID"

IPS=(185.199.108.153 185.199.109.153 185.199.110.153 185.199.111.153)
for ip in "${IPS[@]}"; do
  echo "Creating A record for @ -> $ip"
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
    -H "Authorization: Bearer ${CF_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"A\",\"name\":\"@\",\"content\":\"$ip\",\"ttl\":3600,\"proxied\":false}"
  echo
done

echo "Creating CNAME record for www -> ${WWW_TARGET}"
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${CF_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{\"type\":\"CNAME\",\"name\":\"www\",\"content\":\"${WWW_TARGET}\",\"ttl\":3600,\"proxied\":false}"

echo "DNS records submitted. Cloudflare may take a few minutes to show changes."
