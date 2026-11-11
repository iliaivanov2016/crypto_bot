/*
node bot.js > log.txt
pm2 start /home/ivanov_iv/node/bot.js -o /home/ivanov_iv/node/log.txt -e /home/ivanov_iv/node/errors.txt --name="test bot"
*/
import fs from 'fs';
import axios from "axios";
import crypto from 'crypto';

const version = "1.2";

let pool = null;
let prices = null;
let is_running = false;
let start_minute = 0;
let start_hour = 0;

const PERIOD = 14;
const MIN_RSI_SEND_MESSAGE = 35;

function getDateTime() {
    let dt = new Date();
    return dt.toLocaleDateString() + " " + dt.toLocaleTimeString();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function roundNumber(num){
    let res = Number(num.toFixed(2));
    return res;
}

function createPriceObject(){
    return {
        "price":        0,
        "rsi":          0,
        "percent":      0,
    }
}

async function createPrices(){
    let ar, token;
    prices =  {
        "4h": {
            "messages": []
        },
        "15m": {
            "messages": []
        },
    };
    ar = (""+process.env.rsi4h_tokens).split(",");
    for (let i = 0; i < ar.length; i++) {
        token = (""+ar[i]).trim();
        if (token.length > 0){
            prices["4h"][ token ] = createPriceObject();
        }
    }
    ar = (""+process.env.rsi15m_tokens).split(",");
    for (let i = 0; i < ar.length; i++) {
        token = (""+ar[i]).trim();
        if (token.length > 0){
            prices["15m"][ token ] = createPriceObject();
            prices["4h"][ token ] = createPriceObject();
        }
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

async function updateToken(mode, token, price, percent24h){
    let msg;
    let rsi15 = -1;
    let rsi4 = -1;
    let minute_token = prices["15m"].hasOwnProperty(token);
    let long_token = prices["4h"].hasOwnProperty(token);

    if (minute_token || long_token){
        console.log(getDateTime(), ">updateToken "+token, price, percent24h, minute_token, long_token)
    }

    if (minute_token) {
        if (prices["15m"][token].price == 0) {
            rsi15 = await getRSI(token+"USDT", 15, mode,  PERIOD);
            prices["15m"][token].price = price;
            prices["15m"][token].rsi = rsi15;
            prices["15m"][token].percent = percent24h;
            rsi4 = await getRSI(token+"USDT", 240, mode,  PERIOD);
            prices["4h"][token].price = price;
            prices["4h"][token].rsi = rsi4;
            prices["4h"][token].percent = percent24h;
            if ((rsi15 <= MIN_RSI_SEND_MESSAGE) && (rsi15 >= 0)){
                msg = token + " RSI = " + rsi15 + " Price = " + price + " Percent (24h) = " + percent24h;
                prices["15m"].messages.push(msg);
            }
            if ((rsi4 <= MIN_RSI_SEND_MESSAGE) && (rsi4 >= 0)){
                msg = token + " RSI = " + rsi4 + " Price = " + price + " Percent (24h) = " + percent24h;
                prices["4h"].messages.push(msg);
            }
        }
    } else if (long_token) {
        if (prices["4h"][token].price == 0) {
            rsi4 = await getRSI(token + "USDT", 240, mode, PERIOD);
            prices["4h"][token].price = price;
            prices["4h"][token].rsi = rsi4;
            prices["4h"][token].percent = percent24h;
            if ((rsi4 <= MIN_RSI_SEND_MESSAGE) && (rsi4 >= 0)){
                msg = token + " RSI = " + rsi4 + " Price = " + price + " Percent (24h) = " + percent24h;
                prices["4h"].messages.push(msg);
            }
        }
    }
}

async function getBybitPrices() {
    let params, url, res;
    params = "category=spot";
    url = process.env.bybit_api_url + "/v5/market/tickers?" + params;

    console.log(getDateTime(), "Spot...\n"+url);

    res = await axios.get(url);

    console.log(getDateTime(), "Spot... Done!\n"+url);

    try {
        await Promise.all(
            res.data.result.list.map(async (data) => {
                const token = (""+data.symbol).replace('USDT','').trim();
                const price = parseFloat(data.lastPrice);
                const percent = parseFloat(data.price24hPcnt*100);
                await updateToken("spot", token, price, roundNumber(percent));
            })
        );
    } catch(e){
        throw new Error("Failed to get Bybit spot prices: \n"+url+"\n"+e.message);
    }

    params = "category=linear";

    url = process.env.bybit_api_url + "/v5/market/tickers?" + params;

    console.log(getDateTime(), "Futures...\n"+url);

    res = await axios.get(url);

    console.log(getDateTime(), "Futures... Done!\n"+url);

    try {
        await Promise.all(
            res.data.result.list.map(async (data) => {
                const token = (""+data.symbol).replace('USDT','').trim();
                const price = parseFloat(data.lastPrice);
                const percent = parseFloat(data.price24hPcnt*100);
                await updateToken("linear", token, price, roundNumber(percent));
            })
        );
    } catch(e){
        throw new Error("Failed to get Bybit spot prices: \n"+url+"\n"+e.message);
    }
}

async function getRSI(symbol, interval = 240, mode="spot",  period = PERIOD) {
    const url = new URL(
        process.env.bybit_api_url + "/v5/market/kline"
    );

    url.searchParams.set("category", mode);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", "200");

    try {
        const response = await fetch(url);
        const json = await response.json();

        if (!response.ok || json.retCode !== 0) {
            throw new Error(json.retMsg || `HTTP ${response.status}`);
        }

        let candles = json.result.list;

        // Oldest to newest
        candles.reverse();

        // Remove currently forming candle
//    candles = candles.slice(0, -1);

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
    } catch(e) {
        console.log(getDateTime(), "Error getting RSI\n"+url+"\n"+e.message);
        return -1;
    }
}

async function sendMessage(msg){
    const proxy_settings = {
        protocol: "http",
        host: process.env.proxy_host,
        port: process.env.proxy_port,
        auth: {
            username: process.env.proxy_user,
            password: process.env.proxy_password
        }
    };
    let url = process.env.tg_bot_api_url.replace('{TOKEN}', process.env.tg_bot_token);
    let parameters = {
        'method': "sendMessage",
        'chat_id': process.env.tg_bot_channel_id,
        'text': msg
    };
    const args = {
        headers: {
            'Content-Type': 'application/json'
        },
        proxy: proxy_settings
    };
    console.log(getDateTime(), "send message...", args);
    const response = await axios.post(url, parameters, args);
    console.log(getDateTime(), "send message... Done!", response.data, response.status, response.statusText);
}

async function run(){
    //
    is_running = true;
    try {

        await createPrices();

        console.log(getDateTime(), "Getting prices...", prices);

        await getBybitPrices();

        console.log(getDateTime(), "Getting prices... Done!", prices);

        try {
            fs.unlinkSync("res.json");
        }catch(err){}
        fs.writeFileSync("res.json", JSON.stringify(prices));

        if ((start_minute == 0) && (prices["4h"].messages.length > 0)){
            await sendMessage("\n\nRSI 4 hours:\n"+prices["4h"].messages.join("\n"));
            console.log(getDateTime(), "Sent 4 hours!", prices["4h"].messages.join("\n"));
        }

        if (prices["15m"].messages.length > 0){
            await sendMessage("\n\nRSI 15 minutes:\n"+prices["15m"].messages.join("\n"));
            console.log(getDateTime(), "Sent 15 minutess!", prices["15m"].messages.join("\n"));
        }

        console.log(getDateTime(), "Run finished!");

        is_running = false;
     //   process.exit(0);

    } catch(e) {
        is_running = false;
        console.log("error", e.message);
        process.exit(0);
    }

}

async function check_run(){
    if (!is_running) {

        const now = new Date();

        start_hour = now.getUTCHours();
        start_minute = now.getUTCMinutes();

        let need_run = (start_minute % 15 == 0);

   //     need_run = true;

        console.log(start_hour+":"+start_minute+" - need = " + need_run);
        if (need_run){
            is_running = true;
            await run();
        }
    }
}

new Promise(async function (resolve, reject) {
    console.log(getDateTime(), ">bot main version = " + version, getDateTime());

    process.loadEnvFile(".env");

    setInterval(async function(){
        await check_run();
    }, 60000);

    await check_run();
});