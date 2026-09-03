// ── Reference data (mirrors server/data/enums.js for client-side display) ──
const VEH_MAP={
  'Private Car':              [{u:'Private Use',c:1},{u:'Business use',c:2},{u:'Fleet',c:3},{u:'Private Hire (Car Hire)',c:4},{u:'Driving School',c:5}],
  'Trailer':                  [{u:'Domestic Trailers',c:6},{u:'Caravans',c:7}],
  'Commercial Vehicle':       [{u:'Own use',c:8},{u:'Hire and Reward',c:9},{u:'Fleet — Own use',c:10},{u:'Fleet — Hire and Reward',c:11},{u:'Driving School',c:12}],
  'Taxis':                    [{u:'Public Hire',c:13}],
  'Commercial Trailers':      [{u:'Own use',c:14},{u:'Hire and Reward',c:15},{u:'Fleet — Own use',c:16},{u:'Fleet — Hire and Reward',c:17},{u:'Agriculture',c:18}],
  'Motor Cycles':             [{u:'SD&P use',c:19},{u:'Business use',c:20},{u:'Fleet',c:21}],
  'Omnibus and Commuters':    [{u:'Up to 30 seats',c:22},{u:'Between 31–60 seats',c:23},{u:'More than 60 seats',c:24}],
  'School Bus':               [{u:'Up to 30 seats',c:25},{u:'Between 31–60 seats',c:26},{u:'More than 60 seats',c:27}],
  'Staff Bus':                [{u:'Up to 30 seats',c:28},{u:'Between 31–60 seats',c:29},{u:'More than 60 seats',c:30}],
  'Tractors/Fork Lifts':      [{u:'Own use',c:31}],
  'Tractors':                 [{u:'Hire and Reward',c:32}],
  'Tractors/Combines':        [{u:'Agriculture — Own use',c:33},{u:'Agriculture — Hire & Reward',c:34}],
  'Ambulance, Fire Engine, Hearse':[{u:'Various',c:35}],
  'Agricultural Implements':  [{u:'Various',c:36}],
  'Special Types':            [{u:'Contractors Plant and Equipment',c:37}]
};
const PRIVATE_CODES=new Set([1,2,3,4,5,6,7,19,20,21]);
const INS={RTA:{code:1,label:'Road Traffic Act (RTA)'},FTP:{code:2,label:'Full Third Party'},COMP:{code:4,label:'Comprehensive Cover'}};
const LIC_FREQ={4:1,5:4,6:2,7:5,8:6,9:7,10:8,11:9,12:3};
const BUNDLE_LABELS={insurance:'Insurance only',licence:'Insurance + ZINARA Licence',radio:'Insurance + ZINARA + ZBC Radio'};
const ANNUAL={WINDSCREEN:35,ACCESSORIES:50,EXCESS_BUYDOWN:80,CAR_HIRE:120};
const INS_TYPE_LABELS={'1':'Road Traffic Act (RTA)','2':'Full Third Party','3':'Full Third Party, Fire & Theft','4':'Comprehensive Cover'};
const VEH_TYPE_LABELS={1:'Private Car — Private Use',2:'Private Car — Business use',3:'Private Car — Fleet',4:'Private Car — Private Hire',5:'Private Car — Driving School',6:'Trailer — Domestic',7:'Trailer — Caravan',8:'Commercial Vehicle — Own use',9:'Commercial Vehicle — Hire and Reward',10:'Commercial Vehicle — Fleet Own use',11:'Commercial Vehicle — Fleet Hire/Reward',12:'Commercial Vehicle — Driving School',13:'Taxis — Public Hire',14:'Commercial Trailers — Own use',15:'Commercial Trailers — Hire and Reward',19:'Motor Cycle — SD&P use',20:'Motor Cycle — Business use',21:'Motor Cycle — Fleet'};

const POLICY_HOLDER_BASE = {
  idNumber: '63-184337B05', idType: '1',
  firstName: 'Ropa', lastName: 'Nyagwaya',
  address1: '14 Borrowdale Road', town: 'HARARE', suburbID: 28,
  entityType: 'Personal', companyName: '',
};
function currentPolicyHolder(){
  return { ...POLICY_HOLDER_BASE, email: S.email || 'rchirongoma@gmail.com', msisdn: S.mobile || '263775461117' };
}

// ── State ─────────────────────────────────────────────────────────────────
let S={vrn:'',type:'',use:'',vehCode:null,cover:null,value:null,bundle:null,hasTV:false,months:4,
       email:'rchirongoma@gmail.com',mobile:'263775461117',
       quoteId:null,quote:null,path:null,digitalPolicyNumber:null,policy:null};
let selectedProvider='ecocash',numberEntered=true,consentGiven=false;
let pollTimer=null,saveTimer=null,resumeToken=null,sheetExpanded=false;

