Crypto bot gets tokens and prices from popular crypto exchanges Mexc, Gate, Bybit
Stores data in PostgreSQL db

.env file:

db_host=127.0.0.1
db_port=5432
db_user=postgres
db_pass=""
db_name="crypto_db"
max_threads=16
proxy_host="196.198.29.92"
proxy_port="49155"
proxy_user="modcoding"
proxy_password="xxx"
crypto_api_key="rsi_LuuhDc-KJa-Fz0BX9T8V9MssxkhsrGgIsbWbzahI6I4"
crypto_api_url="https://rsi.to/api/rsi?exchange=binance&symbol={TOKEN}USDT&interval=4h"
tg_bot_token=""
tg_bot_channel_id="@modcodingtest1980"
tg_bot_api_url="https://api.telegram.org/bot{TOKEN}/"
bybit_api_key=""
bybit_api_url="https://api.bybit.com"
