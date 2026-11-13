#!/usr/bin/env bash
# Deploys PragyaPrep to an AWS account. To move to a new account, add a folder under infra/accounts/
# and run this script. It sets up the state bucket, builds the Lambda, and applies the app stack.
#
# Usage:  infra/scripts/deploy.sh <account> <env> [--plan | --yes]
#   <account>  folder name under infra/accounts/, for example: main
#   <env>      environment under infra/envs/, for example: dev
#   --plan     show what would change and stop (changes nothing)
#   --yes      apply without asking for confirmation
#
# Before the first run for an account:
#   1. Create infra/accounts/<account>/account.env with AWS_PROFILE and AWS_REGION.
#   2. Sign in:  aws sso login --sso-session pragyaprep
set -euo pipefail

ACCOUNT="${1:?Usage: deploy.sh <account> <env> [--plan | --yes]}"
ENVIRONMENT="${2:?Usage: deploy.sh <account> <env> [--plan | --yes]}"
MODE="${3:-}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ACCOUNT_DIR="$ROOT/infra/accounts/$ACCOUNT"
APP_DIR="$ROOT/infra/envs/$ENVIRONMENT/app"
BOOTSTRAP_DIR="$ROOT/infra/bootstrap"
LOCK_TABLE="pragyaprep-tflock"

[ -f "$ACCOUNT_DIR/account.env" ] || { echo "Missing $ACCOUNT_DIR/account.env"; exit 1; }
[ -d "$APP_DIR" ] || { echo "No environment at $APP_DIR"; exit 1; }

# Which AWS account and region to use. Sets AWS_PROFILE and AWS_REGION.
source "$ACCOUNT_DIR/account.env"
export AWS_PROFILE AWS_REGION
export TF_VAR_region="$AWS_REGION"

if ! ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"; then
  echo "Can't reach AWS with profile $AWS_PROFILE. Run: aws sso login --sso-session pragyaprep"
  exit 1
fi
STATE_BUCKET="pragyaprep-tfstate-$ACCOUNT_ID"
echo "Account $ACCOUNT_ID ($AWS_PROFILE), region $AWS_REGION, environment $ENVIRONMENT"

APPLY_FLAG=""
[ "$MODE" = "--yes" ] && APPLY_FLAG="-auto-approve"

# ---- Secrets for this account and environment, kept outside the repo ----
SECRETS_FILE="$HOME/.config/pragyaprep/$ACCOUNT-$ENVIRONMENT.env"
if [ ! -f "$SECRETS_FILE" ]; then
  mkdir -p "$(dirname "$SECRETS_FILE")"
  (
    umask 077
    {
      echo "export TF_VAR_secret_key=$(openssl rand -hex 32)"
      echo "export TF_VAR_admin_password=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
    } > "$SECRETS_FILE"
  )
  echo "Created $SECRETS_FILE (holds the admin password). To keep existing logins valid, copy the old file here instead."
fi
source "$SECRETS_FILE"

# Optional per-account settings, such as the Google client ID and frontend URL.
VAR_FILE_FLAG=""
[ -f "$ACCOUNT_DIR/$ENVIRONMENT.tfvars" ] && VAR_FILE_FLAG="-var-file=$ACCOUNT_DIR/$ENVIRONMENT.tfvars"

# ---- 1. State bucket and lock table for this account ----
# This stack keeps its state in a local file, because it creates the place where remote state lives.
BOOTSTRAP_STATE="$ACCOUNT_DIR/bootstrap.tfstate"
terraform -chdir="$BOOTSTRAP_DIR" init -input=false > /dev/null
if [ "$MODE" = "--plan" ]; then
  terraform -chdir="$BOOTSTRAP_DIR" plan -input=false -state="$BOOTSTRAP_STATE"
else
  terraform -chdir="$BOOTSTRAP_DIR" apply -input=false -state="$BOOTSTRAP_STATE" $APPLY_FLAG
fi

# ---- 2. Build the Lambda package ----
(cd "$ROOT/backend" && ./scripts/build_lambda.sh)

# ---- 3. The app stack, with state stored in this account's bucket ----
terraform -chdir="$APP_DIR" init -input=false -reconfigure \
  -backend-config="bucket=$STATE_BUCKET" \
  -backend-config="key=$ENVIRONMENT/app.tfstate" \
  -backend-config="region=$AWS_REGION" \
  -backend-config="dynamodb_table=$LOCK_TABLE" \
  -backend-config="encrypt=true" > /dev/null

if [ "$MODE" = "--plan" ]; then
  terraform -chdir="$APP_DIR" plan -input=false $VAR_FILE_FLAG
  echo "Plan only. Nothing was changed."
else
  terraform -chdir="$APP_DIR" apply -input=false $VAR_FILE_FLAG $APPLY_FLAG
  echo
  echo "API URL: $(terraform -chdir="$APP_DIR" output -raw api_url)"
fi
