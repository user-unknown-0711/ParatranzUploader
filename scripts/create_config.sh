#!/usr/bin/env bash

cd "$(dirname "$0")" && cd ..

mkdir -p export/LimbusCompany_Data/Lang

echo '{"lang": "TW","samplingPointSize": 200,"padding": 10}' > export/LimbusCompany_Data/Lang/config.json
