#!/bin/sh
# 公開前チェックを入れる（1回だけ）
cp scripts/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit && echo "installed"
