const express = require('express');
const app = express();
const fs = require("fs");

const port = 5000;
const hostname = '127.0.0.1';
const txFile = __dirname + "/" + "transactions.json";

let user = {
    "user4" : {
        "name" : "mohit",
        "password" : "password4",
        "profession" : "teacher",
        "id": 4
    }
};

app.post('/transactions', (req, res) => {
    fs.readFile(txFile, 'utf8', (err, json) => {
        const data = JSON.parse(json);
        let transactions = data.transactions;
        transactions.push({ hello: 'hello' });
        transactions.push({ world: 'world' });

        data.transactions = transactions;
        json = JSON.stringify(data);
        fs.writeFile(txFile, json, 'utf-8', () => {});
        res.end( JSON.stringify(transactions));
    });
});

app.get('/transactions', (req, res) => {
    fs.readFile(txFile, 'utf8', (err, data) => {
       res.end(data);
    });
});

const server = app.listen(port, hostname, function () {
    const host = server.address().address;
    const port = server.address().port;
    console.log("DEX transaction queue listening at http://%s:%s", host, port)
});