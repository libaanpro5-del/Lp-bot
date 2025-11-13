import express from 'express';
import cors from 'cors';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { db } from './firebase.js';
import { ref, set, update, remove } from 'firebase-admin/database';
import { pingCommand } from './commands/ping.js';
import { tagallCommand } from './commands/tagall.js';
import { antilinkCommand, checkAntilink } from './commands/antilink.js';
import { existsSync, mkdirSync } from 'fs';

const app = express();
app.use(cors());
app.use(express.json());

// Ensure sessions directory exists
if (!existsSync('./sessions')) {
  mkdirSync('./sessions');
}

const activeConnections = new Map();

async function updateBotStatus(number, status, extra = {}) {
  try {
    const botRef = ref(db, `bots/${number}`);
    await update(botRef, {
      status,
      lastUpdated: new Date().toISOString(),
      ...extra
    });
    console.log(`📊 Updated ${number} status to: ${status}`);
  } catch (error) {
    console.error('Firebase update error:', error);
  }
}

async function initializeBot(number) {
  try {
    console.log(`🚀 Initializing bot for: ${number}`);
    
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${number}`);
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['LP WhatsApp Bot', 'Chrome', '1.0.0'],
      markOnlineOnConnect: true
    });

    activeConnections.set(number, sock);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr, isNewLogin } = update;
      
      if (qr) {
        qrcode.generate(qr, { small: true });
        console.log(`📱 QR Code generated for: ${number}`);
      }

      if (connection === 'open') {
        console.log(`✅ Bot connected for: ${number}`);
        await updateBotStatus(number, 'Online', {
          connectedAt: new Date().toISOString()
        });
        
        // Send welcome message to user's DM
        const jid = `${number}@s.whatsapp.net`;
        await sock.sendMessage(jid, {
          text: '🤖 *LP-Bot connected successfully!*\n\n' +
                'Available commands:\n' +
                '• .ping - Check bot response time\n' +
                '• .tagall [message] - Mention all group members\n' +
                '• .antilink on/off - Toggle link protection\n\n' +
                '💡 Powered by LP WhatsApp Bot Platform'
        });
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`❌ Connection closed for ${number}, reconnect: ${shouldReconnect}`);
        
        await updateBotStatus(number, 'Offline', {
          lastOnline: new Date().toISOString(),
          disconnectReason: lastDisconnect?.error?.message
        });

        if (shouldReconnect) {
          setTimeout(() => initializeBot(number), 5000);
        } else {
          activeConnections.delete(number);
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
      const message = messages[0];
      if (!message.message || message.key.fromMe) return;

      const jid = message.key.remoteJid;
      const userMessage = message.message.conversation || 
                         message.message.extendedTextMessage?.text || '';
      
      // Update last message in Firebase
      await updateBotStatus(number, 'Online', {
        lastMessage: userMessage,
        lastActivity: new Date().toISOString()
      });

      // Check antilink first
      if (await checkAntilink(sock, message, jid)) return;

      // Handle commands
      if (userMessage.startsWith('.ping')) {
        await pingCommand(sock, message, jid, number);
      } else if (userMessage.startsWith('.tagall')) {
        await tagallCommand(sock, message, jid, number, userMessage);
      } else if (userMessage.startsWith('.antilink')) {
        await antilinkCommand(sock, message, jid, number, userMessage);
      }
    });

    return sock;
  } catch (error) {
    console.error(`❌ Error initializing bot for ${number}:`, error);
    await updateBotStatus(number, 'Error', { error: error.message });
    throw error;
  }
}

// Routes
app.post('/pair', async (req, res) => {
  try {
    const { number } = req.body;
    
    if (!number) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Clean number format
    const cleanNumber = number.replace(/\D/g, '');
    
    await updateBotStatus(cleanNumber, 'Pairing', {
      pairedAt: new Date().toISOString()
    });

    const sock = await initializeBot(cleanNumber);
    
    // Wait for QR code or connection
    sock.ev.once('connection.update', (update) => {
      if (update.qr) {
        res.json({ 
          success: true, 
          qr: update.qr,
          number: cleanNumber,
          message: 'Scan the QR code to pair your WhatsApp'
        });
      } else if (update.connection === 'open') {
        res.json({ 
          success: true, 
          connected: true,
          number: cleanNumber,
          message: 'Successfully connected!'
        });
      }
    });

  } catch (error) {
    console.error('Pairing error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/restart/:number', async (req, res) => {
  try {
    const { number } = req.params;
    const cleanNumber = number.replace(/\D/g, '');
    
    if (activeConnections.has(cleanNumber)) {
      activeConnections.get(cleanNumber).ws.close();
      activeConnections.delete(cleanNumber);
    }
    
    setTimeout(() => initializeBot(cleanNumber), 2000);
    
    res.json({ success: true, message: 'Bot restart initiated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/logout/:number', async (req, res) => {
  try {
    const { number } = req.params;
    const cleanNumber = number.replace(/\D/g, '');
    
    if (activeConnections.has(cleanNumber)) {
      activeConnections.get(cleanNumber).logout();
      activeConnections.delete(cleanNumber);
    }
    
    // Remove from Firebase
    const botRef = ref(db, `bots/${cleanNumber}`);
    await remove(botRef);
    
    res.json({ success: true, message: 'Bot logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/status/:number', async (req, res) => {
  try {
    const { number } = req.params;
    const cleanNumber = number.replace(/\D/g, '');
    
    const botRef = ref(db, `bots/${cleanNumber}`);
    const snapshot = await botRef.get();
    
    res.json({ 
      number: cleanNumber,
      status: snapshot.exists() ? snapshot.val() : 'Not paired'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🤖 WhatsApp Bot Platform running on port ${PORT}`);
});
