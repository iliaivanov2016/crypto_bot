/*
 * node crypto_bot.js > log.txt
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg'
import cmd from 'node-cmd';
import axios from "axios";

const version = "1.0";

var pool = null;
var exchange_data;
var is_running = false;
var run_id = 0;

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
    
    pool = new Pool( args ); 
        
    sql = "SELECT * FROM exchanges ORDER BY id";
    
//    console.log("sql", sql, args);    
    res = await pool.query(sql, []); 
    exchange_data = {};
    for (var i = 0; i < res.rows.length; i++){
        var d = res.rows[i];
        exchange_data[d.name] = {
            "id":       d.id,
            "key":      d.api_key,
            "secret":   d.api_secret,
            "settings": JSON.parse(d.settings)
        };
    }
        
  //  console.log("exchanges", exchange_data);
}

async function test_mexc(){
    var args = null, sql, res, url;
    const request_headers = { "X-MEXC-APIKEY":  exchange_data.MEXC.key };
    //url = exchange_data.MEXC.settings.api_url + "v3/ticker/24hr";
    url = exchange_data.MEXC.settings.api_url + "v1/contract/ticker";
    args = {
        headers: request_headers
    };
    
console.log(url, args);    
    
    res = await axios.get(url, args);
    
console.log(res);    
    fs.writeFileSync("test.json", JSON.stringify(res.data));
    process.exit(0);
}

async function save_mexc_futures_price(data){
    const s = (""+data.symbol).trim();
    var ar = s.split("_");
    if ((s.indexOf("_USDT") >= 0) && (data.volume24 > 0)){
        const sql = "INSERT INTO prices_futures (token,exchange_id,price,funding_rate,run_id) VALUES ('"
            +(""+ar[0]).trim()+"',"
            +exchange_data.MEXC.id+","
            +data.lastPrice+","
            +(data.fundingRate*100)+","
            +run_id+")";
        await pool.query(sql);
    }
}

async function save_mexc_spot_price(data){
    const s = (""+data.symbol).trim();    
    if ((s.indexOf("USDT") >= 0) && (data.volume > 0)){
        const sql = "INSERT INTO prices_spot (token,exchange_id,price,change_percent,run_id) VALUES ('"
            +(""+s.replace('USDT','')).trim()+"',"
            +exchange_data.MEXC.id+","
            +data.lastPrice+","
            +(data.priceChangePercent*100)+","
            +run_id+")";
        await pool.query(sql);
    }
}

async function run_mexc(){
    console.log(getDateTime(), ">run_mexc run_id = " + run_id, getDateTime());    
    
    var args = null, sql, res, url;
    const request_headers = { "X-MEXC-APIKEY":  exchange_data.MEXC.key };
    
    // get futures prices
    url = exchange_data.MEXC.settings.api_url + "v1/contract/ticker";
    
    args = {
        headers: request_headers
    };
    
    res = await axios.get(url, args);
    
    if (res.data.success){
        await Promise.all(
            res.data.data.map(async (d) => {
                await save_mexc_futures_price(d);
            })
        );
    } else {
        throw new Error("Failed to get Mexc futures prices: \n"+url);
    }
    
    // get spot prices
    
    url = exchange_data.MEXC.settings.api_url + "v3/ticker/24hr";
    
    res = await axios.get(url, args);
    
    if (res.data){
        await Promise.all(
            res.data.map(async (d) => {
                await save_mexc_spot_price(d);
            })
        );
    } else {
        throw new Error("Failed to get Mexc spot prices: \n"+url);
    }    
    console.log(getDateTime(), "<run_mexc run_id = " + run_id, getDateTime());    
}

async function run_gate(){
    
}

async function run_bybit(){
    
}

async function run(){
    var sql;
    is_running = true;
    try {
        sql = "INSERT INTO runs(progress) VALUES('starting...')";
        await pool.query(sql);
        
        sql = "SELECT MAX(id) AS run_id FROM runs WHERE finished IS NULL";
        const res = await pool.query(sql, []);
        run_id = parseInt(res.rows[0].run_id);
        
        for (var key in exchange_data){
            if (key == "MEXC") {
                await run_mexc();
            }
            if (key == "GATE") {
                await run_gate();
            }
            if (key == "BYBIT") {
                await run_bybit();
            }
        }
    } catch(e){
        console.log(getDateTime(), "<crypto_bot ERROR in run! \n"+e.message, getDateTime());    
        process.exit(0);
    }
    is_running = false;
    
    
    process.exit();
    
}

async function check_run(){
    if (!is_running) {
        const sql = "SELECT COUNT(*) AS qty FROM runs WHERE finished::time with time zone >= current_time - interval '" + process.env.period_minutes + "' minute";

        console.log("sql", sql);    
        const res = await pool.query(sql, []); 

        const qty = parseInt(res.rows[0].qty);
        if (qty <= 0){
            await run();
        }    
    }
}

new Promise(async function (resolve, reject) {
    console.log(getDateTime(), ">crypto_bot main version = " + version, getDateTime());    
    await init();
    
    //await test_mexc();
    
    setInterval(async function(){
        await check_run();
    }, 10000);
    await check_run();
    
//    await pool.end();
//    process.exit(0);
    
});


/*
 * 
 */