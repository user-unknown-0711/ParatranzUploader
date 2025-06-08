#!/usr/bin/env bash

cd "$(dirname "$0")" && cd ..

jq -r '.[] | select(.key == "ReleaseNotes") | .translation' $1 >> export/ReleaseNotes.md