// ── Step nav ──────────────────────────────────────────────────────────────
const STEPS=['vehicle','cover','extras','details','quote','payment','policy'];
function jumpTo(step){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('v-'+step).classList.add('active');
  updateProgress(step);
  S.currentStep = step;
  if(step==='cover') buildCoverSumm();
  if(step==='extras'){buildCoverSumm2();applyExtrasVis();}
  if(step==='details'){
    document.getElementById('det-mobile').textContent = S.mobile || '—';
    document.getElementById('det-email').textContent = S.email || '—';
  }
  if(step==='payment') syncPaymentScreen();
  if(step==='policy') loadPolicy();
  renderSummary();
  scheduleAutoSave();
  window.scrollTo({top:0,behavior:'smooth'});
}
function updateProgress(step){
  const idx=STEPS.indexOf(step);
  document.querySelectorAll('.progress-step').forEach((el,i)=>{
    el.classList.toggle('done', i<idx);
    el.classList.toggle('active', i===idx);
  });
  document.querySelectorAll('#progressLabels span').forEach((el,i)=>{
    el.classList.toggle('on', i<=idx);
  });
}

// ── Step 1: Vehicle ───────────────────────────────────────────────────────
function setFieldState(inputId, errId, state){
  // state: null=neutral, false=invalid, true=valid
  const input=document.getElementById(inputId), err=document.getElementById(errId);
  input.classList.remove('invalid','valid');
  err.classList.remove('show');
  if(state===false){ input.classList.add('invalid'); err.classList.add('show'); }
  else if(state===true){ input.classList.add('valid'); }
}
function isValidVRN(v){ return /^[A-Z0-9]{4,10}$/.test(v); }
function isValidEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isValidMobile(v){ return /^(263)?0?7[0-9]{8}$/.test(v.replace(/[\s-]/g,'')); }

function onVRNType(){
  const raw=document.getElementById('inpVRN').value.trim().toUpperCase();
  S.vrn=raw;
  if(raw.length===0){ setFieldState('inpVRN','err-vrn',null); }
  else { setFieldState('inpVRN','err-vrn', isValidVRN(raw)); }
  checkVehBtn();
}
function onContactType(){
  const email=document.getElementById('inpEmail').value.trim();
  const mobile=document.getElementById('inpMobile').value.trim();
  S.email=email; S.mobile=mobile;
  setFieldState('inpEmail','err-email', email.length===0?null:isValidEmail(email));
  setFieldState('inpMobile','err-mobile', mobile.length===0?null:isValidMobile(mobile));
  checkVehBtn();
  scheduleAutoSave();
}
function onTypeChange(){
  const t=document.getElementById('selType').value;S.type=t;S.use='';S.vehCode=null;
  const sel=document.getElementById('selUse');
  if(!t){sel.innerHTML='<option value="">Select type first…</option>';sel.disabled=true;checkVehBtn();return;}
  const uses=VEH_MAP[t]||[];
  sel.innerHTML='<option value="">Select use…</option>';
  uses.forEach(u=>{const o=document.createElement('option');o.value=u.c;o.textContent=u.u;o.dataset.use=u.u;sel.appendChild(o);});
  sel.disabled=false;
  if(uses.length===1){sel.value=uses[0].c;onUseChange();}
  checkVehBtn();
}
function onUseChange(){
  const sel=document.getElementById('selUse');
  const opt=sel.options[sel.selectedIndex];
  S.vehCode=sel.value?parseInt(sel.value):null;
  S.use=opt?opt.dataset.use||opt.textContent:'';
  checkVehBtn();
  renderSummary();
}
function checkVehBtn(){
  const vrnOk = isValidVRN(S.vrn);
  const emailOk = isValidEmail(S.email||'');
  const mobileOk = isValidMobile(S.mobile||'');
  document.getElementById('veh-btn').disabled=!(vrnOk&&S.type&&S.vehCode&&emailOk&&mobileOk);
  renderSummary();
}

// ── Step 2: Cover ─────────────────────────────────────────────────────────
function buildCoverSumm(){
  document.getElementById('veh-summ').innerHTML=
    `<div class="summ-chip"><span class="s-tick">✓</span>${S.vrn||'VRN'}</div>
     <div class="summ-chip"><span class="s-tick">✓</span>${S.type}</div>
     <div class="summ-chip"><span class="s-tick">✓</span>${S.use}</div>`;
  ['r-tv','r-cover','r-value','r-continue'].forEach(id=>document.getElementById(id)?.classList.remove('show'));
  ['seg-insurance','seg-licence','seg-radio'].forEach(id=>document.getElementById(id)?.classList.remove('active'));
  document.querySelectorAll('.cover-card').forEach(x=>x.classList.remove('active'));
  const sw=document.getElementById('tvSwitch');if(sw)sw.classList.remove('on');
  document.getElementById('tvRow')?.classList.remove('on');
  show('cover-back');
  S.cover=null;S.value=null;S.bundle=null;S.hasTV=false;
  renderSummary();
}
function selectBundle(b){
  S.bundle=b;S.cover=null;S.value=null;
  ['insurance','licence','radio'].forEach(k=>document.getElementById('seg-'+k)?.classList.toggle('active',k===b));
  if(b==='radio'){document.getElementById('r-tv').classList.add('show');}
  else{document.getElementById('r-tv').classList.remove('show');S.hasTV=false;document.getElementById('tvSwitch')?.classList.remove('on');document.getElementById('tvRow')?.classList.remove('on');}
  document.getElementById('r-cover').classList.add('show');
  document.querySelectorAll('.cover-card').forEach(x=>x.classList.remove('active'));
  selectCover('RTA', document.getElementById('cc-RTA')); // default cover type — user can still change it
  renderSummary();
  scheduleAutoSave();
}
function toggleTV(){
  S.hasTV=!S.hasTV;
  document.getElementById('tvSwitch').classList.toggle('on',S.hasTV);
  document.getElementById('tvRow').classList.toggle('on',S.hasTV);
  renderSummary();
}
function selectCover(c,el){
  S.cover=c;S.value=null;
  document.querySelectorAll('.cover-card').forEach(x=>x.classList.remove('active'));
  el.classList.add('active');
  if(c==='COMP'){document.getElementById('r-value').classList.add('show');document.getElementById('r-continue').classList.remove('show');show('cover-back');}
  else{document.getElementById('r-value').classList.remove('show');document.getElementById('r-continue').classList.add('show');hide('cover-back');}
  renderSummary();
  scheduleAutoSave();
}
function onValueInput(){
  S.value=parseFloat(document.getElementById('inpValue').value)||null;
  if(S.value>0){document.getElementById('r-continue').classList.add('show');hide('cover-back');}
  else{document.getElementById('r-continue').classList.remove('show');show('cover-back');}
  renderSummary();
}
function getRadioTVUsage(){if(S.hasTV)return 3;return PRIVATE_CODES.has(S.vehCode)?1:2;}

