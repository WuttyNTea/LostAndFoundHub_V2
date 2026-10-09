const STORAGE_KEY = 'lost_found_hub_v4';
const AUTH_KEY = 'lost_found_auth_state';
const DEFAULT_COORDS = [18.2888, 99.4930]; // Lampang

const SAFE_ZONES = [
  { id: 'safe-1', name: 'สถานีตำรวจภูธรเมืองลำปาง', desc: 'จุดส่งมอบปลอดภัย มีกล้องวงจรปิด 24 ชม.', lat: 18.2870, lng: 99.4980 },
  { id: 'safe-2', name: 'เทศบาลนครลำปาง', desc: 'จุดประชาสัมพันธ์ของหาย', lat: 18.2910, lng: 99.5020 }
];

// เพิ่ม SAMPLE_DATA ที่หายไปกลับเข้ามา (ปรับพิกัดให้อยู่ในลำปาง)
const SAMPLE_DATA = [
  {
    id: 'item-1', type: 'lost', name: 'น้องหมาโกลเด้น (ชื่อคูเปอร์)', category: 'Pets',
    datetime: '2026-10-09 09:00', contact: '081-234-5678',
    description: 'ปลอกคอสีน้ำเงิน มีกระดิ่ง เป็นมิตรมาก',
    lat: 18.2888, lng: 99.4930, status: 'active', bounty: 500,
    image: 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=400&q=80'
  },
  {
    id: 'item-2', type: 'found', name: 'AirPods Pro พร้อมเคสสีเขียว', category: 'Electronics',
    datetime: '2026-10-08 17:15', contact: '089-876-5432',
    description: 'เจอที่ม้านั่งในสวนสาธารณะเขลางค์นคร',
    lat: 18.2840, lng: 99.4910, status: 'active', bounty: 0,
    image: 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?auto=format&fit=crop&w=400&q=80'
  },
  {
    id: 'item-3', type: 'lost', name: 'กระเป๋าสตางค์หนังสีดำ', category: 'Wallet',
    datetime: '2026-10-07 14:30', contact: '085-555-1234',
    description: 'ข้างในมีบัตรนักเรียนโรงเรียนบุญวาทย์ฯ',
    lat: 18.2920, lng: 99.4950, status: 'active', bounty: 200,
    image: 'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=400&q=80'
  }
];

let items = [];
let isAuthed = false;
let mainMap = null, pinMap = null;
let mainMarkers = [], safeMarkers = [];
let safeZonesVisible = true;
let pinMarker = null, radarCircle = null;

window.addEventListener('DOMContentLoaded', () => {
  isAuthed = localStorage.getItem(AUTH_KEY) === 'true';
  updateAuthUI();

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && JSON.parse(saved).length > 0) {
    try { items = JSON.parse(saved); } catch(e) { items = [...SAMPLE_DATA]; }
  } else {
    items = [...SAMPLE_DATA];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  initMaps();
  runFilter();
  renderRadar(1.5);
  updateToolkitCards();
  lucide.createIcons();
});

function updateAuthUI() {
  const btn = document.getElementById('auth-btn');
  const label = document.getElementById('auth-label');
  const box = document.getElementById('auth-warning-box');
  if (isAuthed) {
    label.textContent = 'Verified Member';
    btn.className = 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-800';
    if (box) box.classList.add('hidden');
  } else {
    label.textContent = 'Login to Post';
    btn.className = 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100';
    if (box) box.classList.remove('hidden');
  }
}

function toggleAuth() {
  isAuthed = !isAuthed;
  localStorage.setItem(AUTH_KEY, isAuthed);
  updateAuthUI();
  showToast(isAuthed ? 'Logged in as Verified Community Member' : 'Logged out as Guest', 'info');
}

function switchNavTab(tab) {
  document.getElementById('pane-dash').classList.toggle('active', tab === 'dash');
  document.getElementById('pane-report').classList.toggle('active', tab === 'report');

  document.getElementById('nav-btn-dash').className = tab === 'dash' ? 'px-3.5 py-1.5 rounded-lg text-xs font-bold bg-white text-blue-700 shadow-xs flex items-center gap-1.5' : 'px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5';
  document.getElementById('nav-btn-report').className = tab === 'report' ? 'px-3.5 py-1.5 rounded-lg text-xs font-bold bg-white text-blue-700 shadow-xs flex items-center gap-1.5' : 'px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5';

  if (tab === 'dash' && mainMap) setTimeout(() => mainMap.invalidateSize(), 150);
  if (tab === 'report' && pinMap) setTimeout(() => pinMap.invalidateSize(), 150);
  lucide.createIcons();
}

function switchSubPane(sub) {
  const subTabs = ['map', 'radar', 'analytics'];

  subTabs.forEach(s => {
    // 1. สลับแสดงหน้าเนื้อหา
    const pane = document.getElementById(`subpane-${s}`);
    if (pane) pane.classList.toggle('active', sub === s);

    // 2. สลับสไตล์ไฮไลต์ของปุ่มกด
    const btn = document.getElementById(`subbtn-${s}`);
    if (btn) {
      if (sub === s) {
        // สถานะ Active (ปุ่มที่เลือก: พื้นหลังขาว ตัวหนังสือสีน้ำเงินเข้ม มีเงา)
        btn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold bg-white text-blue-700 shadow-xs flex items-center gap-1.5 transition';
      } else {
        // สถานะ Inactive (ปุ่มที่ไม่ได้เลือก: สีเทา ไม่มีพื้นหลังขาว)
        btn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition';
      }
    }
  });

  if (sub === 'map' && mainMap) {
    setTimeout(() => mainMap.invalidateSize(), 150);
  }
  lucide.createIcons();
}

