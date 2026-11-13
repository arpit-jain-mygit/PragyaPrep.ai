# PragyaPrep infrastructure

Everything runs from scripts. No account ID or bucket name is written in the Terraform code, so the same code deploys to any AWS account.

## Layout

| Path | What it is |
|---|---|
| `infra/accounts/<name>/account.env` | Which AWS account and region a name means (`AWS_PROFILE`, `AWS_REGION`) |
| `infra/accounts/<name>/<env>.tfvars` | Optional per-account settings (Google client ID, frontend URL, CORS origins). Not committed |
| `infra/accounts/<name>/bootstrap.tfstate` | Local state of that account's state bucket. Not committed. Back it up |
| `infra/bootstrap/` | Creates the Terraform state bucket and lock table in an account |
| `infra/envs/<env>/app/` | The app: DynamoDB, S3, SSM secrets, Lambda, Function URL |
| `infra/envs/<env>/network/` | A VPC with NAT. Not deployed now, kept for when a private network is needed |
| `infra/org/` | Account factory: creates member accounts and gives the SSO user access |
| `infra/scripts/deploy.sh` | Deploys the app into an account |
| `infra/scripts/new-account.sh` | Creates a new account |

## Deploy to an existing account

```bash
aws sso login --sso-session pragyaprep
infra/scripts/deploy.sh main dev --plan
infra/scripts/deploy.sh main dev
```

`--plan` shows what would change and stops. `--yes` applies without asking.

## Move to a new account

```bash
aws sso login --sso-session pragyaprep
infra/scripts/new-account.sh prod you+pragyaprep-prod@gmail.com
```

Wait a few minutes for the account to appear in the SSO portal, then:

```bash
aws sso login --sso-session pragyaprep
infra/scripts/deploy.sh prod dev --plan
infra/scripts/deploy.sh prod dev
```

To keep existing logins valid in the new account, copy the secrets file before deploying:

```bash
cp ~/.config/pragyaprep/main-dev.env ~/.config/pragyaprep/prod-dev.env
```

Then update the Google OAuth redirect URL and the frontend's API URL to the new `API URL` the script prints.

## Already have an account?

Skip `new-account.sh`. Create `infra/accounts/<name>/account.env` with that account's SSO profile and region, then run `deploy.sh`.

## Data is not moved by these scripts

The scripts build an empty copy. To carry real data over:

- **DynamoDB:** copy a backup across accounts with AWS Backup, or export to S3 and import into the new table.
- **S3 files:** `aws s3 sync` or S3 replication, with a bucket policy that allows the source account.

## Things to know

- Secrets are generated per account and environment into `~/.config/pragyaprep/<account>-<env>.env` (outside the repo).
- The Lambda zip is reproducible, so a deploy only updates the Lambda when the code changed.
- The account factory never closes an account. Removing an entry only takes it out of the organization.
