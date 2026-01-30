

# The Neural Brain - AI Market Analysis Platform

A subscription-based "Glass Box" market intelligence platform that provides transparent, explainable market analysis across Forex, Indices, Commodities, and Crypto.

---

## Phase 1: Foundation & Authentication

### Landing Page
- **Hero section** with futuristic neural network animated background
- Platform value proposition: "Understand markets, don't just follow signals"
- Feature highlights with glowing card components
- Pricing section showing all 5 tiers with 2-week free trial badge
- Call-to-action buttons for signup

### Authentication System
- Email/password registration and login
- Google OAuth integration
- Protected routes for dashboard access
- User profile management

---

## Phase 2: Core Analysis Engine (Mock Data)

### Market Data Generator
- Realistic mock data for 20+ tickers across:
  - **Forex**: EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD
  - **Indices**: S&P 500, NASDAQ, DOW, DAX, FTSE
  - **Commodities**: Gold, Silver, Crude Oil, Natural Gas
  - **Crypto**: BTC, ETH, SOL, XRP, ADA
- Price series with OHLC data across multiple timeframes

### Analysis Algorithms
- **Efficiency Score Calculator**: Net move vs path noise ratio
- **Neural Trend Cores**: Adaptive trend proxies with kernel smoothing
- **Bias Detection**: Bullish/Bearish based on core relationships
- **Conviction Tracker**: Spread delta analysis (Gaining/Losing)
- **Confidence Score**: ATR-normalized percentage
- **Strategy Decision Tree**: Mapping conditions to actionable states

---

## Phase 3: Dashboards & Visualizations (Futuristic Neural Design)

### Market Scanner
- Grid view of all tickers with real-time bias indicators
- Color-coded efficiency verdicts (Clean/Mixed/Noisy)
- Strategy state badges with glowing effects
- Filter by market type, bias direction, efficiency level

### Ticker Detail View
- Neural trend cloud visualization
- Efficiency and confidence gauges
- Plain-English narrative summary
- Multi-timeframe analysis grid (tier-gated)

### Cross-Market Dashboard
- Strongest/weakest structures scanner
- Market-to-market comparisons
- Timeframe alignment detection

---

## Phase 4: Subscription Tiers & Stripe Integration

### Stripe Payment Flow
- Subscription checkout for each tier
- 2-week free trial implementation
- Upgrade/downgrade between tiers
- Billing portal for managing subscriptions

### Feature Gating by Tier

| Feature | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|---------|--------|--------|--------|--------|--------|
| All markets access | ✓ | ✓ | ✓ | ✓ | ✓ |
| Single-TF analysis | ✓ | ✓ | ✓ | ✓ | ✓ |
| Neural narrative | ✓ | ✓ | ✓ | ✓ | ✓ |
| Multi-TF view | - | ✓ | ✓ | ✓ | ✓ |
| Confidence/Conviction | - | ✓ | ✓ | ✓ | ✓ |
| Full TF stack | - | - | ✓ | ✓ | ✓ |
| Aggregated scores | - | - | ✓ | ✓ | ✓ |
| Cross-market scanner | - | - | ✓ | ✓ | ✓ |
| Historical regimes | - | - | - | ✓ | ✓ |
| Custom dashboards | - | - | - | ✓ | ✓ |
| State-change alerts | - | - | - | ✓ | ✓ |
| Full metric transparency | - | - | - | - | ✓ |
| Export summaries | - | - | - | - | ✓ |

---

## Phase 5: User Experience Polish

### Design System
- Dark theme with neon cyan/purple accents
- Gradient glows and neural network patterns
- Animated data transitions
- Responsive mobile-first layouts

### Navigation
- Collapsible sidebar with market categories
- Quick-access ticker search
- User account dropdown with tier badge

---

## Technical Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Lovable Cloud with Edge Functions
- **Database**: Supabase (users, subscriptions, preferences)
- **Payments**: Stripe subscriptions
- **Auth**: Supabase Auth (Email + Google OAuth)

---

## Future Enhancements (Post-MVP)

- Real market data API integration (Polygon.io, TwelveData, etc.)
- Push notifications for state changes
- Community intelligence layer
- Mobile app version

