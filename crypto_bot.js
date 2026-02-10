/*
 * node crypto_bot.js > log.txt
 * cd /var/node/crypto_bot
 * pm2 start /var/node/crypto_bot/crypto_bot.js -o /var/node/crypto_bot/log.txt -e /var/node/crypto_bot/errors.txt --name="crypto_bot"
 * https://www.ttbgrossist.com/spread.txt
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg'
import cmd from 'node-cmd';
import axios from "axios";
import { sha256, sha224 } from 'js-sha256';
import crypto from 'crypto';

const version = "1.2";

var pool = null;
var exchange_data;
var is_running = false;
var run_id = 0;
var spread_data = [];
var proxy_settings;

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
console.log(proxy_settings);    
    
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

function sign_gate(method, url, query_string="", payload_string=""){
    var t = Math.round(new Date().getTime() / 1000);
    var s = method + "\n" + url + "\n" + query_string + "\n" + payload_string + "\n" + t;    
    var sign = crypto.createHash('sha512').update(s).digest('hex');
    const request_headers = { 
        "Accept":       'application/json', 
        "Content-type": 'application/json',
        "KEY":          exchange_data.GATE.key,
        "Timestamp":    t,
        "SIGN":         sign        
    };
    //console.log("s = "+s+" sign = "+sign, request_headers);
    return request_headers;
}

async function test_gate(){
    var args = null, sql, res, url, endpoint;
    const prefix = "/api/v4";
    
    //url = exchange_data.MEXC.settings.api_url + "v3/ticker/24hr";
    endpoint = "/spot/tickers";
    
    url = exchange_data.GATE.settings.api_url + prefix + endpoint;    
    args = {
        headers: sign_gate("GET", prefix + endpoint, "", "")
    };
    
    console.log(url, args);    
    
    res = await axios.get(url, args);
    
    //fs.writeFileSync("test_gate_spot.json", JSON.stringify(res.data));
    
    
    endpoint = "/futures/usdt/contracts";
    
    url = exchange_data.GATE.settings.api_url + prefix + endpoint;    
    args = {
        headers: sign_gate("GET", prefix + endpoint, "", "")
    };
    
    //console.log(url, args);    
    
    res = await axios.get(url, args);
    
    //fs.writeFileSync("test_gate_futures.json", JSON.stringify(res.data));
    
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
    //fs.writeFileSync("test.json", JSON.stringify(res.data));
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

async function save_gate_spot_price(data){
    const s = (""+data.currency_pair).trim();    
    if ((s.indexOf("_USDT") >= 0) && (data.base_volume > 0)){
        const sql = "INSERT INTO prices_spot (token,exchange_id,price,change_percent,run_id) VALUES ('"
            +(""+s.replace('_USDT','')).trim()+"',"
            +exchange_data.GATE.id+","
            +data.last+","
            +(data.change_percentage)+","
            +run_id+")";
        await pool.query(sql);
    }
}

async function save_gate_futures_price(data){
    const s = (""+data.name).trim();    
    if (s.indexOf("_USDT") >= 0){
        const sql = "INSERT INTO prices_futures (token,exchange_id,price,funding_rate,run_id) VALUES ('"
            +(""+s.replace('_USDT','')).trim()+"',"
            +exchange_data.GATE.id+","
            +data.index_price+","
            +(data.funding_rate*100)+","
            +run_id+")";
        await pool.query(sql);
    }
}

async function run_gate(){
    console.log(getDateTime(), ">run_gate run_id = " + run_id, getDateTime());    
    
    var args = null, sql, res, url, endpoint, data;
    const prefix = "/api/v4";
    
    endpoint = "/spot/tickers";
    
    url = exchange_data.GATE.settings.api_url + prefix + endpoint;    
    args = {
        headers: sign_gate("GET", prefix + endpoint, "", ""),
        proxy: proxy_settings
    };
    
//    console.log(url, args);    
    
    res = await axios.get(url, args);
    
//console.log("gate spot l = "+res.data.length);    
    try {
        await Promise.all(
            res.data.map(async (d) => {
                await save_gate_spot_price(d);
            })
        );
    } catch(e){
        throw new Error("Failed to get Gate spot prices: \n"+url+"\n"+e.message);
    }       

    // FUTURES
    endpoint = "/futures/usdt/contracts";
    
    url = exchange_data.GATE.settings.api_url + prefix + endpoint;    
    args = {
        headers: sign_gate("GET", prefix + endpoint, "", ""),
        proxy: proxy_settings
    };
    
//    console.log(url, args);    
    
    res = await axios.get(url, args);
    

//console.log("gate futures l = "+res.data.length);    
    try {
        await Promise.all(
            res.data.map(async (d) => {
                await save_gate_futures_price(d);
            })
        );
    } catch(e){
        throw new Error("Failed to get Gate futures prices: \n"+url+"\n"+e.message);
    }       
    console.log(getDateTime(), "<run_gate run_id = " + run_id, getDateTime());    
    
}

async function run_bybit(){
    
}

async function get_spread_data(token){
    var sql, res, s, f;
    const min_spread = parseFloat(process.env.min_spread * 100);
    try {
        /*
        sql = `SELECT 
                token, price, (SELECT name FROM exchanges WHERE id = exchange_id) AS exchange, change_percent
                FROM prices_spot 
                WHERE token = '`+token+`'                                   
                ORDER BY price
                `;        
        //console.log("1.get_spread_data token = "+token, sql);
        res = await pool.query(sql);
        //console.log("1.get_spread_data token = "+token, res.rows);
        if (res.rows.length >= 2){
            var d_min = res.rows.shift();
            var d_max = res.rows.pop();
            var spread = Math.round( (parseFloat(d_max.price) - parseFloat(d_min.price)) / parseFloat(d_max.price) * 100, 1);
            if (spread >= min_spread) {
                s = d_min.token+"\t"+d_min.exchange+" BUY "+parseFloat(d_min.price).toFixed(8)+"\t"+d_max.exchange+" SELL "+ parseFloat(d_max.price).toFixed(8)+ "\tSPREAD: "+spread+"\tCHANGE 24h: "+parseFloat(d_min.change_percent).toFixed(2);
                spread_data.push({"str": s, "spread": spread });
            }
        }
        */
        
        sql = `SELECT 
                token, price, (SELECT name FROM exchanges WHERE id = exchange_id) AS exchange, funding_rate 
                FROM prices_futures 
                WHERE token = '`+token+`'
                ORDER BY price
                `;
        //console.log("2.get_spread_data token = "+token, sql);
        res = await pool.query(sql);
        //console.log("2.get_spread_data token = "+token, res.rows);
        if (res.rows.length >= 2){
            var d_min = res.rows.shift();
            var d_max = res.rows.pop();
            var spread = ((parseFloat(d_max.price) - parseFloat(d_min.price)) / parseFloat(d_max.price) * 100).toFixed(2);
            if (spread >= min_spread) {
                f = ( parseFloat(d_max.funding_rate) - parseFloat(d_min.funding_rate)).toFixed(2);
                s = d_min.token+"\t"+d_min.exchange+" LONG "+parseFloat(d_min.price).toFixed(8)+"\t"+d_max.exchange+" SHORT "+parseFloat(d_max.price).toFixed(8)+"\tSPREAD: "+spread+"\tFUNDING: "+f;
                spread_data.push({"str": s, "spread": spread });
            }
        }
        
        //process.exit(0);
    } catch(e){
        throw new Error("Failed get_spread_data: \n"+e.message);
    }    
}

