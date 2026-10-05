const express=require('express'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=+process.env.PORT||3000,PROD=process.env.NODE_ENV==='production';
const DB=process.env.DB_PATH||path.join(__dirname,'data','db.json');
const PASS=process.env.ADMIN_PASS||'admin123';
if(PROD&&PASS==='admin123'){console.error('Refusing to start: set ADMIN_PASS before running in production.');process.exit(1);}
const DEMO=!PROD||process.env.ALLOW_DEMO==='1';
const STATUS=['New','Preparing','Out for delivery','Delivered','Cancelled'];
const NEXT={New:['Preparing','Cancelled'],Preparing:['Out for delivery','Cancelled'],'Out for delivery':['Delivered','Cancelled'],Delivered:[],Cancelled:[]};
let db;
try{db=JSON.parse(fs.readFileSync(DB,'utf8'));}catch(e){console.error('Cannot read database '+DB+': '+e.message);process.exit(1);}
db.config=db.config||{name:'Restaurant',currency:'₹'};db.orders=db.orders||[];db.menu=db.menu||[];db.drivers=db.drivers||[];
function save(){const s=JSON.stringify(db,null,2),t=DB+'.tmp';fs.writeFileSync(t,s);try{fs.renameSync(t,DB);}catch{fs.writeFileSync(DB,s);}}
const bad=(r,c,m)=>r.status(c).json({error:m});
const clean=s=>typeof s==='string'?s.replace(/\s+/g,' ').trim():'';
const price=p=>{const n=typeof p==='number'||(typeof p==='string'&&p.trim()!=='')?Number(p):NaN;return isFinite(n)&&n>0&&n<=100000?Math.round(n*100)/100:null;};
const same=(a,b)=>{const h=x=>crypto.createHash('sha256').update(String(x)).digest();return crypto.timingSafeEqual(h(a),h(b));};
const sessions=new Map(),fails=new Map(),TTL=8*3600e3;
const app=express();app.disable('x-powered-by');
if(process.env.TRUST_PROXY)app.set('trust proxy',1);
app.use((q,r,n)=>{r.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',
 'Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'"});n();});
app.use(express.json({limit:'10kb'}));
app.use(express.static(path.join(__dirname,'public')));
app.use('/api',(q,r,n)=>{r.set('Cache-Control','no-store');n();});
app.post('/api/login',(q,r)=>{
  const ip=q.ip,f=fails.get(ip)||{n:0,t:Date.now()};
  if(Date.now()-f.t>9e5){f.n=0;f.t=Date.now();}
  if(f.n>=5)return bad(r,429,'Too many attempts. Try again in 15 minutes.');
  const p=q.body&&q.body.password;
  if(typeof p!=='string'||!same(p,PASS)){f.n++;fails.set(ip,f);return bad(r,401,'Wrong password');}
  fails.delete(ip);const token=crypto.randomBytes(32).toString('hex');sessions.set(token,Date.now()+TTL);r.json({token});
});
app.use('/api',(q,r,n)=>{
  if(q.path==='/login')return n();
  const t=(q.get('Authorization')||'').replace(/^Bearer /,''),exp=sessions.get(t);
  if(!exp||exp<Date.now()){sessions.delete(t);return bad(r,401,'Login required');}
  q.token=t;n();
});
app.post('/api/logout',(q,r)=>{sessions.delete(q.token);r.json({ok:true});});
app.get('/api/data',(q,r)=>r.json({config:db.config,drivers:db.drivers,menu:db.menu,orders:db.orders,demo:DEMO}));
app.post('/api/orders/demo',(q,r)=>{
  if(!DEMO)return bad(r,404,'Not found');
  const pool=db.menu.filter(m=>m.available);
  if(!pool.length)return bad(r,400,'No available menu items');
  const names=['Divya','Ravi','Priya','Imran','Lakshmi'],areas=['Anna Nagar','T Nagar','Adyar','Velachery'];
  const items=[...pool].sort(()=>Math.random()-.5).slice(0,1+Math.floor(Math.random()*3)).map(m=>({name:m.name,qty:1+Math.floor(Math.random()*2),price:m.price}));
  const o={id:db.orders.reduce((a,b)=>Math.max(a,b.id),1000)+1,customer:names[Math.floor(Math.random()*5)],
    phone:'9'+Math.floor(1e8+Math.random()*9e8),address:Math.floor(Math.random()*90+1)+', '+areas[Math.floor(Math.random()*4)]+', Chennai',
    items,total:Math.round(items.reduce((s,i)=>s+i.qty*i.price,0)*100)/100,status:'New',driver:'',time:new Date().toISOString()};
  db.orders.unshift(o);save();r.json(o);
});
app.patch('/api/orders/:id',(q,r)=>{
  const o=db.orders.find(x=>String(x.id)===q.params.id);
  if(!o)return bad(r,404,'Order not found');
  const{status,driver}=q.body||{};
  if(status===undefined&&driver===undefined)return bad(r,400,'Nothing to update');
  let nd=o.driver;
  if(driver!==undefined){
    if(typeof driver!=='string'||(driver&&!db.drivers.includes(driver)))return bad(r,400,'Unknown driver');
    if(!NEXT[o.status].length)return bad(r,409,'Order is '+o.status.toLowerCase()+' and can no longer be changed');
    nd=driver;
  }
  if(status!==undefined){
    if(!STATUS.includes(status))return bad(r,400,'Unknown status');
    if(!NEXT[o.status].includes(status))return bad(r,409,'Order is '+o.status+'; it cannot move to '+status);
    if(status==='Out for delivery'&&!nd)return bad(r,400,'Assign a driver first');
  }
  o.driver=nd;if(status)o.status=status;save();r.json(o);
});
app.post('/api/menu',(q,r)=>{
  const b=q.body||{},name=clean(b.name),p=price(b.price);
  if(b.category!==undefined&&typeof b.category!=='string')return bad(r,400,'Category must be text');
  const category=clean(b.category)||'Mains';
  if(!name)return bad(r,400,'Item name is required');
  if(name.length>60)return bad(r,400,'Name must be 60 characters or fewer');
  if(category.length>30)return bad(r,400,'Category must be 30 characters or fewer');
  if(p===null)return bad(r,400,'Price must be a number between 0.01 and 100000');
  if(db.menu.length>=200)return bad(r,400,'Menu is full (200 items)');
  if(db.menu.some(m=>m.name.toLowerCase()===name.toLowerCase()))return bad(r,409,'An item with this name already exists');
  const m={id:db.menu.reduce((a,b)=>Math.max(a,b.id),0)+1,name,category,price:p,available:true};
  db.menu.push(m);save();r.json(m);
});
app.patch('/api/menu/:id',(q,r)=>{
  const m=db.menu.find(x=>String(x.id)===q.params.id);
  if(!m)return bad(r,404,'Item not found');
  const b=q.body||{};
  if(b.price===undefined&&b.available===undefined)return bad(r,400,'Nothing to update');
  let p=m.price;
  if(b.price!==undefined){p=price(b.price);if(p===null)return bad(r,400,'Price must be a number between 0.01 and 100000');}
  if(b.available!==undefined&&typeof b.available!=='boolean')return bad(r,400,'Availability must be true or false');
  m.price=p;if(b.available!==undefined)m.available=b.available;save();r.json(m);
});
app.delete('/api/menu/:id',(q,r)=>{
  const i=db.menu.findIndex(x=>String(x.id)===q.params.id);
  if(i<0)return bad(r,404,'Item not found');
  db.menu.splice(i,1);save();r.json({ok:true});
});
app.use('/api',(q,r)=>bad(r,404,'Not found'));
app.use((e,q,r,n)=>{
  if(e.type==='entity.parse.failed')return bad(r,400,'Invalid JSON');
  if(e.type==='entity.too.large')return bad(r,413,'Request too large');
  console.error(e);bad(r,500,'Server error');
});
app.listen(PORT,()=>{console.log('Admin dashboard: http://localhost:'+PORT);
  if(PASS==='admin123')console.log('Warning: using the default password. Set ADMIN_PASS.');});