// ── Step 3: Extras ────────────────────────────────────────────────────────
function buildCoverSumm2(){
  document.getElementById('cover-summ').innerHTML=
    `<div class="summ-chip"><span class="s-tick">✓</span>${S.vrn}</div>
     <div class="summ-chip"><span class="s-tick">✓</span>${INS[S.cover]?INS[S.cover].label:S.cover}</div>
     <div class="summ-chip"><span class="s-tick">✓</span>${BUNDLE_LABELS[S.bundle]||''}</div>`;
}
function applyExtrasVis(){
  const c=S.cover==='COMP';
  document.getElementById('extrasSection').style.display=c?'block':'none';
  document.getElementById('noExtrasNote').style.display=c?'none':'block';
}
function selDur(el,m){
  document.querySelectorAll('.dur-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');S.months=m;
  Object.keys(ANNUAL).forEach(c=>{const p=(ANNUAL[c]*m/12).toFixed(2);const pe=document.getElementById('price-'+c);if(pe)pe.textContent='+$'+p;});
  updateExtrasTotal();
  renderSummary();
}
function toggleExtra(code){
  const row=document.getElementById('ex-'+code),chk=document.getElementById('chk-'+code);
  const on=row.classList.toggle('checked');
  if(chk){chk.classList.toggle('on',on);chk.textContent=on?'✓':'';}
  updateExtrasTotal();
  renderSummary();
}
function updateExtrasTotal(){
  let t=0;Object.keys(ANNUAL).forEach(c=>{if(document.getElementById('ex-'+c)?.classList.contains('checked'))t+=ANNUAL[c]*S.months/12;});
  const el=document.getElementById('extrasTotal');if(el)el.textContent='$'+t.toFixed(2);
}
function selectedExtras(){
  return S.cover==='COMP'?Object.keys(ANNUAL).filter(c=>document.getElementById('ex-'+c)?.classList.contains('checked')):[];
}

// ── Step 4/5: Real quote request ─────────────────────────────────────────
function buildVehiclePayload(){
  return {
    vrn: S.vrn,
    vehicleType: String(S.vehCode),
    insuranceType: String(INS[S.cover].code),
    vehicleValue: S.cover==='COMP' ? String(S.value||0) : '0',
    durationMonths: String(S.months),
    licFrequency: S.bundle!=='insurance' ? String(LIC_FREQ[S.months]||3) : undefined,
    radioTvUsage: S.bundle==='radio' ? String(getRadioTVUsage()) : undefined,
    radioTvFrequency: S.bundle==='radio' ? '1' : undefined,
    currency: 'USD',
    owner: currentPolicyHolder(),
    policyHolder: currentPolicyHolder(),
  };
}

async function submitQuote(){
  const btn=document.getElementById('genQuoteBtn');
  const errBox=document.getElementById('quoteError');
  errBox.style.display='none';
  btn.disabled=true; btn.textContent='Getting your quote…';

  const vehicle = buildVehiclePayload();
  const body = { customerReference: 'MASTER-'+Date.now(), vehicle, extras: selectedExtras() };

  let endpoint, path;
  if(S.cover==='COMP'){ endpoint='/api/v2/motor/comprehensive/quote'; path='comprehensive'; }
  else if(S.bundle==='insurance'){ endpoint='/api/v2/motor/quote/insurance'; path='insurance'; }
  else { endpoint='/api/v2/motor/quote/combined'; path='combined'; }

  try{
    const res = await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    const json = await res.json();
    if(!res.ok){ throw new Error(json.message || 'We could not generate a quote for this vehicle.'); }

    S.path = path;
    if(path==='comprehensive'){
      S.quoteId = json.data.quoteId;
      S.quote = json.data;
    } else {
      S.quoteId = json.data.quotes[0].quoteId;
      S.quote = json.data.quotes[0];
    }
    renderQuote();
    jumpTo('quote');
  }catch(err){
    errBox.textContent = err.message;
    errBox.style.display='flex';
  }finally{
    btn.disabled=false; btn.textContent='Get my quote';
  }
}

