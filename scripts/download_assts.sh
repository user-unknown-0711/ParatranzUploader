#!/usr/bin/env bash

cd "$(dirname "$0")" && cd ..

rm -rf ./Assets

git clone --depth 2 https://github.com/tool-jx3/Assets.git

