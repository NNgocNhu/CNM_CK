const express = require("express");
const router = express.Router();
const oneToOneMessageController = require("../controllers/messageController");
const {
  getIdConversation,
  detailsConversations,
  createMessage,
  getUserChatMessage,
} = require("../controllers/message");

// Yêu cầu DELETE để xóa một tin nhắn
router.delete("/messages/:messageId", oneToOneMessageController.deleteMessage);

router.get("/conversations/:id", getIdConversation);
router.get("/conversations-details/:id", detailsConversations);
// router.post("/messages-create", createMessage);
router.get("/get-user-chat-message", getUserChatMessage);
module.exports = router;
