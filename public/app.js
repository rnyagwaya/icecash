// ── Reference data (mirrors server/data/enums.js for client-side display) ──
const INS={RTA:{code:1,label:'Road Traffic Act (RTA)'},FTP:{code:2,label:'Full Third Party'},FTPF:{code:3,label:'Full Third Party, Fire & Theft'},COMP:{code:4,label:'Comprehensive Cover'}};
const LIC_FREQ={4:1,5:4,6:2,7:5,8:6,9:7,10:8,11:9,12:3};
const BUNDLE_LABELS={insurance:'Insurance only',licence:'Insurance + ZINARA Licence',radio:'Insurance + ZINARA + ZBC Radio'};
const ANNUAL={WINDSCREEN:35,ACCESSORIES:50,EXCESS_BUYDOWN:80,CAR_HIRE:120};
const INS_TYPE_LABELS={'1':'Road Traffic Act (RTA)','2':'Full Third Party','3':'Full Third Party, Fire & Theft','4':'Comprehensive Cover'};
// Populated from GET /api/v1/enums (server/data/enums.js has the complete 1-37 code list) —
// vehicle type is no longer staff-selected, only known once IceCash returns it in the quote.
let VEH_TYPE_LABELS={};

function currentPolicyHolder(){
  return {
    idNumber: S.idNumber, idType: '1',
    firstName: S.firstName, lastName: S.lastName,
    address1: S.address1, town: S.town, suburbID: S.suburbID,
    entityType: S.entityType, companyName: S.companyName,
    email: S.email, msisdn: S.mobile,
  };
}

// ── State ─────────────────────────────────────────────────────────────────
let S={vrn:'',currency:'USD',cover:null,value:null,bundle:null,hasTV:false,usageCategory:'private',months:4,
       email:'',mobile:'',
       entityType:'Personal',companyName:'',firstName:'',lastName:'',idNumber:'',address1:'',town:'',suburbID:null,
       quoteId:null,quote:null,path:null,digitalPolicyNumber:null,policy:null};
let selectedProvider='ecocash',numberEntered=true,consentGiven=false;
let pollTimer=null,saveTimer=null,resumeToken=null,sheetExpanded=false;

