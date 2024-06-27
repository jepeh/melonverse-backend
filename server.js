const express = require("express")
const http = require("http")
const app = express()
const ParseServer = require('parse-server').ParseServer;
const ParseDashboard = require('parse-dashboard');
const userAuth = require("./auth/auth")

const bodyParser = require("body-parser")
const cors = require("cors")

const dotenv = require("dotenv")

dotenv.config()
const port = process.env.PORT

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}))

const api = new ParseServer({
    databaseURI: process.env.MONGODB_URI,
    appId: "123",
    masterKey: "1234",
    serverURL: `http://localhost:${port}/parse`,
    appName: "Melonverse",
    cloud: './cloud/main.js'
})

const dashboardConfig = new ParseDashboard({
    apps: [
        {
            appId: "123",
            masterKey: "1234",
            serverURL: `http://localhost:${port}/parse`,
            appName: "Melonverse"
        }
    ]
})
api.start();
app.use('/parse', api.app)
app.use('/dashboard', dashboardConfig)
app.use('/api/user', userAuth)

app.use(cors({ origin: "http://192.168.0.221:3500", credentials: true }))

let server = http.createServer(app)

server.listen(port, ()=>{
    console.log("Godot - Melonverse server running..")
    console.log(`http://192.168.0.221:${port}`)
})