// ── Quote render (from real API response) ────────────────────────────────
function fmtDate(d){
  if(!d)return '—';
  if(typeof d==='string' && d.length>=8 && /^\d{8}$/.test(d)){
    const mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return parseInt(d.substring(6,8))+' '+mo[parseInt(d.substring(4,6))-1]+' '+d.substring(0,4);
  }
  const dt=new Date(d); if(isNaN(dt)) return d;
  return dt.toDateString();
}
function fmtAmt(v){const n=parseFloat(v);return isNaN(n)?'—':'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtTotal(v){const n=parseFloat(v);return isNaN(n)?'—':'USD '+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}

function grandTotalOf(){
  if(S.path==='comprehensive') return S.quote.totals.grandTotal;
  if(S.path==='combined') return S.quote.grandTotal;
  if(S.path==='insurance') return S.quote.insurancePremium;
  return S.quote.totalAmount;
}

function renderQuote(){
  const raw = S.quote.icecashRaw || {};
  const p = raw.Policy || {};
  const v = raw.Vehicle || {};
  const l = raw.Licence;
  const combined = S.path==='combined' || S.path==='comprehensive';
  const grand = grandTotalOf();

  document.getElementById('q-ref').textContent = S.quoteId;
  document.getElementById('q-quote-id').textContent = S.quoteId;
  document.getElementById('q-valid').textContent = 'Valid until ' + fmtDate(S.quote.expiresAt);
  document.getElementById('q-expires').textContent = 'Expires ' + fmtDate(S.quote.expiresAt);

  const year = p.YearManufacture && String(p.YearManufacture).trim() ? p.YearManufacture : 'Year not recorded';
  document.getElementById('q-vrn-make').textContent = S.vrn + (v.Make? ' · '+v.Make+' '+v.Model : '');
  document.getElementById('q-year').textContent = year;
  document.getElementById('q-veh-type').textContent = VEH_TYPE_LABELS[S.vehCode] || S.type;
  document.getElementById('q-ins-type').textContent = INS_TYPE_LABELS[String(p.InsuranceType)] || S.cover;
  document.getElementById('q-period').textContent = fmtDate(p.StartDate)+' → '+fmtDate(p.EndDate);
  document.getElementById('q-dur').textContent = (p.DurationMonths||S.months)+' months';
  document.getElementById('q-cover-amt').textContent = p.CoverAmount!=null ? 'USD '+parseFloat(p.CoverAmount).toLocaleString('en-US',{minimumFractionDigits:2}) : '—';

  document.getElementById('q-amt-lbl').textContent = combined ? 'Total due (ins + licence)' : 'Total due';
  document.getElementById('q-total-fig').textContent = parseFloat(grand).toLocaleString('en-US',{minimumFractionDigits:2});

  document.getElementById('q-ins-hdr').textContent = 'Motor Insurance · ' + S.vrn;
  document.getElementById('q-premium').textContent = fmtAmt(p.PremiumAmount);
  document.getElementById('q-stamp').textContent = fmtAmt(p.StampDuty);
  document.getElementById('q-levy').textContent = fmtAmt(p.GovernmentLevy);
  document.getElementById('q-ins-total').textContent = fmtAmt(p.Amount);

  document.getElementById('q-grand').textContent = fmtTotal(grand);

  const icecashIds = S.path==='comprehensive' ? S.quote.icecash : (S.quote.icecash || {});
  document.getElementById('q-combined-id-wrap').style.display = combined ? 'flex':'none';
  document.getElementById('q-combined-id').textContent = icecashIds.combinedId ?? '—';
  document.getElementById('q-lic-id-wrap').style.display = combined ? 'flex':'none';
  document.getElementById('q-lic-id').textContent = icecashIds.licenceId ?? '—';
  document.getElementById('q-ins-id-wrap').style.display = 'flex';
  document.getElementById('q-ins-id').textContent = icecashIds.insuranceId ?? (S.quote.referenceId ?? '—');

  document.getElementById('q-lic-section').style.display = (combined && l) ? 'block':'none';
  if(combined && l){
    const hasArrears = parseFloat(l.ArrearsAmt)>0 || parseFloat(l.PenaltiesAmt)>0;
    document.getElementById('q-arrears-notice').style.display = hasArrears ? 'flex':'none';
    document.getElementById('q-lic-expiry').textContent = 'Licence expiry: ' + fmtDate(l.LicExpiryDate);
    document.getElementById('q-lic-fee').textContent = fmtAmt(l.TransactionAmt);
    document.getElementById('q-arrears-row').style.display = parseFloat(l.ArrearsAmt)>0 ? 'flex':'none';
    document.getElementById('q-arrears').textContent = fmtAmt(l.ArrearsAmt);
    document.getElementById('q-penalties-row').style.display = parseFloat(l.PenaltiesAmt)>0 ? 'flex':'none';
    document.getElementById('q-penalties').textContent = fmtAmt(l.PenaltiesAmt);
    document.getElementById('q-admin').textContent = fmtAmt(l.AdministrationAmt);
    document.getElementById('q-lic-total').textContent = fmtAmt(l.TotalLicAmt);
    document.getElementById('q-radio').textContent = fmtAmt(l.TotalRadioTvAmt);
    document.getElementById('q-lic-radio-total').textContent = fmtAmt(l.TotalAmount);
  }

  // Quote-Level Rejection Masking — quote details still render in full (Presentation contract);
  // only the accept/pay path is blocked.
  const isBlocked = Boolean(S.quote.blocked);
  const notice = document.getElementById('q-blocked-notice');
  const acceptBtn = document.getElementById('q-accept-btn');
  notice.style.display = isBlocked ? 'flex' : 'none';
  if(isBlocked){
    document.getElementById('q-blocked-vrn').textContent = S.vrn || 'this vehicle';
    document.getElementById('q-blocked-message').textContent = S.quote.blockedMessage || 'No reason provided.';
    document.getElementById('q-blocked-at').textContent = 'Detected ' + new Date().toLocaleString();
  }
  acceptBtn.disabled = isBlocked;
  acceptBtn.title = isBlocked ? 'This quote was declined by IceCash — see the notice above.' : '';
  acceptBtn.style.opacity = isBlocked ? '.5' : '';
  acceptBtn.style.cursor = isBlocked ? 'not-allowed' : '';
}

function syncPaymentScreen(){
  const grand = grandTotalOf();
  const grandFmt = fmtTotal(grand);
  const raw = S.quote.icecashRaw || {};
  const p = raw.Policy || {};
  const l = raw.Licence;
  const combined = S.path==='combined' || S.path==='comprehensive';
  document.getElementById('pay-ref').textContent = S.quoteId;
  document.getElementById('pay-ins-amt').textContent = fmtAmt(p.Amount);
  document.getElementById('pay-lic-row').style.display = combined ? 'flex':'none';
  if(combined && l){document.getElementById('pay-lic-amt').textContent = fmtAmt(l.TotalAmount);}
  document.getElementById('pay-total').textContent = grandFmt;
  document.getElementById('consent-amt').textContent = grandFmt;
  document.getElementById('pay-btn-amt').textContent = grandFmt;
  resetPaymentCard();
}

// ── Payment — one unified method list: EcoCash / InnBucks / OneMoney / Cash / Card ──
var PROVIDERS={
  ecocash:{label:'EcoCash', kind:'wallet'},
  innbucks:{label:'InnBucks', kind:'wallet'},
  onemoney:{label:'OneMoney', kind:'wallet'},
  cash:{label:'Cash', kind:'cash'},
  card:{label:'Card', kind:'card'},
};
let cashReady=false, cardReady=false;

function resetPaymentCard(){
  selectedProvider='ecocash';numberEntered=true;consentGiven=false;cashReady=false;cardReady=false;
  document.getElementById('paymentCard').style.display='block';
  hide('cashierOrch'); hide('payWaiting'); hide('payFailed'); hide('payFinalising');
  Object.keys(PROVIDERS).forEach(k=>document.getElementById('badge-'+k)?.classList.remove('selected'));
  document.getElementById('badge-ecocash').classList.add('selected');
  document.getElementById('cash-amount').value='';
  document.getElementById('card-rrn').value='';
  document.getElementById('consent-cb').checked=false;
  selectProvider('ecocash');
}

function selectProvider(id){
  selectedProvider=id;
  Object.keys(PROVIDERS).forEach(k=>document.getElementById('badge-'+k)?.classList.remove('selected'));
  document.getElementById('badge-'+id).classList.add('selected');

  const kind = PROVIDERS[id].kind;
  document.getElementById('section-number').style.display = kind==='wallet' ? 'block':'none';
  document.getElementById('section-consent').style.display = kind==='wallet' ? 'block':'none';
  document.getElementById('section-cash').style.display = kind==='cash' ? 'block':'none';
  document.getElementById('section-card').style.display = kind==='card' ? 'block':'none';

  const label = document.getElementById('pay-btn-label');
  if(kind==='wallet'){ label.textContent='Pay'; document.getElementById('num-hint').textContent='A payment prompt will be sent via '+PROVIDERS[id].label+'.'; }
  else if(kind==='cash'){ label.textContent='Record cash payment'; }
  else { label.textContent='Record card payment'; }

  checkPayReady();
}
function checkNumber(){
  const val=document.getElementById('mob-num').value.trim();
  numberEntered=val.length>=9;
  const cs=document.getElementById('section-consent');
  if(numberEntered){cs.classList.remove('locked');}
  else{cs.classList.add('locked');document.getElementById('consent-cb').checked=false;consentGiven=false;}
  checkPayReady();
}
function checkConsent(){consentGiven=document.getElementById('consent-cb').checked;checkPayReady();}
function checkCashReady(){
  const v=parseFloat(document.getElementById('cash-amount').value);
  cashReady = v>0;
  checkPayReady();
}
function checkCardReady(){
  cardReady = document.getElementById('card-rrn').value.trim().length>=4;
  checkPayReady();
}
function checkPayReady(){
  const kind = PROVIDERS[selectedProvider]?.kind;
  let ready=false;
  if(kind==='wallet') ready = numberEntered && consentGiven;
  else if(kind==='cash') ready = cashReady;
  else if(kind==='card') ready = cardReady;
  document.getElementById('pay-btn').disabled = !ready;
}

function handlePayClick(){
  const kind = PROVIDERS[selectedProvider]?.kind;
  if(kind==='wallet') handlePay();
  else handleCounterPayment();
}

async function handlePay(){
  document.getElementById('paymentCard').style.display='none';
  show('payWaiting'); hide('payFailed'); hide('payFinalising');
  document.getElementById('pollList').innerHTML='';

  const msisdn = document.getElementById('mob-num').value.trim();
  const amount = grandTotalOf();

  const initBody = { quoteId: S.quoteId, customerMsisdn: msisdn, amount };
  await fetch('/api/v1/payments/ecocash/initiate', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(initBody)
  });

  let attempts=0;
  const maxAttempts=20;
  pollTimer = setInterval(async ()=>{
    attempts++;
    try{
      const res = await fetch(`/api/v1/payments/ecocash/status/quote/${S.quoteId}`);
      const json = await res.json();

      if(json.paymentStatus==='SUCCESS' && json.policyStatus==='PROCESSING'){
        hide('payWaiting'); show('payFinalising');
      }

      if(json.policyStatus==='ACTIVE'){
        clearInterval(pollTimer);
        S.digitalPolicyNumber = json.digitalPolicyNumber;
        hide('payFinalising');
        setTimeout(()=>jumpTo('policy'), 400);
        return;
      }
      if(attempts>=maxAttempts){
        clearInterval(pollTimer);
        hide('payWaiting'); hide('payFinalising'); show('payFailed');
      }
    }catch(err){
      clearInterval(pollTimer);
      hide('payWaiting'); show('payFailed');
    }
  }, 1500);
}
function retryPay(){
  hide('payFailed');hide('payWaiting');hide('payFinalising');
  document.getElementById('paymentCard').style.display='block';
}

