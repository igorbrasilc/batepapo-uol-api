/* eslint-disable no-plusplus */
/* eslint-disable no-useless-return */
import {MongoClient, ObjectId} from 'mongodb';
import express, {json} from 'express';
import cors from 'cors';
import chalk from 'chalk';
import dotenv from 'dotenv';
import dayjs from 'dayjs';
import Joi from 'joi';

const app = express();
dotenv.config();
app.use(cors());
app.use(json());

const dbName = process.env.MONGO_DATABASE;
let database = null;

const mongoClient = new MongoClient(process.env.MONGO_URL);
const promise = mongoClient.connect();
promise.then(() => {
    database = mongoClient.db(dbName);
    console.log(chalk.bold.blue('Conexão com o Mongo ok'));  
});
promise.catch(() => {
    console.log(chalk.bold.red('Conexão com o Mongo falhou'));
});

const participantSchema = Joi.object({
    name: Joi.string().required()
});

const messageSchema = Joi.object({
    to: Joi.string().required(), 
    text: Joi.string().required(),
    type: Joi.string().valid('message', 'private_message').required(),
    from: Joi.required(),
    time: Joi.required()
});

app.post('/participants', async (req, res) => {
    const {body} = req;

    try {
        await participantSchema.validateAsync(body, { abortEarly: false});
    } catch(e) {
        res.status(422).send(e.details.map(detail => detail.message));
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

        const participants = await database.collection("participants").find({name: body.name}).toArray();
        
        if (participants.length !== 0) {
            res.sendStatus(409);
            return;
        }

        await database.collection("participants").insertOne(objParticipant);
        await database.collection("messages").insertOne(objMessage);
        res.sendStatus(201);
    } catch(e) {
        console.log(chalk.bold.red('Deu erro no post /participants', e));
        res.status(422).send(e);
    }
});

app.get('/participants', async (req, res) => {
    try {
        const participants = await database.collection("participants").find({}).toArray();
        res.send(participants);
    } catch(e) {
        console.log(chalk.bold.red('Deu erro no get /participants', e));
        res.status(422).send(e);
    }
});

app.post('/messages', async (req, res) => {
    const {body} = req;
    const userFrom = req.header('user');
    
    const objMessage = {
        from: userFrom,
        to: body.to,
        text: body.text,
        type: body.type,
        time: dayjs().format('HH:mm:ss')
    };

    try {
        await messageSchema.validateAsync(objMessage, { abortEarly: false});
    } catch(e) {
        res.status(422).send(e.details.map(detail => detail.message));
        return;
    }

    try {
        const participants = await database.collection("participants").findOne({name: userFrom});

        if (!participants) {
            res.sendStatus(422);
            console.log('O participante deve já estar cadastrado');
            return;
        }

        await database.collection("messages").insertOne(objMessage);
        res.sendStatus(201);
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

        const messages = await database.collection("messages").find({$or: [{from: userFrom}, {to: userFrom}, {to: 'Todos'}]}).toArray();

        // eslint-disable-next-line prefer-const
        const messagesInv = messages.reverse();
        const messagesLimited = [];

        for (let i = 0; i < messagesInv.length; i++) {
            if (i < limit) messagesLimited.push(messagesInv[i]);
            else break;
        }

        res.send(messagesLimited.reverse());
    } catch(e) {
        console.log(chalk.bold.red('Deu erro no get /messages', e));
        res.status(422).send(e);
    }
});

app.post('/status', async (req, res) => {
    const userFrom = req.header('user');

    try {
        const participant = await database.collection("participants").find({name: userFrom}).toArray();
        
        if (!participant) {
            res.sendStatus(404);
            console.log('Não tem esse participante');
            return;
        }

        await database.collection("participants").updateOne({name: userFrom}, {$set: {lastStatus: Date.now()}});
        res.sendStatus(200);
    } catch(e) {
        console.log(chalk.bold.red('Deu erro no post /status', e));
        res.status(404).send(e);
    }
});

app.delete('/messages/:idMessage', async (req, res) => {
    const userFrom = req.header('user');
    const {idMessage} = req.params;

    try {
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
    } catch(e) {
        console.log(chalk.bold.red('Deu erro no delete', e));
        res.status(404).send(e);
    }
});

app.put('/messages/:idMessage', async (req, res) => {
    const {body} = req;
    const userFrom = req.header('user');
    const {idMessage} = req.params;

    const objMessage = {
        from: userFrom,
        to: body.to,
        text: body.text,
        type: body.type,
        time: dayjs().format('HH:mm:ss')
    };

    try {
        await messageSchema.validateAsync(objMessage, { abortEarly: false});
    } catch(e) {
        res.status(422).send(e.details.map(detail => detail.message));
        return;
    }

    try {
        const messageSearch = await database.collection('messages')
        .findOne({_id: new ObjectId(idMessage)});

        if (!messageSearch) {
            res.sendStatus(404);
            return;
        }

        if (userFrom !== messageSearch.from) {
            res.sendStatus(401);
            return;
        }

        await database.collection('messages').updateOne({_id: new ObjectId(idMessage)}, {$set: body});
        res.sendStatus(201);

    } catch(e) {
        console.log(chalk.bold.red('Deu erro no put /messages', e));
        res.status(422).send(e);
    }
})

async function autoRemove() {
    try {
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
    } catch(e) {
        console.log(chalk.bold.red('Deu erro no autoRemove', e));
    }
}

setInterval(() => autoRemove(), 15000);

app.listen(process.env.PORTA, () => console.log(chalk.bold.green('Server on at http://localhost:5000')));


