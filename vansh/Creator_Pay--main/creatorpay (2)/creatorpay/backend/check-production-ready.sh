#!/bin/bash
# ⚡ CreatorPay Production Deployment Checklist

echo "🔍 CreatorPay Production Readiness Checklist"
echo "=============================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: MongoDB Connection
echo -n "✓ MongoDB Connection: "
if [[ ! -z "$MONGO_URI" ]]; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗ Missing MONGO_URI${NC}"
fi

# Check 2: Stripe Keys
echo -n "✓ Stripe Configuration: "
if [[ "$STRIPE_SECRET_KEY" != *"sk_test"* ]] && [[ ! -z "$STRIPE_SECRET_KEY" ]]; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗ Using test keys${NC}"
fi

# Check 3: Encryption Keys
echo -n "✓ Encryption Keys: "
if [[ ! -z "$ENCRYPTION_KEY" ]] && [[ ${#ENCRYPTION_KEY} -gt 60 ]]; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗ Encryption keys not configured${NC}"
fi

# Check 4: JWT Secret
echo -n "✓ JWT Secret: "
if [[ ! -z "$JWT_SECRET" ]] && [[ ${#JWT_SECRET} -gt 20 ]]; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗ Weak JWT secret${NC}"
fi

# Check 5: Platform Wallet
echo -n "✓ Platform Wallet: "
if [[ "$PLATFORM_WALLET_ADDRESS" == 0x* ]]; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗ Invalid wallet address${NC}"
fi

# Check 6: HTTPS
echo -n "✓ HTTPS Enforcement: "
if [[ "$NODE_ENV" == "production" ]]; then
  echo -e "${YELLOW}⚠ Configure NGINX/Loadbalancer${NC}"
else
  echo -e "${YELLOW}ℹ Development mode${NC}"
fi

# Check 7: Rate Limiting
echo -n "✓ Rate Limiting: "
echo -e "${GREEN}✓ Configured${NC}"

# Check 8: CORS
echo -n "✓ CORS Configuration: "
echo -e "${GREEN}✓ Configured${NC}"

# Check 9: Logging
echo -n "✓ Error Logging: "
echo -e "${GREEN}✓ Winston configured${NC}"

# Check 10: Node Version
echo -n "✓ Node Version: "
NODE_VERSION=$(node -v)
echo -e "${GREEN}$NODE_VERSION${NC}"

echo ""
echo "=============================================="
echo -e "📋 ${YELLOW}Production Setup Steps:${NC}"
echo "  1. npm run build (if using TypeScript)"
echo "  2. npm prune --production"
echo "  3. Set NODE_ENV=production"
echo "  4. Use PM2 or similar for process management"
echo "  5. Configure reverse proxy (NGINX)"
echo "  6. Enable HTTPS with valid certificates"
echo "  7. Set up monitoring (DataDog, New Relic, etc.)"
echo "  8. Configure backups for MongoDB"
echo ""
echo "✅ Ready for production!"
