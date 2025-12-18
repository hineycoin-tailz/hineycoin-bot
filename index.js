const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const express = require('express');

// --- 1. CONFIGURATION ---
const HINEY_NFT_SYMBOL = 'hiney_kin'; 
const HINEY_ADDRESS = 'DDAjZFshfVvdRew1LjYSPMB3mgDD9vSW74eQouaJnray';
const SOL_ADDRESS = 'So11111111111111111111111111111111111111112';

// LINKS
const WEB_APP_URL = 'https://hiney-miniapp-jivkkyha7-hineycoin-tailzs-projects.vercel.app/';
const DIRECT_LINK = 'https://t.me/Hineycoinbot/app'; 

// --- 2. FAKE SERVER (For Render) ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => { res.send('Hineycoinbot is Alive'); });

app.listen(port, '0.0.0.0', () => { 
  console.log(`🌐 Fake server listening on port ${port}`); 
});

// --- 3. BOT & DATABASE SETUP ---
const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- 4. DEBUGGER ---
bot.use((ctx, next) => {
  if (ctx.message && ctx.message.text) {
    console.log('👂 HEARD: ' + ctx.message.text);
  }
  return next();
});

// --- 5. FUNCTIONS ---

// Fetch Token Prices
async function getTokenPrice(address) {
  try {
    const url = 'https://api.dexscreener.com/latest/dex/tokens/' + address;
    const response = await axios.get(url, { timeout: 5000 });
    const pair = response.data.pairs[0];
    if (!pair) return null;
    return {
      price: pair.priceUsd,
      change: pair.priceChange.h24,
      liq: pair.liquidity.usd,
      vol: pair.volume.h24,
      symbol: pair.baseToken.symbol
    };
  } catch (error) { return null; }
}

// Fetch NFT Floor
async function getNFTFloorPrice(symbol) {
  try {
    const url = `https://api-mainnet.magiceden.dev/v2/collections/${symbol}/stats`;
    const response = await axios.get(url, { timeout: 5000 });
    const floorInSol = response.data.floorPrice / 1000000000;
    
    return {
      floor: floorInSol.toFixed(2),
      listed: response.data.listedCount,
      volume: (response.data.volumeAll / 1000000000).toFixed(0)
    };
  } catch (error) {
    console.log("❌ NFT API Error:", error.message);
    return null;
  }
}

// Safe File Picker (Filters out system files)
function getRandomMedia() {
  try {
    const memeFolder = path.join(__dirname, 'memes');
    if (!fs.existsSync(memeFolder)) return null;
    
    const files = fs.readdirSync(memeFolder);
    const validFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov', '.avi'].includes(ext);
    });

    if (validFiles.length === 0) return null;
    return path.join(memeFolder, validFiles[Math.floor(Math.random() * validFiles.length)]);
  } catch (error) { return null; }
}

// Smart Media Sender
async function sendSmartMedia(ctx, filePath, captionText) {
  const ext = path.extname(filePath).toLowerCase();
  const fileSource = { source: filePath };
  const options = { caption: captionText, parse_mode: 'Markdown', disable_web_page_preview: true };
  
  try {
    if (['.mp4', '.mov', '.avi'].includes(ext)) await ctx.replyWithVideo(fileSource, options);
    else if (ext === '.gif') await ctx.replyWithAnimation(fileSource, options);
    else await ctx.replyWithPhoto(fileSource, options);
  } catch (error) {
    console.log('⚠️ Media failed, sending text fallback.');
    await ctx.replyWithMarkdown(captionText, { disable_web_page_preview: true });
  }
}

// --- 6. COMMANDS ---

bot.start(async (ctx) => {
  ctx.reply('Welcome to HineyCoin! Commands:\n/price - Market Stats\n/hiney - HINEY Price\n/sol - SOL Price\n/floor - NFT Stats\n/meme - Random Meme\n/launch - Open App');
});

// 1. /price (Combines HINEY + SOL)
bot.command('price', async (ctx) => {
  const hiney = await getTokenPrice(HINEY_ADDRESS);
  const sol = await getTokenPrice(SOL_ADDRESS);
  let msg = '📊 **Market Snapshot**\n\n';
  if (hiney) msg += '🍑 $HINEY: $' + hiney.price + ' (' + hiney.change + '%)\n';
  if (sol)   msg += '☀️ $SOL: $' + sol.price + ' (' + sol.change + '%)';
  
  const media = getRandomMedia();
  if (media) await sendSmartMedia(ctx, media, msg);
  else await ctx.replyWithMarkdown(msg);
});

// 2. /hiney (HINEY only)
bot.command('hiney', async (ctx) => {
  const hiney = await getTokenPrice(HINEY_ADDRESS);
  if (!hiney) return ctx.reply('⚠️ Could not fetch HINEY price.');
  
  const msg = `🍑 **$HINEY**\nPrice: $${hiney.price}\nChange (24h): ${hiney.change}%`;
  const media = getRandomMedia();
  if (media) await sendSmartMedia(ctx, media, msg);
  else await ctx.replyWithMarkdown(msg);
});

// 3. /sol (SOL only)
bot.command('sol', async (ctx) => {
  const sol = await getTokenPrice(SOL_ADDRESS);
  if (!sol) return ctx.reply('⚠️ Could not fetch SOL price.');
  
  const msg = `☀️ **$SOL**\nPrice: $${sol.price}\nChange (24h): ${sol.change}%`;
  await ctx.replyWithMarkdown(msg);
});

// 4. /floor (NFTs)
bot.command('floor', async (ctx) => {
  const nftData = await getNFTFloorPrice(HINEY_NFT_SYMBOL);
  if (!nftData) return ctx.reply("❌ NFT Data Unavailable.");

  const msg = `🍑 **The Hiney-kin Stats**\n\n` +
              `🧱 **Floor:** ${nftData.floor} SOL\n` +
              `📦 **Listed:** ${nftData.listed}\n` +
              `📊 **Volume:** ${nftData.volume} SOL\n\n` +
              `🔗 [View on Magic Eden](https://magiceden.io/marketplace/${HINEY_NFT_SYMBOL})`;

  const media = getRandomMedia();
  if (media) await sendSmartMedia(ctx, media, msg);
  else await ctx.replyWithMarkdown(msg, { disable_web_page_preview: true });
});

// 5. /meme (Random Meme only)
bot.command('meme', async (ctx) => {
  const media = getRandomMedia();
  if (media) await sendSmartMedia(ctx, media, "🍑 Fresh Hiney Meme!");
  else ctx.reply("No memes found in the folder!");
});

// 6. /launch (Open App)
bot.command('launch', async (ctx) => {
  const isPrivate = ctx.chat.type === 'private';
  
  // In private chat, we use web_app to open inside Telegram
  // In groups, we use a URL button to link to the bot
  const button = isPrivate 
    ? { text: '🚀 Launch Hiney App', web_app: { url: WEB_APP_URL } }
    : { text: '🚀 Launch Hiney App', url: DIRECT_LINK };

  await ctx.reply('🍑 **Tap to Launch:**', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[ button ]] }
  });
});

// --- 7. START BOT ---
bot.launch();
console.log('🍑 Hineycoinbot is running...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));