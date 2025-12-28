// testSale.js
const axios = require('axios');

// 1. Paste your image link inside these quotes! 
// (Make sure it ends in .png or .jpg if possible)
const MY_TEST_IMAGE = "https://img-cdn.magiceden.dev/rs:fill:800:0:0/plain/https%3A%2F%2Fna-assets.pinit.io%2F6UTjjWFuPkZPbhPYnhfyz8Hm4nYMxkJWyvxnFt1Y1JL8%2F034ce7d7-3481-490d-a815-c7a7c5e5a454%2F2824"; 

const WEBHOOK_URL = 'http://localhost:3000/webhook'; 

const mockPayload = [
  {
    type: 'NFT_SALE',
    amount: 5000000000, // 5 SOL
    buyer: 'HineyTester',
    source: 'MAGIC_EDEN',
    nfts: [
      {
        mint: 'FakeMintAddress',
        name: 'Hiney-Kin #TEST',
        metadata: {
          image: MY_TEST_IMAGE // <--- This sends your pic to the bot
        }
      }
    ]
  }
];

console.log("🚀 Sending Custom Hiney Test...");

axios.post(WEBHOOK_URL, mockPayload)
  .then(() => console.log("✅ Payload sent! Check X/Twitter now."))
  .catch(err => console.error("❌ Error:", err.message));