const { createCanvas } = require('canvas');
const fs = require('fs');

const canvas = createCanvas(800, 600);
const ctx = canvas.getContext('2d');

ctx.fillStyle = '#fff';
ctx.fillRect(0, 0, 800, 600);

ctx.fillStyle = '#333';
ctx.font = '48px sans-serif';
ctx.fillText('Hello from WSL + canvas!', 50, 100);

const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('output.png', buffer);

console.log('✅ 圖片已產生 output.png');
