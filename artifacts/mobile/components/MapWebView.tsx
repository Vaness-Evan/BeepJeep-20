import React, { useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { Platform, StyleSheet, View } from "react-native";
import WebView from "react-native-webview";
import { DriverData, UserCoords } from "@/types";

export interface CommuterLocation {
  commuterId: string;
  commuterName: string;
  lat: number;
  lng: number;
}

export interface RouteCoord {
  lat: number;
  lng: number;
}

export interface MapWebViewRef {
  updateDriver: (data: DriverData) => void;
  removeDriver: (driverId: string) => void;
  setDrivers: (drivers: DriverData[]) => void;
  setUserLocation: (coords: UserCoords, panTo?: boolean) => void;
  panTo: (lat: number, lng: number, zoom?: number) => void;
  setCommuterLocations: (commuters: CommuterLocation[]) => void;
  updateCommuterLocation: (commuter: CommuterLocation) => void;
  removeCommuter: (commuterId: string) => void;
  setFleetRoute: (fleetId: number, coords: RouteCoord[], name: string) => void;
  removeFleetRoute: (fleetId: number) => void;
  setAllRoutes: (routes: { fleetId: number; coords: RouteCoord[]; name: string }[]) => void;
}

interface Props {
  style?: object;
  onMapReady?: () => void;
}

const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin:0;padding:0;box-sizing:border-box; }
    body { width:100%;height:100vh;overflow:hidden; }
    #map { width:100%;height:100vh; }
    .leaflet-control-attribution { font-size:10px; }

    @keyframes destRingA {
      0%   { transform:translate(-50%,-50%) scale(0.6); opacity:0.9; }
      100% { transform:translate(-50%,-50%) scale(3.2); opacity:0; }
    }
    @keyframes destRingB {
      0%   { transform:translate(-50%,-50%) scale(0.6); opacity:0.6; }
      100% { transform:translate(-50%,-50%) scale(2.4); opacity:0; }
    }
    .dest-wrap { position:relative; width:32px; height:32px; }
    .dest-dot {
      position:absolute; top:50%; left:50%;
      transform:translate(-50%,-50%);
      width:11px; height:11px; border-radius:50%;
      background:#f97316; border:2.5px solid #fff;
      box-shadow:0 2px 8px rgba(249,115,22,.55);
      z-index:2;
    }
    .dest-ring {
      position:absolute; top:50%; left:50%;
      width:26px; height:26px; border-radius:50%;
      border:2px solid #f97316;
      animation:destRingA 2s ease-out infinite;
    }
    .dest-ring2 {
      position:absolute; top:50%; left:50%;
      width:22px; height:22px; border-radius:50%;
      border:2px solid rgba(249,115,22,.6);
      animation:destRingB 2s ease-out infinite 0.7s;
    }
    .travel-dot {
      width:13px; height:13px; border-radius:50%;
      background:#fff; border:2.5px solid #f97316;
      box-shadow:0 1px 6px rgba(249,115,22,.7);
    }
  </style>
