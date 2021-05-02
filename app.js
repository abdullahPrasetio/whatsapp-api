const { Client, MessageMedia } = require("whatsapp-web.js");
const express = require("express");
const { body, validationResult } = require("express-validator");
const socketIo = require("socket.io");
const qrcode = require("qrcode");
const http = require("http");
const fs = require("fs");
const { phoneNumberFormatter } = require("./helpers/formatter");
const fileUpload = require("express-fileupload");
const axios = require("axios");

const db = require("./helpers/db");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.urlencoded({}));
app.use(fileUpload({ debug: true }));
const SESSION_FILE_PATH = "./whatsapp-session.json";
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
  sessionCfg = require(SESSION_FILE_PATH);
}

app.get("/", (req, res) => {
  // res.status(200).json({
  //   status: true,
  //   message: "Hello World guys",
  // });
  res.sendFile("index.html", { root: __dirname });
});

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

client.initialize();

// Socket Io
io.on("connection", function (socket) {
  socket.emit("message", "Connecting. . . ");

  // Kirim QR
  client.on("qr", (qr) => {
    // Generate and scan this code with your phone
    console.log("QR RECEIVED", qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit("qr", url);
      socket.emit("message", "Please scan barcode with your phone");
    });
  });

  client.on("ready", () => {
    socket.emit("ready", "whatsapp is ready!");
    socket.emit("message", "whatsapp is ready!");
  });

  client.on("authenticated", (session) => {
    socket.emit("authenticated", "whatsapp is ready!");
    socket.emit("message", "whatsapp is ready!");
    console.log("AUTHENTICATED", session);
    sessionCfg = session;
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
      if (err) {
        console.error(err);
      }
    });
  });
});
// Check register number

const checkRegisteredNumber = async function (number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
};
// Send Message
app.post(
  "/send-message",
  [body("number").notEmpty(), body("message").notEmpty()],
  async (req, res) => {
    const errors = validationResult(req).formatWith(({ msg }) => {
      return msg;
    });

    if (!errors.isEmpty()) {
      return res.status(422).json({
        status: false,
        message: errors.mapped(),
      });
    }
    const number = phoneNumberFormatter(req.body.number);
    const message = req.body.message;

    const isRegisteredNumber = await checkRegisteredNumber(number);

    if (!isRegisteredNumber) {
      return res.status(422).json({
        status: false,
        message: "The number is not registered",
      });
    }

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
  }
);

// Send Media
app.post("/send-media", async (req, res) => {
  const number = phoneNumberFormatter(req.body.number);
  const caption = req.body.caption;
  // Media dari server
  // const media = MessageMedia.fromFilePath("./image.png");
  // Media dari upload
  // const file = req.files.file;
  // const media = new MessageMedia(
  //   file.mimetype,
  //   file.data.toString("base64"),
  //   file.name
  // );

  // Media dari url
  const fileUrl = req.body.fileUrl;
  let mimetype;
  const attachment = await axios
    .get(fileUrl, { responseType: "arraybuffer" })
    .then((response) => {
      mimetype = response.headers["content-type"];
      // console.log(`response`, response);
      return response.data.toString("base64");
    });
  const media = new MessageMedia(mimetype, attachment, "Media");
  // console.log(`file`, file);
  // return;
  client
    .sendMessage(number, media, { caption: caption })
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