async function get_spread(){
    var sql, res, s;
    try {
        console.log(getDateTime(), ">get_spread", getDateTime()); 
        spread_data = [];
        sql = `
            SELECT 
            t.token
            FROM 
            (
            SELECT token, price FROM prices_spot
            UNION ALL
            SELECT token, price FROM prices_futures
            ) AS t
            WHERE (t.price > 0)
            GROUP BY t.token
            HAVING (((MAX(t.price) - MIN(t.price)) / MAX(t.price)) >= `+parseFloat(process.env.min_spread)+`)
            ORDER BY t.token;`;
//console.log("get_spread",sql);        
        res = await pool.query(sql, []);
        await Promise.all(
            res.rows.map(async (d) => {
                await get_spread_data(d.token);
            })
        );

        // sort by spread desc
        spread_data.sort( function(a, b) {
            if (a.spread < b.spread) {
               return ;
            }
            if (a.spread > b.spread) {
               return -1;
            }
            return 0;            
        });
        
        res = [];
        for (var i = 0; i < spread_data.length; i++){
            res.push(spread_data[i].str);
        }
        
        spread_data = [];

        const filename = process.env.spread_file;
        try{
          fs.unlinkSync(filename);  
        } catch(e){}
        
        s = ""+(new Date())+"\n"+res.join("\n");

        // find positive funding with spot
        sql = `
                SELECT token, (SELECT name FROM exchanges WHERE id = exchange_id) AS exchange, funding_rate 
                FROM prices_futures 
                WHERE (funding_rate >= 0.5)
                AND (EXISTS (SELECT token FROM prices_spot AS sp WHERE sp.token = prices_futures.token))
                ORDER BY funding_rate DESC
                `;
        res = await pool.query(sql, []);
        
        s+="\n\n";
        for (var i = 0; i < res.rows.length; i++){
            s += res.rows[i].token+" "+res.rows[i].exchange+"\t FUNDING "+parseFloat(res.rows[i].funding_rate).toFixed(2)+"\n";
        }
                
        fs.writeFileSync(filename, s);

        console.log(getDateTime(), "<get_spread", getDateTime()); 
    } catch(e){
        throw new Error("Failed get_spread: \n"+e.message);
    }     
    //fs.writeFileSync("spread.json", JSON.stringify(res.rows));

}

