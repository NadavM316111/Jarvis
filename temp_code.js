
process.chdir('C:/Users/nadav/jarvis-web');

const http = require('http');

// Check what's at 192.168.4.53
async function checkDevice(ip) {
    return new Promise((resolve) => {
        const req = http.get(`http://${ip}/`, { timeout: 3000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ ip, statusCode: res.statusCode, headers: res.headers, body: data.substring(0, 500) });
            });
        });
        req.on('error', (e) => resolve({ ip, error: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ ip, error: 'timeout' }); });
    });
}

// Also try the Roku discovery endpoint
async function tryRokuEndpoint(ip) {
    return new Promise((resolve) => {
        const req = http.get(`http://${ip}:8060/query/device-info`, { timeout: 3000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ ip, data }));
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
}

async function main() {
    console.log('Checking 192.168.4.53...');
    const result = await checkDevice('192.168.4.53');
    console.log(result);
    
    // Let's also use SSDP discovery to find ALL devices
    console.log('\n=== Running SSDP Discovery for TVs ===');
    
    const dgram = require('dgram');
    const socket = dgram.createSocket('udp4');
    
    const devices = [];
    
    socket.on('message', (msg, rinfo) => {
        const message = msg.toString();
        if (message.toLowerCase().includes('roku') || 
            message.toLowerCase().includes('tv') ||
            message.toLowerCase().includes('dial') ||
            message.toLowerCase().includes('media')) {
            devices.push({
                ip: rinfo.address,
                message: message.substring(0, 300)
            });
        }
    });
    
    socket.bind(() => {
        const ssdpMessage = Buffer.from(
            'M-SEARCH * HTTP/1.1\r\n' +
            'HOST: 239.255.255.250:1900\r\n' +
            'MAN: "ssdp:discover"\r\n' +
            'MX: 3\r\n' +
            'ST: ssdp:all\r\n' +
            '\r\n'
        );
        
        socket.send(ssdpMessage, 0, ssdpMessage.length, 1900, '239.255.255.250');
    });
    
    await new Promise(resolve => setTimeout(resolve, 4000));
    socket.close();
    
    // Filter for unique IPs and TV-related
    const uniqueDevices = [...new Map(devices.map(d => [d.ip, d])).values()];
    console.log('SSDP discovered devices:', uniqueDevices);
}

main();