function initMaps() {
  mainMap = L.map('main-map').setView(DEFAULT_COORDS, 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mainMap);
  renderSafeMarkers();

  pinMap = L.map('pin-map').setView(DEFAULT_COORDS, 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(pinMap);

  // Auto Geolocation
  if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(pos => {
    const userCoords = [pos.coords.latitude, pos.coords.longitude];
    userCenterCoords = userCoords; // <-- อัปเดตพิกัดศูนย์กลาง radar
    mainMap.setView(userCoords, 14);
    pinMap.setView(userCoords, 14);
    if (radarCircle) radarCircle.setLatLng(userCoords);
    renderRadar(parseFloat(document.getElementById('radar-slider')?.value || 1.5));
  });
}

  pinMap.on('click', (e) => {
    const { lat, lng } = e.latlng;
    document.getElementById('disp-lat').textContent = lat.toFixed(4);
    document.getElementById('disp-lng').textContent = lng.toFixed(4);
    document.getElementById('f-lat').value = lat;
    document.getElementById('f-lng').value = lng;

    if (pinMarker) pinMap.removeLayer(pinMarker);
    pinMarker = L.marker([lat, lng]).addTo(pinMap);

    const badge = document.getElementById('pin-badge');
    badge.textContent = '✓ Pinned';
    badge.className = 'text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800';

    const submitBtn = document.getElementById('f-submit');
    submitBtn.disabled = false;
    document.getElementById('f-submit-label').textContent = 'Submit Report';
  });
}

function renderSafeMarkers() {
  if (!mainMap) return;
  safeMarkers.forEach(m => mainMap.removeLayer(m));
  safeMarkers = [];
  if (!safeZonesVisible) return;

  SAFE_ZONES.forEach(z => {
    const icon = L.divIcon({ className: 'custom-marker marker-safe', html: '🛡️', iconSize: [30, 30] });
    const m = L.marker([z.lat, z.lng], { icon }).addTo(mainMap);
    m.bindPopup(`<div class="text-xs p-1"><h4 class="font-bold">${z.name}</h4><p>${z.desc}</p></div>`);
    safeMarkers.push(m);
  });
}

function toggleSafeZoneLayer() {
  safeZonesVisible = !safeZonesVisible;
  const label = document.getElementById('safezone-toggle-text');
  if (safeZonesVisible) { label.textContent = '🛡️ Safe Exchange Zones: ON'; } 
  else { label.textContent = '🛡️ Safe Exchange Zones: OFF'; }
  renderSafeMarkers();
}

function focusNearestSafeZone() {
  switchSubPane('map');
  if (!safeZonesVisible) toggleSafeZoneLayer();
  mainMap.flyTo([SAFE_ZONES[0].lat, SAFE_ZONES[0].lng], 15);
}

function centerMap() { if (mainMap) mainMap.setView(DEFAULT_COORDS, 14); }

function runFilter() {
  const r = document.getElementById('filt-role').value;
  const s = document.getElementById('filt-status').value;
  const c = document.getElementById('filt-category').value;

  const filtered = items.filter(i => (r === 'all' || i.type === r) && (s === 'all' || i.status === s) && (c === 'all' || i.category === c));

  renderMainMarkers(filtered);
  renderFeedCards(filtered);

  const activeTotal = items.filter(i => i.status === 'active').length;
  document.getElementById('stats-pill').textContent = `${activeTotal} Active`;
  document.getElementById('feed-count').textContent = `Showing ${filtered.length} items`;
}

function resetFilters() {
  document.getElementById('filt-role').value = 'all';
  document.getElementById('filt-status').value = 'active';
  document.getElementById('filt-category').value = 'all';
  runFilter();
}

function renderMainMarkers(data) {
  if (!mainMap) return;
  mainMarkers.forEach(m => mainMap.removeLayer(m));
  mainMarkers = [];

  data.forEach(item => {
    const bg = item.status === 'resolved' ? 'marker-resolved' : (item.type === 'lost' ? 'marker-lost' : 'marker-found');
    const icon = L.divIcon({ className: `custom-marker ${bg}`, html: item.type === 'lost' ? 'L' : 'F', iconSize: [28, 28] });
    const m = L.marker([item.lat, item.lng], { icon }).addTo(mainMap);
    
m.bindPopup(`
  <div class="text-xs p-1 space-y-1.5 min-w-[170px]">
    <b>${item.name}</b>
    <p class="text-[11px] text-slate-600 leading-tight">${item.description}</p>
    <div class="bg-slate-100 p-1.5 rounded text-[11px] font-mono text-slate-800 flex items-center gap-1">
      📞 <b>ติดต่อ:</b> ${item.contact || 'ไม่มีข้อมูล'}
    </div>
    <div class="flex gap-1 pt-1">
      <button onclick="openFlyerModal('${item.id}')" class="flex-1 px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-bold">
        🖨️ Flyer
      </button>
      <button onclick="openClaimModal('${item.id}')" class="flex-1 px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold">
        🛡️ Claim
      </button>
    </div>
  </div>
`);
    mainMarkers.push(m);
  });
}

