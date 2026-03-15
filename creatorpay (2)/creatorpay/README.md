# CreatorPay — Full Stack Payment Platform

A production-ready fintech platform for freelancers & creators to accept **crypto + fiat** via shareable links.

## Tech Stack
| Layer | Tech |
|---|---|
| Frontend | React 18, TailwindCSS, Chart.js, React Router |
| Backend | Node.js, Express.js, JWT Auth |
| Database | MongoDB (Mongoose) |
| Payments | Stripe, Razorpay, Ethers.js (ETH/ERC-20) |

## Quick Start

### 1. Install
```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure
```bash
cd backend
cp .env.example .env
# Fill in MONGO_URI, JWT_SECRET, STRIPE_SECRET_KEY, RAZORPAY_KEY_ID, ETH_RPC_URL
```

### 3. Seed demo data
```bash
cd backend && npm run seed
# Admin: admin@creatorpay.io / Admin123!
# Creator: aryan@example.com / Creator123!
```

### 4. Run
```bash
# Terminal 1
cd backend && npm run dev      # API on :5000

# Terminal 2
cd frontend && npm run dev     # UI on :5173
```

## Git Push
```bash
git add .
git commit -m "feat: CreatorPay full stack — React + Node + MongoDB + Stripe + Razorpay + Web3"
git push origin main
```
