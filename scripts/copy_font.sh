#!/usr/bin/env bash

cd "$(dirname "$0")" && cd ..

mkdir -p "export/LimbusCompany_Data/Lang/$1/Font/Context"
mkdir -p "export/LimbusCompany_Data/Lang/$1/Font/Title"

cp fonts/SarasaGothicTC-Bold.ttf "export/LimbusCompany_Data/Lang/$1/Font/Context/Context.ttf"
cp fonts/SarasaGothicTC-Bold.ttf "export/LimbusCompany_Data/Lang/$1/Font/Title/Title.ttf"
