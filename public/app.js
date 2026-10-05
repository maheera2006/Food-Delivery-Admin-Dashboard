const $=s=>document.querySelector(s);
let token=sessionStorage.getItem('t')||'',D=null,tab='dash',filter='All',timer,seq=0,busy=false;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ST=['New','Preparing','Out for delivery','Delivered'],cls=s=>s==='Out for delivery'?'Out':s;
const titles={dash:'Dashboard',orders:'Orders',menu:'Menu'},PRICE_MSG='Price must be between 0.01 and 100000.';
const validPrice=v=>{const n=Number(v);return String(v).trim()!==''&&isFinite(n)&&n>0&&n<=100000;};
function toast(m,bad){const t=$('#toast');t.textContent=m;t.className=bad?'bad show':'show';clearTimeout(toast.h);toast.h=setTimeout(()=>t.className='',4000);}
function showLogin(msg){clearInterval(timer);token='';sessionStorage.removeItem('t');D=null;
  $('#app').hidden=true;$('#login').hidden=false;$('#err').textContent=msg||'';$('#pw').value='';$('#pw').focus();}
async function api(url,method='GET',body){
  let r;
  try{r=await fetch('/api'+url,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body===undefined?undefined:JSON.stringify(body)});}
  catch{throw new Error('Cannot reach the server. Check that it is running.');}
  let j={};try{j=await r.json();}catch{}
  if(r.status===401&&url!=='/login'){showLogin('Session expired. Sign in again.');throw new Error('Session expired');}
  if(!r.ok)throw new Error(j.error||'Request failed ('+r.status+')');
  return j;}
async function login(){
  const p=$('#pw').value;if(!p){$('#err').textContent='Enter the password.';return;}
  $('#go').disabled=true;$('#err').textContent='';
  try{token=(await api('/login','POST',{password:p})).token;sessionStorage.setItem('t',token);await openApp();}
  catch(e){if(!token)$('#err').textContent=e.message;}finally{$('#go').disabled=false;}}
async function openApp(){await refresh();$('#login').hidden=true;$('#app').hidden=false;clearInterval(timer);timer=setInterval(auto,10000);}
async function refresh(){const n=++seq,d=await api('/data');if(n!==seq)return;D=d;$('#shop').textContent=D.config.name;draw();}
function auto(){
  if(document.hidden||tab==='menu')return;
  const a=document.activeElement;if(a&&a.closest('#view')&&/INPUT|SELECT/.test(a.tagName))return;
  refresh().catch(e=>{if(e.message!=='Session expired')toast(e.message,true);});}
async function run(fn){
  if(busy)return;busy=true;
  try{await fn();}catch(e){if(e.message!=='Session expired')toast(e.message,true);}finally{busy=false;}
  try{await refresh();}catch{}}
const money=n=>D.config.currency+Number(n).toLocaleString('en-IN',{maximumFractionDigits:2});
function draw(){
  $('#title').textContent=titles[tab];$('#demo').hidden=!D.demo;
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.t===tab));
  $('#view').innerHTML=tab==='dash'?dash():tab==='orders'?orders():menu();}
