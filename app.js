const express = require('express');
const app = express();
const fs = require("fs");
const bodyParser = require('body-parser');
const cron = require('node-cron');

// App config.
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const port = 5000;
const hostname = '127.0.0.1';
const txFile = __dirname + "/" + "transactions.json";

// WEB 3
const Web3 = require('web3');
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

    // Sign transaction object.
    const tx = signTransaction(txObject, from.privateKey);

    // Broadcast the transaction.
    try {
        return await sendSignedTransaction(tx);
    } catch(error) {
        return 0;
    }

};

sendSignedTransaction = async tx => {
    await web3.eth.sendSignedTransaction(tx, (err, txHash) => {
        if (err) {
            console.log(err);
            return 0;
        } else {
            console.log('txHash: ', txHash);
            return txHash;
        }
    });
};

signMessage = async (message, privateKey) => {
    return await web3.eth.accounts.sign(
        "0x" + message.toString("hex"),
        privateKey
    );
};

// let pending_tx = [];

// To run every minute use 4 stars.
cron.schedule('*/5 * * * * *', async () => {
    fs.readFile(txFile, 'utf8', async (err, json) => {
        const file = JSON.parse(json);
        let transactions = file.transactions;

        if (transactions.length > 0) {
            let tx = transactions.shift();

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
            // console.log(signatureObject);

            // Send msg to DEX.
            const from = {
                address: MATCHING_ENGINE_ADDR,
                privateKey: MATCHING_ENGINE_PK.toString().substr(2)
            };
            const to = '0x82c1283C047fCD8F551E606b76cA6cB2a20217c2'; //contracts.dex.options.address;
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

            let res = await sendTransaction(from, to, value, data);

            if (res === 0) {
                // TODO: retry failed transaction once before going to next.
                console.log("Transaction Failed");

                // Update transaction file.
                transactions.push(tx);
                file.transactions = transactions;
                json = JSON.stringify(file);
                fs.writeFile(txFile, json, 'utf-8', () => {});
            } else {
                console.log(res);


                // let sentTx = {
                //     txHash: res,
                //     tx: tx,
                //     status: 'pending',
                // };
                // pending_tx.push(sentTx);

                // Update transaction file.
                file.transactions = transactions;
                json = JSON.stringify(file);
                fs.writeFile(txFile, json, 'utf-8', () => {});
            }
        } else {
            console.log("Waiting for transactions...");
        }
    });
});

const server = app.listen(port, hostname, function () {
    const host = server.address().address;
    const port = server.address().port;
    console.log("DEX transaction queue listening at http://%s:%s", host, port)
});