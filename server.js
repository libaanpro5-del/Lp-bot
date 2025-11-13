import express from 'express';
import cors from 'cors';
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Store data in memory (will reset on redeploy)
const activeBots = new Map();
const botStatus = new Map();

// Serve the frontend
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Bot</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .card {
            background: rgba(255, 255, 255, 0.95);
            border: none;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
        }
        .pairing-code {
            font-family: 'Courier New', monospace;
            letter-spacing: 8px;
            font-weight: 900;
            background: linear-gradient(45deg, #ff6b6b, #ee5a24);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
    </style>
</head>
<body>
    <div class="container py-4">
        <div class="text-center text-white mb-5">
            <h1 class="display-5 fw-bold">
                <i class="fas fa-robot me-3"></i>
                WhatsApp Bot
            </h1>
            <p class="lead">Deployed on Render • Pairing Code Only</p>
        </div>

        <div class="row justify-content-center">
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header bg-primary text-white text-center py-3">
                        <h4 class="mb-0"><i class="fas fa-key me-2"></i>Pair Your WhatsApp</h4>
                    </div>
                    <div class="card-body p-4">
                        <form id="pairForm">
                            <div class="mb-3">
                                <label class="form-label fw-semibold">WhatsApp Number</label>
                                <input type="tel" class="form-control form-control-lg" 
                                       id="number" placeholder="252612345678" required>
                                <div class="form-text">Country code + number (no + sign)</div>
                            </div>
                            
                            <div id="errorAlert" class="alert alert-danger d-none">
                                <i class="fas fa-exclamation-triangle me-2"></i>
                                <span id="errorText"></span>
                            </div>
                            
                            <button type="submit" class="btn btn-primary btn-lg w-100" id="pairBtn">
                                <i class="fas fa-key me-2"></i>Get Pairing Code
                            </button>
                        </form>

                        <div id="pairingSection" class="d-none mt-4">
                            <div class="alert alert-info">
                                <i class="fas fa-info-circle me-2"></i>
                                Use this code in WhatsApp
                            </div>
                            
                            <div class="text-center bg-dark text-white p-4 rounded-3 mb-3">
                                <h1 class="display-1 fw-bold pairing-code" id="pairingCodeDisplay">------</h1>
                            </div>
                            
                            <div class="bg-light p-3 rounded-3 mb-3">
                                <h6 class="fw-semibold mb-3"><i class="fas fa-list-ol me-2"></i>Steps:</h6>
                                <ol class="mb-0">
                                    <li class="mb-2">WhatsApp → Settings → Linked Devices</li>
                                    <li class="mb-2">Tap "Link a Device"</li>
                                    <li class="mb-2">Select "Link with Phone Number"</li>
                                    <li>Enter the code above</li>
                                </ol>
                            </div>
                            
                            <div class="text-center">
                                <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                                <span class="text-muted">Waiting for connection...</span>
                            </div>
                            
                            <button class="btn btn-outline-secondary w-100 mt-3" onclick="resetPairing()">
                                <i class="fas fa-arrow-left me-2"></i>Cancel
                            </button>
                        </div>

                        <div id="successSection" class="d-none text-center">
                            <div class="alert alert-success">
                                <i class="fas fa-check-circle fa-2x mb-3"></i>
                                <h4>Connected Successfully! 🎉</h4>
                                <p>Your WhatsApp bot is now active</p>
                            </div>
                            <button class="btn btn-success w-100" onclick="resetPairing()">
                                <i class="fas fa-plus me-2"></i>Pair Another Bot
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Active Bots -->
                <div class="card mt-4">
                    <div class="card-header bg-success text-white">
                        <h5 class="mb-0"><i class="fas fa-list me-2"></i>Active Bots</h5>
                    </div>
                    <div class="card-body">
                        <div id="botsList">
                            <div class="text-center text-muted py-3">
                                <i class="fas fa-robot fa-2x mb-2"></i>
                                <p>No active bots</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Commands -->
                <div class="card mt-4">
                    <div class="card-header bg-info text-white">
                        <h5 class="mb-0"><i class="fas fa-terminal me-2"></i>Commands</h5>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-6 mb-2">
                                <code>.ping</code>
                                <small class="d-block text-muted">Test bot</small>
                            </div>
                            <div class="col-6 mb-2">
                                <code>.tagall</code>
                                <small class="d-block text-muted">Mention all</small>
                            </div>
                            <div class="col-6 mb-2">
                                <code>.antilink</code>
                                <small class="d-block text-muted">Link protection</small>
                            </div>
                            <div class="col-6 mb-2">
                                <code>.help</code>
                                <small class="d-block text-muted">Show help</small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const API_BASE = window.location.origin;
        let statusCheckInterval;

        // Pair form handler
        document.getElementById('pairForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const number = document.getElementById('number').value;
            const pairBtn = document.getElementById('pairBtn');
            
            pairBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Getting Code...';
            pairBtn.disabled = true;
            hideError();

            try {
                const response = await fetch('/pair', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ number })
                });

                const data = await response.json();
                
                if (data.success && data.pairingCode) {
                    showPairingCode(data.pairingCode, data.number);
                } else {
                    throw new Error(data.error || 'Failed to get pairing code');
                }
            } catch (error) {
                showError(error.message);
            } finally {
                pairBtn.innerHTML = '<i class="fas fa-key me-2"></i>Get Pairing Code';
                pairBtn.disabled = false;
            }
        });

        function showPairingCode(code, number) {
            document.getElementById('pairForm').classList.add('d-none');
            document.getElementById('pairingSection').classList.remove('d-none');
            document.getElementById('pairingCodeDisplay').textContent = code;
            
            // Check status every 2 seconds
            statusCheckInterval = setInterval(async () => {
                try {
                    const response = await fetch('/status/' + number);
                    const data = await response.json();
                    
                    if (data.status.status === 'online') {
                        clearInterval(statusCheckInterval);
                        showSuccess();
                        loadBots();
                    }
                } catch (error) {
                    console.log('Status check error');
                }
            }, 2000);
            
            // Stop checking after 2 minutes
            setTimeout(() => {
                if (statusCheckInterval) clearInterval(statusCheckInterval);
            }, 120000);
        }

        function resetPairing() {
            if (statusCheckInterval) clearInterval(statusCheckInterval);
            document.getElementById('pairForm').classList.remove('d-none');
            document.getElementById('pairingSection').classList.add('d-none');
            document.getElementById('successSection').classList.add('d-none');
            document.getElementById('number').value = '';
            hideError();
            loadBots();
        }

        function showSuccess() {
            document.getElementById('pairingSection').classList.add('d-none');
            document.getElementById('successSection').classList.remove('d-none');
        }

        function showError(message) {
            const errorAlert = document.getElementById('errorAlert');
            const errorText = document.getElementById('errorText');
            errorText.textContent = message;
            errorAlert.classList.remove('d-none');
        }

        function hideError() {
            document.getElementById('errorAlert').classList.add('d-none');
        }

        // Load active bots
        async function loadBots() {
            try {
                const response = await fetch('/bots');
                const data = await response.json();
                
                const botsList = document.getElementById('botsList');
                
                if (Object.keys(data.bots).length === 0) {
                    botsList.innerHTML = '<div class="text-center text-muted py-3"><i class="fas fa-robot fa-2x mb-2"></i><p>No active bots</p></div>';
                    return;
                }
                
                let html = '';
                for (const [number, bot] of Object.entries(data.bots)) {
                    const statusClass = bot.status === 'online' ? 'bg-success' : 
                                      bot.status === 'pairing' ? 'bg-warning' : 'bg-secondary';
                    
                    html += \`
                        <div class="card mb-2">
                            <div class="card-body py-2">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <strong>\${number}</strong>
                                        <br>
                                        <small class="text-muted">Status: \${bot.status}</small>
                                    </div>
                                    <span class="badge \${statusClass}">\${bot.status}</span>
                                </div>
                            </div>
                        </div>
                    \`;
                }
                
                botsList.innerHTML = html;
            } catch (error) {
                console.log('Error loading bots');
            }
        }

        // Load bots on page load
        document.addEventListener('DOMContentLoaded', loadBots);
    </script>
</body>
</html>
  `);
});

