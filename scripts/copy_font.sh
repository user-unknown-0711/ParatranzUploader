#!/usr/bin/env bash

cd "$(dirname "$0")" && cd ..

mkdir -p export/LimbusCompany_Data/Lang/TW/Font/Context
mkdir -p export/LimbusCompany_Data/Lang/TW/Font/Title

cp fonts/SarasaGothicTC-Bold.ttf export/LimbusCompany_Data/Lang/TW/Font/Context/Context.ttf
cp fonts/SarasaGothicTC-Bold.ttf export/LimbusCompany_Data/Lang/TW/Font/Title/Title.ttf