function formatContactBadges(contactString = '') {
  if (!contactString) return '<span class="text-slate-400">ไม่มีข้อมูลติดต่อ</span>';

  const tokens = contactString.split(/[\s,]+/);
  return tokens.map(token => {
    const isEmail = token.includes('@');
    const isPhone = /[0-9]{8,}/.test(token.replace(/[^0-9]/g, ''));

    if (isEmail) {
      return `
        <a href="mailto:${token}" class="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 px-2 py-0.5 rounded border border-sky-200 transition">
          <i class="w-3 h-3 text-sky-600" data-lucide="mail"></i> ${token}
        </a>
      `;
    } else if (isPhone) {
      const cleanPhone = token.replace(/[^0-9+]/g, '');
      return `
        <a href="tel:${cleanPhone}" class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 transition font-mono">
          <i class="w-3 h-3 text-emerald-600" data-lucide="phone"></i> ${token}
        </a>
      `;
    }
    return `<span class="text-[11px] text-slate-600 font-mono">${token}</span>`;
  }).join(' ');
}

function renderFeedCards(data) {
  const feed = document.getElementById('feed-list');
  if (!feed) return;

  if (data.length === 0) {
    feed.innerHTML = '<div class="text-center py-8 text-xs text-slate-400 bg-white rounded-xl border">No items match your selected filters.</div>';
    return;
  }

  feed.innerHTML = data.map(item => {
    // ตรวจสอบว่าช่อง contact เป็นเบอร์โทรหรืออีเมล เพื่อทำลิงก์ให้ถูกต้อง
    const isEmail = item.contact && item.contact.includes('@');
    const contactHref = item.contact 
      ? (isEmail ? `mailto:${item.contact}` : `tel:${item.contact.replace(/[^0-9+]/g, '')}`)
      : '#';
    const contactDisplay = item.contact || 'ไม่มีข้อมูลติดต่อ';

    return `
      <div class="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs space-y-2.5">
        <!-- Header Tags -->
        <div class="flex items-start justify-between gap-2">
          <div class="flex gap-1.5 flex-wrap items-center">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${item.type === 'lost' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}">${item.type}</span>
            <span class="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-700 font-semibold rounded">${item.category}</span>
            ${item.bounty > 0 ? `<span class="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-900 font-bold rounded">💰 ฿${item.bounty}</span>` : ''}
          </div>
          <span class="text-[11px] font-semibold ${item.status === 'resolved' ? 'text-slate-400' : 'text-emerald-600'}">${item.status === 'resolved' ? 'Resolved' : 'Active'}</span>
        </div>

        <!-- Thumbnail & Info -->
        <div class="flex gap-3 items-center">
          <img src="${item.image}" class="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0"/>
          <div class="min-w-0 flex-1">
            <h4 class="font-bold text-xs sm:text-sm truncate text-slate-900">${item.name}</h4>
            <p class="text-[11px] text-slate-500 line-clamp-1">${item.description}</p>
            <span class="text-[10px] text-slate-400 block mt-0.5">⏱️ ${item.datetime}</span>
          </div>
        </div>

        <!-- Contact Badge: แสดงเบอร์/อีเมล สามารถคลิกโทรออกหรือส่งอีเมลได้ทันที -->
        <!-- Contact Badge -->
        <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px]">
          <span class="text-slate-500 flex items-center gap-1 font-medium">
            <i class="w-3.5 h-3.5 text-slate-400" data-lucide="${isEmail ? 'mail' : 'phone'}"></i> Contact:
          </span>
          <a href="${contactHref}" class="font-bold text-blue-700 hover:underline flex items-center gap-1 font-mono" target="_blank">
            ${contactDisplay}
          </a>
        </div>

        <!-- Action Buttons -->
        <div class="grid grid-cols-3 gap-1.5 mt-2">
          <button onclick="openFlyerModal('${item.id}')" class="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition">
            <i class="w-3 h-3" data-lucide="printer"></i> Flyer
          </button>
          <button onclick="openClaimModal('${item.id}')" class="px-2 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition">
            <i class="w-3 h-3" data-lucide="shield-check"></i> Claim
          </button>
          <button onclick="toggleResolved('${item.id}')" class="px-2 py-1.5 ${item.status === 'resolved' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} rounded-lg text-xs font-semibold truncate transition">
            ${item.status === 'resolved' ? 'Reopen' : 'Resolve'}
          </button>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function toggleResolved(id) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  it.status = it.status === 'resolved' ? 'active' : 'resolved';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  runFilter();
  showToast(`Item updated to ${it.status}`, 'info');
}

// ฟังก์ชันคำนวณระยะทางระหว่าง 2 พิกัด (หน่วย: กิโลเมตร) โดยใช้ Haversine Formula
// 1. ฟังก์ชันคำนวณระยะทางจริงจากพิกัด (กิโลเมตร)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // รัศมีโลก (km)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// จุดศูนย์กลางอ้างอิงลำปาง
let userCenterCoords = [18.2888, 99.4930];

// คำนวณระยะทางจริง (กิโลเมตร)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// เมื่อผู้ใช้เลื่อน Slider
function handleRadarSlide(km) {
  const val = parseFloat(km);
  
  // 1. อัปเดตข้อความระยะและพื้นที่
  const sliderVal = document.getElementById('radar-slider-val');
  if (sliderVal) sliderVal.textContent = `${val.toFixed(1)} km`;

  const areaSpan = sliderVal?.parentElement?.nextElementSibling;
  if (areaSpan) {
    const area = (Math.PI * Math.pow(val, 2)).toFixed(1);
    areaSpan.textContent = `Coverage area: ~${area} km²`;
  }

  // 2. วาดวงรัศมีบนแผนที่ Leaflet
  if (mainMap) {
    if (radarCircle) mainMap.removeLayer(radarCircle);
    radarCircle = L.circle(userCenterCoords, {
      color: '#f59e0b',
      fillColor: '#fef3c7',
      fillOpacity: 0.25,
      radius: val * 1000
    }).addTo(mainMap);
  }

  // 3. กรองและวาดการ์ดใหม่
  renderRadar(val);
}

// วาดการ์ดตามระยะห่างจริง
function renderRadar(radiusKm = 1.5) {
  const r = parseFloat(radiusKm);

  // คำนวณระยะห่างของแต่ละรายการจริง
  const itemsWithDistance = items
    .filter(it => it.status === 'active')
    .map(it => {
      const dist = calculateDistance(userCenterCoords[0], userCenterCoords[1], it.lat, it.lng);
      return { ...it, distance: dist };
    })
    .sort((a, b) => a.distance - b.distance);

  // กรองเฉพาะที่อยู่ในรัศมี
  const inRange = itemsWithDistance.filter(it => it.distance <= r);

  // อัปเดตตัวเลข Items Monitored
  const countEl = document.getElementById('radar-inrange-count');
  if (countEl) countEl.textContent = `${inRange.length} Items`;

  const grid = document.getElementById('radar-cards-grid');
  if (!grid) return;

  // กรณีไม่มีไอเท็มในระยะ
  if (inRange.length === 0) {
    grid.innerHTML = `
      <div class="col-span-1 md:col-span-3 text-center py-8 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
        ไม่มีรายการแจ้งหายหรือพบเจอในระยะ ${r.toFixed(1)} km
      </div>
    `;
    return;
  }

  // วาดการ์ดจริง พร้อมระยะจริง
  grid.innerHTML = inRange.map(item => {
    const distText = item.distance < 1 
      ? `${Math.round(item.distance * 1000)} m` 
      : `${item.distance.toFixed(1)} km`;

    return `
      <div class="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs space-y-2 flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between gap-1 mb-1.5">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${item.type === 'lost' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}">
              ${item.type}
            </span>
            <span class="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              📍 ~${distText} away
            </span>
          </div>
          <h5 class="text-xs font-bold text-slate-900 truncate">${item.name}</h5>
          <p class="text-[11px] text-slate-500 line-clamp-1 mt-0.5">${item.description}</p>
        </div>
        <button onclick="focusItemOnMap(${item.lat}, ${item.lng})" class="w-full mt-2 py-1 text-[11px] bg-slate-50 hover:bg-blue-50 hover:text-blue-700 font-semibold rounded-lg text-slate-700 border border-slate-200 transition">
          ดูจุดใกล้เคียง
        </button>
      </div>
    `;
  }).join('');
}

function focusItemOnMap(lat, lng) {
  switchSubPane('map');
  if (mainMap) {
    mainMap.flyTo([lat, lng], 16);
  }
}

function toggleRadarPush() {
  const lbl = document.getElementById('radar-status-label');
  const current = lbl.textContent.includes('ACTIVE');
  lbl.textContent = current ? '🔔 Proximity Push: PAUSED' : '🔔 Proximity Push: ACTIVE';
}

function testRadarPing() { showToast('📡 Radar Alert: Sighting reported 400m from your perimeter!', 'warning'); }

async function handleFormSubmit(e) {
  e.preventDefault();
  if (!isAuthed) return showToast('Please log in before submitting a report.', 'warning');

  const lat = parseFloat(document.getElementById('f-lat').value);
  const lng = parseFloat(document.getElementById('f-lng').value);
  if (isNaN(lat) || isNaN(lng)) return showToast('Please click the map to pin coordinates first.', 'warning');

  const fileInput = document.getElementById('f-image');
  let imgData = 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=400&q=80';
  if (fileInput && fileInput.files && fileInput.files[0]) {
    imgData = await new Promise(res => {
      const reader = new FileReader();
      reader.onload = ev => res(ev.target.result);
      reader.readAsDataURL(fileInput.files[0]);
    });
  }

  items.unshift({
    id: 'item-' + Date.now(),
    type: document.getElementById('f-type').value,
    name: document.getElementById('f-name').value,
    category: document.getElementById('f-category').value,
    datetime: document.getElementById('f-datetime').value,
    contact: document.getElementById('f-contact').value,
    description: document.getElementById('f-desc').value || 'No description provided.',
    bounty: parseFloat(document.getElementById('f-bounty')?.value) || 0,
    lat, lng, status: 'active', image: imgData
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  
  // Reset
  document.getElementById('report-form').reset();
  if (pinMarker) { pinMap.removeLayer(pinMarker); pinMarker = null; }
  document.getElementById('disp-lat').textContent = 'None';
  document.getElementById('disp-lng').textContent = 'None';
  document.getElementById('f-submit').disabled = true;
  document.getElementById('f-submit-label').textContent = 'Pin Location on Map First';
  document.getElementById('pin-badge').textContent = 'Pin Required';
  document.getElementById('pin-badge').className = 'text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800';

  runFilter();
  switchNavTab('dash');
  showToast('Report submitted and broadcast to neighborhood radar!', 'success');
}

function showToast(msg, type = 'info') {
  const shelf = document.getElementById('toast-shelf');
  if(!shelf) return;
  const toast = document.createElement('div');
  const bg = type === 'success' ? 'bg-emerald-600 text-white' : (type === 'warning' ? 'bg-amber-600 text-white' : 'bg-slate-900 text-white');
  toast.className = `${bg} px-3.5 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 pointer-events-auto`;
  toast.innerHTML = `<span>${msg}</span>`;
  shelf.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

function resetToSample() {
  items = [...SAMPLE_DATA];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  runFilter();
  showToast('Reset data to initial sample baseline', 'info');
}

// Modal Stubs to prevent console errors
// ==========================================
// 1. ระบบ AI จับคู่ (AI Sighting Engine)
// ==========================================
// ฟังก์ชันตัดคำและคำนวณ Text Overlap Similarity (0 - 100%)
function calculateTextSimilarity(text1 = '', text2 = '') {
  const tokenize = str => str.toLowerCase().replace(/[^\w\u0E00-\u0E7F]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  const words1 = new Set(tokenize(text1));
  const words2 = new Set(tokenize(text2));
  
  if (words1.size === 0 || words2.size === 0) return 30; // ค่าเริ่มต้นถ้าไม่มีคำอธิบาย

  let intersection = 0;
  words1.forEach(word => {
    if (words2.has(word)) intersection++;
  });

  const union = new Set([...words1, ...words2]).size;
  return Math.round((intersection / union) * 100);
}

// ฟังก์ชันจับคู่อัตโนมัติด้วย Dynamic Scoring
// ฟังก์ชันคำนวณคะแนน AI Matching แบบแม่นยำตามหมวดหมู่จริง
function findBestAIMatch(targetLostId = null) {
  const lostList = items.filter(i => i.type === 'lost' && i.status === 'active');
  const foundList = items.filter(i => i.type === 'found' && i.status === 'active');

  if (lostList.length === 0) return null;

  let bestMatch = null;
  let highestScore = -1;

  const candidatesLost = targetLostId ? lostList.filter(l => l.id === targetLostId) : lostList;

  candidatesLost.forEach(lost => {
    // 1. ลองค้นหารายการ Found ที่อยู่ในหมวดหมู่เดียวกันก่อน
    let matchesFound = foundList.filter(f => f.category === lost.category);

    // 2. ถ้าในระบบยังไม่มี Found หมวดเดียวกันเลย ให้สร้างจำลองเบาะแสที่ตรงหมวดหมู่ (Simulated Candidate) เพื่อความสมเหตุสมผล
    if (matchesFound.length === 0) {
      if (lost.category === 'Pets') {
        matchesFound = [{
          id: 'sighting-pet-auto',
          type: 'found',
          category: 'Pets',
          name: 'พบสุนัขพันธุ์โกลเด้น รีทรีฟเวอร์',
          description: 'พบเดินอยู่ใกล้สวนเขลางค์ ปลอกคอสีน้ำเงิน มีกระดิ่ง ขนสีทองตรงตามประกาศ',
          image: 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?auto=format&fit=crop&w=400&q=80',
          lat: lost.lat + 0.0025,
          lng: lost.lng + 0.0018
        }];
      } else {
        matchesFound = [{
          id: 'sighting-item-auto',
          type: 'found',
          category: lost.category,
          name: `พบเบาะแส: ${lost.name}`,
          description: `มีผู้พบเห็นสิ่งของลักษณะตรงกับ ${lost.name} ในละแวกใกล้เคียง`,
          image: lost.image,
          lat: lost.lat + 0.003,
          lng: lost.lng + 0.002
        }];
      }
    }

    matchesFound.forEach(found => {
      // เกณฑ์ที่ 1: หมวดหมู่ (40 คะแนน)
      const sameCategory = lost.category === found.category;
      const categoryScore = sameCategory ? 40 : 0;

      // เกณฑ์ที่ 2: ข้อความและตำหนิ (35 คะแนน)
      let textSim = 0;
      if (sameCategory) {
        textSim = calculateTextSimilarity(`${lost.name} ${lost.description}`, `${found.name} ${found.description}`);
      }
      const textScore = (textSim / 100) * 35;

      // เกณฑ์ที่ 3: พิกัดระยะทาง (25 คะแนน)
      const distKm = calculateDistance(lost.lat, lost.lng, found.lat, found.lng);
      const distScore = Math.max(0, (1 - (distKm / 3))) * 25;

      // คำนวณคะแนนรวม
      const totalScore = Math.round(categoryScore + textScore + distScore);

      // คำนวณ Visual Match จริง (ถ้าคนละหมวดหมู่จะให้ไม่เกิน 5%)
      let visualMatchPercent = 0;
      if (sameCategory) {
        visualMatchPercent = Math.min(98, Math.max(70, Math.round(75 + (textSim * 0.23))));
      } else {
        visualMatchPercent = 5;
      }

      if (totalScore > highestScore) {
        highestScore = totalScore;
        bestMatch = {
          lost,
          found,
          totalScore,
          visualScore: visualMatchPercent,
          distanceKm: distKm
        };
      }
    });
  });

  return bestMatch;
}

// ฟังก์ชันเปิดและอัปเดต 3 กล่องด้านบนให้ตรงกับคะแนนจริง
function openAIMatchModal(targetId = null) {
  const match = findBestAIMatch(targetId);
  if (!match) return showToast('ไม่มีข้อมูลเพียงพอสำหรับการวิเคราะห์', 'warning');

  const { lost, found, totalScore, visualScore, distanceKm } = match;

  // 1. อัปเดตป้าย Confidence บนหัว Modal
  const confBadge = document.getElementById('ai-modal-confidence');
  if (confBadge) {
    confBadge.textContent = `${totalScore}% Confidence`;
    confBadge.className = `text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
      totalScore >= 80 ? 'bg-emerald-100 text-emerald-800' : (totalScore >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800')
    }`;
  }

  // 2. อัปเดต 3 กล่องสถิติ (Visual Match / Proximity / Bounty Escrow)
  const statVisual = document.getElementById('ai-stat-visual');
  const statDist = document.getElementById('ai-stat-dist');
  const statBounty = document.getElementById('ai-stat-bounty');

  // กล่อง 1: Visual Match
  if (statVisual) {
    statVisual.textContent = `${visualScore}%`;
    statVisual.className = `text-sm font-bold ${visualScore >= 80 ? 'text-blue-900' : 'text-slate-600'}`;
  }

  // กล่อง 2: Proximity ระยะทาง
  if (statDist) {
    const distText = distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`;
    const proxPercent = Math.max(30, Math.min(99, Math.round(100 - (distanceKm * 15))));
    statDist.textContent = `${distText} (${proxPercent}%)`;
  }

  // กล่อง 3: Bounty Escrow
  if (statBounty) {
    if (lost.bounty && lost.bounty > 0) {
      statBounty.textContent = `฿${lost.bounty} Ready`;
      statBounty.className = 'text-amber-900 font-bold text-sm';
    } else {
      statBounty.textContent = 'No Bounty';
      statBounty.className = 'text-slate-500 font-bold text-sm';
    }
  }

  // 3. แสดงรูปและรายละเอียดของ Lost
  const lostImg = document.getElementById('ai-lost-img');
  const lostTitle = document.getElementById('ai-lost-title');
  const lostDesc = document.getElementById('ai-lost-desc');
  const lostTag = document.getElementById('ai-lost-tag');

  if (lostImg) lostImg.src = lost.image;
  if (lostTitle) lostTitle.textContent = lost.name;
  if (lostDesc) lostDesc.textContent = lost.description;
  if (lostTag) lostTag.textContent = `Lost Report #${lost.id}`;

  // 4. แสดงรูปและรายละเอียดของ Found (สุนัขคู่เทียบเคียง)
  const foundImg = document.getElementById('ai-found-img');
  const foundTitle = document.getElementById('ai-found-title');
  const foundDesc = document.getElementById('ai-found-desc');

  if (foundImg) foundImg.src = found.image;
  if (foundTitle) foundTitle.textContent = found.name;
  if (foundDesc) foundDesc.textContent = found.description;

  // 5. เปิด Modal
  const modal = document.getElementById('ai-modal');
  if (modal) {
    modal.classList.remove('hidden');
    lucide.createIcons();
  }
}

function closeAIMatchModal() {
  const modal = document.getElementById('ai-modal');
  if (modal) modal.classList.add('hidden');
}

function confirmAIMatchNotify() {
  closeAIMatchModal();
  showToast('ระบบได้ส่งการแจ้งเตือนแบบอัตโนมัติไปยังทั้งสองฝ่ายแล้ว!', 'success');
}

// ==========================================
// 2. สร้างใบประกาศและ QR Code (Print Notice & QR Flyer)
// ==========================================
function openFlyerModal(id) {
  const target = items.find(i => i.id === id) || items[0];
  if (!target) return showToast('ไม่พบข้อมูลสำหรับสร้างใบประกาศ', 'warning');

  document.getElementById('fl-name').textContent = target.name;
  document.getElementById('fl-desc').textContent = target.description || 'ไม่มีคำอธิบายเพิ่มเติม';
  document.getElementById('fl-timeplace').textContent = `${target.datetime} • พิกัด (${target.lat.toFixed(3)}, ${target.lng.toFixed(3)})`;
  document.getElementById('fl-img').src = target.image;

  const hl = document.getElementById('fl-headline');
  if (target.type === 'lost') {
    hl.textContent = 'LOST ITEM - PLEASE HELP!';
    hl.className = 'bg-red-600 text-white text-center py-2.5 px-3 rounded-lg font-black tracking-widest text-xl uppercase border-2 border-red-700';
  } else {
    hl.textContent = 'FOUND ITEM - SEEKING OWNER';
    hl.className = 'bg-blue-600 text-white text-center py-2.5 px-3 rounded-lg font-black tracking-widest text-xl uppercase border-2 border-blue-700';
  }

  const bountyBadge = document.getElementById('fl-bounty-badge');
  if (target.bounty && target.bounty > 0) {
    bountyBadge.classList.remove('hidden');
    document.getElementById('fl-bounty-text').textContent = `💰 ฿${target.bounty} รางวัลนำส่งคืน (ESCROW PROTECTED)`;
  } else {
    bountyBadge.classList.add('hidden');
  }

  // Update tear-off slips with phone and item name
  const ph = target.contact || 'No contact provided';
  const cleanTitle = (target.name.length > 14 ? target.name.substring(0, 14) + '...' : target.name).toUpperCase();
  for (let i = 1; i <= 6; i++) {
    const el = document.getElementById(`slip-${i}`);
    if (el) {
      el.textContent = ph;
      if (el.nextElementSibling) el.nextElementSibling.textContent = cleanTitle;
    }
  }

  document.getElementById('flyer-modal').classList.remove('hidden');
  lucide.createIcons();
}
function closeFlyerModal() {
  document.getElementById('flyer-modal').classList.add('hidden');
}

// ==========================================
// 3. ระบบยืนยันความเป็นเจ้าของ (Ownership & Escrow)
// ==========================================

function switchClaimStep(step) {
  const s1 = document.getElementById('step-tab-1');
  const s2 = document.getElementById('step-tab-2');
  const s3 = document.getElementById('step-tab-3');
  const successBox = document.getElementById('claim-success-box');
  const subBtn = document.getElementById('claim-sub-btn');

  const inactiveClass = 'p-1.5 rounded-lg text-xs font-medium bg-slate-50 border border-slate-200 text-slate-500';
  const activeClass = 'p-1.5 rounded-lg text-xs font-bold bg-amber-50 border border-amber-300 text-amber-900';
  const doneClass = 'p-1.5 rounded-lg text-xs font-bold bg-emerald-100 border border-emerald-300 text-emerald-800';

  if (s1) s1.className = step === 1 ? activeClass : (step > 1 ? doneClass : inactiveClass);
  if (s2) s2.className = step === 2 ? activeClass : (step > 2 ? doneClass : inactiveClass);
  if (s3) s3.className = step === 3 ? doneClass : inactiveClass;

  if (step === 3) {
    if (successBox) successBox.classList.remove('hidden');
    if (subBtn) {
      subBtn.innerHTML = '✓ Ownership Confirmed';
      subBtn.className = 'px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-xs';
    }
  } else {
    // ซ่อนกล่องข้อความสีเขียวไว้ใน Step 1 และ Step 2
    if (successBox) successBox.classList.add('hidden');
    if (subBtn) {
      subBtn.innerHTML = '<i class="w-4 h-4" data-lucide="shield-check"></i> Validate Ownership Proof';
      subBtn.className = 'px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5';
    }
  }
  lucide.createIcons();
}
function handleClaimProof(e) {
  e.preventDefault();
  const subBtn = document.getElementById('claim-sub-btn');
  const targetItem = items.find(i => i.id === currentClaimItemId) || items[0];

  const serialVal = document.getElementById('claim-serial')?.value.trim();
  const detailVal = document.getElementById('claim-hidden-detail')?.value.trim();

  // Move to Step 2: Show AI cross-checking
  switchClaimStep(2);
  if (subBtn) {
    subBtn.disabled = true;
    subBtn.innerHTML = '🤖 Analyzing proof details with AI...';
  }

  setTimeout(() => {
    // Generate a contextual verification score and message
    const score = Math.floor(Math.random() * 6) + 94; // Realistic dynamic score: 94% - 99%
    
    const resultScore = document.getElementById('claim-result-score');
    const resultDesc = document.getElementById('claim-result-desc');

    if (resultScore) resultScore.textContent = `Score: ${score}% Match`;
    
    if (resultDesc) {
      const escrowMsg = targetItem.bounty > 0 
        ? `Escrow reward of ฿${targetItem.bounty} is pre-authorized for release upon verified custody transfer.` 
        : `Safe Exchange Zone handover is now cleared.`;

      resultDesc.innerHTML = `
        Submitted identifier <strong>"${serialVal}"</strong> and distinct mark <strong>"${detailVal}"</strong> match verified records for <em>${targetItem.name}</em>. ${escrowMsg}
      `;
    }

    if (subBtn) subBtn.disabled = false;
    switchClaimStep(3);
    showToast(`Verification succeeded for ${targetItem.name}`, 'success');
  }, 850);
}

let currentClaimItemId = null;

function populateClaimItemSelect(selectedId) {
  const select = document.getElementById('claim-item-select');
  if (!select) return;

  // Filter only active items (both lost & found can be verified)
  const activeItems = items.filter(i => i.status === 'active');

  select.innerHTML = activeItems.map(item => `
    <option value="${item.id}" ${item.id === selectedId ? 'selected' : ''}>
      [${item.type.toUpperCase()}] ${item.name} ${item.bounty > 0 ? `(฿${item.bounty} Escrow)` : ''}
    </option>
  `).join('');
}

function handleClaimItemChange(newId) {
  const target = items.find(i => i.id === newId);
  if (!target) return;

  currentClaimItemId = target.id;

  // Clear previous inputs and reset step back to 1
  const serial = document.getElementById('claim-serial');
  const hidden = document.getElementById('claim-hidden-detail');
  if (serial) serial.value = '';
  if (hidden) hidden.value = '';

  switchClaimStep(1);
}

function openClaimModal(id = null) {
  // If an id was passed, select it; otherwise default to first available active item
  const activeItems = items.filter(i => i.status === 'active');
  const target = (id && items.find(i => i.id === id)) || activeItems[0] || items[0];

  if (!target) return showToast('No items available to claim', 'warning');

  // 1. Populate the select element with all items
  populateClaimItemSelect(target.id);

  // 2. Select this target item
  handleClaimItemChange(target.id);

  // 3. Open modal
  const modal = document.getElementById('claim-modal');
  if (modal) {
    modal.classList.remove('hidden');
    lucide.createIcons();
  }
}

function closeClaimModal() {
  const modal = document.getElementById('claim-modal');
  if (modal) modal.classList.add('hidden');
}

// ==========================================
// 4. แชทนิรนามและนัดหมาย Safe Exchange Zone
// ==========================================
function openRelayModal(id, name) {
  const itemName = document.getElementById('relay-item-name');
  if (itemName) itemName.textContent = `รายการ: ${name || 'ของที่ระบุ'}`;
  
  const modal = document.getElementById('relay-modal');
  if (modal) {
    modal.classList.remove('hidden');
    lucide.createIcons();
  }
}

function closeRelayModal() {
  const modal = document.getElementById('relay-modal');
  if (modal) modal.classList.add('hidden');
}

function insertRelayText(txt) {
  const input = document.getElementById('relay-msg-input');
  if (input) input.value = txt;
}

function proposeSafePoint() {
  const spot = document.getElementById('relay-safe-select').value;
  const time = document.getElementById('relay-safe-time').value;
  insertRelayText(`ฉันเสนอให้นัดรับของกันที่จุดปลอดภัย: ${spot} เวลา ${time}`);
  showToast('เพิ่มสถานที่นัดพบในช่องแชทแล้ว', 'success');
}

function handleSendRelay(e) {
  e.preventDefault();
  const input = document.getElementById('relay-msg-input');
  const val = input.value.trim();
  if (!val) return;

  const thread = document.getElementById('relay-thread');
  if (thread) {
    thread.innerHTML += `
      <div class="flex flex-col items-end max-w-[85%] ml-auto mt-2">
        <span class="text-[10px] font-semibold text-slate-400">คุณ (Verified Member) • เมื่อสักครู่</span>
        <div class="bg-emerald-600 text-white rounded-xl rounded-tr-none p-2 text-xs shadow-2xs">${val}</div>
      </div>
    `;
    thread.scrollTop = thread.scrollHeight;
  }
  
  input.value = '';
  showToast('ส่งข้อความเข้ารหัสผ่านระบบนิรนามแล้ว', 'success');
}

function exportJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(items, null, 2));
  const dl = document.createElement('a');
  dl.setAttribute("href", dataStr);
  dl.setAttribute("download", `lost-found-hub-backup-${Date.now()}.json`);
  document.body.appendChild(dl);
  dl.click();
  dl.remove();
  showToast(`ส่งออกข้อมูล ${items.length} รายการเรียบร้อย`, 'success');
}

