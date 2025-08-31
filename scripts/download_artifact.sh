#!/usr/bin/env bash

cd "$(dirname "$0")" && cd ..

mkdir -p download/$1/

curl -L --header "Authorization: $2" https://paratranz.cn/api/projects/$1/artifacts/download -o download/$1/artifact.zip

if [ $? -ne 0 ]; then
  echo "download fail"
  exit 1
fi

unzip -o download/$1/artifact.zip -d download/$1/ -x "utf8/*"
