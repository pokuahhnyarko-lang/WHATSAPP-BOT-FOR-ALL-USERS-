const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const yts = require('yt-search');
const ytdl = require('ytdl-core');
const cheerio = require('cheerio');

// Configuration
const config = {
    name: "KING_BLESS BOT",
    prefix: "!",
    ownerNumber: "233535502036", // Replace with admin number
    developers: ["Kingsley"],
    autoReply: true,
    autoTyping: true,
    autoReact: true
};

// Auto-reply messages
const autoReplies = {
    "hi": "Hello! 👋 How can I help you?",
    "hello": "Hey there! 😊",
    "menu": "📱 *Available Commands:*\n\n🎵 *Music:*\n!song [name] - Download song\n!yt [query] - Search YouTube\n\n📱 *APK:*\n!apk [app name] - Download APK\n\n🛠 *Tools:*\n!sticker - Create sticker\n!quote - Get random quote\n\n👑 *Admin:*\n!broadcast [msg] - Broadcast message\n!restart - Restart bot\n\n⚙️ *Info:*\n!ping - Check bot status\n!owner - Contact owner",
    "help": "Type !menu to see all commands",
    "thanks": "You're welcome! 😊"
};

// Auto-react emojis
const autoReactEmojis = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

class WhatsAppBot {
    constructor() {
        this.sock = null;
        this.init();
    }

