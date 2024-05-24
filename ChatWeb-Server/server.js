const app = require("./app");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
dotenv.config({ path: "./.env" });
const jwt = require("jsonwebtoken");
const path = require("path");
process.on("uncaughtException", (err) => {
  console.log(err);
  process.exit(1);
});
const Conversation = require("./models/conversations");
const User = require("./models/user");
const FriendRequest = require("./models/friendRequest");
const http = require("http");
const OneToOneMessage = require("./models/oneToOneMessage");
const GroupMessage = require("./models/GroupMessage");

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://whispering-clarie-testdeploy-bdce9592.koyeb.app/",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: "*",
    credentials: true
  }
});

app.post("/message/messages-create", async (req, res) => {
  try {
    console.log(req.body);
    const { senderId, receiverId, content, image, file } = req.body;
    let conversation = await Conversation.findOne({
      members: { $all: [senderId, receiverId] },
    });
    if (!conversation) {
      conversation = await Conversation.create({
        type: "public",
        members: [senderId, receiverId],
      });
    }
    const message = await Message.create({
      conversationId: conversation._id,
      senderId,
      receiverId,
      content,
      image,
      file,
    });
    io.emit("messageSend", { user: senderId });
    return res.json(message);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

app.get("/message/clearAll/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await Message.deleteMany({ conversationId: id });
    await Conversation.findByIdAndUpdate(id);
    io.emit("messageSend", { user: id });
    return res.status(200).json({ message: "deleted", data: true });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/get-groupchat-idUser/:id", async (req, res) => {
  try {
    const data = await Conversation.find({
      members: { $all: [req.params.id] },
      type: { $ne: "public" },
    });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/create-group/:id", async (req, res) => {
  try {
    const data = await Conversation.create({
      members: [req.params.id],
      type: req.body.type,
    });
    res.status(201).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

const DB = process.env.DBURI.replace("<PASSWORD>", process.env.DBPASSWORD);
const multer = require("multer");
const aws = require("aws-sdk");
const multerS3 = require("multer-s3");

const s3 = new aws.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: "ap-south-1",
});

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: "chatwebcnm",
    acl: "public-read",
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
      cb(null, Date.now().toString());
    },
  }),
});

app.post("/upload/image-s3", upload.single("image"), (req, res) => {
  console.log(req.file);
  res.json({ imageUrl: req.file.location });
});

mongoose
  .connect(DB)
  .then(() => {
    console.log("Kết nối DB thành công");
  })
  .catch((err) => {
    console.log(err);
  });

const port = process.env.PORT || 8000;

server.listen(port, () => {
  console.log(`Web đang chạy trên cổng ${port}`);
});

const messageRoute = require("./routes/message");
const Message = require("./models/message");

app.use("/message", messageRoute);

io.on("connection", (socket) => {
  console.log(`User connected ${socket.id}`);
  console.log(JSON.stringify(socket.handshake.query));
  const user_id = socket.handshake.query["user_id"];
  const title = socket.handshake.query["title"];
  console.log(`User connected ${socket.id}`);

  if (user_id != null && Boolean(user_id)) {
    try {
      User.findByIdAndUpdate(user_id, {
        socket_id: socket.id,
        status: "Online",
      }).exec();
    } catch (error) {
      console.error("Error updating user status:", error);
    }
  }

  socket.on("friend_request", async (data) => {
    console.log("Received friend request:", data);
    const to = await User.findById(data.to).select("socket_id");
    const from = await User.findById(data.from).select("socket_id");

    await FriendRequest.create({
      sender: data.from,
      recipient: data.to,
    });

    io.to(to?.socket_id).emit("new_friend_request", {
      message: "New friend request received",
    });
    io.to(from?.socket_id).emit("request_sent", {
      message: "Request Sent successfully!",
    });
  });

  socket.on("accept_request", async (data) => {
    console.log(data);
    const request_doc = await FriendRequest.findById(data.request_id);
    const sender = await User.findById(request_doc.sender);
    const receiver = await User.findById(request_doc.recipient);

    sender.friends.push(request_doc.recipient);
    receiver.friends.push(request_doc.sender);

    await receiver.save({ new: true, validateModifiedOnly: true });
    await sender.save({ new: true, validateModifiedOnly: true });

    await FriendRequest.findByIdAndDelete(data.request_id);

    io.to(sender?.socket_id).emit("request_accepted", {
      message: "Friend Request Accepted",
    });
    io.to(receiver?.socket_id).emit("request_accepted", {
      message: "Friend Request Accepted",
    });
  });

  socket.on("end", async (data) => {
    if (data.user_id) {
      await User.findByIdAndUpdate(data.user_id, { status: "Offline" });
    }
    console.log("Closing connection");
    socket.disconnect(0);
  });

  socket.on("text_message", async (data) => {
    console.log("Received message:", data);
    const { message, conversation_id, from, to, type } = data;
    const to_user = await User.findById(to);
    const from_user = await User.findById(from);

    const new_message = {
      to: to,
      from: from,
      type: type,
      created_at: Date.now(),
      text: message,
    };

    const chat = await OneToOneMessage.findById(conversation_id);
    chat.messages.push(new_message);
    await chat.save({ new: true, validateModifiedOnly: true });

    io.to(to_user?.socket_id).emit("new_message", {
      conversation_id,
      message: new_message,
    });

    io.to(from_user?.socket_id).emit("new_message", {
      conversation_id,
      message: new_message,
    });
  });

  socket.on("file_message", (data) => {
    console.log("Received message:", data);
    const fileExtension = path.extname(data.file.name);
    const filename = `${Date.now()}_${Math.floor(
      Math.random() * 10000
    )}${fileExtension}`;
  });

  socket.on("get_direct_conversations", async ({ user_id }, callback) => {
    const existing_conversations = await OneToOneMessage.find({
      participants: { $all: [user_id] },
    }).populate("participants", "firstName lastName avatar _id email status");

    console.log(existing_conversations);
    callback(existing_conversations);
  });

  socket.on("get_group_conversations", async ({ user_id }, callback) => {
    const existing_conversations = await GroupMessage.find({
      participants: { $all: [user_id] },
    }).populate("participants", "firstName lastName avatar _id email status");

    console.log(existing_conversations);
    callback(existing_conversations);
  });

  socket.on("mark_last_seen", async ({ conversation_id, user_id }) => {
    await OneToOneMessage.findByIdAndUpdate(conversation_id, {
      last_seen: Date.now(),
    });
  });

  socket.on("start_conversation", async (data) => {
    const existing_conversation = await OneToOneMessage.findOne({
      participants: { $all: [data.from, data.to] },
    });

    if (existing_conversation) {
      socket.emit("existing_conversation", existing_conversation);
    } else {
      const new_conversation = await OneToOneMessage.create({
        participants: [data.from, data.to],
      });

      socket.emit("new_conversation", new_conversation);
    }
  });

  socket.on("start_group", async (data) => {
    const { participants, title, from } = data;

    const new_group = await GroupMessage.create({
      participants: [...participants, from],
      title,
      created_at: Date.now(),
    });

    socket.emit("new_group", new_group);
  });

  socket.on("disconnect", async () => {
    const matching_user = await User.findOne({ socket_id: socket.id });
    if (matching_user) {
      matching_user.status = "Offline";
      await matching_user.save();
    }
    console.log("User disconnected");
  });
});
