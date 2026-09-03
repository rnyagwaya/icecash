async function loadSettings(){
  const res = await fetch('/api/v1/settings');
  const s = await res.json();
  document.getElementById('set-mode').value = s.icecashMode;
  document.getElementById('set-baseUrl').value = s.baseUrl || '';
  document.getElementById('set-partnerKey').value = '';
  document.getElementById('set-partnerKey').placeholder = s.partnerKeySet ? 'Currently set (leave blank to keep)' : 'No key saved yet';
  document.getElementById('set-locationId').value = s.locationId || '';
  document.getElementById('set-insuranceCompanyId').value = s.insuranceCompanyId || '24';
}

async function saveSettings(){
  const body = {
    icecashMode: document.getElementById('set-mode').value,
    baseUrl: document.getElementById('set-baseUrl').value,
    partnerKey: document.getElementById('set-partnerKey').value,
    locationId: document.getElementById('set-locationId').value,
    insuranceCompanyId: document.getElementById('set-insuranceCompanyId').value,
  };
  const res = await fetch('/api/v1/settings', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  const s = await res.json();
  const statusEl = document.getElementById('settingsStatus');

  if(s.icecashMode==='real' && (!s.baseUrl || !s.partnerKeySet || !s.locationId)){
    statusEl.className='settings-status notice amber';
    statusEl.style.display='flex';
    statusEl.textContent='Saved, but real mode needs baseUrl, partnerKey and locationId all set before it will work — it will fall back to raising a clear configuration error on each call until then.';
  } else {
    statusEl.className='settings-status notice ok';
    statusEl.style.display='flex';
    statusEl.textContent='Settings saved — takes effect immediately on the next quote/payment call.';
  }
  document.getElementById('set-partnerKey').value = '';
  document.getElementById('set-partnerKey').placeholder = s.partnerKeySet ? 'Currently set (leave blank to keep)' : 'No key saved yet';
}
