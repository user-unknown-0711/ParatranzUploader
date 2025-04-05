#!/usr/bin/env bash

cd "$(dirname "$0")" && cd ..

cd Assets

prefix="${1:-M}"

git ls-files | grep kr/ | sed "s/^/${prefix}\t/" > ../dump/files.txt
git log -1 --pretty=format:"%h" > ../dump/assets_last_commit.txt
