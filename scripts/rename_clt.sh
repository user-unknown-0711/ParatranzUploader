#!/usr/bin/env bash

cd "$(dirname "$0")" && cd ..

if [ "$1" == "TW" ]; then
  echo "skip rename"
  exit 0
fi

if [ -d "export/LimbusCompany_Data/Lang/$1" ]; then
  echo "remove old $1"
  rm -r "export/LimbusCompany_Data/Lang/$1"
fi

if [ -d "export/LimbusCompany_Data/Lang/TW" ]; then
  echo "move TW to $1"
  mv export/LimbusCompany_Data/Lang/TW "export/LimbusCompany_Data/Lang/$1"
fi
