#!/usr/bin/env bash

cd "$(dirname "$0")" && cd ..

mkdir -p dump

cd Assets

prefix="${1:-M}"

git ls-files | grep kr/ | sed "s/^/${prefix}\t/" > ../dump/kr_files.txt
git ls-files | grep en/ | sed "s/^/${prefix}\t/" > ../dump/en_files.txt
git ls-files | grep jp/ | sed "s/^/${prefix}\t/" > ../dump/jp_files.txt
git log -1 --pretty=format:"%h" > ../dump/assets_last_commit.txt
