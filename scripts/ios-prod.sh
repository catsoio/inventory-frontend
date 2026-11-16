#!/usr/bin/env bash
# Kör appen i iOS (simulator eller riktig iPhone, du väljer i listan) mot produktionsmiljön:
# produktionsbygge av webbdelen (API: https://api.catso.io/api), synk till iOS-projektet och start.
# Ingen live reload: ändringar kräver att skriptet körs om. Det här är samma bygge som går till
# App Store, så använd riktiga konton med försiktighet: allt du gör sparas i produktion.
set -euo pipefail
cd "$(dirname "$0")/.."

npx ng build --configuration production
# `cap run` synkar själv, och synken tar bort en eventuell live reload-adress från tidigare körningar.
npx cap run ios
