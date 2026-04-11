const TH={
  ALF:1.0, ALP:101.5,
  CRF:2.2, CRP:99.0,
  NOF:0.85, NOP:101.0,
  REC:101.5,
  AREQ:2, CREQ:2
};

const S={N:0,A:1,F:2,E:3};
let estado=S.N, cntA=0, cntC=0;
let flujo=0, pres=101.5, sOK=true, riesgo=0;
let tsEnvReal=0, tsEnvSim=0, lec=0, tsTickSim=0;
let t0=Date.now(), alertDis=false, modoVivo=false;
let blk=false;
let wifiOK=false, ipESP32='', flujoDetectado=false;
let uptimeSegReal=0, uptimeSyncAt=Date.now();

setInterval(()=>{blk=!blk;applyLEDs()},300);

function toBool(v){
  return v===true || v==='true' || v===1 || v==='1';
}

function toNum(v,fallback=0){
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}

function fmtMMSS(totalSeg){
  const seg=Math.max(0,Math.floor(totalSeg));
  return String(Math.floor(seg/60)).padStart(2,'0')+':'+String(seg%60).padStart(2,'0');
}

function thingSpeakEnviosActual(){
  return modoVivo?tsEnvReal:tsEnvSim;
}

function uptimeActualSeg(){
  if(!modoVivo)return Math.floor((Date.now()-t0)/1000);
  return uptimeSegReal+Math.max(0,Math.floor((Date.now()-uptimeSyncAt)/1000));
}

function renderConexion(){
  const badge=document.getElementById('conn-badge');
  const ip=document.getElementById('conn-ip');
  const wifi=document.getElementById('wifi-st');

  if(modoVivo){
    badge.className='conn-badge live';
    badge.innerHTML=`<span class="blink"></span>&nbsp;${wifiOK?'CONECTADO':'ESP32 ONLINE'}`;
    ip.textContent=wifiOK?(ipESP32||'IP disponible'):'ESP32 activo, sin IP WiFi';
    wifi.textContent=wifiOK?`${ipESP32||'WiFi OK'} ✓`:'Sin WiFi ✗';
    wifi.style.color=wifiOK?'var(--ok)':'var(--warn)';
    return;
  }

  badge.className='conn-badge sim';
  badge.innerHTML='<span class="blink"></span>&nbsp;SIMULACIÓN';
  ip.textContent='Sin enlace a /datos';
  wifi.textContent='Modo simulación';
  wifi.style.color='var(--warn)';
}

let sTick=0;
function simular(){
  sTick++;
  let fase = sTick<8?0 : sTick<13?1 : sTick<18?2 : sTick<22?3 : (sTick=0,0);
  let tf,tp;
  switch(fase){
    case 0: tf=0.2+Math.random()*.35; tp=102.2+Math.random()*.8; break;
    case 1: tf=1.1+Math.random()*.5;  tp=101.0+Math.random()*.4; break;
    case 2: tf=2.4+Math.random()*.7;  tp=97.8+Math.random()*1.0; break;
    default:tf=0.1+Math.random()*.15; tp=102.8+Math.random()*.5; break;
  }
  flujo = Math.max(0,Math.min(5,  flujo*0.40 + tf*0.60));
  pres  = Math.max(0,Math.min(115,pres *0.40 + tp*0.60));
  sOK   = true;
  evalEstado();
}

function calcRiesgo(){
  if(!sOK)return 5;
  const sf=Math.max(0,Math.min(1,(flujo-0.6)/(2.8-0.6)));
  const sp=Math.max(0,Math.min(1,(104-pres)/(104-95)));
  return Math.round(Math.max(0,Math.min(100,(sf*.55+sp*.45)*100)));
}

function evalEstado(){
  riesgo=calcRiesgo();
  if(!sOK){estado=S.E;cntA=0;cntC=0;return;}
  if(pres>=TH.REC){cntA=0;cntC=0;estado=S.N;riesgo=Math.min(riesgo,20);return;}
  const crit=(flujo>=TH.CRF&&pres<=TH.CRP);
  const alert=(flujo>=TH.ALF&&pres<=TH.ALP)||riesgo>=45;
  const norm=(flujo<=TH.NOF&&pres>=TH.NOP&&riesgo<35);
  if(crit){
    cntC=Math.min(cntC+1,10);cntA=Math.min(cntA+1,10);
    estado=cntC>=TH.CREQ?S.F:S.A;
  }else if(alert){
    cntA=Math.min(cntA+1,10);cntC=Math.max(cntC-1,0);
    estado=cntA>=TH.AREQ?S.A:S.N;
  }else if(norm){
    cntA=0;cntC=0;estado=S.N;riesgo=Math.min(riesgo,20);
  }else{
    cntA=Math.max(cntA-1,0);cntC=Math.max(cntC-1,0);
    if(cntC>=TH.CREQ)estado=S.F;
    else if(cntA>=1)estado=S.A;
    else estado=S.N;
  }
}

