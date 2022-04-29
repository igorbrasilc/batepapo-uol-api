/* eslint-disable no-plusplus */
/* eslint-disable no-useless-return */
import {MongoClient, ObjectId} from 'mongodb';
import express, {json} from 'express';
import cors from 'cors';
import chalk from 'chalk';
import dotenv from 'dotenv';
import dayjs from 'dayjs';

const app = express();
dotenv.config();
app.use(cors());
app.use(json());

let database = null;
const dbName = process.env.MONGO_DATABASE;

app.post('/participants', async (req, res) => {
    const {body} = req;
    
    if (!body.name) {
        res.sendStatus(422);
        return;
    }

    const objParticipant = {
        name: body.name,
        lastStatus: Date.now()
    };

    const objMessage = {
        from: body.name,
        to: 'Todos',
        text: 'entra na sala...',
        type: 'status',
        time: dayjs().format("HH:mm:ss")
    }
    
    try {
        const mongoClient = new MongoClient(process.env.MONGO_URL);
        await mongoClient.connect();
        database = mongoClient.db(dbName);

        const participants = await database.collection("participants").find({name: body.name}).toArray();
        
        if (participants.length !== 0) {
            res.sendStatus(409);
            return;
        }

        await database.collection("participants").insertOne(objParticipant);
        await database.collection("messages").insertOne(objMessage);
        res.sendStatus(201);
        mongoClient.close();
    } catch(e) {
        console.log(chalk.bold.red('Deu erro no post /participants', e));
        res.status(422).send(e);
    }
});

app.get('/participants', async (req, res) => {
    try {
        const mongoClient = new MongoClient(process.env.MONGO_URL);
        await mongoClient.connect();
        database = mongoClient.db(dbName);

        const participants = await database.collection("participants").find({}).toArray();

        res.send(participants);
        mongoClient.close();
    } catch(e) {
        console.log(chalk.bold.red('Deu erro no get /participants', e));
        res.status(422).send(e);
    }
});

app.post('/messages', async (req, res) => {
    const {body} = req;
    const userFrom = req.header('user');

    try {
        const mongoClient = new MongoClient(process.env.MONGO_URL);
        await mongoClient.connect();
        database = mongoClient.db(dbName);

        const participants = await database.collection("participants").find({name: userFrom}).toArray();

        if (!body.to || !body.text || (body.type !== 'message' && body.type !== 'private_message') || !participants) {
            res.sendStatus(422);
            console.log('falhou aqui');
            return;
        }

        const objMessage = {
            from: userFrom,
            to: body.to,
            text: body.text,
            type: body.type,
            time: dayjs().format('HH:mm:ss')
        }

        await database.collection("messages").insertOne(objMessage);
        res.sendStatus(201);
        mongoClient.close();
    } catch(e) {
        console.log(chalk.bold.red('Deu erro no post /messages', e));
        res.status(422).send(e);
    }
});

app.get('/messages', async (req, res) => {
    let {limit} = req.query;
    const userFrom = req.header('user');

    if (!limit) limit = 100;

    try {
        const mongoClient = new MongoClient(process.env.MONGO_URL);
        await mongoClient.connect();
        database = mongoClient.db(dbName);

        const messages = await database.collection("messages").find({$or: [{from: userFrom}, {to: userFrom}, {to: 'Todos'}]}).toArray();

        // eslint-disable-next-line prefer-const
        const messagesInv = messages.reverse();
        const messagesLimited = [];

        for (let i = 0; i < messagesInv.length; i++) {
            if (i < limit) messagesLimited.push(messagesInv[i]);
            else break;
        }

        res.send(messagesLimited.reverse());
        mongoClient.close();
    } catch(e) {
        console.log(chalk.bold.red('Deu erro no get /messages', e));
        res.status(422).send(e);
    }
});

app.post('/status', async (req, res) => {
    const userFrom = req.header('user');

    try {
        const mongoClient = new MongoClient(process.env.MONGO_URL);
        await mongoClient.connect();
        database = mongoClient.db(dbName);
        

        const participant = await database.collection("participants").find({name: userFrom}).toArray();
        
        if (!participant) {
            res.sendStatus(404);
            mongoClient.close();
            console.log('Não tem esse participante');
            return;
        }

        await database.collection("participants").updateOne({name: userFrom}, {$set: {lastStatus: Date.now()}});
        res.sendStatus(200);
        mongoClient.close();
    } catch(e) {
        console.log(chalk.bold.red('Deu erro no post /status', e));
        res.status(404).send(e);
    }
});

app.delete('/messages/:idMessage', async (req, res) => {
    const userFrom = req.header('user');
    const {idMessage} = req.params;

    try {
        const mongoClient = new MongoClient(process.env.MONGO_URL);
        await mongoClient.connect();
        database = mongoClient.db(dbName);

        const message = await database.collection('messages').findOne({_id: new ObjectId(idMessage)});

        if (!message) {
            res.sendStatus(404);
            return;
        }

        if (userFrom !== message.from) {
            res.sendStatus(401);
            return;
        }

        await database.collection('messages').deleteOne({_id: new ObjectId(idMessage)});
        res.sendStatus(200);
        mongoClient.close();
    } catch(e) {
        console.log(chalk.bold.red('Deu erro no delete', e));
        res.status(404).send(e);
    }
})

async function autoRemove() {
    try {
        const mongoClient = new MongoClient(process.env.MONGO_URL);
        await mongoClient.connect();
        database = mongoClient.db(dbName);

        const participants = await database.collection("participants").find({}).toArray();

        const participantsOffline = participants.filter(participant => {
            if (Math.abs(participant.lastStatus - Date.now()) > 10000) {
                return true;
            }

            return false
        });

        for (let i = 0; i < participantsOffline.length; i++) {
            // eslint-disable-next-line no-await-in-loop
            await database.collection('participants').deleteOne({name: participantsOffline[i].name});
            // eslint-disable-next-line no-await-in-loop
            await database.collection('messages').insertOne({
                from: participantsOffline[i].name,
                to: 'Todos',
                text: 'sai da sala...',
                type: 'status',
                time: dayjs().format('HH:mm:ss')
            });
        }

        mongoClient.close();

    } catch(e) {
        console.log(chalk.bold.red('Deu erro no autoRemove', e));
    }
}

setInterval(() => autoRemove(), 15000);

app.listen(process.env.PORTA, () => console.log(chalk.bold.green('Server on at http://localhost:5000')));


