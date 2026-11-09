// قعدة 90 · إعداد م. إياد حلوبي
const express=require("express");const fs=require("fs");const path=require("path");
const app=express();const PORT=process.env.PORT||3000;
const STATS=path.join(__dirname,"stats.json");
let stats={visits:0,days:{}};try{stats=JSON.parse(fs.readFileSync(STATS,"utf8"))}catch(e){}
const saveStats=()=>fs.writeFile(STATS,JSON.stringify(stats),()=>{});
app.post("/api/hit",(req,res)=>{const d=new Date().toISOString().slice(0,10);stats.visits++;stats.days[d]=(stats.days[d]||0)+1;saveStats();res.json({ok:true})});
app.get("/stats",(req,res)=>{const rows=Object.entries(stats.days).sort().reverse().slice(0,30).map(([d,n])=>`<tr><td>${d}</td><td>${n}</td></tr>`).join("");
  res.send(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>إحصائيات قعدة 90</title>
  <body style="font-family:system-ui;background:#f4efe6;color:#1f1d1a;max-width:480px;margin:30px auto;padding:0 16px"><h2>إحصائيات قعدة 90</h2><p>عدد الزيارات الكلي: <b>${stats.visits}</b></p>
  <table style="width:100%;border-collapse:collapse" border="1" cellpadding="6"><tr><th>اليوم</th><th>زيارات</th></tr>${rows}</table></body></html>`)});
app.use(express.static(path.join(__dirname,"public"),{maxAge:"1h",setHeaders:(res,p)=>{if(p.endsWith("sw.js")||p.endsWith(".html"))res.setHeader("Cache-Control","no-cache")}}));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log("قعدة 90 شغّالة على "+PORT));