// API Routes
app.post('/pair', async (req, res) => {
  const { number } = req.body;
  
  if (!number) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  const cleanNumber = number.replace(/\D/g, '');
  
  try {
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
      
      if (pairingCode && !pairingCodeSent) {
        pairingCodeSent = true;
        console.log(`Pairing code for ${cleanNumber}: ${pairingCode}`);
        
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
        console.log(`✅ ${cleanNumber} connected!`);
        botStatus.set(cleanNumber, { 
          status: 'online', 
          lastUpdate: new Date(),
          connectedAt: new Date()
        });

        // Send welcome message
        const jid = `${cleanNumber}@s.whatsapp.net`;
        try {
          await sock.sendMessage(jid, {
            text: '🤖 *Bot Connected Successfully!*\\n\\n' +
                  '✅ Ready to use!\\n\\n' +
                  '📝 Commands:\\n' +
                  '• .ping - Test bot\\n' +
                  '• .tagall - Mention all\\n' +
                  '• .antilink on/off\\n' +
                  '• .help - Show help\\n\\n' +
                  '🚀 Deployed on Render'
          });
        } catch (error) {
          console.log('Welcome message error');
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

    // Handle messages
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
        await sock.sendMessage(jid, {
          text: `🏓 Pong! \\n🚀 Render Bot`
        });
      } 
      else if (userMessage.startsWith('.tagall')) {
        try {
          const groupMetadata = await sock.groupMetadata(jid);
          const participants = groupMetadata.participants;
          
          let mentions = [];
          let taggedText = \`📢 Hello everyone!\\n\\n\`;
          
          participants.forEach(participant => {
            mentions.push(participant.id);
            taggedText += \`@\${participant.id.split('@')[0]} \`;
          });
          
          await sock.sendMessage(jid, {
            text: taggedText,
            mentions: mentions
          });
        } catch (error) {
          await sock.sendMessage(jid, {
            text: '❌ Use in groups only!'
          });
        }
      } 
      else if (userMessage.startsWith('.antilink')) {
        await sock.sendMessage(jid, {
          text: '🛡️ Anti-link feature active!'
        });
      }
      else if (userMessage.startsWith('.help')) {
        await sock.sendMessage(jid, {
          text: \`🤖 *Bot Commands*\\n\\n\` +
                \`*.ping* - Test bot\\n\` +
                \`*.tagall* - Mention all\\n\` +
                \`*.antilink* - Link protection\\n\` +
                \`*.help* - Show help\\n\\n\` +
                \`🚀 Powered by Render\`
        });
      }
    });

    activeBots.set(cleanNumber, sock);

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!pairingCodeSent && !res.headersSent) {
        res.status(408).json({ error: 'Timeout. Try again.' });
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
  const { number } = req.params;
  const cleanNumber = number.replace(/\D/g, '');
  
  const status = botStatus.get(cleanNumber) || { status: 'not_paired' };
  res.json({ 
    number: cleanNumber,
    status: status
  });
});

// Get all bots
app.get('/bots', (req, res) => {
  const bots = {};
  botStatus.forEach((status, number) => {
    bots[number] = status;
  });
  
  res.json({ bots });
});

// Health check for Render
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`🚀 WhatsApp Bot running on port \${PORT}\`);
  console.log(\`🔢 Pairing Code Mode: Enabled\`);
  console.log(\`🌐 Server is ready!\`);
});
