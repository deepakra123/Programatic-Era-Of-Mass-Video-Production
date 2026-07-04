const https = require('https');
https.get('https://html.duckduckgo.com/html/?q=pollinations.ai+api+image+generation+example', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const matches = data.match(/<a class="result__snippet[^>]*>(.*?)<\/a>/g);
    if (matches) {
      matches.forEach(m => console.log(m.replace(/<[^>]+>/g, '')));
    }
  });
});