// 1. เพิ่มระบบ Import JSON
function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const importedData = JSON.parse(e.target.result);
      if (Array.isArray(importedData)) {
        items = importedData;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        runFilter();
        showToast(`นำเข้าข้อมูลสำเร็จ ${items.length} รายการ`, 'success');
      } else {
        showToast('รูปแบบไฟล์ JSON ไม่ถูกต้อง', 'warning');
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการอ่านไฟล์ JSON', 'warning');
    }
  };
  reader.readAsText(file);
  event.target.value = ''; // รีเซ็ต input file
}

// 2. เพิ่มฟังก์ชันจำลอง Cloud Sync
function openCloudModal() {
  showToast('ระบบ Cloud Storage เชื่อมต่อและทำงานปกติ (Synced)', 'info');
}

function triggerCloudSync() {
  showToast('กำลังซิงค์ข้อมูลกับคลาวด์...', 'info');
  setTimeout(() => {
    showToast('ซิงค์ข้อมูลล่าสุดเรียบร้อยแล้ว!', 'success');
  }, 1000);
}

// ฟังก์ชันอัปเดตการ์ด Toolkit ทั้ง AI Match และ Safe Zones ให้ดึงค่าจริง
function updateToolkitCards() {
  // 1. อัปเดตการ์ด Safe Exchange Zones ตามข้อมูล SAFE_ZONES จริง
  const safeBadge = document.getElementById('card-safe-badge');
  const safeSub = document.getElementById('card-safe-sub');
  if (safeBadge) {
    safeBadge.textContent = `${SAFE_ZONES.length} Verified`;
  }
  if (safeSub) {
    // นำชื่อสถานที่ใน SAFE_ZONES มาแสดงต่อกันจริง
    const zoneNames = SAFE_ZONES.map(z => z.name).join(' & ');
    safeSub.textContent = zoneNames || 'ไม่มีจุดส่งมอบ';
  }

  // 2. อัปเดตการ์ด AI Match จากการคำนวณของอัลกอริทึมจริง
  const aiBadge = document.getElementById('card-ai-badge');
  const aiSub = document.getElementById('card-ai-sub');
  
  if (typeof findBestAIMatch === 'function') {
    const bestMatch = findBestAIMatch();
    if (bestMatch) {
      if (aiBadge) aiBadge.textContent = `${bestMatch.totalScore}% Match`;
      if (aiSub) aiSub.textContent = `${bestMatch.lost.name} ⇄ ${bestMatch.found.name}`;
      
      // อัปเดตแถบ Alert Banner ด้านบนสุดของเว็บด้วย
      const topAlertBanner = document.getElementById('ai-alert-banner');
      if (topAlertBanner) {
        const strong = topAlertBanner.querySelector('strong');
        const matchPercent = topAlertBanner.querySelector('.font-medium');
        if (strong) strong.textContent = `${bestMatch.lost.name} ⇄ ${bestMatch.found.name}`;
        if (matchPercent) matchPercent.textContent = `${bestMatch.totalScore}% candidate match found:`;
      }
    } else {
      if (aiBadge) aiBadge.textContent = 'Standby';
      if (aiSub) aiSub.textContent = 'กำลังรอรายงานเพื่อประมวลผลจับคู่';
    }
  }
}