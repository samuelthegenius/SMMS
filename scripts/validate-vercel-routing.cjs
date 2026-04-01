#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const vercelConfigPath = path.join(process.cwd(), 'vercel.json');

function fail(message) {
  console.error(`\n[vercel-routing-check] ERROR: ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`[vercel-routing-check] ${message}`);
}

if (!fs.existsSync(vercelConfigPath)) {
  fail('vercel.json was not found in project root.');
}

let config;
try {
  config = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
} catch (error) {
  fail(`Unable to parse vercel.json: ${error.message}`);
}

if (!Array.isArray(config.rewrites)) {
  fail('vercel.json must contain a rewrites array for SPA routing.');
}

const catchAll = config.rewrites.find((rule) => rule && rule.source === '/(.*)');
if (!catchAll) {
  fail('Missing catch-all rewrite: { "source": "/(.*)", "destination": "/" }.');
}

if (catchAll.destination !== '/') {
  fail(`Catch-all rewrite destination must be "/". Found: "${catchAll.destination}".`);
}

const cleanUrlsEnabled = config.cleanUrls === true;
if (cleanUrlsEnabled) {
  fail('cleanUrls=true is blocked for this SPA because it can break deep-link fallback behavior.');
}

const apiRewrite = config.rewrites.find((rule) => rule && rule.source === '/api/(.*)');
if (!apiRewrite || apiRewrite.destination !== '/api/$1') {
  fail('API rewrite must preserve serverless routes: { "source": "/api/(.*)", "destination": "/api/$1" }.');
}

ok('vercel.json SPA routing checks passed.');