// ── Step nav ──────────────────────────────────────────────────────────────
const STEPS=['vehicle','cover','extras','details','quote','payment','policy'];
function jumpTo(step){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('v-'+step).classList.add('active');
  updateProgress(step);

  // Going back to edit a pre-quote step invalidates any quote already generated — clear it so
  // the sticky summary panel doesn't keep showing a stale confirmed total for a vehicle/cover
  // the user is actively changing. A fresh quote is fetched again once they reach Quote.
  if(S.quote && STEPS.indexOf(step) < STEPS.indexOf('quote')){
    S.quote=null; S.quoteId=null; S.path=null;
  }

  S.currentStep = step;
  if(step==='cover') buildCoverSumm();
  if(step==='extras'){buildCoverSumm2();applyExtrasVis();}
  if(step==='details'){
    document.getElementById('inpEmail').value = S.email||'';
    document.getElementById('inpMobile').value = S.mobile||'';
    document.getElementById('inpFirstName').value = S.firstName||'';
    document.getElementById('inpLastName').value = S.lastName||'';
    document.getElementById('inpIdNumber').value = S.idNumber||'';
    document.getElementById('inpCompanyName').value = S.companyName||'';
    document.getElementById('inpAddress1').value = S.address1||'';
    document.getElementById('selSuburb').value = S.suburbID||'';
    onContactType();
    checkDetails();
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
  scheduleAutoSave();
}
function toggleCurrency(cur){
  S.currency=cur;
  document.getElementById('cur-USD').classList.toggle('active',cur==='USD');
  document.getElementById('cur-ZWG').classList.toggle('active',cur==='ZWG');
  renderSummary();
  scheduleAutoSave();
}
function checkVehBtn(){
  document.getElementById('veh-btn').disabled=!isValidVRN(S.vrn);
  renderSummary();
}

// ── Step 2: Cover ─────────────────────────────────────────────────────────
function buildCoverSumm(){
  document.getElementById('veh-summ').innerHTML=
    `<div class="summ-chip"><span class="s-tick">✓</span>${S.vrn||'VRN'}</div>
     <div class="summ-chip"><span class="s-tick">✓</span>${S.currency}</div>`;
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
  else{
    document.getElementById('r-tv').classList.remove('show');
    S.hasTV=false;document.getElementById('tvSwitch')?.classList.remove('on');document.getElementById('tvRow')?.classList.remove('on');
    S.usageCategory='private';document.getElementById('usageSwitch')?.classList.remove('on');document.getElementById('usageRow')?.classList.remove('on');
    const urLbl=document.getElementById('usageRowLabel');if(urLbl)urLbl.textContent='Private use';
  }
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
function toggleUsageCategory(){
  S.usageCategory = S.usageCategory==='private' ? 'commercial' : 'private';
  document.getElementById('usageSwitch').classList.toggle('on',S.usageCategory==='commercial');
  document.getElementById('usageRow').classList.toggle('on',S.usageCategory==='commercial');
  document.getElementById('usageRowLabel').textContent = S.usageCategory==='commercial' ? 'Business/commercial use' : 'Private use';
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
function getRadioTVUsage(){if(S.hasTV)return 3;return S.usageCategory==='commercial'?2:1;}

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

// ── Step 4: Customer details ─────────────────────────────────────────────
async function loadEnums(){
  try{
    const res = await fetch('/api/v1/enums');
    const { data } = await res.json();
    const sel = document.getElementById('selSuburb');
    Object.entries(data.suburbsTowns||{}).forEach(([id,label])=>{
      const opt = document.createElement('option');
      opt.value = id; opt.textContent = label;
      sel.appendChild(opt);
    });
    VEH_TYPE_LABELS = data.vehicleTypes || {};
  }catch(err){ /* Nice-to-have — leave placeholders/blank labels if this fails. */ }
}

function toggleEntityType(){
  S.entityType = S.entityType==='Personal' ? 'Company' : 'Personal';
  document.getElementById('entitySwitch').classList.toggle('on',S.entityType==='Company');
  document.getElementById('entityRow').classList.toggle('on',S.entityType==='Company');
  document.getElementById('entityRowLabel').textContent = S.entityType;
  document.getElementById('companyNameBlock').style.display = S.entityType==='Company' ? 'block' : 'none';
  document.getElementById('idRequiredHint').style.display = S.entityType==='Company' ? 'inline' : 'none';
  checkDetails();
}

function checkDetails(){
  S.firstName = document.getElementById('inpFirstName').value.trim();
  S.lastName = document.getElementById('inpLastName').value.trim();
  S.idNumber = document.getElementById('inpIdNumber').value.trim();
  S.companyName = document.getElementById('inpCompanyName').value.trim();
  S.address1 = document.getElementById('inpAddress1').value.trim();
  const suburbSel = document.getElementById('selSuburb');
  S.suburbID = suburbSel.value ? Number(suburbSel.value) : null;
  S.town = suburbSel.value ? (suburbSel.selectedOptions[0]?.textContent || '') : '';

  const ready = S.entityType==='Company' ? Boolean(S.idNumber && S.companyName) : true;
  document.getElementById('genQuoteBtn').disabled = !ready;
}

// ── Step 4/5: Real quote request ─────────────────────────────────────────
function buildVehiclePayload(){
  return {
    vrn: S.vrn,
    vehicleType: '',
    insuranceType: String(INS[S.cover].code),
    vehicleValue: S.cover==='COMP' ? String(S.value||0) : '0',
    durationMonths: String(S.months),
    licFrequency: S.bundle!=='insurance' ? String(LIC_FREQ[S.months]||3) : undefined,
    radioTvUsage: S.bundle==='radio' ? String(getRadioTVUsage()) : undefined,
    radioTvFrequency: S.bundle==='radio' ? '1' : undefined,
    currency: S.currency,
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
function currentCurrency(){return (S.quote&&S.quote.currency)||S.currency||'USD';}
function fmtAmt(v){const n=parseFloat(v);return isNaN(n)?'—':currentCurrency()+' '+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtTotal(v){const n=parseFloat(v);return isNaN(n)?'—':currentCurrency()+' '+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}

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
  document.getElementById('q-valid').textContent = 'Valid until ' + fmtDate(S.quote.expiresAt);
  document.getElementById('q-expires').textContent = 'Expires ' + fmtDate(S.quote.expiresAt);

  const year = p.YearManufacture && String(p.YearManufacture).trim() ? p.YearManufacture : 'Year not recorded';
  document.getElementById('q-vrn-make').textContent = S.vrn + (v.Make? ' · '+v.Make+' '+v.Model : '');
  document.getElementById('q-year').textContent = year;
  const vt = VEH_TYPE_LABELS[Number(v.VehicleType)];
  document.getElementById('q-veh-type').textContent = vt ? `${vt.type} — ${vt.use}` : (v.VehicleType || '—');
  document.getElementById('q-ins-type').textContent = INS_TYPE_LABELS[String(p.InsuranceType)] || S.cover;
  document.getElementById('q-period').textContent = fmtDate(p.StartDate)+' → '+fmtDate(p.EndDate);
  document.getElementById('q-dur').textContent = (p.DurationMonths||S.months)+' months';
  document.getElementById('q-cover-amt').textContent = p.CoverAmount!=null ? fmtAmt(p.CoverAmount) : '—';

  // Owner/policyholder info as IceCash actually returned it — masked in real mode, shown as-is
  // per the "show exactly what the API returns" rule (no unmasking from locally-submitted values).
  const c = raw.Client || {};
  const hasOwnerInfo = Boolean(c.EntityType || c.LastName || c.IDNumber);
  document.getElementById('q-owner-divider').style.display = hasOwnerInfo ? 'block' : 'none';
  document.getElementById('q-owner-entity-row').style.display = c.EntityType ? 'flex' : 'none';
  document.getElementById('q-owner-entity').textContent = c.EntityType || '—';
  document.getElementById('q-owner-lastname-row').style.display = c.LastName ? 'flex' : 'none';
  document.getElementById('q-owner-lastname').textContent = c.LastName || '—';
  document.getElementById('q-owner-id-row').style.display = c.IDNumber ? 'flex' : 'none';
  document.getElementById('q-owner-id').textContent = c.IDNumber || '—';

  document.getElementById('q-amt-lbl').textContent = combined ? 'Total due (ins + licence)' : 'Total due';
  document.getElementById('q-total-fig').textContent = parseFloat(grand).toLocaleString('en-US',{minimumFractionDigits:2});
  document.getElementById('qa-currency').textContent = currentCurrency();

  document.getElementById('q-ins-hdr').textContent = 'Motor Insurance · ' + S.vrn;
  // Premium amount is the base cover BEFORE stamp duty/levy (CoverAmount) — PremiumAmount/Amount
  // is already the grand total (CoverAmount + StampDuty + GovernmentLevy), so showing it here
  // would make the breakdown look like it double-counts when read top to bottom.
  document.getElementById('q-premium').textContent = fmtAmt(p.CoverAmount);
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
    // Real IceCash returns "TotalRadioTVAmt" (capital V); our mock simulator uses
    // "TotalRadioTvAmt" — read either casing so this displays correctly in both modes.
    document.getElementById('q-radio').textContent = fmtAmt(l.TotalRadioTVAmt ?? l.TotalRadioTvAmt);
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
  document.getElementById('pay-total-lbl').textContent = 'Total due today';
  document.getElementById('pay-receipt-row').style.display='none';
  document.getElementById('pay-digital-row').style.display='none';
  document.getElementById('pay-licence-receipt-row').style.display='none';
  document.getElementById('consent-amt').textContent = grandFmt;
  document.getElementById('pay-btn-amt').textContent = grandFmt;
  resetPaymentCard();
}

// ── Payment — one unified method list: EcoCash / Cash / Card ──
var PROVIDERS={
  ecocash:{label:'EcoCash', kind:'wallet'},
  cash:{label:'Cash', kind:'cash'},
  card:{label:'Card', kind:'card'},
};
let cashReady=false, cardReady=false;

// Bank + terminal ID as physically labeled on each POS machine — extend this list as more
// terminals come into service.
const POS_TERMINALS=[
  {bank:'NMB', terminalId:'66756'},
  {bank:'STANBIC', terminalId:'334265'},
];
function loadPosTerminals(){
  const sel=document.getElementById('pos-terminal');
  if(!sel || sel.options.length>1) return;
  POS_TERMINALS.forEach(t=>{
    const opt=document.createElement('option');
    opt.value=`${t.bank}-${t.terminalId}`;
    opt.textContent=`${t.bank}-${t.terminalId}`;
    sel.appendChild(opt);
  });
}

function resetPaymentCard(){
  selectedProvider='ecocash';consentGiven=false;cashReady=false;cardReady=false;
  document.getElementById('paymentCard').style.display='block';
  document.getElementById('paymentBackRow').style.display='flex';
  hide('cashierOrch'); hide('payWaiting'); hide('payFailed'); hide('payFinalising');
  Object.keys(PROVIDERS).forEach(k=>document.getElementById('badge-'+k)?.classList.remove('selected'));
  document.getElementById('badge-ecocash').classList.add('selected');
  document.getElementById('mob-num').value=S.mobile||'';
  document.getElementById('cash-currency-label').textContent=currentCurrency();
  document.getElementById('cash-amount').value='';
  document.getElementById('change-due-row').style.display='none';
  document.getElementById('card-currency-label').textContent=currentCurrency();
  document.getElementById('card-amount').value='';
  document.getElementById('pos-terminal').value='';
  document.getElementById('card-rrn').value='';
  document.getElementById('consent-cb').checked=false;
  selectProvider('ecocash');
  checkNumber();
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
  const total=grandTotalOf();
  const row=document.getElementById('change-due-row');
  if(!v || isNaN(v)){
    row.style.display='none';
    cashReady=false;
  } else {
    const change=v-total;
    row.style.display='flex';
    row.classList.toggle('insufficient', change<0);
    document.getElementById('change-due-val').textContent =
      change<0 ? `Short by ${currentCurrency()} ${Math.abs(change).toFixed(2)}` : `${currentCurrency()} ${change.toFixed(2)}`;
    cashReady = change>=0;
  }
  checkPayReady();
}
function checkCardReady(){
  const amount=parseFloat(document.getElementById('card-amount').value);
  const terminal=document.getElementById('pos-terminal').value;
  const rrn=document.getElementById('card-rrn').value.trim();
  cardReady = Boolean(amount>0 && terminal && rrn.length>=4);
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
  document.getElementById('paymentBackRow').style.display='none';
  show('payWaiting'); hide('payFailed'); hide('payFinalising');
  document.getElementById('pollList').innerHTML='';

  const msisdn = document.getElementById('mob-num').value.trim();
  const amount = grandTotalOf();

  const initBody = { quoteId: S.quoteId, customerMsisdn: msisdn, amount };
  const initRes = await fetch('/api/v1/payments/ecocash/initiate', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(initBody)
  });
  if(!initRes.ok){
    const initJson = await initRes.json().catch(()=>({}));
    document.getElementById('payFailedMsg').textContent = initJson.message || 'Could not start the EcoCash payment.';
    hide('payWaiting'); show('payFailed');
    return;
  }

  let attempts=0;
  const maxAttempts=20;
  pollTimer = setInterval(async ()=>{
    attempts++;
    try{
      const res = await fetch(`/api/v1/payments/ecocash/status/quote/${S.quoteId}`);
      const json = await res.json();

      if(json.paymentStatus==='FAILED'){
        clearInterval(pollTimer);
        document.getElementById('payFailedMsg').textContent = json.message || 'The customer did not approve the EcoCash prompt.';
        hide('payWaiting'); hide('payFinalising'); show('payFailed');
        return;
      }

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
        document.getElementById('payFailedMsg').textContent = 'No policy was created — you have not been charged.';
        hide('payWaiting'); hide('payFinalising'); show('payFailed');
      }
    }catch(err){
      clearInterval(pollTimer);
      document.getElementById('payFailedMsg').textContent = 'No policy was created — you have not been charged.';
      hide('payWaiting'); show('payFailed');
    }
  }, 1500);
}
function retryPay(){
  hide('payFailed');hide('payWaiting');hide('payFinalising');
  document.getElementById('paymentCard').style.display='block';
  document.getElementById('paymentBackRow').style.display='flex';
}

// ── Cash / Card — branch-confirmed, 2-step orchestration (accept + poll) ──
async function handleCounterPayment(){
  const kind = PROVIDERS[selectedProvider]?.kind; // 'cash' | 'card'
  document.getElementById('paymentCard').style.display='none';
  document.getElementById('paymentBackRow').style.display='none';
  show('cashierOrch');
  hide('orchResultFail'); hide('orchActions');
  document.getElementById('pay-total-lbl').textContent = 'Total due today';
  document.getElementById('pay-receipt-row').style.display='none';
  document.getElementById('pay-digital-row').style.display='none';
  document.getElementById('pay-licence-receipt-row').style.display='none';
  document.getElementById('orchRetryBtn').style.display='none';
  document.getElementById('orchViewPolicyBtn').style.display='none';
  show('orchPending');
  document.getElementById('orchPendingDetail').textContent = 'Submitting your payment to IceCash…';

  const body = kind==='cash'
    ? {
        quoteId: S.quoteId, paymentSource: 'CASH',
        amountTendered: document.getElementById('cash-amount').value.trim(),
        changeDue: (parseFloat(document.getElementById('cash-amount').value)-grandTotalOf()).toFixed(2),
      }
    : {
        quoteId: S.quoteId, paymentSource: 'CARD_SWIPE',
        amountPaid: document.getElementById('card-amount').value.trim(),
        posTerminal: document.getElementById('pos-terminal').value,
        cardReference: document.getElementById('card-rrn').value.trim(),
      };

  try{
    const res = await fetch('/api/v1/motor/payments/confirm', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
    const json = await res.json();
    hide('orchPending');

    if(res.ok && json.success){
      S.digitalPolicyNumber = json.digitalPolicyNumber;
      document.getElementById('pay-total-lbl').textContent = 'Payment recorded';
      document.getElementById('pay-receipt-no').textContent = json.paymentTransactionId;
      document.getElementById('pay-receipt-row').style.display='flex';
      document.getElementById('pay-digital-no').textContent = json.digitalPolicyNumber;
      document.getElementById('pay-digital-row').style.display='flex';
      if(json.licenceReceiptId){
        document.getElementById('pay-licence-receipt-no').textContent = json.licenceReceiptId;
        document.getElementById('pay-licence-receipt-row').style.display='flex';
      }
      document.getElementById('orchViewPolicyBtn').style.display='block';
      show('orchActions');
    } else {
      document.getElementById('orchResultFailText').textContent =
        json.opsAlert ? `${json.opsAlert.reason}: ${json.opsAlert.detail}` : (json.message || 'Please retry — no charge has been reversed automatically.');
      show('orchResultFail');
      document.getElementById('orchRetryBtn').style.display='block';
      show('orchActions');
    }
  }catch(err){
    hide('orchPending');
    document.getElementById('orchResultFailText').textContent = err.message;
    show('orchResultFail');
    document.getElementById('orchRetryBtn').style.display='block';
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
  document.getElementById('pol-processed-by').textContent = policy.processedBy?.name || '—';

  const hasReceipt = Boolean(policy.icecash.licenceReceiptId);
  document.getElementById('pol-receipt').style.display = hasReceipt ? 'flex':'none';
  if(hasReceipt) document.getElementById('pol-receipt-id').textContent = policy.icecash.licenceReceiptId;

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
  lines.push(['Currency', S.currency]);
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
    totalFig.textContent = currentCurrency()+' '+figure.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    totalNote.textContent = 'Confirmed price from your quote.';
    totalNote.style.color = 'var(--gm)';
    if(sheetFig){ sheetFig.textContent = currentCurrency()+' '+figure.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); sheetFig.classList.remove('pending'); }
  } else {
    totalBox.style.display='none';
    if(sheetFig){ sheetFig.textContent = 'Get your quote to see pricing'; sheetFig.classList.add('pending'); }
  }

  // Hide the sticky panel once the policy is issued — its own summary takes over.
  // The Quote step is itself the full quotation — no need for the sticky recap alongside it.
  // The Policy step has its own dedicated summary card too.
  const hideSummary = S.currentStep==='policy' || S.currentStep==='quote' || S.currentStep==='payment';
  document.getElementById('summaryPanel').classList.toggle('force-hide', hideSummary);
  document.getElementById('summarySheet').classList.toggle('force-hide', hideSummary);
  document.getElementById('wizardLayout').classList.toggle('full-width', hideSummary);
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
    toggleCurrency(S.currency||'USD');
    onVRNType();

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

function toggleProfileMenu(){
  document.getElementById('profileDropdown').classList.toggle('open');
}
function closeProfileMenu(){
  document.getElementById('profileDropdown').classList.remove('open');
}
document.addEventListener('click', (e) => {
  const menu = document.getElementById('profileMenu');
  if (menu && !menu.contains(e.target)) closeProfileMenu();
});

async function loadProfile(){
  try {
    const res = await fetch('/api/v1/staff/me');
    if (!res.ok) { location.href = '/login.html'; return; }
    const { user } = await res.json();
    const initials = (user.name || user.email).split(/[\s.@]+/).filter(Boolean).slice(0,2).map(p=>p[0].toUpperCase()).join('');
    document.getElementById('profileAvatar').textContent = initials || '?';
    document.getElementById('profileName').textContent = user.name || user.email;
    document.getElementById('profileEmail').textContent = user.email;
  } catch (err) {
    // Non-fatal — leave the placeholder avatar rather than blocking the wizard on this.
  }
}

async function logout(){
  await fetch('/api/v1/staff/logout', { method: 'POST' });
  location.href = '/login.html';
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
  S={vrn:'',currency:'USD',cover:null,value:null,bundle:null,hasTV:false,usageCategory:'private',months:4,
     email:'',mobile:'',
     entityType:'Personal',companyName:'',firstName:'',lastName:'',idNumber:'',address1:'',town:'',suburbID:null,
     quoteId:null,quote:null,path:null,digitalPolicyNumber:null,policy:null};
  selectedProvider='ecocash';consentGiven=false;
  document.getElementById('inpVRN').value='';
  document.getElementById('inpEmail').value='';
  document.getElementById('inpMobile').value='';
  document.getElementById('inpFirstName').value='';
  document.getElementById('inpLastName').value='';
  document.getElementById('inpIdNumber').value='';
  document.getElementById('inpCompanyName').value='';
  document.getElementById('inpAddress1').value='';
  document.getElementById('selSuburb').value='';
  document.getElementById('cur-USD').classList.add('active');
  document.getElementById('cur-ZWG').classList.remove('active');
  document.getElementById('entitySwitch').classList.remove('on');
  document.getElementById('entityRow').classList.remove('on');
  document.getElementById('entityRowLabel').textContent='Personal';
  document.getElementById('companyNameBlock').style.display='none';
  document.getElementById('idRequiredHint').style.display='none';
  document.getElementById('usageSwitch').classList.remove('on');
  document.getElementById('usageRow').classList.remove('on');
  document.getElementById('usageRowLabel').textContent='Private use';
  setFieldState('inpVRN','err-vrn',null);
  setFieldState('inpEmail','err-email',null);
  setFieldState('inpMobile','err-mobile',null);
  document.getElementById('saveNote').classList.remove('saved');
  document.getElementById('saveNoteText').textContent="We'll save your progress so you can pick up where you left off.";
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
jumpTo('vehicle');
tryResume();
loadProfile();
loadEnums();
loadPosTerminals();