async function run(){
    var sql;
    is_running = true;
    try {
        console.log(getDateTime(), ">run", getDateTime());    
        
        sql = "INSERT INTO runs(progress) VALUES('starting...')";
        await pool.query(sql);
        
        sql = "SELECT MAX(id) AS run_id FROM runs WHERE finished IS NULL";
        const res = await pool.query(sql, []);
        run_id = parseInt(res.rows[0].run_id);
        
        
//        console.log("exchange_data",exchange_data);
        
        for (var key in exchange_data){
            if (key == "MEXC") {
                await run_mexc();
                sql = "UPDATE runs SET progress='Mexc Done!' WHERE id = " + run_id;
                await pool.query(sql);                
            }
            if (key == "GATE") {
                await run_gate();
                sql = "UPDATE runs SET progress='Gate Done!' WHERE id = " + run_id;
                await pool.query(sql);                
            }
            if (key == "BYBIT") {
                await run_bybit();
                sql = "UPDATE runs SET progress='Bybit Done!' WHERE id = " + run_id;
                await pool.query(sql);                
            }
        }

        sql = "UPDATE runs SET finished = NOW(), progress='All Done!' WHERE id = " + run_id;
//console.log(sql);        
        await pool.query(sql);
        
        sql = "DELETE FROM runs WHERE (id < " + run_id+")";
//console.log(sql);        
        await pool.query(sql);

        sql = "DELETE FROM prices_futures WHERE (price <= 0) OR (run_id < " + run_id+")";
//console.log(sql);        
        await pool.query(sql);
        
        sql = "DELETE FROM prices_spot WHERE (price <= 0) OR (run_id < " + run_id+")";
//console.log(sql);        
        await pool.query(sql);
        
        await get_spread();
        
        console.log(getDateTime(), "<run", getDateTime());    
        
    } catch(e){
        console.log(getDateTime(), "<crypto_bot ERROR in run! \n"+e.message, getDateTime());    
        process.exit(0);
    }
    is_running = false;    
}

async function check_run(){
    if (!is_running) {        
        const sql = "SELECT COUNT(*) AS qty FROM runs WHERE finished::time with time zone >= current_time - interval '" + process.env.period_minutes + "' minute";

       // console.log("sql", sql);    
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
   
    await run();
   // await get_spread();
    process.exit(0);
    
    
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