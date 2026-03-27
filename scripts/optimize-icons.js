/**
 * Optimize PWA Icons
 * Converts large images to proper icon sizes
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const sizes = [
  { size: 192, name: 'pwa-192x192.png' },
  { size: 512, name: 'pwa-512x512.png' },
  { size: 180, name: 'apple-touch-icon.png' }
];

async function optimizeIcons() {
  const publicDir = path.join(process.cwd(), 'public');
  
  // Check if source image exists (use the large one as source)
  const sourcePath = path.join(publicDir, 'pwa-512x512.png');
  
  if (!fs.existsSync(sourcePath)) {
    console.error('❌ Source image not found:', sourcePath);
    return;
  }

  console.log('🖼️ Optimizing PWA icons...');
  
  const sourceBuffer = fs.readFileSync(sourcePath);
  console.log(`📊 Original 512x512 size: ${(sourceBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  for (const { size, name } of sizes) {
    const outputPath = path.join(publicDir, name);
    
    try {
      await sharp(sourceBuffer)
        .resize(size, size, {
          fit: 'cover',
          position: 'center'
        })
        .png({
          compressionLevel: 9,
          palette: true,
          quality: 80
        })
        .toFile(outputPath);
      
      const stats = fs.statSync(outputPath);
      console.log(`✅ ${name}: ${(stats.size / 1024).toFixed(2)} KB`);
    } catch (error) {
      console.error(`❌ Failed to create ${name}:`, error.message);
    }
  }

  console.log('\n🎉 Icons optimized! Reload the page to see improvements.');
  console.log('Expected: ~10-20 KB per icon instead of 5 MB');
}

optimizeIcons();
