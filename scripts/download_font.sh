#!/usr/bin/env bash

cd "$(dirname "$0")" && cd ..

mkdir -p export/LimbusCompany_Data/Lang/TW/Font

curl -L -o export/LimbusCompany_Data/Lang/TW/Font/SourceHanSansHC-Bold.otf \
https://github.com/adobe-fonts/source-han-sans/raw/refs/heads/release/OTF/TraditionalChineseHK/SourceHanSansHC-Bold.otf

