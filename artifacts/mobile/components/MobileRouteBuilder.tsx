import React, { useRef, useEffect, useCallback } from "react";
import { Platform, StyleSheet, View } from "react-native";
import WebView from "react-native-webview";

export interface Waypoint { lat: number; lng: number; }

interface Props {
  fleetName: string;
  initialName?: string;
  initialWaypoints?: Waypoint[];
  initialRouteCoords?: Waypoint[];
  onSave: (name: string, waypoints: Waypoint[], routeCoords: Waypoint[]) => void;
  onCancel: () => void;
}

function buildHtml(fleetName: string, initialName: string, initialWaypoints: Waypoint[], initialRouteCoords: Waypoint[]) {
  const escapedName = initialName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const waypointsJson = JSON.stringify(initialWaypoints);
  const coordsJson = JSON.stringify(initialRouteCoords);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f8f8f8;overflow:hidden;}
#top{position:fixed;top:0;left:0;right:0;z-index:1000;background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 12px;display:flex;flex-direction:column;gap:8px;}
#nameRow{display:flex;align-items:center;gap:8px;}
#routeNameInput{flex:1;border:1px solid #d1d5db;border-radius:8px;padding:7px 10px;font-size:14px;font-weight:600;color:#111;outline:none;}
#routeNameInput:focus{border-color:#f97316;}
#searchWrap{position:relative;}
#searchInput{width:100%;border:1px solid #d1d5db;border-radius:8px;padding:7px 10px 7px 30px;font-size:13px;color:#111;outline:none;box-sizing:border-box;}
#searchInput:focus{border-color:#f97316;}
#searchIcon{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:#9ca3af;font-size:13px;pointer-events:none;}
#searchSpinner{display:none;position:absolute;right:9px;top:50%;transform:translateY(-50%);width:13px;height:13px;border:2px solid #e5e7eb;border-top-color:#f97316;border-radius:50%;animation:spin .6s linear infinite;}
@keyframes spin{to{transform:translateY(-50%) rotate(360deg);}}
#searchResults{display:none;position:absolute;top:calc(100% + 3px);left:0;right:0;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,.12);z-index:3000;overflow:hidden;}
.sr{padding:9px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid #f3f4f6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;-webkit-tap-highlight-color:transparent;}
.sr:last-child{border-bottom:none;}
.sr:active{background:#fef3e2;}
.srn{color:#111;font-weight:600;}
.srs{color:#9ca3af;font-size:11px;margin-left:4px;}
#map{position:fixed;top:108px;bottom:56px;left:0;right:0;}
#hint{position:fixed;top:116px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,.95);border:1px solid #fed7aa;border-radius:20px;padding:5px 14px;font-size:12px;font-weight:700;color:#ea580c;z-index:900;display:flex;align-items:center;gap:6px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.1);}
#pinBadge{position:fixed;top:116px;right:10px;background:rgba(255,255,255,.95);border:1px solid #fed7aa;border-radius:12px;padding:3px 10px;font-size:12px;font-weight:700;color:#ea580c;z-index:900;display:none;}
#snapBadge{position:fixed;top:148px;right:10px;background:rgba(255,255,255,.95);border:1px solid #e5e7eb;border-radius:12px;padding:3px 10px;font-size:11px;color:#6b7280;z-index:900;display:none;align-items:center;gap:4px;}
#bottom{position:fixed;bottom:0;left:0;right:0;height:56px;background:#fff;border-top:1px solid #e5e7eb;display:flex;align-items:center;padding:0 10px;gap:7px;z-index:1000;}
.btn{border:none;border-radius:10px;padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;-webkit-tap-highlight-color:transparent;}
#undoBtn{background:#f3f4f6;color:#374151;flex-shrink:0;}
#clearBtn{background:#fee2e2;color:#dc2626;flex-shrink:0;}
#saveBtn{background:#f97316;color:#fff;flex:1;justify-content:center;}
#cancelBtn{background:#f3f4f6;color:#374151;flex-shrink:0;}
#saveBtn:disabled{opacity:0.45;cursor:default;}
</style>
</head>
<body>
<div id="top">
  <div id="nameRow">
    <input id="routeNameInput" type="text" value="${escapedName}" placeholder="Route name (e.g. Calauag to Lopez)"/>
  </div>
  <div id="searchWrap">
    <span id="searchIcon">&#128269;</span>
    <input id="searchInput" type="text" placeholder="Search a place to navigate there…"/>
    <div id="searchSpinner"></div>
    <div id="searchResults"></div>
  </div>
</div>
<div id="map"></div>
<div id="hint">&#128205; Tap map to place route pins</div>
<div id="pinBadge"></div>
<div id="snapBadge">&#9851; Snapping to roads…</div>
<div id="bottom">
  <button class="btn" id="undoBtn">&#8617; Undo</button>
  <button class="btn" id="clearBtn">&#128465; Clear</button>
  <button class="btn" id="saveBtn" disabled>&#128190; Save Route</button>
  <button class="btn" id="cancelBtn">&#10005;</button>
</div>
<script>
(function(){
var map=L.map('map',{zoomControl:true}).setView([13.9236,122.0794],13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&#169; OpenStreetMap',maxZoom:19}).addTo(map);

var waypoints=${waypointsJson};
var routeCoords=${coordsJson};
var pinMarkers=[];
var polyline=null;
var snapping=false;
var searchTimeout=null;

function postMsg(obj){
  var s=JSON.stringify(obj);
  try{if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(s);return;}}catch(e){}
  try{if(window.parent&&window.parent!==window){window.parent.postMessage(s,'*');return;}}catch(e){}
}

function makePin(idx){
  return L.divIcon({
    html:'<div style="width:28px;height:28px;border-radius:50% 50% 50% 4px;background:#f97316;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:11px;font-weight:700;color:white;">'+(idx+1)+'</span></div>',
    className:'',iconSize:[28,28],iconAnchor:[14,24]
  });
}

function updateUI(){
  pinMarkers.forEach(function(m){map.removeLayer(m);});
  pinMarkers=[];
  waypoints.forEach(function(wp,i){
    var m=L.marker([wp.lat,wp.lng],{icon:makePin(i)}).addTo(map).bindPopup('Pin '+(i+1));
    pinMarkers.push(m);
  });
  var badge=document.getElementById('pinBadge');
  if(waypoints.length>0){badge.textContent=waypoints.length+' pin'+(waypoints.length!==1?'s':'');badge.style.display='block';}
  else{badge.style.display='none';}
  document.getElementById('hint').style.display=waypoints.length===0?'flex':'none';
  document.getElementById('saveBtn').disabled=waypoints.length<2||snapping;
}

function updatePoly(){
  if(polyline){map.removeLayer(polyline);polyline=null;}
  if(routeCoords.length>1){
    polyline=L.polyline(routeCoords.map(function(c){return[c.lat,c.lng];}),{color:'#f97316',weight:5,opacity:.85,lineJoin:'round',lineCap:'round'}).addTo(map);
  }
}

function snapRoute(){
  if(waypoints.length<2){routeCoords=[];updatePoly();snapping=false;updateUI();return;}
  snapping=true;
  document.getElementById('snapBadge').style.display='flex';
  document.getElementById('saveBtn').disabled=true;
  var coords=waypoints.map(function(w){return w.lng+','+w.lat;}).join(';');
  fetch('https://router.project-osrm.org/route/v1/driving/'+coords+'?geometries=geojson&overview=full')
    .then(function(r){return r.json();})
    .then(function(data){
      var geom=(data&&data.routes&&data.routes[0]&&data.routes[0].geometry&&data.routes[0].geometry.coordinates)||[];
      routeCoords=geom.map(function(c){return{lat:c[1],lng:c[0]};});
    })
    .catch(function(){routeCoords=waypoints.slice();})
    .finally(function(){
      snapping=false;
      document.getElementById('snapBadge').style.display='none';
      updatePoly();
      updateUI();
    });
}

map.on('click',function(e){
  waypoints.push({lat:e.latlng.lat,lng:e.latlng.lng});
  updateUI();
  snapRoute();
});

document.getElementById('undoBtn').addEventListener('click',function(){
  if(!waypoints.length)return;
  waypoints.pop();
  updateUI();
  snapRoute();
});

document.getElementById('clearBtn').addEventListener('click',function(){
  waypoints=[];routeCoords=[];
  updateUI();updatePoly();
});

document.getElementById('saveBtn').addEventListener('click',function(){
  var name=document.getElementById('routeNameInput').value.trim();
  if(!name){alert('Please enter a route name.');return;}
  if(waypoints.length<2){alert('Place at least 2 pins.');return;}
  postMsg({type:'ROUTE_SAVED',name:name,waypoints:waypoints,routeCoords:routeCoords});
});

document.getElementById('cancelBtn').addEventListener('click',function(){
  postMsg({type:'ROUTE_CANCEL'});
});

var searchInput=document.getElementById('searchInput');
var searchResults=document.getElementById('searchResults');
var searchSpinner=document.getElementById('searchSpinner');

searchInput.addEventListener('input',function(){
  var q=searchInput.value.trim();
  searchResults.style.display='none';
  if(!q)return;
  if(searchTimeout)clearTimeout(searchTimeout);
  searchTimeout=setTimeout(function(){
    searchSpinner.style.display='block';
    fetch('https://nominatim.openstreetmap.org/search?q='+encodeURIComponent(q)+'&format=json&limit=5',{headers:{'Accept-Language':'en'}})
      .then(function(r){return r.json();})
      .then(function(data){
        searchResults.innerHTML='';
        if(!data||!data.length){searchResults.style.display='none';return;}
        data.forEach(function(item){
          var div=document.createElement('div');
          div.className='sr';
          var parts=item.display_name.split(',');
          var b=document.createElement('span');b.className='srn';b.textContent=parts[0]||'';
          var s=document.createElement('span');s.className='srs';s.textContent=(parts[1]||'')+(parts[2]?','+parts[2]:'');
          div.appendChild(b);div.appendChild(s);
          div.addEventListener('click',function(){
            map.setView([parseFloat(item.lat),parseFloat(item.lon)],15);
            searchInput.value=parts[0]||'';
            searchResults.style.display='none';
          });
          searchResults.appendChild(div);
        });
        searchResults.style.display='block';
      })
      .catch(function(){searchResults.style.display='none';})
      .finally(function(){searchSpinner.style.display='none';});
  },500);
});

document.addEventListener('click',function(e){
  if(!searchResults.contains(e.target)&&e.target!==searchInput)searchResults.style.display='none';
});

if(waypoints.length>0||routeCoords.length>0){
  updateUI();updatePoly();
  var pts=routeCoords.length>1?routeCoords:waypoints;
  if(pts.length>1){
    try{map.fitBounds(L.latLngBounds(pts.map(function(c){return[c.lat,c.lng];})),{padding:[40,40]});}catch(e){}
  }
}
})();
</script>
</body>
</html>`;
}

export default function MobileRouteBuilder({
  fleetName, initialName, initialWaypoints = [], initialRouteCoords = [], onSave, onCancel,
}: Props) {
  const webViewRef = useRef<WebView>(null);
  const resolvedName = initialName ?? `${fleetName} Route`;
  const html = buildHtml(fleetName, resolvedName, initialWaypoints, initialRouteCoords);

  const handleMessage = useCallback((e: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "ROUTE_SAVED") onSave(msg.name, msg.waypoints, msg.routeCoords);
      else if (msg.type === "ROUTE_CANCEL") onCancel();
    } catch {}
  }, [onSave, onCancel]);

  const handleWebMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "ROUTE_SAVED") onSave(msg.name, msg.waypoints, msg.routeCoords);
      else if (msg.type === "ROUTE_CANCEL") onCancel();
    } catch {}
  }, [onSave, onCancel]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    window.addEventListener("message", handleWebMessage);
    return () => window.removeEventListener("message", handleWebMessage);
  }, [handleWebMessage]);

  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        <iframe
          srcDoc={html}
          style={{ width: "100%", height: "100%", border: "none" }}
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      </View>
    );
  }

  return (
    <WebView
      ref={webViewRef}
      source={{ html }}
      style={styles.container}
      onMessage={handleMessage}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      bounces={false}
      allowsInlineMediaPlayback
      originWhitelist={["*"]}
      mixedContentMode="always"
    />
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
