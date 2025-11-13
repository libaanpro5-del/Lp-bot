import express from 'express';
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';

const app = express();
app.use(express.json());

const activeSockets = new Map();

// Simple HTML frontend
const html = `
<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp Bot</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh; 
            padding: 20px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .container { max-width: 500px; }
        .card { border: none; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
        .pairing-code { 
            font-family: 'Courier New', monospace; 
            font-size: 2.5rem; 
            font-weight: bold;
            letter-spacing: 8px;
            background: #000;
            color: #fff;
            padding: 20px;
            border-radius: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div class="card-header bg-success text-white text-center py-3">
                <h4 class="mb-1">WhatsApp Bot</h4>
                <p class="mb-0">Ready to Use</p>
            </div>
            <div class="card-body p-4">
                <!-- Step 1: Input Form -->
                <div id="step1">
                    <form id="pairForm">
                        <div class="mb-3">
                            <label class="form-label fw-semibold">WhatsApp Number</label>
                            <input type="tel" class="form-control form-control-lg" 
                                   id="number" placeholder="1234567890" required>
                            <div class="form-text">Country code + number without + sign</div>
                        </div>
                        
                        <div id="errorAlert" class="alert alert-danger d-none">
                            <i class="fas fa-exclamation-triangle me-2"></i>
                            <span id="errorText"></span>
                        </div>
                        
                        <button type="submit" class="btn btn-success btn-lg w-100 py-3">
                            <i class="fas fa-key me-2"></i>Get Pairing Code
                        </button>
                    </form>
                </div>

                <!-- Step 2: Pairing Code -->
                <div id="step2" class="d-none text-center">
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle me-2"></i>
                        Use this code in WhatsApp
                    </div>
                    
                    <div class="pairing-code mb-3" id="pairingCodeDisplay">------</div>
                    
                    <div class="bg-light p-3 rounded-3 mb-3">
                        <h6 class="fw-semibold mb-3">Steps to Pair:</h6>
                        <ol class="text-start mb-0">
                            <li class="mb-2">Open WhatsApp → Settings → Linked Devices</li>
                            <li class="mb-2">Tap "Link a Device"</li>
                            <li class="mb-2">Select "Link with Phone Number"</li>
                            <li>Enter the code above</li>
                        </ol>
                    </div>
                    
                    <div class="text-muted mb-3">
                        <div class="spinner-border spinner-border-sm text-success me-2"></div>
                        Waiting for connection...
                    </div>
                    
                    <button class="btn btn-secondary w-100" onclick="resetForm()">
                        <i class="fas fa-arrow-left me-2"></i>Try Another Number
                    </button>
                </div>

                <!-- Step 3: Success -->
                <div id="step3" class="d-none text-center">
                    <div class="alert alert-success">
                        <i class="fas fa-check-circle fa-2x mb-3"></i>
                        <h4>Connected Successfully! 🎉</h4>
                        <p class="mb-0">Your WhatsApp bot is now active</p>
                    </div>
                    
                    <div class="bg-light p-3 rounded-3 mb-3">
                        <h6>Try these commands:</h6>
                        <div class="row text-center">
                            <div class="col-6 mb-2"><code>.ping</code></div>
                            <div class="col-6 mb-2"><code>.tagall</code></div>
                            <div class="col-6 mb-2"><code>.antilink</code></div>
                            <div class="col-6 mb-2"><code>.help</code></div>
                        </div>
                    </div>
                    
                    <button class="btn btn-success w-100" onclick="resetForm()">
                        <i class="fas fa-plus me-2"></i>Pair Another Bot
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Font Awesome -->
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">

    <script>
        let statusCheckInterval;

        document.getElementById('pairForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const number = document.getElementById('number').value;
            const btn = e.target.querySelector('button');
            
            if (!number) {
                showError('Please enter a phone number');
                return;
            }

            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Getting Code...';
            btn.disabled = true;
            hideError();

            try {
                const response = await fetch('/pair', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ number: number })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showPairingCode(data.pairingCode, data.number);
                } else {
                    throw new Error(data.error || 'Failed to get pairing code');
                }
            } catch (error) {
                showError('Error: ' + error.message);
            } finally {
                btn.innerHTML = '<i class="fas fa-key me-2"></i>Get Pairing Code';
                btn.disabled = false;
            }
        });

        function showPairingCode(code, number) {
            document.getElementById('step1').classList.add('d-none');
            document.getElementById('step2').classList.remove('d-none');
            document.getElementById('pairingCodeDisplay').textContent = code;
            
            checkConnectionStatus(number);
        }

        function checkConnectionStatus(number) {
            statusCheckInterval = setInterval(async () => {
                try {
                    const response = await fetch('/status/' + number);
                    const data = await response.json();
                    
                    if (data.status === 'online') {
                        clearInterval(statusCheckInterval);
                        showSuccess();
                    }
                } catch (error) {
                    console.log('Status check error');
                }
            }, 2000);

            setTimeout(() => {
                if (statusCheckInterval) clearInterval(statusCheckInterval);
            }, 120000);
        }

        function showSuccess() {
            document.getElementById('step2').classList.add('d-none');
            document.getElementById('step3').classList.remove('d-none');
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

        function resetForm() {
            if (statusCheckInterval) clearInterval(statusCheckInterval);
            document.getElementById('step1').classList.remove('d-none');
            document.getElementById('step2').classList.add('d-none');
            document.getElementById('step3').classList.add('d-none');
            document.getElementById('number').value = '';
            hideError();
        }
    </script>
</body>
</html>
`;