// ── Cash / Card — branch-confirmed, 2-step orchestration (accept + poll) ──
function setOrchStep(step, state, detailText){
  // state: 'pending' | 'ok' | 'fail'
  const badge = document.getElementById('orch-step'+step+'-badge');
  const detail = document.getElementById('orch-step'+step+'-detail');
  badge.className = 'cbadge cbadge-'+state;
  badge.textContent = state==='ok' ? 'Approved' : state==='fail' ? 'Failed' : 'In progress';
  if(detailText) detail.textContent = detailText;
}

async function handleCounterPayment(){
  const kind = PROVIDERS[selectedProvider]?.kind; // 'cash' | 'card'
  document.getElementById('paymentCard').style.display='none';
  show('cashierOrch');
  hide('orchResultOk'); hide('orchResultFail'); hide('orchActions');
  document.getElementById('orchViewPolicyBtn').style.display='none';
  setOrchStep(1,'pending','Submitting acceptance to IceCash…');
  setOrchStep(2,'pending','Waiting on step 1…');

  const body = kind==='cash'
    ? { quoteId: S.quoteId, paymentSource: 'CASH', amountTendered: document.getElementById('cash-amount').value.trim() }
    : { quoteId: S.quoteId, paymentSource: 'CARD_SWIPE', cardReference: document.getElementById('card-rrn').value.trim() };

  // Cosmetic stage transition — the confirm endpoint performs both the accept
  // call and the poll loop server-side in one request; this just reflects
  // that two-step reality back to the cashier as it happens.
  const stage2Timer = setTimeout(()=>{
    setOrchStep(1,'ok','Accepted by IceCash.');
    setOrchStep(2,'pending','Polling IceCash for policy confirmation…');
  }, 900);

  try{
    const res = await fetch('/api/v1/motor/payments/confirm', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
    const json = await res.json();
    clearTimeout(stage2Timer);
    setOrchStep(1,'ok','Accepted by IceCash.');

    if(res.ok && json.success){
      setOrchStep(2,'ok','Policy confirmed.');
      S.digitalPolicyNumber = json.digitalPolicyNumber;
      document.getElementById('orchResultOkText').textContent =
        `Receipt ${json.paymentTransactionId} — digital policy ${json.digitalPolicyNumber}${json.licenceReceiptId ? ' · licence receipt '+json.licenceReceiptId : ''}.`;
      show('orchResultOk');
      document.getElementById('orchViewPolicyBtn').style.display='block';
      show('orchActions');
    } else {
      setOrchStep(2,'fail', json.opsAlert?.detail || json.message || 'No response from IceCash within the retry window.');
      document.getElementById('orchResultFailText').textContent =
        json.opsAlert ? `${json.opsAlert.reason}: ${json.opsAlert.detail}` : (json.message || 'Please retry — no charge has been reversed automatically.');
      show('orchResultFail');
      show('orchActions');
    }
  }catch(err){
    clearTimeout(stage2Timer);
    setOrchStep(1,'fail','Could not reach the gateway.');
    setOrchStep(2,'fail','Not attempted.');
    document.getElementById('orchResultFailText').textContent = err.message;
    show('orchResultFail');
    show('orchActions');
  }
}

function retryCashier(){
  hide('cashierOrch');
  resetPaymentCard();
  selectProvider(selectedProvider==='cash'||selectedProvider==='card' ? selectedProvider : 'cash');
}

// ── Policy step — fetched from the real gateway ──────────────────────────
async function loadPolicy(){
  if(!S.digitalPolicyNumber) return;
  const res = await fetch(`/api/v2/motor/comprehensive/policy/${S.digitalPolicyNumber}`);
  const json = await res.json();
  if(!res.ok) return;
  const policy = json.data;
  S.policy = policy;

  document.getElementById('pol-veh-name').textContent = policy.vehicle.vrn;
  document.getElementById('pol-veh-make').textContent = `${policy.vehicle.make} ${policy.vehicle.model}`;
  document.getElementById('pol-cover').textContent = policy.cover.insuranceType;
  document.getElementById('pol-period').textContent = fmtDate(policy.cover.startDate)+' → '+fmtDate(policy.cover.endDate);
  document.getElementById('pol-icecash-no').textContent = policy.icecash.policyNumber || '—';
  document.getElementById('pol-digital-no').textContent = policy.digitalPolicyNumber;

  const hasReceipt = Boolean(policy.icecash.licenceReceiptId);
  document.getElementById('pol-receipt').style.display = hasReceipt ? 'block':'none';
  if(hasReceipt) document.getElementById('pol-receipt-id').textContent = policy.icecash.licenceReceiptId;

  document.getElementById('pol-doc-name').textContent = 'Cover Note — ' + policy.vehicle.vrn;
  document.getElementById('pol-doc-cover').href = policy.documents.coverNote;
  document.getElementById('pol-doc-schedule').href = policy.documents.schedule;
  document.getElementById('pol-doc-receipt').href = policy.documents.receipt;
  document.getElementById('pol-doc-receipt-sub').textContent = `${policy.payment.paymentSource} · ${policy.payment.paymentTransactionId}`;
  document.getElementById('coverNoteFrame').src = policy.documents.coverNote;
}

function printCoverNote(){
  const frame = document.getElementById('coverNoteFrame');
  if(frame && frame.contentWindow) frame.contentWindow.print();
}

async function sendDocs(){
  if(!S.policy) return;
  await fetch('/api/v1/notify/send', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
    channel:'EMAIL', recipient: S.policy.policyHolder.email, templateCode:'MOTOR_POLICY_DOCUMENTS',
    referenceType:'POLICY', referenceNumber: S.policy.digitalPolicyNumber,
    payload:{ digitalPolicyNumber: S.policy.digitalPolicyNumber, coverNoteUrl: S.policy.documents.coverNote }
  })});
  const box=document.getElementById('docsSent');
  box.textContent = '✓ Resent to ' + S.policy.policyHolder.email;
  box.style.display='block';
}

