/*
node tbot.js > log.txt
pm2 start /home/ivanov_iv/node/t-bot/tbot.js -o /home/ivanov_iv/node/t-bot/tlog.txt -e /home/ivanov_iv/node/t-bot/terrors.txt --name="t bot"  --node-args="--use-system-ca"

node --use-system-ca tbot.js > log.txt
*/
import fs from 'fs';
import axios from "axios";
import { TinkoffInvestApi } from 'tinkoff-invest-api';

import { CandleInterval } from
        'tinkoff-invest-api/dist/generated/marketdata.js';

import { InstrumentIdType } from
        'tinkoff-invest-api/dist/generated/instruments.js';

//const TICKER = 'SBER';      // можно и figi — тогда idType FIGI
const CLASS_CODE = 'TQBR';  // основной режим торгов акций MOEX
const RSI_PERIOD = 14;


const quotationToNumber = (q) => Number(q.units) + q.nano / 1e9;

const version = "1.1";

let api;
let prices = null;
let is_running = false;
let start_minute = 0;
let start_hour = 0;

const PERIOD = 14;
const MIN_RSI_SEND_MESSAGE_1D = 40;
const MIN_RSI_SEND_MESSAGE_4H = 35;
const DELAY = 100; // 100 ms
const MIN_HOUR = 9;

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
        "rsi1d":        0,
        "rsi4h":        0,
    }
}

async function createPrices(){
    prices =  {
        "tickers": (""+process.env.tokens).split(","),
        "tokens": {},
        "4h": {
            "messages": []
        },
        "1d": {
            "messages": []
        },
    };
}

async function getCandles(instrument, interval, delta) {

    // 30 дней запаса хватает для прогрева RSI на 4H
    const { candles } = await api.marketdata.getCandles({
        figi: instrument.figi,
        instrumentId: instrument.uid,
        interval: interval,
        from: new Date(Date.now() - delta),
        to: new Date(),
    });

    return candles
        .filter((c) => c.isComplete)          // только закрытые свечи
        .map((c) => ({
            time: c.time,
            close: quotationToNumber(c.close),
        }));
}

// RSI по Уайлдеру (как в TradingView): EMA с alpha = 1/period
function rsiWilder(closes, period = RSI_PERIOD) {
    if (closes.length < period + 1) throw new Error('мало свечей для RSI');

    const gains = [], losses = [];
    for (let i = 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        gains.push(Math.max(diff, 0));
        losses.push(Math.max(-diff, 0));
    }

    let avgGain = gains.slice(0, period).reduce((a, b) => a + b) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b) / period;

    const rsiSeries = [];
    for (let i = period - 1; i < gains.length; i++) {
        if (i >= period) {
            avgGain = (avgGain * (period - 1) + gains[i]) / period;
            avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        }
        rsiSeries.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
    return rsiSeries;
}

async function getPriceRSI(instrument, interval, delta){
    const candles = await getCandles(instrument, interval, delta);
    const rsi = rsiWilder(candles.map((c) => c.close));
    //const last = candles.at(-1);
    return rsi.at(-1).toFixed(1);
}

async function updateToken(ticker){

    let msg;

    try {
        /*
            const result = await api.instruments.findInstrument({
                query: ticker
            });

            fs.writeFileSync("instr.json", JSON.stringify(result.instruments, null, 2));
        */
        let args = {
            idType: 2, // INSTRUMENT_ID_TYPE_TICKER
            id: String(ticker).trim(),
            classCode: CLASS_CODE,
        };

        console.log(getDateTime(), ">updateToken "+ticker, args);

        const { instrument } = await api.instruments.getInstrumentBy(args);
        const rsi4h = await getPriceRSI(instrument, CandleInterval.CANDLE_INTERVAL_4_HOUR, 30 * 24 * 60 * 60 * 1000); // 30 days
        const rsi1d = await getPriceRSI(instrument, CandleInterval.CANDLE_INTERVAL_DAY, 200 * 24 * 60 * 60 * 1000); // 200 days
        const { lastPrices } = await api.marketdata.getLastPrices({
            instrumentId: [instrument.uid],
            figi: [instrument.figi]
        });
        const price = quotationToNumber(lastPrices[0].price);

        prices["tokens"][ticker] = createPriceObject();
        prices["tokens"][ticker].price = price;
        prices["tokens"][ticker].rsi1d = rsi1d;
        prices["tokens"][ticker].rsi4h = rsi4h;

        if ((rsi1d <= MIN_RSI_SEND_MESSAGE_1D) && (rsi1d >= 0)){
            msg = ticker + "\tRSI 1D = " + rsi1d + " Price = " + price;
            prices["1d"].messages.push(msg);
        }

        if ((rsi4h <= MIN_RSI_SEND_MESSAGE_4H) && (rsi4h >= 0)){
            msg = ticker + "\tRSI 4H = " + rsi4h + " Price = " + price;
            prices["4h"].messages.push(msg);
        }

        sleep(DELAY);

    } catch(e) {
        console.log("error "+ticker+"\n"+e.message);
    }
}

async function getTinkoffPrices() {
    try {
        api = new TinkoffInvestApi({ token: process.env.t_token });

        for (const ticker of prices.tickers) {
            await updateToken(ticker);
        }
        /*
        await Promise.all(
            prices.tickers.map(async (ticker) => {
                await updateToken(ticker);
            })
        );
         */
    } catch(e){
        throw new Error("Error in getTinkoffPrices: \n"+e.message);
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

        await getTinkoffPrices();

        console.log(getDateTime(), "Getting prices... Done!", prices);

        try {
            fs.unlinkSync("res.json");
        }catch(err){}
        fs.writeFileSync("t_res.json", JSON.stringify(prices));

        if (prices["4h"].messages.length > 0){
            await sendMessage("\n\nT-BOT RSI 4H:\n"+prices["4h"].messages.join("\n"));
            console.log(getDateTime(), "Sent 4H!", prices["4h"].messages.join("\n"));
        }

        if (prices["1d"].messages.length > 0){
            await sendMessage("\n\nT-BOT RSI 1D:\n"+prices["1d"].messages.join("\n"));
            console.log(getDateTime(), "Sent 1D!", prices["1d"].messages.join("\n"));
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

        start_hour = now.getHours();
        start_minute = now.getUTCMinutes();

        let need_run = (start_minute == 1) && (start_hour >= MIN_HOUR);

//        need_run = true;

        console.log(start_hour+":"+start_minute+" - need = " + need_run);
        if (need_run){
            is_running = true;
            await run();
//process.exit(0);
        }
    }
}

new Promise(async function (resolve, reject) {
    console.log(getDateTime(), ">tbot main version = " + version, getDateTime());

    process.loadEnvFile(".env");

    setInterval(async function(){
        await check_run();
    }, 60000);

    await check_run();
});

/*
curl -Iv https://invest-public-api.tbank.ru/ 2>&1 | grep "SSL certificate verify"
invest-public-api.tbank.ru

openssl s_client -connect invest-public-api.tbank.ru:443 -servername invest-public-api.tbank.ru -verify_return_error &1 | grep "Verify return code"

 */