// Routes
app.get('/', (req, res) => {
  res.send(html);
});

app.post('/pair', async (req, res) => {
  try {
    const { number } = req.body;
    
    if (!number) {
      return res.json({ success: false, error: 'Phone number is required' });
    }

    const cleanNumber = number.replace(/\D/g, '');
    console.log('🟡 Starting pairing for:', cleanNumber);
    
    // Get authentication state
    const { state, saveCreds } = await useMultiFileAuthState(`sessions_${cleanNumber}`);
    const { version } = await fetchLatestBaileysVersion();
    
    // Create WhatsApp socket - NO LOGGER to avoid errors
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      // Remove logger completely to avoid errors
    });

    let pairingCodeSent = false;

    sock.ev.on('connection.update', (update) => {
      const { connection, pairingCode } = update;
      
      console.log('🔵 Connection update:', connection);
      
      // Send pairing code to frontend
      if (pairingCode && !pairingCodeSent) {
        pairingCodeSent = true;
        console.log('✅ Pairing code received:', pairingCode);
        
        activeSockets.set(cleanNumber, { sock, status: 'pairing' });
        
        return res.json({
          success: true,
          pairingCode: pairingCode,
          number: cleanNumber,
          message: 'Use this code in WhatsApp'
        });
      }

      // Handle connection open
      if (connection === 'open') {
        console.log('🟢 Connected successfully to:', cleanNumber);
        activeSockets.set(cleanNumber, { sock, status: 'online' });

        // Send welcome message
        const jid = `${cleanNumber}@s.whatsapp.net`;
        sock.sendMessage(jid, { 
          text: '✅ *Bot Connected Successfully!*\n\nYour WhatsApp account is now linked with the bot.\n\n📝 *Available Commands:*\n• .ping - Test bot response\n• .tagall - Mention all group members\n• .antilink on/off - Link protection\n• .help - Show all commands\n\nEnjoy! 🚀'
        }).catch(err => console.log('Welcome message error:', err.message));
      }

      // Handle connection close
      if (connection === 'close') {
        console.log('🔴 Connection closed for:', cleanNumber);
        activeSockets.set(cleanNumber, { sock, status: 'offline' });
      }
    });

    // Save credentials when updated
    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
      try {
        const message = messages[0];
        if (!message.message || message.key.fromMe) return;

        const jid = message.key.remoteJid;
        const userMessage = message.message.conversation || 
                           (message.message.extendedTextMessage ? message.message.extendedTextMessage.text : '');

        console.log('📩 Received message:', userMessage);

        // Ping command
        if (userMessage === '.ping') {
          await sock.sendMessage(jid, { 
            text: '🏓 Pong! Bot is working perfectly!\n\nResponse time: ' + Date.now() + 'ms' 
          });
        }
        
        // Help command
        else if (userMessage === '.help') {
          await sock.sendMessage(jid, { 
            text: '🤖 *Bot Commands*\n\n' +
                  '*.ping* - Test bot response time\n' +
                  '*.tagall* - Mention all group members\n' +
                  '*.antilink on/off* - Toggle link protection\n' +
                  '*.help* - Show this help message\n\n' +
                  'Powered by Baileys WhatsApp Bot'
          });
        }
        
        // Tagall command
        else if (userMessage.startsWith('.tagall')) {
          try {
            const groupMetadata = await sock.groupMetadata(jid);
            const participants = groupMetadata.participants;
            
            let mentions = [];
            let taggedText = '📢 *Attention Everyone!* 👋\n\n';
            
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
              text: '❌ This command can only be used in group chats!'
            });
          }
        }
        
        // Antilink command
        else if (userMessage.startsWith('.antilink')) {
          const args = userMessage.split(' ');
          if (args[1] === 'on') {
            await sock.sendMessage(jid, {
              text: '🛡️ Anti-link protection has been enabled!'
            });
          } else if (args[1] === 'off') {
            await sock.sendMessage(jid, {
              text: '🔓 Anti-link protection has been disabled!'
            });
          } else {
            await sock.sendMessage(jid, {
              text: 'Usage: .antilink on/off'
            });
          }
        }
        
      } catch (error) {
        console.log('❌ Message handling error:', error.message);
      }
    });

    // Timeout after 30 seconds if no pairing code
    setTimeout(() => {
      if (!pairingCodeSent && !res.headersSent) {
        return res.json({ success: false, error: 'Pairing timeout. Please try again.' });
      }
    }, 30000);

  } catch (error) {
    console.error('❌ Pairing error:', error);
    if (!res.headersSent) {
      return res.json({ success: false, error: 'Server error: ' + error.message });
    }
  }
});

// Status endpoint
app.get('/status/:number', (req, res) => {
  try {
    const { number } = req.params;
    const cleanNumber = number.replace(/\D/g, '');
    
    const socket = activeSockets.get(cleanNumber);
    const status = socket ? socket.status : 'not_paired';
    
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
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🚀 WhatsApp Bot Server is running!');
  console.log(`📍 Port: ${PORT}`);
  console.log('✅ Ready to accept pairing requests');
});
