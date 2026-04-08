const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const USERS_FILE = path.join(__dirname, 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'jarvis-secret-key-change-in-production';

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {}
  return {};
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function getUserMemoryFile(userId) {
  return path.join(__dirname, `memory_${userId}.json`);
}

function loadUserMemory(userId) {
  try {
    const file = getUserMemoryFile(userId);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {}
  return {
    userName: '',
    facts: [],
    contacts: {},
    projects: {},
    devices: {},
    preferences: {},
    apis: {},
    dailyChecks: []
  };
}

function saveUserMemory(userId, memory) {
  fs.writeFileSync(getUserMemoryFile(userId), JSON.stringify(memory, null, 2));
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

async function signup(email, password, name) {
  const users = loadUsers();
  if (users[email]) throw new Error('User already exists');
  const hash = await bcrypt.hash(password, 10);
  const userId = email.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  users[email] = { userId, email, name, password: hash, createdAt: new Date().toISOString() };
  saveUsers(users);

  // Init memory with their name
  const memory = loadUserMemory(userId);
  memory.userName = name;
  saveUserMemory(userId, memory);

  const token = jwt.sign({ userId, email, name }, JWT_SECRET, { expiresIn: '30d' });
  return { token, userId, name };
}

async function login(email, password) {
  const users = loadUsers();
  const user = users[email];
  if (!user) throw new Error('User not found');
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error('Wrong password');
  const token = jwt.sign({ userId: user.userId, email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  return { token, userId: user.userId, name: user.name };
}

module.exports = { signup, login, verifyToken, loadUserMemory, saveUserMemory };