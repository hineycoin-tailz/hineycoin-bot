require('dotenv').config();
const { Telegraf } = require('telegraf');
const { TwitterApi } = require('twitter-api-v2');
const axios = require('axios');
const express = require('express');

// --- 1. CONFIGURATION ---
const HINEY_NFT_SYMBOL = 'hiney_kin'; 
const MIN_SALE_PRICE = 0.01; 

// --- 2. DEBUG & SETUP ---
console.log("🔍 Checking Environment Variables...");
// Change this line:
if (!process.env.TELEGRAM_CHAT_IDS) { 
    console.error("❌ CRITICAL ERROR: TELEGRAM_CHAT_IDS is missing in .env file!");
    process.exit(1);
}
if (!process.env.BOT_TOKEN) {
    console.error("❌ CRITICAL ERROR: BOT_TOKEN is missing in .env file!");
    process.exit(1);
}
console.log("✅ Keys loaded successfully.");

const app = express();
app.use(express.json()); 

const bot = new Telegraf(process.env.BOT_TOKEN);

const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

// --- 3. SERVER & WEBHOOK ---
const port = process.env.PORT || 3000;

app.get('/', (req, res) => { res.send('Hineycoinbot is Alive'); });

app.post('/webhook', async (req, res) => {
  const events = req.body;
  if (!events || !Array.isArray(events)) return res.sendStatus(400);

  for (const event of events) {
    if (event.type === 'NFT_SALE') {
      
      // 1. Extract Data
      const price = event.amount / 1_000_000_000;
      const nftMint = event.nfts[0].mint;
      const nftName = event.nfts[0].name || "Hiney-Kin";
      const buyer = event.buyer;
      const source = event.source || "Marketplace";
      // Fallback image if missing
      const imageUrl = event.nfts[0].metadata?.image || "https://hineycoin.online/logo.png";

      if (price < MIN_SALE_PRICE) continue;

      console.log(`💰 New Sale Detected: ${nftName} for ${price} SOL`);

      // 2. PREPARE MESSAGES
      // HTML for Telegram (Prevents "parse entities" crash)
      const telegramCaption = `🚨 <b>HINEY-KIN ADOPTED!</b> 🚨\n\n` +
                              `🖼️ <b>${nftName}</b>\n` +
                              `💰 Sold for: <b>${price} SOL</b>\n` +
                              `🛒 Marketplace: ${source}\n` +
                              `🤝 Buyer: <code>${buyer.slice(0, 4)}...${buyer.slice(-4)}</code>\n\n` +
                              `<a href="https://magiceden.io/item-details/${nftMint}">View on Magic Eden</a>`;

      // Text for Twitter (Includes timestamp to prevent "Duplicate Tweet" 403 errors during testing)
      const uniqueId = new Date().toISOString().split('T')[1].split('.')[0]; // e.g. "14:30:05"
      const twitterText = `🚨 HINEY-KIN ADOPTED! \n\n` +
                          `🖼️ ${nftName} just sold for ${price} SOL!\n` +
                          `🛒 Market: ${source}\n` +
                          `🤝 Buyer: ${buyer.slice(0, 4)}...${buyer.slice(-4)}\n` +
                          `⏰ ${uniqueId}\n\n` +
                          `#Solana #HineyCoin $HINEY`;

      // 3. POST TO TELEGRAM (Broadcast to Multiple Groups)
      
      // A. Split the list of IDs from .env by comma
      // If you named it TELEGRAM_CHAT_ID in .env, change this to match!
      const chatIds = process.env.TELEGRAM_CHAT_IDS.split(',');

      // B. Loop through every ID and send the message
      for (const chatId of chatIds) {
          try {
            // Trim removes accidental spaces (e.g. " -100..." becomes "-100...")
            await bot.telegram.sendPhoto(chatId.trim(), imageUrl, {
              caption: telegramCaption,
              parse_mode: 'HTML' 
            });
            console.log(`✅ Posted to Telegram Group: ${chatId}`);
          } catch (err) {
            console.error(`❌ Failed to post to ${chatId}:`, err.message);
            // We continue the loop so one bad group doesn't stop the others!
          }
      }
      // 4. POST TO TWITTER (X)
      try {
        // A. Download image with "Browser Disguise"
        const imageResponse = await axios.get(imageUrl, { 
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/110.0.0.0 Safari/537.36',
                'Referer': 'https://magiceden.io/'
            }
        });
        
        const imageBuffer = Buffer.from(imageResponse.data);
        const mimeType = imageResponse.headers['content-type'] || 'image/png'; // Safety Fallback

        // B. Upload Media
        const mediaId = await twitterClient.v1.uploadMedia(imageBuffer, { mimeType: mimeType });

        // C. Send Tweet
        await twitterClient.v2.tweet({
          text: `${twitterText}\n🔗 https://magiceden.io/item-details/${nftMint}`,
          media: { media_ids: [mediaId] }
        });
        
        console.log(`✅ Posted to X (with image): ${nftName}`);

      } catch (err) {
        console.error(`❌ Twitter Error (Code ${err.code || '?'}) : ${err.message}`);
        
        // Fallback: Tweet text only if image fails
        try {
            await twitterClient.v2.tweet(`${twitterText}\n🔗 https://magiceden.io/item-details/${nftMint}`);
            console.log(`⚠️ Posted to X (Text Only fallback)`);
        } catch (innerErr) {
            console.error('❌ Twitter Text Fallback Failed:', innerErr.message);
        }
      }
    }
  }
  res.sendStatus(200);
});

app.listen(port, '0.0.0.0', () => { 
  console.log(`🌐 Hineycoinbot Webhook listening on port ${port}`); 
});

bot.launch();
console.log('🍑 Hineycoinbot is running...');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));