// ── Live estimate + sticky summary panel ─────────────────────────────────
function renderSummary(){
  const linesEl = document.getElementById('summaryLines');
  const linesElMobile = document.getElementById('summaryLinesMobile');
  const totalBox = document.getElementById('summaryTotalBox');
  const totalFig = document.getElementById('summaryTotalFig');
  const totalLabel = document.getElementById('summaryTotalLabel');
  const totalNote = document.getElementById('summaryTotalNote');
  const sheetFig = document.getElementById('sheetFig');
  if(!linesEl) return;

  const lines = [];
  if(S.vrn) lines.push(['Vehicle', S.vrn]);
  if(S.type) lines.push(['Type', S.use ? `${S.type} — ${S.use}` : S.type]);
  if(S.bundle) lines.push(['Includes', BUNDLE_LABELS[S.bundle]]);
  if(S.cover) lines.push(['Cover', INS[S.cover]?INS[S.cover].label:S.cover]);
  if(S.vrn && S.months) lines.push(['Duration', S.months+' months']);
  if(S.quote){
    const p = (S.quote.icecashRaw||{}).Policy || {};
    if(p.StartDate && p.EndDate) lines.push(['Cover period', fmtDate(p.StartDate)+' → '+fmtDate(p.EndDate)]);
  }

  const html = lines.length
    ? lines.map(([l,v])=>`<div class="summary-line"><span class="sl-label">${l}</span><span class="sl-val">${v}</span></div>`).join('')
    : `<div class="summary-empty">Tell us about your vehicle to get started.</div>`;
  linesEl.innerHTML = html;
  if(linesElMobile) linesElMobile.innerHTML = html;

  // Only ever show a price once it's the real, confirmed quote total —
  // no client-side estimate, since it can't match IceCash's actual rating.
  if(S.quote){
    const figure = grandTotalOf();
    totalBox.style.display='block';
    totalLabel.textContent = (S.currentStep==='payment') ? 'Total due today' : 'Your quote total';
    totalFig.textContent = 'USD '+figure.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    totalNote.textContent = 'Confirmed price from your quote.';
    totalNote.style.color = 'var(--gm)';
    if(sheetFig){ sheetFig.textContent = 'USD '+figure.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); sheetFig.classList.remove('pending'); }
  } else {
    totalBox.style.display='none';
    if(sheetFig){ sheetFig.textContent = 'Get your quote to see pricing'; sheetFig.classList.add('pending'); }
  }

  // Hide the sticky panel once the policy is issued — its own summary takes over.
  const hideOnPolicy = S.currentStep==='policy';
  document.getElementById('summaryPanel').classList.toggle('force-hide', hideOnPolicy);
  document.getElementById('summarySheet').classList.toggle('force-hide', hideOnPolicy);
}

