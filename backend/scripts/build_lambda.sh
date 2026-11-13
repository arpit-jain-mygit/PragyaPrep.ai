#!/usr/bin/env bash
# Builds build/lambda.zip for AWS Lambda: Linux, ARM64, Python 3.12.
# boto3 is left out because the Lambda Python runtime already includes it.
# The zip is reproducible: the same code and dependencies always give the same bytes,
# so Terraform only updates the Lambda when something really changed.
# Run from the backend folder: ./scripts/build_lambda.sh
set -euo pipefail

rm -rf build
mkdir -p build/package

.venv/bin/python -m pip install --quiet \
  -r requirements-lambda.txt \
  --target build/package \
  --platform manylinux2014_aarch64 \
  --implementation cp \
  --python-version 3.12 \
  --only-binary=:all:

cp -r app build/package/
find build/package -name "__pycache__" -type d -prune -exec rm -rf {} +

# Fix every file's timestamp and add files in a fixed order, so the zip doesn't change between builds.
find build/package -exec touch -t 202001010000 {} +
(cd build/package && find . -type f | LC_ALL=C sort | zip -qX -@ ../lambda.zip)
echo "Built $(pwd)/build/lambda.zip ($(du -h build/lambda.zip | cut -f1))"
