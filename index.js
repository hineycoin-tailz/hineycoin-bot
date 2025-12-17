const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const express = require('express');

// --- 1. CONFIGURATION ---
const HINEY_NFT_SYMBOL = 'hiney_kin'; // <--- Updated Symbol
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
// Secure keys from Render Environment Variables
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

// Fetch Token Prices (DexScreener)
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
      vol: pair.volume.h24
    };
  } catch (error) { return null; }
}

// Fetch NFT Floor Price (Magic Eden)
async function getNFTFloorPrice(symbol) {
  try {
    const url = `https://api-mainnet.magiceden.dev/v2/collections/${symbol}/stats`;
    const response = await axios.get(url, { timeout: 5000 });
    
    // Magic Eden returns floorPrice in Lamports (1 SOL = 1,000,000,000 Lamports)
    const floorInSol = response.data.floorPrice / 1000000