#!/usr/bin/env bash

cd "$(dirname "$0")" && cd ..

mkdir -p download/

curl -L --header "Authorization: $2" https://paratranz.cn/api/projects/$1/artifacts/download -o download/artifact.zip

if [ $? -ne 0 ]; then
  echo "download fail"
  exit 1
fi

unzip -o download/artifact.zip -d download/ -x "utf8/*"