</head>
<body>
<div id="map"></div>
<script>
(function(){
  var map = L.map('map',{zoomControl:true}).setView([14.5995,120.9842],14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'&copy; OpenStreetMap',maxZoom:19
  }).addTo(map);

  var markers={};
  var commuterMarkers={};
  var userMarker=null;
  var userCircle=null;

  // --- Route state ---
  var storedRoutes={};      // fid -> {coords, name}
  var activeFleets={};      // fid -> {driverId: true, ...}  (non-offline drivers)
  var driverFleetMap={};    // driverId -> fid

  // Displayed layers
  var routeLines={};        // fid -> L.Polyline
  var destMarkers={};       // fid -> L.Marker (pulse at destination)
  var travelMarkers={};     // fid -> L.Marker (moving dot)
  var travelAnims={};       // fid -> {id, progress}

  function jIcon(status){
    var c=status==='available'?'#F97316':status==='full'?'#EF4444':'#9CA3AF';
    return L.divIcon({
      html:'<div style="background:'+c+';width:36px;height:36px;border-radius:50%;border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;"><svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17 4H3C1.9 4 1 4.9 1 6v11h2c0 1.7 1.3 3 3 3s3-1.3 3-3h6c0 1.7 1.3 3 3 3s3-1.3 3-3h2v-5l-3-4h-3zm0 2h2.5l1.9 2.5H17V6zM6 17.5c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zm12 0c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z"/></svg></div>',
      iconSize:[36,36],iconAnchor:[18,18],className:''
    });
  }

  function cIcon(){
    return L.divIcon({
      html:'<div style="background:#8B5CF6;width:30px;height:30px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg></div>',
      iconSize:[30,30],iconAnchor:[15,15],className:''
    });
  }

  function uIcon(){
    return L.divIcon({
      html:'<div style="background:#3B82F6;width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3);"></div>',
      iconSize:[18,18],iconAnchor:[9,9],className:''
    });
  }

  // ---- Route show / hide ----

  function showRoute(fid){
    var r=storedRoutes[fid];
    if(!r||r.coords.length<2) return;
    hideRoute(fid);

    var lls=r.coords.map(function(c){return[c.lat,c.lng];});

    routeLines[fid]=L.polyline(lls,{
      color:'#f97316',weight:5,opacity:0.78,lineJoin:'round',lineCap:'round'
    }).addTo(map).bindPopup('<b>'+r.name+'</b>');

    // Destination pulse
    var dest=r.coords[r.coords.length-1];
    destMarkers[fid]=L.marker([dest.lat,dest.lng],{
      icon:L.divIcon({
        html:'<div class="dest-wrap"><div class="dest-dot"></div><div class="dest-ring"></div><div class="dest-ring2"></div></div>',
        className:'',iconSize:[32,32],iconAnchor:[16,16]
      }),
      zIndexOffset:200
    }).addTo(map);

    // Traveling dot
    travelMarkers[fid]=L.marker([r.coords[0].lat,r.coords[0].lng],{
      icon:L.divIcon({
        html:'<div class="travel-dot"></div>',
        className:'',iconSize:[13,13],iconAnchor:[6,6]
      }),
      zIndexOffset:300
    }).addTo(map);

    var anim={progress:0,id:null};
    travelAnims[fid]=anim;
    var total=r.coords.length;
    // Speed: full loop in ~8 seconds at 60ms interval = 133 steps => step = 1/133
    var step=1/(8000/60);
    anim.id=setInterval(function(){
      if(!travelMarkers[fid]){clearInterval(anim.id);return;}
      anim.progress+=step;
      if(anim.progress>=1) anim.progress=0;
      var pos=anim.progress*(total-1);
      var idx=Math.floor(pos);
      var frac=pos-idx;
      var p1=r.coords[idx];
      var p2=r.coords[Math.min(idx+1,total-1)];
      travelMarkers[fid].setLatLng([p1.lat+(p2.lat-p1.lat)*frac, p1.lng+(p2.lng-p1.lng)*frac]);
    },60);
  }

  function hideRoute(fid){
    if(routeLines[fid]){map.removeLayer(routeLines[fid]);delete routeLines[fid];}
    if(destMarkers[fid]){map.removeLayer(destMarkers[fid]);delete destMarkers[fid];}
    if(travelMarkers[fid]){map.removeLayer(travelMarkers[fid]);delete travelMarkers[fid];}
    if(travelAnims[fid]){clearInterval(travelAnims[fid].id);delete travelAnims[fid];}
  }

  function checkFleetVisibility(fid){
    var hasActive=activeFleets[fid]&&Object.keys(activeFleets[fid]).length>0;
    if(hasActive){
      if(!routeLines[fid]&&storedRoutes[fid]) showRoute(fid);
    } else {
      hideRoute(fid);
    }
  }

  // ---- Driver tracking ----

  function updateDriver(d){
    var did=String(d.driverId);
    var fid=d.fleetId!=null?String(d.fleetId):null;

    // Fleet visibility tracking
    if(fid){
      var prevFid=driverFleetMap[did];
      // If driver changed fleet, remove from old fleet
      if(prevFid&&prevFid!==fid){
        if(activeFleets[prevFid]) delete activeFleets[prevFid][did];
        checkFleetVisibility(prevFid);
      }
      driverFleetMap[did]=fid;
      if(!activeFleets[fid]) activeFleets[fid]={};
      if(d.status!=='offline'){
        activeFleets[fid][did]=true;
      } else {
        delete activeFleets[fid][did];
      }
      checkFleetVisibility(fid);
    }

    // Map marker
    if(d.status==='offline'){
      if(markers[did]){map.removeLayer(markers[did]);delete markers[did];}
      return;
    }
    var fleet=d.fleetName?('<br/><span style="color:#6B7280;font-size:11px;">Fleet: '+d.fleetName+'</span>'):'';
    var lbl='<b>'+(d.driverName||'Driver')+'</b>'+fleet+'<br/>'+d.route+'<br/>Status: '+d.status+'<br/>Passengers: '+(d.passengerCount||0)+'<br/>Fare: \u20b1'+(d.totalFare||0);
    if(markers[did]){
      markers[did].setLatLng([d.lat,d.lng]);
      markers[did].setIcon(jIcon(d.status));
      markers[did].getPopup()&&markers[did].setPopupContent(lbl);
    } else {
      markers[did]=L.marker([d.lat,d.lng],{icon:jIcon(d.status)}).addTo(map).bindPopup(lbl);
    }
  }

  function removeDriver(id){
    var did=String(id);
    var fid=driverFleetMap[did];
    if(fid){
      delete driverFleetMap[did];
      if(activeFleets[fid]) delete activeFleets[fid][did];
      checkFleetVisibility(fid);
    }
    if(markers[did]){map.removeLayer(markers[did]);delete markers[did];}
  }

  function updateCommuter(c){
    var lbl='<b>'+(c.commuterName||'Passenger')+'</b><br/>Requesting ride';
    if(commuterMarkers[c.commuterId]){
      commuterMarkers[c.commuterId].setLatLng([c.lat,c.lng]);
    } else {
      commuterMarkers[c.commuterId]=L.marker([c.lat,c.lng],{icon:cIcon()}).addTo(map).bindPopup(lbl);
    }
  }

  function removeCommuter(id){
    if(commuterMarkers[id]){map.removeLayer(commuterMarkers[id]);delete commuterMarkers[id];}
  }

  function setUserLoc(lat,lng,pan){
    if(userMarker){userMarker.setLatLng([lat,lng]);userCircle.setLatLng([lat,lng]);}
    else{
      userMarker=L.marker([lat,lng],{icon:uIcon()}).addTo(map).bindPopup('You');
      userCircle=L.circle([lat,lng],{radius:50,color:'#3B82F6',fillOpacity:.15,weight:2}).addTo(map);
    }
    if(pan) map.setView([lat,lng],16);
  }

  function setFleetRoute(fleetId,coords,name){
    var fid=String(fleetId);
    storedRoutes[fid]={coords:coords,name:name};
    checkFleetVisibility(fid);
  }

  function removeFleetRoute(fleetId){
    var fid=String(fleetId);
    delete storedRoutes[fid];
    delete activeFleets[fid];
    hideRoute(fid);
  }

  function handleMsg(e){
    try{
      var msg=JSON.parse(typeof e.data==='string'?e.data:JSON.stringify(e.data));
      if(msg.type==='UPDATE_DRIVER') updateDriver(msg.data);
      else if(msg.type==='REMOVE_DRIVER') removeDriver(msg.driverId);
      else if(msg.type==='SET_DRIVERS'){
        // First clear all active fleet tracking, then re-add
        Object.keys(activeFleets).forEach(function(fid){ activeFleets[fid]={}; });
        msg.drivers.forEach(updateDriver);
        // Hide routes for fleets that have no active drivers after re-add
        Object.keys(storedRoutes).forEach(function(fid){ checkFleetVisibility(fid); });
      }
      else if(msg.type==='USER_LOCATION') setUserLoc(msg.lat,msg.lng,msg.panTo);
      else if(msg.type==='PAN_TO') map.setView([msg.lat,msg.lng],msg.zoom||15);
      else if(msg.type==='SET_COMMUTERS'){
        Object.keys(commuterMarkers).forEach(function(id){
          if(commuterMarkers[id]){map.removeLayer(commuterMarkers[id]);delete commuterMarkers[id];}
        });
        msg.commuters.forEach(updateCommuter);
      }
      else if(msg.type==='UPDATE_COMMUTER') updateCommuter(msg.data);
      else if(msg.type==='REMOVE_COMMUTER') removeCommuter(msg.commuterId);
      else if(msg.type==='SET_FLEET_ROUTE') setFleetRoute(msg.fleetId,msg.coords,msg.name);
      else if(msg.type==='REMOVE_FLEET_ROUTE') removeFleetRoute(msg.fleetId);
      else if(msg.type==='SET_ALL_ROUTES'){
        Object.keys(storedRoutes).forEach(function(fid){ hideRoute(fid); });
        storedRoutes={};
        msg.routes.forEach(function(r){ setFleetRoute(r.fleetId,r.coords,r.name); });
      }
    }catch(err){}
  }

  document.addEventListener('message',handleMsg);
  window.addEventListener('message',handleMsg);

  map.on('load',function(){
    window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'MAP_READY'}));
  });
  setTimeout(function(){
    window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'MAP_READY'}));
  },500);
})();
</script>
</body>
</html>`;

const MapWebView = forwardRef<MapWebViewRef, Props>(({ style, onMapReady }, ref) => {
  const webViewRef = useRef<WebView>(null);

  const inject = useCallback((script: string) => {
    webViewRef.current?.injectJavaScript(script + ";true;");
  }, []);

  useImperativeHandle(ref, () => ({
    updateDriver(data: DriverData) {
      inject(`handleMsg({data:JSON.stringify({type:'UPDATE_DRIVER',data:${JSON.stringify(data)}})})`);
    },
    removeDriver(driverId: string) {
      inject(`handleMsg({data:JSON.stringify({type:'REMOVE_DRIVER',driverId:'${driverId}'})})`);
    },
    setDrivers(drivers: DriverData[]) {
      inject(`handleMsg({data:JSON.stringify({type:'SET_DRIVERS',drivers:${JSON.stringify(drivers)}})})`);
    },
    setUserLocation(coords: UserCoords, panTo = false) {
      inject(`handleMsg({data:JSON.stringify({type:'USER_LOCATION',lat:${coords.lat},lng:${coords.lng},panTo:${panTo}})})`);
    },
    panTo(lat: number, lng: number, zoom = 15) {
      inject(`handleMsg({data:JSON.stringify({type:'PAN_TO',lat:${lat},lng:${lng},zoom:${zoom}})})`);
    },
    setCommuterLocations(commuters: CommuterLocation[]) {
      inject(`handleMsg({data:JSON.stringify({type:'SET_COMMUTERS',commuters:${JSON.stringify(commuters)}})})`);
    },
    updateCommuterLocation(commuter: CommuterLocation) {
      inject(`handleMsg({data:JSON.stringify({type:'UPDATE_COMMUTER',data:${JSON.stringify(commuter)}})})`);
    },
    removeCommuter(commuterId: string) {
      inject(`handleMsg({data:JSON.stringify({type:'REMOVE_COMMUTER',commuterId:'${commuterId}'})})`);
    },
    setFleetRoute(fleetId: number, coords: RouteCoord[], name: string) {
      inject(`handleMsg({data:JSON.stringify({type:'SET_FLEET_ROUTE',fleetId:${fleetId},coords:${JSON.stringify(coords)},name:${JSON.stringify(name)}})})`);
    },
    removeFleetRoute(fleetId: number) {
      inject(`handleMsg({data:JSON.stringify({type:'REMOVE_FLEET_ROUTE',fleetId:${fleetId}})})`);
    },
    setAllRoutes(routes: { fleetId: number; coords: RouteCoord[]; name: string }[]) {
      inject(`handleMsg({data:JSON.stringify({type:'SET_ALL_ROUTES',routes:${JSON.stringify(routes)}})})`);
    },
  }));

  function onMessage(e: { nativeEvent: { data: string } }) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "MAP_READY") onMapReady?.();
    } catch {}
  }

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, style]}>
        <iframe
          srcDoc={MAP_HTML}
          style={{ width: "100%", height: "100%", border: "none" }}
          sandbox="allow-scripts allow-same-origin"
        />
      </View>
    );
  }

  return (
    <WebView
      ref={webViewRef}
      source={{ html: MAP_HTML }}
      style={[styles.container, style]}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      bounces={false}
      allowsInlineMediaPlayback
      originWhitelist={["*"]}
    />
  );
});

MapWebView.displayName = "MapWebView";
export default MapWebView;

const styles = StyleSheet.create({
  container: { flex: 1 },
});
