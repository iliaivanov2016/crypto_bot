DROP TABLE exchanges;
CREATE TABLE exchanges (
    id SERIAL PRIMARY KEY,
    name VARCHAR(20) NULL DEFAULT NULL,
    api_key VARCHAR(255) NULL DEFAULT NULL,
    api_secret VARCHAR(255) NULL DEFAULT NULL,
    settings TEXT NULL DEFAULT NULL
);
CREATE INDEX ON exchanges(name);
INSERT INTO exchanges(name,api_key,api_secret) VALUES('BYBIT', 'nliwjQ3oVgGdo6ofPu', 'yR4prGHWDQq1G7ddGczxoiyDSPrETLtQ7VVi');
INSERT INTO exchanges(name,api_key,api_secret) VALUES('MEXC', 'mx0vglxvo6e6R85CYF', '9fabd7bbce944efd8ec978be16034b75');
INSERT INTO exchanges(name,api_key,api_secret) VALUES('GATE', '2f595b6d1102f9972af63e8cd4dd3b44', 'e3a17a630b968eb0b625dc8bdde3e7667993257c5e4b8779940ad04fe82d7bca');


# DROP TABLE tokens_spot;
DROP TABLE runs;
CREATE TABLE runs (
    id              SERIAL PRIMARY KEY,
    progress        TEXT NULL DEFAULT NULL,
    created         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    finished        TIMESTAMP WITH TIME ZONE
);
CREATE INDEX ON runs(finished);

DROP TABLE prices_spot;
CREATE TABLE prices_spot (
    id SERIAL PRIMARY KEY,
    token VARCHAR(20) NOT NULL,
    exchange_id INT NOT NULL,
    price NUMERIC(20,10) NOT NULL,
    change_percent NUMERIC(20,10) NOT NULL, -- 24 hours change
    run_id INT NOT NULL
);
CREATE INDEX ON prices_spot(token);
CREATE INDEX ON prices_spot(run_id);
CREATE INDEX ON prices_spot(exchange_id);
CREATE INDEX ON prices_spot(price);
CREATE INDEX ON prices_spot(change_percent);


DROP TABLE prices_futures;
CREATE TABLE prices_futures (
    id SERIAL PRIMARY KEY,
    token VARCHAR(20) NOT NULL,
    exchange_id INT NOT NULL,
    price NUMERIC(20,10) NOT NULL,
    funding_rate NUMERIC(20,10) NOT NULL DEFAULT 0,
    run_id INT NOT NULL
);
CREATE INDEX ON prices_futures(token);
CREATE INDEX ON prices_futures(run_id);
CREATE INDEX ON prices_futures(exchange_id);
CREATE INDEX ON prices_futures(price);
CREATE INDEX ON prices_futures(funding_rate);

UPDATE exchanges SET settings = '{"api_url":"https://api.mexc.com/api/"}' WHERE id = 2;

SELECT * FROM prices_futures;


UPDATE exchanges SET settings = '{"api_url":"https://api.gateio.ws"}' WHERE id = 3;


SELECT 
t.token, MIN(t.price) AS price_min, MAX(t.price) AS price_max, ((MAX(t.price) - MIN(t.price)) / MAX(t.price)) AS spread
FROM 
(
SELECT token, price FROM prices_spot
UNION ALL
SELECT token, price FROM prices_futures
) AS t
WHERE (t.price > 0)
GROUP BY t.token
HAVING (((MAX(t.price) - MIN(t.price)) / MAX(t.price)) > 0.02)
ORDER BY spread DESC;


DELETE FROM runs;
DELETE FROM prices_futures;
DELETE FROM prices_spot;



UPDATE exchanges SET settings = '{"api_url":"https://api.bybit.com"}' WHERE id = 1;

-- 08.11.2026
DROP TABLE tokens_rsi_trading;
CREATE TABLE tokens_rsi_trading (
                                    token VARCHAR NOT NULL PRIMARY KEY,
                                    percent FLOAT NOT NULL
);
INSERT INTO tokens_rsi_trading (token, percent)
VALUES
    ('SOL', 10.00),
    ('LINK', 10.00),
    ('NEAR', 15.00),
    ('AVAX', 15.00),
    ('SUI', 15.00),
    ('SHIB', 20.00),
    ('AAVE', 10.00),
    ('ONDO', 10.00),
    ('MNT', 10.00),
    ('ENA', 15.00),
    ('PEPE', 15.00),
    ('ARB', 10.00),
    ('STRK', 10.00),
    ('ZRO', 15.00);

ALTER TABLE tokens_rsi_trading
    ADD COLUMN rsi4h FLOAT,
ADD COLUMN updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE OR REPLACE FUNCTION update_tokens_rsi_trading_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated = CURRENT_TIMESTAMP;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tokens_rsi_trading_updated
    BEFORE UPDATE ON tokens_rsi_trading
    FOR EACH ROW
    EXECUTE FUNCTION update_tokens_rsi_trading_timestamp();

ALTER TABLE tokens_rsi_trading ADD COLUMN api_time TIMESTAMP;

ALTER TABLE tokens_rsi_trading ADD COLUMN price FLOAT NULL DEFAULT 0;
ALTER TABLE tokens_rsi_trading ADD COLUMN percent24h FLOAT NULL DEFAULT 0;

UPDATE tokens_rsi_trading SET rsi4h = NULL;