#!/usr/bin/env bash

cd "$(dirname "$0")" && cd ..

mkdir -p cache

cd Assets

# get last commit change | skip commit message | filter kr/ files
git log --name-status --oneline -1 | tail -n +2 | grep kr/ > ../dump/files.txt
git log -1 --pretty=format:"%h" > ../dump/assets_last_commit.txt
