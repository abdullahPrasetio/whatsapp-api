const { Client, MessageMedia } = require("whatsapp-web.js");
const express = require("express");
const socketIo = require("socket.io");
const qrcode = require("qrcode");
const http = require("http");
const fs = require("fs");
const { phoneNumberFormatter } = require("./helpers/formatter");
const axios = require("axios");
const { Session } = require("inspector");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.urlencoded({}));

app.get("/", (req, res) => {
  res.sendFile("index-multiple-device.html", { root: __dirname });
});

const sessions = [];
const SESSION_FILE = "./whatsapp-sessions.json";
const setSessionsFile = (sessions) => {
  fs.writeFile(SESSION_FILE, JSON.stringify(sessions), function (err) {
    if (err) {
      console.log(err);
    }
  });
};

const getSessionsFile = () => {
  return JSON.parse(fs.readFileSync(SESSION_FILE));
};
const createSession = function (id, description, io) {
  console.log(`creating sessions`, id);
  const SESSION_FILE_PATH = `./whatsapp-session-${id}.json`;
  let sessionCfg;
  if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionCfg = require(SESSION_FILE_PATH);
  }

  const client = new Client({
    puppeteer: {
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process", // <- this one doesn't works in Windows
        "--disable-gpu",
      ],
      headless: true,
    },
    session: sessionCfg,
  });
  client.initialize();

  io.emit("message", "Connecting. . . ");

  // Kirim QR
  client.on("qr", (qr) => {
    // Generate and scan this code with your phone
    console.log("QR RECEIVED", qr);
    qrcode.toDataURL(qr, (err, url) => {
      io.emit("qr", { id: id, src: url });
      io.emit("message", { id, text: "Please scan barcode with your phone" });
    });
  });

  client.on("ready", () => {
    io.emit("ready", { id: id });
    io.emit("message", { id: id, text: "whatsapp is ready!" });
    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.findIndex((sess) => sess.id == id);
    savedSessions[sessionIndex].ready = true;
    setSessionsFile(savedSessions);
  });

  client.on("authenticated", (session) => {
    io.emit("authenticated", { id: id });
    io.emit("message", { id: id, text: "whatsapp is authenticated" });
    sessionCfg = session;
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
      if (err) {
        console.error(err);
      }
    });
  });
  const db = require("./helpers/db");
  client.on("message", async (msg) => {
    const keyword = msg.body.toLowerCase();
    const replyMessage = await db.getReply(keyword);

    if (replyMessage !== false) {
      msg.reply(replyMessage);
    }
    if (msg.body == "!ping") {
      msg.reply("pong");
    }
  });

  client.on("auth_failure", function (session) {
    io.emit("message", { id: id, text: "Auth Failure, restarting . . . " });
  });
  client.on("disconnected", (reason) => {
    io.emit("message", { id: id, text: "Whatsapp is disconnected!" });
    fs.unlinkSync(SESSION_FILE_PATH, function (err) {
      if (err) return console.log(err);
      console.log(`Session file deleted`);
    });
    client.destroy();
    client.initialize();

    // Menghapus pada file session
    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.findIndex((sess) => sess.id == id);
    savedSessions.splice(sessionIndex, 1);
    setSessionsFile(savedSessions);

    io.emit("remove-session", id);
  });

  //   Tambahkan clients ke sessions
  sessions.push({
    id: id,
    description: description,
    client: client,
  });
  //   Menambahkan session ke file
  const savedSessions = getSessionsFile();
  const sessionIndex = savedSessions.findIndex((sess) => sess.id == id);
  if (sessionIndex == -1) {
    savedSessions.push({
      id: id,
      description: description,
      ready: false,
    });
    setSessionsFile(savedSessions);
  }
};

// sessions.forEach((element) => {
//   console.log(`element`, element);
// });

const init = (socket) => {
  const savedSessions = getSessionsFile();
  if (savedSessions.length > 0) {
    if (socket) {
      socket.emit("init", savedSessions);
    } else {
      savedSessions.forEach((sess) => {
        createSession(sess.id, sess.description, io);
      });
    }
  }
};
init();
io.on("connection", function (socket) {
  init(socket);
  socket.on("create-session", function (data) {
    console.log(`data create session`, data.id);
    createSession(data.id, data.description, io);
  });
});

// Send Message
app.post("/send-message", async (req, res) => {
  console.log(`sessions`, sessions);
  const sender = req.body.sender;
  const number = phoneNumberFormatter(req.body.number);
  const message = req.body.message;

  const client = sessions.find((sess) => sess.id == sender).client;
  client
    .sendMessage(number, message)
    .then((response) => {
      res.status(200).json({
        status: true,
        response: response,
      });
    })
    .catch((err) => {
      res.status(500).json({
        status: false,
        response: err,
      });
    });
});

server.listen(3000, function () {
  console.log(`App running on *:`, +3000);
});
