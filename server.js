import express from 'express';
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// Ensure sessions directory exists
if (!existsSync(join(__dirname, 'sessions'))) {
  mkdirSync(join(__dirname, 'sessions'));
}

// Store in memory
const bots = new Map();

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// API Routes - MUST come before the catch-all route
app.post('/pair', async (req, res) => {
  console.log('Pair request received:', req.body);
  
  try {
    const { number } = req.body;
    if (!number) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const cleanNumber = number.replace(/\D/g, '');
    console.log('Processing number:', cleanNumber);
    
    const { state, saveCreds } = await useMultiFileAuthState(`sessions/${cleanNumber}`);
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
      console.log('Connection update:', connection, pairingCode);
      
      if (pairingCode && !pairingCodeSent) {
        pairingCodeSent = true;
        console.log('Pairing code for ' + cleanNumber + ': ' + pairingCode);
        
        bots.set(cleanNumber, { sock: sock, status: 'waiting' });
        
        return res.json({
          success: true,
          pairingCode: pairingCode,
          number: cleanNumber,
          message: 'Use this pairing code in WhatsApp'
        });
      }

      if (connection === 'open') {
        console.log('✅ ' + cleanNumber + ' connected successfully!');
        bots.set(cleanNumber, { sock: sock, status: 'online' });

        // Send welcome message
        const jid = cleanNumber + '@s.whatsapp.net';
        try {
          await sock.sendMessage(jid, {
            text: '🤖 Bot Connected Successfully!\n\nYour account is now linked!\n\nCommands:\n.ping - Test bot\n.tagall - Mention all\n.antilink on/off\n.help - Show help'
          });
        } catch (error) {
          console.log('Welcome message error');
        }
      }

      if (connection === 'close') {
        console.log('❌ ' + cleanNumber + ' disconnected');
        bots.set(cleanNumber, { sock: sock, status: 'offline' });
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Handle messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
      try {
        const message = messages[0];
        if (!message.message || message.key.fromMe) return;

        const jid = message.key.remoteJid;
        const userMessage = message.message.conversation || 
                           (message.message.extendedTextMessage ? message.message.extendedTextMessage.text : '');

        console.log('Received message:', userMessage);

        if (userMessage.startsWith('.ping')) {
          await sock.sendMessage(jid, { text: '🏓 Pong! Bot is working!' });
        } 
        else if (userMessage.startsWith('.tagall')) {
          try {
            const groupMetadata = await sock.groupMetadata(jid);
            const participants = groupMetadata.participants;
            
            let mentions = [];
            let taggedText = '📢 Hello everyone!\n\n';
            
            participants.forEach(participant => {
              mentions.push(participant.id);
              taggedText += '@' + participant.id.split('@')[0] + ' ';
            });
            
            await sock.sendMessage(jid, {
              text: taggedText,
              mentions: mentions
            });
          } catch (error) {
            await sock.sendMessage(jid, { text: '❌ Use in groups only!' });
          }
        } 
        else if (userMessage.startsWith('.antilink')) {
          await sock.sendMessage(jid, { text: '🛡️ Anti-link feature' });
        }
        else if (userMessage.startsWith('.help')) {
          await sock.sendMessage(jid, { 
            text: '🤖 Bot Commands:\n.ping - Test bot\n.tagall - Mention all\n.antilink on/off\n.help - Show help' 
          });
        }
      } catch (error) {
        console.log('Message handling error:', error);
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!pairingCodeSent && !res.headersSent) {
        return res.status(408).json({ error: 'Timeout. Please try again.' });
      }
    }, 30000);

  } catch (error) {
    console.error('Pairing error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Server error: ' + error.message });
    }
  }
});

// Status endpoint
app.get('/status/:number', (req, res) => {
  try {
    const { number } = req.params;
    const cleanNumber = number.replace(/\D/g, '');
    
    const bot = bots.get(cleanNumber);
    const status = bot ? bot.status : 'not_paired';
    
    res.json({ 
      number: cleanNumber,
      status: status
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

// Catch-all route - MUST be last
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🚀 Server running on port ' + PORT);
  console.log('✅ API endpoints: /pair, /status/:number, /health');
});
