#!/usr/bin/env bash
# Builds build/lambda.zip for AWS Lambda: Linux, ARM64, Python 3.12.
# boto3 is left out because the Lambda Python runtime already includes it.
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
(cd build/package && zip -qr ../lambda.zip .)
echo "Built $(pwd)/build/lambda.zip ($(du -h build/lambda.zip | cut -f1))"