const IC={all:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>',live:'<path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>',done:'<path d="M5 12l5 5 9-10"/>',cash:'<path d="M4 7h16v10H4zM12 10v4M8 12h.01M16 12h.01"/>'};
const svg=k=>`<svg viewBox="0 0 24 24" class="ic">${IC[k]}</svg>`;
const COL={New:'var(--c-New)',Preparing:'var(--c-Preparing)','Out for delivery':'var(--c-Out)',Delivered:'var(--c-Delivered)'};
function dash(){
  const o=D.orders,live=o.filter(x=>ST.slice(0,3).includes(x.status)),done=o.filter(x=>x.status==='Delivered'),cnt=s=>o.filter(x=>x.status===s).length;
  $('#sub').textContent=new Date().toLocaleDateString([],{weekday:'long',day:'numeric',month:'long'})+' · '+live.length+' order'+(live.length===1?'':'s')+' in progress';
  const stat=(c,k,v,l)=>`<div class="stat"><i style="background:${c}">${svg(k)}</i><div><b>${v}</b><span>${l}</span></div></div>`;
  return `<div class="stats">${stat('var(--blue)','all',o.length,'Total orders')}${stat('var(--accent)','live',live.length,'In progress')}${stat('var(--green)','done',done.length,'Delivered')}${stat('var(--violet)','cash',money(done.reduce((s,x)=>s+x.total,0)),'Revenue (delivered)')}</div>
  <div class="panel"><h3>Order pipeline</h3><div class="pipe">${ST.map(s=>`<div class="step"><b style="background:${COL[s]}">${cnt(s)}</b><span>${s}</span></div>`).join('')}</div></div>
  <div class="panel"><h3>Latest orders</h3>${o.length?`<div class="rows">${o.slice(0,6).map(x=>`<div><span class="no">#${x.id}</span><span>${esc(x.customer)}</span><b>${money(x.total)}</b><span class="tag ${cls(x.status)}">${x.status}</span></div>`).join('')}</div>`:'<div class="empty"><b>No orders yet</b>New orders will appear here as they come in.</div>'}</div>`;}
function orders(){
  $('#sub').textContent=D.orders.length+' order'+(D.orders.length===1?'':'s')+' in total';
  const all=['All',...ST,'Cancelled'],n=s=>s==='All'?D.orders.length:D.orders.filter(x=>x.status===s).length;
  const chips=`<div class="chips">${all.map(s=>`<button class="chip ${s===filter?'on':''}" data-act="filter" data-v="${s}">${s}<small>${n(s)}</small></button>`).join('')}</div>`;
  const list=D.orders.filter(x=>filter==='All'||x.status===filter);
  if(!list.length)return chips+`<div class="empty"><b>${filter==='All'?'No orders yet':'No '+esc(filter.toLowerCase())+' orders'}</b>${filter==='All'?'Use “Add demo order” to try the flow.':'Pick another filter to see more.'}</div>`;
  return chips+`<div class="tickets">${list.map(x=>{const next=ST[ST.indexOf(x.status)+1],closed=x.status==='Delivered'||x.status==='Cancelled';
  return `<article class="ticket t-${cls(x.status)}"><div class="th"><span class="no">#${x.id}</span><span class="tm">${new Date(x.time).toLocaleString([],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span><span class="tag ${cls(x.status)}">${x.status}</span></div>
  <div class="who"><b>${esc(x.customer)}</b><small>${esc(x.phone)}</small><small>${esc(x.address)}</small></div>
  <ul class="its">${x.items.map(i=>`<li><span>${i.qty}×</span><span>${esc(i.name)}</span><em>${money(i.qty*i.price)}</em></li>`).join('')}</ul>
  <div class="tot"><span>Total</span><b>${money(x.total)}</b></div>
  <div class="foot"><select ${closed?'disabled':''} data-chg="driver" data-id="${x.id}" aria-label="Driver for order ${x.id}"><option value="">Assign driver…</option>${D.drivers.map(d=>`<option ${d===x.driver?'selected':''}>${esc(d)}</option>`).join('')}</select>
  <div class="row">${next?`<button class="sm" data-act="status" data-id="${x.id}" data-to="${next}">Mark ${next.toLowerCase()}</button>`:''}${closed?'':`<button class="sm red" data-act="cancel" data-id="${x.id}">Cancel</button>`}</div></div></article>`}).join('')}</div>`;}
function menu(){
  $('#sub').textContent=D.menu.length+' item'+(D.menu.length===1?'':'s')+' · '+D.menu.filter(m=>!m.available).length+' sold out';
  return `<div class="panel" id="addform"><div class="add"><input id="n" maxlength="60" placeholder="Item name" aria-label="Item name"><input id="c" maxlength="30" placeholder="Category" aria-label="Category"><input id="p" type="number" min="0.01" step="0.01" placeholder="Price" aria-label="Price"><button data-act="add">Add item</button></div></div>
  <div class="panel">${D.menu.length?`<table><tr><th>Item</th><th>Category</th><th>Price</th><th>Availability</th><th></th></tr>
  ${D.menu.map(m=>`<tr><td><b>${esc(m.name)}</b></td><td><span class="cat">${esc(m.category)}</span></td>
  <td><input type="number" min="0.01" step="0.01" value="${m.price}" class="pr" data-chg="price" data-id="${m.id}" aria-label="Price of ${esc(m.name)}"></td>
  <td><button class="sm sw ${m.available?'':'off'}" data-act="toggle" data-id="${m.id}" data-to="${m.available?'0':'1'}">${m.available?'Available':'Sold out'}</button></td>
  <td><button class="sm red" data-act="del" data-id="${m.id}">Delete</button></td></tr>`).join('')}</table>`:'<div class="empty"><b>The menu is empty</b>Add your first item above.</div>'}</div>`;}
async function addItem(){
  if(busy)return;
  const name=$('#n').value.trim(),category=$('#c').value.trim(),p=$('#p').value;
  if(!name)return toast('Enter an item name.',true);
  if(!validPrice(p))return toast(PRICE_MSG,true);
  busy=true;
  try{await api('/menu','POST',{name,category,price:Number(p)});await refresh();toast('Item added.');$('#n').focus();}
  catch(e){if(e.message!=='Session expired')toast(e.message,true);}finally{busy=false;}}
const ACT={
  login,add:addItem,filter:d=>{filter=d.v;draw();},
  tab:d=>{tab=d.t;draw();refresh().catch(()=>{});},
  out:()=>{api('/logout','POST').catch(()=>{});showLogin('');},
  demo:()=>run(async()=>{await api('/orders/demo','POST');tab='orders';filter='All';}),
  status:d=>run(()=>api('/orders/'+d.id,'PATCH',{status:d.to})),
  cancel:d=>confirm('Cancel order #'+d.id+'? This cannot be undone.')&&run(()=>api('/orders/'+d.id,'PATCH',{status:'Cancelled'})),
  toggle:d=>run(()=>api('/menu/'+d.id,'PATCH',{available:d.to==='1'})),
  del:d=>confirm('Delete this item? Past orders keep their records.')&&run(()=>api('/menu/'+d.id,'DELETE'))};
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b&&!b.disabled)ACT[b.dataset.act](b.dataset);});
document.addEventListener('change',e=>{
  const t=e.target,k=t.dataset.chg;if(!k)return;
  if(k==='filter'){filter=t.value;draw();}
  else if(k==='driver')run(()=>api('/orders/'+t.dataset.id,'PATCH',{driver:t.value}));
  else if(k==='price'){if(!validPrice(t.value)){toast(PRICE_MSG,true);return refresh().catch(()=>{});}run(()=>api('/menu/'+t.dataset.id,'PATCH',{price:Number(t.value)}));}});
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter')return;
  if(e.target.id==='pw')login();else if(e.target.closest('#addform'))addItem();});
if(token)openApp().catch(e=>{if(e.message!=='Session expired')showLogin(e.message);});else $('#pw').focus();
