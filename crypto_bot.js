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
    
    console.log("sql", sql, args);    
    res = await pool.query(sql, []); 
    exchange_data = {};
    for (var i = 0; i < res.rows.length; i++){
        var d = res.rows[i];
        exchange_data[d.name] = {
            "key":      d.api_key,
            "secret":   d.api_secret,
            "settings": JSON.parse(d.settings)
        };
    }
        
    console.log("exchanges", exchange_data);
}

async function test_mexc(){
    var args = null, sql, res, url;
    const request_headers = { "X-MEXC-APIKEY":  exchange_data.MEXC.key };
    url = exchange_data.MEXC.settings.api_url + "exchangeInfo";
    args = {
        headers: request_headers
    };
    
console.log(url, args);    
    
    res = await axios.get(url, args);
    
console.log(res);    
    fs.writeFileSync("test.json", JSON.stringify(res.data));
    
}

new Promise(async function (resolve, reject) {
    console.log(getDateTime(), ">crypto_bot main version = " + version, getDateTime());    
    await init();
    
    await test_mexc();
    
    await pool.end();
    process.exit(0);
});


/*
 * 
 */