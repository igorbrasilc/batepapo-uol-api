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

        const participants = await database.collection("participants").find({nome: body.name}).toArray();
        
        if (!participants) {
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
})

app.listen(5000, () => console.log(chalk.bold.green('Server on at http://localhost:5000')));


