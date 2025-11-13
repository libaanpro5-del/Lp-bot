const antilinkSettings = new Map();

export const antilinkCommand = async (sock, message, jid, userNumber, text) => {
  const args = text.split(' ');
  const command = args[1]?.toLowerCase();
  
  if (command === 'on') {
    antilinkSettings.set(jid, true);
    await sock.sendMessage(jid, {
      text: '🛡️ Anti-link protection has been enabled for this group!'
    });
  } else if (command === 'off') {
    antilinkSettings.set(jid, false);
    await sock.sendMessage(jid, {
      text: '🔓 Anti-link protection has been disabled for this group!'
    });
  } else {
    await sock.sendMessage(jid, {
      text: 'Usage: .antilink on/off\nCurrent status: ' + 
            (antilinkSettings.get(jid) ? 'ENABLED' : 'DISABLED')
    });
  }
};

export const checkAntilink = async (sock, message, jid) => {
  if (!antilinkSettings.get(jid)) return false;
  
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  if (urlRegex.test(message.message?.conversation || '')) {
    await sock.sendMessage(jid, {
      text: '❌ Links are not allowed in this group!'
    }, { quoted: message });
    await sock.sendMessage(jid, { delete: message.key });
    return true;
  }
  return false;
};
