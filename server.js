import express from 'express';
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';

const app = express();
app.use(express.json());
app.use(express.static('.'));

// Store in memory
const bots = new Map();

// Serve simple frontend
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp Bot</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background: #f8f9fa; padding: 20px; }
        .container { max-width: 500px; }
        .pairing-code { font-family: monospace; font-size: 3rem; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="card shadow">
            <div class="card-header bg-primary text-white text-center">
                <h3>WhatsApp Bot</h3>
                <p class="mb-0">Deployed on Render</p>
            </div>
            <div class="card-body p-4">
                <form id="pairForm">
                    <div class="mb-3">
                        <label class="form-label">WhatsApp Number</label>
                        <input type="tel" class="form-control" id="number" 
                               placeholder="252612345678" required>
                        <div class="form-text">Country code + number (no + sign)</div>
                    </div>
                    
                    <div id="errorAlert" class="alert alert-danger d-none"></div>
                    
                    <button type="submit" class="btn btn-primary w-100" id="pairBtn">
                        Get Pairing Code
                    </button>
                </form>
                
                <div id="pairingSection" class="d-none mt-4 text-center">
                    <div class="alert alert-info">
                        Use this code in WhatsApp
                    </div>
                    <div class="bg-dark text-white p-3 rounded mb-3">
                        <div class="pairing-code" id="pairingCode">------</div>
                    </div>
                    <div class="text-muted mb-3">
                        <strong>Steps:</strong><br>
                        1. WhatsApp → Settings → Linked Devices<br>
                        2. Tap "Link a Device"<br>
                        3. Select "Link with Phone Number"<br>
                        4. Enter the code above
                    </div>
                    <div class="text-muted">
                        <div class="spinner-border spinner-border-sm me-2"></div>
                        Waiting for connection...
                    </div>
                    <button class="btn btn-secondary w-100 mt-3" onclick="resetForm()">
                        Try Another Number
                    </button>
                </div>
                
                <div id="successSection" class="d-none text-center">
                    <div class="alert alert-success">
                        <h4>✅ Connected Successfully!</h4>
                        <p>Your WhatsApp bot is now active</p>
                    </div>
                    <button class="btn btn-success w-100" onclick="resetForm()">
                        Pair Another Bot
                    </button>
                </div>
            </div>
        </div>
    </div>

    <script>
        async function pairBot() {
            const number = document.getElementById('number').value;
            const btn = document.getElementById('pairBtn');
            const errorAlert = document.getElementById('errorAlert');
            
            if (!number) {
                showError('Please enter a number');
                return;
            }
            
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Getting Code...';
            btn.disabled = true;
            errorAlert.classList.add('d-none');
            
            try {
                const response = await fetch('/pair', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ number })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showPairingCode(data.pairingCode, data.number);
                } else {
                    showError(data.error || 'Failed to get pairing code');
                }
            } catch (error) {
                showError('Network error: ' + error.message);
            } finally {
                btn.innerHTML = 'Get Pairing Code';
                btn.disabled = false;
            }
        }
        
        function showPairingCode(code, number) {
            document.getElementById('pairForm').classList.add('d-none');
            document.getElementById('pairingSection').classList.remove('d-none');
            document.getElementById('pairingCode').textContent = code;
            
            checkStatus(number);
        }
        
        function checkStatus(number) {
            const interval = setInterval(async () => {
                try {
                    const response = await fetch('/status/' + number);
                    const data = await response.json();
                    
                    if (data.status === 'online') {
                        clearInterval(interval);
                        showSuccess();
                    }
                } catch (error) {
                    console.log('Status check error');
                }
            }, 2000);
            
            setTimeout(() => clearInterval(interval), 120000);
        }
        
        function showSuccess() {
            document.getElementById('pairingSection').classList.add('d-none');
            document.getElementById('successSection').classList.remove('d-none');
        }
        
        function showError(message) {
            const errorAlert = document.getElementById('errorAlert');
            errorAlert.textContent = message;
            errorAlert.classList.remove('d-none');
        }
        
        function resetForm() {
            document.getElementById('pairForm').classList.remove('d-none');
            document.getElementById('pairingSection').classList.add('d-none');
            document.getElementById('successSection').classList.add('d-none');
            document.getElementById('number').value = '';
            document.getElementById('errorAlert').classList.add('d-none');
        }
        
        document.getElementById('pairForm').addEventListener('submit', (e) => {
            e.preventDefault();
            pairBot();
        });
    </script>
</body>
</html>
  `);
});

// Pair endpoint
app.post('/pair', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const cleanNumber = number.replace(/\D/g, '');
    
    const { state, saveCreds } = await useMultiFileAuthState('./sessions/' + cleanNumber);
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
      
      if (pairingCode && !pairingCodeSent) {
        pairingCodeSent = true;
        console.log('Pairing code for ' + cleanNumber + ': ' + pairingCode);
        
        bots.set(cleanNumber, { sock: sock, status: 'waiting' });
        
        res.json({
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
            text: '🤖 *Bot Connected Successfully!*\n\n' +
                  '✅ Your account is now linked!\n\n' +
                  '📝 Available Commands:\n' +
                  '.ping - Test bot response\n' +
                  '.tagall - Mention all group members\n' +
                  '.antilink on/off - Link protection\n' +
                  '.help - Show all commands\n\n' +
                  '🚀 Deployed on Render'
          });
        } catch (error) {
          console.log('Welcome message error:', error.message);
        }
      }

      if (connection === 'close') {
        console.log('❌ ' + cleanNumber + ' disconnected');
        bots.set(cleanNumber, { sock: sock, status: 'offline' });
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
      const message = messages[0];
      if (!message.message || message.key.fromMe) return;

      const jid = message.key.remoteJid;
      const userMessage = message.message.conversation || 
                         (message.message.extendedTextMessage ? message.message.extendedTextMessage.text : '');

      // Handle commands
      if (userMessage.startsWith('.ping')) {
        const startTime = Date.now();
        await sock.sendMessage(jid, {
          text: '🏓 Pong! ' + (Date.now() - startTime) + 'ms\n\nPowered by Render Bot'
        });
      } 
      
      else if (userMessage.startsWith('.tagall')) {
        try {
          const groupMetadata = await sock.groupMetadata(jid);
          const participants = groupMetadata.participants;
          
          const messageText = userMessage.replace('.tagall', '').trim() || 'Hello everyone!';
          
          let mentions = [];
          let taggedText = '📢 ' + messageText + '\n\n';
          
          participants.forEach(participant => {
            mentions.push(participant.id);
            taggedText += '@' + participant.id.split('@')[0] + ' ';
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
        const command = args[1] ? args[1].toLowerCase() : '';
        
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
          text: '🤖 *Bot Commands*\n\n' +
                '*.ping* - Test bot response\n' +
                '*.tagall [message]* - Mention all group members\n' +
                '*.antilink on/off* - Toggle link protection\n' +
                '*.help* - Show this help message\n\n' +
                'Powered by Render'
        });
      }
    });

    // Timeout if no pairing code received
    setTimeout(() => {
      if (!pairingCodeSent && !res.headersSent) {
        res.status(408).json({ error: 'Pairing timeout. Please try again.' });
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

// Get all bots
app.get('/bots', (req, res) => {
  try {
    const botsList = {};
    bots.forEach((bot, number) => {
      botsList[number] = { status: bot.status };
    });
    
    res.json({ bots: botsList });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🚀 WhatsApp Bot running on port ' + PORT);
  console.log('🔢 Pairing Code Mode: Enabled');
});
