
// ChatApp API Router
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const dataDir = path.join(__dirname, 'chatapp-data');
const usersFile = path.join(dataDir, 'users.json');
const chatsFile = path.join(dataDir, 'chats.json');
const messagesFile = path.join(dataDir, 'messages.json');

// Ensure data dir exists
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '{}');
if (!fs.existsSync(chatsFile)) fs.writeFileSync(chatsFile, '{}');
if (!fs.existsSync(messagesFile)) fs.writeFileSync(messagesFile, '{}');

function readJSON(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch(e) {
        return {};
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Register user
router.post('/register', (req, res) => {
    const { oderId, name, phone } = req.body;
    if (!oderId || !name || !phone) {
        return res.json({ success: false, error: 'Missing fields' });
    }
    
    const users = readJSON(usersFile);
    users[oderId] = { oderId, name, phone, online: true, lastSeen: Date.now() };
    writeJSON(usersFile, users);
    
    res.json({ success: true, user: users[oderId] });
});

// Get all users
router.get('/users', (req, res) => {
    const users = readJSON(usersFile);
    res.json({ success: true, users: Object.values(users) });
});

// Create chat
router.post('/chat/create', (req, res) => {
    const { oderId, targetId, targetName, targetPhone } = req.body;
    if (!oderId || !targetId) {
        return res.json({ success: false, error: 'Missing fields' });
    }
    
    const chats = readJSON(chatsFile);
    if (!chats[oderId]) chats[oderId] = {};
    
    chats[oderId][targetId] = {
        oderId: targetId,
        name: targetName,
        phone: targetPhone,
        timestamp: Date.now()
    };
    
    writeJSON(chatsFile, chats);
    res.json({ success: true });
});

// Get user's chats
router.get('/chats', (req, res) => {
    const { userId } = req.query;
    if (!userId) {
        return res.json({ success: false, error: 'Missing userId' });
    }
    
    const chats = readJSON(chatsFile);
    const userChats = chats[userId] || {};
    
    res.json({ success: true, chats: Object.values(userChats) });
});

// Send message
router.post('/message/send', (req, res) => {
    const { chatId, senderId, senderName, receiverId, receiverName, receiverPhone, text } = req.body;
    if (!chatId || !senderId || !text) {
        return res.json({ success: false, error: 'Missing fields' });
    }
    
    const messages = readJSON(messagesFile);
    if (!messages[chatId]) messages[chatId] = [];
    
    const msg = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        senderId,
        senderName,
        text,
        timestamp: Date.now()
    };
    
    messages[chatId].push(msg);
    writeJSON(messagesFile, messages);
    
    // Update both users' chat lists
    const chats = readJSON(chatsFile);
    
    // Sender's chat
    if (!chats[senderId]) chats[senderId] = {};
    chats[senderId][receiverId] = {
        oderId: receiverId,
        name: receiverName,
        phone: receiverPhone,
        lastMessage: text,
        timestamp: Date.now()
    };
    
    // Receiver's chat (auto-add sender)
    if (!chats[receiverId]) chats[receiverId] = {};
    const users = readJSON(usersFile);
    const sender = users[senderId] || {};
    chats[receiverId][senderId] = {
        oderId: senderId,
        name: sender.name || senderName,
        phone: sender.phone || '',
        lastMessage: text,
        timestamp: Date.now()
    };
    
    writeJSON(chatsFile, chats);
    
    res.json({ success: true, message: msg });
});

// Get messages
router.get('/messages', (req, res) => {
    const { chatId } = req.query;
    if (!chatId) {
        return res.json({ success: false, error: 'Missing chatId' });
    }
    
    const messages = readJSON(messagesFile);
    const chatMessages = messages[chatId] || [];
    
    res.json({ success: true, messages: chatMessages });
});

module.exports = router;
