#!/usr/bin/env bash

cd "$(dirname "$0")" && cd ..

mkdir -p dump

cd Assets

# get last commit change | skip commit message | filter kr/ files
git log --name-status --oneline -1 | tail -n +2 | grep kr/ > ../dump/kr_files.txt
git log --name-status --oneline -1 | tail -n +2 | grep en/ > ../dump/en_files.txt
git log --name-status --oneline -1 | tail -n +2 | grep jp/ > ../dump/jp_files.txt

git log -1 --pretty=format:"%h" > ../dump/assets_last_commit.txt
