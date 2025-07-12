#!/usr/bin/env bash

cd "$(dirname "$0")" && cd ..

mkdir -p export/LimbusCompany_Data/Lang

echo "{\"lang\": \"$1\"}" > export/LimbusCompany_Data/Lang/config.json