    async init() {
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
        
        const { version } = await fetchLatestBaileysVersion();
        
        this.sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: true,
            browser: Browsers.ubuntu('Chrome'),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' }))
            },
            generateHighQualityLinkPreview: true
        });

        this.sock.ev.on('creds.update', saveCreds);
        this.sock.ev.on('connection.update', this.handleConnectionUpdate.bind(this));
        this.sock.ev.on('messages.upsert', this.handleMessagesUpsert.bind(this));
        
        console.log(chalk.green('🤖 Bot is initializing...'));
    }

    async handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                this.init();
            }
        } else if (connection === 'open') {
            console.log(chalk.green('✅ Connected to WhatsApp!'));
            console.log(chalk.cyan(`👑 Owner: ${config.233535502036}`));
            console.log(chalk.cyan(`👨‍💻 Developers: ${config.developers.join(', ')}`));
        }
    }

    async handleMessagesUpsert({ messages }) {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const messageType = Object.keys(msg.message)[0];
        const text = msg.message[messageType]?.text || msg.message[messageType]?.caption || '';
        const sender = msg.key.remoteJid;
        const isGroup = sender.endsWith('@g.us');
        const isOwner = sender.includes(config.+233535502036.replace('+', ''));

        // Auto typing indicator
        if (config.autoTyping) {
            await this.sock.sendPresenceUpdate('composing', sender);
        }

        // Auto-react to messages
        if (config.autoReact && !text.startsWith(config.prefix)) {
            const randomEmoji = autoReactEmojis[Math.floor(Math.random() * autoReactEmojis.length)];
            await this.sock.sendMessage(sender, {
                react: {
                    text: randomEmoji,
                    key: msg.key
                }
            });
        }

        // Auto-reply to common messages
        if (config.autoReply) {
            const lowerText = text.toLowerCase();
            for (const [key, reply] of Object.entries(autoReplies)) {
                if (lowerText.includes(key.toLowerCase())) {
                    await this.sock.sendMessage(sender, { text: reply });
                    break;
                }
            }
        }

        // Handle commands
        if (text.startsWith(config.prefix)) {
            const command = text.slice(config.prefix.length).trim().split(' ')[0].toLowerCase();
            const args = text.slice(config.prefix.length + command.length).trim();
            
            switch(command) {
                case 'menu':
                    await this.sendMenu(sender);
                    break;
                case 'song':
                    if (args) await this.downloadSong(sender, args);
                    break;
                case 'apk':
                    if (args) await this.downloadApk(sender, args);
                    break;
                case 'yt':
                    if (args) await this.searchYouTube(sender, args);
                    break;
                case 'ping':
                    await this.sock.sendMessage(sender, { text: '🏓 Pong! Bot is alive!' });
                    break;
                case 'owner':
                    await this.sock.sendMessage(sender, { 
                        text: `👑 *Kingsley:* ${config.233535502036}\n👨‍💻 *Developers:* ${config.developers.join(', ')}` 
                    });
                    break;
                case 'sticker':
                    await this.createSticker(sender, msg);
                    break;
                case 'broadcast':
                    if (isOwner && args) await this.broadcastMessage(args);
                    break;
                case 'restart':
                    if (isOwner) {
                        await this.sock.sendMessage(sender, { text: '🔄 Restarting bot...' });
                        process.exit(0);
                    }
                    break;
                default:
                    await this.sock.sendMessage(sender, { 
                        text: `❌ Unknown command. Type ${config.prefix}menu for available commands.` 
                    });
            }
        }
        
        // Stop typing indicator
        if (config.autoTyping) {
            await this.sock.sendPresenceUpdate('paused', sender);
        }
    }

    async sendMenu(sender) {
        const menu = `🎊 *${config.name} MENU* 🎊\n\n` +
            `🎵 *MUSIC DOWNLOADER*\n` +
            `!song [title] - Download MP3\n` +
            `!yt [query] - YouTube Search\n\n` +
            `📱 *APK DOWNLOADER*\n` +
            `!apk [app name] - Download APK\n\n` +
            `🛠 *TOOLS*\n` +
            `!sticker - Make sticker from image\n` +
            `!quote - Random quote\n` +
            `!ping - Check bot status\n\n` +
            `👑 *ADMIN*\n` +
            `!broadcast [msg] - Send to all\n` +
            `!restart - Restart bot\n\n` +
            `📞 *CONTACT*\n` +
            `!owner - Bot owner info\n\n` +
            `🤖 *Developers:* ${config.developers.join(', ')}`;
        
        await this.sock.sendMessage(sender, { text: menu });
    }

    async downloadSong(sender, query) {
        try {
            await this.sock.sendMessage(sender, { text: `🎵 Searching for "${query}"...` });
            
            const search = await yts(query);
            const video = search.videos[0];
            
            if (!video) {
                await this.sock.sendMessage(sender, { text: '❌ No song found!' });
                return;
            }
            
            await this.sock.sendMessage(sender, { 
                text: `⬇️ Downloading: ${video.title}\n⏱ Duration: ${video.timestamp}` 
            });
            
            const stream = ytdl(video.url, { filter: 'audioonly', quality: 'highestaudio' });
            const buffers = [];
            
            stream.on('data', chunk => buffers.push(chunk));
            stream.on('end', async () => {
                const audioBuffer = Buffer.concat(buffers);
                await this.sock.sendMessage(sender, {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    fileName: `${video.title}.mp3`
                });
            });
            
        } catch (error) {
            console.error(error);
            await this.sock.sendMessage(sender, { text: '❌ Error downloading song!' });
        }
    }

    async downloadApk(sender, appName) {
        try {
            await this.sock.sendMessage(sender, { text: `📱 Searching APK for "${appName}"...` });
            
            // Using APKPure search (example)
            const searchUrl = `https://apkpure.com/search?q=${encodeURIComponent(appName)}`;
            const { data } = await axios.get(searchUrl);
            const $ = cheerio.load(data);
            
            const firstResult = $('.first .dd').first().attr('href');
            
            if (!firstResult) {
                await this.sock.sendMessage(sender, { text: '❌ APK not found!' });
                return;
            }
            
            const apkUrl = `https://apkpure.com${firstResult}/download?from=details`;
            
            await this.sock.sendMessage(sender, { 
                text: `✅ APK Found!\n📥 Download Link: ${apkUrl}\n\n⚠️ Note: Download from trusted sources only!` 
            });
            
        } catch (error) {
            console.error(error);
            await this.sock.sendMessage(sender, { 
                text: '❌ Error searching APK. Try another website or check the app name.' 
            });
        }
    }

    async searchYouTube(sender, query) {
        try {
            await this.sock.sendMessage(sender, { text: `🔍 Searching YouTube for "${query}"...` });
            
            const search = await yts(query);
            let results = '📺 *YouTube Results:*\n\n';
            
            search.videos.slice(0, 5).forEach((video, i) => {
                results += `${i+1}. ${video.title}\n⏱ ${video.timestamp}\n👁 ${video.views}\n🔗 ${video.url}\n\n`;
            });
            
            await this.sock.sendMessage(sender, { text: results });
            
        } catch (error) {
            console.error(error);
            await this.sock.sendMessage(sender, { text: '❌ YouTube search failed!' });
        }
    }

    async createSticker(sender, msg) {
        try {
            if (msg.message.imageMessage) {
                await this.sock.sendMessage(sender, { text: '🔄 Creating sticker...' });
                
                const media = await this.sock.downloadMediaMessage(msg);
                await this.sock.sendMessage(sender, {
                    sticker: media,
                    mimetype: 'image/webp'
                });
            } else {
                await this.sock.sendMessage(sender, { 
                    text: '📸 Please send an image with caption !sticker' 
                });
            }
        } catch (error) {
            console.error(error);
            await this.sock.sendMessage(sender, { text: '❌ Failed to create sticker!' });
        }
    }

    async broadcastMessage(message) {
        // This is a simplified broadcast function
        // In real implementation, you'd need to store all chat IDs
        await this.sock.sendMessage(config.233535502036, { 
            text: '📢 Broadcast feature needs chat list implementation.' 
        });
    }
}

// Add chalk for colors (install separately if needed)
const chalk = {
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`
};

// Start bot
new WhatsAppBot();

// Handle errors
process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.log('Uncaught Exception:', error);
});
