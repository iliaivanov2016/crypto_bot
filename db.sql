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

DELETE FROM runs;
DELETE FROM prices_futures;
DELETE FROM prices_spot;

UPDATE exchanges SET settings = '{"api_url":"https://api.gateio.ws"}' WHERE id = 3;