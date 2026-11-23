#!/bin/sh
# Runs the broad test (all player types × seeds) and writes docs/simulations/broad-test.md
set -e
cd "$(dirname "$0")/.."
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
mkdir -p sim/out docs/simulations
$JSC -m sim/broad.js > sim/out/broad-raw.txt
python3 - <<'EOF'
raw = open('sim/out/broad-raw.txt', encoding='utf-8').read()
report = raw.split('@@REPORT@@\n', 1)[1].split('\n@@END@@', 1)[0]
open('docs/simulations/broad-test.md', 'w', encoding='utf-8').write(report + '\n')
print('report: docs/simulations/broad-test.md')
EOF
rm sim/out/broad-raw.txt
