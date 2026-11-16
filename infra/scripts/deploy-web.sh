#!/usr/bin/env bash
# Builds the Angular app and puts it on the website (S3 behind CloudFront). Run deploy.sh first, so the website exists.
#
# Usage:  infra/scripts/deploy-web.sh <account> <env>
#   <account>  folder name under infra/accounts/, for example: main
#   <env>      environment under infra/envs/, for example: dev
set -euo pipefail

ACCOUNT="${1:?Usage: deploy-web.sh <account> <env>}"
ENVIRONMENT="${2:?Usage: deploy-web.sh <account> <env>}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ACCOUNT_DIR="$ROOT/infra/accounts/$ACCOUNT"
APP_DIR="$ROOT/infra/envs/$ENVIRONMENT/app"
DIST="$ROOT/frontend/dist/frontend/browser"

[ -f "$ACCOUNT_DIR/account.env" ] || { echo "Missing $ACCOUNT_DIR/account.env"; exit 1; }
source "$ACCOUNT_DIR/account.env"
export AWS_PROFILE AWS_REGION

if ! ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"; then
  echo "Can't reach AWS with profile $AWS_PROFILE. Run: aws sso login --profile $AWS_PROFILE"
  exit 1
fi

# Where the website is, read from the stack (the state lives in this account's bucket).
terraform -chdir="$APP_DIR" init -input=false -reconfigure \
  -backend-config="bucket=pragyaprep-tfstate-$ACCOUNT_ID" \
  -backend-config="key=$ENVIRONMENT/app.tfstate" \
  -backend-config="region=$AWS_REGION" \
  -backend-config="dynamodb_table=pragyaprep-tflock" \
  -backend-config="encrypt=true" > /dev/null
BUCKET="$(terraform -chdir="$APP_DIR" output -raw web_bucket)"
DISTRIBUTION="$(terraform -chdir="$APP_DIR" output -raw web_distribution_id)"
URL="$(terraform -chdir="$APP_DIR" output -raw web_url)"

# 1. Build. The production build is smaller and faster, and uses the API address in environment.live.ts.
(cd "$ROOT/frontend" && npm ci --silent && npx ng build)
[ -f "$DIST/index.html" ] || { echo "The build did not make $DIST/index.html"; exit 1; }

# 2. Copy the files. Most file names contain a hash of their contents, so they never change and can be kept for a year.
#    index.html and the icon keep their names, so browsers must check them every time. Old files are left in place
#    on purpose, so someone who has the page open can still load the parts they need until they refresh.
aws s3 sync "$DIST" "s3://$BUCKET" --exclude "index.html" --exclude "favicon.ico" \
  --cache-control "public,max-age=31536000,immutable" --only-show-errors
aws s3 cp "$DIST/index.html" "s3://$BUCKET/index.html" --cache-control "no-cache" --content-type "text/html; charset=utf-8" --only-show-errors
[ -f "$DIST/favicon.ico" ] && aws s3 cp "$DIST/favicon.ico" "s3://$BUCKET/favicon.ico" --cache-control "public,max-age=86400" --only-show-errors

# 3. Clear CloudFront's copies, so the new version shows up straight away.
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths "/*" --query "Invalidation.Id" --output text > /dev/null

echo "Website updated: $URL"
