#!/bin/sh
# Runs the raising simulation and writes the report + importable save file.
set -e
cd "$(dirname "$0")/.."
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
mkdir -p sim/out docs/simulations
$JSC -m sim/raise.js > sim/out/raw.txt
python3 - <<'EOF'
raw = open('sim/out/raw.txt', encoding='utf-8').read()
report = raw.split('@@REPORT@@\n', 1)[1].split('\n@@SAVE@@', 1)[0]
save = raw.split('@@SAVE@@\n', 1)[1].split('\n@@END@@', 1)[0]
open('docs/simulations/raising-7days.md', 'w', encoding='utf-8').write(report + '\n')
open('sim/out/raised-7days.json', 'w', encoding='utf-8').write(save)
print('report: docs/simulations/raising-7days.md')
print('save:   sim/out/raised-7days.json')
EOF
rm sim/out/raw.txt