const MAX=40, lbs=[], dF=[], dP=[];
let cF,cP;
function mkChart(id,col,yMin,yMax,unit){
  const bg=col.replace('rgb(','rgba(').replace(')',',0.07)');
  return new Chart(document.getElementById(id).getContext('2d'),{
    type:'line',
    data:{labels:lbs,datasets:[{data:id==='chartFlujo'?dF:dP,
      borderColor:col,backgroundColor:bg,borderWidth:2,
      pointRadius:2.5,pointBackgroundColor:col,tension:0.4,fill:true}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:350},
      plugins:{legend:{display:false},
        tooltip:{callbacks:{label:c=>c.parsed.y.toFixed(2)+' '+unit}}},
      scales:{
        x:{grid:{color:'rgba(255,255,255,0.04)'},
           ticks:{color:'#445566',font:{size:9,family:'JetBrains Mono'},maxTicksLimit:7}},
        y:{min:yMin,max:yMax,grid:{color:'rgba(255,255,255,0.04)'},
           ticks:{color:'#445566',font:{size:9,family:'JetBrains Mono'},
                  callback:v=>v.toFixed(1)+' '+unit}}}}
  });
}

function pushChart(){
  const t=new Date().toLocaleTimeString('es-CO',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
  lbs.push(t);dF.push(+flujo.toFixed(2));dP.push(+pres.toFixed(2));
  if(lbs.length>MAX){lbs.shift();dF.shift();dP.shift();}
  cF.update('none');cP.update('none');
}

const SM={
  [S.N]:{txt:'NORMAL', cls:'ok',    sub:'Sin anomalías detectadas',      acc:'--ok',     bit:20},
  [S.A]:{txt:'ALERTA', cls:'warn',  sub:'Caudal o presión anómalos',     acc:'--warn',   bit:60},
  [S.F]:{txt:'FUGA',   cls:'danger',sub:'FUGA CONFIRMADA — actuar ahora',acc:'--danger', bit:100},
  [S.E]:{txt:'ERROR',  cls:'neutral',sub:'Fallo en sensor BMP180',       acc:'--gray',   bit:5}
};

let prevE=-1;

function updateUI(){
  const sm=SM[estado];
  const tsEnv=thingSpeakEnviosActual();
  document.getElementById('k-flow').textContent=flujo.toFixed(2);
  document.getElementById('k-pres').textContent=pres.toFixed(2);
  document.getElementById('k-risk').textContent=riesgo;
  document.getElementById('risk-acc').style.background=
    riesgo<35?'var(--ok)':riesgo<65?'var(--warn)':'var(--danger)';
  renderConexion();

  const sp=document.getElementById('k-state');
  sp.className='state-pill '+sm.cls;
  sp.style.borderColor=sm.cls==='ok'?'rgba(34,197,94,.3)':
    sm.cls==='warn'?'rgba(245,158,11,.3)':
    sm.cls==='danger'?'rgba(239,68,68,.3)':'rgba(100,116,139,.3)';
  sp.innerHTML=`<span>●</span>&nbsp;${sm.txt}`;
  document.getElementById('k-state-sub').textContent=sm.sub;
  document.getElementById('state-acc').style.background=`var(${sm.acc})`;

  document.getElementById('k-sensor').textContent=sOK?'OK ✓':'ERROR ✗';
  document.getElementById('k-sensor').style.color=sOK?'var(--ok)':'var(--danger)';
  document.getElementById('sensor-acc').style.background=sOK?'var(--ok)':'var(--danger)';
  document.getElementById('bmp-st').textContent=sOK?'BMP180 ✓':'BMP180 ✗';
  document.getElementById('bmp-st').style.color=sOK?'var(--ok)':'var(--danger)';

  const tp=document.getElementById('state-pill');
  tp.className='pill '+sm.cls;
  tp.innerHTML=`<span class="blink"></span>&nbsp;${sm.txt}`;

  document.getElementById('cnt-a').textContent=cntA;
  document.getElementById('cnt-c').textContent=cntC;
  document.getElementById('bar-a').style.width=(cntA/10*100)+'%';
  document.getElementById('bar-c').style.width=(cntC/10*100)+'%';

  if(estado===S.F&&!alertDis){
    document.getElementById('a-title').textContent='FUGA CONFIRMADA — intervención requerida';
    document.getElementById('a-desc').textContent=
      `Flujo: ${flujo.toFixed(2)} L/min | Presión: ${pres.toFixed(2)} kPa | Riesgo: ${riesgo}%`;
    document.getElementById('alert-banner').classList.add('show');
  }else if(estado!==S.F){
    document.getElementById('alert-banner').classList.remove('show');
    alertDis=false;
  }

  document.getElementById('sb-st').textContent='Estado: '+sm.txt;
  document.getElementById('sb-lec').textContent='Lecturas: '+lec;
  document.getElementById('sb-ts').textContent='ThingSpeak: '+tsEnv+' envíos';
  document.getElementById('ts-cnt').textContent=tsEnv;

  if(estado!==prevE){
    logIt(`Estado → ${sm.txt} | Q:${flujo.toFixed(2)} L/min P:${pres.toFixed(2)} kPa R:${riesgo}%`,
      estado===S.N?'var(--ok)':estado===S.A?'var(--warn)':estado===S.F?'var(--danger)':'var(--gray)');
    prevE=estado;
  }
}

function applyLEDs(){
  const lv=document.getElementById('led-v');
  const ln=document.getElementById('led-n');
  const lr=document.getElementById('led-r');
  const bz=document.getElementById('buzzer');
  lv.className=ln.className=lr.className='led-dot off';
  switch(estado){
    case S.N:
      lv.className='led-dot v';
      bz.classList.remove('on');
      document.getElementById('buz-icon').textContent='🔇';
      document.getElementById('buz-txt').textContent='Buzzer apagado';
      break;
    case S.A:
      if(blk)ln.className='led-dot n';
      bz.classList.remove('on');
      document.getElementById('buz-icon').textContent='🔇';
      document.getElementById('buz-txt').textContent='Buzzer apagado';
      break;
    case S.F:
      lr.className='led-dot r';
      bz.classList.add('on');
      document.getElementById('buz-icon').textContent='🔊';
      document.getElementById('buz-txt').textContent='Buzzer ACTIVO — 1500 Hz continuo (Pin 16)';
      break;
    case S.E:
      if(blk)lr.className='led-dot r';
      bz.classList.remove('on');
      document.getElementById('buz-icon').textContent='🔇';
      document.getElementById('buz-txt').textContent='Buzzer apagado';
      break;
  }
}

function logIt(msg,color){
  const box=document.getElementById('log-box');
  const t=new Date().toLocaleTimeString('es-CO',{hour12:false});
  const d=document.createElement('div');
  d.className='log-entry';
  d.innerHTML=`<div class="log-dot" style="background:${color}"></div>
    <div class="log-time">${t}</div><div class="log-msg">${msg}</div>`;
  box.prepend(d);
  if(box.children.length>10)box.removeChild(box.lastChild);
}

function dismissAlert(){alertDis=true;document.getElementById('alert-banner').classList.remove('show');logIt('Alerta confirmada por operador.','var(--ok)');}

function tick_time(){
  document.getElementById('clock').textContent=new Date().toLocaleTimeString('es-CO');
  document.getElementById('k-uptime').textContent=fmtMMSS(uptimeActualSeg());
}

async function fetchESP32(){
  try{
    const r=await fetch('/datos',{signal:AbortSignal.timeout(2500)});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const d=await r.json();
    flujo=toNum(d.flujo,flujo);
    pres=toNum(d.presion,pres);
    riesgo=toNum(d.riesgo,riesgo);
    sOK=toBool(d.sensorOK);
    cntA=toNum(d.contadorAlerta,cntA);
    cntC=toNum(d.contadorCritico,cntC);
    wifiOK=toBool(d.wifiOK);
    ipESP32=typeof d.ip==='string'?d.ip:'';
    tsEnvReal=toNum(d.thingSpeakEnvios,tsEnvReal);
    uptimeSegReal=toNum(d.uptimeSeg,uptimeSegReal);
    uptimeSyncAt=Date.now();
    flujoDetectado=toBool(d.flujoRealDetectado);
    estado=d.estadoClase==='fuga'?S.F:d.estadoClase==='alerta'?S.A:d.estadoClase==='error'?S.E:S.N;
    if(!modoVivo){
      modoVivo=true;
      tsTickSim=0;
      logIt('Conexión establecida con ESP32 → '+(ipESP32||'sin IP WiFi'),'var(--ok)');
    }
    return true;
  }catch{
    if(modoVivo){
      modoVivo=false;
      logIt('ESP32 desconectado — modo simulación','var(--warn)');
    }
    wifiOK=false;
    ipESP32='';
    flujoDetectado=false;
    uptimeSyncAt=Date.now();
    return false;
  }
}

async function tick(){
  lec++;
  const vivo=await fetchESP32();
  if(!vivo){
    simular();
    tsTickSim++;
    if(tsTickSim>=8){
      tsEnvSim++;
      tsTickSim=0;
    }
  }
  pushChart();updateUI();applyLEDs();
}

window.onload=()=>{
  cF=mkChart('chartFlujo','rgb(0,194,168)',0,5,'L/min');
  cP=mkChart('chartPresion','rgb(59,130,246)',95,110,'kPa');
  logIt('Sistema iniciado. Buscando ESP32 en /datos...','var(--muted)');
  setInterval(tick_time,1000);tick_time();
  tick();setInterval(tick,2000);
};
