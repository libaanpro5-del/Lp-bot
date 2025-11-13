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
        body { background: #f0f2f5; padding: 20px; }
        .container { max-width: 500px; }
        .code { font-family: monospace; font-size: 2.5rem; font-weight: bold; background: #000; color: #fff; padding: 20px; border-radius: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="card shadow">
            <div class="card-header bg-success text-white text-center">
                <h4>WhatsApp Bot</h4>
                <p class="mb-0">Working Version</p>
            </div>
            <div class="card-body p-4">
                <form id="pairForm">
                    <div class="mb-3">
                        <label class="form-label">Your WhatsApp Number</label>
                        <input type="tel" class="form-control" id="number" placeholder="1234567890" required>
                        <small class="text-muted">Country code + number without +</small>
                    </div>
                    <button type="submit" class="btn btn-success w-100">Get Pairing Code</button>
                </form>

                <div id="pairing" class="d-none mt-4 text-center">
                    <div class="alert alert-info">
                        <strong>Pairing Code:</strong>
                        <div class="code mt-2" id="pairingCode">000000</div>
                    </div>
                    <p class="text-muted">
                        WhatsApp → Settings → Linked Devices → Link a Device → Link with Phone Number
                    </p>
                    <div class="spinner-border text-success"></div>
                    <p>Waiting for connection...</p>
                </div>

                <div id="connected" class="d-none text-center">
                    <div class="alert alert-success">
                        <h5>✅ Connected!</h5>
                        <p>Your bot is ready. Send .ping to test.</p>
                    </div>
                    <button onclick="location.reload()" class="btn btn-outline-success">Add Another</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        document.getElementById('pairForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const number = document.getElementById('number').value;
            const btn = e.target.querySelector('button');
            
            btn.textContent = 'Getting Code...';
            btn.disabled = true;

            try {
                const response = await fetch('/pair', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ number })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('pairForm').classList.add('d-none');
                    document.getElementById('pairing').classList.remove('d-none');
                    document.getElementById('pairingCode').textContent = data.pairingCode;
                    
                    // Check connection status
                    checkStatus(data.number);
                } else {
                    alert('Error: ' + data.error);
                }
            } catch (error) {
                alert('Failed to connect: ' + error.message);
            } finally {
                btn.textContent = 'Get Pairing Code';
                btn.disabled = false;
            }
        });

        async function checkStatus(number) {
            const check = setInterval(async () => {
                try {
                    const response = await fetch('/status/' + number);
                    const data = await response.json();
                    
                    if (data.status === 'online') {
                        clearInterval(check);
                        document.getElementById('pairing').classList.add('d-none');
                        document.getElementById('connected').classList.remove('d-none');
                    }
                } catch (e) {
                    // Ignore errors
                }
            }, 2000);
        }
    </script>
</body>
</html>
`;

app.get('/', (req, res) => {
  res.send(html);
});

app.post('/pair', async (req, res) => {
  const { number } = req.body;
  
  if (!number) {
    return res.json({ success: false, error: 'Number required' });
  }

  const cleanNumber = number.replace(/\D/g, '');
  
  try {
    console.log('Starting pairing for:', cleanNumber);
    
    const { state, saveCreds } = await useMultiFileAuthState(`sessions_${cleanNumber}`);
    const { version } = await fetchLatestBaileysVersion();
    
    // ✅ CORRECT FUNCTION NAME: makeWASocket (not makeWASocket)
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: { level: 'silent' }
    });

    let pairingCodeSent = false;

    sock.ev.on('connection.update', (update) => {
      const { connection, qr, pairingCode } = update;
      
      console.log('Connection update:', { connection, hasPairingCode: !!pairingCode });
      
      if (pairingCode && !pairingCodeSent) {
        pairingCodeSent = true;
        console.log('✅ Got pairing code:', pairingCode);
        
        activeSockets.set(cleanNumber, { sock, status: 'pairing' });
        
        return res.json({
          success: true,
          pairingCode: pairingCode,
          number: cleanNumber
        });
      }
      
      if (connection === 'open') {
        console.log('🚀 Connected successfully!');
        activeSockets.set(cleanNumber, { sock, status: 'online' });
        
        // Send welcome message
        const jid = `${cleanNumber}@s.whatsapp.net`;
        sock.sendMessage(jid, { 
          text: '✅ *Bot Connected!*\n\nSend .ping to test or .help for commands.' 
        }).catch(console.log);
      }
      
      if (connection === 'close') {
        console.log('❌ Connection closed');
        activeSockets.set(cleanNumber, { sock, status: 'offline' });
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Handle messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
      try {
        const message = messages[0];
        if (!message.message || message.key.fromMe) return;

        const jid = message.key.remoteJid;
        const text = message.message.conversation || '';
        
        console.log('Received message:', text);

        if (text === '.ping') {
          await sock.sendMessage(jid, { text: '🏓 Pong! Bot is working!' });
        }
        else if (text === '.help') {
          await sock.sendMessage(jid, { 
            text: '🤖 *Bot Commands*\n.ping - Test bot\n.help - Show this help' 
          });
        }
        else if (text.startsWith('.tagall')) {
          try {
            const groupInfo = await sock.groupMetadata(jid);
            let mentions = [];
            let tagText = '👋 Hello everyone!\n\n';
            
            groupInfo.participants.forEach(participant => {
              mentions.push(participant.id);
              tagText += `@${participant.id.split('@')[0]} `;
            });
            
            await sock.sendMessage(jid, { text: tagText, mentions });
          } catch (e) {
            await sock.sendMessage(jid, { text: '❌ Use in groups only' });
          }
        }
      } catch (error) {
        console.log('Message error:', error);
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!pairingCodeSent && !res.headersSent) {
        res.json({ success: false, error: 'Timeout. Try again.' });
      }
    }, 30000);

  } catch (error) {
    console.error('Pairing failed:', error);
    if (!res.headersSent) {
      res.json({ success: false, error: error.message });
    }
  }
});

app.get('/status/:number', (req, res) => {
  const { number } = req.params;
  const cleanNumber = number.replace(/\D/g, '');
  
  const socket = activeSockets.get(cleanNumber);
  res.json({ 
    number: cleanNumber,
    status: socket ? socket.status : 'not_found'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🚀 WhatsApp Bot Server Running!');
  console.log(`📍 http://localhost:${PORT}`);
});
