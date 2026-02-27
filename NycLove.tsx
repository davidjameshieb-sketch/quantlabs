import time
# Assume acuraland is your local or imported API wrapper
import acuraland_api as api 

class NYCLoveAgent:
    def __init__(self):
        self.symbol_list = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD"]
        self.spread_limit = 1.2 / 10000 # 1.2 pips
        self.velocity_threshold = 1.5 # 150% volume spike
        self.current_trades = {}

    def get_market_feelers(self, symbol):
        """
        The 'Tentacles': Feeling for volume spikes and 
        institutional pressure instead of retail noise.
        """
        ticker = api.get_ticker(symbol)
        volume_now = ticker['volume']
        volume_avg = api.get_historical_avg_volume(symbol, window="1h")
        
        # Velocity Feeler
        velocity = volume_now / volume_avg if volume_avg > 0 else 0
        
        # Spread Shield
        spread = ticker['ask'] - ticker['bid']
        
        return {
            "velocity": velocity,
            "spread": spread,
            "price": ticker['last']
        }

    def execute_logic(self):
        print("NYC Love Agent: Scanning New York Session...")
        
        for symbol in self.symbol_list:
            stats = self.get_market_feelers(symbol)
            
            # 1. Check Spread Shield (Avoid paper cuts)
            if stats['spread'] > self.spread_limit:
                print(f"Retracting tentacles for {symbol}: Spread too high ({stats['spread']})")
                continue

            # 2. Check Velocity Feeler (Detecting institutional moves)
            if stats['velocity'] > self.velocity_threshold:
                print(f"High Velocity detected on {symbol}! Feeling market pressure...")
                
                # Logic: If high volume spike + trend confirmation = GET IN
                # (Simple trend check: current price > 20 EMA)
                if api.is_trending_up(symbol):
                    api.place_order(symbol, "BUY", amount=1000, stop_loss=20, take_profit=60)
                    print(f"NYC Love: Long position entered for {symbol}")

    def run(self):
        while True:
            # Only trade during NY Session hours (approx 8:00 AM - 5:00 PM EST)
            self.execute_logic()
            time.sleep(60) # Scan every minute

if __name__ == "__main__":
    agent = NYCLoveAgent()
    agent.run()
