const https = require('https');
const data = JSON.stringify({
  model: "flux",
  prompt: "A cute cat",
  n: 1,
  size: "1024x1024"
});
const pollinationsApiKey = process.env.POLLINATIONS_API_KEY;
if (!pollinationsApiKey) {
  throw new Error('Missing POLLINATIONS_API_KEY environment variable');
}
const options = {
  hostname: 'gen.pollinations.ai',
  port: 443,
  path: '/v1/images/generations',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${pollinationsApiKey}`,
    'Content-Length': data.length
  }
};
const req = https.request(options, res => {
  let d = '';
  res.on('data', chunk => d += chunk);
  res.on('end', () => console.log('STATUS:', res.statusCode, 'BODY:', d));
});
req.on('error', error => console.error(error));
req.write(data);
req.end();