function toggleSheet(){
  sheetExpanded=!sheetExpanded;
  document.getElementById('summarySheet').classList.toggle('collapsed', !sheetExpanded);
}

// ── Auto-save & resume ───────────────────────────────────────────────────
function scheduleAutoSave(){
  if(!isValidEmail(S.email||'') && !isValidMobile(S.mobile||'')) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSession, 800);
}
async function saveSession(){
  const noteEl = document.getElementById('saveNote');
  const noteText = document.getElementById('saveNoteText');
  try{
    const body = {
      token: resumeToken,
      email: isValidEmail(S.email||'') ? S.email : undefined,
      mobile: isValidMobile(S.mobile||'') ? S.mobile : undefined,
      state: S,
    };
    const res = await fetch('/api/v1/sessions', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    if(!res.ok) return;
    const json = await res.json();
    resumeToken = json.token;
    localStorage.setItem('zgi_resume_token', resumeToken);
    if(noteEl && noteText){
      noteEl.classList.add('saved');
      noteText.textContent = 'Progress saved — resume anytime from the link we sent you.';
    }
  }catch(err){ /* best-effort only — never block the journey on this */ }
}

async function tryResume(){
  const params = new URLSearchParams(location.search);
  const token = params.get('resume') || localStorage.getItem('zgi_resume_token');
  if(!token) return;
  try{
    const res = await fetch(`/api/v1/sessions/${token}`);
    if(!res.ok) return;
    const json = await res.json();
    const saved = json.data.state;
    if(!saved) return;
    resumeToken = token;
    Object.assign(S, saved);

    document.getElementById('inpVRN').value = S.vrn||'';
    document.getElementById('inpEmail').value = S.email||'';
    document.getElementById('inpMobile').value = S.mobile||'';
    if(S.type){
      const savedVehCode = S.vehCode; // onTypeChange() below resets S.vehCode/S.use as a side effect
      document.getElementById('selType').value = S.type;
      onTypeChange();
      if(savedVehCode){
        document.getElementById('selUse').value = savedVehCode;
        onUseChange(); // .value alone doesn't fire onchange — call directly so S.use/S.vehCode resync
      }
    }
    onVRNType(); onContactType();

    const banner = document.getElementById('resumeBanner');
    document.getElementById('resumeBannerSub').textContent = `Resuming your ${S.vrn||'saved'} quote from where you left off.`;
    banner.classList.add('show');

    // Quote/payment/policy steps depend on live server-side records we don't
    // persist across resume — land the user just after the furthest step
    // that's safe to replay locally (vehicle/cover/duration/details).
    const safeStep = ['quote','payment','policy'].includes(S.currentStep) ? 'details' : (S.currentStep||'vehicle');
    jumpTo(safeStep);
  }catch(err){ /* invalid/expired token — just start fresh */ }
}

// ── Settings modal ───────────────────────────────────────────────────────
function openSettings(){
  document.getElementById('settingsModal').classList.add('open');
  loadSettings();
}
function closeSettings(){
  document.getElementById('settingsModal').classList.remove('open');
}

// ── Misc ──────────────────────────────────────────────────────────────────
function show(id){const e=document.getElementById(id);if(e)e.style.display='block';}
function hide(id){const e=document.getElementById(id);if(e)e.style.display='none';}

// ── Reset ─────────────────────────────────────────────────────────────────
function startNewQuote(){
  const midFlow = Boolean(S.vrn || S.quote);
  if(midFlow && !confirm('Start a new quote? Your current progress will be cleared.')) return;
  resetDemo();
}

function resetDemo(){
  if(pollTimer) clearInterval(pollTimer);
  clearTimeout(saveTimer);
  resumeToken=null;
  localStorage.removeItem('zgi_resume_token');
  history.replaceState(null,'',location.pathname);
  document.getElementById('resumeBanner').classList.remove('show');
  S={vrn:'',type:'',use:'',vehCode:null,cover:null,value:null,bundle:null,hasTV:false,months:4,
     email:'rchirongoma@gmail.com',mobile:'263775461117',
     quoteId:null,quote:null,path:null,digitalPolicyNumber:null,policy:null};
  selectedProvider='ecocash';numberEntered=true;consentGiven=false;
  document.getElementById('inpVRN').value='';
  document.getElementById('inpEmail').value='rchirongoma@gmail.com';
  document.getElementById('inpMobile').value='263775461117';
  setFieldState('inpVRN','err-vrn',null);
  setFieldState('inpEmail','err-email',null);
  setFieldState('inpMobile','err-mobile',null);
  document.getElementById('saveNote').classList.remove('saved');
  document.getElementById('saveNoteText').textContent="We'll save your progress so you can pick up where you left off.";
  document.getElementById('selType').value='';
  document.getElementById('selUse').innerHTML='<option value="">Select type first…</option>';
  document.getElementById('selUse').disabled=true;
  document.getElementById('veh-btn').disabled=true;
  if(document.getElementById('inpValue'))document.getElementById('inpValue').value='';
  document.querySelectorAll('.dur-btn').forEach((b,i)=>b.classList.toggle('active',i===0));
  ['WINDSCREEN','ACCESSORIES','EXCESS_BUYDOWN','CAR_HIRE'].forEach((c,i)=>{
    const on=i===0;
    document.getElementById('ex-'+c)?.classList.toggle('checked',on);
    const ch=document.getElementById('chk-'+c);if(ch){ch.classList.toggle('on',on);ch.textContent=on?'✓':'';}
    const pe=document.getElementById('price-'+c);if(pe)pe.textContent='+$'+(ANNUAL[c]*S.months/12).toFixed(2);
  });
  updateExtrasTotal();
  document.getElementById('docsSent').style.display='none';
  resetPaymentCard();
  document.getElementById('quoteError').style.display='none';
  checkNumber();
  jumpTo('vehicle');
}

checkNumber();
onVRNType();
onContactType();
jumpTo('vehicle');
tryResume();
