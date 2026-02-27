import time
import oandapyv20
import oandapyv20.endpoints.orders as orders
import oandapyv20.endpoints.pricing as pricing
from oandapyv20.contrib.requests import MarketOrderRequest, TakeProfitDetails, StopLossDetails

# ==========================================
# CONFIGURATION - PASTE YOUR KEYS HERE
# ==========================================
OANDA_API_TOKEN = "YOUR_OANDA_TOKEN_HERE"
OANDA_ACCOUNT_ID = "YOUR_ACCOUNT_ID_HERE"
ENVIRONMENT = "live" # or "practice"

class NYCLoveAgent:
    def __init__(self):
        self.client = oandapyv20.API(access_token=OANDA_API_TOKEN, environment=ENVIRONMENT)
        self.instruments = ["EUR_USD", "GBP_USD", "USD_JPY"]
        self.spread_limit = 1.2  # Reject if spread > 1.2 pips
        self.velocity_threshold = 1.5 # 150% volume spike
        
    def get_market_feelers(self, instrument):
        """ The 'Tentacles': Feeling for structural integrity """
        params = {"instruments": instrument}
        r = pricing.PricingInfo(accountID=OANDA_ACCOUNT_ID, params=params)
        rv = self.client.request(r)
        
        bid = float(rv['prices'][0]['bids'][0]['price'])
        ask = float(rv['prices'][0]['asks'][0]['price'])
        spread = (ask - bid) * 10000 
        mid_price = (bid + ask) / 2
        
        # Velocity Logic (Simplified for OANDA streaming)
        # In a production environment, compare this to a moving average of volume
        return {"price": mid_price, "spread": spread}

    def execute_trade(self, instrument, units, direction):
        """ The Executioner: Zero-slippage intent """
        price = self.get_market_feelers(instrument)["price"]
        
        # 20 pip Stop Loss | 60 pip Take Profit (3:1 Reward/Risk)
        side = 1 if direction == "BUY" else -1
        sl_price = round(price - (side * 0.0020), 5)
        tp_price = round(price + (side * 0.0060), 5)

        mktOrder = MarketOrderRequest(
            instrument=instrument,
            units=units if direction == "BUY" else -units,
            takeProfitOnFill=TakeProfitDetails(price=tp_price).data,
            stopLossOnFill=StopLossDetails(price=sl_price).data
        )
        
        print(f"[NYC LOVE] Executing {direction} on {instrument} at {price}")
        r = orders.OrderCreate(OANDA_ACCOUNT_ID, data=mktOrder.data)
        return self.client.request(r)

    def run(self):
        print(f"NYC Love Agent Live | NY Open: {time.strftime('%H:%M:%S')}")
        while True:
            for inst in self.instruments:
                data = self.get_market_feelers(inst)
                
                # SPREAD SHIELD: Fixes the 'Paper Cut' problem
                if data['spread'] > self.spread_limit:
                    print(f"Spread Shield Active: Skipping {inst} (Spread: {data['spread']:.1f})")
                    continue
                
                # VELOCITY & PRESSURE: Wait for the 8:30AM - 9:30AM surge
                # Add your custom indicator logic here to trigger 'direction'
                # Example: if velocity > threshold: self.execute_trade(inst, 1000, "BUY")
                
            time.sleep(5) # High-frequency scan

if __name__ == "__main__":
    agent = NYCLoveAgent()
    agent.run()
