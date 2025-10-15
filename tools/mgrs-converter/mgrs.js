
// mgrs.js — Interactive MGRS converter (WGS84). Verbose yet simple.
(function(){
  document.getElementById('backToDashboard')?.addEventListener('click', ()=>{ window.location.href='../../index.html'; });

  const latIn = document.getElementById('lat');
  const lonIn = document.getElementById('lon');
  const precisionSlider = document.getElementById('precision');
  const precisionLabel = document.getElementById('precisionLabel');
  const mgrsOut = document.getElementById('mgrsOut');
  const explainLL2M = document.getElementById('explainLL2M');

  const mgrsIn = document.getElementById('mgrsIn');
  const latOut = document.getElementById('latOut');
  const lonOut = document.getElementById('lonOut');
  const explainM2LL = document.getElementById('explainM2LL');

  precisionSlider.addEventListener('input', ()=>{
    const map = {1:'10 km',2:'1 km',3:'100 m',4:'10 m',5:'1 m'};
    precisionLabel.textContent = `${precisionSlider.value} (${map[precisionSlider.value]})`;
    convertLL2M();
  });
  [latIn, lonIn].forEach(el=> el.addEventListener('input', convertLL2M));
  mgrsIn.addEventListener('input', convertM2LL);

  // --- Constants (WGS84) ---
  const a = 6378137.0; // semi-major
  const f = 1/298.257223563; // flattening
  const e2 = f*(2-f); // eccentricity squared
  const k0 = 0.9996; // UTM scale factor

  // Latitude bands (letter -> min lat)
  const bandLetters = ['C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','X'];
  const bandMins = [-80,-72,-64,-56,-48,-40,-32,-24,-16,-8,0,8,16,24,32,40,48,56,64,72];

  const eastingSets = ['ABCDEFGH','JKLMNPQR','STUVWXYZ']; // skip I,O
  const northingSet = 'ABCDEFGHJKLMNPQRSTUV'; // 20 letters, skip I,O

  function toRadians(d){ return d*Math.PI/180; }
  function toDegrees(r){ return r*180/Math.PI; }

  function zoneFromLon(lon){ return Math.floor((lon + 180)/6) + 1; }
  function centralMeridian(zone){ return -183 + 6*zone; }
  function bandFromLat(lat){ for(let i=bandLetters.length-1;i>=0;i--){ if(lat>=bandMins[i]) return bandLetters[i]; } return 'C'; }

  // Forward: Lat/Lon -> UTM
  function latLonToUTM(lat, lon){
    const zone = zoneFromLon(lon);
    const lam0 = toRadians(centralMeridian(zone));
    const phi = toRadians(lat); const lam = toRadians(lon);
    const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
    const N = a / Math.sqrt(1 - e2*sinPhi*sinPhi);
    const T = Math.tan(phi)**2;
    const C = (e2/(1-e2)) * cosPhi*cosPhi;
    const A = (lam - lam0) * cosPhi;
    // Meridional arc (Snyder)
    const e4 = e2*e2; const e6 = e4*e2;
    const M = a*( (1 - e2/4 - 3*e4/64 - 5*e6/256)*phi
                - (3*e2/8 + 3*e4/32 + 45*e6/1024)*Math.sin(2*phi)
                + (15*e4/256 + 45*e6/1024)*Math.sin(4*phi)
                - (35*e6/3072)*Math.sin(6*phi) );
    const easting = k0*N*( A + (1-T+C)*A**3/6 + (5 - 18*T + T*T + 72*C - 58*(e2/(1-e2)) )*A**5/120 ) + 500000;
    let northing = k0*( M + N*Math.tan(phi)*( A*A/2 + (5 - T + 9*C + 4*C*C)*A**4/24 + (61 - 58*T + T*T + 600*C - 330*(e2/(1-e2)) )*A**6/720 ) );
    const south = lat < 0; if (south) northing += 10000000; // false northing
    return {zone, easting, northing, south};
  }

  // Backward: UTM -> Lat/Lon
  function utmToLatLon(zone, easting, northing, south){
    const lam0 = toRadians(centralMeridian(zone));
    const M = northing / k0;
    const e4 = e2*e2; const e6 = e4*e2;
    const mu = M / (a*(1 - e2/4 - 3*e4/64 - 5*e6/256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const J1 = 3*e1/2 - 27*e1**3/32;
    const J2 = 21*e1*e1/16 - 55*e1**4/32;
    const J3 = 151*e1**3/96;
    const J4 = 1097*e1**4/512;
    const fp = mu + J1*Math.sin(2*mu) + J2*Math.sin(4*mu) + J3*Math.sin(6*mu) + J4*Math.sin(8*mu);
    const sinfp = Math.sin(fp), cosfp = Math.cos(fp);
    const C1 = (e2/(1-e2)) * cosfp*cosfp;
    const T1 = Math.tan(fp)**2;
    const N1 = a/Math.sqrt(1 - e2*sinfp*sinfp);
    const R1 = N1*(1 - e2)/(1 - e2*sinfp*sinfp);
    const D = (easting - 500000)/(N1*k0);
    const lat = toDegrees(fp - (N1*Math.tan(fp)/R1)*( D*D/2 - (5 + 3*T1 + 10*C1 - 4*C1*C1 - 9*(e2/(1-e2)))*D**4/24 + (61 + 90*T1 + 298*C1 + 45*T1*T1 - 252*(e2/(1-e2)) - 3*C1*C1)*D**6/720));
    const lon = toDegrees(lam0 + ( D - (1 + 2*T1 + C1)*D**3/6 + (5 - 2*C1 + 28*T1 - 3*C1*C1 + 8*(e2/(1-e2)) + 24*T1*T1)*D**5/120 )/cosfp);
    return {lat, lon};
  }

  // 100k grid square letters
  function gridLetters(zone, easting, northing){
    const setEast = eastingSets[(zone-1)%3];
    const e100k = Math.floor(easting/100000) % 8; // 0..7
    const eastLetter = setEast[e100k];
    const rowOffset = (zone%2===0)?0:5; // odd zones offset by 5
    const n100k = Math.floor(northing/100000);
    const northLetter = northingSet[(n100k + rowOffset) % 20];
    return {eastLetter, northLetter};
  }

  function formatMGRS(zone, band, easting, northing, precision){
    const {eastLetter, northLetter} = gridLetters(zone, easting, northing);
    const eR = Math.floor(easting % 100000);
    const nR = Math.floor(northing % 100000);
    const scale = Math.pow(10, 5 - precision);
    const eRounded = Math.floor(eR/scale);
    const nRounded = Math.floor(nR/scale);
    const pad = (num, len) => num.toString().padStart(len, '0');
    const digits = precision;
    return `${zone}${band} ${eastLetter}${northLetter} ${pad(eRounded, digits)} ${pad(nRounded, digits)}`;
  }

  function convertLL2M(){
    const lat = parseFloat(latIn.value); const lon = parseFloat(lonIn.value); const precision = parseInt(precisionSlider.value, 10);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) { mgrsOut.value=''; explainLL2M.textContent=''; return; }
    if (lat < -80 || lat > 84) { mgrsOut.value=''; explainLL2M.textContent='Latitude out of MGRS band range (-80..84).'; return; }
    const band = bandFromLat(lat);
    const utm = latLonToUTM(lat, lon);
    const mgrs = formatMGRS(utm.zone, band, utm.easting, utm.northing, precision);
    mgrsOut.value = mgrs;
    explainLL2M.textContent = [
      `Zone: ${utm.zone} (central meridian ${centralMeridian(utm.zone)}°)`,
      `Band: ${band} (latitude ${lat.toFixed(6)}°)`,
      `UTM Easting: ${utm.easting.toFixed(3)} m`,
      `UTM Northing: ${utm.northing.toFixed(3)} m ${utm.south?'(S hemisphere, includes 10,000,000 m false northing)':''}`,
      `100k Grid: ${gridLetters(utm.zone, utm.easting, utm.northing).eastLetter}${gridLetters(utm.zone, utm.easting, utm.northing).northLetter}`,
      `Precision: ${precision} digits (1→10 km, 2→1 km, 3→100 m, 4→10 m, 5→1 m)`
    ].join('
');
  }

  // --- Parse MGRS and convert back ---
  function parseMGRS(str){
    if (!str) return null;
    const s = str.replace(/\s+/g,'').toUpperCase();
    const m = s.match(/^([0-9]{1,2})([C-HJ-NP-X])([A-HJ-NP-Z]{2})([0-9]{2,10})$/);
    if (!m) return null;
    const zone = parseInt(m[1],10);
    const band = m[2];
    const sq = m[3];
    const digits = m[4];
    if (zone<1||zone>60) return null;
    const precision = Math.floor(digits.length/2);
    const eDigits = digits.slice(0,precision);
    const nDigits = digits.slice(precision);
    return { zone, band, sq, eDigits, nDigits, precision };
  }

  function squareBase(zone, eastLetter, northLetter){
    const setEast = eastingSets[(zone-1)%3];
    const eIndex = setEast.indexOf(eastLetter);
    if (eIndex<0) return null;
    const rowOffset = (zone%2===0)?0:5;
    const nIndex = northingSet.indexOf(northLetter);
    if (nIndex<0) return null;
    // Base easting/northing of the 100k square within the zone
    const eBase = (eIndex+1)*100000;
    // Find northing base consistent with rowOffset
    let nBase = 0;
    // We seek a northing so that (floor(nBase/100000) + rowOffset) % 20 == nIndex
    // Choose the smallest such northing >= 0
    for (let k=0;k<20;k++){
      if ( ((k + rowOffset) % 20) === nIndex ) { nBase = k*100000; break; }
    }
    return {eBase, nBase};
  }

  function mgrsToUTM(mgrs){
    const zone = mgrs.zone; const band = mgrs.band; const eastLetter = mgrs.sq[0]; const northLetter = mgrs.sq[1];
    const base = squareBase(zone, eastLetter, northLetter);
    if (!base) return null;
    const scale = Math.pow(10, 5 - mgrs.precision);
    const eOffset = parseInt(mgrs.eDigits,10) * scale;
    const nOffset = parseInt(mgrs.nDigits,10) * scale;
    let easting = base.eBase + eOffset;
    let northing = base.nBase + nOffset;
    // Adjust northing into the latitude band: add 2,000,000 m blocks until within band range
    const latBandIndex = bandLetters.indexOf(band);
    const minLat = bandMins[latBandIndex];
    const south = (latBandIndex <= bandLetters.indexOf('M')); // crude: bands N and above considered north; this is used only for flag
    // Compute UTM northing at band minimum latitude
    const utmAtBandMin = latLonToUTM(minLat, centralMeridian(zone));
    let minNorthing = utmAtBandMin.northing;
    if (minLat < 0) { // southern hemisphere bands
      // Normalize: UTM routine included false northing already for negatives
    }
    while (northing < minNorthing) northing += 2000000;
    // If northing overshoots beyond band + 8°, keep within plausible range
    const utmAtBandMax = latLonToUTM(Math.min(minLat+8,84), centralMeridian(zone));
    const maxNorthing = utmAtBandMax.northing;
    while (northing >= maxNorthing) northing -= 2000000;
    return {zone, easting, northing, south: minLat<0};
  }

  function convertM2LL(){
    const parsed = parseMGRS(mgrsIn.value);
    if (!parsed){ latOut.value=''; lonOut.value=''; explainM2LL.textContent='Enter MGRS like 55HFA1234567890 or with spaces.'; return; }
    const utm = mgrsToUTM(parsed);
    if (!utm){ latOut.value=''; lonOut.value=''; explainM2LL.textContent='Invalid 100k grid letters for this zone.'; return; }
    const ll = utmToLatLon(utm.zone, utm.easting, utm.northing, utm.south);
    latOut.value = ll.lat.toFixed(6);
    lonOut.value = ll.lon.toFixed(6);
    explainM2LL.textContent = [
      `Zone: ${utm.zone} (central meridian ${centralMeridian(utm.zone)}°)`,
      `UTM Easting: ${utm.easting.toFixed(3)} m`,
      `UTM Northing: ${utm.northing.toFixed(3)} m ${utm.south?'(S hemisphere)':'(N hemisphere)'}`,
      `Computed Latitude/Longitude (WGS84): ${ll.lat.toFixed(6)}°, ${ll.lon.toFixed(6)}°`,
      `Precision interpreted: ${parsed.precision} digits → ${['10 km','1 km','100 m','10 m','1 m'][parsed.precision-1]}`
    ].join('
');
  }

})();
