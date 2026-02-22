# Memory: constraints/alpha-discovery-backtest-scope
Updated: Feb 22, 2026

Alpha discovery backtests run on 42,000 M30 candles (~955 trading days) per pair, using a 70/30 In-Sample/Out-of-Sample split. The simulation utilizes flat position sizing of $0.20 per pip (2000 units) on a $1,000 base equity to ensure total returns are realistic and directly proportional to net pips. Genetic Algorithm evolution employs a 50-population, 80-generation protocol with a 1-bar trade cooldown to maximize trade frequency and achieve the high-throughput goal of at least 8 trades every 3 days.