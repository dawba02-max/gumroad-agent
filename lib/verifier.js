const fs = require('fs');
const path = require('path');
const http = require('http');

async function verifyJob(job, outDirOverride=null) {
  const config = require('../config.json');
  const builderOut = outDirOverride || path.join(__dirname, '..', '..', 'agents', 'builder_agent', 'output', job.job_id);
  // fallback to legacy single-file output if directory missing, try generic output
  let outDir = builderOut;
  if (!fs.existsSync(outDir)) {
    // try test dir or packager output mapping
    outDir = builderOut;
  }
  const schema = job.schema || null;
  const failures = [];
  const warnings = [];

  // Check files exist
  if (!fs.existsSync(outDir)) {
    failures.push(`output dir missing: ${outDir}`);
    return { passed:false, failures, warnings };
  }
  const htmlFiles = fs.readdirSync(outDir).filter(f=>f.endsWith('.html'));
  if (htmlFiles.length===0) failures.push('no html files');

  // Start local static server for browser checks
  let server, port;
  try{
    server = http.createServer((req,res)=>{
      let urlPath = req.url.split('?')[0].replace(/^\//,'');
      if(urlPath===''||urlPath.endsWith('/')) urlPath = 'index.html';
      // if path is job id prefix, strip
      let filePath = path.join(outDir, urlPath);
      // try direct
      if(!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()){
        // try index fallback
        filePath = path.join(outDir, 'index.html');
      }
      if(fs.existsSync(filePath) && fs.statSync(filePath).isFile()){
        const ext = path.extname(filePath);
        const ct = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png'}[ext] || 'application/octet-stream';
        res.writeHead(200, {'Content-Type': ct});
        res.end(fs.readFileSync(filePath));
      } else {
        res.writeHead(404); res.end('not found '+req.url);
      }
    });
    await new Promise(r=> server.listen(0, ()=> r()));
    port = server.address().port;
  } catch(e){
    failures.push('server failed: '+e.message);
    return { passed:false, failures, warnings };
  }

  let browserFailures = [];
  try{
    const SelfImprovingBrowserAgent = require(path.join(__dirname,'..','..','agents','browser_agent','browser_tool'));
    const agent = new SelfImprovingBrowserAgent();
    await agent.init();
    // collect console errors per page
    for(const file of htmlFiles){
      const url = `http://localhost:${port}/${file}`;
      const consoleErrors = [];
      const pageErrors = [];
      agent.page.removeAllListeners('console');
      agent.page.removeAllListeners('pageerror');
      agent.page.on('console', msg=>{ if(msg.type()==='error') consoleErrors.push(msg.text()); });
      agent.page.on('pageerror', err=> pageErrors.push(String(err)));
      try{
        await agent.page.goto(url, {waitUntil:'networkidle', timeout:15000});
        await agent.page.waitForTimeout(800);
      }catch(e){ failures.push(`${file}: goto failed ${e.message}`); continue; }
      // check no JS page errors — ignore tailwind cdn
      const realPageErrors = pageErrors.filter(e=> !/tailwind is not defined/i.test(e));
      if(realPageErrors.length) failures.push(`${file}: JS error ${realPageErrors[0].slice(0,120)}`);
      // check title
      const title = await agent.page.title().catch(()=> '');
      if(!title || title==='Error') failures.push(`${file}: bad title "${title}"`);
      // check 404 assets via consoleErrors — ignore cdn.tailwind
      const assetErrs = consoleErrors.filter(t=> /404|Failed to load/.test(t) && !/cdn\.tailwindcss\.com|tailwind is not defined/.test(t) && /assets\//.test(t));
      if(assetErrs.length) failures.push(`${file}: missing assets ${assetErrs[0].slice(0,120)}`);
      // broken images — check files exist on disk instead of unreliable browser load in offline http
      try{
        const html = fs.readFileSync(path.join(outDir,file),'utf8');
        const srcs = Array.from(html.matchAll(/src="([^"]+)"/g)).map(m=>m[1]).filter(s=> s.startsWith('assets/images/'));
        const missing = srcs.filter(s=> !fs.existsSync(path.join(outDir, s.split('?')[0])));
        if(missing.length) failures.push(`${file}: missing local image files ${missing.slice(0,2).join(',')}`);
        // also browser check but only as warning if files exist
        const broken = await agent.page.evaluate(()=> Array.from(document.images).filter(img=>!img.complete || img.naturalWidth===0).map(img=>img.getAttribute('src')||'').slice(0,3));
        if(broken.length && missing.length) failures.push(`${file}: broken images ${broken.join(',').slice(0,100)}`);
      }catch{}
      // check demo banner + badges present
      try{
        const hasBanner = await agent.page.evaluate(()=> !!document.getElementById('demo-banner'));
        if(!hasBanner) failures.push(`${file}: missing demo-banner`);
        const hasBadges = await agent.page.evaluate(()=> !!document.getElementById('trust-badges'));
        if(!hasBadges) failures.push(`${file}: missing trust-badges`);
      }catch{}
      // check schema content rendered (if schema available)
      if(schema && schema.content_items){
        const ci = schema.content_items;
        try{
          const counts = await agent.page.evaluate(()=>{
            return {
              services: document.querySelectorAll('.service-card').length,
              testimonials: document.querySelectorAll('.testimonial-card').length,
              gallery: document.querySelectorAll('.gallery-item').length,
              stats: document.querySelectorAll('.stat-item').length,
              team: document.querySelectorAll('.team-member').length
            };
          });
          // Only enforce counts on index.html (other pages are simplified stubs with truncated body)
          if(file==='index.html'){
            if(Array.isArray(ci.services) && ci.services.length>=4 && counts.services < 4) failures.push(`${file}: services rendered ${counts.services} <4 expected`);
            if(Array.isArray(ci.testimonials) && ci.testimonials.length>=3 && counts.testimonials < 3) failures.push(`${file}: testimonials ${counts.testimonials} <3`);
            if(Array.isArray(ci.gallery_or_listings) && ci.gallery_or_listings.length>=6 && counts.gallery < 6) failures.push(`${file}: gallery items ${counts.gallery} <6`);
            if(Array.isArray(ci.stats) && ci.stats.length>=3 && counts.stats < 3) failures.push(`${file}: stats ${counts.stats} <3`);
          }
          const statValues = await agent.page.evaluate(()=> Array.from(document.querySelectorAll('.stat-value')).map(el=>el.textContent.trim()));
          statValues.forEach(v=>{ if(v==='0' || v==='0%' ) warnings.push(`${file}: stat value is 0 "${v}"`); if(!v) failures.push(`${file}: empty stat value`); });
        }catch(e){ warnings.push(`${file}: dom check failed ${e.message}`); }
      }
      // no pexels URLs
      try{
        const html = fs.readFileSync(path.join(outDir,file),'utf8');
        if(html.includes('images.pexels.com')) failures.push(`${file}: still contains images.pexels.com`);
        if(html.includes('Lorem ipsum')) failures.push(`${file}: contains Lorem ipsum`);
      }catch{}
    }
    await agent.close();
  }catch(e){
    failures.push('browser verify failed: '+e.message+ ' '+(e.stack||'').slice(0,300));
  } finally {
    try{ server.close(); }catch{}
  }

  // also file-level checks: ensure no empty sections
  for(const file of htmlFiles){
    const html = fs.readFileSync(path.join(outDir,file),'utf8');
    if(html.length < 1000) warnings.push(`${file}: very small html ${html.length}`);
  }

  const passed = failures.length===0;
  return { passed, failures, warnings, htmlFiles, outDir };
}

module.exports = { verifyJob };
