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


CREATE TABLE tokens_spot (
    id SERIAL PRIMARY KEY,
    name VARCHAR(20) NULL DEFAULT NULL
);

CREATE TABLE tokens_futures (
    id SERIAL PRIMARY KEY,
    name VARCHAR(20) NULL DEFAULT NULL
);

CREATE INDEX ON tokens_spot(name);
CREATE INDEX ON tokens_futures(name);

CREATE TABLE runs (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW()
);


CREATE TABLE prices_spot (
    id SERIAL PRIMARY KEY,
    token_id INT NOT NULL,
    exchange_id INT NOT NULL,
    price NUMERIC(10,10) NOT NULL,
    run_id INT NOT NULL
);
CREATE INDEX ON prices_spot(token_id);
CREATE INDEX ON prices_spot(run_id);
CREATE INDEX ON prices_spot(exchange_id);
CREATE INDEX ON prices_spot(price);

CREATE TABLE prices_futures (
    id SERIAL PRIMARY KEY,
    token_id INT NOT NULL,
    exchange_id INT NOT NULL,
    price NUMERIC(10,10) NOT NULL,
    run_id INT NOT NULL,
    funding_rate NUMERIC(2,2) NOT NULL DEFAULT 0
);
CREATE INDEX ON prices_futures(token_id);
CREATE INDEX ON prices_futures(run_id);
CREATE INDEX ON prices_futures(exchange_id);
CREATE INDEX ON prices_futures(price);
CREATE INDEX ON prices_futures(funding_rate);

UPDATE exchanges SET settings = '{"api_url":"https://api.mexc.com/api/v3/"}' WHERE id = 2;
