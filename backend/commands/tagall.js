export const tagallCommand = async (sock, message, jid, userNumber, text) => {
  try {
    const groupMetadata = await sock.groupMetadata(jid);
    const participants = groupMetadata.participants;
    
    const messageText = text.replace('.tagall', '').trim() || 'Hello everyone!';
    
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
};
