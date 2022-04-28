/* eslint-disable no-useless-return */
import {MongoClient} from 'mongodb';
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
const mongoClient = new MongoClient(process.env.MONGO_URL);

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
        await mongoClient.connect();
        database = mongoClient.db("UOL-API");

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
        mongoClient.close();
    }
});

app.get('/participants', async (req, res) => {
    try {
        await mongoClient.connect();
        database = mongoClient.db("UOL-API");

        const participants = await database.collection("participants").find({}).toArray();

        res.send(participants);
        mongoClient.close();
    } catch(e) {
        console.log(chalk.bold.red('Deu erro no get /participants', e));
        res.status(422).send(e);
        mongoClient.close();
    }
});

app.post('/messages', async (req, res) => {
    const {body} = req;
    const userFrom = req.header('user');

    try {
        await mongoClient.connect();
        database = mongoClient.db("UOL-API");

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
        mongoClient.close();
    }
});


app.listen(5000, () => console.log(chalk.bold.green('Server on at http://localhost:5000')));


