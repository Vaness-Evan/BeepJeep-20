import React, { useRef, useCallback, forwardRef, useImperativeHandle, useEffect } from "react";
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
  setRoute: (routeId: number, coords: RouteCoord[], name: string) => void;
  removeRoute: (routeId: number) => void;
  setAllRoutes: (routes: { routeId: number; coords: RouteCoord[]; name: string }[]) => void;
  /** @deprecated use setRoute */
  setFleetRoute: (fleetId: number, coords: RouteCoord[], name: string) => void;
  /** @deprecated use removeRoute */
  removeFleetRoute: (fleetId: number) => void;
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
    .j-icon {
      border-radius:50%;border:3px solid white;
      box-shadow:0 2px 10px rgba(0,0,0,.35);
      display:flex;align-items:center;justify-content:center;
    }
    .c-icon {
      background:#3B82F6;border-radius:50%;border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,.3);
      display:flex;align-items:center;justify-content:center;
    }
    .u-icon {
      background:#3B82F6;border-radius:50%;border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,.3);
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

  // Routes keyed by routeId (string). Each route is independent.
  var storedRoutes={};    // routeId -> {coords, name}
  var activeRoutes={};    // routeId -> {driverId: true, ...}
  var driverRouteMap={};  // driverId -> routeId

  var routeLines={};
  var destMarkers={};
  var travelMarkers={};
  var travelAnims={};

  // Palette for multi-route coloring
  var ROUTE_COLORS=['#f97316','#3B82F6','#22c55e','#a855f7','#ef4444','#eab308','#06b6d4','#ec4899'];
  var routeColorIdx={};
  var nextColorIdx=0;
  function getRouteColor(rid){
    if(routeColorIdx[rid]==null){routeColorIdx[rid]=nextColorIdx%ROUTE_COLORS.length;nextColorIdx++;}
    return ROUTE_COLORS[routeColorIdx[rid]];
  }

  function jIcon(status){
    var c=status==='available'?'#F97316':status==='full'?'#EF4444':'#9CA3AF';
    return L.divIcon({
      html:'<div class="j-icon" style="background:'+c+';width:36px;height:36px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17 4H3C1.9 4 1 4.9 1 6v11h2c0 1.7 1.3 3 3 3s3-1.3 3-3h6c0 1.7 1.3 3 3 3s3-1.3 3-3h2v-5l-3-4h-3zm0 2h2.5l1.9 2.5H17V6zM6 17.5c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zm12 0c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z"/></svg></div>',
      iconSize:[36,36],iconAnchor:[18,18],className:''
    });
  }

  function cIcon(){
    return L.divIcon({
      html:'<div class="c-icon" style="width:30px;height:30px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg></div>',
      iconSize:[30,30],iconAnchor:[15,15],className:''
    });
  }

  function uIcon(){
    return L.divIcon({
      html:'<div class="u-icon" style="width:18px;height:18px;"></div>',
      iconSize:[18,18],iconAnchor:[9,9],className:''
    });
  }

  function showRoute(rid){
    var r=storedRoutes[rid];
    if(!r||r.coords.length<2) return;
    hideRoute(rid);

    var color=getRouteColor(rid);
    var lls=r.coords.map(function(c){return[c.lat,c.lng];});

    routeLines[rid]=L.polyline(lls,{
      color:color,weight:5,opacity:0.78,lineJoin:'round',lineCap:'round'
    }).addTo(map).bindPopup('<b>'+r.name+'</b>');

    var dest=r.coords[r.coords.length-1];
    var destHtml='<div class="dest-wrap"><div class="dest-dot" style="background:'+color+';box-shadow:0 2px 8px rgba(0,0,0,.4);border-color:'+color+'"></div><div class="dest-ring" style="border-color:'+color+'"></div><div class="dest-ring2" style="border-color:'+color+'"></div></div>';
    destMarkers[rid]=L.marker([dest.lat,dest.lng],{
      icon:L.divIcon({html:destHtml,className:'',iconSize:[32,32],iconAnchor:[16,16]}),
      zIndexOffset:200
    }).addTo(map);

    var dotHtml='<div class="travel-dot" style="border-color:'+color+'"></div>';
    travelMarkers[rid]=L.marker([r.coords[0].lat,r.coords[0].lng],{
      icon:L.divIcon({html:dotHtml,className:'',iconSize:[13,13],iconAnchor:[6,6]}),
      zIndexOffset:300
    }).addTo(map);

    var anim={progress:0,id:null};
    travelAnims[rid]=anim;
    var total=r.coords.length;
    var step=1/(8000/60);
    anim.id=setInterval(function(){
      if(!travelMarkers[rid]){clearInterval(anim.id);return;}
      anim.progress+=step;
      if(anim.progress>=1) anim.progress=0;
      var pos=anim.progress*(total-1);
      var idx=Math.floor(pos);
      var frac=pos-idx;
      var p1=r.coords[idx];
      var p2=r.coords[Math.min(idx+1,total-1)];
      travelMarkers[rid].setLatLng([p1.lat+(p2.lat-p1.lat)*frac, p1.lng+(p2.lng-p1.lng)*frac]);
    },60);
  }

  function hideRoute(rid){
    if(routeLines[rid]){map.removeLayer(routeLines[rid]);delete routeLines[rid];}
    if(destMarkers[rid]){map.removeLayer(destMarkers[rid]);delete destMarkers[rid];}
    if(travelMarkers[rid]){map.removeLayer(travelMarkers[rid]);delete travelMarkers[rid];}
    if(travelAnims[rid]){clearInterval(travelAnims[rid].id);delete travelAnims[rid];}
  }

  function checkRouteVisibility(rid){
    var hasActive=activeRoutes[rid]&&Object.keys(activeRoutes[rid]).length>0;
    if(hasActive){
      if(!routeLines[rid]&&storedRoutes[rid]) showRoute(rid);
    } else {
      hideRoute(rid);
    }
  }

  function updateDriver(d){
    var did=String(d.driverId);
    var rid=d.routeId!=null?String(d.routeId):null;

    if(rid){
      var prevRid=driverRouteMap[did];
      if(prevRid&&prevRid!==rid){
        if(activeRoutes[prevRid]) delete activeRoutes[prevRid][did];
        checkRouteVisibility(prevRid);
      }
      driverRouteMap[did]=rid;
      if(!activeRoutes[rid]) activeRoutes[rid]={};
      if(d.status!=='offline'){
        activeRoutes[rid][did]=true;
      } else {
        delete activeRoutes[rid][did];
      }
      checkRouteVisibility(rid);
    }

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
    var rid=driverRouteMap[did];
    if(rid){
      delete driverRouteMap[did];
      if(activeRoutes[rid]) delete activeRoutes[rid][did];
      checkRouteVisibility(rid);
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

  function setRoute(routeId,coords,name){
    var rid=String(routeId);
    storedRoutes[rid]={coords:coords,name:name};
    checkRouteVisibility(rid);
  }

  function removeRoute(routeId){
    var rid=String(routeId);
    delete storedRoutes[rid];
    hideRoute(rid);
    // Clear any active driver associations for this route
    if(activeRoutes[rid]) delete activeRoutes[rid];
  }

  function handleMsg(e){
    try{
      var msg=JSON.parse(typeof e.data==='string'?e.data:JSON.stringify(e.data));
      if(msg.type==='UPDATE_DRIVER') updateDriver(msg.data);
      else if(msg.type==='REMOVE_DRIVER') removeDriver(msg.driverId);
      else if(msg.type==='SET_DRIVERS'){
        Object.keys(activeRoutes).forEach(function(rid){ activeRoutes[rid]={}; });
        msg.drivers.forEach(updateDriver);
        Object.keys(storedRoutes).forEach(function(rid){ checkRouteVisibility(rid); });
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
      else if(msg.type==='SET_ROUTE') setRoute(msg.routeId,msg.coords,msg.name);
      else if(msg.type==='REMOVE_ROUTE') removeRoute(msg.routeId);
      else if(msg.type==='SET_ALL_ROUTES'){
        Object.keys(storedRoutes).forEach(function(rid){ hideRoute(rid); });
        storedRoutes={};
        msg.routes.forEach(function(r){ setRoute(r.routeId,r.coords,r.name); });
      }
    }catch(err){}
  }

  document.addEventListener('message',handleMsg);
  window.addEventListener('message',handleMsg);

  map.on('load',function(){
    window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'MAP_READY'}));
    window.parent&&window.parent.postMessage(JSON.stringify({type:'MAP_READY'}),'*');
  });
  setTimeout(function(){
    window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'MAP_READY'}));
    window.parent&&window.parent.postMessage(JSON.stringify({type:'MAP_READY'}),'*');
  },500);
})();
</script>
</body>
</html>`;

const MapWebView = forwardRef<MapWebViewRef, Props>(({ style, onMapReady }, ref) => {
  const webViewRef = useRef<WebView>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // On web: listen for postMessage from the iframe (e.g. MAP_READY)
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handler = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(typeof e.data === "string" ? e.data : "{}");
        if (msg.type === "MAP_READY") onMapReady?.();
      } catch {}
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onMapReady]);

  const sendMsg = useCallback((msg: object) => {
    if (Platform.OS === "web") {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify(msg), "*");
    } else {
      const json = JSON.stringify(msg);
      const escaped = JSON.stringify(json);
      webViewRef.current?.injectJavaScript(
        `window.dispatchEvent(new MessageEvent('message',{data:${escaped}}));true;`
      );
    }
  }, []);

  useImperativeHandle(ref, () => ({
    updateDriver(data: DriverData) {
      sendMsg({ type: "UPDATE_DRIVER", data });
    },
    removeDriver(driverId: string) {
      sendMsg({ type: "REMOVE_DRIVER", driverId });
    },
    setDrivers(drivers: DriverData[]) {
      sendMsg({ type: "SET_DRIVERS", drivers });
    },
    setUserLocation(coords: UserCoords, panTo = false) {
      sendMsg({ type: "USER_LOCATION", lat: coords.lat, lng: coords.lng, panTo });
    },
    panTo(lat: number, lng: number, zoom = 15) {
      sendMsg({ type: "PAN_TO", lat, lng, zoom });
    },
    setCommuterLocations(commuters: CommuterLocation[]) {
      sendMsg({ type: "SET_COMMUTERS", commuters });
    },
    updateCommuterLocation(commuter: CommuterLocation) {
      sendMsg({ type: "UPDATE_COMMUTER", data: commuter });
    },
    removeCommuter(commuterId: string) {
      sendMsg({ type: "REMOVE_COMMUTER", commuterId });
    },
    setRoute(routeId: number, coords: RouteCoord[], name: string) {
      sendMsg({ type: "SET_ROUTE", routeId, coords, name });
    },
    removeRoute(routeId: number) {
      sendMsg({ type: "REMOVE_ROUTE", routeId });
    },
    setAllRoutes(routes: { routeId: number; coords: RouteCoord[]; name: string }[]) {
      sendMsg({ type: "SET_ALL_ROUTES", routes });
    },
    setFleetRoute(fleetId: number, coords: RouteCoord[], name: string) {
      sendMsg({ type: "SET_ROUTE", routeId: fleetId, coords, name });
    },
    removeFleetRoute(fleetId: number) {
      sendMsg({ type: "REMOVE_ROUTE", routeId: fleetId });
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
          ref={(el) => { iframeRef.current = el; }}
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
