async function loadSettings(){
  const res = await fetch('/api/v1/settings');
  const s = await res.json();
  document.getElementById('set-mode').value = s.icecashMode;
  document.getElementById('set-baseUrl').value = s.baseUrl || '';
  document.getElementById('set-partnerKey').value = '';
  document.getElementById('set-partnerKey').placeholder = s.partnerKeySet ? 'Currently set (leave blank to keep)' : 'No key saved yet';
  document.getElementById('set-locationId').value = s.locationId || '';
  document.getElementById('set-insuranceCompanyId').value = s.insuranceCompanyId || '24';

  document.getElementById('set-ecocashMode').value = s.ecocashMode || 'simulated';
  document.getElementById('set-ecocashBaseUrl').value = s.ecocashGatewayBaseUrl || '';
  document.getElementById('set-ecocashApiKey').value = '';
  document.getElementById('set-ecocashApiKey').placeholder = s.ecocashGatewayApiKeySet ? 'Currently set (leave blank to keep)' : 'No key saved yet';
  document.getElementById('set-ecocashPartnerCode').value = s.ecocashGatewayPartnerCode || '';
}

async function saveSettings(){
  const body = {
    icecashMode: document.getElementById('set-mode').value,
    baseUrl: document.getElementById('set-baseUrl').value,
    partnerKey: document.getElementById('set-partnerKey').value,
    locationId: document.getElementById('set-locationId').value,
    insuranceCompanyId: document.getElementById('set-insuranceCompanyId').value,
    ecocashMode: document.getElementById('set-ecocashMode').value,
    ecocashGatewayBaseUrl: document.getElementById('set-ecocashBaseUrl').value,
    ecocashGatewayApiKey: document.getElementById('set-ecocashApiKey').value,
    ecocashGatewayPartnerCode: document.getElementById('set-ecocashPartnerCode').value,
  };
  const res = await fetch('/api/v1/settings', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  const s = await res.json();
  const statusEl = document.getElementById('settingsStatus');

  const icecashIncomplete = s.icecashMode==='real' && (!s.baseUrl || !s.partnerKeySet || !s.locationId);
  const ecocashIncomplete = s.ecocashMode==='real' && (!s.ecocashGatewayBaseUrl || !s.ecocashGatewayApiKeySet || !s.ecocashGatewayPartnerCode);

  if(icecashIncomplete || ecocashIncomplete){
    statusEl.className='settings-status notice amber';
    statusEl.style.display='flex';
    const parts=[];
    if(icecashIncomplete) parts.push('IceCash real mode needs baseUrl, partnerKey and locationId all set');
    if(ecocashIncomplete) parts.push('EcoCash real mode needs the gateway base URL, API key and partner code all set');
    statusEl.textContent='Saved, but '+parts.join('; and ')+' — it will raise a clear configuration error on each call until then.';
  } else {
    statusEl.className='settings-status notice ok';
    statusEl.style.display='flex';
    statusEl.textContent='Settings saved — takes effect immediately on the next quote/payment call.';
  }
  document.getElementById('set-partnerKey').value = '';
  document.getElementById('set-partnerKey').placeholder = s.partnerKeySet ? 'Currently set (leave blank to keep)' : 'No key saved yet';
  document.getElementById('set-ecocashApiKey').value = '';
  document.getElementById('set-ecocashApiKey').placeholder = s.ecocashGatewayApiKeySet ? 'Currently set (leave blank to keep)' : 'No key saved yet';
}
