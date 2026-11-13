#!/usr/bin/env bash
# Creates a new AWS member account for PragyaPrep, gives the SSO user admin access, and sets up the
# local CLI profile and account folder. Then deploy the app into it with deploy.sh.
#
# Usage:  infra/scripts/new-account.sh <name> <email> [--yes]
#   <name>   short name, for example: prod  (becomes AWS account name pragyaprep-prod)
#   <email>  a unique email for the account. A Gmail +alias works, for example you+pragyaprep-prod@gmail.com
#   --yes    apply without asking for confirmation
#
# It runs with the management account (infra/accounts/main) credentials. Sign in first:
#   aws sso login --sso-session pragyaprep
set -euo pipefail

NAME="${1:?Usage: new-account.sh <name> <email> [--yes]}"
EMAIL="${2:?Usage: new-account.sh <name> <email> [--yes]}"
MODE="${3:-}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ORG_DIR="$ROOT/infra/org"
MAIN_DIR="$ROOT/infra/accounts/main"
NEW_DIR="$ROOT/infra/accounts/$NAME"
TFVARS="$ORG_DIR/accounts.auto.tfvars.json"
ACCOUNT_NAME="pragyaprep-$NAME"
PROFILE="pragyaprep-$NAME"

[ "$NAME" != "main" ] || { echo "'main' is the management account and already exists."; exit 1; }
[ -f "$MAIN_DIR/account.env" ] || { echo "Missing $MAIN_DIR/account.env"; exit 1; }

# The management account runs the account factory and holds its state.
source "$MAIN_DIR/account.env"
export AWS_PROFILE AWS_REGION

if ! MGMT_ID="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"; then
  echo "Can't reach AWS with profile $AWS_PROFILE. Run: aws sso login --sso-session pragyaprep"
  exit 1
fi
echo "Management account $MGMT_ID. Creating member account $ACCOUNT_NAME ($EMAIL)."

# ---- Add the account to the list Terraform reads ----
python3 - "$ACCOUNT_NAME" "$EMAIL" "$TFVARS" <<'PY'
import json, sys
name, email, path = sys.argv[1:4]
data = json.load(open(path))
data["member_accounts"][name] = {"email": email}
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY

# ---- Create the account and the SSO assignment ----
terraform -chdir="$ORG_DIR" init -input=false -reconfigure \
  -backend-config="bucket=pragyaprep-tfstate-$MGMT_ID" \
  -backend-config="key=org/accounts.tfstate" \
  -backend-config="region=$AWS_REGION" \
  -backend-config="dynamodb_table=pragyaprep-tflock" \
  -backend-config="encrypt=true" > /dev/null

APPLY_FLAG=""
[ "$MODE" = "--yes" ] && APPLY_FLAG="-auto-approve"
terraform -chdir="$ORG_DIR" apply -input=false $APPLY_FLAG

NEW_ID="$(terraform -chdir="$ORG_DIR" output -json account_ids | python3 -c "import json,sys; print(json.load(sys.stdin)['$ACCOUNT_NAME'])")"
echo "Created account $NEW_ID"

# ---- Local CLI profile and account folder ----
if ! grep -q "^\[profile $PROFILE\]" "$HOME/.aws/config"; then
  cat >> "$HOME/.aws/config" <<EOF

[profile $PROFILE]
sso_session = pragyaprep
sso_account_id = $NEW_ID
sso_role_name = AdministratorAccess
region = $AWS_REGION
output = json
EOF
  echo "Added CLI profile $PROFILE"
fi

mkdir -p "$NEW_DIR"
cat > "$NEW_DIR/account.env" <<EOF
# PragyaPrep account '$NAME' ($NEW_ID). Created by new-account.sh.
AWS_PROFILE=$PROFILE
AWS_REGION=$AWS_REGION
EOF

echo
echo "Done. The new account can take a few minutes to appear in the SSO portal. Then run:"
echo "  aws sso login --sso-session pragyaprep"
echo "  infra/scripts/deploy.sh $NAME dev --plan     # check first"
echo "  infra/scripts/deploy.sh $NAME dev            # deploy"
