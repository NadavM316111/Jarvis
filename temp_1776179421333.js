process.chdir('C:/Users/nadav/jarvis-web');
const __workdir = 'C:/Users/nadav/jarvis-web';
// Test the bg-response endpoint
const axios = require('axios');

async function test() {
  try {
    // First, let's see what's in the queue (need a valid token)
    const fs = require('fs');
    
    // Check if there are any sessions active
    const res = await axios.get('http://localhost:3001/bg-response', {
      headers: { Authorization: 'Bearer test' }
    });
    console.log('BG Response:', res.data);
  } catch (e) {
    console.log('Error:', e.response?.data || e.message);
  }
}

test();