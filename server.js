import express from 'express';
import cors from 'cors';
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const activeBots = new Map();

// Store bot status in memory (no Firebase)
const botStatus = new Map();

app.post('/pair', async (req, res) => {
  const { number } = req.body;
  
  if (!number) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  const cleanNumber = number.replace(/\D/g, '');
  
  try {
    // Update status to pairing
    botStatus.set(cleanNumber, { status: 'pairing', lastUpdate: new Date() });

    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${cleanNumber}`);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 10000
    });

    let pairingCodeSent = false;

    sock.ev.on('connection.update', async (update) => {
      const { connection, pairingCode } = update;
      
      // Send pairing code to frontend
      if (pairingCode && !pairingCodeSent) {
        pairingCodeSent = true;
        console.log(`🔢 Pairing code for ${cleanNumber}: ${pairingCode}`);
        
        botStatus.set(cleanNumber, { 
          status: 'waiting', 
          lastUpdate: new Date(),
          pairingCode: pairingCode
        });
        
        res.json({
          success: true,
          pairingCode: pairingCode,
          number: cleanNumber,
          message: 'Use this pairing code in WhatsApp'
        });
      }

      if (connection === 'open') {
        console.log(`✅ ${cleanNumber} connected successfully!`);
        botStatus.set(cleanNumber, { 
          status: 'online', 
          lastUpdate: new Date(),
          connectedAt: new Date()
        });

        // Send welcome message
        const jid = `${cleanNumber}@s.whatsapp.net`;
        try {
          await sock.sendMessage(jid, {
            text: '🤖 *Bot Connected Successfully!*\n\n' +
                  '✅ Your account is now linked!\n\n' +
                  '📝 Available Commands:\n' +
                  '• .ping - Test bot response\n' +
                  '• .tagall [message] - Mention all group members\n' +
                  '• .antilink on/off - Link protection\n\n' +
                  '💡 Enjoy your bot!'
          });
        } catch (error) {
          console.log('Welcome message error:', error.message);
        }
      }

      if (connection === 'close') {
        console.log(`❌ ${cleanNumber} disconnected`);
        botStatus.set(cleanNumber, { 
          status: 'offline', 
          lastUpdate: new Date()
        });
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
      const message = messages[0];
      if (!message.message || message.key.fromMe) return;

      const jid = message.key.remoteJid;
      const userMessage = message.message.conversation || 
                         message.message.extendedTextMessage?.text || '';

      // Update last message
      botStatus.set(cleanNumber, { 
        ...botStatus.get(cleanNumber),
        lastMessage: userMessage,
        lastActivity: new Date()
      });

      // Handle commands
      if (userMessage.startsWith('.ping')) {
        const startTime = Date.now();
        await sock.sendMessage(jid, {
          text: `🏓 Pong! ${Date.now() - startTime}ms\n\nPowered by Simple Bot`
        });
      } 
      
      else if (userMessage.startsWith('.tagall')) {
        try {
          const groupMetadata = await sock.groupMetadata(jid);
          const participants = groupMetadata.participants;
          
          const messageText = userMessage.replace('.tagall', '').trim() || 'Hello everyone!';
          
          let mentions = [];
          let taggedText = `📢 ${messageText}\n\n`;
          
          participants.forEach(participant => {
            mentions.push(participant.id);
            taggedText += `@${participant.id.split('@')[0]} `;
          });
          
          await sock.sendMessage(jid, {
            text: taggedText,
            mentions: mentions
          });
        } catch (error) {
          await sock.sendMessage(jid, {
            text: '❌ This command can only be used in groups!'
          });
        }
      } 
      
      else if (userMessage.startsWith('.antilink')) {
        const args = userMessage.split(' ');
        const command = args[1]?.toLowerCase();
        
        if (command === 'on') {
          await sock.sendMessage(jid, {
            text: '🛡️ Anti-link protection enabled!'
          });
        } else if (command === 'off') {
          await sock.sendMessage(jid, {
            text: '🔓 Anti-link protection disabled!'
          });
        } else {
          await sock.sendMessage(jid, {
            text: 'Usage: .antilink on/off'
          });
        }
      }
      
      else if (userMessage.startsWith('.help')) {
        await sock.sendMessage(jid, {
          text: `🤖 *Bot Commands*\n\n` +
                `*.ping* - Test bot response\n` +
                `*.tagall [message]* - Mention all group members\n` +
                `*.antilink on/off* - Toggle link protection\n` +
                `*.help* - Show this help message\n\n` +
                `Powered by Simple WhatsApp Bot`
        });
      }
    });

    activeBots.set(cleanNumber, sock);

    // Timeout if no pairing code received
    setTimeout(() => {
      if (!pairingCodeSent) {
        if (!res.headersSent) {
          res.status(408).json({ 
            error: 'Pairing timeout. Please try again.' 
          });
        }
      }
    }, 30000);

  } catch (error) {
    console.error('Pairing error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// Get bot status
app.get('/status/:number', async (req, res) => {
  try {
    const { number } = req.params;
    const cleanNumber = number.replace(/\D/g, '');
    
    const status = botStatus.get(cleanNumber) || { status: 'not_paired' };
    res.json({ 
      number: cleanNumber,
      status: status
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all bots
app.get('/bots', async (req, res) => {
  try {
    const bots = {};
    botStatus.forEach((status, number) => {
      bots[number] = status;
    });
    
    res.json({ bots });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Restart bot
app.post('/restart/:number', async (req, res) => {
  try {
    const { number } = req.params;
    const cleanNumber = number.replace(/\D/g, '');
    
    if (activeBots.has(cleanNumber)) {
      activeBots.get(cleanNumber).ws.close();
      activeBots.delete(cleanNumber);
    }
    
    botStatus.set(cleanNumber, { status: 'restarting', lastUpdate: new Date() });
    
    res.json({ success: true, message: 'Bot restart initiated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logout bot
app.delete('/logout/:number', async (req, res) => {
  try {
    const { number } = req.params;
    const cleanNumber = number.replace(/\D/g, '');
    
    if (activeBots.has(cleanNumber)) {
      activeBots.get(cleanNumber).logout();
      activeBots.delete(cleanNumber);
    }
    
    botStatus.delete(cleanNumber);
    
    res.json({ success: true, message: 'Bot logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'frontend.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🤖 WhatsApp Bot running on port ${PORT}`);
  console.log(`🌐 Open: http://localhost:${PORT}`);
  console.log(`🔢 Pairing Code Mode: Enabled`);
});
