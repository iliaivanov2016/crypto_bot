/*
node spot_bot.js > log.txt
00:00	02:00
04:00	06:00
08:00	10:00
12:00	14:00
16:00	18:00
20:00	22:00
 */
import fs from 'fs';
import { Pool } from 'pg'
import cmd from 'node-cmd';
import axios from "axios";
import crypto from 'crypto';

const version = "1.0";

let pool = null;
let prices = {};
let symbols = [];
let is_running = false;
let proxy_settings = null;

const CLOSE_CANDLE_HOURS = [0,4,8,12,16,20];
const CLOSE_CANDLE_MINUTE = 0;
const PERIOD = 14;


function getDateTime() {
    var dt = new Date();
    return dt.toLocaleDateString() + " " + dt.toLocaleTimeString();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function init(){
    var args = null, sql, res;
    process.loadEnvFile(".env");
    
    args = {
      user:     process.env.db_user,
      database: process.env.db_name,
      password: process.env.db_pass,
      host:     process.env.db_host,
      port:     process.env.db_port,
      min:      1,
      max:      process.env.max_threads, // max number of clients in the pool
      connectionTimeoutMillis:  15000,
      idleTimeoutMillis:        30000 
    };
    
    proxy_settings = { 
        protocol: "http", 
        host: process.env.proxy_host,
        port: process.env.proxy_port,
        auth: {
            username: process.env.proxy_user,
            password: process.env.proxy_password
        }
    };
//console.log(proxy_settings);
    
    pool = new Pool( args ); 

}


async function run(){
    //
    is_running = true;
    try {

        console.log(getDateTime(), "running...", prices);

        const date = new Date();
        date.setHours(date.getHours() - 3);

        const sql = `    
                            SELECT string_agg(DISTINCT token::text, ',') AS tokens 
                            FROM tokens_rsi_trading 
                            WHERE (rsi4h IS NULL) OR (updated < LOCALTIMESTAMP - interval '3' hour)`;

        const res = await pool.query(sql, []);
        if (res.rows.length == 1){
            let row = res.rows.shift();
            let tokens = row.tokens.split(",");
            for (var i = 0; i < tokens.length; i++){
                prices[tokens[i]] = {
                    price: 0,
                    percent: 0
                }

            }
            console.log(getDateTime(), tokens.length+" - tokens needs updates", prices);
        }

        await getBybitPrices();

        try {
            fs.unlinkSync("res.json");
        }catch(err){}
        fs.writeFileSync("res.json", JSON.stringify(prices));
        console.log(getDateTime(), "prices updated!");

        is_running = false;

    } catch(e) {
        is_running = false;
        console.log("error", e.message);
        process.exit(0);
    }

}

async function check_run(){
    if (!is_running) {

        const now = new Date();

        const hour = now.getUTCHours();
        const minute = now.getUTCMinutes();

        let need_run = (CLOSE_CANDLE_HOURS.indexOf(hour) >= 0) && (minute == CLOSE_CANDLE_MINUTE);
        //need_run = true;
        console.log(hour+":"+minute+" - need=" + need_run);
        //process.exit(0);
//        const qty = parseInt(res.rows[0].qty);
        if (need_run){
            is_running = true;
            await run();
        }    
    }
}

function roundNumber(num){
    let res = Number(num.toFixed(2));
    return res;
}

async function getTokenRSI(token){
    let request_headers = {
        "X-API-Key":            process.env.crypto_api_key
    };
    let url = process.env.crypto_api_url;
    url = url.replace('{TOKEN}', token);
    let args = {
        headers: request_headers
    };
    console.log(getDateTime(),">getTokenRSI token = "+token, args);

    while (true){
        try {
            const res = await axios.get(url, args);
            const data = res.data;
        }catch (e) {
            console.log(getDateTime(),"Error getting RSI - "+token, e.message);
            if (e.message.indexOf("429") < 0) {
                process.exit(0);
            }
            sleep(SLEEP_TIME);
        }

    }

    console.log(getDateTime(),"<getTokenRSI token = "+token);

    return roundNumber(parseFloat(res.data.value));
}

async function updateToken(token){
    const utc = new Date().toISOString();
    let sql = `UPDATE tokens_rsi_trading
                        SET 
                            rsi4h = $2, 
                            price = $3,
                            percent24h = $4,
                            api_time = NOW() AT TIME ZONE 'UTC'
                        WHERE token = $1`;
    let data = [token, prices[token].rsi4h, prices[token].price, prices[token].percent];
    await pool.query(sql ,
        data
    );
    //console.log(token, data, prices[token], sql);
    console.log(getDateTime(), "<updateToken token = "+token, prices[token]);

    if (prices[token].rsi4h <= 30){
        let msg = token+" RSI(4h) = "+prices[token].rsi4h+" Price = "+prices[token].price+" Percent (24h) = "+prices[token].percent;
        await sendMessage(msg);
    }
}

async function get_bybit_header(params){
    var ts = new Date().getTime();
    var recv_window = "5000";
    var s = "" + ts + process.env.bybit_api_key + recv_window + params;
    var sign = crypto.createHash('sha256').update(s).digest('hex');
    var request_headers = {
        "X-BAPI-API-KEY":       process.env.bybit_api_key,
        "X-BAPI-TIMESTAMP":     ts,
        "X-BAPI-SIGN":          sign
    };
    return request_headers;
}

async function sendMessage(msg){
    let url = process.env.tg_bot_api_url.replace('{TOKEN}', process.env.tg_bot_token);
    let parameters = {
        'method': "sendMessage",
        'chat_id': process.env.tg_bot_channel_id,
        'text': msg
    };
    const response = await axios.post(url, parameters, {
        headers: {
            'Content-Type': 'application/json'
        }
    });
    console.log(response.data, response.status, response.statusText);
}

async function getBybitPrices() {
    let params = "category=spot";
    let url = process.env.bybit_api_url + "/v5/market/tickers?" + params;

    let args = {
        headers: get_bybit_header(params)
    };

    const res = await axios.get(url, args);

    try {
        await Promise.all(
            res.data.result.list.map(async (data) => {
                const token = (""+data.symbol).replace('USDT','').trim();
                const price = parseFloat(data.lastPrice);
                const percent = parseFloat(data.price24hPcnt*100);
                if (prices.hasOwnProperty(token)) {
                    console.log(getDateTime(),">token = "+token);
                    prices[token] = {
                        "price": price,
                        "percent": roundNumber(percent),
                        "rsi4h": await getRSI(token+"USDT", PERIOD)
                    }
                    await updateToken(token);
                    console.log(getDateTime(),"<token = "+token, prices[token]);
                }
            })
        );
    } catch(e){
        throw new Error("Failed to get Bybit spot prices: \n"+url+"\n"+e.message);
    }
}

async function getRSI(symbol, period = 14) {
    const url = new URL(
        process.env.bybit_api_url + "/v5/market/kline"
    );

    url.searchParams.set("category", "spot");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", "240");
    url.searchParams.set("limit", "200");

    const response = await fetch(url);
    const json = await response.json();

    if (!response.ok || json.retCode !== 0) {
        throw new Error(json.retMsg || `HTTP ${response.status}`);
    }

    let candles = json.result.list;

    // Oldest to newest
    candles.reverse();

    // Remove currently forming candle
    candles = candles.slice(0, -1);

    const closes = candles.map(c => Number(c[4]));

    if (closes.length < period + 1) {
        throw new Error("Not enough candles");
    }

    let avgGain = 0;
    let avgLoss = 0;

    // Initial averages
    for (let i = 1; i <= period; i++) {
        const change = closes[i] - closes[i - 1];

        avgGain += Math.max(change, 0);
        avgLoss += Math.max(-change, 0);
    }

    avgGain /= period;
    avgLoss /= period;

    // Wilder RSI
    for (let i = period + 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];

        const gain = Math.max(change, 0);
        const loss = Math.max(-change, 0);

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) {
        return avgGain === 0 ? 50 : 100;
    }

    const rs = avgGain / avgLoss;

    return Number((100 - 100 / (1 + rs)).toFixed(2));
}

new Promise(async function (resolve, reject) {
    console.log(getDateTime(), ">spot_bot main version = " + version, getDateTime());
    await init();

    //await getTokenRSI("ENA");

   //await test_bybit();
    setInterval(async function(){
        await check_run();
    }, 60000);

    await check_run();
   // await get_spread();
//    process.exit(0);
    
    
   // await test_gate();
    //await test_mexc();
    /*
    setInterval(async function(){
        await check_run();
    }, 10000);
    await check_run();
    */
//    await pool.end();
//    process.exit(0);
    
});


/*
 * 
 */

