#!/bin/bash
# Security Diagnostics Script
# Run this before deployment to check for security issues

echo "======================================"
echo "Molly-Core Security Diagnostics"
echo "======================================"
echo ""

EXIT_CODE=0

# Check 1: Memory Leaks (setInterval without cleanup)
echo "1. Checking for potential memory leaks..."
SETINTERVAL_FILES=$(grep -rl "setInterval" ../src --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null)

if [ -z "$SETINTERVAL_FILES" ]; then
  echo "   ✓ No setInterval usage found"
else
  for file in $SETINTERVAL_FILES; do
    if grep -q "clearInterval\|return.*=>" "$file"; then
      echo "   ✓ $file has proper cleanup"
    else
      echo "   ⚠️  WARNING: $file may have memory leak"
      EXIT_CODE=1
    fi
  done
fi
echo ""

# Check 2: Insecure encryption patterns
echo "2. Checking for insecure encryption patterns..."
INSECURE_SALT=$(grep -rE "(salt.*userId|salt.*=.*['\"]|userId.*salt)" ../src --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null)

if [ -z "$INSECURE_SALT" ]; then
  echo "   ✓ No insecure salt patterns detected"
else
  echo "   ⚠️  WARNING: Insecure salt usage detected:"
  echo "$INSECURE_SALT" | head -5
  EXIT_CODE=1
fi
echo ""

# Check 3: Admin functions without authentication
echo "3. Checking admin functions for authentication..."
ADMIN_FUNCS=$(grep -rE "function\s+(set|update|modify|change).*(State|Admin|Config)" ../src --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "password\|auth\|token" | head -5)

if [ -z "$ADMIN_FUNCS" ]; then
  echo "   ✓ Admin functions appear secure"
else
  echo "   ⚠️  WARNING: Admin functions without apparent authentication:"
  echo "$ADMIN_FUNCS"
  EXIT_CODE=1
fi
echo ""

# Check 4: Hardcoded secrets
echo "4. Checking for hardcoded secrets..."
SECRETS=$(grep -rE "(apiKey|api_key|secret|SECRET).*=.*['\"][a-zA-Z0-9]{20,}" ../src --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --exclude="*.test.*" --exclude="*.spec.*" 2>/dev/null | head -5)

if [ -z "$SECRETS" ]; then
  echo "   ✓ No obvious hardcoded secrets"
else
  echo "   ⚠️  WARNING: Potential hardcoded secrets:"
  echo "$SECRETS"
  EXIT_CODE=1
fi
echo ""

# Summary
echo "======================================"
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ All security checks passed!"
else
  echo "⚠️  Some security checks failed"
  echo "Please review warnings above"
fi
echo "======================================"

exit $EXIT_CODE
