const express = require('express');
const app = express();
const fs = require("fs");
const bodyParser = require('body-parser');
// const CronJob = require('cron').CronJob;
var cron = require('node-cron');

// App config.
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const port = 5000;
const hostname = '127.0.0.1';
const txFile = __dirname + "/" + "transactions.json";

// WEB 3
const Web3 = require('web3')
const url = 'HTTP://127.0.0.1:7545';
const web3 = new Web3(url);
const abi = require('ethereumjs-abi');
const Tx = require('ethereumjs-tx').Transaction;


const parseTransaction = (data) => {
    let tx = null;
    try {
        tx = {
            "addressMaker": data.addressMaker,
            "addressTaker": data.addressTaker,
            "amountMaker": data.amountMaker,
            "amountTaker": data.amountTaker,
            "nonce": data.nonce,
            "tokenMaker": data.tokenMaker,
            "tokenTaker": data.tokenTaker
        };
    } catch (error) {
        console.log("Couldn't parse transaction data from " + JSON.stringify(data));
    }
    return tx;
};

app.post('/transactions', async (req, res) => {
    fs.readFile(txFile, 'utf8', (err, json) => {
        // Get existing transactions.
        const data = JSON.parse(json);
        let transactions = data.transactions;

        // Push new tx in transactions file.
        let tx = parseTransaction(req.body);
        transactions.push(tx);
        data.transactions = transactions;
        json = JSON.stringify(data);
        fs.writeFile(txFile, json, 'utf-8', () => {});

        // Response.
        res.sendStatus(201);
    });
});

app.get('/transactions', (req, res) => {
    fs.readFile(txFile, 'utf8', (err, data) => {
       res.end(data);
    });
});

app.get('/transactions/exe', (req, res) => {
    fs.readFile(txFile, 'utf8', (err, json) => {
        const data = JSON.parse(json);
        let transactions = data.transactions;
        let tx = transactions.shift()
        res.end( JSON.stringify(tx) );
    });
});

// let txInProcess = {
//     tx: null,
//     processed: false,
// };
buildTransactionObject = async (from, to, value, data) => {
    return new Promise(async function(resolve, reject) {
        let txObject;
        try {
            const txCount = await web3.eth.getTransactionCount(from.address);
            txObject = {
                nonce: web3.utils.toHex(txCount),
                to: to,
                data: data,
                value: value,
                gasLimit: web3.utils.toHex(210000),
                gasPrice: web3.utils.toHex(web3.utils.toWei('10', 'gwei'))
            };
            resolve(txObject);
        } catch(error) {
            reject(error);
        }
    });
};

signTransaction = (txData, privateKey) => {
    const bufferedPk = Buffer.from(privateKey, 'hex');
    let tx;
    try {
        tx = new Tx(txData);
        tx.sign(bufferedPk);
    } catch(error) {
        console.log(error);
    }
    const serializedTx = tx.serialize();
    return '0x' + serializedTx.toString('hex');
};

sendTransaction = async (from, to, value, data) => {
    // Build transaction object.
    const txObject = await buildTransactionObject(from, to, value, data);
    console.log(txObject);

    // Sign transaction object.
    const tx = signTransaction(txObject, from.privateKey);
    console.log(tx);

    // Broadcast the transaction.
    return await sendSignedTransaction(tx);
};

sendSignedTransaction = async tx => {
    let res = await web3.eth.sendSignedTransaction(tx, (err, txHash) => {
        if (err) console.log(err);
        else console.log('txHash: ', txHash);
    });
    console.log(res);
};

signMessage = async (message, privateKey) => {
    return await web3.eth.accounts.sign(
        "0x" + message.toString("hex"),
        privateKey
    );
};

// To run every minute remove one star.
cron.schedule('*/2 * * * * *', async () => {
    fs.readFile(txFile, 'utf8', async (err, json) => {
        const file = JSON.parse(json);
        let transactions = file.transactions;
        let tx = transactions.shift();

        // let res =
        // if (txInProcess.tx == null || txInProcess.processed || txInProcess.tx.nonce !== tx.nonce) {
        //     txInProcess = {
        //         tx: tx,
        //         processed: false,
        //     };
        // }
        // console.log(JSON.stringify(txInProcess));
        // console.log(JSON.stringify(tx));

        // Build message.
        const txCount = await web3.eth.getTransactionCount(tx.addressMaker);
        const nonce = web3.utils.toHex(txCount);
        let message =  abi.soliditySHA3(
            ["address", "address", "uint256", "uint256", "address", "uint256"],
            [tx.tokenMaker, tx.tokenTaker, tx.amountMaker, tx.amountTaker, tx.addressMaker, nonce]
        );

        // Sign msg.
        const MATCHING_ENGINE_PK = '0xfb1dfe2ec754c717d2c3226fada7e5cf24450eac999151674837e04f5395cf9b';
        const MATCHING_ENGINE_ADDR = '0x8FC9b674Aa37B879F6E9B096C8dB63f92d63A446';
        let signatureObject = await signMessage(message, MATCHING_ENGINE_PK);
        let signature = signatureObject.signature;
        console.log(signatureObject);

        // Send msg to DEX.
        const from = {
            address: MATCHING_ENGINE_ADDR,
            privateKey: MATCHING_ENGINE_PK.toString().substr(2)
        };
        const to = '0xE312B747d86964c44A7887778CF6F656759df116'; //contracts.dex.options.address;
        const value = '';
        const jsonInterface = {
            name: 'trade',
            type: 'function',
            inputs: [
                {
                    type: 'address',
                    name: 'tokenMaker'
                },
                {
                    type: 'address',
                    name: 'tokenTaker'
                },
                {
                    type: 'uint256',
                    name: 'amountMaker'
                },
                {
                    type: 'uint256',
                    name: 'amountTaker'
                },
                {
                    type: 'address',
                    name: 'addressMaker'
                },
                {
                    type: 'address',
                    name: 'addressTaker'
                },
                {
                    type: 'uint256',
                    name: 'nonce'
                },
                {
                    type: 'bytes',
                    name: 'signature'
                },
            ]
        };
        const params = [tx.tokenMaker, tx.tokenTaker, tx.amountMaker, tx.amountTaker, tx.addressMaker, tx.addressTaker, nonce, signature];
        const data = web3.eth.abi.encodeFunctionCall(jsonInterface, params);

        let res = sendTransaction(from, to, value, data);
        console.log("RES");
        console.log(res);

    });
});

// let balanceOf = await web3.eth.getBalance('0x9cA2B52eCB86D6D7cD19197BdE457494EA55d922');
// console.log(web3.utils.fromWei(balanceOf));


const server = app.listen(port, hostname, function () {
    const host = server.address().address;
    const port = server.address().port;
    console.log("DEX transaction queue listening at http://%s:%s", host, port)
});